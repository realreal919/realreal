import nodemailer from "nodemailer"

const CLIENT_ID = process.env.GMAIL_CLIENT_ID
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN
const FROM = process.env.GMAIL_FROM ?? "love@realreal.cc"

let transporter: nodemailer.Transporter | null = null

if (CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: FROM,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
    },
  })
  console.log("[email] Gmail SMTP configured for", FROM)
} else {
  console.warn("[email] Gmail credentials not set — emails will be logged but not sent")
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!transporter) {
    console.warn(`[email] Skipping send (no Gmail config): to=${to} subject="${subject}"`)
    return
  }

  try {
    await transporter.sendMail({
      from: `誠真生活 RealReal <${FROM}>`,
      to,
      subject,
      html,
    })
    console.log(`[email] Sent: to=${to} subject="${subject}"`)
  } catch (err) {
    console.error(`[email] Failed to send: to=${to} subject="${subject}"`, err)
    throw err
  }
}
