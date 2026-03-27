import { Resend } from "resend"

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) throw new Error("Missing RESEND_API_KEY")

export const resend = new Resend(apiKey)

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const { error } = await resend.emails.send({
    from: "誠真生活 RealReal <noreply@realreal.cc>",
    to,
    subject,
    html,
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}
