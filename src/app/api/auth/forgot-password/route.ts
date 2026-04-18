import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import dbConnect from '@/lib/db';
import { User } from '@/lib/models';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
    try {
        await dbConnect();
        const { email } = await request.json();

        const user = await User.findOne({ email });
        if (!user) {
            // Return success even if user not found to prevent enumeration
            return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });
        }

        const token = randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour

        user.reset_token = token;
        user.reset_token_expires = expires;
        await user.save();

        const siteUrl =
            process.env.NEXT_PUBLIC_SITE_URL ||
            process.env.NEXTAUTH_URL ||
            `${request.nextUrl.protocol}//${request.nextUrl.host}`;
        const resetLink = `${siteUrl}/reset-password?token=${token}`;
        await sendPasswordResetEmail(email, resetLink);

        return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });

    } catch (error) {
        console.error('Forgot password error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
