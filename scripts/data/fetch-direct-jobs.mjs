import fs from 'node:fs';

const registry = JSON.parse(fs.readFileSync('app/company-registry.json','utf8'));
const enterpriseCompanies = new Set(["Databricks","Cloudflare","Snowflake","Datadog","Twilio","Coinbase","Robinhood","SoFi","Highmark Health","Palantir","Rocket Lab","Waymo","DoorDash","Roblox","Roku","CrowdStrike","Rubrik","Block","Stripe","Lyft","Dropbox","Okta","Five9"]);
const largeCompanies = new Set(["Anthropic","Scale AI","GitLab","MongoDB","Confluent","Asana","Figma","Rippling","Gusto","Plaid","Affirm","Chime","Oscar Health","Ro","Zocdoc","Tempus","Recursion","Benchling","Flatiron Health","Anduril","Shield AI","Astranis","Relativity Space","Zoox","Nuro","Aurora","Motional","Zipline","Cruise","Reddit","Discord","Pinterest","Snap","Instacart","Duolingo","Samsara","Commonwealth Fusion Systems","Crusoe","Wiz","Snyk","SentinelOne"]);
const mediumCompanies = new Set(["Weights & Biases","Hugging Face","Cohere","Together AI","Anyscale","LangChain","Modal","Replicate","Vercel","Supabase","Airtable","Brex","Ramp","Mercury","Saronic","Varda Space","Skydio","Agility Robotics","Form Energy","Redwood Materials","Fervo Energy","Watershed","Carbon Direct","Abnormal Security","Chainguard","Huntress","Vanta","Drata","Arctic Wolf"]);
const startupCompanies = new Set(["OpenAI","Perplexity","Charm Industrial"]);
const companySize = (company, fallback = "Unknown") => startupCompanies.has(company) ? "Startup" : mediumCompanies.has(company) ? "Medium" : enterpriseCompanies.has(company) ? "Enterprise" : largeCompanies.has(company) ? "Large" : fallback || "Unknown";
const roleFamilies = [
  ["Retail & Merchandising", /\b(merchant|merchandising|buyer|buying|retail planning|assortment|inventory|pricing|category manager)\b/i],
  ["Machine Learning & AI", /\b(machine learning|\bml\b|artificial intelligence|\bai\b|applied scientist|research scientist|data scientist|data engineer|analytics engineer|computer vision|nlp|llm|generative ai|mlops|data platform)\b/i],
  ["Software Engineering", /\b(software engineer|software developer|full.?stack|front.?end|back.?end|mobile engineer|mobile developer|ios|android|platform engineer|devops|site reliability|\bsre\b|infrastructure engineer|cloud engineer|systems engineer|developer experience|software architect|engineering manager|qa engineer|test engineer)\b/i],
  ["Product & Design", /\b(product manager|program manager|project manager|product designer|ux|ui|user researcher|design manager|brand designer|content designer)\b/i],
  ["Security", /\b(security|trust and safety|fraud|risk|compliance|privacy|threat|incident response)\b/i],
  ["Go-to-Market", /\b(sales|account executive|customer success|solutions engineer|sales engineer|marketing|growth|demand generation|partnerships|business development|revenue|commercial)\b/i],
  ["Operations", /\b(operations|supply chain|logistics|manufacturing|facilities|procurement|strategy|chief of staff|business operations)\b/i],
  ["People, Finance & Legal", /\b(recruiter|people|talent|hr|human resources|finance|accounting|legal|counsel|controller|payroll)\b/i],
  ["Customer & Support", /\b(support|customer|implementation|technical account|professional services|education|training)\b/i],
  ["Hardware & Robotics", /\b(hardware|mechanical|electrical|firmware|robotics|embedded|avionics|manufacturing engineer)\b/i],
];
const us = /United States|\bUS\b|\bUSA\b|Remote.*U\.S|California|New York|Texas|Washington|Massachusetts|Virginia|Colorado|Illinois|Georgia|Florida|Maryland|Pennsylvania|Oregon|Arizona|North Carolina|District of Columbia|San Francisco|Seattle|Boston|Austin|Chicago|Atlanta|\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/;
const ALL_MARKETS = process.argv.includes('--include-international');
const skillPatterns = [
  ["Python", /\bpython\b/i],
  ["JavaScript", /\bjavascript|\btypescript|\bnode\.?js|\breact\b/i],
  ["Java", /\bjava\b|\bspring\b/i],
  ["Go", /\bgolang\b|\bgo\b/i],
  ["C++", /\bc\+\+|\bcpp\b/i],
  ["Rust", /\brust\b/i],
  ["Kubernetes", /\bkubernetes|\bk8s\b/i],
  ["AWS", /\baws\b|amazon web services/i],
  ["GCP", /\bgcp\b|google cloud/i],
  ["Azure", /\bazure\b/i],
  ["Distributed Systems", /distributed systems|scalable systems|high availability/i],
  ["LLMs", /\bllm\b|large language model|generative ai/i],
  ["Machine Learning", /machine learning|\bml\b|deep learning/i],
  ["Data", /\bsql\b|spark|data pipeline|warehouse|analytics/i],
  ["Security", /security|privacy|threat|vulnerability|compliance/i],
  ["Product Strategy", /roadmap|product strategy|user research|experimentation/i],
  ["Merchandising", /merchandising|merchant|assortment|line plan|category growth/i],
  ["Retail Planning", /retail planning|buying|buyer|marketplace trends|competitive shopping/i],
  ["Inventory", /inventory|planning|forecast|stock|assortment/i],
  ["Pricing", /pricing|gross margin|profitability|competitive pricing/i],
  ["Excel", /\bexcel\b|microsoft office|spreadsheet/i],
  ["Furniture", /furniture|décor|decor|interior designer|upholstery|home/i],
  ["3+ Years", /\b3\+ years|\b3 years|\bthree years/i],
  ["Bachelor's Degree", /bachelor|degree/i],
  ["Sales", /quota|pipeline|account executive|enterprise sales/i],
  ["Customer Success", /customer success|implementation|solutions/i],
  ["Leadership", /manager|leadership|mentor|cross-functional/i],
  ["On-site", /on-site|onsite|hybrid/i],
  ["Remote", /remote/i],
];
const decodeEntities = (value) => String(value || "")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&")
  .replace(/&nbsp;/g, " ")
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"');
const clean = s => decodeEntities(s)
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/\b\/?(?:div|span|p|br|ul|ol|li|strong|em|section|h[1-6])\b(?:\s+class\s*=\s*[\w-]+)?/gi, " ")
  .replace(/&[a-z0-9#]+;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();
const classify = (title) => roleFamilies.find(([, pattern]) => pattern.test(title))?.[0] || "Other";
const inferSector = (title, content, fallback) => {
  const text = `${title} ${content}`.toLowerCase();
  if (/furniture|décor|decor|interior designer|upholstery|retail|merchant|merchandising|buying|assortment/.test(text)) return "Retail & Commerce";
  return fallback;
};
const summarize = (content) => {
  const sentence = content.match(/^.{80,360}?[.!?](?:\s|$)/)?.[0];
  return (sentence || content.slice(0, 320)).trim();
};
const slugify = (value = "") => String(value)
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
const xmlText = (value = "", tag = "") => {
  const match = String(value).match(new RegExp(`<${tag}[^>]*>([\\\\s\\\\S]*?)<\\/${tag}>`, "i"));
  return clean(match?.[1] || "");
};
const xmlItems = (value = "", tag = "position") => [...String(value).matchAll(new RegExp(`<${tag}[^>]*>[\\\\s\\\\S]*?<\\/${tag}>`, "gi"))].map((match) => match[0]);
const humanPostingUrl = (row, job, title) => {
  const direct = job.absolute_url || job.hostedUrl || job.jobUrl || job.applyUrl;
  if (direct && !/api\.smartrecruiters\.com/i.test(direct)) return direct;
  if (row.ats === "smartrecruiters" && job.id) return `https://jobs.smartrecruiters.com/${row.slug}/${job.id}-${slugify(title)}`;
  if (job.ref && !/api\.smartrecruiters\.com/i.test(job.ref)) return job.ref;
  return direct || job.ref || "";
};
const requirements = (title, content, category, sector) => {
  const text = `${title} ${content}`;
  const tags = [category, sector];
  for (const [label, pattern] of skillPatterns) if (pattern.test(text) && !tags.includes(label)) tags.push(label);
  return tags.slice(0, 8);
};
const slugFromLink = (link, provider) => {
  try {
    const url = new URL(link);
    const parts = url.pathname.split('/').filter(Boolean);
    if (provider === 'greenhouse') {
      if (url.hostname.includes('boards-api.greenhouse.io')) return parts[2] || '';
      return parts[0] || '';
    }
    if (provider === 'lever') return parts[0] || '';
    if (provider === 'ashby') return parts[0] || parts[1] || '';
    if (provider === 'smartrecruiters') return parts[1] || parts[0] || '';
    if (provider === 'breezy') return url.hostname.replace(/\.breezy\.hr$/i, '');
    if (provider === 'bamboohr') return url.hostname.replace(/\.bamboohr\.com$/i, '');
    if (provider === 'recruitee') return url.hostname.replace(/\.recruitee\.com$/i, '');
    if (provider === 'personio') return url.hostname.replace(/\.jobs\.personio\.com$/i, '');
    if (provider === 'workday') {
      const host = url.hostname;
      const tenant = host.split('.')[0];
      const siteParts = parts.filter((part) => !/^(en-US|en|jobs|job|search-results)$/i.test(part));
      return `${host}|${tenant}|${siteParts[0] || ''}`;
    }
  } catch {}
  return '';
};
const providerFromLink = (link, fallback) => {
  if (/greenhouse\.io/.test(link)) return 'greenhouse';
  if (/lever\.co/.test(link)) return 'lever';
  if (/ashbyhq\.com/.test(link)) return 'ashby';
  if (/smartrecruiters\.com/.test(link)) return 'smartrecruiters';
  if (/myworkdayjobs\.com|workdayjobs\.com/.test(link)) return 'workday';
  if (/breezy\.hr/.test(link)) return 'breezy';
  if (/bamboohr\.com/.test(link)) return 'bamboohr';
  if (/recruitee\.com/.test(link)) return 'recruitee';
  if (/personio\.com/.test(link)) return 'personio';
  return fallback;
};
const rows = [];
const seenBoards = new Set();
for (const company of registry) {
  for (const link of company.careersLinks || []) {
    const ats = providerFromLink(link, company.provider);
    if (!['greenhouse','lever','ashby','smartrecruiters','workday','breezy','bamboohr','recruitee','personio'].includes(ats)) continue;
    const slug = slugFromLink(link, ats);
    if (!slug) continue;
    const key = `${ats}:${slug}`;
    if (seenBoards.has(key)) continue;
    seenBoards.add(key);
    rows.push({company:company.name,sector:company.sector,ats,slug,size:company.size,confidence:company.confidence});
  }
}

function providerLabel(ats) {
  return ({
    greenhouse: "Greenhouse",
    lever: "Lever",
    ashby: "Ashby",
    smartrecruiters: "SmartRecruiters",
    workday: "Workday",
    breezy: "Breezy",
    bamboohr: "BambooHR",
    recruitee: "Recruitee",
    personio: "Personio",
  })[ats] || ats;
}

function boardRequest(row) {
  if (row.ats === 'greenhouse') return { url: `https://boards-api.greenhouse.io/v1/boards/${row.slug}/jobs?content=true` };
  if (row.ats === 'lever') return { url: `https://api.lever.co/v0/postings/${row.slug}?mode=json` };
  if (row.ats === 'ashby') return { url: `https://api.ashbyhq.com/posting-api/job-board/${row.slug}?includeCompensation=true` };
  if (row.ats === 'smartrecruiters') return { url: `https://api.smartrecruiters.com/v1/companies/${row.slug}/postings?limit=100` };
  if (row.ats === 'breezy') return { url: `https://${row.slug}.breezy.hr/json` };
  if (row.ats === 'bamboohr') return { url: `https://${row.slug}.bamboohr.com/careers/list` };
  if (row.ats === 'recruitee') return { url: `https://${row.slug}.recruitee.com/api/offers/` };
  if (row.ats === 'personio') return { url: `https://${row.slug}.jobs.personio.com/xml`, text: true };
  if (row.ats === 'workday') {
    const [host, tenant, site] = row.slug.split('|');
    return {
      url: `https://${host}/wday/cxs/${tenant}/${site}/jobs`,
      init: { method: "POST", headers: { "content-type": "application/json", "user-agent": "Karthik private job research dashboard" }, body: JSON.stringify({ appliedFacets: {}, limit: 100, offset: 0, searchText: "" }) },
      workday: { host, tenant, site },
    };
  }
  return { url: "" };
}

function rawJobsFromData(row, data) {
  if (row.ats === 'bamboohr') return data.result || data.jobs || [];
  if (row.ats === 'recruitee') return data.offers || data.jobs || [];
  if (row.ats === 'workday') return data.jobPostings || data.jobs || [];
  return Array.isArray(data) ? data : data.jobs || data.content || [];
}

function normalizeJob(row, j) {
  const title = j.title || j.text || j.name || j.jobOpeningName || j.position || '';
  const locationObject = j.location || j.locations?.[0] || {};
  const location = j.locationsText || j.locationName || locationObject.name || locationObject.city || j.city || j.categories?.location || j.location || '';
  const content = clean(j.content || j.descriptionPlain || j.descriptionHtml || j.description || j.jobAd?.sections?.jobDescription?.text || j.lists?.map(l => `${l.text} ${l.content}`).join(' ') || '');
  const dateValue = j.updated_at || j.publishedAt || j.created_at || j.createdAt || j.releasedDate || j.updatedDate || j.postedOn || j.date || new Date().toISOString();
  const date = typeof dateValue === 'number' ? new Date(dateValue).toISOString() : dateValue;
  const category = classify(title);
  const inferredSector = inferSector(title, content, row.sector);
  const remote = /remote/i.test(`${location} ${title}`);
  const isUs = us.test(location) || (remote && /us|united states|us-hiring-signal|verified-seed/i.test(`${row.confidence} ${location}`));
  const label = providerLabel(row.ats);
  let postingUrl = humanPostingUrl(row, j, title);
  if (row.ats === 'workday') {
    const [host,, site] = row.slug.split('|');
    const externalPath = String(j.externalPath || j.url || "").replace(/^\//, "");
    postingUrl = externalPath ? `https://${host}/en-US/${site}/job/${externalPath}` : "";
  }
  if (row.ats === 'breezy') postingUrl = j.url || j.apply_url || `https://${row.slug}.breezy.hr/p/${j.friendly_id || j._id || slugify(title)}`;
  if (row.ats === 'bamboohr') postingUrl = j.url || j.applyUrl || `https://${row.slug}.bamboohr.com/careers/${j.id || j.jobOpeningId || ""}`;
  if (row.ats === 'recruitee') postingUrl = j.careers_url || j.url || `https://${row.slug}.recruitee.com/o/${j.slug || slugify(title)}`;
  if (!ALL_MARKETS && !isUs) return null;
  if (!title || !postingUrl || /api\./i.test(postingUrl)) return null;
  return {id:`${row.ats}-${row.slug}-${j.id || j.uuid || j._id || j.ref || j.jobUrl || j.hostedUrl || j.externalPath || postingUrl}`,source:`Direct ${label}`,company:row.company,companySize:companySize(row.company,row.size),sector:inferredSector,title,category,location:typeof location==='string'&&location?location:(isUs?'United States / Remote':'Remote / Global'),remote,isUs,type:j.categories?.commitment || j.type?.name || j.employment_type || '',level:j.experience?.name || '',date,salary:'',tags:requirements(title,content,category,inferredSector),url:postingUrl,summary:summarize(content),companyEvidence:`Verified official posting: returned by the ${label} careers feed for ${row.slug} with a user-openable source link.`};
}

async function fetchBoard(row){
  const request = boardRequest(row);
  try {
    const res = await fetch(request.url, request.init || {headers:{'user-agent':'Karthik private job research dashboard'}});
    if (!res.ok) return {...row,status:res.status,jobs:[]};
    if (request.text) {
      const rawText = await res.text();
      const raw = xmlItems(rawText, "position").map((item) => ({ title: xmlText(item, "name"), location: xmlText(item, "office"), description: xmlText(item, "jobDescriptions"), id: xmlText(item, "id"), url: xmlText(item, "recruitingCategory") }));
      const jobs = raw.map((j) => normalizeJob(row, j)).filter(Boolean);
      return {...row,status:200,total:raw.length,jobs};
    }
    const data = await res.json();
    const raw = rawJobsFromData(row, data);
    const jobs = raw.map((j) => normalizeJob(row, j)).filter(Boolean);
    return {...row,status:200,total:raw.length,jobs};
  } catch (e) { return {...row,status:'error',jobs:[]}; }
}

const results=[];
for(let i=0;i<rows.length;i+=24) {
  results.push(...await Promise.all(rows.slice(i,i+24).map(fetchBoard)));
  if ((i / 24) % 10 === 0) console.error(`checked ${Math.min(i+24,rows.length)} / ${rows.length} official feeds`);
}
const jobs=results.flatMap(r=>r.jobs).filter(j=>j.url);
const seenProviderIds=new Set(); const unique=jobs.filter(j=>{const key=`${j.source || ''}:${j.id || ''}`.toLowerCase().trim();if(key!==':'&&seenProviderIds.has(key))return false;if(key!==':')seenProviderIds.add(key);return true;}).sort((a,b)=>new Date(b.date)-new Date(a.date));
const summary = {feedsChecked:rows.length,boardsResolved:results.filter(r=>r.status===200).length,companiesWithMatches:new Set(unique.map(j=>j.company)).size,jobs:unique.length,sizes:Object.fromEntries([...new Set(unique.map(j=>j.companySize))].map(s=>[s,unique.filter(j=>j.companySize===s).length])),sectors:Object.fromEntries([...new Set(unique.map(j=>j.sector))].map(s=>[s,unique.filter(j=>j.sector===s).length])),sources:Object.fromEntries([...new Set(unique.map(j=>j.source))].map(s=>[s,unique.filter(j=>j.source===s).length]))};
if (!unique.length) {
  fs.writeFileSync('app/company-coverage.failed.json',JSON.stringify(results.map(({jobs,...r})=>({...r,matchingJobs:jobs.length})),null,2));
  console.error('No jobs were fetched. Preserved existing snapshot and wrote app/company-coverage.failed.json for debugging.');
  console.log(JSON.stringify(summary,null,2));
  process.exit(2);
}
fs.writeFileSync('app/jobs-data.json','[]');
fs.writeFileSync('public/jobs-data.json',JSON.stringify(unique));
fs.writeFileSync('app/company-coverage.json',JSON.stringify(results.map(({jobs,...r})=>({...r,matchingJobs:jobs.length}))));
fs.writeFileSync('app/job-feed-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
