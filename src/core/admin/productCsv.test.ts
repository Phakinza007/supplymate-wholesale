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
