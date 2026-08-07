import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PackageUnit } from '@/lib/wholesale'

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
  clear: () => void
}

function sameLine(a: CartLine, b: CartLine) {
  return a.productId === b.productId && a.variantId === b.variantId
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => sameLine(i, item))
          if (existing) {
            return {
              items: state.items.map((i) =>
                sameLine(i, item) ? { ...i, ...item, quantity: i.quantity + quantity } : i,
              ),
            }
          }
          return { items: [...state.items, { ...item, quantity }] }
        }),
      removeItem: (productId, variantId) =>
        set((state) => ({
          items: state.items.filter((i) => !sameLine(i, { productId, variantId })),
        })),
      updateQuantity: (productId, variantId, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((i) => !sameLine(i, { productId, variantId })) }
          }
          return {
            items: state.items.map((i) =>
              sameLine(i, { productId, variantId }) ? { ...i, quantity } : i,
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
      clear: () => set({ items: [] }),
    }),
    { name: 'ecom-cart' },
  ),
)

export function useCartTotalItems() {
  return useCartStore((state) => state.items.reduce((sum, i) => sum + i.quantity, 0))
}

export function useCartSubtotal() {
  return useCartStore((state) => state.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0))
}
