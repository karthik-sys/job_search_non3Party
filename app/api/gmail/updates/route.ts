import { NextRequest, NextResponse } from "next/server";
import { gmailUpdates, missingConfig, readToken, refreshAccessToken } from "../_shared/oauth";

export async function POST(req: NextRequest) {
  const missing = missingConfig();
  if (missing.length) return NextResponse.json({ error: `Gmail OAuth is not configured. Missing: ${missing.join(", ")}` }, { status: 503 });
  const token = await readToken(req);
  if (!token) return NextResponse.json({ error: "Gmail is not connected.", connected: false }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({})) as { days?: string; mode?: string; companies?: string[]; roles?: string[] };
    const accessToken = await refreshAccessToken(token.refreshToken);
    const updates = await gmailUpdates(accessToken, body.days ?? "30", body.mode ?? "all", body.companies ?? [], body.roles ?? []);
    return NextResponse.json({ connected: true, email: token.email, updates });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not scan Gmail." }, { status: 500 });
  }
}
