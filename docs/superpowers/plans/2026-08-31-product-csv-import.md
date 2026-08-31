# Product CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin create and update many products at once from a supplier price list, instead of retyping each one.

**Architecture:** Two pure, unit-tested modules do all the risky work — an RFC 4180 CSV reader with no runtime dependency, and a row validator that turns a raw table into typed product rows plus per-row errors. A single admin page drives them: pick file → parse → preview with errors → confirm → write. Rows are matched to existing products by `slug`, and the write path splits inserts from updates so that a price-list refresh can never rewrite `status` and silently unpublish the live catalogue.

**Tech Stack:** React 19 + TypeScript, TanStack Query, Vitest (pure modules only), Playwright. No new npm dependency.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-product-management-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-31-product-status-and-duplicate.md` — this plan writes `products.status` and imports `ProductStatus` from `@/lib/productStatus`, both of which that plan creates.

## Global Constraints

- All money renders through `formatPrice()` (`src/lib/formatPrice.ts`).
- All mutation errors render through `getErrorMessage(err, fallback)` (`src/lib/getErrorMessage.ts`).
- `sku` defaults to `null`, never `''` — `products.sku` is `unique` and Postgres permits many NULLs but only one empty string.
- Client code must never write `products.is_active`; the DB derives it from `status`.
- No new npm dependency. The CSV reader is written in this repo.
- Nothing is written to the database until the admin confirms the preview.
- Unknown CSV columns are ignored, never an error — supplier price lists carry extra columns and rejecting the file over them would make the feature unusable.
- Vitest has no jsdom or React Testing Library. Unit tests target pure modules only.
- `<AdminRoute />` already gates everything under `/admin`; the new route needs no additional guard.
- This plan adds no migration.

---

### Task 1: RFC 4180 CSV reader

**Files:**
- Create: `src/lib/csv.ts`
- Create: `src/lib/csv.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCsv(text: string): string[][]` — rows of raw string cells, blank rows dropped, UTF-8 BOM stripped.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('reads a plain table', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips the UTF-8 BOM Excel writes', () => {
    expect(parseCsv('﻿name,price\nCup,10')).toEqual([
      ['name', 'price'],
      ['Cup', '10'],
    ])
  })

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('a,b\n"one, two",3')).toEqual([
      ['a', 'b'],
      ['one, two', '3'],
    ])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']])
  })

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"line1\nline2",3')).toEqual([
      ['a', 'b'],
      ['line1\nline2', '3'],
    ])
  })

  it('preserves empty cells', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
  })

  it('drops blank lines rather than emitting empty rows', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads Thai text unchanged', () => {
    expect(parseCsv('name\nแก้วพลาสติกใส')).toEqual([['name'], ['แก้วพลาสติกใส']])
  })

  it('returns an empty table for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Failed to resolve import "./csv"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/csv.ts`:

```ts
// A small RFC 4180 reader. This kit is cloned per client, so a CSV parser
// dependency would be shipped to every clone for one admin screen; ~60 lines
// here is the cheaper trade. Supported: quoted fields, doubled "" escapes,
// commas and newlines inside quotes, LF and CRLF. Not supported: a bare CR
// line terminator (classic Mac OS), and non-comma delimiters.
export function parseCsv(text: string): string[][] {
  // Excel prefixes a UTF-8 BOM, which would otherwise corrupt the first
  // header name and make every required-column check fail.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // A trailing newline, or a blank line between records, must not become a
  // phantom product row.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "feat: add dependency-free CSV reader"
```

---

### Task 2: Product row validator

**Files:**
- Create: `src/core/admin/productCsv.ts`
- Create: `src/core/admin/productCsv.test.ts`

**Interfaces:**
- Consumes: `type PackageUnit` from `@/lib/wholesale`; `type ProductStatus` from `@/lib/productStatus`.
- Produces:
  - `interface ParsedProductRow` — see the implementation below for the exact field list
  - `interface RowError { line: number; message: string }`
  - `interface ParseResult { rows: ParsedProductRow[]; errors: RowError[]; columns: string[] }`
  - `parseProductRows(table: string[][]): ParseResult`
  - `const IMPORT_COLUMNS: readonly string[]`
  - `csvTemplate(): string`

`columns` is the subset of `IMPORT_COLUMNS` actually present in the file's header. Task 3 needs it: without it, a price-only refresh would write every *absent* optional column back at its default and wipe MOQ, pack size, and stock across the catalogue.

