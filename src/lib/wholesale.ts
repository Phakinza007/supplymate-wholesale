export type PackageUnit = 'carton' | 'pack' | 'roll' | 'case'

const thaiUnit: Record<PackageUnit, string> = {
  carton: 'ลัง',
  pack: 'แพ็ก',
  roll: 'ม้วน',
  case: 'กล่อง',
}

export function quantityLabel(unit: PackageUnit, quantity: number) {
  return `${quantity.toLocaleString('th-TH')} ${thaiUnit[unit]}`
}

export function formatPackageLabel(unit: PackageUnit, unitsPerPackage: number) {
  return `${unitsPerPackage.toLocaleString('th-TH')} ชิ้น / ${thaiUnit[unit]}`
}
