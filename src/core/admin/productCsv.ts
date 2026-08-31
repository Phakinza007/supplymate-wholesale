import type { PackageUnit } from '@/lib/wholesale'
import type { ProductStatus } from '@/lib/productStatus'

export interface ParsedProductRow {
  name: string
  slug: string
  price: number
  description: string | null
  sku: string | null
  category_slug: string | null
  package_unit: PackageUnit
  units_per_package: number
  min_order_quantity: number
  stock_quantity: number
  compare_at_price: number | null
  track_inventory: boolean
  sort_order: number
  // null means the file did not supply a status. For an existing product that
  // means "leave it alone" -- see useProductImport.
  status: ProductStatus | null
}

export interface RowError {
  line: number
  message: string
}

export interface ParseResult {
  rows: ParsedProductRow[]
  errors: RowError[]
  // The known columns this file actually supplied, in header order. An
  // UPDATE must touch only these -- writing an absent column back at its
  // default would let a price-only refresh wipe MOQ, pack size and stock
  // across the whole catalogue.
  columns: string[]
}

export const IMPORT_COLUMNS = [
  'name',
  'slug',
  'price',
  'description',
  'sku',
  'category_slug',
  'package_unit',
  'units_per_package',
  'min_order_quantity',
  'stock_quantity',
  'compare_at_price',
  'track_inventory',
  'sort_order',
  'status',
] as const

const REQUIRED_COLUMNS = ['name', 'slug', 'price'] as const
const PACKAGE_UNITS: PackageUnit[] = ['carton', 'pack', 'roll', 'case']
const STATUSES: ProductStatus[] = ['draft', 'active', 'archived']
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const TRUE_WORDS = ['true', '1', 'yes', 'y', 'ใช่']
const FALSE_WORDS = ['false', '0', 'no', 'n', 'ไม่']

// Spreadsheets export "1,290". Number("1,290") is NaN, which would read as a
// malformed price rather than the number the admin clearly meant.
function toNumber(raw: string): number | null {
  if (raw === '') return null
  const value = Number(raw.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

export function csvTemplate(): string {
  return [
    IMPORT_COLUMNS.join(','),
    'แก้วพลาสติกใส 16 ออนซ์,clear-cup-16oz,1290,ใส ทนความร้อน,CUP-16,cups,carton,50,3,40,1490,true,0,draft',
  ].join('\n')
}

export function parseProductRows(table: string[][]): ParseResult {
  if (table.length === 0) {
    return { rows: [], errors: [{ line: 0, message: 'ไฟล์ว่างเปล่า' }], columns: [] }
  }

  const header = table[0].map((cell) => cell.trim().toLowerCase())
  const columns = header.filter((column) =>
    (IMPORT_COLUMNS as readonly string[]).includes(column),
  )
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column))
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: `ไม่พบคอลัมน์ที่จำเป็น: ${missing.join(', ')}` }],
      columns,
    }
  }

  const rows: ParsedProductRow[] = []
  const errors: RowError[] = []
  const seenSlugs = new Set<string>()

  for (let index = 1; index < table.length; index += 1) {
    const cells = table[index]
    const line = index + 1
    const problems: string[] = []

    const cell = (column: string): string => {
      const at = header.indexOf(column)
      return at === -1 ? '' : (cells[at] ?? '').trim()
    }

    const name = cell('name')
    if (name === '') problems.push('name: ต้องไม่เว้นว่าง')

    const slug = cell('slug').toLowerCase()
    if (slug === '') {
      problems.push('slug: ต้องไม่เว้นว่าง')
    } else if (!SLUG_PATTERN.test(slug)) {
      problems.push('slug: ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น')
    } else if (seenSlugs.has(slug)) {
      problems.push('slug: ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน')
    }

    const price = toNumber(cell('price'))
    if (price === null || price < 0) problems.push('price: ต้องเป็นตัวเลขไม่ติดลบ')

    const compareRaw = cell('compare_at_price')
    const compareAtPrice = toNumber(compareRaw)
    if (compareRaw !== '' && compareAtPrice === null) {
      problems.push('compare_at_price: ต้องเป็นตัวเลข')
    } else if (compareAtPrice !== null && price !== null && compareAtPrice < price) {
      // Mirrors the products_compare_at_price_check CHECK constraint, so the
      // preview catches it instead of the insert failing later.
      problems.push('compare_at_price: ต้องไม่น้อยกว่า price')
    }

    const packageRaw = cell('package_unit').toLowerCase()
    if (packageRaw !== '' && !PACKAGE_UNITS.includes(packageRaw as PackageUnit)) {
      problems.push(`package_unit: ต้องเป็นหนึ่งใน ${PACKAGE_UNITS.join(', ')}`)
    }

    const statusRaw = cell('status').toLowerCase()
    if (statusRaw !== '' && !STATUSES.includes(statusRaw as ProductStatus)) {
      problems.push(`status: ต้องเป็นหนึ่งใน ${STATUSES.join(', ')}`)
    }

    const integers: Array<[string, number, number]> = [
      ['units_per_package', 1, 1],
      ['min_order_quantity', 1, 1],
      ['stock_quantity', 0, 0],
      ['sort_order', 0, Number.NEGATIVE_INFINITY],
    ]
    const integerValues: Record<string, number> = {}
    for (const [column, fallback, minimum] of integers) {
      const raw = cell(column)
      if (raw === '') {
        integerValues[column] = fallback
        continue
      }
      const value = toNumber(raw)
      if (value === null || !Number.isInteger(value) || value < minimum) {
        problems.push(`${column}: ต้องเป็นจำนวนเต็ม`)
        integerValues[column] = fallback
      } else {
        integerValues[column] = value
      }
    }

    const trackRaw = cell('track_inventory').toLowerCase()
    let trackInventory = true
    if (trackRaw !== '') {
      if (TRUE_WORDS.includes(trackRaw)) trackInventory = true
      else if (FALSE_WORDS.includes(trackRaw)) trackInventory = false
      else problems.push('track_inventory: ต้องเป็น true หรือ false')
    }

    if (problems.length > 0) {
      errors.push({ line, message: problems.join(' · ') })
      continue
    }

    seenSlugs.add(slug)
    rows.push({
      name,
      slug,
      price: price!,
      description: cell('description') || null,
      // products.sku is unique, and Postgres permits many NULLs but only one
      // empty string -- a blank SKU must never become ''.
      sku: cell('sku') || null,
      category_slug: cell('category_slug').toLowerCase() || null,
      package_unit: (packageRaw || 'carton') as PackageUnit,
      units_per_package: integerValues.units_per_package,
      min_order_quantity: integerValues.min_order_quantity,
      stock_quantity: integerValues.stock_quantity,
      compare_at_price: compareAtPrice,
      track_inventory: trackInventory,
      sort_order: integerValues.sort_order,
      status: (statusRaw || null) as ProductStatus | null,
    })
  }

  return { rows, errors, columns }
}
