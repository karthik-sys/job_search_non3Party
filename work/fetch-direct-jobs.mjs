import fs from 'node:fs';

const registry = JSON.parse(fs.readFileSync('app/company-registry.json','utf8'));
const enterpriseCompanies = new Set(["Databricks","Cloudflare","Snowflake","Datadog","Twilio","Coinbase","Robinhood","SoFi","Highmark Health","Palantir","Rocket Lab","Waymo","DoorDash","Roblox","Roku","CrowdStrike","Rubrik","Block","Stripe","Lyft","Dropbox","Okta","Five9"]);
const largeCompanies = new Set(["Anthropic","Scale AI","GitLab","MongoDB","Confluent","Asana","Figma","Rippling","Gusto","Plaid","Affirm","Chime","Oscar Health","Ro","Zocdoc","Tempus","Recursion","Benchling","Flatiron Health","Anduril","Shield AI","Astranis","Relativity Space","Zoox","Nuro","Aurora","Motional","Zipline","Cruise","Reddit","Discord","Pinterest","Snap","Instacart","Duolingo","Samsara","Commonwealth Fusion Systems","Crusoe","Wiz","Snyk","SentinelOne"]);
const mediumCompanies = new Set(["Weights & Biases","Hugging Face","Cohere","Together AI","Anyscale","LangChain","Modal","Replicate","Vercel","Supabase","Airtable","Brex","Ramp","Mercury","Saronic","Varda Space","Skydio","Agility Robotics","Form Energy","Redwood Materials","Fervo Energy","Watershed","Carbon Direct","Abnormal Security","Chainguard","Huntress","Vanta","Drata","Arctic Wolf"]);
const startupCompanies = new Set(["OpenAI","Perplexity","Charm Industrial"]);
const companySize = (company, fallback = "Unknown") => startupCompanies.has(company) ? "Startup" : mediumCompanies.has(company) ? "Medium" : enterpriseCompanies.has(company) ? "Enterprise" : largeCompanies.has(company) ? "Large" : fallback || "Unknown";
const cutoff = Date.UTC(2026,6,14);
const roleFamilies = [
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
const us = /United States|\bUS\b|\bUSA\b|Remote.*U\.S|California|New York|Texas|Washington|Massachusetts|Virginia|Colorado|Illinois|Georgia|Florida|Maryland|Pennsylvania|Oregon|Arizona|North Carolina|District of Columbia|San Francisco|Seattle|Boston|Austin|Chicago|Atlanta/i;
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
const summarize = (content) => {
  const sentence = content.match(/^.{80,360}?[.!?](?:\s|$)/)?.[0];
  return (sentence || content.slice(0, 320)).trim();
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
  } catch {}
  return '';
};
const providerFromLink = (link, fallback) => {
  if (/greenhouse\.io/.test(link)) return 'greenhouse';
  if (/lever\.co/.test(link)) return 'lever';
  if (/ashbyhq\.com/.test(link)) return 'ashby';
  return fallback;
};
const rows = [];
const seenBoards = new Set();
for (const company of registry) {
  for (const link of company.careersLinks || []) {
    const ats = providerFromLink(link, company.provider);
    if (!['greenhouse','lever','ashby'].includes(ats)) continue;
    const slug = slugFromLink(link, ats);
    if (!slug) continue;
    const key = `${ats}:${slug}`;
    if (seenBoards.has(key)) continue;
    seenBoards.add(key);
    rows.push({company:company.name,sector:company.sector,ats,slug,size:company.size,confidence:company.confidence});
  }
}

async function fetchBoard(row){
  const url = row.ats === 'greenhouse' ? `https://boards-api.greenhouse.io/v1/boards/${row.slug}/jobs?content=true` : row.ats === 'lever' ? `https://api.lever.co/v0/postings/${row.slug}?mode=json` : `https://api.ashbyhq.com/posting-api/job-board/${row.slug}`;
  try {
    const res = await fetch(url, {headers:{'user-agent':'Karthik private job research dashboard'}});
    if (!res.ok) return {...row,status:res.status,jobs:[]};
    const data = await res.json();
    const raw = Array.isArray(data) ? data : data.jobs || [];
    const jobs = raw.flatMap(j => {
      const title = j.title || j.text || '';
      const location = j.location?.name || j.location || j.categories?.location || '';
      const content = clean(j.content || j.descriptionPlain || j.descriptionHtml || j.description || j.lists?.map(l => `${l.text} ${l.content}`).join(' ') || '');
      const dateValue = j.updated_at || j.publishedAt || j.created_at || j.createdAt || new Date().toISOString();
      const date = typeof dateValue === 'number' ? new Date(dateValue).toISOString() : dateValue;
      const category = classify(title);
      const remote = /remote/i.test(`${location} ${title}`);
      if (!(us.test(location) || (remote && /us|united states|us-hiring-signal|verified-seed/i.test(`${row.confidence} ${location}`))) || new Date(date).getTime() < cutoff) return [];
      const providerLabel = row.ats === 'greenhouse' ? 'Greenhouse' : row.ats === 'lever' ? 'Lever' : 'Ashby';
      return [{id:`${row.ats}-${row.slug}-${j.id || j.jobUrl || j.hostedUrl}`,source:`Direct ${providerLabel}`,company:row.company,companySize:companySize(row.company,row.size),sector:row.sector,title,category,location:typeof location==='string'&&location?location:'United States / Remote',remote,type:j.categories?.commitment || '',level:'',date,salary:'',tags:requirements(title,content,category,row.sector),url:j.absolute_url || j.jobUrl || j.applyUrl || j.hostedUrl,summary:summarize(content),companyEvidence:'Posting retrieved from a company-controlled public careers feed.'}];
    });
    return {...row,status:200,total:raw.length,jobs};
  } catch (e) { return {...row,status:'error',jobs:[]}; }
}

const results=[];
for(let i=0;i<rows.length;i+=24) {
  results.push(...await Promise.all(rows.slice(i,i+24).map(fetchBoard)));
  if ((i / 24) % 10 === 0) console.error(`checked ${Math.min(i+24,rows.length)} / ${rows.length} official feeds`);
}
const jobs=results.flatMap(r=>r.jobs).filter(j=>j.url);
const seen=new Set(); const unique=jobs.filter(j=>{const k=`${j.company}|${j.title}|${j.location}`.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>new Date(b.date)-new Date(a.date));
const summary = {feedsChecked:rows.length,boardsResolved:results.filter(r=>r.status===200).length,companiesWithMatches:new Set(unique.map(j=>j.company)).size,jobs:unique.length,sizes:Object.fromEntries([...new Set(unique.map(j=>j.companySize))].map(s=>[s,unique.filter(j=>j.companySize===s).length])),sectors:Object.fromEntries([...new Set(unique.map(j=>j.sector))].map(s=>[s,unique.filter(j=>j.sector===s).length]))};
fs.writeFileSync('app/jobs-data.json','[]');
fs.writeFileSync('public/jobs-data.json',JSON.stringify(unique));
fs.writeFileSync('app/company-coverage.json',JSON.stringify(results.map(({jobs,...r})=>({...r,matchingJobs:jobs.length}))));
fs.writeFileSync('app/job-feed-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
