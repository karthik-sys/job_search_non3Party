import fs from "node:fs";
import zlib from "node:zlib";

const snapshotDir = "public/job-snapshot";
const manifestPath = `${snapshotDir}/manifest.json`;
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const compressed = Buffer.concat(manifest.parts.map((part) => fs.readFileSync(`${snapshotDir}/${part}`)));
const jobs = JSON.parse(zlib.gunzipSync(compressed));

const usLocation = /United States|\bUS\b|\bUSA\b|Remote\b|Remote.*U\.?S|California|New York|Texas|Washington|Massachusetts|Virginia|Colorado|Illinois|Georgia|Florida|Maryland|Pennsylvania|Oregon|Arizona|North Carolina|District of Columbia|San Francisco|Seattle|Boston|Austin|Chicago|Atlanta|Denver|Dallas|Houston|Phoenix|Philadelphia|Pittsburgh|Raleigh|Charlotte|Portland|Nashville|San Diego|San Jose|Los Angeles|Newark|Wilmington|Fremont|Boulder|Cambridge|Palo Alto|Santa Clara|Mountain View|Menlo Park|Redwood City|San Mateo|Miami|Tampa|Orlando|Detroit|Minneapolis|Salt Lake City|Provo|Las Vegas|Arlington|McLean|Reston|\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/i;
const htmlLeak = /<\/?[a-z][^>]*>|\\u003c|\b(?:div|span|p|section)\s+class\s*=|&lt;|&gt;/i;
const apiOnlyUrl = /api\.smartrecruiters\.com|boards-api\.greenhouse\.io/i;

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

const byProviderId = new Map();
const byUrl = new Map();
const byFingerprint = new Map();
const issues = [];
const geographyWarnings = [];

for (const job of jobs) {
  const url = String(job.url || "").trim();
  const providerId = `${job.source || ""}:${job.id || ""}`.toLowerCase().trim();
  const fingerprint = `${job.company || ""}|${job.title || ""}|${job.location || ""}`.toLowerCase().replace(/\s+/g, " ").trim();
  if (!job.company || !job.title || !job.location || !url) issues.push({ id: job.id, issue: "missing required display/source field" });
  if (url && !/^https?:\/\//i.test(url)) issues.push({ id: job.id, issue: "invalid source url", url });
  if (apiOnlyUrl.test(url)) issues.push({ id: job.id, issue: "source url is API-only, not a human job posting", url });
  if (!job.companyEvidence) issues.push({ id: job.id, issue: "missing audit evidence" });
  if (htmlLeak.test(`${job.title || ""} ${job.summary || ""} ${job.companyEvidence || ""} ${(job.tags || []).join(" ")}`)) issues.push({ id: job.id, issue: "html leaked into display text" });
  if (job.isUs !== false && !usLocation.test(String(job.location || "")) && geographyWarnings.length < 50) geographyWarnings.push({ id: job.id, issue: "US-default row has weak US location signal", location: job.location });
  if (providerId !== ":") byProviderId.set(providerId, (byProviderId.get(providerId) || 0) + 1);
  if (url) byUrl.set(canonicalUrl(url), (byUrl.get(canonicalUrl(url)) || 0) + 1);
  if (fingerprint) byFingerprint.set(fingerprint, (byFingerprint.get(fingerprint) || 0) + 1);
}

const duplicateProviderIds = [...byProviderId.entries()].filter(([, count]) => count > 1);
const duplicateUrls = [...byUrl.entries()].filter(([, count]) => count > 1);
const duplicateFingerprints = [...byFingerprint.entries()].filter(([, count]) => count > 1);
const companies = new Set(jobs.map((job) => job.company).filter(Boolean));
const sectors = Object.fromEntries([...jobs.reduce((counts, job) => {
  counts.set(job.sector, (counts.get(job.sector) || 0) + 1);
  return counts;
}, new Map()).entries()].sort((a, b) => b[1] - a[1]));

const report = {
  generatedAt: new Date().toISOString(),
  jobs: jobs.length,
  hiringCompanies: companies.size,
  usRows: jobs.filter((job) => job.isUs !== false).length,
  internationalRows: jobs.filter((job) => job.isUs === false).length,
  manifestParts: manifest.parts.length,
  duplicateProviderIds: duplicateProviderIds.length,
  duplicateUrls: duplicateUrls.length,
  duplicateCompanyTitleLocation: duplicateFingerprints.length,
  issues: issues.slice(0, 50),
  issueCount: issues.length,
  geographyWarnings,
  geographyWarningCount: jobs.filter((job) => job.isUs !== false && !usLocation.test(String(job.location || ""))).length,
  sectors,
};

fs.mkdirSync("outputs", { recursive: true });
fs.writeFileSync("outputs/job-snapshot-audit.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (
  duplicateProviderIds.length ||
  issues.length
) {
  process.exitCode = 1;
}
