import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";

const TOKEN_COOKIE = "launchpad_gmail_token";
const STATE_COOKIE = "launchpad_gmail_oauth_state";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_PROFILE_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly openid email";

type RuntimeEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GMAIL_COOKIE_SECRET?: string;
};

export type StoredGoogleToken = {
  refreshToken: string;
  email?: string;
  connectedAt: string;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
  internalDate?: string;
};

export type GmailUpdate = {
  id: string;
  threadId: string;
  company: string;
  role: string;
  signal: string;
  status: "Applied" | "Assessment" | "Interview" | "Offer" | "Rejected";
  subject: string;
  from: string;
  date: string;
  snippet: string;
  confidence: "High" | "Medium" | "Review";
  sourceUrl: string;
};

export function getConfig() {
  const runtime = env as RuntimeEnv;
  const clientId = runtime.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = runtime.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  const cookieSecret = runtime.GMAIL_COOKIE_SECRET ?? process.env.GMAIL_COOKIE_SECRET;
  return { clientId, clientSecret, cookieSecret };
}

export function missingConfig() {
  const config = getConfig();
  const missing = [
    !config.clientId && "GOOGLE_CLIENT_ID",
    !config.clientSecret && "GOOGLE_CLIENT_SECRET",
    !config.cookieSecret && "GMAIL_COOKIE_SECRET",
  ].filter(Boolean);
  return missing as string[];
}

export function redirectUri(req: NextRequest) {
  return `${new URL(req.url).origin}/api/gmail/callback`;
}

function secureCookie(req: NextRequest) {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  return forwardedProto === "https" || new URL(req.url).protocol === "https:";
}

export function gmailAuthUrl(req: NextRequest, state: string) {
  const { clientId } = getConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId ?? "");
  url.searchParams.set("redirect_uri", redirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url;
}

export function setStateCookie(req: NextRequest, res: NextResponse, state: string) {
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
}

export function assertState(req: NextRequest, state: string | null) {
  const saved = req.cookies.get(STATE_COOKIE)?.value;
  if (!state || !saved || state !== saved) throw new Error("OAuth state did not match. Try connecting Gmail again.");
}

export function clearGmailCookies(res: NextResponse) {
  res.cookies.set(TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function setTokenCookie(req: NextRequest, res: NextResponse, token: StoredGoogleToken) {
  res.cookies.set(TOKEN_COOKIE, await seal(token), {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 120,
  });
}

export async function readToken(req: NextRequest) {
  const sealed = req.cookies.get(TOKEN_COOKIE)?.value;
  if (!sealed) return null;
  try {
    return await unseal<StoredGoogleToken>(sealed);
  } catch {
    return null;
  }
}

export async function exchangeCode(req: NextRequest, code: string) {
  const { clientId, clientSecret } = getConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId ?? "",
    client_secret: clientSecret ?? "",
    redirect_uri: redirectUri(req),
    grant_type: "authorization_code",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", body });
  const json = await response.json() as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!response.ok || !json.access_token) throw new Error(json.error_description ?? "Google token exchange failed.");
  return json;
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getConfig();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId ?? "",
    client_secret: clientSecret ?? "",
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", body });
  const json = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !json.access_token) throw new Error(json.error_description ?? "Could not refresh Gmail access.");
  return json.access_token;
}

export async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch(GOOGLE_PROFILE_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return {};
  return await response.json() as { email?: string };
}

