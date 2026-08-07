# Auth + Profile + Address Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Supabase email/password auth, session state, route guards, a profile view/edit page, and a full address-book CRUD screen — Build order step 2 of the Commerce Starter Kit's Phase 1 core.

**Architecture:** A React context (`AuthProvider`) owns the Supabase auth session and subscribes to `onAuthStateChange`; a TanStack Query hook layered on top fetches the matching `profiles` row. Two thin route-guard components (`ProtectedRoute`, `AdminRoute`) gate `react-router-dom` routes on that state. Profile and address-book screens are plain TanStack Query `useQuery`/`useMutation` hooks against Supabase tables — no new backend logic, since the schema, RLS, and default-address trigger were already built in Step 1.

**Tech Stack:** React 19, react-router-dom v7, @tanstack/react-query v5, @supabase/supabase-js v2, Tailwind v4 + shadcn/ui primitives (existing `Button`, plus new `Input`/`Label`).

## Global Constraints

- No unit test runner in this project — verify each task via `npm run typecheck`, `npm run lint`, `npm run build`, and a manual browser check (this project's earlier decision: Playwright E2E only, arriving at Build order step 8; do not add Vitest).
- Branding/copy must never be hardcoded outside `src/config/branding.config.ts` — these screens use `brandConfig.storeName` where a store name appears, nothing else brand-specific.
- `src/core/**` must never import from `src/modules/optional/**` (enforced by `npm run lint` / `scripts/check-core-boundary.mjs`).
- Supabase project ref is supplied through the private deployment environment. Project URL and anon key live only in the local `.env` (gitignored) as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Auth table is `public.profiles` (columns: `id, email, full_name, phone, avatar_url, role, created_at, updated_at`); a profile row is auto-created by the `handle_new_user()` trigger on signup — never insert into `profiles` from the client.
- Address table is `public.addresses` (columns: `id, user_id, label, recipient_name, phone, line1, line2, subdistrict, district, province, postal_code, country, is_default, created_at, updated_at`); the "only one default per user" rule is already enforced server-side (`demote_other_default_addresses()` trigger + partial unique index) — the client only ever sets `is_default: true` on the row it wants as default, never manually unsets siblings.
- RLS already restricts `addresses` to `user_id = auth.uid()` and `profiles` to `id = auth.uid()` (or admin) — no client-side ownership filtering needed beyond querying by the current user's id.

---

### Task 1: Typed Supabase client

**Files:**
- Create: `src/lib/database.types.ts` (generated, do not hand-edit)
- Modify: `src/lib/supabase.ts`

**Interfaces:**
- Produces: `supabase: SupabaseClient<Database>` (named export, same name as today — callers don't change), `Database` type re-exportable from `@/lib/database.types`.

- [ ] **Step 1: Generate types from the live schema**

Run:
```bash
npx supabase gen types typescript --project-id "$SUPPLYMATE_SUPABASE_PROJECT_REF" --schema public > src/lib/database.types.ts
```
If the Supabase CLI isn't authenticated locally, use the Supabase MCP `generate_typescript_types` tool with the privately configured project id instead and write its output to the same path.

- [ ] **Step 2: Point the client at the generated types**

Edit `src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your project values.',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: no errors. (This is the check that matters here — a wrong generated type would surface as a compile error the moment Task 2 queries `profiles`.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/database.types.ts src/lib/supabase.ts
git commit -m "feat(auth): generate typed Supabase client from live schema"
```

---

### Task 2: Auth session provider

**Files:**
- Create: `src/core/auth/AuthProvider.tsx`
- Create: `src/core/auth/useAuth.ts`
- Create: `src/core/auth/useProfile.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase` (Task 1).
- Produces: `useAuth(): { session: Session | null, user: User | null, loading: boolean, signOut: () => Promise<void> }` and `useProfile(): UseQueryResult<Database['public']['Tables']['profiles']['Row'] | null>` — both used by every later task in this plan (ProtectedRoute, AdminRoute, ProfilePage, AddressBookPage).

- [ ] **Step 1: Write `AuthProvider`**

Create `src/core/auth/AuthProvider.tsx`:

```tsx
import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
```

- [ ] **Step 2: Write `useAuth`**

Create `src/core/auth/useAuth.ts`:

```ts
import { useContext } from 'react'
import { AuthContext } from '@/core/auth/AuthProvider'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return ctx
}
```

- [ ] **Step 3: Write `useProfile`**

Create `src/core/auth/useProfile.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'

export function useProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}
```

- [ ] **Step 4: Wire `AuthProvider` into the app**

Edit `src/main.tsx` — wrap `<App />` with `<AuthProvider>`, inside `<BrowserRouter>`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { applyBranding } from '@/config/applyBranding'
import { AuthProvider } from '@/core/auth/AuthProvider'
import App from './App.tsx'

applyBranding()

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass with no new errors/warnings beyond the pre-existing `button.tsx` fast-refresh warning.

- [ ] **Step 6: Commit**

```bash
git add src/core/auth/AuthProvider.tsx src/core/auth/useAuth.ts src/core/auth/useProfile.ts src/main.tsx
git commit -m "feat(auth): add session provider, useAuth, and useProfile"
```

---

### Task 3: Route guards

**Files:**
- Create: `src/core/auth/ProtectedRoute.tsx`
- Create: `src/core/auth/AdminRoute.tsx`

**Interfaces:**
- Consumes: `useAuth()` and `useProfile()` (Task 2).
- Produces: `<ProtectedRoute />` and `<AdminRoute />` — both are layout routes rendering `<Outlet />` when authorized, used directly in `src/App.tsx` in Task 4 and Step 6/7 admin routes (later plans).

- [ ] **Step 1: Write `ProtectedRoute`**

Create `src/core/auth/ProtectedRoute.tsx`:

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/core/auth/useAuth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  return <Outlet />
}
```

- [ ] **Step 2: Write `AdminRoute`**

Create `src/core/auth/AdminRoute.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/core/auth/useAuth'
import { useProfile } from '@/core/auth/useProfile'

export function AdminRoute() {
  const { user, loading: authLoading } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()

  if (authLoading || profileLoading) return null
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role !== 'admin') return <Navigate to="/" replace />

  return <Outlet />
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: no errors. (These components aren't reachable from any route until Task 4, so build/lint is deferred to that task's verification.)

- [ ] **Step 4: Commit**

```bash
git add src/core/auth/ProtectedRoute.tsx src/core/auth/AdminRoute.tsx
git commit -m "feat(auth): add ProtectedRoute and AdminRoute guards"
```

---

### Task 4: Login, signup, password reset pages + shadcn form primitives

**Files:**
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/core/auth/LoginPage.tsx`
- Create: `src/core/auth/SignupPage.tsx`
- Create: `src/core/auth/ForgotPasswordPage.tsx`
- Create: `src/core/auth/ResetPasswordPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 1), `useAuth` (Task 2), `ProtectedRoute` (Task 3), `Button` from `@/components/ui/button`, `cn` from `@/lib/utils`.
- Produces: routes `/login`, `/signup`, `/forgot-password`, `/reset-password` registered in `src/App.tsx`; later tasks add `/account` and `/account/addresses` under the same `<ProtectedRoute />` wrapper this task introduces.

