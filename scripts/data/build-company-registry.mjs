import fs from "node:fs";

const TARGET = 5000;
const SIZE_ORDER = ["Startup", "Small", "Medium", "Large", "Enterprise", "Unknown"];
const SECTOR_QUOTAS = new Map([
  ["Healthcare Systems", 380],
  ["Retail & Commerce", 380],
  ["Manufacturing & Industrials", 380],
  ["Logistics & Transportation", 340],
  ["Hospitality & Food Service", 320],
  ["Energy & Utilities", 320],
  ["Construction & Infrastructure", 320],
  ["Education", 280],
  ["Finance & Insurance", 360],
  ["Government Contractors", 300],
  ["Media & Entertainment", 280],
  ["Local & Regional Employers", 500],
  ["Enterprise Software & Cloud", 360],
  ["AI & Developer Tools", 220],
  ["Consumer Technology", 240],
  ["Cybersecurity", 180],
  ["Defense & Aerospace", 180],
  ["Automotive & Robotics", 180],
  ["Climate & Infrastructure", 220],
  ["Gaming & Interactive", 160],
  ["Other US Companies", 300],
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function normalizeSector(value, hints = []) {
  const text = `${value || ""} ${hints.join(" ")}`.toLowerCase();
  if (/hospital|health system|healthcare|medical center|clinic|clinical|care provider|pharma|biotech|life sciences|dental|therapy|nursing/.test(text)) return "Healthcare Systems";
  if (/retail|commerce|merchant|merchandising|grocery|store|apparel|fashion|consumer packaged|e-commerce|marketplace|home goods|furniture/.test(text)) return "Retail & Commerce";
  if (/manufactur|industrial|factory|materials|chemicals|packaging|semiconductor|electronics|machinery|steel|metals|automotive supplier/.test(text)) return "Manufacturing & Industrials";
  if (/logistics|transportation|shipping|freight|trucking|rail|airline|delivery|supply chain|warehouse|fulfillment|ports/.test(text)) return "Logistics & Transportation";
  if (/hospitality|hotel|restaurant|food service|travel|tourism|resort|casino|dining|coffee|beverage/.test(text)) return "Hospitality & Food Service";
  if (/utility|utilities|energy|electric|natural gas|oil|solar|wind|renewable|power|grid|water|wastewater/.test(text)) return "Energy & Utilities";
  if (/construction|infrastructure|engineering services|architecture|real estate|housing|building|contractor|civil|facilities/.test(text)) return "Construction & Infrastructure";
  if (/education|university|college|school|learning|edtech|training/.test(text)) return "Education";
  if (/bank|finance|financial|investment|insurance|payments|lending|mortgage|wealth|credit union|crypto|fintech/.test(text)) return "Finance & Insurance";
  if (/government contractor|federal|defense|aerospace|military|public sector|homeland|dod|space/.test(text)) return "Government Contractors";
  if (/media|entertainment|streaming|news|publishing|music|film|television|sports|advertising|creator/.test(text)) return "Media & Entertainment";
  if (/local|regional|municipal|county|city|chamber|community|nonprofit|services/.test(text)) return "Local & Regional Employers";
  if (/security|cyber|identity|fraud/.test(text)) return "Cybersecurity";
  if (/game|gaming|unity|unreal|console|mobile/.test(text)) return "Gaming & Interactive";
  if (/climate|carbon|sustainability|environment|weather|agriculture|food & agriculture/.test(text)) return "Climate & Infrastructure";
  if (/aerospace|space|satellite|aviation/.test(text)) return "Defense & Aerospace";
  if (/robot|automotive|vehicle|autonomous/.test(text)) return "Automotive & Robotics";
  if (/consumer|social|mobile app|lifestyle/.test(text)) return "Consumer Technology";
  if (/data|technology|software|it services|cloud|saas|developer|consulting|research/.test(text)) return "Enterprise Software & Cloud";
  return "Other US Companies";
}

function sizeFromEmployees(value) {
  const text = String(value || "").replace(/,/g, "");
  const numbers = text.match(/\d+/g)?.map(Number) || [];
  const max = Math.max(0, ...numbers);
  if (!max) return "Unknown";
  if (max <= 10) return "Startup";
  if (max <= 200) return "Small";
  if (max <= 1000) return "Medium";
  if (max <= 5000) return "Large";
  return "Enterprise";
}

function sizeFromRank(rank) {
  const n = Number(rank);
  if (!Number.isFinite(n)) return "Medium";
  if (n <= 500) return "Medium";
  if (n <= 2000) return "Small";
  return "Startup";
}

function providerFromLinks(links) {
  const joined = links.join(" ");
  if (/greenhouse\.io/.test(joined)) return "greenhouse";
  if (/lever\.co/.test(joined)) return "lever";
  if (/ashbyhq\.com/.test(joined)) return "ashby";
  if (/workdayjobs\.com|myworkdayjobs\.com/.test(joined)) return "workday";
  if (/smartrecruiters\.com/.test(joined)) return "smartrecruiters";
  if (/breezy\.hr/.test(joined)) return "breezy";
  if (/icims\.com/.test(joined)) return "icims";
  return links.length ? "careers-site" : "unknown";
}

function sourceWeight(entry) {
  const providerScore = {
    greenhouse: 36,
    ashby: 34,
    lever: 32,
    smartrecruiters: 28,
    workday: 18,
    icims: 18,
    breezy: 16,
    "careers-site": 10,
    unknown: 0,
  }[entry.provider || "unknown"] || 0;
  const confidenceScore = {
    "verified-seed": 80,
    "us-hiring-signal": 55,
    "us-directory": 35,
    "us-growth-company": 30,
    "ats-enriched-candidate": 20,
  }[entry.confidence || ""] || 0;
  const sizeScore = { Enterprise: 10, Large: 8, Medium: 6, Small: 4, Startup: 3, Unknown: 0 }[entry.size || "Unknown"] || 0;
  return providerScore + confidenceScore + sizeScore + (entry.website ? 3 : 0) + (entry.careersLinks?.length ? 4 : 0);
}

function add(registry, entry) {
  const key = slugify(entry.name);
  if (!key || registry.has(key)) return;
  registry.set(key, {
    id: key,
    name: entry.name,
    website: normalizeUrl(entry.website),
    sector: entry.sector,
    size: entry.size,
    location: entry.location || "United States",
    state: entry.state || "",
    source: entry.source,
    provider: entry.provider || "unknown",
    careersLinks: entry.careersLinks || [],
    confidence: entry.confidence,
    notes: entry.notes || "",
    score: sourceWeight(entry),
  });
}

const registry = new Map();

const sectorStarters = JSON.parse(fs.readFileSync("app/sector-starter-companies.json", "utf8"));
for (const company of sectorStarters) {
  add(registry, {
    ...company,
    source: "Curated US sector starter pack",
    provider: "careers-site",
    careersLinks: company.website ? [company.website] : [],
    confidence: "sector-starter",
    notes: "Free/public careers-page seed for local forkable coverage.",
  });
}

const seedRows = fs.readFileSync("work/direct-company-seeds.tsv", "utf8").trim().split("\n").slice(1);
for (const line of seedRows) {
  const [company, sector, ats, slug] = line.split("\t");
  add(registry, {
    name: company,
    website: "",
    sector,
    size: "Large",
    source: "Curated direct-feed seed",
    provider: ats,
    careersLinks: ats === "ashby" ? [`https://jobs.ashbyhq.com/${slug}`] : [`https://boards.greenhouse.io/${slug}`],
    confidence: "verified-seed",
  });
}

const usCsv = fs.readFileSync("work/modelearth-us-companies.csv", "utf8");
const [headers, ...usRows] = parseCsv(usCsv);
const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
for (const row of usRows) {
  const name = row[headerIndex.company_name];
  if (!name) continue;
  const category = row[headerIndex.company_category];
  add(registry, {
    name,
    website: row[headerIndex.url],
    sector: normalizeSector(category, [row[headerIndex.description_short], row[headerIndex.description]]),
    size: sizeFromEmployees(row[headerIndex.full_time_employees]),
    location: [row[headerIndex.city], row[headerIndex.state]].filter(Boolean).join(", ") || "United States",
    state: row[headerIndex.state],
    source: "ModelEarth US company directory",
    confidence: "us-directory",
    notes: category,
  });
}

const openJobs = JSON.parse(fs.readFileSync("work/openjobs-companies-v2.json", "utf8"));
const openJobsRanked = openJobs
  .map((company) => ({
    company,
    score:
      (company.countries?.includes("United States") ? 80 : 0) +
      (company.ats_links?.length ? 30 : 0) +
      (company.industry_category === "tech" ? 20 : 0) +
      Math.min(15, company.countries?.length || 0),
  }))
  .sort((a, b) => b.score - a.score);

for (const { company } of openJobsRanked) {
  const hasUsSignal = company.countries?.includes("United States");
  if (!hasUsSignal && !company.ats_links?.length) continue;
  add(registry, {
    name: company.name,
    website: company.website,
    sector: normalizeSector(company.industry_category, [...(company.tech_stack || []), ...(company.game_genre || [])]),
    size: hasUsSignal ? "Medium" : "Unknown",
    source: hasUsSignal ? "OpenJobs US hiring signal" : "OpenJobs ATS/company index",
    provider: providerFromLinks(company.ats_links || []),
    careersLinks: company.ats_links || [],
    confidence: hasUsSignal ? "us-hiring-signal" : "ats-enriched-candidate",
    notes: (company.tech_stack || []).slice(0, 5).join(", "),
  });
}

const inc = JSON.parse(fs.readFileSync("work/inc5000-2016-companies.json", "utf8"));
const incRows = Object.values(inc).flat().filter((row) => Array.isArray(row) && row.length >= 7);
for (const row of incRows) {
  const [rank, name, growth, revenue, industry, state, metro] = row;
  add(registry, {
    name,
    website: "",
    sector: normalizeSector(industry),
    size: sizeFromRank(rank),
    location: metro || state || "United States",
    state,
    source: "Inc. 5000 growth company list",
    confidence: "us-growth-company",
    notes: [industry, revenue, growth && `${growth} growth`].filter(Boolean).join(" · "),
  });
}

const bySector = new Map();
for (const company of registry.values()) {
  const bucket = bySector.get(company.sector) || [];
  bucket.push(company);
  bySector.set(company.sector, bucket);
}
for (const bucket of bySector.values()) {
  bucket.sort((a, b) => b.score - a.score || SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size) || a.name.localeCompare(b.name));
}

const selected = new Map();
for (const [sectorName, quota] of SECTOR_QUOTAS) {
  for (const company of (bySector.get(sectorName) || []).slice(0, quota)) {
    selected.set(company.id, company);
  }
}
const leftovers = [...registry.values()]
  .filter((company) => !selected.has(company.id))
  .sort((a, b) => b.score - a.score || a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name));
