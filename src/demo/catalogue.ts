import type { PackageUnit } from '../lib/wholesale'

export interface DemoCategory {
  slug: string
  name: string
}

export interface DemoProduct {
  id: string
  slug: string
  categorySlug: string
  name: string
  description: string
  price: number
  imagePath: string
  packageUnit: PackageUnit
  unitsPerPackage: number
  minOrderQuantity: number
}

export const demoCategories: DemoCategory[] = [
  { slug: 'cups-lids', name: 'แก้วและฝา' },
  { slug: 'food-containers', name: 'กล่องอาหาร' },
  { slug: 'paper-bags', name: 'ถุงกระดาษ' },
  { slug: 'labels', name: 'สติ๊กเกอร์และฉลาก' },
  { slug: 'bar-tools', name: 'อุปกรณ์บาร์' },
  { slug: 'eco-packaging', name: 'บรรจุภัณฑ์รักษ์โลก' },
]

export const demoProducts: DemoProduct[] = [
  {
    id: 'demo-clear-cup-16oz',
    slug: 'clear-cup-16oz',
    categorySlug: 'cups-lids',
    name: 'แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม',
    description: 'แก้ว PET สำหรับเครื่องดื่มเย็น เหมาะกับคาเฟ่และร้านเครื่องดื่ม',
    price: 1_290,
    imagePath: '/images/supplymate/cups-lids.png',
    packageUnit: 'carton',
    unitsPerPackage: 1_000,
    minOrderQuantity: 1,
  },
  {
    id: 'demo-kraft-food-container-650ml',
    slug: 'kraft-food-container-650ml',
    categorySlug: 'food-containers',
    name: 'กล่องอาหารคราฟต์ 650 มล. พร้อมฝา',
    description: 'กล่องกระดาษคราฟต์สำหรับอาหารเดลิเวอรีและเมนูพร้อมเสิร์ฟ',
    price: 890,
    imagePath: '/images/supplymate/food-containers.png',
    packageUnit: 'case',
    unitsPerPackage: 300,
    minOrderQuantity: 1,
  },
  {
    id: 'demo-kraft-carry-bag-m',
    slug: 'kraft-carry-bag-m',
    categorySlug: 'paper-bags',
    name: 'ถุงกระดาษคราฟต์หูหิ้ว ขนาด M',
    description: 'ถุงกระดาษคราฟต์มีหูหิ้ว สำหรับร้านอาหาร คาเฟ่ และร้านค้าปลีก',
    price: 640,
    imagePath: '/images/supplymate/paper-bags.png',
    packageUnit: 'pack',
    unitsPerPackage: 100,
    minOrderQuantity: 2,
  },
  {
    id: 'demo-blank-label-roll-50x30',
    slug: 'blank-label-roll-50x30',
    categorySlug: 'labels',
    name: 'สติ๊กเกอร์เปล่า 50 × 30 มม.',
    description: 'ฉลากสติ๊กเกอร์เปล่าสำหรับพิมพ์ชื่อสินค้า ราคา และข้อมูลจัดส่ง',
    price: 520,
    imagePath: '/images/supplymate/labels.png',
    packageUnit: 'roll',
    unitsPerPackage: 500,
    minOrderQuantity: 3,
  },
  {
    id: 'demo-stainless-bar-tool-set',
    slug: 'stainless-bar-tool-set',
    categorySlug: 'bar-tools',
    name: 'ชุดอุปกรณ์บาร์สเตนเลสพื้นฐาน',
    description: 'ชุดอุปกรณ์บาร์สเตนเลสสำหรับชงเครื่องดื่มและจัดเตรียมหน้าร้าน',
    price: 1_450,
    imagePath: '/images/supplymate/bar-tools.png',
    packageUnit: 'case',
    unitsPerPackage: 12,
    minOrderQuantity: 1,
  },
  {
    id: 'demo-bagasse-clamshell-9in',
    slug: 'bagasse-clamshell-9in',
    categorySlug: 'eco-packaging',
    name: 'กล่องชานอ้อยฝาพับ 9 นิ้ว',
    description: 'กล่องชานอ้อยย่อยสลายได้สำหรับอาหารร้อนและเมนูซื้อกลับบ้าน',
    price: 1_080,
    imagePath: '/images/supplymate/eco-packaging.png',
    packageUnit: 'case',
    unitsPerPackage: 200,
    minOrderQuantity: 1,
  },
]

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
