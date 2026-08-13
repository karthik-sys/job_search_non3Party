import { NextRequest, NextResponse } from "next/server";
import { gmailAuthUrl, missingConfig, setStateCookie } from "../_shared/oauth";

export async function GET(req: NextRequest) {
  const missing = missingConfig();
  if (missing.length) {
    return NextResponse.json({ error: `Gmail OAuth is not configured. Missing: ${missing.join(", ")}` }, { status: 503 });
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(gmailAuthUrl(req, state));
  setStateCookie(res, state);
  return res;
}