export async function gmailUpdates(accessToken: string, days: string, mode: string, companies: string[], roles: string[]) {
  const lookback = Math.max(1, Math.min(90, Number(days) || 30));
  const base = `newer_than:${lookback}d -in:spam -in:trash`;
  const broad = `("thank you for applying" OR "thanks for applying" OR "application received" OR "your application" OR interview OR assessment OR recruiter OR recruiting)`;
  const scoped = [...companies, ...roles].filter(Boolean).slice(0, 10).map((value) => `"${value.replace(/"/g, "")}"`).join(" OR ");
  const q = `${base} ${mode === "applied" && scoped ? `(${scoped})` : broad}`;
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", q);
  listUrl.searchParams.set("maxResults", "80");
  const listResponse = await fetch(listUrl, { headers: { authorization: `Bearer ${accessToken}` } });
  const listJson = await listResponse.json() as { messages?: { id: string; threadId: string }[]; error?: { message?: string } };
  if (!listResponse.ok) throw new Error(listJson.error?.message ?? "Gmail search failed.");
  const messages = await Promise.all((listJson.messages ?? []).slice(0, 50).map(async (message) => {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`);
    url.searchParams.set("format", "metadata");
    url.searchParams.set("metadataHeaders", "Subject");
    url.searchParams.append("metadataHeaders", "From");
    url.searchParams.append("metadataHeaders", "Date");
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    return response.ok ? await response.json() as GmailMessage : null;
  }));
  return messages.filter((message): message is GmailMessage => Boolean(message)).map(toGmailUpdate);
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function toGmailUpdate(message: GmailMessage): GmailUpdate {
  const subject = header(message, "Subject");
  const from = header(message, "From");
  const date = header(message, "Date") || (message.internalDate ? new Date(Number(message.internalDate)).toUTCString() : "");
  const text = `${subject} ${message.snippet ?? ""}`.toLowerCase();
  const status: GmailUpdate["status"] = /reject|unfortunately|not move forward/.test(text) ? "Rejected" : /offer/.test(text) ? "Offer" : /interview|schedule|calendly/.test(text) ? "Interview" : /assessment|take-home|take home|coding challenge/.test(text) ? "Assessment" : "Applied";
  const signal = status === "Applied" ? "Application confirmation" : status === "Rejected" ? "Status update" : `${status} update`;
  const company = parseCompany(subject, from);
  const role = parseRole(subject, message.snippet ?? "");
  return {
    id: message.id,
    threadId: message.threadId,
    company,
    role,
    signal,
    status,
    subject,
    from,
    date,
    snippet: message.snippet ?? "",
    confidence: company !== "Unknown company" ? "High" : "Review",
    sourceUrl: `https://mail.google.com/mail/#all/${message.id}`,
  };
}

function parseCompany(subject: string, from: string) {
  const patterns = [
    /applying to ([^!.,]+)/i,
    /application to ([^!.,]+)/i,
    /sent to ([^!.,]+)/i,
    /thank you for applying to ([^!.,]+)/i,
  ];
  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  const sender = from.replace(/<[^>]+>/g, "").replace(/no-reply|noreply|hiring team|talent team/gi, "").trim();
  return sender || "Unknown company";
}

function parseRole(subject: string, snippet: string) {
  const text = `${subject} ${snippet}`;
  const patterns = [
    /for the ([^.!?]{4,90}?(?:engineer|manager|analyst|designer|scientist|specialist|associate|lead|intern|architect|developer|consultant|role|position))/i,
    /for our ([^.!?]{4,90}?(?:engineer|manager|analyst|designer|scientist|specialist|associate|lead|intern|architect|developer|consultant|role|position))/i,
    /to the ([^.!?]{4,90}?(?:engineer|manager|analyst|designer|scientist|specialist|associate|lead|intern|architect|developer|consultant|role|position))/i,
    /applied to ([^.!?]{4,90}?(?:engineer|manager|analyst|designer|scientist|specialist|associate|lead|intern|architect|developer|consultant|role|position))/i,
    /application for ([^.!?]{4,90}?(?:engineer|manager|analyst|designer|scientist|specialist|associate|lead|intern|architect|developer|consultant|role|position))/i,
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  return match?.[1]?.trim() ?? "Role not parsed";
}

async function seal(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await cryptoKey();
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
}

async function unseal<T>(value: string) {
  const [ivRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !encryptedRaw) throw new Error("Invalid sealed cookie.");
  const key = await cryptoKey();
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64url(ivRaw) }, key, fromBase64url(encryptedRaw));
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

async function cryptoKey() {
  const { cookieSecret } = getConfig();
  if (!cookieSecret || cookieSecret.length < 32) throw new Error("GMAIL_COOKIE_SECRET must be at least 32 characters.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cookieSecret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function base64url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
