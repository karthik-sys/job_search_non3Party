import { NextRequest, NextResponse } from "next/server";
const tracks=[
  ["Backend & Distributed Systems",["backend","distributed systems","microservices","api","database","java","golang","python","kafka"]],
  ["Frontend & Web",["frontend","react","typescript","javascript","next.js","css","web application"]],
  ["Full-stack Product Engineering",["full stack","full-stack","product engineer","react","node","django","rails"]],
  ["Platform, Cloud & SRE",["platform","devops","sre","site reliability","kubernetes","terraform","aws","gcp","azure","infrastructure"]],
  ["Mobile",["ios","android","swift","kotlin","react native","mobile"]],
  ["Data Engineering & Science",["data engineer","data scientist","analytics","spark","airflow","warehouse","sql","pandas"]],
  ["Machine Learning & AI",["machine learning","artificial intelligence","llm","nlp","pytorch","tensorflow","computer vision","mlops","generative ai"]],
  ["Security Engineering",["security","cybersecurity","iam","application security","cloud security","threat"]],
  ["Engineering Leadership",["engineering manager","tech lead","staff engineer","principal engineer","director of engineering","mentor"]],
  ["Customer Success & Support",["customer success","customer support","support","implementation","solutions","client","account management","onboarding"]],
  ["Sales & Go-to-Market",["sales","account executive","business development","revenue","gtm","marketing","growth","partnerships"]],
  ["Product Management",["product manager","roadmap","strategy","go-to-market","user research","requirements","launch"]],
  ["Design & Research",["designer","ux","ui","visual design","product design","research","figma","prototype"]],
  ["Operations & Supply Chain",["operations","supply chain","logistics","procurement","vendor","program management","process improvement"]],
  ["Finance, People & Legal",["finance","accounting","fp&a","people","hr","recruiting","legal","counsel","compliance"]],
  ["Data, Analytics & Business Ops",["analytics","business operations","bizops","excel","sql","tableau","looker","forecasting"]],
] as const;
export async function POST(req:NextRequest){const {text=""}=await req.json() as {text?:string};if(text.length<80)return NextResponse.json({error:"Paste at least a short résumé summary."},{status:400});if(text.length>30000)return NextResponse.json({error:"Résumé text is too long."},{status:400});const lower=text.toLowerCase();const suggestions=tracks.map(([label,terms],i)=>{const signals=terms.filter(t=>lower.includes(t));return{id:String(i),label,score:signals.length,signals:signals.slice(0,5)}}).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,6);return NextResponse.json({suggestions:suggestions.length?suggestions:[{id:"general",label:"General US Roles",score:1,signals:["broad experience"]}],privacy:"Analyzed transiently. Résumé text was not stored."})}
