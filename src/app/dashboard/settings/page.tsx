'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/shared/hooks/use-toast'
import React, { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { BackToDashboardButton } from '@/components/BackToDashboardButton'
import { useAuth } from '@/features/auth/context/AuthContext'
import { Bell, Lock, Mail, Moon, Shield, User, LogOut, Trash2 } from 'lucide-react'

type SettingsPreferences = {
  emailAlerts: boolean
  marketAlerts: boolean
  weeklyDigest: boolean
  compactMode: boolean
}

export default function SettingsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { user, profile, loading, updateProfile, refreshUser, signOut } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [preferences, setPreferences] = useState<SettingsPreferences>({
    emailAlerts: true,
    marketAlerts: true,
    weeklyDigest: false,
    compactMode: false,
  })
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  const currentProfile = profile ?? user

  useEffect(() => {
    if (!currentProfile) return

    setDisplayName(currentProfile.full_name ?? '')
    setAvatarUrl(currentProfile.avatar_url ?? '')
    setPendingEmail(currentProfile.email ?? '')
    setSkillsText(Array.isArray(currentProfile.skills) ? currentProfile.skills.map((s) => String(s)).join(', ') : '')

    const pref = (currentProfile.preferences ?? {}) as Record<string, unknown>
    setPreferences({
      emailAlerts: typeof pref.emailAlerts === 'boolean' ? pref.emailAlerts : true,
      marketAlerts: typeof pref.marketAlerts === 'boolean' ? pref.marketAlerts : true,
      weeklyDigest: typeof pref.weeklyDigest === 'boolean' ? pref.weeklyDigest : false,
      compactMode: typeof pref.compactMode === 'boolean' ? pref.compactMode : false,
    })
  }, [currentProfile])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = (localStorage.getItem('theme') || 'dark').toLowerCase()
    setTheme(saved === 'light' ? 'light' : 'dark')
  }, [])

  const parsedSkills = useMemo(
    () =>
      skillsText
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    [skillsText]
  )

  const saveProfile = async () => {
    try {
      setLoadingKey('profile')
      const payload = {
        full_name: displayName.trim(),
        avatar_url: avatarUrl.trim(),
        skills: parsedSkills,
      }
      const { error } = await updateProfile(payload)
      if (error) throw new Error(error.message || 'Failed to save profile')
      toast({ title: 'Profile updated', description: 'Your profile details were saved.' })
      await refreshUser()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Try again'
      toast({ title: 'Save failed', description: message, variant: 'destructive' })
    } finally {
      setLoadingKey(null)
    }
  }

  const savePreferences = async () => {
    try {
      setLoadingKey('prefs')
      const existing = ((currentProfile?.preferences ?? {}) as Record<string, unknown>)
      const { error } = await updateProfile({
        preferences: {
          ...existing,
          ...preferences,
          theme,
        },
      })
      if (error) throw new Error(error.message || 'Failed to save preferences')
      if (typeof window !== 'undefined') localStorage.setItem('theme', theme)
      toast({ title: 'Preferences saved', description: 'Settings updated successfully.' })
      await refreshUser()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Try again'
      toast({ title: 'Failed to save preferences', description: message, variant: 'destructive' })
    } finally {
      setLoadingKey(null)
    }
  }

  const changeEmail = async () => {
    try {
      setLoadingKey('email')
      const res = await fetch('/api/auth/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update email')
      toast({ title: 'Email updated', description: 'Your login email was changed.' })
      await refreshUser()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Try again'
      toast({ title: 'Email update failed', description: message, variant: 'destructive' })
    } finally {
      setLoadingKey(null)
    }
  }

  const changePassword = async () => {
    try {
      setLoadingKey('pwd')
      if (!newPassword || newPassword.length < 8) {
        toast({ title: 'Weak password', description: 'Use at least 8 characters.', variant: 'destructive' })
        return
      }
      if (newPassword !== confirmPassword) {
        toast({ title: 'Passwords do not match', description: 'Please confirm your new password.', variant: 'destructive' })
        return
      }

      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to update')

      setNewPassword('')
      setConfirmPassword('')
      toast({ title: 'Password updated' })
    } catch (e: unknown) {
      const message = (e instanceof Error) ? e.message : 'Try again'
      toast({ title: 'Failed to update password', description: message, variant: 'destructive' })
    } finally {
      setLoadingKey(null)
    }
  }

  const handleDeleteAccount = async () => {
    try {
      if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
        toast({ title: 'Confirmation required', description: 'Type DELETE to confirm account removal.', variant: 'destructive' })
        return
      }
      setLoadingKey('del')
      const res = await fetch('/api/auth/delete', { method: 'POST' })
      const json = await res.json()

      if (!res.ok) throw new Error(json?.error || 'Failed to delete')

      toast({ title: 'Account deleted', description: 'Redirecting to sign up...' })
      router.push('/signup')
    } catch (e: unknown) {
      const message = (e instanceof Error) ? e.message : 'Try again'
      toast({ title: 'Delete failed', description: message, variant: 'destructive' })
    } finally {
      setLoadingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-gray-400">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <main className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <BackToDashboardButton />
          <h1 className="text-2xl font-semibold text-white">Settings</h1>
        </div>

        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2"><User className="h-4 w-4" /> Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="displayName" className="block text-sm text-white/80 mb-1">Display name</label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-gray-900/40 border-white/15 focus:border-white/30 text-white"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="avatarUrl" className="block text-sm text-white/80 mb-1">Avatar URL</label>
                <Input
                  id="avatarUrl"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="bg-gray-900/40 border-white/15 focus:border-white/30 text-white"
                  placeholder="https://..."
                />
              </div>
            </div>
            <div>
              <label htmlFor="skills" className="block text-sm text-white/80 mb-1">Skills (comma separated)</label>
              <Input
                id="skills"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                className="bg-gray-900/40 border-white/15 focus:border-white/30 text-white"
                placeholder="React, TypeScript, Finance"
              />
            </div>
            <Button onClick={saveProfile} disabled={loadingKey === 'profile'}>
              {loadingKey === 'profile' ? 'Saving...' : 'Save profile'}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2"><Bell className="h-4 w-4" /> Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ['emailAlerts', 'Email alerts for job/news updates'],
                ['marketAlerts', 'Market movement alerts'],
                ['weeklyDigest', 'Weekly summary digest'],
                ['compactMode', 'Compact dashboard mode'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/90">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={(e) =>
                      setPreferences((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="h-4 w-4"
                  />
                </label>
              ))}
            </div>
            <div>
              <p className="text-sm text-white/80 mb-2 flex items-center gap-2"><Moon className="h-4 w-4" /> Theme preference</p>
              <div className="flex gap-2">
                <Button
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  onClick={() => setTheme('dark')}
                  className="min-w-24"
                >
                  Dark
                </Button>
                <Button
                  variant={theme === 'light' ? 'default' : 'outline'}
                  onClick={() => setTheme('light')}
                  className="min-w-24"
                >
                  Light
                </Button>
              </div>
            </div>
            <Button onClick={savePreferences} disabled={loadingKey === 'prefs'}>
              {loadingKey === 'prefs' ? 'Saving...' : 'Save preferences'}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2"><Shield className="h-4 w-4" /> Security & Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2"><Mail className="h-4 w-4" /> Change Email</h3>
              <div className="flex gap-2 max-w-lg">
                <Input
                  type="email"
                  value={pendingEmail}
                  onChange={(e) => setPendingEmail(e.target.value)}
                  className="bg-gray-900/40 border-white/15 focus:border-white/30 text-white"
                  placeholder="new-email@example.com"
                />
                <Button onClick={changeEmail} disabled={loadingKey === 'email'}>
                  {loadingKey === 'email' ? 'Saving...' : 'Update'}
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2"><Lock className="h-4 w-4" /> Change Password</h3>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 max-w-3xl">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-gray-900/40 border-white/15 focus:border-white/30 text-white"
                  placeholder="New password"
                />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-gray-900/40 border-white/15 focus:border-white/30 text-white"
                  placeholder="Confirm new password"
                />
                <Button onClick={changePassword} disabled={loadingKey === 'pwd'}>
                  {loadingKey === 'pwd' ? 'Saving...' : 'Update'}
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2"><LogOut className="h-4 w-4" /> Session</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    setLoadingKey('out')
                    await signOut()
                    setLoadingKey(null)
                  }}
                  disabled={loadingKey === 'out'}
                >
                  {loadingKey === 'out' ? 'Signing out...' : 'Sign out'}
                </Button>
                <Button variant="outline" onClick={() => router.push('/dashboard/profile')}>
                  Open profile page
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <h3 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2"><Trash2 className="h-4 w-4" /> Danger Zone</h3>
              <Dialog.Root>
                <Dialog.Trigger asChild>
                  <Button variant="destructive">Delete account</Button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-sm rounded-xl bg-gray-900 border border-white/10 p-6 shadow-xl z-50 text-white">
                    <Dialog.Title className="text-lg font-semibold text-red-400">Delete account</Dialog.Title>
                    <Dialog.Description className="text-sm text-white/70 mt-2">
                      This action cannot be undone. All your data will be permanently removed.
                    </Dialog.Description>
                    <div className="mt-4">
                      <label className="text-xs text-white/70 block mb-1">Type DELETE to confirm</label>
                      <Input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        className="bg-gray-800 border-white/15 text-white"
                        placeholder="DELETE"
                      />
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                      <Dialog.Close asChild>
                        <Button variant="ghost" className="hover:bg-white/10 text-white">Cancel</Button>
                      </Dialog.Close>
                      <Button
                        variant="destructive"
                        disabled={loadingKey === 'del'}
                        onClick={handleDeleteAccount}
                      >
                        {loadingKey === 'del' ? 'Deleting...' : 'Delete Account'}
                      </Button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
