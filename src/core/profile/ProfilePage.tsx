import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/core/auth/useProfile'
import { useUpdateProfile } from '@/core/profile/useUpdateProfile'
import { useAuth } from '@/core/auth/useAuth'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ProfilePage() {
  const { signOut } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setPhone(profile.phone ?? '')
    }
  }, [profile])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      await updateProfile.mutateAsync({ full_name: fullName, phone })
      setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save changes.'))
    }
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && !error && <p className="text-sm text-muted-foreground">Changes saved.</p>}
        <Button type="submit" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
      <Link to="/account/addresses" className="text-sm hover:underline">
        Manage address book
      </Link>
      <Link to="/orders" className="text-sm hover:underline">
        View order history
      </Link>
      <Button variant="outline" onClick={() => signOut()}>
        Log out
      </Button>
    </div>
  )
}
