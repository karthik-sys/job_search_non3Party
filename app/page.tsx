"use client";

import { useMemo, useState } from "react";
import jobs from "./jobs-data.json";

type Job = (typeof jobs)[number];

const fmtDate = (value: string) => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  return days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("All sources");
  const [mode, setMode] = useState("All roles");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [sort, setSort] = useState("Newest");
  const [selected, setSelected] = useState<Job | null>(null);
  const [visible, setVisible] = useState(30);

  const sources = ["All sources", ...Array.from(new Set(jobs.map((j) => j.source)))];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = jobs.filter((j) => {
      const haystack = `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")} ${j.summary}`.toLowerCase();
      return (!q || haystack.includes(q)) && (source === "All sources" || j.source === source) && (!remoteOnly || j.remote) && (mode === "All roles" || j.category === mode);
    });
    return sort === "Company" ? [...result].sort((a,b) => a.company.localeCompare(b.company)) : result;
  }, [query, source, remoteOnly, mode, sort]);

  const aiCount = jobs.filter(j => j.category === "Applied AI").length;
  const remoteCount = jobs.filter(j => j.remote).length;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top"><span className="brandMark">L</span><span>Launchpad</span></a>
        <div className="fresh"><span></span> Live dataset · refreshed Aug 13, 2026</div>
        <button className="ghost" onClick={() => window.scrollTo({top:0, behavior:"smooth"})}>Search jobs</button>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">United States engineering opportunity index</div>
        <h1>Your next role,<br/><em>without the noise.</em></h1>
        <p>Software engineering and applied AI openings explicitly based in—or open to candidates in—the United States, gathered from independent job APIs.</p>
        <div className="searchBox">
          <span className="searchIcon">⌕</span>
          <input aria-label="Search jobs" value={query} onChange={e => {setQuery(e.target.value); setVisible(30)}} placeholder="Search titles, skills, companies, locations…" />
          <kbd>⌘ K</kbd>
        </div>
        <div className="stats">
          <div><strong>{jobs.length}</strong><span>open roles</span></div>
          <div><strong>{aiCount}</strong><span>AI-focused</span></div>
          <div><strong>{remoteCount}</strong><span>remote</span></div>
          <div><strong>{new Set(jobs.map(j=>j.source)).size}</strong><span>US sources</span></div>
        </div>
      </section>

      <section className="workspace">
        <aside>
          <p className="label">US JOBS · ROLE FOCUS</p>
          {["All roles","Software engineering","Applied AI"].map(x => <button key={x} className={mode===x?"filter active":"filter"} onClick={()=>{setMode(x);setVisible(30)}}>{x}<span>→</span></button>)}
          <p className="label space">SOURCES</p>
          {sources.map(x => <button key={x} className={source===x?"filter active":"filter"} onClick={()=>{setSource(x);setVisible(30)}}>{x}<span>{x === "All sources" ? jobs.length : jobs.filter(j=>j.source===x).length}</span></button>)}
          <div className="fantastic">
            <div><span className="pulse"></span><b>Fantastic.jobs</b></div>
            <p>Ready to connect your 7-day trial key.</p>
            <a href="https://accounts.fantastic.jobs" target="_blank" rel="noreferrer">Get free trial key ↗</a>
          </div>
        </aside>

        <div className="results">
          <div className="resultHead">
            <div><p className="label">LIVE RESULTS</p><h2>{filtered.length} roles found</h2></div>
            <div className="controls">
              <label className="toggle"><input type="checkbox" checked={remoteOnly} onChange={e=>setRemoteOnly(e.target.checked)}/><span></span>Remote only</label>
              <select aria-label="Sort jobs" value={sort} onChange={e=>setSort(e.target.value)}><option>Newest</option><option>Company</option></select>
            </div>
          </div>

          <div className="jobList">
            {filtered.slice(0, visible).map((job) => (
              <article className="job" key={job.id} onClick={()=>setSelected(job)} tabIndex={0} onKeyDown={e=>e.key==="Enter"&&setSelected(job)}>
                <div className="logo">{job.company.slice(0,1)}</div>
                <div className="jobMain">
                  <div className="jobTop"><h3>{job.title}</h3><span>{fmtDate(job.date)}</span></div>
                  <p className="company">{job.company} <i>·</i> {job.location}</p>
                  <p className="summary">{job.summary}</p>
                  <div className="chips"><span className="category">{job.category}</span><span className="source">{job.source}</span>{job.remote&&<span>Remote</span>}{job.level&&<span>{job.level}</span>}{job.type&&<span>{job.type}</span>}{job.tags.slice(0,2).map((t,i)=><span key={`${t}-${i}`}>{t}</span>)}</div>
                </div>
                <a className="quickApply" aria-label={`Open application for ${job.title}`} href={job.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>Apply ↗</a>
              </article>
            ))}
          </div>
          {visible < filtered.length && <button className="load" onClick={()=>setVisible(v=>v+30)}>Load 30 more <span>↓</span></button>}
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
          <p>{selected.summary}</p>
          <div className="chips">{selected.tags.slice(0,8).map((t,i)=><span key={`${t}-${i}`}>{t}</span>)}</div>
          {selected.salary && <p className="salary">Listed compensation: <b>{selected.salary}</b></p>}
          <a className="apply" href={selected.url} target="_blank" rel="noreferrer">View original listing ↗</a>
          <small>No résumé matching has been applied. Results are filtered only by US eligibility and role family.</small>
        </aside>
      </div>}
    </main>
  );
}
