import { type NextRequest, NextResponse } from "next/server";

// Temporary maintenance gate: blocks pages, login actions, and all API routes.
export function proxy(req: NextRequest) {
  if (process.env.MAINTENANCE_MODE === "off") {
    if (req.nextUrl.pathname === "/") {
      const destination = req.cookies.has("auth_session") ? "/chat" : "/start/log-in";
      return NextResponse.redirect(new URL(destination, req.url));
    }
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith("/api/") || req.method !== "GET" && req.method !== "HEAD") {
    return NextResponse.json({ error: "Service temporarily unavailable for maintenance" },
      { status: 503, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
  }
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Converse · Under maintenance</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#eef2ff;font-family:system-ui,sans-serif}main{max-width:540px;padding:40px}p{color:#b7c2db;line-height:1.7}small{color:#8ba5ff;letter-spacing:.16em}h1{font-size:clamp(32px,6vw,48px);line-height:1.15}</style></head><body><main><small>CONVERSE</small><h1>We’ll be back soon.</h1><p>Converse is temporarily under maintenance. Login and chat are paused while we make improvements.</p><p>Thank you for your patience. Please check back later.</p></main></body></html>`, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "3600", "Cache-Control": "no-store" },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
