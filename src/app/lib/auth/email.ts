import { Resend, type Response as ResendResponse } from "resend";

class AuthResend extends Resend {
  // The SDK's default transport logs raw API errors in development. Keep the
  // SDK's email serialization/auth headers, but handle failures without them.
  override async fetchRequest<T>(path: string, options: RequestInit = {}): Promise<ResendResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, options);
    if (!response.ok) {
      return {
        data: null,
        error: { name: "application_error", message: "provider_rejected", statusCode: response.status },
        headers: null,
      };
    }
    return { data: await response.json() as T, error: null, headers: null };
  }
}

export function appUrl(path: string) {
  const origin = process.env.APP_URL
    || (process.env.NODE_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined)
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
    || "http://localhost:3000";
  return new URL(path, origin).toString();
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

async function send(email: string, subject: string, text: string, html: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error("Auth email failed: missing_configuration");
    return;
  }
  try {
    const { error } = await new AuthResend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM, to: email, subject, text, html,
    });
    // Provider messages can contain recipient addresses; log a fixed reason only.
    if (error) console.error("Auth email failed: provider_rejected");
  } catch {
    console.error("Auth email failed: transport_error");
  }
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = appUrl(`/start/verify-email?token=${encodeURIComponent(token)}`);
  await send(email, "Confirm your Converse email",
    `Confirm your email to finish creating your Converse account: ${url}\nThis link expires in 24 hours. If you did not request it, ignore this email.`,
    `<p>Confirm your email to finish creating your Converse account.</p><p><a href="${escapeHtml(url)}">Confirm my email</a></p><p>This link expires in 24 hours. If you did not request it, ignore this email.</p>`);
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = appUrl(`/start/reset-password?token=${encodeURIComponent(token)}`);
  await send(email, "Reset your Converse password",
    `Reset your Converse password: ${url}\nThis link expires in 30 minutes. If you did not request it, ignore this email.`,
    `<p>Reset your Converse password.</p><p><a href="${escapeHtml(url)}">Reset my password</a></p><p>This link expires in 30 minutes. If you did not request it, ignore this email.</p>`);
}

export async function sendAccountExistsEmail(email: string) {
  const login = appUrl("/start/log-in");
  const reset = appUrl("/start/forgot-password");
  await send(email, "Your Converse account",
    `You already have a Converse account. Log in: ${login}\nForgot your password? ${reset}\nIf you did not request this email, ignore it.`,
    `<p>You already have a Converse account.</p><p><a href="${escapeHtml(login)}">Log in</a> or <a href="${escapeHtml(reset)}">reset your password</a>.</p><p>If you did not request this email, ignore it.</p>`);
}
