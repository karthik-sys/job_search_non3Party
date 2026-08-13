import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";

const schema=`CREATE TABLE IF NOT EXISTS company_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, company_name TEXT NOT NULL, website TEXT NOT NULL, careers_url TEXT NOT NULL, ats_provider TEXT NOT NULL, ats_slug TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`;

export async function POST(req:NextRequest){
  try{
    const b=await req.json() as Record<string,string>;
    if(!b.company||!b.website||!b.careersUrl||!b.provider||!b.slug)return NextResponse.json({error:"Missing verified discovery data."},{status:400});
    await env.DB.prepare(schema).run();
    await env.DB.prepare("INSERT INTO company_submissions (company_name,website,careers_url,ats_provider,ats_slug) VALUES (?1,?2,?3,?4,?5)").bind(b.company,b.website,b.careersUrl,b.provider,b.slug).run();
    return NextResponse.json({ok:true,status:"pending"});
  }catch{return NextResponse.json({error:"Could not save the company submission."},{status:500})}
}
