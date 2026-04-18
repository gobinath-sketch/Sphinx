import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { Portfolio } from '@/lib/models'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId } = await params

    // Validate that the user can only access their own portfolio
    if (userId !== userPayload.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await dbConnect()
    const rows = await Portfolio.find({ user_id: userId }).sort({ updatedAt: -1 })
    const payload = rows.map((row) => {
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
