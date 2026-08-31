import { lazy, Suspense, useRef, useState, type ComponentProps } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useCartStore, useCartSubtotal } from '@/core/cart/cartStore'
import { useAddresses } from '@/core/profile/useAddresses'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/formatPrice'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { brandConfig } from '@/config/branding.config'
import { Feature } from '@/lib/Feature'

const PromoCodeField = lazy(() => import('@/modules/optional/promotions/PromoCodeField'))

// Local duplicate of PromoCodeField's AppliedPromo, narrowed to the fields
// CheckoutPage actually reads -- see the comment above this interface for
// why it's a duplicate rather than an import.
//
// Duplicated from src/modules/optional/promotions/PromoCodeField.tsx rather than imported:
// core must never import from src/modules/optional (see scripts/check-core-boundary.mjs), and
// that boundary check matches on the source text of `from '...'` regardless of the `type`
// keyword, so even a type-only import trips it. PromoCodeField's real AppliedPromo has two
// more fields (discountType/discountValue) that CheckoutPage never reads; TypeScript's
// structural typing means this narrower local type is still satisfied by what onApply passes.
interface AppliedPromo {
  code: string
  discountAmount: number
}

export function CheckoutPage() {
  const navigate = useNavigate()
  const items = useCartStore((state) => state.items)
  const clearCart = useCartStore((state) => state.clear)
  const subtotal = useCartSubtotal()
  const { data: addresses, isLoading: addressesLoading } = useAddresses()
  const [selectedAddressId, setSelectedAddressId] = useState<string | undefined>(undefined)
  const [businessDetails, setBusinessDetails] = useState({
    business_name: '',
    tax_id: '',
    branch_name: '',
  })
  // Set synchronously (before clearCart/navigate run) so the empty-cart
  // guard below can't race it: clearing the cart after a successful order
  // can trigger a re-render of this component (still on /checkout) before
  // the route change to /orders/:orderId takes effect, and without this
  // flag that render would match "cart is empty" and bounce the user back
  // to /cart instead of the order confirmation page.
  const orderPlacedRef = useRef(false)

  const effectiveAddressId = selectedAddressId ?? addresses?.[0]?.id
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null)
  // An unset promptPay.qrImageUrl is the off switch — a shop without a QR is
  // never offered the method, so there is nothing to choose between.
  const promptPayAvailable = brandConfig.promptPay.qrImageUrl !== ''
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'promptpay' | 'cod'>(
    'bank_transfer',
  )
  // The ceiling is on the final total, which the browser cannot compute — it
  // does not know the tax. Comparing the goods subtotal is a strict, correct
  // guard without duplicating the tax formula here: subtotal is never larger
  // than the total, so anything it rejects the server would reject too. The
  // narrow band just under the ceiling is left to create_order to refuse.
  const codOverCeiling = subtotal >= brandConfig.cod.maxTotal
  const codAvailable = brandConfig.cod.enabled && !codOverCeiling

  const placeOrder = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_order', {
        p_items: items.map((item) => ({
          product_id: item.productId,
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
        p_address_id: effectiveAddressId,
        p_promo_code: appliedPromo?.code ?? undefined,
        p_business_details: businessDetails,
        p_payment_method: paymentMethod,
      })
      if (error) throw error
      return data
    },
    onSuccess: (order) => {
      orderPlacedRef.current = true
      clearCart()
      navigate(`/orders/${order.id}`)
    },
  })

  if (items.length === 0 && !orderPlacedRef.current) {
    return <Navigate to="/cart" replace />
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <PageHeader title="ยืนยันคำสั่งซื้อ" />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">ที่อยู่จัดส่ง</h2>
        {addressesLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {!addressesLoading && addresses?.length === 0 && (
          <Alert tone="warning" title="ยังไม่มีที่อยู่จัดส่ง">
            <Link
              to="/account/addresses"
              className="font-semibold text-signal underline underline-offset-4"
            >
              เพิ่มที่อยู่ก่อน
            </Link>{' '}
            จึงจะสั่งซื้อได้
          </Alert>
        )}
        {addresses?.map((address) => (
          <label
            key={address.id}
            className="flex items-start gap-3 rounded-md border border-border bg-card p-3 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent"
          >
            <input
              type="radio"
              name="address"
              checked={effectiveAddressId === address.id}
              onChange={() => setSelectedAddressId(address.id)}
              className="mt-1 accent-[var(--brand-secondary)]"
            />
            <span>
              <span className="block font-semibold">{address.recipient_name}</span>
              <span className="block text-muted-foreground">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ''}, {address.province}{' '}
                {address.postal_code}
              </span>
              <span className="block font-mono text-muted-foreground">{address.phone}</span>
            </span>
          </label>
        ))}
      </section>

      <fieldset className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">ข้อมูลสำหรับธุรกิจ</legend>
        <Field label="ชื่อร้านหรือบริษัท" required>
          <Input
            id="business-name"
            required
            value={businessDetails.business_name}
            onChange={(event) =>
              setBusinessDetails((current) => ({
                ...current,
                business_name: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="เลขประจำตัวผู้เสียภาษี" hint="ใส่ไว้เพื่อออกใบกำกับภาษี">
          <Input
            id="tax-id"
            inputMode="numeric"
            value={businessDetails.tax_id}
            onChange={(event) =>
              setBusinessDetails((current) => ({ ...current, tax_id: event.target.value }))
            }
          />
        </Field>
        <Field label="สาขา">
          <Input
            id="branch-name"
            value={businessDetails.branch_name}
            onChange={(event) =>
              setBusinessDetails((current) => ({ ...current, branch_name: event.target.value }))
            }
          />
        </Field>
      </fieldset>

      {promptPayAvailable && (
        <fieldset
          className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
          data-tour="payment-methods"
        >
          <legend className="px-1 text-sm font-semibold">วิธีชำระเงิน</legend>
          {/* Both methods end in the same place: the buyer transfers, then
              uploads a slip an admin verifies. The choice is recorded because
              the buyer made it, not because it changes verification. */}
          {(
            [
              {
                value: 'bank_transfer' as const,
                title: 'โอนผ่านธนาคาร',
                hint: `${brandConfig.bankTransfer.bankName} · แนบสลิปหลังสั่งซื้อ`,
              },
              {
                value: 'promptpay' as const,
                title: 'พร้อมเพย์ (PromptPay)',
                hint: 'สแกน QR ของร้าน กรอกยอดเอง แล้วแนบสลิป',
              },
              ...(codAvailable
                ? [
                    {
                      value: 'cod' as const,
                      title: 'เก็บเงินปลายทาง (COD)',
                      hint: `จ่ายเงินสดตอนรับของ · ค่าบริการ ${formatPrice(brandConfig.cod.fee)}`,
                    },
                  ]
                : []),
            ]
          ).map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm has-checked:border-primary"
            >
              <input
                type="radio"
                name="payment-method"
                value={option.value}
                checked={paymentMethod === option.value}
                onChange={() => setPaymentMethod(option.value)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold">{option.title}</span>
                <span className="block text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
          {brandConfig.cod.enabled && codOverCeiling && (
            <p className="text-sm text-muted-foreground">
              เก็บเงินปลายทางรับได้ไม่เกิน {formatPrice(brandConfig.cod.maxTotal)} ต่อคำสั่งซื้อ
              — ยอดนี้เกินเพดาน
            </p>
          )}
        </fieldset>
      )}

      <section className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">สรุปรายการ</h2>
        {items.map((item) => (
          <div
            key={`${item.productId}:${item.variantId ?? ''}`}
            className="flex justify-between gap-4 text-sm"
          >
            <span>
              {item.productName}
              {item.variantName ? ` (${item.variantName})` : ''}
              <span className="text-muted-foreground"> × {item.quantity}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatPrice(item.unitPrice * item.quantity)}
            </span>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-border pt-2.5 font-semibold">
          <span>ยอดรวมสินค้า</span>
          <span className="tabular-nums">{formatPrice(subtotal)}</span>
        </div>
        <Feature flag="promotions">
          <Suspense fallback={null}>
            <PromoCodeField
              subtotal={subtotal}
              // PromoCodeField's own `applied` prop keeps its full (unnarrowed) shape --
              // it only ever reads `.code` off it at render time, so this cast is safe;
              // `unknown` first because the narrowed AppliedPromo above genuinely lacks
              // discountType/discountValue structurally. Derived from the already-imported
              // component instead of a second hand-duplicated 4-field interface, which would
              // reintroduce the exact drift risk this fold-in was meant to remove, and without
              // adding any new module-boundary-crossing import text.
              applied={appliedPromo as unknown as ComponentProps<typeof PromoCodeField>['applied']}
              onApply={setAppliedPromo}
              onRemove={() => setAppliedPromo(null)}
            />
          </Suspense>
        </Feature>
        {appliedPromo && (
          <div className="flex justify-between gap-4 text-sm text-muted-foreground">
            <span>ส่วนลด</span>
            <span className="tabular-nums">-{formatPrice(appliedPromo.discountAmount)}</span>
          </div>
        )}
        <p className="text-sm leading-relaxed text-muted-foreground">
          ราคายังไม่รวม VAT 7% · ภาษีและค่าจัดส่งคำนวณตอนสร้างคำสั่งซื้อ และแสดงในหน้ายืนยัน
        </p>
      </section>

      {placeOrder.isError && (
        <Alert tone="error" title="สั่งซื้อไม่สำเร็จ">
          {getErrorMessage(placeOrder.error, 'ลองใหม่อีกครั้ง')}
        </Alert>
      )}

      <Button
        size="lg"
        loading={placeOrder.isPending}
        disabled={
          !effectiveAddressId ||
          !businessDetails.business_name.trim() ||
          placeOrder.isSuccess
        }
        onClick={() => placeOrder.mutate()}
      >
        {placeOrder.isPending ? 'กำลังสั่งซื้อ' : 'สั่งซื้อ'}
      </Button>
    </div>
  )
}
