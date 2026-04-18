import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { Portfolio } from '@/lib/models'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; symbol: string }> }
) {
  try {
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, symbol } = await params

    // Validate that the user can only access their own portfolio
    if (userId !== userPayload.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await dbConnect()
    const row = await Portfolio.findOne({ user_id: userId, symbol: symbol.toUpperCase() })
    if (!row) return NextResponse.json({ error: 'Portfolio item not found' }, { status: 404 })
    const shares = Number(row.shares ?? 0)
    const averagePrice = Number(row.average_price ?? 0)
    const currentPrice = averagePrice
    const totalValue = shares * currentPrice
    const gainLoss = (currentPrice - averagePrice) * shares
    const gainLossPercent = averagePrice > 0 ? (gainLoss / (averagePrice * shares)) * 100 : 0
    return NextResponse.json({
      symbol: row.symbol,
      shares,
      averagePrice,
      currentPrice,
      totalValue,
      gainLoss,
      gainLossPercent,
    })

  } catch (error) {
    console.error('Error fetching portfolio item:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; symbol: string }> }
) {
  try {
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, symbol } = await params

    // Validate that the user can only update their own portfolio
    if (userId !== userPayload.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await dbConnect()
    const body = await request.json()
    const { shares, price } = body
    const sharesNum = Number(shares)
    const priceNum = Number(price)
    if (!Number.isFinite(sharesNum) || sharesNum < 0 || !Number.isFinite(priceNum) || priceNum <= 0) {
      return NextResponse.json({ error: 'Invalid shares or price' }, { status: 400 })
    }
    const updated = await Portfolio.findOneAndUpdate(
      { user_id: userId, symbol: symbol.toUpperCase() },
      { shares: sharesNum, average_price: priceNum },
      { new: true }
    )
    if (!updated) return NextResponse.json({ error: 'Portfolio item not found' }, { status: 404 })
    return NextResponse.json({ message: 'Portfolio item updated', data: updated })

  } catch (error) {
    console.error('Error updating portfolio item:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; symbol: string }> }
) {
  try {
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, symbol } = await params

    // Validate that the user can only delete their own portfolio items
    if (userId !== userPayload.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await dbConnect()
    const deleted = await Portfolio.findOneAndDelete({ user_id: userId, symbol: symbol.toUpperCase() })
    if (!deleted) return NextResponse.json({ error: 'Portfolio item not found' }, { status: 404 })
    return NextResponse.json({ message: 'Portfolio item deleted', data: { symbol: symbol.toUpperCase() } })

  } catch (error) {
    console.error('Error deleting portfolio item:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
