import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    const userPayload = token ? verifyToken(token) : null;

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    await sendEmail({
      to: email,
      subject: 'You are invited to Mastermind',
      text: `${userPayload.email} invited you to join Mastermind.`,
      html: `<p><strong>${userPayload.email}</strong> invited you to join Mastermind.</p><p>Open the app and sign up to continue.</p>`,
    });

    return NextResponse.json({ success: true, message: 'Invitation sent' });

  } catch (error) {
    console.error('Error sending invite:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