for (const company of leftovers) {
  if (selected.size >= TARGET) break;
  selected.set(company.id, company);
}

const companies = [...selected.values()].slice(0, TARGET).map(({ score, ...company }) => company).sort((a, b) => {
  const sizeDelta = SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size);
  return sizeDelta || a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name);
});

const summary = {
  total: companies.length,
  size: Object.fromEntries([...new Set(companies.map((company) => company.size))].sort().map((size) => [size, companies.filter((company) => company.size === size).length])),
  sector: Object.fromEntries([...new Set(companies.map((company) => company.sector))].sort().map((sector) => [sector, companies.filter((company) => company.sector === sector).length])),
  source: Object.fromEntries([...new Set(companies.map((company) => company.source))].sort().map((source) => [source, companies.filter((company) => company.source === source).length])),
  provider: Object.fromEntries([...new Set(companies.map((company) => company.provider))].sort().map((provider) => [provider, companies.filter((company) => company.provider === provider).length])),
};

fs.writeFileSync("app/company-registry.json", `${JSON.stringify(companies, null, 2)}\n`);
fs.writeFileSync("app/company-registry-summary.json", `${JSON.stringify(summary, null, 2)}\n`);
const preview = [...SECTOR_QUOTAS.keys()]
  .flatMap((sectorName) => companies.filter((company) => company.sector === sectorName).slice(0, 50))
  .concat(SIZE_ORDER.flatMap((size) => companies.filter((company) => company.size === size).slice(0, 80)))
  .filter((company, index, rows) => rows.findIndex((row) => row.id === company.id) === index)
  .slice(0, 900);
fs.writeFileSync("app/company-registry-preview.json", `${JSON.stringify(preview, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
