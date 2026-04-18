'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Activity, ArrowRight, Briefcase, CheckCircle2, Circle, CreditCard,
    ExternalLink, FileText, LogOut, MapPin, MessageCircle, Newspaper,
    Plus, Settings, Sparkles, Trash2, TrendingDown, TrendingUp, User
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/context/AuthContext'
import { jobService } from '@/lib/services/job-service'
import { newsService, type NewsArticle } from '@/lib/services/news-service'
import { stockService, type WatchlistItem, type StockQuote } from '@/lib/services/stock-service'
import { type JobSnapshot } from '@/shared/database/types'
import { useToast } from '@/shared/hooks/use-toast'
import { formatCurrency, formatRelativeTime } from '@/shared/utils'

type DashboardSummary = {
    savedJobs: number
    resumes: number
    watchlist: number
    income: number
    expenses: number
    net: number
}

type DashboardGoal = {
    id: string
    text: string
    done: boolean
}

type TransactionRow = {
    id: string
    amount: number
    currency: string
    category: string
    merchant: string | null
    created_at: string
}

const GOALS_STORAGE_KEY = 'dashboard-goals'

export default function DashboardPage() {
    const { user, profile, loading, signOut } = useAuth()
    const router = useRouter()
    const { toast } = useToast()

    const [summary, setSummary] = useState<DashboardSummary>({
        savedJobs: 0, resumes: 0, watchlist: 0, income: 0, expenses: 0, net: 0,
    })
    const [summaryLoading, setSummaryLoading] = useState(true)
    const [recommendedJobs, setRecommendedJobs] = useState<JobSnapshot[]>([])
    const [recommendationsMessage, setRecommendationsMessage] = useState<string | null>(null)
    const [newsHeadlines, setNewsHeadlines] = useState<NewsArticle[]>([])
    const [watchlistQuotes, setWatchlistQuotes] = useState<WatchlistItem[]>([])
    const [marketLoading, setMarketLoading] = useState(false)
    const [goals, setGoals] = useState<DashboardGoal[]>([])
    const [newGoal, setNewGoal] = useState('')

    const baseCtaButtonClasses =
        'inline-flex items-center gap-2 rounded-full border-[3px] border-[#141414] bg-primary/90 px-5 py-2 text-sm font-semibold text-[#141414] shadow-[4px_4px_0_#141414] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-primary focus-visible:ring-4 focus-visible:ring-ring/40'

    useEffect(() => {
        if (!loading && !user) router.push('/login')
    }, [user, loading, router])

    useEffect(() => {
        if (loading || !user) return

        let isMounted = true

        const loadDashboardData = async () => {
            setSummaryLoading(true)
            setMarketLoading(true)

            try {
                const [
                    savedJobsList,
                    statsRes,
                    watchlistData,
                    transactionsRes,
                    recommendationsPayload,
                    headlines,
                ] = await Promise.all([
                    jobService.getSavedJobs(user.id).catch(err => {
                        console.error('Error fetching saved jobs:', err)
                        return [] as JobSnapshot[]
                    }),
                    fetch('/api/user/stats')
                        .then(async (res) => {
                            if (!res.ok) {
                                return { savedJobs: 0, resumes: 0, watchlist: 0, transactions: 0 }
                            }
                            return res.json()
                        })
                        .catch(() => ({ savedJobs: 0, resumes: 0, watchlist: 0, transactions: 0 })),
                    stockService.getWatchlist().catch(err => {
                        console.error('Error fetching watchlist:', err)
                        return [] as WatchlistItem[]
                    }),
                    fetch('/api/user/transactions').then(res => res.json()).catch(() => []),
                    fetch('/api/jobs/recommendations')
                        .then(async (res) => {
                            if (!res.ok) throw new Error('Failed to fetch recommendations')
                            return (await res.json()) as { jobs?: JobSnapshot[]; message?: string }
                        })
                        .catch(err => {
                            console.error('Error fetching recommendations:', err)
                            return { jobs: [], message: null }
                        }),
                    newsService.getTopHeadlines({ category: 'technology', pageSize: 10 }).catch(err => {
                        console.error('Error fetching news:', err)
                        return [] as NewsArticle[]
                    }),
                ])

                if (!isMounted) return

                const transactionData = Array.isArray(transactionsRes)
                    ? (transactionsRes as Array<{ amount: number }>)
                    : ([] as Array<{ amount: number }>)
                const incomeTotal = transactionData
                    .filter((txn) => txn.amount >= 0)
                    .reduce((acc: number, txn) => acc + txn.amount, 0)
                const expensesTotal = transactionData
                    .filter((txn) => txn.amount < 0) // expenses are stored as negative
                    .reduce((acc: number, txn) => acc + Math.abs(txn.amount), 0)

                // Net flow is sum of all transactions (positive income + negative expenses)
                const netFlow = incomeTotal - expensesTotal

                setSummary({
                    savedJobs: Array.isArray(savedJobsList) ? savedJobsList.length : 0,
                    resumes: statsRes.resumes || 0,
                    watchlist: watchlistData.length,
                    income: incomeTotal,
                    expenses: expensesTotal,
                    net: netFlow,
                })

                // Load watchlist quotes (live) for display
                try {
                    if (watchlistData.length === 0) {
                        const popularQuotes = await stockService.getMultipleQuotes(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'])
                        const fallbackWatchlist: WatchlistItem[] = popularQuotes.map(q => ({
                            symbol: q.symbol,
                            name: q.name,
                            price: q.price,
                            change: q.change,
                            changePercent: q.changePercent,
                            addedAt: new Date().toISOString()
                        }))
                        setWatchlistQuotes(fallbackWatchlist)
                    } else {
                        const symbols = watchlistData.map((i) => i.symbol)
                        const quotes = await stockService.getMultipleQuotes(symbols)
                        const quoteMap = new Map(quotes.map((q) => [q.symbol, q]))

                        const mergedWatchlist: WatchlistItem[] = watchlistData.map((item) => {
                            const q = quoteMap.get(item.symbol)
                            const rawAddedAt = (
                                item as unknown as {
                                    addedAt?: string | Date
                                    added_at?: string | Date
                                    createdAt?: string | Date
                                }
                            ).addedAt ??
                                (
                                    item as unknown as {
                                        addedAt?: string | Date
                                        added_at?: string | Date
                                        createdAt?: string | Date
                                    }
                                ).added_at ??
                                (
                                    item as unknown as {
                                        addedAt?: string | Date
                                        added_at?: string | Date
                                        createdAt?: string | Date
                                    }
                                ).createdAt

                            const itemName = (item as unknown as { name?: string }).name

                            const addedAt = rawAddedAt ? new Date(rawAddedAt).toISOString() : new Date().toISOString()

                            return {
                                symbol: item.symbol,
                                name: q?.name ?? itemName ?? item.symbol,
                                price: q?.price ?? 0,
                                change: q?.change ?? 0,
                                changePercent: q?.changePercent ?? 0,
                                addedAt,
                            }
                        })

                        setWatchlistQuotes(mergedWatchlist)
                    }
                } catch (e) {
                    console.error('Failed to load watchlist quotes', e)
                    setWatchlistQuotes([])
                }

                setRecommendedJobs(recommendationsPayload.jobs ?? [])
                setRecommendationsMessage(recommendationsPayload.message ?? null)
                setNewsHeadlines(headlines ?? [])

            } catch (error) {
                console.error('Error loading dashboard data:', error)
                toast({
                    title: 'Unable to refresh dashboard',
                    description: 'Please try again in a moment.',
                    variant: 'destructive',
                })
            } finally {
                if (isMounted) {
                    setSummaryLoading(false)
                    setMarketLoading(false)
                }
            }
        }

        loadDashboardData()
        return () => { isMounted = false }
    }, [user, loading, toast])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const storedGoals = window.localStorage.getItem(GOALS_STORAGE_KEY)
        if (storedGoals) {
            try {
                setGoals(JSON.parse(storedGoals))
            } catch (e) {
                console.error('Error parsing stored goals:', e)
            }
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        window.localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals))
    }, [goals])

    const getChangeColor = (change: number) => {
        if (change > 0) return 'text-green-600'
        if (change < 0) return 'text-red-600'
        return 'text-muted-foreground'
    }

    const getChangeIcon = (change: number) => {
        if (change > 0) return <TrendingUp className="h-3.5 w-3.5" />
        if (change < 0) return <TrendingDown className="h-3.5 w-3.5" />
        return <Activity className="h-3.5 w-3.5" />
    }

    const handleAddGoal = () => {
        if (!newGoal.trim()) {
            toast({ title: 'Goal required', description: 'desc', variant: 'destructive' })
            return
        }
        setGoals(prev => [...prev, {
            id: crypto.randomUUID(),
            text: newGoal.trim(),
            done: false
        }])
        setNewGoal('')
    }

    const toggleGoal = (id: string) => {
        setGoals(prev => prev.map(g => g.id === id ? { ...g, done: !g.done } : g))
    }

    const removeGoal = (id: string) => {
        setGoals(prev => prev.filter(g => g.id !== id))
    }

    const handleSignOut = async () => {
        await signOut()
        router.push('/login')
    }

    if (loading) return null // or loading spinner

    if (!user) return null

    const features = [
        {
            title: 'Job Search',
            description: 'Find your dream job with AI-powered skill matching',
            icon: Briefcase,
            href: '/dashboard/jobs',
            color: 'from-blue-500 to-cyan-500'
        },
        {
            title: 'Resume Builder',
            description: 'Create ATS-friendly resumes with AI assistance',
            icon: FileText,
            href: '/dashboard/resume',
            color: 'from-green-500 to-emerald-500'
        },
        {
            title: 'Stock Dashboard',
            description: 'Track markets and manage your portfolio',
            icon: TrendingUp,
            href: '/dashboard/market', // Changed from /dashboard/stocks
            color: 'from-yellow-500 to-orange-500'
        },
        {
            title: 'News Feed',
            description: 'Stay updated with personalized news',
            icon: Newspaper,
            href: '/dashboard/news',
            color: 'from-red-500 to-pink-500'
        },
        {
            title: 'Expense Tracker',
            description: 'Manage your finances and track expenses',
            icon: CreditCard,
            href: '/dashboard/expenses',
            color: 'from-sky-400 to-blue-600'
        },
        {
            title: 'AI Assistant',
            description: 'Get help with career and finance questions',
            icon: MessageCircle,
            href: '/dashboard/ai-chat', // Changed from /dashboard/chat
            color: 'from-cyan-400 to-sky-600'
        }
    ]
    const netColor = summary.net >= 0 ? 'text-green-600' : 'text-red-600'

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="bg-secondary/70 border-b border-border backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl sm:text-3xl font-bold text-foreground font-display">
                                Mastermind
                            </h1>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/profile')}>
                                <User className="h-4 w-4 mr-2" /> Profile
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/settings')}>
                                <Settings className="h-4 w-4 mr-2" /> Settings
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                <LogOut className="h-4 w-4 mr-2" /> Sign Out
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10">
                {/* Welcome Section */}
                <div className="space-y-2">
                    <h2 className="text-3xl font-bold text-foreground">
                        Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}!
                    </h2>

                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 sm:gap-6">
                    <Card className="bg-secondary/60 border-border shadow-hand transition hover:-translate-y-1">
                        <CardContent className="p-5 flex items-center">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[2px] border-[#141414] bg-gradient-to-br from-[#FFE68C] via-[#FFD65C] to-[#FFC233] shadow-[3px_3px_0_#141414]">
                                <Briefcase className="h-5 w-5 text-[#141414]" />
                            </div>
                            <div className="ml-3.5 overflow-hidden">
                                <p className="text-[11.5px] font-bold text-muted-foreground/80 truncate uppercase tracking-widest mb-0.5">Saved Jobs</p>
                                <p className="text-xl font-bold text-foreground truncate leading-none">{summary.savedJobs}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-secondary/60 border-border shadow-hand transition hover:-translate-y-1">
                        <CardContent className="p-5 flex items-center">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[2px] border-[#141414] bg-gradient-to-br from-[#7EE7EB] via-[#4EC9D1] to-[#2A9DB0] shadow-[3px_3px_0_#141414]">
                                <FileText className="h-5 w-5 text-[#141414]" />
                            </div>
                            <div className="ml-3.5 overflow-hidden">
                                <p className="text-[11.5px] font-bold text-muted-foreground/80 truncate uppercase tracking-widest mb-0.5">Resumes</p>
                                <p className="text-xl font-bold text-foreground truncate leading-none">{summary.resumes}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-secondary/60 border-border shadow-hand transition hover:-translate-y-1">
                        <CardContent className="p-5 flex items-center">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[2px] border-[#141414] bg-gradient-to-br from-[#FFEAB0] via-[#FFD86F] to-[#FFB347] shadow-[3px_3px_0_#141414]">
                                <TrendingUp className="h-5 w-5 text-[#141414]" />
                            </div>
                            <div className="ml-3.5 overflow-hidden">
                                <p className="text-[11.5px] font-bold text-muted-foreground/80 truncate uppercase tracking-widest mb-0.5">Watchlist</p>
                                <p className="text-xl font-bold text-foreground truncate leading-none">{summary.watchlist}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-secondary/60 border-border shadow-hand transition hover:-translate-y-1">
                        <CardContent className="p-5 flex items-center">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[2px] border-[#141414] bg-gradient-to-br from-[#FFE68C] via-[#ADF0A5] to-[#6EE7B7] shadow-[3px_3px_0_#141414]">
                                <CreditCard className="h-5 w-5 text-[#141414]" />
                            </div>
                            <div className="ml-3.5 overflow-hidden">
                                <p className="text-[11.5px] font-bold text-muted-foreground/80 truncate uppercase tracking-widest mb-0.5">Net Flow</p>
                                <p className={`text-xl font-bold truncate leading-none ${netColor}`}>{formatCurrency(summary.net)}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Highlights: Recommended Jobs, Headlines, Watchlist */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Recommended Jobs */}
                    <Card className="flex h-full flex-col bg-secondary/60 border-border shadow-sm">
                        <CardHeader>
                            <CardTitle>Recommended Jobs</CardTitle>
                            <CardDescription>{recommendationsMessage || 'Curated job opportunities for you'}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col min-h-0">
                            <div className="space-y-3 overflow-y-auto pr-2 h-[260px] sm:h-[320px] custom-scrollbar">
                                {recommendedJobs.length > 0 ? recommendedJobs.map((job, i) => (
                                    <div key={i} className="p-3 rounded-lg border border-border/60 bg-white/5 hover:border-primary/40 transition-colors">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-semibold text-sm">{job.title}</p>
                                                <p className="text-xs text-muted-foreground">{job.company}</p>
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {job.location && <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground"><MapPin className="h-3 w-3 mr-1" />{job.location}</span>}
                                                    {job.salary_range && <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">{formatCurrency(job.salary_range.min)} - {formatCurrency(job.salary_range.max)}</span>}
                                                </div>
                                            </div>
                                            {job.apply_url && (
                                                <a href={job.apply_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                                                    <ExternalLink className="h-4 w-4" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">No recommendations available yet.</p>
                                )}
                            </div>
                            <div className="mt-4 pt-4 border-t border-border/20">
                                <Button size="sm" className={baseCtaButtonClasses} onClick={() => router.push('/dashboard/jobs')}>
                                    Explore Jobs <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Trending Headlines */}
                    <Card className="flex h-full flex-col bg-secondary/60 border-border shadow-sm">
                        <CardHeader>
                            <CardTitle>Trending Headlines</CardTitle>
                            <CardDescription>Latest tech news</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col min-h-0">
                            <div className="space-y-3 overflow-y-auto pr-2 h-[260px] sm:h-[320px] custom-scrollbar">
                                {newsHeadlines.length > 0 ? newsHeadlines.map((article, i) => (
                                    <a key={i} href={article.url} target="_blank" rel="noopener noreferrer"
                                        className="block p-3 rounded-lg border border-border/60 bg-white/5 hover:bg-white/10 transition-colors">
                                        <p className="font-semibold text-sm line-clamp-2">{article.title}</p>
                                        <p className="text-xs text-muted-foreground mt-1 flex justify-between">
                                            <span>{article.source.name}</span>
                                            <span>{formatRelativeTime(article.publishedAt)}</span>
                                        </p>
                                    </a>
                                )) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">No headlines available.</p>
                                )}
                            </div>
                            <div className="mt-4 pt-4 border-t border-border/20">
                                <Button size="sm" className={baseCtaButtonClasses} onClick={() => router.push('/dashboard/news')}>
                                    Read News <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Market Watch */}
                    <Card className="flex h-full flex-col bg-secondary/60 border-border shadow-sm">
                        <CardHeader>
                            <CardTitle>Market Watch</CardTitle>
                            <CardDescription>{summary.watchlist === 0 ? "Popular Stocks (Watchlist Empty)" : "Your watchlist updates"}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col min-h-0">
                            <div className="space-y-3 overflow-y-auto pr-2 h-[260px] sm:h-[320px] custom-scrollbar">
                                {watchlistQuotes.length > 0 ? watchlistQuotes.map((stock) => (
                                    <div key={stock.symbol} className="flex justify-between items-center p-3 rounded-lg border border-border/60 bg-white/5 hover:bg-white/10 transition-colors cursor-default">
                                        <div>
                                            <p className="font-bold text-sm">{stock.symbol}</p>
                                            <p className="text-xs text-muted-foreground truncate w-24">{stock.name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-mono text-sm">{formatCurrency(stock.price)}</p>
                                            <div className={`flex items-center justify-end text-xs ${getChangeColor(stock.change)}`}>
                                                {getChangeIcon(stock.change)}
                                                <span>{stock.changePercent.toFixed(2)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">Watchlist empty.</p>
                                )}
                            </div>
                            <div className="mt-4 pt-4 border-t border-border/20">
                                <Button size="sm" className={baseCtaButtonClasses} onClick={() => router.push('/dashboard/market')}>
                                    View Market <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature) => {
                        const Icon = feature.icon
                        return (
                            <Card key={feature.title} className="group relative overflow-hidden bg-secondary/60 border-border p-6 hover:shadow-lg transition-all duration-300">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Icon className="h-24 w-24" />
                                </div>
                                <div className="relative z-10 flex flex-col items-start gap-4">
                                    <div className={`p-3 rounded-xl bg-gradient-to-br ${feature.color} shadow-sm`}>
                                        <Icon className="h-6 w-6 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                                        <p className="text-muted-foreground">{feature.description}</p>
                                    </div>
                                    <Button size="sm" className={baseCtaButtonClasses} onClick={() => router.push(feature.href)}>
                                        Get Started <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </Card>
                        )
                    })}
                </div>

                {/* Productivity - Goals */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-secondary/60 border-border">
                        <CardHeader>
                            <CardTitle>Daily Focus</CardTitle>
                            <CardDescription>Top priorities for today</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-2 mb-4">
                                <Input
                                    value={newGoal}
                                    onChange={(e) => setNewGoal(e.target.value)}
                                    placeholder="Add a goal..."
                                    className="bg-white/5 border-white/10"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddGoal()}
                                />
                                <Button onClick={handleAddGoal} size="icon"><Plus className="h-4 w-4" /></Button>
                            </div>
                            <div className="space-y-2">
                                {goals.map(goal => (
                                    <div key={goal.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-border/40">
                                        <button onClick={() => toggleGoal(goal.id)}>
                                            {goal.done ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                                        </button>
                                        <span className={`text-sm flex-1 ${goal.done ? 'line-through text-muted-foreground' : ''}`}>{goal.text}</span>
                                        <button onClick={() => removeGoal(goal.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                ))}
                                {goals.length === 0 && <p className="text-sm text-center text-muted-foreground py-4">No goals set for today.</p>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Productivity - Financial Snapshot Placeholder */}
                    <Card className="bg-secondary/60 border-border">
                        <CardHeader>
                            <CardTitle>Financial Snapshot</CardTitle>
                            <CardDescription>Recent transaction activity</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-4 rounded-lg bg-white/5 border border-border/40">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Income (All time)</p>
                                        <p className="text-xl font-bold {summaryLoading ? 'animate-pulse' : ''} text-green-600">
                                            {formatCurrency(summary.income)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground text-right">Expenses (All time)</p>
                                        <p className="text-xl font-bold {summaryLoading ? 'animate-pulse' : ''} text-red-600 text-right">
                                            {formatCurrency(summary.expenses)}
                                        </p>
                                    </div>
                                </div>
                                <div className="relative pt-4">
                                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                        <div className="w-full border-t border-border" />
                                    </div>
                                    <div className="relative flex justify-center">
                                        <span className="bg-secondary px-2 text-sm text-muted-foreground rounded-md">{summary.net ? `Net Flow: ${formatCurrency(summary.net)}` : 'Net Flow: $0.00'}</span>
                                    </div>
                                </div>
                                <Button variant="outline" className="w-full" onClick={() => router.push('/dashboard/expenses')}>
                                    View All Transactions
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </main>
        </div>
    )
}