- [ ] **Step 1: Write the failing tests**

Create `src/core/admin/productCsv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { csvTemplate, parseProductRows } from './productCsv'
import { parseCsv } from '@/lib/csv'

function parse(csv: string) {
  return parseProductRows(parseCsv(csv))
}

describe('parseProductRows', () => {
  it('reports an empty file', () => {
    expect(parse('').errors[0].message).toContain('ว่างเปล่า')
  })

  it('reports missing required columns', () => {
    const result = parse('name,slug\nCup,cup')
    expect(result.rows).toEqual([])
    expect(result.errors[0].message).toContain('price')
  })

  it('applies defaults for every optional column', () => {
    const result = parse('name,slug,price\nCup,cup,10')
    expect(result.errors).toEqual([])
    expect(result.rows[0]).toEqual({
      name: 'Cup',
      slug: 'cup',
      price: 10,
      description: null,
      sku: null,
      category_slug: null,
      package_unit: 'carton',
      units_per_package: 1,
      min_order_quantity: 1,
      stock_quantity: 0,
      compare_at_price: null,
      track_inventory: true,
      sort_order: 0,
      status: null,
    })
  })

  it('reads every optional column when present', () => {
    const result = parse(
      [
        'name,slug,price,description,sku,category_slug,package_unit,units_per_package,min_order_quantity,stock_quantity,compare_at_price,track_inventory,sort_order,status',
        'แก้ว,cup-16,1290,ใส 16oz,CUP-16,cups,pack,50,3,40,1490,false,5,active',
      ].join('\n'),
    )
    expect(result.errors).toEqual([])
    expect(result.rows[0]).toEqual({
      name: 'แก้ว',
      slug: 'cup-16',
      price: 1290,
      description: 'ใส 16oz',
      sku: 'CUP-16',
      category_slug: 'cups',
      package_unit: 'pack',
      units_per_package: 50,
      min_order_quantity: 3,
      stock_quantity: 40,
      compare_at_price: 1490,
      track_inventory: false,
      sort_order: 5,
      status: 'active',
    })
  })

  it('ignores unknown columns', () => {
    const result = parse('name,slug,price,supplier_note\nCup,cup,10,ignore me')
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(1)
  })

  it('reports which known columns the file actually supplied', () => {
    const result = parse('name,slug,price,supplier_note\nCup,cup,10,ignore me')
    expect(result.columns).toEqual(['name', 'slug', 'price'])
  })

  it('normalises header case and whitespace when reporting columns', () => {
    const result = parse(' Name , SLUG ,price,Status\nCup,cup,10,draft')
    expect(result.columns).toEqual(['name', 'slug', 'price', 'status'])
  })

  it('strips thousands separators from numbers', () => {
    expect(parse('name,slug,price\nCup,cup,"1,290"').rows[0].price).toBe(1290)
  })

  it('rejects a blank name', () => {
    const result = parse('name,slug,price\n,cup,10')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toEqual({ line: 2, message: 'name: ต้องไม่เว้นว่าง' })
  })

  it('rejects a malformed slug', () => {
    expect(parse('name,slug,price\nCup,Cup 16,10').errors[0].message).toContain('slug')
  })

  it('rejects a non-numeric price', () => {
    expect(parse('name,slug,price\nCup,cup,free').errors[0].message).toContain('price')
  })

  it('rejects a negative price', () => {
    expect(parse('name,slug,price\nCup,cup,-1').errors[0].message).toContain('price')
  })

  it('rejects compare_at_price below price, matching the DB CHECK', () => {
    const result = parse('name,slug,price,compare_at_price\nCup,cup,10,5')
    expect(result.errors[0].message).toContain('compare_at_price')
  })

  it('rejects an unknown package_unit', () => {
    expect(parse('name,slug,price,package_unit\nCup,cup,10,barrel').errors[0].message).toContain(
      'package_unit',
    )
  })

  it('rejects an unknown status', () => {
    expect(parse('name,slug,price,status\nCup,cup,10,live').errors[0].message).toContain('status')
  })

  it('rejects a non-integer quantity', () => {
    expect(
      parse('name,slug,price,units_per_package\nCup,cup,10,2.5').errors[0].message,
    ).toContain('units_per_package')
  })

  it('rejects a duplicate slug within the same file, keeping the first', () => {
    const result = parse('name,slug,price\nCup A,cup,10\nCup B,cup,20')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Cup A')
    expect(result.errors[0]).toEqual({ line: 3, message: 'slug: ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน' })
  })

  it('keeps good rows alongside bad ones and reports both', () => {
    const result = parse('name,slug,price\nGood,good,10\nBad,bad,oops\nAlso,also,20')
    expect(result.rows.map((r) => r.slug)).toEqual(['good', 'also'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].line).toBe(3)
  })

  it('reports all problems on one row together', () => {
    const result = parse('name,slug,price\n,BAD SLUG,nope')
    expect(result.errors[0].message).toContain('name')
    expect(result.errors[0].message).toContain('slug')
    expect(result.errors[0].message).toContain('price')
  })
})

describe('csvTemplate', () => {
  it('round-trips through the parser with no errors', () => {
    const result = parse(csvTemplate())
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Failed to resolve import "./productCsv"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/admin/productCsv.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/admin/productCsv.ts src/core/admin/productCsv.test.ts
git commit -m "feat: add product CSV row validator"
```

