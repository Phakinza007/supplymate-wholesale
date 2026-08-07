import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/core/auth/useAuth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  return <Outlet />
}
