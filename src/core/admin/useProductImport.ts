import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/getErrorMessage'
import type { ParsedProductRow } from '@/core/admin/productCsv'
import type { Database } from '@/lib/database.types'

type ProductUpdate = Database['public']['Tables']['products']['Update']

export interface ImportResult {
  inserted: number
  updated: number
  failures: Array<{ slug: string; message: string }>
}

const CHUNK = 100

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// Maps a CSV column name to the products column it writes. Only `status` and
// `category_slug` differ from an identity mapping -- `status` is handled
// separately because absent means "leave it alone", and `category_slug` is
// resolved to an id first.
const FIELD_BY_COLUMN: Record<string, keyof ProductUpdate> = {
  name: 'name',
  slug: 'slug',
  price: 'price',
  description: 'description',
  sku: 'sku',
  category_slug: 'category_id',
  package_unit: 'package_unit',
  units_per_package: 'units_per_package',
  min_order_quantity: 'min_order_quantity',
  stock_quantity: 'stock_quantity',
  compare_at_price: 'compare_at_price',
  track_inventory: 'track_inventory',
  sort_order: 'sort_order',
}

export function useProductImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      rows,
      columns,
      onProgress,
    }: {
      rows: ParsedProductRow[]
      columns: string[]
      onProgress?: (done: number, total: number) => void
    }): Promise<ImportResult> => {
      const failures: ImportResult['failures'] = []

      // 1. Resolve category slugs to ids. An unknown slug fails its own rows
      //    rather than silently importing them uncategorised.
      const categorySlugs = [
        ...new Set(rows.map((r) => r.category_slug).filter(Boolean)),
      ] as string[]
      const categoryIdBySlug = new Map<string, string>()
      if (categorySlugs.length > 0) {
        const { data, error } = await supabase
          .from('categories')
          .select('id, slug')
          .in('slug', categorySlugs)
        if (error) throw error
        for (const row of data ?? []) categoryIdBySlug.set(row.slug, row.id)
      }

      const importable: ParsedProductRow[] = []
      for (const row of rows) {
        if (row.category_slug && !categoryIdBySlug.has(row.category_slug)) {
          failures.push({
            slug: row.slug,
            message: `ไม่พบหมวดหมู่ "${row.category_slug}"`,
          })
          continue
        }
        importable.push(row)
      }

      // 2. Find which slugs already exist. The admin write policy is `for
      //    all`, so this SELECT sees draft and archived products too.
      const existing = new Set<string>()
      for (const batch of chunked(
        importable.map((r) => r.slug),
        CHUNK,
      )) {
        const { data, error } = await supabase.from('products').select('slug').in('slug', batch)
        if (error) throw error
        for (const row of data ?? []) existing.add(row.slug)
      }

      // A new product needs a complete row, so an INSERT uses every field,
      // falling back to the parser's defaults for columns the file omitted.
      const payload = (row: ParsedProductRow) => ({
        name: row.name,
        slug: row.slug,
        price: row.price,
        description: row.description,
        sku: row.sku,
        category_id: row.category_slug ? categoryIdBySlug.get(row.category_slug)! : null,
        package_unit: row.package_unit,
        units_per_package: row.units_per_package,
        min_order_quantity: row.min_order_quantity,
        stock_quantity: row.stock_quantity,
        compare_at_price: row.compare_at_price,
        track_inventory: row.track_inventory,
        sort_order: row.sort_order,
      })

      // An UPDATE must touch ONLY the columns the file supplied. Writing the
      // full payload would push the parser's defaults into every column the
      // file omitted, so a two-column price refresh would reset MOQ, pack
      // size, stock and category across the whole catalogue.
      const updatePayload = (row: ParsedProductRow): ProductUpdate => {
        const full: Record<string, unknown> = payload(row)
        const partial: Record<string, unknown> = {}
        for (const column of columns) {
          const field = FIELD_BY_COLUMN[column]
          if (field && field in full) partial[field] = full[field]
        }
        return partial as ProductUpdate
      }

      const toInsert = importable.filter((r) => !existing.has(r.slug))
      const toUpdate = importable.filter((r) => existing.has(r.slug))
      const total = toInsert.length + toUpdate.length
      let done = 0
      let inserted = 0
      let updated = 0

      // 3. Inserts default to draft, so an import never publishes anything
      //    the admin has not looked at.
      for (const batch of chunked(toInsert, CHUNK)) {
        const { error } = await supabase
          .from('products')
          .insert(batch.map((row) => ({ ...payload(row), status: row.status ?? 'draft' })))
        if (error) {
          // A chunk fails atomically; report every slug in it rather than
          // guessing which row Postgres objected to.
          for (const row of batch) {
            failures.push({ slug: row.slug, message: getErrorMessage(error, 'insert failed') })
          }
        } else {
          inserted += batch.length
        }
        done += batch.length
        onProgress?.(done, total)
      }

      // 4. Updates are per-row, carry only the supplied columns, and omit
      //    `status` unless the file supplied one. A batched upsert would
      //    rewrite status on every row, which for a monthly supplier
      //    price-list refresh would silently unpublish the entire live
      //    catalogue. Correctness beats throughput here.
      for (const row of toUpdate) {
        const update = row.status
          ? { ...updatePayload(row), status: row.status }
          : updatePayload(row)
        const { error } = await supabase.from('products').update(update).eq('slug', row.slug)
        if (error) {
          failures.push({ slug: row.slug, message: getErrorMessage(error, 'update failed') })
        } else {
          updated += 1
        }
        done += 1
        onProgress?.(done, total)
      }

      return { inserted, updated, failures }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
