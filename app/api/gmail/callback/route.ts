import { NextRequest, NextResponse } from "next/server";
import { assertState, clearGmailCookies, exchangeCode, fetchGoogleProfile, setTokenCookie } from "../_shared/oauth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const redirect = NextResponse.redirect(new URL("/?gmail=connected", req.url));
  try {
    if (error) {
      const message = error === "access_denied"
        ? "Google did not grant access. If this OAuth app is still in Testing, add your Gmail account as a test user in Google Cloud, then try Link Gmail again."
        : errorDescription || error;
      throw new Error(message);
    }
    if (!code) throw new Error("Google returned without an authorization code. Try Link Gmail again; if it repeats, confirm the redirect URI exactly matches this app's /api/gmail/callback URL.");
    assertState(req, state);
    const token = await exchangeCode(req, code);
    if (!token.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve offline access.");
    const profile = await fetchGoogleProfile(token.access_token!);
    clearGmailCookies(redirect);
    await setTokenCookie(req, redirect, { refreshToken: token.refresh_token, email: profile.email, connectedAt: new Date().toISOString() });
    return redirect;
  } catch (e) {
    const failure = NextResponse.redirect(new URL(`/?gmail=error&message=${encodeURIComponent(e instanceof Error ? e.message : "Gmail connection failed")}`, req.url));
    clearGmailCookies(failure);
    return failure;
  }
}
