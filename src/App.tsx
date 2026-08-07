import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Feature } from '@/lib/Feature'
import { SiteLayout } from '@/components/SiteLayout'
import { LoginPage } from '@/core/auth/LoginPage'
import { SignupPage } from '@/core/auth/SignupPage'
import { ForgotPasswordPage } from '@/core/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/core/auth/ResetPasswordPage'
import { ProtectedRoute } from '@/core/auth/ProtectedRoute'
import { AdminRoute } from '@/core/auth/AdminRoute'
import { AdminLayout } from '@/core/admin/AdminLayout'
import { AdminProductListPage } from '@/core/admin/AdminProductListPage'
import { AdminCategoryListPage } from '@/core/admin/AdminCategoryListPage'
import { AdminOrderListPage } from '@/core/admin/AdminOrderListPage'
import { AdminOrderDetailPage } from '@/core/admin/AdminOrderDetailPage'
import { ProfilePage } from '@/core/profile/ProfilePage'
import { AddressBookPage } from '@/core/profile/AddressBookPage'
import { ProductListPage } from '@/core/catalog/ProductListPage'
import { ProductDetailPage } from '@/core/catalog/ProductDetailPage'
import { HomePage } from '@/core/catalog/HomePage'
import { CartPage } from '@/core/cart/CartPage'
import { CheckoutPage } from '@/core/checkout/CheckoutPage'
import { OrderDetailPage } from '@/core/orders/OrderDetailPage'
import { OrderListPage } from '@/core/orders/OrderListPage'
import { isGitHubPagesBuild } from '@/lib/githubPagesAuth'

const PromotionsAdminPage = lazy(() => import('@/modules/optional/promotions/PromotionsAdminPage'))

const AppRouter = isGitHubPagesBuild ? HashRouter : BrowserRouter

function App() {
  return (
    <AppRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={<ProductListPage />} />
          <Route path="/products/:slug" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/account" element={<ProfilePage />} />
            <Route path="/account/addresses" element={<AddressBookPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders" element={<OrderListPage />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/products" replace />} />
              <Route path="products" element={<AdminProductListPage />} />
              <Route path="categories" element={<AdminCategoryListPage />} />
              <Route path="orders" element={<AdminOrderListPage />} />
              <Route path="orders/:orderId" element={<AdminOrderDetailPage />} />
              <Route
                path="promotions"
                element={
                  <Feature flag="promotions">
                    <Suspense fallback={null}>
                      <PromotionsAdminPage />
                    </Suspense>
                  </Feature>
                }
              />
            </Route>
          </Route>
        </Route>
      </Routes>
    </AppRouter>
  )
}

export default App
