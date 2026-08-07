import { lazy, Suspense, useRef, useState, type ComponentProps } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useCartStore, useCartSubtotal } from '@/core/cart/cartStore'
import { useAddresses } from '@/core/profile/useAddresses'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/formatPrice'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Checkout</h1>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Shipping address</h2>
        {addressesLoading && <p className="text-sm text-muted-foreground">Loading addresses…</p>}
        {!addressesLoading && addresses?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You don't have any saved addresses yet.{' '}
            <Link to="/account/addresses" className="underline">
              Add one
            </Link>{' '}
            before checking out.
          </p>
        )}
        {addresses?.map((address) => (
          <label
            key={address.id}
            className="flex items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-foreground"
          >
            <input
              type="radio"
              name="address"
              checked={effectiveAddressId === address.id}
              onChange={() => setSelectedAddressId(address.id)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{address.recipient_name}</span>
              <span className="block text-muted-foreground">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ''}, {address.province}{' '}
                {address.postal_code}
              </span>
              <span className="block text-muted-foreground">{address.phone}</span>
            </span>
          </label>
        ))}
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border p-4">
        <legend className="px-1 font-medium">ข้อมูลสำหรับธุรกิจ</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="business-name">ชื่อร้านหรือบริษัท</Label>
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
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tax-id">เลขประจำตัวผู้เสียภาษี</Label>
          <Input
            id="tax-id"
            value={businessDetails.tax_id}
            onChange={(event) =>
              setBusinessDetails((current) => ({ ...current, tax_id: event.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="branch-name">สาขา</Label>
          <Input
            id="branch-name"
            value={businessDetails.branch_name}
            onChange={(event) =>
              setBusinessDetails((current) => ({ ...current, branch_name: event.target.value }))
            }
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 border-t pt-4">
        <h2 className="font-medium">Order summary</h2>
        {items.map((item) => (
          <div
            key={`${item.productId}:${item.variantId ?? ''}`}
            className="flex justify-between text-sm"
          >
            <span>
              {item.productName}
              {item.variantName ? ` (${item.variantName})` : ''} × {item.quantity}
            </span>
            <span>{formatPrice(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
        <div className="flex justify-between font-medium">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
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
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Discount</span>
            <span>-{formatPrice(appliedPromo.discountAmount)}</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Shipping is calculated when your order is placed and shown on the confirmation page.
        </p>
      </div>

      {placeOrder.isError && (
        <p className="text-sm text-destructive">
          {getErrorMessage(placeOrder.error, 'Something went wrong placing your order.')}
        </p>
      )}

      <Button
        size="lg"
        disabled={
          !effectiveAddressId ||
          !businessDetails.business_name.trim() ||
          placeOrder.isPending ||
          placeOrder.isSuccess
        }
        onClick={() => placeOrder.mutate()}
      >
        {placeOrder.isPending ? 'Placing order…' : 'Place order'}
      </Button>
    </div>
  )
}
