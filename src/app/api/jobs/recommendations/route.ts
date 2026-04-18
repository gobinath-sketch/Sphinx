import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import { User } from '@/lib/models'
import { verifyToken } from '@/lib/auth'

type UserSkill = { name?: string } | string

type JobPreferences = {
  locations?: string[]
  remote_preference?: string
  salary_range?: {
    min?: number
    max?: number
  }
  [key: string]: unknown
}

// No mock fallback list: recommendations come from real providers only.
const normalize = (s?: string) => (s || '').toLowerCase().trim()
const inferCountry = (loc: string): 'in' | 'us' => {
  if (!loc) return 'us'
  const indiaHints = ['india', 'bangalore', 'bengaluru', 'chennai', 'hyderabad', 'mumbai', 'delhi', 'pune', 'kolkata', 'gurgaon', 'noida']
  const usHints = ['united states', 'usa', 'new york', 'california', 'texas', 'florida', 'seattle', 'san francisco', 'austin']
  if (indiaHints.some((token) => loc.includes(token))) return 'in'
  if (usHints.some((token) => loc.includes(token))) return 'us'
  return loc.length > 0 ? 'in' : 'us'
}
const diversifyJobs = <T extends { title?: string; company?: string }>(jobs: T[], maxPerRoleCompany = 1): T[] => {
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

export async function GET(request: NextRequest) {
  try {
    await dbConnect()

    // Check authentication
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const user = await User.findById(userPayload.userId).select('skills preferences')

    // If user has skills, try to fetch matching real jobs from Adzuna
    let realJobs: unknown[] = []

    if (user) {
      const userSkills = Array.isArray(user.skills) ? (user.skills as UserSkill[]) : []
      const jobPreferences = ((user.preferences as { job_preferences?: JobPreferences } | null)?.job_preferences) ?? {}

      const skillKeywords = userSkills
        .map((skill) => (typeof skill === 'string' ? skill : skill?.name ?? ''))
        .filter(Boolean)
        .join(' ')

      const query = skillKeywords || 'software developer'
      const location = jobPreferences.locations?.[0] ?? ''

      const inferredCountry = inferCountry(normalize(location))
      const serpLocation = location || (inferredCountry === 'in' ? 'India' : 'United States')

      // Try Adzuna directly (avoids the auth cookie issue with internal fetch)
      try {
        const ADZUNA_API_KEY = process.env.ADZUNA_API_KEY || '409ce85eda71617b211a05a10f73445d'
        const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID || '9d4da7c6'
        const country = inferredCountry
        const adzunaUrl = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_API_KEY}&what=${encodeURIComponent(query)}&results_per_page=10`

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const adzunaResponse = await fetch(adzunaUrl, { signal: controller.signal })
        clearTimeout(timeout)

        if (adzunaResponse.ok) {
          const adzunaData = await adzunaResponse.json()
          realJobs = (adzunaData.results ?? []).map((job: {
            title: string
            company: { display_name: string }
            location: { display_name: string }
            salary_min?: number
            salary_max?: number
            description: string
            redirect_url: string
            created: string
          }) => ({
            id: `adzuna-${encodeURIComponent(job.title)}-${encodeURIComponent(job.company?.display_name || 'unknown')}`,
            title: job.title,
            company: job.company?.display_name || 'Unknown Company',
            location: job.location?.display_name || 'Remote',
            remote_type: job.location?.display_name?.toLowerCase().includes('remote') ? 'remote' : 'onsite',
            salary_range: job.salary_min && job.salary_max
              ? { min: job.salary_min, max: job.salary_max, currency: 'USD' }
              : undefined,
            description: job.description || '',
            requirements: [],
            benefits: [],
            apply_url: job.redirect_url || '#',
            posted_date: job.created || new Date().toISOString(),
            source: 'adzuna',
          }))
        }
      } catch {
        // Adzuna failed; continue with other real providers.
      }

      // SerpAPI Google Jobs
      try {
        const SERPAPI_KEY = process.env.SERPAPI_KEY
        if (SERPAPI_KEY) {
          const serpResponse = await fetch(
            `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}&location=${encodeURIComponent(serpLocation)}`
          )
          if (serpResponse.ok) {
            const serpData = await serpResponse.json()
            const serpJobs = (serpData.jobs_results ?? []).map((job: {
              title: string
              company_name: string
              location: string
              description?: string
              apply_options?: Array<{ link: string }>
              posted_at?: string
              salary?: { min?: number; max?: number }
            }) => ({
              id: `serp-${encodeURIComponent(job.title || '')}-${encodeURIComponent(job.company_name || '')}`,
              title: job.title || 'Untitled Role',
              company: job.company_name || 'Unknown Company',
              location: job.location || 'Remote',
              remote_type: job.location?.toLowerCase().includes('remote') ? 'remote' : 'onsite',
              salary_range: job.salary?.min && job.salary?.max
                ? { min: job.salary.min, max: job.salary.max, currency: 'USD' }
                : undefined,
              description: job.description || '',
              requirements: [],
              benefits: [],
              apply_url: job.apply_options?.[0]?.link || '',
              posted_date: job.posted_at || new Date().toISOString(),
              source: 'indeed',
            }))
            realJobs.push(...serpJobs)
          }
        }
      } catch {
        // SerpAPI failed; keep real results from other providers.
      }
    }

    const deduped = realJobs.filter((job, index, arr) => {
      const current = job as { title?: string; company?: string; location?: string }
      const key = `${normalize(current.title)}|${normalize(current.company)}|${normalize(current.location)}`
      return arr.findIndex((candidate) => {
        const c = candidate as { title?: string; company?: string; location?: string }
        const candidateKey = `${normalize(c.title)}|${normalize(c.company)}|${normalize(c.location)}`
        return candidateKey === key
      }) === index
    })
    const jobs = diversifyJobs(deduped, 1).slice(0, 10)

    return NextResponse.json({
      jobs,
      total: jobs.length,
      message: jobs.length > 0
        ? 'Personalized job recommendations based on your profile'
        : 'No real recommendations found right now. Try updating skills and location preferences.',
    })

  } catch (error) {
    console.error('Error fetching job recommendations:', error)
    return NextResponse.json({
      jobs: [],
      total: 0,
      message: 'Unable to fetch real recommendations right now.',
    })
  }
}
