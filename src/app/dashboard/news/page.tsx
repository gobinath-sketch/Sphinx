'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/features/auth/context/AuthContext'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/shared/hooks/use-toast'
import {
  Newspaper,
  Search,
  ExternalLink,
  Calendar,
  ArrowLeft,
  TrendingUp,
  Briefcase,
  DollarSign
} from 'lucide-react'
import { BackToDashboardButton } from '@/components/BackToDashboardButton'
import { newsService, NewsArticle } from '@/lib/services/news-service'
import { formatRelativeTime } from '@/shared/utils'

export default function NewsPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loadingNews, setLoadingNews] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | 'tech' | 'business' | 'personalized'>('all')

  const loadNews = useCallback(async (category: string = 'all') => {
    setLoadingNews(true)
    try {
      let newsData: NewsArticle[] = []

      switch (category) {
        case 'tech':
          newsData = await newsService.getTechNews()
          break
        case 'business':
          newsData = await newsService.getBusinessNews()
          break
        case 'personalized':
          if (profile?.skills && profile.skills.length > 0) {
            const skillNames = profile.skills.map(skill => skill.name)
            newsData = await newsService.getPersonalizedNews(skillNames)
          } else {
            newsData = await newsService.getTechNews()
          }
          break
        default:
          newsData = await newsService.getTopHeadlines({ pageSize: 30 })
      }

      setArticles(newsData)
    } catch {
      toast({
        title: "Error Loading News",
        description: "Failed to load news articles. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoadingNews(false)
    }
  }, [profile?.skills, toast])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    } else if (user) {
      loadNews()
    }
  }, [user, loading, router, loadNews])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setLoadingNews(true)
    try {
      const searchResults = await newsService.searchNews({
        query: searchQuery,
        pageSize: 20
      })
      setArticles(searchResults)
    } catch {
      toast({
        title: "Search Failed",
        description: "Failed to search news. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoadingNews(false)
    }
  }

  const handleCategoryChange = (category: 'all' | 'tech' | 'business' | 'personalized') => {
    setActiveCategory(category)
    loadNews(category)
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
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">News Feed</h1>
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
                <CardTitle className="text-lg text-white font-semibold">Stay Informed</CardTitle>
                <CardDescription className="text-xs text-gray-400 mt-1">
                  Get the latest news on technology, business, and your areas of interest
                </CardDescription>
              </div>

              {/* Category Tabs */}
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'all' as const, label: 'All News', icon: Newspaper },
                  { key: 'tech' as const, label: 'Technology', icon: TrendingUp },
                  { key: 'business' as const, label: 'Business', icon: DollarSign },
                  { key: 'personalized' as const, label: 'For You', icon: Briefcase }
                ] as const).map(({ key, label, icon: Icon }) => (
                  <Button
                    key={key}
                    variant={activeCategory === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleCategoryChange(key)}
                    className={`h-8 text-xs ${activeCategory === key
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 border-gray-600 hover:border-sky-400'
                      }`}
                  >
                    <Icon className="h-3 w-3 mr-1.5" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search for news..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 text-sm bg-black/50 border-white/10 focus:border-primary focus:ring-2 focus:ring-primary/30"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Button
                size="sm"
                onClick={handleSearch}
                disabled={loadingNews}
                className="h-9 w-full sm:w-auto px-4 text-sm bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-500 hover:to-blue-700 text-white"
              >
                {loadingNews ? '...' : 'Search'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* News Articles */}
        {loadingNews ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading news...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {articles.length > 0 ? (
              articles.map((article, index) => (
                <Card key={article.id || index} className="bg-gray-900/50 border-gray-700 hover:border-sky-400/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-sky-900/20 flex flex-col h-full overflow-hidden group">
                  {article.urlToImage && (
                    <div className="w-full h-32 overflow-hidden relative">
                      <Image
                        src={article.urlToImage}
                        alt={article.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    </div>
                  )}
                  <CardContent className="p-4 flex flex-col flex-1">
                    <h3 className="text-sm font-semibold text-white mb-2 hover:text-sky-300 transition-colors line-clamp-2 leading-tight">
                      {article.title}
                    </h3>
                    
                    <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between text-[10px] text-gray-400 mb-3 space-y-1 2xl:space-y-0">
                      <div className="flex items-center overflow-hidden">
                        <Newspaper className="h-3 w-3 mr-1 flex-shrink-0" />
                        <span className="truncate">{article.source.name}</span>
                      </div>
                      <div className="flex items-center flex-shrink-0">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatRelativeTime(article.publishedAt)}
                      </div>
                    </div>

                    <p className="text-gray-300 mb-4 text-xs line-clamp-3 leading-snug">
                      {article.description}
                    </p>

                    <div className="mt-auto pt-3 border-t border-gray-800">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(article.url, '_blank')}
                        className="w-full h-8 text-xs text-gray-300 border-gray-600 hover:border-sky-400 hover:bg-sky-400/10 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3 mr-1.5" />
                        Read Article
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-12">
                <Newspaper className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-400 mb-2">No articles found</h3>
                <p className="text-gray-500">
                  Try adjusting your search or selecting a different category
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
