'use client'

import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { useAuth } from '@/features/auth/context/AuthContext'
import { useToast } from '@/shared/hooks/use-toast'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'
import MatrixBackground from '@/components/MatrixBackground'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const oauthError = searchParams.get('error')

  const oauthErrorMessages: Record<string, string> = {
    google_denied: 'Google sign-in was cancelled.',
    github_denied: 'GitHub sign-in was cancelled.',
    no_email: 'Could not get your email. Please allow email access and try again.',
    google_token_failed: 'Google authentication failed. Please try again.',
    github_token_failed: 'GitHub authentication failed. Please try again.',
    google_oauth_failed: 'Google sign-in failed. Please try again.',
    github_oauth_failed: 'GitHub sign-in failed. Please try again.',
  }

  const attemptSignin = useCallback(async () => {
    if (loading) return
    setLoading(true)

    try {
      const { error } = await signIn(email.trim(), password)

      if (error) {
        toast({
          title: "Login failed",
          description: error.message || "Invalid email or password.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Welcome back!",
        description: "You’re now signed in.",
      })
      router.push('/dashboard')
    } catch {
      toast({
        title: "Something went wrong",
        description: "Try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [email, loading, password, router, signIn, toast])

  const handleSubmit = async (
    event?: React.FormEvent<HTMLFormElement> | React.KeyboardEvent<HTMLFormElement>
  ) => {
    event?.preventDefault()
    await attemptSignin()
  }

  return (
    <div
      className="auth-theme-override relative min-h-[100dvh] px-4 overflow-hidden"
    >
      <MatrixBackground />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-5 py-6">
        {/* Header */}
        <div className="text-center space-y-1.5">

          <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
        </div>

        <div className="w-full space-y-6">
          <div className="text-center pb-2">
            <h2 className="text-2xl font-semibold text-white">Sign in</h2>
            {oauthError && (
              <p className="mt-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {oauthErrorMessages[oauthError] || 'Authentication failed. Please try again.'}
              </p>
            )}
          </div>
          <div>
            <form
              onSubmit={handleSubmit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleSubmit(event)
                }
              }}
              className="space-y-6"
            >
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 pl-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-white/20 focus:ring-1 focus:ring-white/20"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-10 pl-12 pr-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-white/20 focus:ring-1 focus:ring-white/20"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 p-0 flex items-center justify-center leading-none text-white/70 hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => router.push('/forgot-password')}
                  className="text-sm text-sky-400 hover:text-sky-300 hover:underline transition-colors"
                  aria-label="Forgot password"
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                className="w-full h-10"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-black/50 px-3 py-1 rounded-full text-white/50 backdrop-blur-md">Or continue with</span>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={() => window.location.href = '/api/auth/google'}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white transition-all hover:bg-white/10 hover:scale-105 active:scale-95"
                aria-label="Continue with Google"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => window.location.href = '/api/auth/github'}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white transition-all hover:bg-white/10 hover:scale-105 active:scale-95"
                aria-label="Continue with GitHub"
              >
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="mt-5 text-center">
              <p className="text-muted-foreground">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => router.push('/signup')}
                  className="text-sky-400 hover:text-sky-300 hover:underline font-medium transition-colors"
                  aria-label="Go to signup page"
                >
                  Sign up
                </button>
              </p>
            </div>
          </div>
        </div>

        {/* Footer space for balance */}
      </div>
    </div >
  )
}
