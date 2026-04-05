'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/features/auth/context/AuthContext'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/shared/hooks/use-toast'
import {
  Search,
  MapPin,
  DollarSign,
  Clock,
  Building,
  ExternalLink,
  Heart,
  Filter,
  ArrowLeft,
  Bell,
  Plus,
  X
} from 'lucide-react'
import { BackToDashboardButton } from '@/components/BackToDashboardButton'
import { jobService, JobSearchParams } from '@/lib/services/job-service'
import { JobSnapshot } from '@/shared/database/types'
import { formatDate, formatCurrency } from '@/shared/utils'

type JobAlert = {
  id: string
  query: string
  location?: string
  salary_min?: string | number
  salary_max?: string | number
  job_type?: string
  experience_level?: string
  frequency: string
  created_at: string
}

type JobAlertDraft = {
  query: string
  location: string
  salary_min: string
  salary_max: string
  job_type: string
  experience_level: string
  frequency: string
}

export default function JobsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [location, setLocation] = useState('')
  const [jobs, setJobs] = useState<JobSnapshot[]>([])
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set())
  const [isSearching, setIsSearching] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    remote: false,
    salary_min: '',
    salary_max: '',
    job_type: '',
    experience_level: '',
    skills: [] as string[],
    company_size: '',
    posted_within: ''
  })
  const [sortBy, setSortBy] = useState('relevance')
  const [, setCurrentPage] = useState(1)
  const [totalJobs, setTotalJobs] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [showJobAlerts, setShowJobAlerts] = useState(false)
  const [jobAlerts, setJobAlerts] = useState<JobAlert[]>([])
  const [newAlert, setNewAlert] = useState<JobAlertDraft>({
    query: '',
    location: '',
    salary_min: '',
    salary_max: '',
    job_type: '',
    experience_level: '',
    frequency: 'daily'
  })

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // Initial jobs fetch
  useEffect(() => {
    const fetchInitialJobs = async () => {
      if (!user) return

      setIsSearching(true)
      try {
        // Default search to show some content
        const result = await jobService.searchJobs({
          query: 'Software Engineer', // Default popular role
        })
        setJobs(result.jobs)
        setTotalJobs(result.total)
        setHasMore(result.hasMore)

        if (result.total === 0) {
          // If mostly backend default failed, try fallback
          // (Result already handled by service/backend)
        }
      } catch (error) {
        console.error('Initial jobs fetch failed:', error)
      } finally {
        setIsSearching(false)
      }
    }

    if (user && !loading) {
      fetchInitialJobs()
    }
  }, [user, loading])

  const createJobAlert = async () => {
    if (!newAlert.query.trim()) {
      toast({
        title: "Alert Required",
        description: "Please enter a search query for your job alert",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch('/api/jobs/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAlert),
      })

      if (response.ok) {
        toast({
          title: "Job Alert Created",
          description: "You'll receive notifications when matching jobs are found",
        })
        setNewAlert({
          query: '',
          location: '',
          salary_min: '',
          salary_max: '',
          job_type: '',
          experience_level: '',
          frequency: 'daily'
        })
        fetchJobAlerts()
      }
    } catch {
      toast({
        title: "Alert Creation Failed",
        description: "Failed to create job alert. Please try again.",
        variant: "destructive",
      })
    }
  }

  const fetchJobAlerts = async () => {
    try {
      const response = await fetch('/api/jobs/alerts')
      if (response.ok) {
        const data: { alerts?: JobAlert[] } = await response.json()
        setJobAlerts(Array.isArray(data.alerts) ? data.alerts : [])
      }
    } catch (error) {
      console.log('Error fetching job alerts:', error)
    }
  }

  const deleteJobAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/jobs/alerts?alertId=${alertId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast({
          title: "Job Alert Deleted",
          description: "Job alert has been removed",
        })
        fetchJobAlerts()
      }
    } catch {
      toast({
        title: "Deletion Failed",
        description: "Failed to delete job alert. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search Required",
        description: "Please enter a search query",
        variant: "destructive",
      })
      return
    }

    setIsSearching(true)
    try {
      const searchParams: JobSearchParams = {
        query: searchQuery,
        location: location || undefined,
        remote: filters.remote || undefined,
        salary_min: filters.salary_min ? parseInt(filters.salary_min) : undefined,
        salary_max: filters.salary_max ? parseInt(filters.salary_max) : undefined,
        job_type: filters.job_type as 'full-time' | 'part-time' | 'contract' | 'internship' | undefined,
        experience_level: filters.experience_level as 'entry' | 'mid' | 'senior' | 'executive' | undefined
      }

      const result = await jobService.searchJobs(searchParams)
      setJobs(result.jobs)
      setTotalJobs(result.total)
      setHasMore(result.hasMore)

      if (result.total > 0) {
        toast({
          title: "Search Complete",
          description: `Found ${result.total} real jobs from your connected APIs.`,
        })
      } else {
        toast({
          title: "No Jobs Found",
          description: "No real jobs found matching your criteria. Try different keywords or check your API keys.",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Search Failed",
        description: "Failed to search for jobs. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleSaveJob = async (job: JobSnapshot, source: string) => {
    if (!user) return

    try {
      await jobService.saveJob(user.id, job, source)
      setSavedJobs(prev => new Set([...prev, `${source}_${job.title}_${job.company}`]))

      toast({
        title: "Job Saved",
        description: "Job has been added to your saved jobs",
      })
    } catch {
      toast({
        title: "Save Failed",
        description: "Failed to save job. Please try again.",
        variant: "destructive",
      })
    }
  }

  const getRemoteTypeColor = (type: string) => {
    switch (type) {
      case 'remote': return 'text-green-400'
      case 'hybrid': return 'text-yellow-400'
      case 'onsite': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const getRemoteTypeIcon = (type: string) => {
    switch (type) {
      case 'remote': return '🏠'
      case 'hybrid': return '🏢'
      case 'onsite': return '🏢'
      default: return '📍'
    }
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
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <BackToDashboardButton className="mr-4" />
              <h1 className="text-2xl font-bold text-white">Job Search</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowJobAlerts(!showJobAlerts)}
                className="text-gray-300 border-gray-600 hover:border-sky-400"
              >
                <Bell className="h-4 w-4 mr-2" />
                Job Alerts ({jobAlerts.length})
              </Button>
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
                <CardTitle className="text-lg text-white font-semibold">Find Your Dream Job</CardTitle>
                <CardDescription className="text-xs text-gray-400 mt-1">
                  Search for jobs using skills, keywords, or job titles
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Enter skills, job title, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 text-sm bg-black/50 border-white/10 focus:border-primary focus:ring-2 focus:ring-primary/30"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <div className="flex-[0.7] relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Location (optional)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="h-9 pl-9 text-sm bg-black/50 border-white/10 focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex space-x-2">
                <Button
                  onClick={() => setShowFilters(!showFilters)}
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-xs text-gray-300 border-gray-600 hover:border-sky-400"
                >
                  <Filter className="h-4 w-4 mr-1.5" />
                  Filters
                </Button>
                <Button
                  size="sm"
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="h-9 px-4 text-sm bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-500 hover:to-blue-700 text-white whitespace-nowrap"
                >
                  {isSearching ? '...' : 'Search Jobs'}
                </Button>
              </div>
            </div>

            {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">
                      Remote Work
                    </label>
                    <select
                      value={filters.remote ? 'true' : 'false'}
                      onChange={(e) => setFilters(prev => ({ ...prev, remote: e.target.value === 'true' }))}
                      className="w-full p-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                    >
                      <option value="false">Any</option>
                      <option value="true">Remote Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">
                      Job Type
                    </label>
                    <select
                      value={filters.job_type}
                      onChange={(e) => setFilters(prev => ({ ...prev, job_type: e.target.value }))}
                      className="w-full p-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                    >
                      <option value="">Any</option>
                      <option value="full-time">Full-time</option>
                      <option value="part-time">Part-time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">
                      Experience Level
                    </label>
                    <select
                      value={filters.experience_level}
                      onChange={(e) => setFilters(prev => ({ ...prev, experience_level: e.target.value }))}
                      className="w-full p-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                    >
                      <option value="">Any</option>
                      <option value="entry">Entry Level</option>
                      <option value="mid">Mid Level</option>
                      <option value="senior">Senior Level</option>
                      <option value="executive">Executive</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">
                      Posted Within
                    </label>
                    <select
                      value={filters.posted_within}
                      onChange={(e) => setFilters(prev => ({ ...prev, posted_within: e.target.value }))}
                      className="w-full p-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                    >
                      <option value="">Any Time</option>
                      <option value="1">Last 24 hours</option>
                      <option value="7">Last week</option>
                      <option value="30">Last month</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">
                      Min Salary ($)
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g., 50000"
                      value={filters.salary_min}
                      onChange={(e) => setFilters(prev => ({ ...prev, salary_min: e.target.value }))}
                      className="bg-gray-800 border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">
                      Max Salary ($)
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g., 100000"
                      value={filters.salary_max}
                      onChange={(e) => setFilters(prev => ({ ...prev, salary_max: e.target.value }))}
                      className="bg-gray-800 border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">
                      Company Size
                    </label>
                    <select
                      value={filters.company_size}
                      onChange={(e) => setFilters(prev => ({ ...prev, company_size: e.target.value }))}
                      className="w-full p-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                    >
                      <option value="">Any Size</option>
                      <option value="startup">Startup (1-50)</option>
                      <option value="small">Small (51-200)</option>
                      <option value="medium">Medium (201-1000)</option>
                      <option value="large">Large (1000+)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">
                      Sort By
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full p-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="date">Date Posted</option>
                      <option value="salary">Salary</option>
                      <option value="company">Company</option>
                    </select>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>

        {/* Job Alerts Panel */}
        {showJobAlerts && (
          <Card className="bg-gray-900/50 border-gray-700 mb-8">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <span>🔔 Job Alerts</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowJobAlerts(false)}
                  className="text-gray-300 border-gray-600 hover:border-sky-400"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardTitle>
              <CardDescription className="text-gray-400">
                Get notified when new jobs match your criteria
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Create New Alert */}
                <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                  <h4 className="text-lg font-semibold text-white mb-4">Create New Alert</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-300 mb-2 block">
                        Search Query *
                      </label>
                      <Input
                        placeholder="e.g., React Developer"
                        value={newAlert.query}
                        onChange={(e) => setNewAlert(prev => ({ ...prev, query: e.target.value }))}
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-300 mb-2 block">
                        Location
                      </label>
                      <Input
                        placeholder="e.g., San Francisco"
                        value={newAlert.location}
                        onChange={(e) => setNewAlert(prev => ({ ...prev, location: e.target.value }))}
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-300 mb-2 block">
                        Frequency
                      </label>
                      <select
                        value={newAlert.frequency}
                        onChange={(e) => setNewAlert(prev => ({ ...prev, frequency: e.target.value }))}
                        className="w-full p-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-300 mb-2 block">
                        Min Salary ($)
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g., 80000"
                        value={newAlert.salary_min}
                        onChange={(e) => setNewAlert(prev => ({ ...prev, salary_min: e.target.value }))}
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-300 mb-2 block">
                        Max Salary ($)
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g., 150000"
                        value={newAlert.salary_max}
                        onChange={(e) => setNewAlert(prev => ({ ...prev, salary_max: e.target.value }))}
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={createJobAlert}
                        className="bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-500 hover:to-blue-700 text-white w-full"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Alert
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Existing Alerts */}
                <div>
                  <h4 className="text-lg font-semibold text-white mb-4">Your Job Alerts</h4>
                  {jobAlerts.length > 0 ? (
                    <div className="space-y-3">
                      {jobAlerts.map((alert) => (
                        <div key={alert.id} className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-4 text-sm text-gray-300 mb-2">
                                <span className="font-medium">{alert.query}</span>
                                {alert.location && <span>📍 {alert.location}</span>}
                                {alert.salary_min && alert.salary_max && (
                                  <span>💰 ${alert.salary_min} - ${alert.salary_max}</span>
                                )}
                                <span className="text-gray-400">📅 {alert.frequency}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                Created: {new Date(alert.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteJobAlert(alert.id)}
                              className="text-red-400 border-red-600 hover:border-red-500"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No job alerts created yet</p>
                      <p className="text-sm">Create your first alert to get notified about new opportunities</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {jobs.length > 0 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">
                {totalJobs} Jobs Found
              </h2>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-400">
                  Showing {jobs.length} of {totalJobs}
                </span>
                {hasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="text-gray-300 border-gray-600 hover:border-sky-400"
                  >
                    Load More
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {jobs.map((job, index) => {
                const jobKey = `${job.source}_${job.title}_${job.company}`
                const isSaved = savedJobs.has(jobKey)

                return (
                  <Card key={index} className="bg-gray-900/50 border-gray-700 hover:border-sky-400/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-sky-900/20 flex flex-col h-full">
                    <CardContent className="p-4 flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <CardTitle className="text-sm font-semibold text-white line-clamp-2 leading-tight">
                          {job.title}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSaveJob(job, job.source || 'unknown')}
                          disabled={isSaved}
                          className="h-6 w-6 text-gray-400 hover:text-sky-400 -mt-1 -mr-1 flex-shrink-0"
                        >
                          <Heart className={`h-4 w-4 ${isSaved ? 'fill-red-500 text-red-500' : ''}`} />
                        </Button>
                      </div>

                      <div className="space-y-1.5 mb-3 text-[10px] text-gray-400">
                        <div className="flex items-center">
                          <Building className="h-3 w-3 mr-1.5 flex-shrink-0" />
                          <span className="truncate">{job.company}</span>
                        </div>
                        <div className="flex items-center">
                          <MapPin className="h-3 w-3 mr-1.5 flex-shrink-0" />
                          <span className="truncate">{job.location}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="mr-1">{getRemoteTypeIcon(job.remote_type || 'onsite')}</span>
                            <span className={getRemoteTypeColor(job.remote_type || 'onsite')}>
                              {(job.remote_type || 'onsite').charAt(0).toUpperCase() + (job.remote_type || 'onsite').slice(1)}
                            </span>
                          </div>
                          <div className="flex items-center text-gray-500">
                            <Clock className="h-3 w-3 mr-1 block" />
                            {formatDate(job.posted_date || new Date().toISOString())}
                          </div>
                        </div>
                        {job.salary_range && (
                          <div className="flex items-center text-green-400 font-medium">
                            <DollarSign className="h-3 w-3 mr-1 flex-shrink-0" />
                            {formatCurrency(job.salary_range.min)} - {formatCurrency(job.salary_range.max)}
                          </div>
                        )}
                      </div>

                      <p className="text-gray-300 text-xs line-clamp-3 leading-snug mb-3">
                        {job.description}
                      </p>

                      {job.requirements && job.requirements.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-1 mt-auto">
                          {job.requirements.slice(0, 3).map((req, reqIndex) => (
                            <span
                              key={reqIndex}
                              className="px-1.5 py-0.5 bg-sky-500/20 text-sky-200 text-[10px] rounded"
                            >
                              {req}
                            </span>
                          ))}
                          {job.requirements.length > 3 && (
                            <span className="px-1.5 py-0.5 bg-gray-600 text-gray-300 text-[10px] rounded">
                              +{job.requirements.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-auto pt-3 border-t border-gray-800">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(job.apply_url || '#', '_blank')}
                          className="w-full h-8 text-xs text-gray-300 border-gray-600 hover:border-sky-400 hover:bg-sky-400/10 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3 mr-1.5" />
                          Apply Now
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {jobs.length === 0 && !isSearching && (
          <div className="space-y-8">
            <div className="text-center py-12">
              <Search className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">No real jobs found</h3>
              <p className="text-gray-500 mb-6">
                No real jobs found matching your criteria. Try different keywords or check your API configuration.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('software engineer')
                    setLocation('')
                    setFilters({
                      remote: false,
                      salary_min: '',
                      salary_max: '',
                      job_type: '',
                      experience_level: '',
                      skills: [],
                      company_size: '',
                      posted_within: ''
                    })
                  }}
                  className="text-gray-300 border-gray-600 hover:border-sky-400"
                >
                  Try &quot;Software Engineer&quot;
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('developer')
                    setLocation('remote')
                    setFilters(prev => ({ ...prev, remote: true }))
                  }}
                  className="text-gray-300 border-gray-600 hover:border-sky-400"
                >
                  Try &quot;Remote Developer&quot;
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('data scientist')
                    setLocation('')
                    setFilters(prev => ({ ...prev, experience_level: 'mid' }))
                  }}
                  className="text-gray-300 border-gray-600 hover:border-sky-400"
                >
                  Try &quot;Data Scientist&quot;
                </Button>
              </div>
            </div>

            {/* Real Data Information */}
            <Card className="bg-gray-900/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">🔍 Real Job Search</CardTitle>
                <CardDescription className="text-gray-400">
                  This platform searches real job APIs for authentic opportunities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">🌐 Real Data Sources</h4>
                    <ul className="space-y-2 text-gray-300">
                      <li>• Adzuna - Real job postings from multiple sites</li>
                      <li>• JSearch - Comprehensive job search API</li>
                      <li>• Indeed - Via SerpAPI integration</li>
                      <li>• LinkedIn Jobs - Via SerpAPI integration</li>
                      <li>• Google Jobs - Via Serper API integration</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">🎯 Search Tips</h4>
                    <ul className="space-y-2 text-gray-300">
                      <li>• Use specific job titles (e.g., &quot;Senior React Developer&quot;)</li>
                      <li>• Include relevant skills (e.g., &quot;Python, Machine Learning&quot;)</li>
                      <li>• Try different keywords for the same role</li>
                      <li>• All results are from real job postings</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
