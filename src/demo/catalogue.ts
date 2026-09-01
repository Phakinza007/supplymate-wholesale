import rawCatalogue from './catalogue.data.json'
import type { PackageUnit } from '../lib/wholesale'

export interface DemoCategory {
  slug: string
  name: string
  description: string
  imagePath: string
}

export interface DemoProduct {
  id: string
  slug: string
  categorySlug: string
  name: string
  description: string
  price: number
  sku: string
  imagePath: string
  packageUnit: PackageUnit
  unitsPerPackage: number
  minOrderQuantity: number
}

const PACKAGE_UNITS: PackageUnit[] = ['carton', 'pack', 'roll', 'case']

// JSON widens `packageUnit` to string. Fail loudly at module load rather than
// letting an unknown unit reach quantityLabel(), which would render undefined.
function toPackageUnit(value: string): PackageUnit {
  const unit = PACKAGE_UNITS.find((candidate) => candidate === value)
  if (!unit) throw new Error(`Unknown package unit in catalogue.data.json: ${value}`)
  return unit
}

/** Derived, never stored: one generated illustration per product slug. */
export function productImagePath(slug: string) {
  return `/images/supplymate/products/${slug}.svg`
}

export const demoCategories: DemoCategory[] = rawCatalogue.categories.map((category) => ({
  slug: category.slug,
  name: category.name,
  description: category.description,
  imagePath: category.imagePath,
}))

export const demoProducts: DemoProduct[] = rawCatalogue.products.map((product) => ({
  id: product.id,
  slug: product.slug,
  categorySlug: product.categorySlug,
  name: product.name,
  description: product.description,
  price: product.price,
  sku: product.sku,
  imagePath: productImagePath(product.slug),
  packageUnit: toPackageUnit(product.packageUnit),
  unitsPerPackage: product.unitsPerPackage,
  minOrderQuantity: product.minOrderQuantity,
}))

export function findDemoProduct(slug: string) {
  return demoProducts.find((product) => product.slug === slug)
}

export function filterDemoProducts(
  products: DemoProduct[],
  query: string,
  categorySlug: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase('th-TH')
  const normalizedCategory = categorySlug.trim().toLocaleLowerCase('th-TH')

  return products.filter((product) => {
    if (normalizedCategory && product.categorySlug.toLocaleLowerCase('th-TH') !== normalizedCategory) {
      return false
    }

    if (!normalizedQuery) return true

    const category = demoCategories.find((item) => item.slug === product.categorySlug)
    const searchableText = [product.name, product.description, category?.name ?? '']
      .join(' ')
      .toLocaleLowerCase('th-TH')

    return searchableText.includes(normalizedQuery)
  })
}

export function clampToMinimum(quantity: number, minimum: number) {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity < minimum) {
    return minimum
  }

  return quantity
}
