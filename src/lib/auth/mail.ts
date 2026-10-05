// Account emails (sign-in codes, password reset links) through Resend. Without RESEND_API_KEY nothing is sent: the
// message is logged instead, so local development still works (the code or link is in the server log).
import { Resend } from "resend";

let client: Resend | null = null;
const resend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

const BRASS = "#c9a45c";
const page = (title: string, body: string) => `<!doctype html>
<html><body style="margin:0;background:#12100e;font-family:Georgia,serif;color:#e8dfcc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;border:1px solid ${BRASS};padding:28px">
<tr><td style="font-size:22px;letter-spacing:3px;color:${BRASS};padding-bottom:16px">GUESSLOCK</td></tr>
<tr><td style="font-size:18px;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${body}</td></tr>
<tr><td style="font-size:12px;color:#8c8478;padding-top:24px">If you didn't ask for this, ignore this email: nothing changes.</td></tr>
</table></td></tr></table></body></html>`;

async function send(to: string, subject: string, html: string, text: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[mail] RESEND_API_KEY is not set; not sending "${subject}" to ${to}:\n${text}`);
    return;
  }
  const from = process.env.MAIL_FROM || "GUESSLOCK <noreply@guesslock.paulkuehn.ch>";
  const { error } = await resend().emails.send({ from, to, subject, html, text });
  if (error) {
    console.error("[mail] sending failed", { subject, name: error.name, message: error.message });
    throw new Error("Could not send the email.");
  }
}

export function sendSignInCode(to: string, code: string) {
  return send(
    to, `Your GUESSLOCK code: ${code}`,
    page("Your sign-in code", `Enter this code to sign in. It works for 5 minutes.<br><br><span style="font-family:monospace;font-size:28px;letter-spacing:6px;color:${BRASS}">${code}</span>`),
    `Your GUESSLOCK sign-in code: ${code}\nIt works for 5 minutes.`,
  );
}

export function sendResetLink(to: string, url: string) {
  return send(
    to, "Reset your GUESSLOCK password",
    page("Reset your password", `Open this link to choose a new password. It works for 15 minutes.<br><br><a href="${url}" style="color:${BRASS}">Choose a new password</a>`),
    `Open this link to choose a new GUESSLOCK password (it works for 15 minutes):\n${url}`,
  );
}
