import { NextRequest, NextResponse } from 'next/server'

interface TrendData {
  keyword: string
  interest: number
  timestamp: string
  region?: string
}

interface TrendResponse {
  trends: TrendData[]
  relatedQueries: string[]
  risingQueries: string[]
}

async function getGoogleTrendsData(keywords: string[]): Promise<TrendResponse> {
  try {
    const SERPAPI_KEY = process.env.SERPAPI_KEY
    if (!SERPAPI_KEY) {
      throw new Error('SERPAPI_KEY is not configured for real trends data')
    }

    const trends: TrendData[] = []
    for (const keyword of keywords) {
      const resp = await fetch(
        `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(
          keyword
        )}&api_key=${SERPAPI_KEY}`
      )
      if (!resp.ok) continue
      const data = await resp.json()
      const timeline: Array<{ values?: Array<{ value?: number }> }> =
        data?.interest_over_time?.timeline_data ?? []
      const latest = timeline[timeline.length - 1]
      const interest = Number(latest?.values?.[0]?.value ?? 0)
      trends.push({
        keyword,
        interest: Number.isFinite(interest) ? interest : 0,
        timestamp: new Date().toISOString(),
        region: 'US',
      })
    }

    // Generate related and rising queries based on keywords
    const relatedQueries = keywords.flatMap(keyword => [
      `${keyword} jobs`,
      `${keyword} salary`,
      `${keyword} skills`,
      `${keyword} career`,
      `${keyword} training`
    ])

    const risingQueries = keywords.flatMap(keyword => [
      `${keyword} 2024`,
      `${keyword} remote`,
      `${keyword} certification`,
      `${keyword} bootcamp`,
      `${keyword} interview`
    ])

    return {
      trends,
      relatedQueries: relatedQueries.slice(0, 10),
      risingQueries: risingQueries.slice(0, 10)
    }
  } catch (error) {
    console.error('Error fetching Google Trends data:', error)
    throw error
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keywordsParam = searchParams.get('keywords')
    
    if (!keywordsParam) {
      return NextResponse.json({ error: 'Keywords parameter is required' }, { status: 400 })
    }

    const keywords = keywordsParam.split(',').map(k => k.trim()).filter(k => k.length > 0)
    
    if (keywords.length === 0) {
      return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 })
    }

    const trendData = await getGoogleTrendsData(keywords)

    return NextResponse.json(trendData)

  } catch (error) {
    console.error('Error fetching trends:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { keywords } = body

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'Keywords array is required' }, { status: 400 })
    }

    const trendData = await getGoogleTrendsData(keywords)

    return NextResponse.json(trendData)

  } catch (error) {
    console.error('Error fetching trends:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
