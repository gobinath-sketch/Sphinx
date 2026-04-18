import { NextRequest, NextResponse } from 'next/server'

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd2q2qjhr01qnf9nn8ti0d2q2qjhr01qnf9nn8tig'
const YAHOO_FINANCE_API_KEY = process.env.YAHOO_FINANCE_API_KEY || 'ef7994ada9mshe853dff7586d068p1b8839jsneb6865952289'

interface StockMover {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
}

async function getMoversFromFinnhub(type: string): Promise<StockMover[]> {
  try {
    let endpoint = ''
    switch (type) {
      case 'gainers':
        endpoint = 'https://finnhub.io/api/v1/stock/market-status/gainers'
        break
      case 'losers':
        endpoint = 'https://finnhub.io/api/v1/stock/market-status/losers'
        break
      case 'most-active':
        endpoint = 'https://finnhub.io/api/v1/stock/market-status/most-active'
        break
      default:
        return []
    }

    const response = await fetch(`${endpoint}?token=${FINNHUB_API_KEY}`)
    
    if (!response.ok) {
      return []
    }

    const data = await response.json()
    
    if (!data || !Array.isArray(data)) {
      return []
    }

    return data.slice(0, 10).map((item: {
      symbol: string
      description: string
      price: number
      change: number
      changePercent: number
      volume: number
    }) => ({
      symbol: item.symbol,
      name: item.description || item.symbol,
      price: item.price || 0,
      change: item.change || 0,
      changePercent: item.changePercent || 0,
      volume: item.volume || 0
    }))
  } catch (error) {
    console.log('Finnhub movers API failed:', error)
    return []
  }
}

async function getMoversFromYahooFinance(type: string): Promise<StockMover[]> {
  try {
    let endpoint = ''
    switch (type) {
      case 'gainers':
        endpoint = 'https://yahoo-finance1.p.rapidapi.com/market/v2/get-movers?region=US&lang=en&count=10&start=0'
        break
      case 'losers':
        endpoint = 'https://yahoo-finance1.p.rapidapi.com/market/v2/get-movers?region=US&lang=en&count=10&start=0'
        break
      case 'most-active':
        endpoint = 'https://yahoo-finance1.p.rapidapi.com/market/v2/get-movers?region=US&lang=en&count=10&start=0'
        break
      default:
        return []
    }

    const response = await fetch(endpoint, {
      headers: {
        'X-RapidAPI-Key': YAHOO_FINANCE_API_KEY,
        'X-RapidAPI-Host': 'yahoo-finance1.p.rapidapi.com'
      }
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    
    if (!data.finance || !data.finance.result) {
      return []
    }

    const movers = data.finance.result[0]?.quotes || []
    
    return movers.slice(0, 10).map((item: {
      symbol: string
      longName?: string
      shortName?: string
      regularMarketPrice: number
      regularMarketChange: number
      regularMarketChangePercent: number
      regularMarketVolume: number
    }) => ({
      symbol: item.symbol,
      name: item.longName || item.shortName || item.symbol,
      price: item.regularMarketPrice || 0,
      change: item.regularMarketChange || 0,
      changePercent: item.regularMarketChangePercent || 0,
      volume: item.regularMarketVolume || 0
    }))
  } catch (error) {
    console.log('Yahoo Finance movers API failed:', error)
    return []
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params

    if (!['gainers', 'losers', 'most-active'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type. Must be gainers, losers, or most-active' }, { status: 400 })
    }

    // Try to get real data from APIs
    const [finnhubResults, yahooResults] = await Promise.all([
      getMoversFromFinnhub(type),
      getMoversFromYahooFinance(type)
    ])

    let movers: StockMover[] = []

    // Use Finnhub results if available, otherwise Yahoo.
    if (finnhubResults.length > 0) {
      movers = finnhubResults
    } else if (yahooResults.length > 0) {
      movers = yahooResults
    }

    return NextResponse.json(movers.slice(0, 10)) // Return top 10

  } catch (error) {
    console.error('Error fetching movers:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