- [ ] **Step 1: Add the `Input` primitive**

Create `src/components/ui/input.tsx`:

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
```

- [ ] **Step 2: Add the `Label` primitive**

Create `src/components/ui/label.tsx`:

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
```

- [ ] **Step 3: Write `LoginPage`**

Create `src/core/auth/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { brandConfig } from '@/config/branding.config'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Log in to {brandConfig.storeName}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="flex justify-between text-sm text-muted-foreground">
        <Link to="/signup" className="hover:underline">
          Create an account
        </Link>
        <Link to="/forgot-password" className="hover:underline">
          Forgot password?
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write `SignupPage`**

Create `src/core/auth/SignupPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { brandConfig } from '@/config/branding.config'

export function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    // Supabase returns a user with no identities (and no error) when the
    // email is already registered — anti-enumeration behavior.
    if (data.user && data.user.identities?.length === 0) {
      setError('An account with that email already exists.')
      return
    }
    // No session means email confirmation is required before sign-in works.
    if (!data.session) {
      setSent(true)
      return
    }
    navigate('/', { replace: true })
  }

  if (sent) {
    return (
      <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-muted-foreground">
          We sent a confirmation link to {email}. Confirm your email to finish creating your
          account.
        </p>
        <Link to="/login" className="text-sm hover:underline">
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Create your {brandConfig.storeName} account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Write `ForgotPasswordPage`**

Create `src/core/auth/ForgotPasswordPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-muted-foreground">
          If an account exists for {email}, a password reset link is on its way.
        </p>
        <Link to="/login" className="text-sm hover:underline">
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Write `ResetPasswordPage`**

Create `src/core/auth/ResetPasswordPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 7: Register routes**

Edit `src/App.tsx` to add the new routes plus a protected `/account` placeholder (filled in by Task 5):

```tsx
import { Routes, Route } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { brandConfig } from '@/config/branding.config'
import { LoginPage } from '@/core/auth/LoginPage'
import { SignupPage } from '@/core/auth/SignupPage'
import { ForgotPasswordPage } from '@/core/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/core/auth/ResetPasswordPage'
import { ProtectedRoute } from '@/core/auth/ProtectedRoute'

function Home() {
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold">{brandConfig.storeName}</h1>
      <p className="text-muted-foreground">
        Core scaffold is wired up. Catalog, cart, checkout, and admin routes
        land in later steps.
      </p>
      <Button>Shop now</Button>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        {/* /account and /account/addresses are added in Task 5 and Task 6 */}
      </Route>
    </Routes>
  )
}

export default App
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Then manually verify in the browser: run `npm run dev`, navigate to `/signup`, create an account with a real-looking email (e.g. `test+1@example.com`) and a password, confirm it redirects to `/`. Navigate to `/login`, log in with the same credentials, confirm redirect to `/`. Navigate to `/forgot-password`, submit an email, confirm the "check your email" screen appears. Stop the dev server when done (`kill` the process — do not leave it running in the background).

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/label.tsx src/core/auth/LoginPage.tsx src/core/auth/SignupPage.tsx src/core/auth/ForgotPasswordPage.tsx src/core/auth/ResetPasswordPage.tsx src/App.tsx
git commit -m "feat(auth): add login, signup, and password reset pages"
```

---

### Task 5: Profile view/edit page

**Files:**
- Create: `src/core/profile/ProfilePage.tsx`
- Create: `src/core/profile/useUpdateProfile.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAuth`, `useProfile` (Task 2), `ProtectedRoute` (Task 3), `Input`/`Label`/`Button` (Task 4).
- Produces: route `/account` rendering `ProfilePage`; `useUpdateProfile(): UseMutationResult` reused nowhere else in this plan but follows the same pattern Task 6's address mutations use.

- [ ] **Step 1: Write `useUpdateProfile`**

Create `src/core/profile/useUpdateProfile.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'
import type { Database } from '@/lib/database.types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export function useUpdateProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Pick<ProfileUpdate, 'full_name' | 'phone'>) => {
      const { error } = await supabase.from('profiles').update(updates).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
    },
  })
}
```

- [ ] **Step 2: Write `ProfilePage`**

Create `src/core/profile/ProfilePage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/core/auth/useProfile'
import { useUpdateProfile } from '@/core/profile/useUpdateProfile'
import { useAuth } from '@/core/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ProfilePage() {
  const { signOut } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setPhone(profile.phone ?? '')
    }
  }, [profile])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await updateProfile.mutateAsync({ full_name: fullName, phone })
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={profile?.email ?? ''} disabled />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button type="submit" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
      <Link to="/account/addresses" className="text-sm hover:underline">
        Manage address book
      </Link>
      <Button variant="outline" onClick={() => signOut()}>
        Log out
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Register the route**

Edit `src/App.tsx` — import `ProfilePage` and add it inside the existing `<ProtectedRoute />` element block from Task 4:

```tsx
import { ProfilePage } from '@/core/profile/ProfilePage'
// ...
      <Route element={<ProtectedRoute />}>
        <Route path="/account" element={<ProfilePage />} />
        {/* /account/addresses is added in Task 6 */}
      </Route>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in, navigate to `/account`, confirm the form pre-fills with the signup full name, change it, save, reload the page, confirm the change persisted. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/core/profile/ProfilePage.tsx src/core/profile/useUpdateProfile.ts src/App.tsx
git commit -m "feat(profile): add profile view/edit page"
```

---

### Task 6: Address book CRUD

**Files:**
- Create: `src/core/profile/useAddresses.ts`
- Create: `src/core/profile/useAddressMutations.ts`
- Create: `src/core/profile/AddressForm.tsx`
- Create: `src/core/profile/AddressBookPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 2), `ProtectedRoute` (Task 3), `Input`/`Label`/`Button` (Task 4).
- Produces: route `/account/addresses`; `Address = Database['public']['Tables']['addresses']['Row']` type used only within this task's files.

- [ ] **Step 1: Write `useAddresses`**

Create `src/core/profile/useAddresses.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'

export function useAddresses() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['addresses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}
```

- [ ] **Step 2: Write `useAddressMutations`**

Create `src/core/profile/useAddressMutations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'
import type { Database } from '@/lib/database.types'

type AddressInsert = Database['public']['Tables']['addresses']['Insert']
type AddressUpdate = Database['public']['Tables']['addresses']['Update']

export function useAddressMutations() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] })

  const createAddress = useMutation({
    mutationFn: async (input: Omit<AddressInsert, 'user_id'>) => {
      const { error } = await supabase.from('addresses').insert({ ...input, user_id: user!.id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateAddress = useMutation({
    mutationFn: async ({ id, ...input }: AddressUpdate & { id: string }) => {
      const { error } = await supabase.from('addresses').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteAddress = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('addresses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { createAddress, updateAddress, deleteAddress }
}
```

- [ ] **Step 3: Write `AddressForm`**

Create `src/core/profile/AddressForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/database.types'

type Address = Database['public']['Tables']['addresses']['Row']
type AddressInput = Omit<Database['public']['Tables']['addresses']['Insert'], 'user_id'>

export function AddressForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Address
  onSubmit: (input: AddressInput) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<AddressInput>({
    label: initial?.label ?? '',
    recipient_name: initial?.recipient_name ?? '',
    phone: initial?.phone ?? '',
    line1: initial?.line1 ?? '',
    line2: initial?.line2 ?? '',
    subdistrict: initial?.subdistrict ?? '',
    district: initial?.district ?? '',
    province: initial?.province ?? '',
    postal_code: initial?.postal_code ?? '',
    is_default: initial?.is_default ?? false,
  })

  function field(key: keyof AddressInput) {
    return {
      value: (form[key] as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="label">Label</Label>
        <Input id="label" placeholder="Home, Office…" {...field('label')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="recipient_name">Recipient name</Label>
        <Input id="recipient_name" required {...field('recipient_name')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" required {...field('phone')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="line1">Address line 1</Label>
        <Input id="line1" required {...field('line1')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="line2">Address line 2</Label>
        <Input id="line2" {...field('line2')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="subdistrict">Subdistrict</Label>
          <Input id="subdistrict" {...field('subdistrict')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="district">District</Label>
          <Input id="district" {...field('district')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="province">Province</Label>
          <Input id="province" required {...field('province')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="postal_code">Postal code</Label>
          <Input id="postal_code" required {...field('postal_code')} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_default ?? false}
          onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
        />
        Set as default address
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save address'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Write `AddressBookPage`**

Create `src/core/profile/AddressBookPage.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAddresses } from '@/core/profile/useAddresses'
import { useAddressMutations } from '@/core/profile/useAddressMutations'
import { AddressForm } from '@/core/profile/AddressForm'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'

