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

export function perItemPrice(price: number, unitsPerPackage: number) {
  if (!Number.isFinite(price) || !Number.isFinite(unitsPerPackage) || unitsPerPackage <= 0) {
    return 0
  }

  return price / unitsPerPackage
}

// The bare unit noun ("ลัง"), with no number in front. Table headers and the
// stepper's suffix need the word alone; deriving it by splitting the output of
// quantityLabel() breaks the moment that string's shape changes.
export function unitNoun(unit: PackageUnit) {
  return thaiUnit[unit]
}
