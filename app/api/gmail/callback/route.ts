import { NextRequest, NextResponse } from "next/server";
import { assertState, clearGmailCookies, exchangeCode, fetchGoogleProfile, setTokenCookie } from "../_shared/oauth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const redirect = NextResponse.redirect(new URL("/?gmail=connected", req.url));
  try {
    if (error) throw new Error(error);
    if (!code) throw new Error("Google did not return an authorization code.");
    assertState(req, state);
    const token = await exchangeCode(req, code);
    if (!token.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve offline access.");
    const profile = await fetchGoogleProfile(token.access_token!);
    clearGmailCookies(redirect);
    await setTokenCookie(redirect, { refreshToken: token.refresh_token, email: profile.email, connectedAt: new Date().toISOString() });
    return redirect;
  } catch (e) {
    const failure = NextResponse.redirect(new URL(`/?gmail=error&message=${encodeURIComponent(e instanceof Error ? e.message : "Gmail connection failed")}`, req.url));
    clearGmailCookies(failure);
    return failure;
  }
}
