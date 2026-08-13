import fs from "node:fs";
import zlib from "node:zlib";

const snapshotDir = "public/job-snapshot";
const manifestPath = `${snapshotDir}/manifest.json`;
const partSize = 760_000;
const usLocation = /United States|\bUS\b|\bUSA\b|Remote.*U\.?S|Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|San Francisco|Seattle|Boston|Austin|Chicago|Atlanta|Denver|Dallas|Houston|Phoenix|Philadelphia|Pittsburgh|Raleigh|Charlotte|Portland|Nashville|San Diego|San Jose|Los Angeles|Newark|Wilmington|Fremont|Boulder|Cambridge|Palo Alto|Santa Clara|Mountain View|Menlo Park|Redwood City|San Mateo|Miami|Tampa|Orlando|Detroit|Minneapolis|Salt Lake City|Provo|Las Vegas|Arlington|McLean|Reston|Lehi|Stamford|Cleveland|Carmel|Stennis Space Center|\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/i;
const nonUsLocation = /\b(Canada|United Kingdom|UK|Ireland|India|Japan|Singapore|Colombia|Mexico|MX|France|Germany|Netherlands|Estonia|Poland|Krakow|Dublin|Amsterdam|Bulgaria|Sofia|Spain|Portugal|Brazil|Argentina|Australia|New Zealand|Philippines|Indonesia|Malaysia|Thailand|Vietnam|China|Korea|Taiwan|Hong Kong|Israel|UAE|Dubai|South Africa|APAC|EMEA|Europe|Montreal|Toronto|Uruguay|Gurugram|London|England|Barcelona|Stockholm|Sweden|Roma|Rome|Italy|Napoli|Modena|Americas|North America)\b/i;

function cleanDisplayText(value = "") {
  let text = String(value);
  for (let i = 0; i < 3; i += 1) {
    text = text
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">")
      .replace(/\\u0026/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&nbsp;/gi, " ")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/\b(?:class|style|data-[\w-]+)=["'][^"']*["']/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/<[^>]*$/g, " ");
  }
  return text.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function canonicalUrl(value = "") {
  try {
    const url = new URL(String(value).replace(/^http:\/\//i, "https://"));
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gh_src|source|ref|referrer)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  } catch {
    return String(value).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").trim();
  }
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function userOpenableUrl(job) {
  const current = String(job.url || "").replace(/^http:\/\//i, "https://");
  if (!/api\.smartrecruiters\.com/i.test(current)) return current;
  const match = current.match(/api\.smartrecruiters\.com\/v1\/companies\/([^/]+)\/postings\/([^/?#]+)/i);
  if (!match) return current;
  return `https://jobs.smartrecruiters.com/${match[1]}/${match[2]}-${slugify(job.title || "")}`;
}

function stableKey(job) {
  const providerId = [job.source, job.id].filter(Boolean).join(":").toLowerCase();
  const url = canonicalUrl(job.url || "");
  const fallback = `${job.company || ""}|${job.title || ""}|${job.location || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return providerId || url || fallback;
}

function inferIsUs(job) {
  const location = String(job.location || "");
  const text = `${location} ${job.title || ""}`;
  if (nonUsLocation.test(location) && !/\bUnited States\b|\bU\.?S\.?\b|\bUSA\b/i.test(location)) return false;
  if (usLocation.test(text)) return true;
  if (/^(remote|hybrid|distributed|blank,blank,multiple locations)$/i.test(location)) return false;
  if (/^remote$/i.test(location)) return /us|united states|verified-seed|us-hiring-signal/i.test(`${job.companyEvidence || ""} ${job.confidence || ""}`);
  return job.isUs === false ? false : true;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const compressed = Buffer.concat(manifest.parts.map((part) => fs.readFileSync(`${snapshotDir}/${part}`)));
const rawJobs = JSON.parse(zlib.gunzipSync(compressed));
const seenProviderIds = new Set();

const jobs = rawJobs
  .map((job) => ({
    ...job,
    source: cleanDisplayText(job.source),
    company: cleanDisplayText(job.company),
    companySize: cleanDisplayText(job.companySize),
    sector: cleanDisplayText(job.sector),
    title: cleanDisplayText(job.title),
    category: cleanDisplayText(job.category),
    location: cleanDisplayText(job.location),
    type: cleanDisplayText(job.type),
    level: cleanDisplayText(job.level),
    salary: cleanDisplayText(job.salary),
    url: userOpenableUrl(job),
    summary: cleanDisplayText(job.summary),
    companyEvidence: cleanDisplayText(job.companyEvidence || "Verified official posting with a user-openable source link."),
    tags: Array.from(new Set((job.tags || []).map(cleanDisplayText).filter(Boolean))).slice(0, 8),
    isUs: inferIsUs(job),
  }))
  .filter((job) => job.company && job.title && job.location && /^https?:\/\//i.test(job.url))
  .filter((job) => {
    const providerKey = [job.source, job.id].filter(Boolean).join(":").toLowerCase();
    if (providerKey && seenProviderIds.has(providerKey)) return false;
    if (providerKey) seenProviderIds.add(providerKey);
    return true;
  })
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const json = JSON.stringify(jobs);
const nextCompressed = zlib.gzipSync(Buffer.from(json));
for (const part of manifest.parts || []) {
  const partPath = `${snapshotDir}/${part}`;
  if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
}

const parts = [];
for (let offset = 0; offset < nextCompressed.length; offset += partSize) {
  const part = `part-${String(parts.length + 1).padStart(3, "0")}.json.gz`;
  fs.writeFileSync(`${snapshotDir}/${part}`, nextCompressed.subarray(offset, offset + partSize));
  parts.push(part);
}

fs.writeFileSync("public/jobs-data.json", "[]");
fs.writeFileSync("app/jobs-data.json", "[]");
fs.writeFileSync(manifestPath, `${JSON.stringify({
  encoding: "gzip",
  generatedAt: new Date().toISOString(),
  jobs: jobs.length,
  parts,
  bytes: nextCompressed.length,
  sourceBytes: Buffer.byteLength(json),
}, null, 2)}\n`);

console.log(JSON.stringify({
  before: rawJobs.length,
  after: jobs.length,
  removed: rawJobs.length - jobs.length,
  companies: new Set(jobs.map((job) => job.company)).size,
}, null, 2));
