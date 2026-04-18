import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { Portfolio } from '@/lib/models'

export async function GET(request: NextRequest) {
  try {
    await dbConnect()

    // Check authentication
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const portfolioRows = await Portfolio.find({ user_id: userPayload.userId }).sort({ updatedAt: -1 })
    const payload = portfolioRows.map((row) => {
      const shares = Number(row.shares ?? 0)
      const averagePrice = Number(row.average_price ?? 0)
      const currentPrice = averagePrice
      const totalValue = shares * currentPrice
      const gainLoss = (currentPrice - averagePrice) * shares
      const gainLossPercent = averagePrice > 0 ? (gainLoss / (averagePrice * shares)) * 100 : 0
      return {
        symbol: row.symbol,
        shares,
        averagePrice,
        currentPrice,
        totalValue,
        gainLoss,
        gainLossPercent,
      }
    })

    return NextResponse.json(payload)

  } catch (error) {
    console.error('Error fetching portfolio:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect()

    // Check authentication
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { symbol, shares, price } = body

    if (!symbol || !shares || !price) {
      return NextResponse.json({ error: 'Symbol, shares, and price are required' }, { status: 400 })
    }

    const symbolUpper = String(symbol).toUpperCase()
    const sharesNum = Number(shares)
    const priceNum = Number(price)
    if (!Number.isFinite(sharesNum) || sharesNum <= 0 || !Number.isFinite(priceNum) || priceNum <= 0) {
      return NextResponse.json({ error: 'Shares and price must be positive numbers' }, { status: 400 })
    }

    const existing = await Portfolio.findOne({ user_id: userPayload.userId, symbol: symbolUpper })
    if (existing) {
      const oldShares = Number(existing.shares ?? 0)
      const oldAvg = Number(existing.average_price ?? 0)
      const totalShares = oldShares + sharesNum
      const weightedAvg = totalShares > 0 ? ((oldShares * oldAvg) + (sharesNum * priceNum)) / totalShares : priceNum
      existing.shares = totalShares
      existing.average_price = weightedAvg
      await existing.save()
      return NextResponse.json({ message: 'Portfolio position updated', data: existing })
    }

    const created = await Portfolio.create({
      user_id: userPayload.userId,
      symbol: symbolUpper,
      shares: sharesNum,
      average_price: priceNum,
    })

    return NextResponse.json({ message: 'Stock added to portfolio', data: created })

  } catch (error) {
    console.error('Error adding to portfolio:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
