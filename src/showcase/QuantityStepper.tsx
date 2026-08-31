import { clampToMinimum } from '@/demo/catalogue'
import { quantityLabel, type PackageUnit } from '@/lib/wholesale'

interface QuantityStepperProps {
  value: number
  min: number
  onChange: (quantity: number) => void
  packageUnit: PackageUnit
  unitsPerPackage?: number | null
  inputId?: string
  /** Appended to the control labels so repeated steppers stay distinguishable. */
  context?: string
}

export function QuantityStepper({
  value,
  min,
  onChange,
  packageUnit,
  unitsPerPackage,
  inputId,
  context,
}: QuantityStepperProps) {
  const suffix = context ? ` ${context}` : ''
  const pieces = unitsPerPackage ? unitsPerPackage * value : null

  return (
    <div>
      <label htmlFor={inputId} className="wholesale-quantity__label">
        จำนวน{suffix}
      </label>
      <div className="wholesale-quantity__control">
        <button
          type="button"
          onClick={() => onChange(clampToMinimum(value - 1, min))}
          disabled={value <= min}
          aria-label={`ลดจำนวน${suffix}`}
          className="wholesale-quantity__step"
        >
          −
        </button>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={min}
          value={value}
          aria-label={`จำนวน${suffix}`}
          onChange={(event) => onChange(clampToMinimum(Number(event.target.value), min))}
          className="wholesale-quantity__input"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`เพิ่มจำนวน${suffix}`}
          className="wholesale-quantity__step"
        >
          +
        </button>
      </div>
      <p aria-live="polite" className="wholesale-quantity__summary">
        <strong>{quantityLabel(packageUnit, value)}</strong>
        {pieces !== null && <> · รวม {pieces.toLocaleString('th-TH')} ชิ้น</>}
      </p>
    </div>
  )
}
