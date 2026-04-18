import { NextRequest, NextResponse } from 'next/server'

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd2q2qjhr01qnf9nn8ti0d2q2qjhr01qnf9nn8tig'
const YAHOO_FINANCE_API_KEY = process.env.YAHOO_FINANCE_API_KEY || 'ef7994ada9mshe853dff7586d068p1b8839jsneb6865952289'

interface StockSearchResult {
  symbol: string
  name: string
  exchange: string
  type?: string
  country?: string
}

async function searchStocksFromFinnhub(query: string): Promise<StockSearchResult[]> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`
    )

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    
    if (!data.result || !Array.isArray(data.result)) {
      return []
    }

    return data.result.slice(0, 20).map((item: {
      symbol: string
      description: string
      type: string
      country: string
    }) => ({
      symbol: item.symbol,
      name: item.description || item.symbol,
      exchange: item.type || 'Unknown',
      type: item.type,
      country: item.country
    }))
  } catch (error) {
    console.log('Finnhub search failed:', error)
    return []
  }
}

async function searchStocksFromYahooFinance(query: string): Promise<StockSearchResult[]> {
  try {
    const response = await fetch(
      `https://yahoo-finance1.p.rapidapi.com/auto-complete?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'X-RapidAPI-Key': YAHOO_FINANCE_API_KEY,
          'X-RapidAPI-Host': 'yahoo-finance1.p.rapidapi.com'
        }
      }
    )

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    
    if (!data.quotes || !Array.isArray(data.quotes)) {
      return []
    }

    return data.quotes.slice(0, 20).map((item: {
      symbol: string
      longname?: string
      shortname?: string
      exchange: string
      quoteType: string
      country: string
    }) => ({
      symbol: item.symbol,
      name: item.longname || item.shortname || item.symbol,
      exchange: item.exchange || 'Unknown',
      type: item.quoteType,
      country: item.country
    }))
  } catch (error) {
    console.log('Yahoo Finance search failed:', error)
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json([])
    }

    // Search from multiple APIs in parallel
    const [finnhubResults, yahooResults] = await Promise.all([
      searchStocksFromFinnhub(query),
      searchStocksFromYahooFinance(query)
    ])

    // Combine results and remove duplicates
    const allResults = [...finnhubResults, ...yahooResults]
    const uniqueResults = allResults.filter((item, index, self) => 
      index === self.findIndex(t => t.symbol === item.symbol)
    )

    return NextResponse.json(uniqueResults.slice(0, 20))

  } catch (error) {
    console.error('Error searching stocks:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
