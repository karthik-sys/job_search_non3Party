import { NextRequest, NextResponse } from "next/server";

const blockedHost = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;
const safeUrl = (raw: string) => {
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (url.protocol !== "https:" || url.username || url.password || url.port || blockedHost.test(url.hostname)) throw new Error("Use a public HTTPS company website.");
  return url;
};
const clean = (s="") => s.replace(/<[^>]*>/g," ").replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();
const linkPattern = /href=["']([^"']+)["']/gi;

async function getHtml(url: URL) {
  const res = await fetch(url, {redirect:"follow", headers:{"user-agent":"LaunchpadCareers/1.0"}, signal:AbortSignal.timeout(8000)});
  if (!res.ok) throw new Error(`Website returned ${res.status}.`);
  return {html:await res.text(), final:new URL(res.url)};
}

function detectAts(html:string, base:URL) {
  const links=[...html.matchAll(linkPattern)].map(m=>{try{return new URL(m[1],base).href}catch{return ""}}).filter(Boolean);
  for(const href of links){
    let m=href.match(/boards\.greenhouse\.io\/([^/?#]+)/i)||href.match(/job-boards\.greenhouse\.io\/([^/?#]+)/i); if(m)return {provider:"Greenhouse",slug:m[1],careersUrl:href};
    m=href.match(/jobs\.lever\.co\/([^/?#]+)/i); if(m)return {provider:"Lever",slug:m[1],careersUrl:href};
    m=href.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i); if(m)return {provider:"Ashby",slug:m[1],careersUrl:href};
  }
  return null;
}

async function atsJobs(provider:string,slug:string){
  if(provider==="Greenhouse"){
    const data=await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`).then(r=>r.json()) as {jobs?:any[]};
    return (data.jobs||[]).map(j=>({id:String(j.id),title:j.title,location:j.location?.name||"",url:j.absolute_url,updatedAt:j.updated_at,description:clean(j.content).slice(0,500)}));
  }
  if(provider==="Lever"){
    const data=await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`).then(r=>r.json()) as any[];
    return (Array.isArray(data)?data:[]).map(j=>({id:j.id,title:j.text,location:j.categories?.location||"",url:j.hostedUrl,updatedAt:null,description:clean(j.descriptionPlain||j.description).slice(0,500)}));
  }
  const data=await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`).then(r=>r.json()) as {jobs?:any[]};
  return (data.jobs||[]).map(j=>({id:j.id||j.jobUrl,title:j.title,location:j.location||"",url:j.jobUrl||j.applyUrl,updatedAt:j.publishedAt,description:clean(j.descriptionPlain||j.descriptionHtml).slice(0,500)}));
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json() as {company?:string;website?:string};
    const name=(body.company||"").trim();
    const guessed=(body.website||"").trim() || `${name.toLowerCase().replace(/[^a-z0-9]+/g,"")}.com`;
    const root=safeUrl(guessed);
    const attempts=[root,new URL("/careers",root),new URL("/jobs",root),new URL("/company/careers",root)];
    let found:null|{provider:string;slug:string;careersUrl:string}=null; let official=root.href;
    for(const url of attempts){try{const page=await getHtml(url);official=page.final.href;found=detectAts(page.html,page.final);if(found)break}catch{}}
    if(!found)return NextResponse.json({error:"I found the website but could not detect a supported Greenhouse, Lever, or Ashby careers feed.",officialWebsite:official},{status:422});
    const jobs=await atsJobs(found.provider,found.slug);
    return NextResponse.json({company:name||root.hostname.replace(/^www\./,""),officialWebsite:root.href,...found,totalJobs:jobs.length,jobs});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Discovery failed."},{status:400})}
}
