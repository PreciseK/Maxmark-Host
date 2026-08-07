import { useRef, useState } from 'react'
import {
  Bell,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
  Camera,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useSession } from '@/lib/session-store'
import { uploadAvatar } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

export function ProfilePage() {
  const { session, isAdmin, avatarUrl, setAvatarUrl, accountId, supportPin } = useSession()

  const userEmail = session?.user?.email ?? 'user@maxmark.com.ng'
  const defaultFullName = session?.user?.user_metadata?.full_name ?? userEmail.split('@')[0].replace(/[._-]+/g, ' ')
  const initials = defaultFullName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const [fullName, setFullName] = useState(defaultFullName)
  const [phoneNumber, setPhoneNumber] = useState(session?.user?.user_metadata?.phone ?? '+234 800 000 0000')
  const [companyName, setCompanyName] = useState(session?.user?.user_metadata?.company ?? 'Maxmark Enterprise')

  const [showPin, setShowPin] = useState(false)
  const [pinCopied, setPinCopied] = useState(false)
  const [accCopied, setAccCopied] = useState(false)
  const [currentPin, setCurrentPin] = useState(supportPin ?? '742918')

  const [savingProfile, setSavingProfile] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)

  // Password change state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)

  // Notification settings
  const [notifications, setNotifications] = useState({
    securityAlerts: true,
    maintenanceUpdates: true,
    billingInvoices: true,
    marketingNews: false,
  })

  const avatarInputRef = useRef<HTMLInputElement>(null)

  async function handleAvatarChange(files: FileList | null) {
    const file = files?.[0]
    if (!file || !supabase) return
    setAvatarBusy(true)
    setFeedback(null)
    try {
      const publicUrl = await uploadAvatar(supabase, file)
      setAvatarUrl(publicUrl)
      // Save to user_profiles
      if (session?.user?.id) {
        await supabase.from('user_profiles').upsert({
          user_id: session.user.id,
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
      }
      setFeedback({ tone: 'success', text: 'Profile picture updated successfully.' })
    } catch (err) {
      setFeedback({
        tone: 'warning',
        text: err instanceof Error ? err.message : 'Failed to upload profile picture.',
      })
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    setFeedback(null)
    try {
      if (supabase && session?.user?.id) {
        await supabase.auth.updateUser({
          data: {
            full_name: fullName,
            phone: phoneNumber,
            company: companyName,
          },
        })
        await supabase.from('user_profiles').upsert({
          user_id: session.user.id,
          full_name: fullName,
          phone: phoneNumber,
          company: companyName,
          updated_at: new Date().toISOString(),
        })
      }
      setFeedback({ tone: 'success', text: 'Personal information updated successfully.' })
    } catch (err) {
      setFeedback({
        tone: 'warning',
        text: err instanceof Error ? err.message : 'Failed to update profile.',
      })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      setFeedback({ tone: 'warning', text: 'New password must be at least 6 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ tone: 'warning', text: 'Passwords do not match.' })
      return
    }

    setUpdatingPassword(true)
    setFeedback(null)
    try {
      if (supabase) {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw error
      }
      setNewPassword('')
      setConfirmPassword('')
      setFeedback({ tone: 'success', text: 'Your password has been changed securely.' })
    } catch (err) {
      setFeedback({
        tone: 'warning',
        text: err instanceof Error ? err.message : 'Failed to update password.',
      })
    } finally {
      setUpdatingPassword(false)
    }
  }

  function handleRegeneratePin() {
    const newPin = String(Math.floor(100000 + Math.random() * 900000))
    setCurrentPin(newPin)
    if (supabase && session?.user?.id) {
      void supabase.from('user_profiles').upsert({
        user_id: session.user.id,
        support_pin: newPin,
        updated_at: new Date().toISOString(),
      })
    }
    setFeedback({ tone: 'success', text: 'New 6-digit Support PIN generated.' })
  }

  function copyToClipboard(text: string, type: 'pin' | 'acc') {
    navigator.clipboard.writeText(text).then(() => {
      if (type === 'pin') {
        setPinCopied(true)
        setTimeout(() => setPinCopied(false), 2000)
      } else {
        setAccCopied(true)
        setTimeout(() => setAccCopied(false), 2000)
      }
    })
  }

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut()
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-[#232328] bg-[#161619] p-6 text-white shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(92,77,240,0.2),transparent_45%)]" />
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="group relative">
              {avatarUrl ? (
                <img
                  alt="User Avatar"
                  className="h-20 w-20 rounded-full border-2 border-[#5c4df0]/40 object-cover shadow-lg"
                  src={avatarUrl}
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#5c4df0]/40 bg-[#202025] font-mono text-2xl font-bold text-violet-300 shadow-lg">
                  {initials}
                </div>
              )}
              <input
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleAvatarChange(e.target.files)}
                ref={avatarInputRef}
                type="file"
              />
              <button
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                disabled={avatarBusy}
                onClick={() => avatarInputRef.current?.click()}
                title="Change Avatar"
                type="button"
              >
                <Camera className="h-6 w-6 text-white" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white capitalize">{fullName || 'Account User'}</h1>
                {isAdmin ? (
                  <Badge className="border-violet-500/40 bg-violet-500/10 text-violet-300" variant="secondary">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5 text-violet-400" /> Admin
                  </Badge>
                ) : (
                  <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400" variant="secondary">
                    Hosting Customer
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-white/70">{userEmail}</p>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                  Account ID: <strong className="text-white">{accountId ?? 'MAX-88F9A10B'}</strong>
                  <button
                    className="ml-1 text-muted-foreground hover:text-white"
                    onClick={() => copyToClipboard(accountId ?? 'MAX-88F9A10B', 'acc')}
                    title="Copy Account ID"
                  >
                    {accCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="border-[#232328] bg-[#121214] text-xs text-white hover:bg-[#202024]"
              onClick={() => avatarInputRef.current?.click()}
              variant="outline"
            >
              <Camera className="mr-1.5 h-3.5 w-3.5 text-violet-400" />
              {avatarBusy ? 'Uploading…' : 'Change Avatar'}
            </Button>
            <Button
              className="border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 hover:bg-rose-500/20"
              onClick={handleSignOut}
              variant="outline"
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5 text-rose-400" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {feedback ? (
        <div
          className={[
            'rounded-2xl border px-5 py-4 text-sm font-medium',
            feedback.tone === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-amber-500/20 bg-amber-500/10 text-amber-300',
          ].join(' ')}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Support PIN & Security Quick Card */}
        <Card className="border border-[#232328] bg-[#161619] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold text-white">
              <KeyRound className="h-4 w-4 text-violet-400" />
              Support Authentication PIN
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Provide this 6-digit PIN when contacting Maxmark technical phone or chat support to verify identity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-[#232328] bg-[#121214] p-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Support PIN</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-emerald-400">
                  {showPin ? currentPin : '••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  aria-label={showPin ? 'Hide Support PIN' : 'Show Support PIN'}
                  className="h-8 w-8 border-[#232328] bg-[#1c1c20] p-0 text-white hover:bg-[#26262b]"
                  onClick={() => setShowPin(!showPin)}
                  type="button"
                  variant="outline"
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  aria-label="Copy Support PIN"
                  className="h-8 w-8 border-[#232328] bg-[#1c1c20] p-0 text-white hover:bg-[#26262b]"
                  onClick={() => copyToClipboard(currentPin, 'pin')}
                  type="button"
                  variant="outline"
                >
                  {pinCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button
              className="w-full border-[#232328] bg-[#121214] text-xs text-white hover:bg-[#202024]"
              onClick={handleRegeneratePin}
              variant="outline"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5 text-violet-400" />
              Regenerate PIN
            </Button>
          </CardContent>
        </Card>

        {/* Personal Details Form */}
        <Card className="border border-[#232328] bg-[#161619] text-white md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold text-white">
              <User className="h-4 w-4 text-violet-400" />
              Personal Information
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Update your contact details and billing profile attributes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSaveProfile}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/80" htmlFor="fullName">Full Name</label>
                  <Input
                    className="border-[#232328] bg-[#121214] text-sm text-white focus:border-[#5c4df0]"
                    id="fullName"
                    onChange={(e) => setFullName(e.target.value)}
                    value={fullName}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/80" htmlFor="email">Email Address</label>
                  <div className="relative">
                    <Input
                      className="border-[#232328] bg-[#121214]/60 text-sm text-white/60 pr-10"
                      disabled
                      id="email"
                      value={userEmail}
                    />
                    <Mail className="absolute right-3 top-2.5 h-4 w-4 text-emerald-400" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/80" htmlFor="phone">Phone Number</label>
                  <Input
                    className="border-[#232328] bg-[#121214] text-sm text-white focus:border-[#5c4df0]"
                    id="phone"
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    value={phoneNumber}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/80" htmlFor="company">Company / Organization</label>
                  <Input
                    className="border-[#232328] bg-[#121214] text-sm text-white focus:border-[#5c4df0]"
                    id="company"
                    onChange={(e) => setCompanyName(e.target.value)}
                    value={companyName}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button className="bg-[#5c4df0] text-xs font-semibold text-white hover:bg-[#6c5df5]" disabled={savingProfile} type="submit">
                  {savingProfile ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Security & Password Form */}
        <Card className="border border-[#232328] bg-[#161619] text-white md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold text-white">
              <Lock className="h-4 w-4 text-violet-400" />
              Security & Password
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Update your account password and security credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleUpdatePassword}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/80" htmlFor="newPassword">New Password</label>
                  <Input
                    className="border-[#232328] bg-[#121214] text-sm text-white focus:border-[#5c4df0]"
                    id="newPassword"
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    type="password"
                    value={newPassword}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/80" htmlFor="confirmPassword">Confirm New Password</label>
                  <Input
                    className="border-[#232328] bg-[#121214] text-sm text-white focus:border-[#5c4df0]"
                    id="confirmPassword"
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    type="password"
                    value={confirmPassword}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button className="bg-[#5c4df0] text-xs font-semibold text-white hover:bg-[#6c5df5]" disabled={updatingPassword} type="submit">
                  {updatingPassword ? 'Updating…' : 'Update Password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Notification Preferences Card */}
        <Card className="border border-[#232328] bg-[#161619] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold text-white">
              <Bell className="h-4 w-4 text-violet-400" />
              Notifications
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Choose which email updates you wish to receive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { id: 'securityAlerts', title: 'Security Alerts', desc: 'Critical login and IP changes' },
              { id: 'maintenanceUpdates', title: 'Server Maintenance', desc: 'Scheduled maintenance windows' },
              { id: 'billingInvoices', title: 'Invoices & Receipts', desc: 'Payment confirmation receipts' },
            ].map((item) => {
              const key = item.id as keyof typeof notifications
              return (
                <div className="flex items-center justify-between rounded-xl border border-[#232328] bg-[#121214] p-3" key={item.id}>
                  <div>
                    <p className="text-xs font-semibold text-white">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                  </div>
                  <input
                    checked={notifications[key]}
                    className="h-4 w-4 rounded border-[#232328] bg-[#1c1c20] text-[#5c4df0] focus:ring-[#5c4df0]"
                    onChange={(e) => setNotifications((prev) => ({ ...prev, [key]: e.target.checked }))}
                    type="checkbox"
                  />
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
