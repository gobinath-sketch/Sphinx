import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/db';
import { User } from '@/lib/models';
import { signToken } from '@/lib/auth';
import { serialize } from 'cookie';
import { sendSignupCodeEmail } from '@/lib/email';

export async function POST(req: Request) {
    try {
        await dbConnect();
        const { email, password, full_name } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return NextResponse.json(
                { error: 'User already exists' },
                { status: 400 }
            );
        }

        const password_hash = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            email,
            password_hash,
            full_name,
        });

        const signupCode = String(Math.floor(100000 + Math.random() * 900000));
        try {
            await sendSignupCodeEmail(newUser.email, signupCode);
        } catch (mailError) {
            console.error('Signup email send failed:', mailError);
        }

        const token = signToken({ userId: newUser._id.toString(), email: newUser.email });

        const cookie = serialize('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7, // 1 week
            path: '/',
        });

        return NextResponse.json(
            { user: { id: newUser._id, email: newUser.email, full_name: newUser.full_name } },
            {
                status: 201,
                headers: { 'Set-Cookie': cookie },
            }
        );
    } catch (error) {
        console.error('Signup error:', error);
        return NextResponse.json(
            { error: 'Internal User Error' },
            { status: 500 }
        );
    }
}
