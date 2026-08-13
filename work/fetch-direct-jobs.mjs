import fs from 'node:fs';

const rows = fs.readFileSync('work/direct-company-seeds.tsv','utf8').trim().split('\n').slice(1).map(line => {
  const [company,sector,ats,slug] = line.split('\t'); return {company,sector,ats,slug};
});
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

async function fetchBoard(row){
  const url = row.ats === 'greenhouse' ? `https://boards-api.greenhouse.io/v1/boards/${row.slug}/jobs?content=true` : `https://api.ashbyhq.com/posting-api/job-board/${row.slug}`;
  try {
    const res = await fetch(url, {headers:{'user-agent':'Karthik private job research dashboard'}});
    if (!res.ok) return {...row,status:res.status,jobs:[]};
    const data = await res.json();
    const raw = data.jobs || [];
    const jobs = raw.flatMap(j => {
      const title = j.title || '';
      const location = j.location?.name || j.location || '';
      const content = clean(j.content || j.descriptionPlain || j.descriptionHtml || '');
      const date = j.updated_at || j.publishedAt || j.created_at || new Date().toISOString();
      const category = classify(title);
      if (!us.test(location) || new Date(date).getTime() < cutoff) return [];
      return [{id:`${row.ats}-${row.slug}-${j.id || j.jobUrl}`,source:`Direct ${row.ats==='greenhouse'?'Greenhouse':'Ashby'}`,company:row.company,sector:row.sector,title,category,location:typeof location==='string'?location:'United States',remote:/remote/i.test(`${location} ${title}`),type:'',level:'',date,salary:'',tags:requirements(title,content,category,row.sector),url:j.absolute_url || j.jobUrl || j.applyUrl,summary:summarize(content),companyEvidence:'Curated US-headquartered company; posting retrieved from its official careers ATS.'}];
    });
    return {...row,status:200,total:raw.length,jobs};
  } catch (e) { return {...row,status:'error',jobs:[]}; }
}

const results=[];
for(let i=0;i<rows.length;i+=12) results.push(...await Promise.all(rows.slice(i,i+12).map(fetchBoard)));
const jobs=results.flatMap(r=>r.jobs).filter(j=>j.url);
const seen=new Set(); const unique=jobs.filter(j=>{const k=`${j.company}|${j.title}|${j.location}`.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>new Date(b.date)-new Date(a.date));
fs.writeFileSync('app/jobs-data.json',JSON.stringify(unique,null,2));
fs.writeFileSync('public/jobs-data.json',JSON.stringify(unique,null,2));
fs.writeFileSync('app/company-coverage.json',JSON.stringify(results.map(({jobs,...r})=>({...r,matchingJobs:jobs.length})),null,2));
console.log(JSON.stringify({companiesSeeded:rows.length,boardsResolved:results.filter(r=>r.status===200).length,companiesWithMatches:new Set(unique.map(j=>j.company)).size,jobs:unique.length,sectors:Object.fromEntries([...new Set(unique.map(j=>j.sector))].map(s=>[s,unique.filter(j=>j.sector===s).length]))},null,2));
