import { create } from 'zustand'
import type { PackageUnit } from '@/lib/wholesale'
import { clampToMinimum } from '@/demo/catalogue'

export interface CartItem {
  productId: string
  variantId: string | null
  productName: string
  productSlug: string
  variantName: string | null
  unitPrice: number
  imagePath: string | null
  quantity: number
  packageUnit?: PackageUnit
  minOrderQuantity?: number
}

interface CartLine {
  productId: string
  variantId: string | null
}

interface CartState {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  removeItem: (productId: string, variantId: string | null) => void
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void
  reconcileWholesale: (
    productId: string,
    variantId: string | null,
    packageUnit: PackageUnit,
    minOrderQuantity: number,
  ) => void
  reconcilePricing: (productId: string, variantId: string | null, unitPrice: number) => void
  clear: () => void
}

function sameLine(a: CartLine, b: CartLine) {
  return a.productId === b.productId && a.variantId === b.variantId
}

export const useCartStore = create<CartState>()((set) => ({
  items: [],
  addItem: (item, quantity = 1) =>
    set((state) => {
      const minimum = item.minOrderQuantity ?? 1
      const safeQuantity = clampToMinimum(quantity, minimum)
      const existing = state.items.find((i) => sameLine(i, item))
      if (existing) {
        return {
          items: state.items.map((i) =>
            sameLine(i, item) ? { ...i, ...item, quantity: i.quantity + safeQuantity } : i,
          ),
        }
      }
      return { items: [...state.items, { ...item, quantity: safeQuantity }] }
    }),
  removeItem: (productId, variantId) =>
    set((state) => ({
      items: state.items.filter((i) => !sameLine(i, { productId, variantId })),
    })),
  updateQuantity: (productId, variantId, quantity) =>
    set((state) => {
      const current = state.items.find((i) => sameLine(i, { productId, variantId }))
      if (!current) return state

      const minimum = current.minOrderQuantity ?? 1
      return {
        items: state.items.map((i) =>
          sameLine(i, { productId, variantId })
            ? { ...i, quantity: clampToMinimum(quantity, minimum) }
            : i,
        ),
      }
    }),
  reconcileWholesale: (productId, variantId, packageUnit, minOrderQuantity) =>
    set((state) => ({
      items: state.items.map((item) =>
        sameLine(item, { productId, variantId })
          ? { ...item, packageUnit, minOrderQuantity }
          : item,
      ),
    })),
  // The cart caches a price at add-to-cart time for display. Once the cart
  // page has the product's live tiers it re-resolves the line price and
  // pushes it back here, so useCartSubtotal() and the checkout total stay
  // truthful. create_order() still re-prices everything server-side; this
  // only keeps the number the customer is shown from drifting.
  reconcilePricing: (productId, variantId, unitPrice) =>
    set((state) => ({
      items: state.items.map((item) =>
        sameLine(item, { productId, variantId }) ? { ...item, unitPrice } : item,
      ),
    })),
  clear: () => set({ items: [] }),
}))

export function useCartTotalItems() {
  return useCartStore((state) => state.items.reduce((sum, i) => sum + i.quantity, 0))
}

export function useCartSubtotal() {
  return useCartStore((state) => state.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0))
}
