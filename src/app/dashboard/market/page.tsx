'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/features/auth/context/AuthContext'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/shared/hooks/use-toast'
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Star,
  ArrowLeft,
  BarChart3,
  Activity
} from 'lucide-react'
import { BackToDashboardButton } from '@/components/BackToDashboardButton'
import { stockService, StockQuote, WatchlistItem } from '@/lib/services/stock-service'
import { formatCurrency } from '@/shared/utils'

export default function StocksPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StockQuote[]>([])
  const [loadingStocks, setLoadingStocks] = useState(false)
  const [loadingWatchlist, setLoadingWatchlist] = useState(false)
  const watchlistSymbolsKey = watchlist.map((i) => i.symbol).sort().join(',')
  // We memoize by symbol list only, so price refreshes don't recreate the interval dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const watchlistSymbols = useMemo(() => watchlist.map((i) => i.symbol), [watchlistSymbolsKey])

  const getAddedAt = (item: WatchlistItem) => {
    const maybe = item as unknown as {
      addedAt?: string | Date
      added_at?: string | Date
      createdAt?: string | Date
    }
    const raw = maybe.addedAt ?? maybe.added_at ?? maybe.createdAt
    return raw ? new Date(raw).toISOString() : new Date().toISOString()
  }

  const loadWatchlist = useCallback(async () => {
    if (!user) return

    setLoadingWatchlist(true)
    try {
      const watchlistData = await stockService.getWatchlist()
      if (watchlistData.length === 0) {
        setWatchlist([])
        return
      }

      // Merge watchlist items with live quote data so price/change aren't 0.
      const symbols = watchlistData.map((i) => i.symbol)
      const quotes = await stockService.getMultipleQuotes(symbols)
      const quoteMap = new Map(quotes.map((q) => [q.symbol, q]))

      const merged: WatchlistItem[] = watchlistData.map((item) => {
        const q = quoteMap.get(item.symbol)
        return {
          symbol: item.symbol,
          name: q?.name ?? item.name,
          price: q?.price ?? 0,
          change: q?.change ?? 0,
          changePercent: q?.changePercent ?? 0,
          addedAt: getAddedAt(item),
        }
      })

      setWatchlist(merged)
    } catch (error) {
      console.error('Error loading watchlist:', error)
    } finally {
      setLoadingWatchlist(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    if (watchlistSymbols.length === 0) return

    let cancelled = false
    const id = setInterval(async () => {
      try {
        const quotes = await stockService.getMultipleQuotes(watchlistSymbols)
        const quoteMap = new Map(quotes.map((q) => [q.symbol, q]))

        if (cancelled) return
        setWatchlist((prev) =>
          prev.map((item) => {
            const q = quoteMap.get(item.symbol)
            if (!q) return item
            return {
              ...item,
              name: q.name,
              price: q.price,
              change: q.change,
              changePercent: q.changePercent,
            }
          })
        )
      } catch (e) {
        console.error('Error refreshing watchlist quotes:', e)
      }
    }, 10000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user, watchlistSymbolsKey, watchlistSymbols])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    } else if (user) {
      loadWatchlist()
    }
  }, [user, loading, router, loadWatchlist])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setLoadingStocks(true)
    try {
      const results = await stockService.searchStocks(searchQuery)
      const normalizedQuery = searchQuery.trim().toUpperCase()
      const prioritized = results
        .filter((result) => typeof result.symbol === 'string' && result.symbol.trim().length > 0)
        .sort((a, b) => {
          const aExact = a.symbol.toUpperCase() === normalizedQuery ? 1 : 0
          const bExact = b.symbol.toUpperCase() === normalizedQuery ? 1 : 0
          if (aExact !== bExact) return bExact - aExact
          const aDot = a.symbol.includes('.') ? 1 : 0
          const bDot = b.symbol.includes('.') ? 1 : 0
          return aDot - bDot
        })

      // Convert search results to quotes
      const quotes = await Promise.all(
        prioritized.slice(0, 8).map(async (result) => {
          try {
            return await stockService.getQuote(result.symbol)
          } catch {
            return null
          }
        })
      )
      setSearchResults(quotes.filter(Boolean) as StockQuote[])
    } catch {
      toast({
        title: "Search Failed",
        description: "Failed to search stocks. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoadingStocks(false)
    }
  }

  const handleAddToWatchlist = async (symbol: string) => {
    if (!user) return

    try {
      await stockService.addToWatchlist(user.id, symbol)
      toast({
        title: "Added to Watchlist",
        description: `${symbol} has been added to your watchlist`,
      })
      loadWatchlist()
    } catch {
      toast({
        title: "Add Failed",
        description: "Failed to add stock to watchlist. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleRemoveFromWatchlist = async (symbol: string) => {
    if (!user) return

    try {
      await stockService.removeFromWatchlist(user.id, symbol)
      toast({
        title: "Removed from Watchlist",
        description: `${symbol} has been removed from your watchlist`,
      })
      loadWatchlist()
    } catch {
      toast({
        title: "Remove Failed",
        description: "Failed to remove stock from watchlist. Please try again.",
        variant: "destructive",
      })
    }
  }

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-400'
    if (change < 0) return 'text-red-400'
    return 'text-gray-400'
  }

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4" />
    if (change < 0) return <TrendingDown className="h-4 w-4" />
    return <Activity className="h-4 w-4" />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-gray-900/50 border-b border-gray-800 backdrop-blur-sm">
        <div className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-auto flex-col items-start justify-between gap-3 py-3 sm:h-16 sm:flex-row sm:items-center sm:gap-0 sm:py-0">
            <div className="flex items-center min-w-0">
              <BackToDashboardButton className="mr-4" />
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Stock Dashboard</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Section */}
        <Card className="bg-gray-900/50 border-gray-700 mb-6">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div>
                <CardTitle className="text-lg text-white font-semibold">Search Stocks</CardTitle>
                <CardDescription className="text-xs text-gray-400 mt-1">
                  Search for stocks to add to your watchlist
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Enter stock symbol (e.g., AAPL, GOOGL, MSFT)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                  className="h-9 pl-9 text-sm bg-black/50 border-white/10 focus:border-primary focus:ring-2 focus:ring-primary/30"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Button
                size="sm"
                onClick={handleSearch}
                disabled={loadingStocks}
                className="h-9 px-4 text-sm bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-500 hover:to-blue-700 text-white"
              >
                {loadingStocks ? '...' : 'Search'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <Card className="bg-gray-900/50 border-gray-700 mb-8">
            <CardHeader>
              <CardTitle className="text-white">Search Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {searchResults.map((stock) => (
                  <div key={stock.symbol} className="flex flex-col p-4 bg-gray-800/50 rounded-lg hover:border-sky-400/50 border border-transparent transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-sky-900/20">
                    <div className="flex items-center justify-between mb-2">
                       <h3 className="text-lg font-bold text-white leading-none">{stock.symbol}</h3>
                       <div className={`flex items-center text-xs font-medium space-x-1 ${getChangeColor(stock.change)}`}>
                         {getChangeIcon(stock.change)}
                         <span>{stock.change > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%</span>
                       </div>
                    </div>
                    <span className="text-[10px] text-gray-400 truncate mb-3">{stock.name}</span>
                    <span className="text-xl font-bold text-white mb-4">{formatCurrency(stock.price)}</span>
                    <Button
                      onClick={() => handleAddToWatchlist(stock.symbol)}
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs text-gray-300 border-gray-600 hover:border-sky-400 hover:bg-sky-400/10 transition-colors mt-auto"
                    >
                      <Plus className="h-3 w-3 mr-1.5" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Watchlist */}
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4">
              <CardTitle className="text-lg text-white font-semibold flex items-center">
                <Star className="h-4 w-4 mr-2 text-yellow-400" />
                Your Watchlist
              </CardTitle>
              <CardDescription className="text-xs text-gray-400 mt-1">
                Track your favorite stocks and their performance
              </CardDescription>
            </div>
            
            {loadingWatchlist ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400 mx-auto mb-4"></div>
                <p className="text-xs text-gray-400">Loading watchlist...</p>
              </div>
            ) : watchlist.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {watchlist.map((item) => {
                  const priceValue = typeof item.price === 'number' ? item.price : 0
                  const changeValue = typeof item.change === 'number' ? item.change : 0
                  const changePercentValue = typeof item.changePercent === 'number' ? item.changePercent : 0

                  return (
                    <div key={item.symbol} className="flex flex-col p-4 bg-gray-800/50 rounded-lg hover:border-sky-400/50 border border-transparent transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-sky-900/20 group">
                      <div className="flex items-center justify-between mb-2">
                         <h3 className="text-lg font-bold text-white leading-none group-hover:text-sky-300 transition-colors">{item.symbol}</h3>
                         <div className={`flex items-center text-xs font-medium space-x-1 ${getChangeColor(changeValue)}`}>
                           {getChangeIcon(changeValue)}
                           <span>{changeValue > 0 ? '+' : ''}{changePercentValue.toFixed(2)}%</span>
                         </div>
                      </div>
                      <span className="text-[10px] text-gray-400 truncate mb-3">{item.name}</span>
                      <span className="text-xl font-bold text-white mb-4">{formatCurrency(priceValue)}</span>
                      
                      <div className="flex space-x-2 mt-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs text-gray-300 border-gray-600 hover:border-sky-400 hover:bg-sky-400/10 transition-colors"
                          onClick={() => router.push(`/dashboard/chart/${item.symbol}`)}
                        >
                          <BarChart3 className="h-3 w-3 mr-1" />
                          Chart
                        </Button>
                        <Button
                          onClick={() => handleRemoveFromWatchlist(item.symbol)}
                          variant="outline"
                          size="sm"
                          className="px-2 h-8 text-red-400 border-red-600/30 hover:border-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          X
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <TrendingUp className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-400 mb-2">No stocks in watchlist</h3>
                <p className="text-gray-500 mb-6">
                  Search for stocks above to add them to your watchlist
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                  <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                    <h4 className="text-sm font-semibold text-sky-300 mb-1">Popular Stocks</h4>
                    <p className="text-xs text-gray-400">AAPL, GOOGL, MSFT</p>
                  </div>
                  <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                    <h4 className="text-sm font-semibold text-sky-300 mb-1">Tech Giants</h4>
                    <p className="text-xs text-gray-400">TSLA, META, NVDA</p>
                  </div>
                  <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                    <h4 className="text-sm font-semibold text-sky-300 mb-1">Finance</h4>
                    <p className="text-xs text-gray-400">JPM, BAC, WFC</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
