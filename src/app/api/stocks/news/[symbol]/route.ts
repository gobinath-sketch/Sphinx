import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const { symbol } = await params
    const FINNHUB_API_KEY =
      process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 })
    }

    if (!FINNHUB_API_KEY) {
      return NextResponse.json([])
    }

    const to = Math.floor(Date.now() / 1000)
    const from = to - 30 * 24 * 60 * 60

    const resp = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(
        symbol.toUpperCase()
      )}&from=${new Date(from * 1000).toISOString().slice(0, 10)}&to=${new Date(
        to * 1000
      ).toISOString().slice(0, 10)}&token=${FINNHUB_API_KEY}`
    )

    if (!resp.ok) {
      return NextResponse.json([])
    }

    const data = await resp.json()
    if (!Array.isArray(data)) {
      return NextResponse.json([])
    }

    const news = data
      .slice(0, Math.max(1, Math.min(limit, 20)))
      .map((item: {
        id?: number
        headline?: string
        summary?: string
        url?: string
        datetime?: number
        source?: string
      }, index: number) => ({
        id: String(item.id ?? `${symbol.toUpperCase()}-${index}`),
        title: item.headline || `${symbol.toUpperCase()} News`,
        summary: item.summary || '',
        url: item.url || '',
        publishedAt: item.datetime
          ? new Date(item.datetime * 1000).toISOString()
          : new Date().toISOString(),
        source: item.source || 'Unknown',
      }))
      .filter((n: { url: string }) => Boolean(n.url))

    return NextResponse.json(news)

  } catch (error) {
    console.error('Error fetching stock news:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
