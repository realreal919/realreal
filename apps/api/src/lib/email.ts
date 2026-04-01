import { Resend } from "resend"

const apiKey = process.env.RESEND_API_KEY

let resend: Resend | null = null
if (apiKey) {
  resend = new Resend(apiKey)
} else {
  console.warn("[email] RESEND_API_KEY is not set — emails will be logged but not sent")
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!resend) {
    console.warn(`[email] Skipping send (no RESEND_API_KEY): to=${to} subject="${subject}"`)
    return
  }

  const { error } = await resend.emails.send({
    from: "誠真生活 RealReal <noreply@realreal.cc>",
    to,
    subject,
    html,
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}
