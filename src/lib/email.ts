import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com'
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || '587', 10)
const SMTP_SECURE = (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER

function canSendEmail(): boolean {
  return Boolean(SMTP_USER && SMTP_PASS && SMTP_FROM)
}

function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  text?: string
}) {
  if (!canSendEmail()) {
    console.warn('SMTP is not fully configured. Skipping email send.')
    return { sent: false, reason: 'smtp_not_configured' as const }
  }

  const transporter = createTransporter()
  await transporter.sendMail({
    from: SMTP_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  })

  return { sent: true as const }
}

export async function sendSignupCodeEmail(to: string, code: string) {
  const subject = 'Your Mastermind sign-up code'
  const text = `Your sign-up verification code is: ${code}.`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2>Welcome to Mastermind</h2>
      <p>Your sign-up verification code is:</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 3px;">${code}</p>
      <p>If you did not create this account, please ignore this email.</p>
    </div>
  `
  return sendEmail({ to, subject, text, html })
}

export async function sendPasswordResetEmail(to: string, resetLink: string) {
  const subject = 'Reset your Mastermind password'
  const text = `Reset your password using this link: ${resetLink}`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2>Password reset request</h2>
      <p>We received a request to reset your password.</p>
      <p>
        <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
          Reset Password
        </a>
      </p>
      <p>If the button does not work, use this URL:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>This link expires in 1 hour.</p>
    </div>
  `
  return sendEmail({ to, subject, text, html })
}
