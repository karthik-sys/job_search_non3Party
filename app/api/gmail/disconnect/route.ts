import { NextResponse } from "next/server";
import { clearGmailCookies } from "../_shared/oauth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearGmailCookies(res);
  return res;
}
