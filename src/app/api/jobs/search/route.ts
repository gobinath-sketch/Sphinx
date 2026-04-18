import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { query, location, remote, salary_min, salary_max } = body

    // Helpers
    const normalize = (s?: string) => (s || '').toLowerCase().trim()
    const normQuery = normalize(query)
    const normLocation = normalize(location)
    const inferCountry = (loc: string): 'in' | 'us' => {
      if (!loc) return 'us'
      const indiaHints = ['india', 'bangalore', 'bengaluru', 'chennai', 'hyderabad', 'mumbai', 'delhi', 'pune', 'kolkata', 'gurgaon', 'noida']
      const usHints = ['united states', 'usa', 'new york', 'california', 'texas', 'florida', 'seattle', 'san francisco', 'austin']
      if (indiaHints.some((token) => loc.includes(token))) return 'in'
      if (usHints.some((token) => loc.includes(token))) return 'us'
      return loc.length > 0 ? 'in' : 'us'
    }
    const searchCountry = inferCountry(normLocation)

    const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 4000) => {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(input, { ...init, signal: controller.signal })
        return res
      } finally {
        clearTimeout(id)
      }
    }

    const locationMatches = (jobLocation: string): boolean => {
      const l = normalize(jobLocation)
      if (!normLocation) return true
      if (!l) return false
      // Accept country/city/state partials and common variants
      const tokens = [normLocation]
      if (normLocation === 'india') tokens.push('in', 'bharat')
      if (normLocation === 'remote') tokens.push('anywhere', 'work from home')
      return tokens.some(t => l.includes(t))
    }
    const diversifyJobs = <T extends { title: string; company: string }>(jobs: T[], maxPerRoleCompany = 1): T[] => {
      const counters = new Map<string, number>()
      const kept: T[] = []
      const overflow: T[] = []
      for (const job of jobs) {
        const key = `${normalize(job.title)}|${normalize(job.company)}`
        const count = counters.get(key) ?? 0
        if (count < maxPerRoleCompany) {
          counters.set(key, count + 1)
          kept.push(job)
        } else {
          overflow.push(job)
        }
      }
      return [...kept, ...overflow]
    }

    // Try to fetch real jobs from multiple APIs
    const realJobs: Array<{
      title: string
      company: string
      location: string
      remote_type: 'remote' | 'onsite' | 'hybrid'
      salary_range?: {
        min: number
        max: number
        currency: string
      }
      description: string
      requirements: string[]
      benefits: string[]
      apply_url: string
      posted_date: string
      source: string
    }> = []

    // Adzuna API
    try {
      const ADZUNA_API_KEY = process.env.ADZUNA_API_KEY || '409ce85eda71617b211a05a10f73445d'
      const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID || '9d4da7c6'

      const country = searchCountry
      const adzunaUrl = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_API_KEY}&what=${encodeURIComponent(normQuery || 'developer')}&results_per_page=10${normLocation ? `&where=${encodeURIComponent(location)}` : ''}`
      console.log('Adzuna URL:', adzunaUrl)

      const adzunaResponse = await fetchWithTimeout(adzunaUrl)

      if (adzunaResponse.ok) {
        const adzunaData = await adzunaResponse.json()
        console.log('Adzuna Response:', adzunaData)
        const adzunaJobs = adzunaData.results?.map((job: {
          title: string
          company: { display_name: string }
          location: { display_name: string }
          salary_min?: number
          salary_max?: number
          description: string
          redirect_url: string
          created: string
        }) => ({
          title: job.title,
          company: job.company?.display_name || 'Unknown Company',
          location: job.location?.display_name || 'Remote',
          remote_type: job.location?.display_name?.toLowerCase().includes('remote') ? 'remote' : 'onsite',
          salary_range: job.salary_min && job.salary_max ? {
            min: job.salary_min,
            max: job.salary_max,
            currency: 'USD'
          } : undefined,
          description: job.description || '',
          requirements: [],
          benefits: [],
          apply_url: job.redirect_url || '',
          posted_date: job.created || new Date().toISOString(),
          source: 'adzuna'
        })) || []
        console.log('Adzuna Jobs Found:', adzunaJobs.length)
        realJobs.push(...adzunaJobs)
      } else {
        console.log('Adzuna API Error:', adzunaResponse.status, await adzunaResponse.text())
      }
    } catch (adzunaError) {
      console.log('Adzuna API failed:', adzunaError)
    }

    // JSearch API
    try {
      const JSEARCH_API_KEY = process.env.JSEARCH_API_KEY || 'ef7994ada9mshe853dff7586d068p1b8839jsneb6805952289'

      const jsearchUrl = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(normQuery || 'developer')}&page=1&num_pages=1${normLocation ? `&country=${searchCountry}` : ''}`
      console.log('JSearch URL:', jsearchUrl)

      const jsearchResponse = await fetchWithTimeout(jsearchUrl, {
        headers: {
          'X-RapidAPI-Key': JSEARCH_API_KEY,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
        }
      })

      if (jsearchResponse.ok) {
        const jsearchData = await jsearchResponse.json()
        console.log('JSearch Response:', jsearchData)
        const jsearchJobs = jsearchData.data?.map((job: {
          job_title: string
          employer_name: string
          job_city?: string
          job_state?: string
          job_is_remote?: boolean
          job_salary_min?: number
          job_salary_max?: number
          job_description: string
          job_required_skills?: string[]
          job_apply_link: string
          job_posted_at_datetime_utc: string
        }) => ({
          title: job.job_title,
          company: job.employer_name || 'Unknown Company',
          location: job.job_city && job.job_state ? `${job.job_city}, ${job.job_state}` : 'Remote',
          remote_type: job.job_is_remote ? 'remote' : 'onsite',
          salary_range: job.job_salary_min && job.job_salary_max ? {
            min: job.job_salary_min,
            max: job.job_salary_max,
            currency: 'USD'
          } : undefined,
          description: job.job_description || '',
          requirements: job.job_required_skills || [],
          benefits: [],
          apply_url: job.job_apply_link || '',
          posted_date: job.job_posted_at_datetime_utc || new Date().toISOString(),
          source: 'jsearch'
        })) || []
        console.log('JSearch Jobs Found:', jsearchJobs.length)
        realJobs.push(...jsearchJobs)
      } else {
        console.log('JSearch API Error:', jsearchResponse.status, await jsearchResponse.text())
      }
    } catch (jsearchError) {
      console.log('JSearch API failed:', jsearchError)
    }

    // Indeed API (using SerpAPI)
    try {
      const SERPAPI_KEY = process.env.SERPAPI_KEY
      if (SERPAPI_KEY) {
        console.log('Trying SerpAPI for Indeed jobs...')

        const serpUrl = `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(normQuery || 'developer')}&api_key=${SERPAPI_KEY}&location=${encodeURIComponent(location || (searchCountry === 'in' ? 'India' : 'United States'))}`
        console.log('SerpAPI URL:', serpUrl)

        const serpResponse = await fetchWithTimeout(serpUrl)

        if (serpResponse.ok) {
          const serpData = await serpResponse.json()
          console.log('SerpAPI Response:', serpData)

          const indeedJobs = serpData.jobs_results?.map((job: {
            title: string
            company_name: string
            location: string
            description: string
            apply_options?: Array<{ link: string }>
            salary?: { min?: number, max?: number }
            posted_at: string
          }) => ({
            title: job.title,
            company: job.company_name || 'Unknown Company',
            location: job.location || 'Remote',
            remote_type: job.location?.toLowerCase().includes('remote') ? 'remote' : 'onsite',
            salary_range: job.salary?.min && job.salary?.max ? {
              min: job.salary.min,
              max: job.salary.max,
              currency: 'USD'
            } : undefined,
            description: job.description || '',
            requirements: [],
            benefits: [],
            apply_url: job.apply_options?.[0]?.link || '',
            posted_date: job.posted_at || new Date().toISOString(),
            source: 'indeed'
          })) || []

          console.log('Indeed Jobs Found:', indeedJobs.length)
          realJobs.push(...indeedJobs)
        } else {
          console.log('SerpAPI Error:', serpResponse.status, await serpResponse.text())
        }
      }
    } catch (serpError) {
      console.log('SerpAPI failed:', serpError)
    }

    // LinkedIn Jobs API (using SerpAPI)
    try {
      const SERPAPI_KEY = process.env.SERPAPI_KEY
      if (SERPAPI_KEY) {
        console.log('Trying SerpAPI for LinkedIn jobs...')

        const linkedinUrl = `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(normQuery || 'developer')} site:linkedin.com&api_key=${SERPAPI_KEY}&location=${encodeURIComponent(location || (searchCountry === 'in' ? 'India' : 'United States'))}`
        console.log('LinkedIn SerpAPI URL:', linkedinUrl)

        const linkedinResponse = await fetchWithTimeout(linkedinUrl)

        if (linkedinResponse.ok) {
          const linkedinData = await linkedinResponse.json()
          console.log('LinkedIn SerpAPI Response:', linkedinData)

          const linkedinJobs = linkedinData.jobs_results?.map((job: {
            title: string
            company_name: string
            location: string
            description: string
            apply_options?: Array<{ link: string }>
            salary?: { min?: number, max?: number }
            posted_at: string
          }) => ({
            title: job.title,
            company: job.company_name || 'Unknown Company',
            location: job.location || 'Remote',
            remote_type: job.location?.toLowerCase().includes('remote') ? 'remote' : 'onsite',
            salary_range: job.salary?.min && job.salary?.max ? {
              min: job.salary.min,
              max: job.salary.max,
              currency: 'USD'
            } : undefined,
            description: job.description || '',
            requirements: [],
            benefits: [],
            apply_url: job.apply_options?.[0]?.link || '',
            posted_date: job.posted_at || new Date().toISOString(),
            source: 'linkedin'
          })) || []

          console.log('LinkedIn Jobs Found:', linkedinJobs.length)
          realJobs.push(...linkedinJobs)
        } else {
          console.log('LinkedIn SerpAPI Error:', linkedinResponse.status, await linkedinResponse.text())
        }
      }
    } catch (linkedinError) {
      console.log('LinkedIn SerpAPI failed:', linkedinError)
    }

    // Serper API disabled by default due to instability; enable only via env flag
    try {
      const SERPER_API_KEY = process.env.SERPER_API_KEY
      const SERPER_ENABLE = process.env.SERPER_ENABLE === 'true'
      if (SERPER_API_KEY && SERPER_ENABLE) {
        console.log('Trying Serper API for Google Jobs...')
        // Implementation intentionally skipped unless enabled
      }
    } catch (serperError) {
      console.log('Serper API skipped/failed:', serperError)
    }

    // Use only real jobs from APIs
    const dedupedJobs = realJobs.filter((job, index, arr) => {
      const key = `${normalize(job.title)}|${normalize(job.company)}|${normalize(job.location)}`
      return arr.findIndex((candidate) => `${normalize(candidate.title)}|${normalize(candidate.company)}|${normalize(candidate.location)}` === key) === index
    })
    let filteredJobs = [...dedupedJobs]

    // No mock jobs fallback: real provider results only.

    if (normQuery) {
      const searchTerms = normQuery.split(' ')
      filteredJobs = filteredJobs.filter(job =>
        searchTerms.some((term: string) =>
          job.title.toLowerCase().includes(term) ||
          job.company.toLowerCase().includes(term) ||
          job.description.toLowerCase().includes(term) ||
          (job.requirements && job.requirements.some((req: string) => req.toLowerCase().includes(term)))
        )
      )
    }

    if (normLocation) {
      filteredJobs = filteredJobs.filter(job => locationMatches(job.location))
    }

    if (remote !== undefined) {
      filteredJobs = filteredJobs.filter(job => {
        if (remote) {
          return job.remote_type === 'remote' || job.remote_type === 'hybrid'
        }
        return true
      })
    }

    if (salary_min) {
      filteredJobs = filteredJobs.filter(job =>
        job.salary_range && job.salary_range.min >= salary_min
      )
    }

    if (salary_max) {
      filteredJobs = filteredJobs.filter(job =>
        job.salary_range && job.salary_range.max <= salary_max
      )
    }

    // Fallback if filters removed all but we do have real jobs
    if (filteredJobs.length === 0 && dedupedJobs.length > 0) {
      console.log('Filters resulted in 0; falling back to best-available jobs without strict location filter')
      filteredJobs = dedupedJobs
    }
    filteredJobs = diversifyJobs(filteredJobs, 1)

    // Simulate pagination
    const page = 1
    const pageSize = 10
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedJobs = filteredJobs.slice(startIndex, endIndex)

    // Log the final results
    console.log(`Total real jobs found: ${filteredJobs.length}`)
    console.log(`Jobs returned: ${paginatedJobs.length}`)
    console.log(`Real jobs array:`, dedupedJobs.map(job => ({ title: job.title, company: job.company, source: job.source })))

    return NextResponse.json({
      jobs: paginatedJobs,
      total: filteredJobs.length,
      page,
      hasMore: endIndex < filteredJobs.length,
      sources_used: dedupedJobs.length > 0 ? [...new Set(dedupedJobs.map(job => job.source))] : [],
      debug_info: {
        total_real_jobs: dedupedJobs.length,
        filtered_jobs: filteredJobs.length,
        returned_jobs: paginatedJobs.length,
        search_params: { query, location, remote, salary_min, salary_max },
        country_inferred: searchCountry
      }
    })

  } catch (error) {
    console.error('Error searching jobs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