---

### Task 3: Import write path

**Files:**
- Create: `src/core/admin/useProductImport.ts`

**Interfaces:**
- Consumes: `ParsedProductRow` from `@/core/admin/productCsv`.
- Produces:
  - `interface ImportResult { inserted: number; updated: number; failures: Array<{ slug: string; message: string }> }`
  - `useProductImport()` — returns a TanStack mutation whose `mutateAsync({ rows, columns, onProgress })` resolves to `ImportResult`.

- [ ] **Step 1: Write the hook**

Create `src/core/admin/useProductImport.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/getErrorMessage'
import type { ParsedProductRow } from '@/core/admin/productCsv'

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
const FIELD_BY_COLUMN: Record<string, string> = {
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
      const categorySlugs = [...new Set(rows.map((r) => r.category_slug).filter(Boolean))] as string[]
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
      for (const batch of chunked(importable.map((r) => r.slug), CHUNK)) {
        const { data, error } = await supabase.from('products').select('slug').in('slug', batch)
        if (error) throw error
        for (const row of data ?? []) existing.add(row.slug)
      }

      // A new product needs a complete row, so an INSERT uses every field,
      // falling back to the parser's defaults for columns the file omitted.
      const payload = (row: ParsedProductRow): Record<string, unknown> => ({
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
      const updatePayload = (row: ParsedProductRow): Record<string, unknown> => {
        const full = payload(row)
        const partial: Record<string, unknown> = {}
        for (const column of columns) {
          const field = FIELD_BY_COLUMN[column]
          if (field) partial[field] = full[field]
        }
        return partial
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
```

- [ ] **Step 2: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/admin/useProductImport.ts
git commit -m "feat: add product CSV import write path"
```

---

### Task 4: Import page and route

**Files:**
- Create: `src/core/admin/AdminProductImportPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/core/admin/AdminProductListPage.tsx`

**Interfaces:**
- Consumes: `parseCsv`; `parseProductRows`, `csvTemplate`, `IMPORT_COLUMNS`, `type ParsedProductRow`, `type RowError`; `useProductImport`, `type ImportResult`.
- Produces: route `/admin/products/import` rendering `<AdminProductImportPage />`, linked from a button on `AdminProductListPage`.

- [ ] **Step 1: Write the page**

Create `src/core/admin/AdminProductImportPage.tsx`:

```tsx
import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { parseCsv } from '@/lib/csv'
import {
  csvTemplate,
  IMPORT_COLUMNS,
  parseProductRows,
  type ParsedProductRow,
  type RowError,
} from '@/core/admin/productCsv'
import { useProductImport, type ImportResult } from '@/core/admin/useProductImport'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { productStatusLabel } from '@/lib/productStatus'
import { Button } from '@/components/ui/button'

const MAX_CSV_BYTES = 5 * 1024 * 1024
const PREVIEW_LIMIT = 20

