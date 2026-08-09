import { formatPrice } from '@/lib/formatPrice'
import { formatPackageLabel, perItemPrice, quantityLabel, type PackageUnit } from '@/lib/wholesale'

interface WholesaleFactsProps {
  price: number
  packageUnit: PackageUnit
  unitsPerPackage: number
  minOrderQuantity: number
}

export function WholesaleFacts({ price, packageUnit, unitsPerPackage, minOrderQuantity }: WholesaleFactsProps) {
  return (
    <dl className="wholesale-facts">
      <div className="wholesale-facts__item">
        <dt>ราคาต่อหน่วยสั่งซื้อ</dt>
        <dd>{formatPrice(price)} / {quantityLabel(packageUnit, 1)}</dd>
      </div>
      <div className="wholesale-facts__item">
        <dt>จำนวนต่อหน่วย</dt>
        <dd>{formatPackageLabel(packageUnit, unitsPerPackage)}</dd>
      </div>
      <div className="wholesale-facts__item">
        <dt>ราคาเฉลี่ยต่อชิ้น</dt>
        <dd>{formatPrice(perItemPrice(price, unitsPerPackage))} / ชิ้น</dd>
      </div>
      <div className="wholesale-facts__item">
        <dt>สั่งซื้อขั้นต่ำ</dt>
        <dd>{quantityLabel(packageUnit, minOrderQuantity)}</dd>
      </div>
    </dl>
  )
}