type Address = Database['public']['Tables']['addresses']['Row']

export function AddressBookPage() {
  const { data: addresses, isLoading } = useAddresses()
  const { createAddress, updateAddress, deleteAddress } = useAddressMutations()
  const [editing, setEditing] = useState<Address | 'new' | null>(null)

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>

  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="mx-auto max-w-sm px-4 py-12">
        <h1 className="mb-6 text-2xl font-semibold">
          {editing === 'new' ? 'Add address' : 'Edit address'}
        </h1>
        <AddressForm
          initial={initial}
          submitting={createAddress.isPending || updateAddress.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={async (input) => {
            if (editing === 'new') {
              await createAddress.mutateAsync(input)
            } else {
              await updateAddress.mutateAsync({ id: editing.id, ...input })
            }
            setEditing(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Address book</h1>
        <Button size="sm" onClick={() => setEditing('new')}>
          Add address
        </Button>
      </div>
      {addresses?.length === 0 && (
        <p className="text-sm text-muted-foreground">No addresses yet.</p>
      )}
      <ul className="flex flex-col gap-3">
        {addresses?.map((address) => (
          <li key={address.id} className="rounded-md border p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">
                  {address.label || 'Address'}
                  {address.is_default && (
                    <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {address.recipient_name} · {address.phone}
                </p>
                <p className="text-sm text-muted-foreground">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}, {address.province}{' '}
                  {address.postal_code}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(address)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteAddress.mutate(address.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Link to="/account" className="text-sm hover:underline">
        Back to profile
      </Link>
    </div>
  )
}
```

- [ ] **Step 5: Register the route**

Edit `src/App.tsx` — import `AddressBookPage` and add it inside the same `<ProtectedRoute />` block:

```tsx
import { AddressBookPage } from '@/core/profile/AddressBookPage'
// ...
      <Route element={<ProtectedRoute />}>
        <Route path="/account" element={<ProfilePage />} />
        <Route path="/account/addresses" element={<AddressBookPage />} />
      </Route>
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in, navigate to `/account/addresses`, add a first address with "Set as default" checked, confirm it shows "(default)". Add a second address also with "Set as default" checked, confirm the first one's "(default)" label disappears and only the second shows it now (this is the server-side `demote_other_default_addresses()` trigger from Step 1 — no client code enforces it). Edit an address, confirm changes persist. Delete an address, confirm it disappears from the list. Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add src/core/profile/useAddresses.ts src/core/profile/useAddressMutations.ts src/core/profile/AddressForm.tsx src/core/profile/AddressBookPage.tsx src/App.tsx
git commit -m "feat(profile): add address book CRUD"
```

---

## After this plan

Push the branch and update the CLAUDE.md build-order status once all 6 tasks are committed. Step 3 (Product catalog) gets its own plan file when picked up next — per the writing-plans skill's scope-check, each remaining Build order step (catalog, cart/checkout, order history, admin CRUD, admin orders, E2E test) is an independent subsystem and should not be crammed into one giant plan.
