import fs from 'node:fs';

const rows = fs.readFileSync('work/direct-company-seeds.tsv','utf8').trim().split('\n').slice(1).map(line => {
  const [company,sector,ats,slug] = line.split('\t'); return {company,sector,ats,slug};
});
const cutoff = Date.UTC(2026,6,14);
const sweTitle = /\b(software engineer|software developer|full.?stack (?:engineer|developer)|front.?end (?:engineer|developer)|back.?end (?:engineer|developer)|mobile (?:engineer|developer)|ios (?:engineer|developer)|android (?:engineer|developer)|platform engineer|devops engineer|site reliability engineer|\bsre\b|infrastructure engineer|cloud engineer|systems engineer|engineering manager|developer experience engineer|software architect)\b/i;
const aiTitle = /\b(machine learning engineer|\bml engineer|\bai engineer|applied scientist|research scientist|data scientist|computer vision engineer|nlp engineer|llm engineer|generative ai engineer|mlops engineer|machine learning engineering manager)\b/i;
const reject = /sales|solutions engineer|support engineer|mechanical|electrical|civil|manufacturing|hardware engineer|security engineer|product manager|designer|analyst|marketing|revenue/i;
const us = /United States|\bUS\b|\bUSA\b|Remote.*U\.S|California|New York|Texas|Washington|Massachusetts|Virginia|Colorado|Illinois|Georgia|Florida|Maryland|Pennsylvania|Oregon|Arizona|North Carolina|District of Columbia|San Francisco|Seattle|Boston|Austin|Chicago|Atlanta/i;
const clean = s => (s||'').replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();

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
      const category = aiTitle.test(title) ? 'Applied AI' : sweTitle.test(title) ? 'Software engineering' : null;
      if (!category || reject.test(title) || !us.test(location) || new Date(date).getTime() < cutoff) return [];
      return [{id:`${row.ats}-${row.slug}-${j.id || j.jobUrl}`,source:`Direct ${row.ats==='greenhouse'?'Greenhouse':'Ashby'}`,company:row.company,sector:row.sector,title,category,location:typeof location==='string'?location:'United States',remote:/remote/i.test(`${location} ${title}`),type:'',level:'',date,salary:'',tags:[row.sector],url:j.absolute_url || j.jobUrl || j.applyUrl,summary:content.slice(0,320),companyEvidence:'Curated US-headquartered company; posting retrieved from its official careers ATS.'}];
    });
    return {...row,status:200,total:raw.length,jobs};
  } catch (e) { return {...row,status:'error',jobs:[]}; }
}

const results=[];
for(let i=0;i<rows.length;i+=12) results.push(...await Promise.all(rows.slice(i,i+12).map(fetchBoard)));
const jobs=results.flatMap(r=>r.jobs).filter(j=>j.url);
const seen=new Set(); const unique=jobs.filter(j=>{const k=`${j.company}|${j.title}|${j.location}`.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>new Date(b.date)-new Date(a.date));
fs.writeFileSync('app/jobs-data.json',JSON.stringify(unique,null,2));
fs.writeFileSync('app/company-coverage.json',JSON.stringify(results.map(({jobs,...r})=>({...r,matchingJobs:jobs.length})),null,2));
console.log(JSON.stringify({companiesSeeded:rows.length,boardsResolved:results.filter(r=>r.status===200).length,companiesWithMatches:new Set(unique.map(j=>j.company)).size,jobs:unique.length,sectors:Object.fromEntries([...new Set(unique.map(j=>j.sector))].map(s=>[s,unique.filter(j=>j.sector===s).length]))},null,2));
