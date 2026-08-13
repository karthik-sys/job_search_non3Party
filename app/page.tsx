"use client";

import { useMemo, useState, type FormEvent } from "react";
import jobs from "./jobs-data.json";

type Job = (typeof jobs)[number];

const fmtDate = (value: string) => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  return days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("All sources");
  const [sector, setSector] = useState("All sectors");
  const [mode, setMode] = useState("All roles");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [sort, setSort] = useState("Newest");
  const [selected, setSelected] = useState<Job | null>(null);
  const [visible, setVisible] = useState(30);
  const [view, setView] = useState<"roles"|"companies">("roles");
  const [showOnboard, setShowOnboard] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<any>(null);
  const [discoveryError, setDiscoveryError] = useState("");

  async function discoverCompany(e:FormEvent){
    e.preventDefault(); setDiscovering(true); setDiscovery(null); setDiscoveryError("");
    try{const r=await fetch("/api/discover",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({company:companyName,website:companyWebsite})});const d=await r.json();if(!r.ok)throw new Error(d.error);setDiscovery(d)}catch(e){setDiscoveryError(e instanceof Error?e.message:"Discovery failed") }finally{setDiscovering(false)}
  }
  async function submitCompany(){
    if(!discovery)return; const r=await fetch("/api/companies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({company:discovery.company,website:discovery.officialWebsite,careersUrl:discovery.careersUrl,provider:discovery.provider,slug:discovery.slug})}); const d=await r.json(); setDiscovery({...discovery,submitted:r.ok,error:d.error});
  }

  const sources = ["All sources", ...Array.from(new Set(jobs.map((j) => j.source)))];
  const sectors = ["All sectors", ...Array.from(new Set(jobs.map((j) => j.sector))).sort()];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = jobs.filter((j) => {
      const haystack = `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")} ${j.summary}`.toLowerCase();
      return (!q || haystack.includes(q)) && (source === "All sources" || j.source === source) && (sector === "All sectors" || j.sector === sector) && (!remoteOnly || j.remote) && (mode === "All roles" || j.category === mode);
    });
    return sort === "Company" ? [...result].sort((a,b) => a.company.localeCompare(b.company)) : result;
  }, [query, source, sector, remoteOnly, mode, sort]);

  const aiCount = jobs.filter(j => j.category === "Applied AI").length;
  const companyGroups = useMemo(() => Array.from(new Set(filtered.map(j=>j.company))).map(company => {
    const companyJobs=filtered.filter(j=>j.company===company);
    return {company,jobs:companyJobs,sector:companyJobs[0].sector,source:companyJobs[0].source,software:companyJobs.filter(j=>j.category==="Software engineering").length,ai:companyJobs.filter(j=>j.category==="Applied AI").length,remote:companyJobs.filter(j=>j.remote).length};
  }).sort((a,b)=>b.jobs.length-a.jobs.length),[filtered]);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top"><span className="brandMark">L</span><span>Launchpad</span></a>
        <div className="fresh"><span></span> Official company career feeds</div>
        <button className="ghost" onClick={() => setShowOnboard(true)}>+ Add a company</button>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Company-first US opportunity index</div>
        <h1>Your next role,<br/><em>without the noise.</em></h1>
        <p>Software engineering and applied AI openings pulled directly from official careers systems at curated US companies—no third-party job aggregators.</p>
        <div className="searchBox">
          <span className="searchIcon">⌕</span>
          <input aria-label="Search jobs" value={query} onChange={e => {setQuery(e.target.value); setVisible(30)}} placeholder="Search titles, skills, companies, locations…" />
          <kbd>⌘ K</kbd>
        </div>
        <div className="stats">
          <div><strong>{jobs.length}</strong><span>open roles</span></div>
          <div><strong>{aiCount}</strong><span>AI-focused</span></div>
          <div><strong>{new Set(jobs.map(j=>j.company)).size}</strong><span>hiring companies</span></div>
          <div><strong>100</strong><span>companies tracked</span></div>
        </div>
      </section>

      <section className="workspace">
        <aside>
          <p className="label">US JOBS · ROLE FOCUS</p>
          {["All roles","Software engineering","Applied AI"].map(x => <button key={x} className={mode===x?"filter active":"filter"} onClick={()=>{setMode(x);setVisible(30)}}>{x}<span>→</span></button>)}
          <p className="label space">SECTORS</p>
          {sectors.map(x => <button key={x} className={sector===x?"filter active":"filter"} onClick={()=>{setSector(x);setVisible(30)}}>{x}<span>{x === "All sectors" ? jobs.length : jobs.filter(j=>j.sector===x).length}</span></button>)}
          <p className="label space">SOURCES</p>
          {sources.map(x => <button key={x} className={source===x?"filter active":"filter"} onClick={()=>{setSource(x);setVisible(30)}}>{x}<span>{x === "All sources" ? jobs.length : jobs.filter(j=>j.source===x).length}</span></button>)}
          <div className="fantastic"><div><span className="pulse"></span><b>Direct-source mode</b></div><p>Each opening comes from a company-controlled Greenhouse or Ashby careers feed.</p></div>
        </aside>

        <div className="results">
          <div className="viewTabs" role="tablist" aria-label="Browse jobs by role or company">
            <button role="tab" aria-selected={view==="roles"} className={view==="roles"?"active":""} onClick={()=>setView("roles")}><span>01</span> Browse by role</button>
            <button role="tab" aria-selected={view==="companies"} className={view==="companies"?"active":""} onClick={()=>setView("companies")}><span>02</span> Browse by company</button>
            <button className="addInline" onClick={()=>setShowOnboard(true)}>+ Onboard company</button>
          </div>
          <div className="resultHead">
            <div><p className="label">OFFICIAL CAREERS RESULTS</p><h2>{view==="roles"?`${filtered.length} roles found`:`${companyGroups.length} companies hiring`}</h2></div>
            <div className="controls">
              <label className="toggle"><input type="checkbox" checked={remoteOnly} onChange={e=>setRemoteOnly(e.target.checked)}/><span></span>Remote only</label>
              <select aria-label="Sort jobs" value={sort} onChange={e=>setSort(e.target.value)}><option>Newest</option><option>Company</option></select>
            </div>
          </div>

          {view==="roles" ? <><div className="jobList">
            {filtered.slice(0, visible).map((job) => (
              <article className="job" key={job.id} onClick={()=>setSelected(job)} tabIndex={0} onKeyDown={e=>e.key==="Enter"&&setSelected(job)}>
                <div className="logo">{job.company.slice(0,1)}</div>
                <div className="jobMain">
                  <div className="jobTop"><h3>{job.title}</h3><span>{fmtDate(job.date)}</span></div>
                  <p className="company">{job.company} <i>·</i> {job.location}</p>
                  <p className="summary">{job.summary}</p>
                  <div className="chips"><span className="category">{job.category}</span><span className="hq">{job.sector}</span><span className="source">Official careers</span>{job.remote&&<span>Remote</span>}</div>
                </div>
                <a className="quickApply" aria-label={`Open application for ${job.title}`} href={job.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>Apply ↗</a>
              </article>
            ))}
          </div>
          {visible < filtered.length && <button className="load" onClick={()=>setVisible(v=>v+30)}>Load 30 more <span>↓</span></button>}
          </> : <div className="companyGrid">{companyGroups.map(group=><details className="companyCard" key={group.company}>
            <summary>
              <div className="companyMonogram">{group.company.slice(0,2)}</div>
              <div className="companyIdentity"><p className="label">{group.sector}</p><h3>{group.company}</h3><span>Official {group.source.replace("Direct ","")} careers feed</span></div>
              <div className="companyCount"><strong>{group.jobs.length}</strong><span>open roles</span></div>
              <span className="expand">＋</span>
            </summary>
            <div className="companyMetrics"><span><b>{group.software}</b> Software</span><span><b>{group.ai}</b> Applied AI</span><span><b>{group.remote}</b> Remote</span></div>
            <div className="companyJobs">{group.jobs.map(job=><a key={job.id} href={job.url} target="_blank" rel="noreferrer"><div><b>{job.title}</b><span>{job.location}</span></div><em>{job.category}</em><strong>Apply ↗</strong></a>)}</div>
          </details>)}</div>}
          {!filtered.length && <div className="empty"><b>No roles match that search.</b><p>Try a broader title, skill, or location.</p></div>}
        </div>
      </section>

      {selected && <div className="drawerBackdrop" onClick={()=>setSelected(null)}>
        <aside className="drawer" onClick={e=>e.stopPropagation()}>
          <button className="close" onClick={()=>setSelected(null)}>×</button>
          <span className="category">{selected.category}</span> <span className="source">{selected.source}</span>
          <h2>{selected.title}</h2>
          <h3>{selected.company}</h3>
          <div className="drawerMeta"><span>⌖ {selected.location}</span><span>{selected.remote?"Remote":"On-site / hybrid"}</span><span>{fmtDate(selected.date)}</span></div>
          <p className="hqEvidence"><b>Source verification:</b> {selected.companyEvidence}</p>
          <p>{selected.summary}</p>
          <div className="chips">{selected.tags.slice(0,8).map((t,i)=><span key={`${t}-${i}`}>{t}</span>)}</div>
          {selected.salary && <p className="salary">Listed compensation: <b>{selected.salary}</b></p>}
          <a className="apply" href={selected.url} target="_blank" rel="noreferrer">View original listing ↗</a>
          <small>No résumé matching has been applied. Results are filtered only by US eligibility and role family.</small>
        </aside>
      </div>}
      {showOnboard && <div className="drawerBackdrop" onClick={()=>setShowOnboard(false)}>
        <section className="onboard" onClick={e=>e.stopPropagation()}>
          <button className="close" onClick={()=>setShowOnboard(false)}>×</button>
          <p className="eyebrow">CAREERS DISCOVERY ENGINE</p>
          <h2>Onboard any company.</h2>
          <p>Enter a company and its website. Launchpad will inspect the official site, detect its careers system, and preview every live position directly from the source.</p>
          <form onSubmit={discoverCompany}>
            <label>Company name<input required value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="e.g. Linear"/></label>
            <label>Company website <small>recommended</small><input value={companyWebsite} onChange={e=>setCompanyWebsite(e.target.value)} placeholder="e.g. linear.app"/></label>
            <button className="apply" disabled={discovering}>{discovering?"Scanning official site…":"Find careers page →"}</button>
          </form>
          {discoveryError&&<div className="discoveryError">{discoveryError}</div>}
          {discovery&&<div className="discoveryResult">
            <div className="verified">✓ Official {discovery.provider} feed detected</div>
            <h3>{discovery.company}</h3><p>{discovery.totalJobs} live positions found</p>
            <div className="previewJobs">{discovery.jobs.slice(0,8).map((j:any)=><a key={j.id} href={j.url} target="_blank" rel="noreferrer"><b>{j.title}</b><span>{j.location}</span></a>)}</div>
            {discovery.submitted?<div className="submitted">Company submitted to the tracked registry.</div>:<button className="apply" onClick={submitCompany}>Add company to registry</button>}
          </div>}
        </section>
      </div>}
    </main>
  );
}