export function AdminProductImportPage() {
  const [rows, setRows] = useState<ParsedProductRow[] | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importProducts = useProductImport()

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setResult(null)
    setProgress(null)
    if (file.size > MAX_CSV_BYTES) {
      setError('ไฟล์ต้องมีขนาดไม่เกิน 5MB')
      return
    }

    try {
      const parsed = parseProductRows(parseCsv(await file.text()))
      setFileName(file.name)
      setRows(parsed.rows)
      setColumns(parsed.columns)
      setRowErrors(parsed.errors)
    } catch (err) {
      setError(getErrorMessage(err, 'อ่านไฟล์ไม่สำเร็จ'))
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'supplymate-products-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function runImport() {
    if (!rows || rows.length === 0) return
    setError(null)
    setProgress({ done: 0, total: rows.length })
    try {
      const imported = await importProducts.mutateAsync({
        rows,
        columns,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(imported)
      setRows(null)
      setColumns([])
      setRowErrors([])
    } catch (err) {
      setError(getErrorMessage(err, 'นำเข้าสินค้าไม่สำเร็จ'))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">นำเข้าสินค้าจากไฟล์ CSV</h1>
        <Button size="sm" variant="outline" asChild>
          <Link to="/admin/products">กลับไปหน้ารายการ</Link>
        </Button>
      </div>

      <div className="rounded-md border p-4 text-sm">
        <p className="mb-2 font-medium">คอลัมน์ที่รองรับ</p>
        <p className="text-muted-foreground">
          จำเป็น: <code>name</code>, <code>slug</code>, <code>price</code> · ไม่บังคับ:{' '}
          {IMPORT_COLUMNS.filter((c) => !['name', 'slug', 'price'].includes(c)).join(', ')}
        </p>
        <p className="mt-2 text-muted-foreground">
          แถวที่ <code>slug</code> ยังไม่มีในระบบจะถูก<strong>เพิ่มใหม่เป็นแบบร่าง</strong> ส่วนแถวที่มีอยู่แล้วจะถูก
          <strong>อัปเดตเฉพาะคอลัมน์ที่มีอยู่ในไฟล์</strong> คอลัมน์ที่ไม่ได้ใส่มาจะคงค่าเดิมไว้ รวมถึงสถานะ
          เว้นแต่ไฟล์จะระบุคอลัมน์ <code>status</code> มาด้วย
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={downloadTemplate}>
          ดาวน์โหลดไฟล์ตัวอย่าง
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="csv" className="text-sm font-medium">
          เลือกไฟล์ CSV
        </label>
        <input id="csv" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        {fileName && <p className="text-sm text-muted-foreground">{fileName}</p>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {rowErrors.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-destructive/40 p-3 text-sm">
          <p className="font-medium text-destructive">
            ข้ามไป {rowErrors.length} แถวเพราะข้อมูลไม่ถูกต้อง
          </p>
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {rowErrors.slice(0, PREVIEW_LIMIT).map((rowError) => (
              <li key={rowError.line}>
                บรรทัด {rowError.line}: {rowError.message}
              </li>
            ))}
          </ul>
          {rowErrors.length > PREVIEW_LIMIT && (
            <p className="text-muted-foreground">
              …และอีก {rowErrors.length - PREVIEW_LIMIT} แถว
            </p>
          )}
        </div>
      )}

      {rows && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">พร้อมนำเข้า {rows.length} รายการ</p>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-3">name</th>
                    <th className="py-1 pr-3">slug</th>
                    <th className="py-1 pr-3">price</th>
                    <th className="py-1">status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_LIMIT).map((row) => (
                    <tr key={row.slug} className="border-b last:border-0">
                      <td className="py-1 pr-3">{row.name}</td>
                      <td className="py-1 pr-3">{row.slug}</td>
                      <td className="py-1 pr-3">{formatPrice(row.price)}</td>
                      <td className="py-1">
                        {row.status ? productStatusLabel(row.status) : 'ตามเดิม / แบบร่าง'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > PREVIEW_LIMIT && (
                <p className="mt-2 text-sm text-muted-foreground">
                  แสดง {PREVIEW_LIMIT} จาก {rows.length} รายการ
                </p>
              )}
            </div>
          )}
          <div>
            <Button onClick={runImport} disabled={rows.length === 0 || importProducts.isPending}>
              {progress
                ? `กำลังนำเข้า ${progress.done}/${progress.total}…`
                : `ยืนยันนำเข้า ${rows.length} รายการ`}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2 rounded-md border p-4 text-sm">
          <p className="font-medium">นำเข้าเสร็จสิ้น</p>
          <p>เพิ่มใหม่ {result.inserted} รายการ · อัปเดต {result.updated} รายการ</p>
          {result.failures.length > 0 && (
            <>
              <p className="font-medium text-destructive">
                ไม่สำเร็จ {result.failures.length} รายการ
              </p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {result.failures.slice(0, PREVIEW_LIMIT).map((failure) => (
                  <li key={failure.slug}>
                    {failure.slug}: {failure.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Register the route**

In `src/App.tsx`, add to the import block, next to the other admin imports:

```ts
import { AdminProductImportPage } from '@/core/admin/AdminProductImportPage'
```

and add the route inside the `<Route path="/admin" element={<AdminLayout />}>` group, immediately after the existing `products` route:

```tsx
              <Route path="products/import" element={<AdminProductImportPage />} />
```

- [ ] **Step 3: Link to it from the product list**

In `src/core/admin/AdminProductListPage.tsx`, add `Link` to the `react-router-dom` import if it is not already there:

```ts
import { Link } from 'react-router-dom'
```

Then replace the list header's button:

```tsx
        <Button size="sm" onClick={() => setEditing('new')}>
          New product
        </Button>
```

with:

```tsx
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/products/import">นำเข้า CSV</Link>
          </Button>
          <Button size="sm" onClick={() => setEditing('new')}>
            New product
          </Button>
        </div>
```

- [ ] **Step 4: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS, including the `check-core-boundary` step.

- [ ] **Step 5: Commit**

```bash
git add src/core/admin/AdminProductImportPage.tsx src/App.tsx src/core/admin/AdminProductListPage.tsx
git commit -m "feat: add admin CSV product import page"
```

---

### Task 5: End-to-end coverage

**Files:**
- Create: `e2e/product-import.spec.ts`

**Interfaces:**
- Consumes: `logIn` from `./helpers/auth`; the seeded `admin@example.com` / `password123` account.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing spec**

The CSV is written at runtime rather than committed as a fixture, so slugs are unique per run and the spec's insert/update counts stay deterministic.

Create `e2e/product-import.spec.ts`:

```ts
import { writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { logIn } from './helpers/auth'

test('CSV import inserts new products as drafts and updates existing ones without republishing', async ({
  page,
}, testInfo) => {
  const suffix = `${Date.now()}`
  const slugA = `import-a-${suffix}`
  const slugB = `import-b-${suffix}`

  await logIn(page, { email: 'admin@example.com', password: 'password123' })

  // First import: two new products, plus one deliberately invalid row.
  const firstCsv = [
    'name,slug,price,min_order_quantity,supplier_note',
    `Import A ${suffix},${slugA},1000,2,ignored column`,
    `Import B ${suffix},${slugB},2000,1,ignored column`,
    `Broken ${suffix},BAD SLUG,not-a-price,1,ignored column`,
  ].join('\n')
  const firstPath = testInfo.outputPath('first.csv')
  await writeFile(firstPath, firstCsv, 'utf8')

  await page.goto('/admin/products/import')
  await page.locator('#csv').setInputFiles(firstPath)

  await expect(page.getByText('ข้ามไป 1 แถวเพราะข้อมูลไม่ถูกต้อง')).toBeVisible()
  await expect(page.getByText(/บรรทัด 4:/)).toBeVisible()
  await expect(page.getByText('พร้อมนำเข้า 2 รายการ')).toBeVisible()

  await page.getByRole('button', { name: 'ยืนยันนำเข้า 2 รายการ' }).click()
  await expect(page.getByText('เพิ่มใหม่ 2 รายการ · อัปเดต 0 รายการ')).toBeVisible()

  // New rows land as drafts, so neither is on the storefront yet.
  await page.goto(`/products/${slugA}`)
  await expect(page.getByText('Product not found.')).toBeVisible()

  // Publish A by hand.
  await page.goto('/admin/products')
  await page
    .getByRole('listitem')
    .filter({ hasText: `Import A ${suffix}` })
    .getByRole('button', { name: 'Edit' })
    .click()
  await page.locator('#status').selectOption('active')
  await page.getByRole('button', { name: 'Save product' }).click()
  await page.goto(`/products/${slugA}`)
  await expect(page.getByRole('heading', { name: `Import A ${suffix}` })).toBeVisible()

  // Second import: a price refresh with no status column. It must NOT
  // unpublish A -- that is the whole point of the insert/update split.
  const secondCsv = [
    'name,slug,price',
    `Import A ${suffix},${slugA},1500`,
    `Import B ${suffix},${slugB},2500`,
  ].join('\n')
  const secondPath = testInfo.outputPath('second.csv')
  await writeFile(secondPath, secondCsv, 'utf8')

  await page.goto('/admin/products/import')
  await page.locator('#csv').setInputFiles(secondPath)
  await expect(page.getByText('พร้อมนำเข้า 2 รายการ')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยันนำเข้า 2 รายการ' }).click()
  await expect(page.getByText('เพิ่มใหม่ 0 รายการ · อัปเดต 2 รายการ')).toBeVisible()

  await page.goto(`/products/${slugA}`)
  await expect(page.getByRole('heading', { name: `Import A ${suffix}` })).toBeVisible()
  // Still published: the refresh carried no status column.
  await expect(page.getByText('฿1,500.00 / 1 ลัง')).toBeVisible()
  // And min_order_quantity survived, even though the refresh omitted it — a
  // full-payload update would have reset it to the parser default of 1.
  await expect(page.getByText('สั่งขั้นต่ำ 2 ลัง ต่อรายการ')).toBeVisible()

  // B was never published, so the refresh must not have published it either.
  await page.goto(`/products/${slugB}`)
  await expect(page.getByText('Product not found.')).toBeVisible()
})
```

- [ ] **Step 2: Run the spec to verify it passes**

Run: `npm run test:e2e -- e2e/product-import.spec.ts`
Expected: PASS.

If the `฿1,500.00 / 1 ลัง` assertion fails on formatting, check `brandConfig.currencySymbol` and `quantityLabel()`'s output and correct the expected string — do not weaken it.

- [ ] **Step 3: Run the full suite**

Run: `npm run test:e2e`
Expected: PASS, all specs.

- [ ] **Step 4: Commit**

```bash
git add e2e/product-import.spec.ts
git commit -m "test: cover CSV product import end to end"
```

---

### Task 6: Document the import conventions

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the written convention future contributors follow.

- [ ] **Step 1: Add a CSV import section to CLAUDE.md**

Insert a new section immediately **after** the `## Admin order management` section:

```markdown
## Product CSV import

- `/admin/products/import` (`AdminProductImportPage`) parses client-side and writes nothing until
  the admin confirms the preview. Two pure modules do the risky work and carry the unit tests:
  `src/lib/csv.ts` (`parseCsv`) and `src/core/admin/productCsv.ts` (`parseProductRows`).
- **No CSV dependency was added on purpose.** This kit is cloned per client, so a parser package
  would ship to every clone for one admin screen. `parseCsv` covers quoted fields, doubled `""`
  escapes, commas and newlines inside quotes, LF/CRLF, and the UTF-8 BOM Excel writes. It does not
  support a bare-CR line terminator or a non-comma delimiter.
- **Unknown columns are ignored, never an error** — supplier price lists carry extra columns, and
  rejecting the file over them would make the feature unusable.
- Rows are matched to existing products **by `slug`** (`not null unique`, always present in a valid
  row), never by `sku` (nullable).
- **The insert/update split is a correctness requirement, not an optimisation.** A batched
  `upsert` would rewrite `status` on every row, so a routine monthly price-list refresh would
  silently unpublish the entire live catalogue. Instead: unknown slug → INSERT with
  `status = 'draft'`; known slug → per-row UPDATE that **omits `status`** unless the file supplied
  one. Updates stay per-row for exactly this reason; do not "optimise" them into an upsert.
- **An UPDATE writes only the columns the file actually supplied**, which is why
  `parseProductRows` returns `columns` and `useProductImport` takes it. An INSERT uses the full
  payload (a new product needs every field), but pushing that same full payload into an UPDATE
  would write the parser's *defaults* into every omitted column — a two-column
  `name,slug,price` refresh would reset `min_order_quantity`, `units_per_package`,
  `stock_quantity` and `category_id` across the whole catalogue. Same failure class as the
  `status` trap, one column further out.
- `useProductImport` resolves `category_slug` → `category_id` up front; an unknown category fails
  its own rows rather than importing them uncategorised. A failed insert chunk reports every slug
  in the chunk, since Postgres does not say which row it objected to.
```

- [ ] **Step 2: Verify everything is still green**

Run: `npm run lint && npm run typecheck && npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record product CSV import conventions"
```
