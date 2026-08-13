import { NextRequest, NextResponse } from "next/server";
import { missingConfig, readToken } from "../_shared/oauth";

export async function GET(req: NextRequest) {
  const missing = missingConfig();
  const token = await readToken(req);
  return NextResponse.json({
    configured: missing.length === 0,
    missing,
    connected: Boolean(token),
    email: token?.email ?? null,
    connectedAt: token?.connectedAt ?? null,
  });
}
