"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import registry from "./company-registry-preview.json";
import registrySummary from "./company-registry-summary.json";
import feedSummary from "./job-feed-summary.json";

type Job = {
  id: string;
  source: string;
  company: string;
  companySize: string;
  sector: string;
  title: string;
  category: string;
  location: string;
  remote: boolean;
  type: string;
  level: string;
  date: string;
  salary: string;
  tags: string[];
  url: string;
  summary: string;
  companyEvidence: string;
};
type Company = (typeof registry)[number];
type AppliedRecord = {
  jobId: string;
  status: "Applied" | "Assessment" | "Interview" | "Offer" | "Rejected" | "Withdrawn";
  appliedAt: string;
  notes: string;
};

const statusOptions: AppliedRecord["status"][] = ["Applied", "Assessment", "Interview", "Offer", "Rejected", "Withdrawn"];
const interestAliases: Record<string, string[]> = {
  "Machine Learning & AI": ["Machine Learning & AI", "data", "ml", "ai"],
  "Backend & Distributed Systems": ["Software Engineering", "platform", "backend", "infrastructure", "distributed"],
  "Software Engineering": ["Software Engineering"],
  "Product & Design": ["Product & Design"],
  "Go-to-Market": ["Go-to-Market", "sales", "marketing", "customer success"],
  Security: ["Security", "trust", "risk", "privacy"],
  Operations: ["Operations", "strategy", "supply chain"],
};
const searchSynonyms: Record<string, string[]> = {
  ai: ["artificial", "intelligence", "machine", "learning", "ml", "llm", "generative"],
  ml: ["machine", "learning", "ai", "model"],
  swe: ["software", "engineer", "engineering", "developer"],
  dev: ["developer", "software", "engineer"],
  frontend: ["front", "end", "react", "ui"],
  backend: ["back", "end", "api", "distributed", "platform"],
  customer: ["customer", "client", "user", "buyer", "account"],
  support: ["support", "service", "helpdesk", "implementation", "success"],
  sales: ["sales", "account", "revenue", "gtm", "commercial"],
  gtm: ["sales", "marketing", "growth", "revenue", "commercial"],
  product: ["product", "pm", "strategy", "roadmap"],
  design: ["design", "designer", "ux", "ui", "research"],
  security: ["security", "privacy", "risk", "trust", "compliance"],
  ops: ["operations", "strategy", "logistics", "supply"],
};
const normalizeSearch = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
const searchTerms = (value: string) => {
  const base = normalizeSearch(value).split(" ").filter((term) => term && term !== "and" && term.length > 1);
  return Array.from(new Set(base.flatMap((term) => [term, ...(searchSynonyms[term] || [])])));
};
const fieldScore = (field: string, terms: string[], weight: number) => {
  const text = normalizeSearch(field);
  return terms.reduce((score, term) => score + (text.includes(term) ? weight : 0), 0);
};
const relevanceScore = (job: Job, query: string) => {
  const terms = searchTerms(query);
  if (!terms.length) return 1;
  const score =
    fieldScore(job.title, terms, 12) +
    fieldScore(job.category, terms, 10) +
    fieldScore(job.tags.join(" "), terms, 8) +
    fieldScore(job.company, terms, 6) +
    fieldScore(`${job.sector} ${job.companySize} ${job.location}`, terms, 4) +
    fieldScore(job.summary, terms, 2);
  const required = normalizeSearch(query).split(" ").filter((term) => term && term !== "and" && term.length > 1);
  const text = normalizeSearch(`${job.title} ${job.category} ${job.tags.join(" ")} ${job.company} ${job.sector} ${job.summary}`);
  const requiredHits = required.filter((term) => text.includes(term) || (searchSynonyms[term] || []).some((alt) => text.includes(alt))).length;
  const total = score + requiredHits * 5;
  if (required.length && requiredHits < required.length) return 0;
  if (required.length > 1 && total < 45) return 0;
  return total;
};

const fmtDate = (value: string) => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  return days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
};

const matchesInterest = (job: Job, interests: string[]) => {
  if (!interests.length) return true;
  const text = `${job.category} ${job.title} ${job.summary} ${job.tags.join(" ")}`.toLowerCase();
  return interests.some((interest) => (interestAliases[interest] || [interest]).some((term) => text.includes(term.toLowerCase())));
};
const contributionTags = (companyJobs: Job[], limit = 5) => {
  const noisy = new Set(["official careers", "remote", "full time", "hybrid", "onsite", "on-site"]);
  const counts = new Map<string, number>();
  companyJobs.forEach((job) => {
    [job.sector, job.category, ...job.tags].forEach((raw) => {
      const tag = raw?.trim();
      if (!tag || noisy.has(tag.toLowerCase())) return;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([tag]) => tag);
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [source, setSource] = useState("All sources");
  const [sector, setSector] = useState("All sectors");
  const [size, setSize] = useState("All sizes");
  const [mode, setMode] = useState("All roles");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [interestOnly, setInterestOnly] = useState(false);
  const [sort, setSort] = useState("Newest");
  const [selected, setSelected] = useState<Job | null>(null);
  const [visible, setVisible] = useState(30);
  const [view, setView] = useState<"roles" | "companies" | "universe" | "applied">("roles");
  const [showOnboard, setShowOnboard] = useState(false);
  const [showGmail, setShowGmail] = useState(false);
  const [showNebula, setShowNebula] = useState(false);
  const [gmailDays, setGmailDays] = useState("30");
  const [gmailMode, setGmailMode] = useState<"all" | "applied">("all");
  const [gmailScanned, setGmailScanned] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<any>(null);
  const [discoveryError, setDiscoveryError] = useState("");
  const [showTune, setShowTune] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [customPreference, setCustomPreference] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [applied, setApplied] = useState<Record<string, AppliedRecord>>({});

  useEffect(() => {
    const saved = localStorage.getItem("launchpad-applied");
    if (saved) setApplied(JSON.parse(saved));
    fetch("/jobs-data.json").then((response) => response.json()).then(setJobs).catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    localStorage.setItem("launchpad-applied", JSON.stringify(applied));
  }, [applied]);

  async function discoverCompany(e: FormEvent) {
    e.preventDefault();
    setDiscovering(true);
    setDiscovery(null);
    setDiscoveryError("");
    try {
      const r = await fetch("/api/discover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company: companyName, website: companyWebsite }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDiscovery(d);
    } catch (e) {
      setDiscoveryError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  async function submitCompany() {
    if (!discovery) return;
    const r = await fetch("/api/companies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company: discovery.company, website: discovery.officialWebsite, careersUrl: discovery.careersUrl, provider: discovery.provider, slug: discovery.slug }) });
    const d = await r.json();
    setDiscovery({ ...discovery, submitted: r.ok, error: d.error });
  }

  async function analyzePreferences(e: FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: resumeText }) });
    const d = await r.json();
    if (r.ok) setSuggestions(d.suggestions);
  }

  function addPreference(label: string) {
    setPreferences((p) => (p.includes(label) ? p : [...p, label]));
    setInterestOnly(true);
  }

  function toggleApplied(job: Job) {
    setApplied((records) => {
      const next = { ...records };
      if (next[job.id]) delete next[job.id];
      else next[job.id] = { jobId: job.id, status: "Applied", appliedAt: new Date().toISOString(), notes: "" };
      return next;
    });
  }

  const roleFamilies = ["All roles", ...Array.from(new Set(jobs.map((j) => j.category))).sort()];
  const sources = ["All sources", ...Array.from(new Set(jobs.map((j) => j.source)))];
  const sectors = ["All sectors", ...Array.from(new Set([...registry.map((c) => c.sector), ...jobs.map((job) => job.sector)])).sort()];
  const sizes = ["All sizes", "Startup", "Small", "Medium", "Large", "Enterprise", "Unknown"];
  const appliedJobs = jobs.filter((job) => applied[job.id]);
  const sizeCount = (label: string) => label === "All sizes" ? jobs.length : jobs.filter((job) => job.companySize === label).length;
  const discoverySeedJobs = jobs.filter((job) => /engineer|manager|analyst|specialist|associate|designer|scientist|account|support|product/i.test(job.title)).slice(0, 8);
  const emailPreviewSource = gmailMode === "applied" ? appliedJobs : discoverySeedJobs;
  const mockEmailUpdates = emailPreviewSource.slice(0, 8).map((job, index) => ({
    job,
    status: index % 7 === 0 ? "Rejected" : index % 5 === 0 ? "Interview" : index % 3 === 0 ? "Assessment" : "Applied",
    signal: index % 7 === 0 ? "Status update" : index % 5 === 0 ? "Interview invite" : index % 3 === 0 ? "Assessment request" : "Application confirmation",
    confidence: index % 3 === 0 ? "High" : index % 3 === 1 ? "Medium" : "Review",
    matched: Boolean(applied[job.id]),
  }));

  const filtered = useMemo(() => {
    const q = query.trim();
    const result = jobs.map((j) => ({ job: j, score: relevanceScore(j, q) })).filter(({ job, score }) => {
      return (!q || score > 0) && (source === "All sources" || job.source === source) && (sector === "All sectors" || job.sector === sector) && (size === "All sizes" || job.companySize === size) && (!remoteOnly || job.remote) && (mode === "All roles" || job.category === mode) && (!interestOnly || matchesInterest(job, preferences));
    });
    if (q) return result.sort((a, b) => b.score - a.score || new Date(b.job.date).getTime() - new Date(a.job.date).getTime()).map(({ job }) => job);
    const plain = result.map(({ job }) => job);
    if (sort === "Company") return [...plain].sort((a, b) => a.company.localeCompare(b.company));
    if (sort === "Role family") return [...plain].sort((a, b) => a.category.localeCompare(b.category));
    return plain;
  }, [query, source, sector, size, remoteOnly, mode, sort, interestOnly, preferences]);

  const companyGroups = useMemo(() => Array.from(new Set(filtered.map((j) => j.company))).map((company) => {
    const companyJobs = filtered.filter((j) => j.company === company);
    const byRole = Object.fromEntries(Array.from(new Set(companyJobs.map((j) => j.category))).map((role) => [role, companyJobs.filter((j) => j.category === role).length]));
    return { company, jobs: companyJobs, sector: companyJobs[0].sector, companySize: companyJobs[0].companySize, source: companyJobs[0].source, byRole, contributionTags: contributionTags(companyJobs), interestMatches: companyJobs.filter((job) => matchesInterest(job, preferences)).length, remote: companyJobs.filter((j) => j.remote).length };
  }).sort((a, b) => (interestOnly ? b.interestMatches - a.interestMatches : b.jobs.length - a.jobs.length)), [filtered, interestOnly, preferences]);

  const registryFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return registry.filter((company) => {
      const haystack = `${company.name} ${company.website} ${company.sector} ${company.size} ${company.location} ${company.source} ${company.provider} ${company.notes}`.toLowerCase();
      return (!q || haystack.includes(q)) && (sector === "All sectors" || company.sector === sector) && (size === "All sizes" || company.size === size);
    });
  }, [query, sector, size]);
  const nebulaSectors = useMemo(() => Array.from(new Set(jobs.map((job) => job.sector))).map((sectorName, sectorIndex) => {
    const sectorJobs = jobs.filter((job) => job.sector === sectorName);
    const companies = Array.from(new Set(sectorJobs.map((job) => job.company))).map((company) => {
      const companyJobs = sectorJobs.filter((job) => job.company === company);
      return { company, count: companyJobs.length, size: companyJobs[0].companySize, tags: contributionTags(companyJobs, 4), roles: Array.from(new Set(companyJobs.map((job) => job.category))).slice(0, 4) };
    }).sort((a, b) => b.count - a.count).slice(0, 56);
    return { sector: sectorName, count: sectorJobs.length, companies, index: sectorIndex };
  }).sort((a, b) => b.count - a.count), [jobs]);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top"><span className="brandMark">L</span><span>Launchpad</span></a>
        <div className="fresh"><span></span> Official company career feeds</div>
        <div className="headerActions"><button className="ghost" onClick={() => setShowNebula(true)}>Company Nebula</button><button className="ghost" onClick={() => setShowGmail(true)}>Link Gmail</button><button className="ghost" onClick={() => setShowOnboard(true)}>+ Add company</button></div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Company-first US opportunity index</div>
        <h1>Your next role,<br /><em>without the noise.</em></h1>
        <p>All kinds of US roles pulled from official company careers systems. The broad watchlist is 5,000 companies; today’s live results come from supported direct feeds we can resolve.</p>
        <div className="searchBox">
          <span className="searchIcon">⌕</span>
          <input aria-label="Search jobs" value={query} onChange={(e) => { setQuery(e.target.value); setVisible(30); }} placeholder="Search roles, companies, skills, sectors, locations..." />
          <kbd>⌘ K</kbd>
        </div>
        <div className="stats">
          <div><strong>{jobs.length || feedSummary.jobs}</strong><span>US open roles</span></div>
          <div><strong>{new Set(jobs.map((j) => j.company)).size || feedSummary.companiesWithMatches}</strong><span>hiring companies</span></div>
          <div><strong>{feedSummary.feedsChecked}</strong><span>feeds checked</span></div>
          <div><strong>{registrySummary.total}</strong><span>companies tracked</span></div>
        </div>
      </section>

      <section className="workspace">
        <aside>
          <p className="label">US JOBS · ROLE FAMILY</p>
          {roleFamilies.map((x) => <button key={x} className={mode === x ? "filter active" : "filter"} onClick={() => { setMode(x); setVisible(30); }}>{x}<span>{x === "All roles" ? jobs.length : jobs.filter((j) => j.category === x).length}</span></button>)}
          <p className="label space">COMPANY SIZE · LIVE ROLES</p>
          {sizes.map((x) => <button key={x} className={size === x ? "filter active" : "filter"} onClick={() => setSize(x)}>{x}<span>{sizeCount(x)}</span></button>)}
          <p className="label space">SECTORS</p>
          {sectors.map((x) => <button key={x} className={sector === x ? "filter active" : "filter"} onClick={() => { setSector(x); setVisible(30); }}>{x}<span>{x === "All sectors" ? registry.length : registry.filter((c) => c.sector === x).length}</span></button>)}
          <div className="fantastic"><div><span className="pulse"></span><b>Coverage model</b></div><p>Watchlist: {registrySummary.total} companies. Supported feeds checked: {feedSummary.feedsChecked}. Resolved today: {feedSummary.boardsResolved}. Hiring now: {feedSummary.companiesWithMatches}.</p></div>
        </aside>

        <div className="results">
          <div className="viewTabs" role="tablist" aria-label="Browse jobs">
            <button role="tab" aria-selected={view === "roles"} className={view === "roles" ? "active" : ""} onClick={() => setView("roles")}><span>01</span> Roles</button>
            <button role="tab" aria-selected={view === "companies"} className={view === "companies" ? "active" : ""} onClick={() => setView("companies")}><span>02</span> Hiring companies</button>
            <button role="tab" aria-selected={view === "universe"} className={view === "universe" ? "active" : ""} onClick={() => setView("universe")}><span>03</span> 5,000 tracked</button>
            <button role="tab" aria-selected={view === "applied"} className={view === "applied" ? "active" : ""} onClick={() => setView("applied")}><span>04</span> Applied</button>
            <button className="addInline" onClick={() => setShowOnboard(true)}>+ Onboard company</button>
          </div>

          <div className="personalizeBar">
            <div><span>Optional personalization</span><b>{preferences.length ? preferences.join(" · ") : "Browse neutrally, or tune the index to your interests."}</b></div>
            <div className="personalActions"><label className="toggle"><input type="checkbox" checked={interestOnly} disabled={!preferences.length} onChange={(e) => setInterestOnly(e.target.checked)} /><span></span>Use interests</label><button onClick={() => setShowTune(true)}>{preferences.length ? "Edit interests" : "Tune for me ->"}</button></div>
          </div>

          <div className="resultHead">
            <div><p className="label">OFFICIAL CAREERS RESULTS</p><h2>{view === "roles" ? `${filtered.length} roles found` : view === "companies" ? `${companyGroups.length} companies hiring` : view === "applied" ? `${appliedJobs.length} applied roles` : `${registryFiltered.length} tracked companies shown`}</h2></div>
            <div className="controls">
              <label className="toggle"><input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} /><span></span>Remote only</label>
              <select aria-label="Sort jobs" value={sort} onChange={(e) => setSort(e.target.value)}><option>Newest</option><option>Company</option><option>Role family</option></select>
            </div>
          </div>

          {view === "roles" && <><div className="jobList">{filtered.slice(0, visible).map((job) => <JobCard key={job.id} job={job} applied={Boolean(applied[job.id])} onOpen={() => setSelected(job)} onApply={() => toggleApplied(job)} />)}</div>{visible < filtered.length && <button className="load" onClick={() => setVisible((v) => v + 30)}>Load 30 more <span>↓</span></button>}</>}

          {view === "companies" && <div className="companyGrid">{companyGroups.map((group) => <details className="companyCard" key={group.company}>
            <summary><div className="companyMonogram">{group.company.slice(0, 2)}</div><div className="companyIdentity"><p className="label">{group.companySize} · {group.sector}</p><h3>{group.company}</h3><span>Official {group.source.replace("Direct ", "")} careers feed</span><div className="companyTags">{group.contributionTags.map((tag) => <em key={tag}>{tag}</em>)}</div></div><div className="companyCount"><strong>{group.jobs.length}</strong><span>open roles</span></div><span className="expand">+</span></summary>
            <div className="companyMetrics">{Object.entries(group.byRole).slice(0, 5).map(([role, count]) => <span key={role}><b>{count}</b> {role}</span>)}<span><b>{group.remote}</b> Remote</span></div>
            <div className="companyJobs">{group.jobs.map((job) => <a key={job.id} href={job.url} target="_blank" rel="noreferrer"><div><b>{job.title}</b><span>{job.location}</span></div><em>{job.category}</em><strong>Apply ↗</strong></a>)}</div>
          </details>)}</div>}

          {view === "universe" && <div className="registryGrid">{registryFiltered.slice(0, 240).map((company: Company) => <article className="registryCard" key={company.id}><div><p className="label">{company.size} · {company.sector}</p><h3>{company.name}</h3><span>{company.location}</span></div><div className="registryMeta"><span>{company.provider}</span><span>{company.source}</span></div>{company.website && <a href={company.website} target="_blank" rel="noreferrer">Website ↗</a>}</article>)}</div>}

          {view === "applied" && <div className="appliedPanel">
            <div className="gmailCta"><div><p className="label">OPTIONAL EMAIL SYNC</p><h3>Track application updates from Gmail</h3><span>Choose a lookback window, preview detected application emails, then import status changes.</span></div><button className="ghost" onClick={() => setShowGmail(true)}>Connect / import</button></div>
            {appliedJobs.map((job) => <article className="appliedRow" key={job.id}><div><b>{job.title}</b><span>{job.company} · marked {fmtDate(applied[job.id].appliedAt)}</span></div><select value={applied[job.id].status} onChange={(e) => setApplied((records) => ({ ...records, [job.id]: { ...records[job.id], status: e.target.value as AppliedRecord["status"] } }))}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select><a href={job.url} target="_blank" rel="noreferrer">Open</a></article>)}
            {!appliedJobs.length && <div className="empty"><b>No applied roles yet.</b><p>Check a role as applied and it will appear here.</p></div>}
          </div>}
          {!filtered.length && view === "roles" && <div className="empty"><b>No roles match that search.</b><p>Try a broader title, skill, or location.</p></div>}
        </div>
      </section>

      {selected && <div className="drawerBackdrop" onClick={() => setSelected(null)}><aside className="drawer" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setSelected(null)}>×</button><span className="category">{selected.category}</span> <span className="source">{selected.source}</span><h2>{selected.title}</h2><h3>{selected.company}</h3><div className="drawerMeta"><span>⌖ {selected.location}</span><span>{selected.remote ? "Remote" : "On-site / hybrid"}</span><span>{fmtDate(selected.date)}</span></div><p className="hqEvidence"><b>Source verification:</b> {selected.companyEvidence}</p><p>{selected.summary}</p><div className="chips">{selected.tags.slice(0, 8).map((t, i) => <span key={`${t}-${i}`}>{t}</span>)}</div><button className="apply" onClick={() => toggleApplied(selected)}>{applied[selected.id] ? "Remove from applied" : "Mark as applied"}</button><a className="apply secondaryApply" href={selected.url} target="_blank" rel="noreferrer">View original listing ↗</a><small>Personalization is optional. Results remain official-company listings and are not résumé match scores.</small></aside></div>}

      {showOnboard && <div className="drawerBackdrop" onClick={() => setShowOnboard(false)}><section className="onboard" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowOnboard(false)}>×</button><p className="eyebrow">CAREERS DISCOVERY ENGINE</p><h2>Onboard any company.</h2><p>Enter a company and its website. Launchpad will inspect the official site, detect its careers system, and preview every live position directly from the source.</p><form onSubmit={discoverCompany}><label>Company name<input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Linear" /></label><label>Company website <small>recommended</small><input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} placeholder="e.g. linear.app" /></label><button className="apply" disabled={discovering}>{discovering ? "Scanning official site..." : "Find careers page ->"}</button></form>{discoveryError && <div className="discoveryError">{discoveryError}</div>}{discovery && <div className="discoveryResult"><div className="verified">Official {discovery.provider} feed detected</div><h3>{discovery.company}</h3><p>{discovery.totalJobs} live positions found</p><div className="previewJobs">{discovery.jobs.slice(0, 8).map((j: any) => <a key={j.id} href={j.url} target="_blank" rel="noreferrer"><b>{j.title}</b><span>{j.location}</span></a>)}</div>{discovery.submitted ? <div className="submitted">Company submitted to the tracked registry.</div> : <button className="apply" onClick={submitCompany}>Add company to registry</button>}</div>}</section></div>}

      {showTune && <div className="drawerBackdrop" onClick={() => setShowTune(false)}><section className="onboard" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowTune(false)}>×</button><p className="eyebrow">OPTIONAL · USER CONTROLLED</p><h2>Tune the noise out.</h2><p>Paste résumé text for suggested interest areas. Nothing is stored, and every suggestion can be ignored or replaced with your own.</p><form onSubmit={analyzePreferences}><label>Résumé text<textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste résumé text here..." /></label><button className="apply">Suggest interest areas</button></form>{suggestions.length > 0 && <div className="suggestions"><p className="label">SUGGESTED - CHOOSE ANY</p>{suggestions.map((s) => <button key={s.id} className={preferences.includes(s.label) ? "chosen" : ""} onClick={() => addPreference(s.label)}><b>{s.label}</b><span>{s.signals.join(" · ")}</span><em>{preferences.includes(s.label) ? "Added" : "+ Add"}</em></button>)}</div>}<div className="customPref"><input value={customPreference} onChange={(e) => setCustomPreference(e.target.value)} placeholder="Create your own interest..." /><button onClick={() => { if (customPreference.trim()) { addPreference(customPreference.trim()); setCustomPreference(""); } }}>Add</button></div><small>Interests now affect filters when Use interests is on. Résumé text is analyzed transiently and is not saved.</small></section></div>}

      {showGmail && <div className="drawerBackdrop" onClick={() => setShowGmail(false)}><section className="onboard" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowGmail(false)}>×</button><p className="eyebrow">OPTIONAL GMAIL SYNC</p><h2>Email-aware tracking.</h2><p>Run a broad discovery scan to see application-looking emails first, or switch to matched mode when you only want updates for roles you marked as applied.</p><div className="gmailModeTabs"><button className={gmailMode === "all" ? "active" : ""} onClick={() => { setGmailMode("all"); setGmailScanned(false); }}>All detected emails</button><button className={gmailMode === "applied" ? "active" : ""} onClick={() => { setGmailMode("applied"); setGmailScanned(false); }}>Matched to applied</button></div><div className="gmailControls"><label>Look back<select value={gmailDays} onChange={(e) => { setGmailDays(e.target.value); setGmailScanned(false); }}><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90">Last 90 days</option></select></label><button className="apply" onClick={() => setGmailScanned(true)}>{gmailMode === "all" ? "Preview all application emails" : "Preview matched updates"}</button></div><div className="gmailMock"><div><b>Detected update types</b><span>Application received · Assessment · Interview · Offer · Rejection</span></div><div><b>Matching strategy</b><span>{gmailMode === "all" ? "Searches application-like messages first, then suggests likely company/role matches." : "Only checks companies and roles you already marked as applied."}</span></div></div>{gmailScanned && <div className="emailResults"><p className="label">PREVIEW · LAST {gmailDays} DAYS · {gmailMode === "all" ? "ALL DETECTED" : "MATCHED ONLY"}</p>{mockEmailUpdates.length ? mockEmailUpdates.map(({ job, status, signal, confidence, matched }) => <article key={job.id}><div><b>{signal}</b><span>{job.company} · {job.title}</span><div className="emailBadges"><em>{confidence} confidence</em><em>{matched ? "Already applied" : "Not marked applied"}</em></div></div><button onClick={() => setApplied((records) => ({ ...records, [job.id]: { ...(records[job.id] || { jobId: job.id, appliedAt: new Date().toISOString(), notes: "" }), status: status as AppliedRecord["status"] } }))}>Import {status}</button></article>) : <div className="empty smallEmpty"><b>{gmailMode === "applied" ? "No marked-applied roles to match yet." : "No application-looking emails found in this demo window."}</b><p>{gmailMode === "applied" ? "Switch to All detected emails to test discovery before marking roles." : "Try a longer lookback window or connect production OAuth sync."}</p></div>}</div>}<small>The live Sites app cannot directly use the Codex Gmail connector. In a public release this button should start a user-owned OAuth flow; imported metadata should be deletable and sync should be revocable.</small></section></div>}
      {showNebula && <div className="nebulaOverlay"><button className="nebulaClose" onClick={() => setShowNebula(false)}>×</button><section className="nebulaShell"><div className="nebulaIntro"><p className="eyebrow">US MARKET MAP</p><h2>Company Nebula</h2><p>Explore sectors as markets, companies as gravitational nodes, and role volume as mass. Nodes now include company contribution tags inferred from official posting language.</p><div className="nebulaStats"><span>{nebulaSectors.length} sectors</span><span>{feedSummary.companiesWithMatches} hiring companies</span><span>{feedSummary.jobs} roles</span></div></div><div className="nebulaStage">{nebulaSectors.map((cluster, i) => <article className="sectorCluster" key={cluster.sector} style={{ "--i": i, "--size": Math.min(1.9, 0.72 + cluster.count / Math.max(1, feedSummary.jobs) * 9), "--x": `${(i % 4 - 1.5) * 175}px`, "--y": `${(Math.floor(i / 4) - 1) * 155}px`, "--z": `${(i % 3 - 1) * 105}px` } as CSSProperties}><div className="sectorCore"><b>{cluster.sector}</b><span>{cluster.companies.length} companies · {cluster.count} roles</span></div>{cluster.companies.map((company, j) => <div className="companyNode" key={company.company} style={{ "--angle": `${(j * 137.5) % 360}deg`, "--orbit": `${92 + (j % 4) * 34 + Math.floor(j / 16) * 12}px`, "--mass": Math.min(2.15, 0.55 + company.count / Math.max(1, cluster.companies[0]?.count || 1) * 1.25) } as CSSProperties} title={`${company.company}: ${company.count} roles · ${company.tags.join(" · ")}`}><strong>{company.company.slice(0, 2)}</strong><em>{company.count}</em><span>{company.tags[0]}</span></div>)}</article>)}</div><aside className="nebulaLegend"><h3>Market signals</h3>{nebulaSectors.slice(0, 12).map((cluster) => <button key={cluster.sector} onClick={() => { setSector(cluster.sector); setView("companies"); setShowNebula(false); }}><span>{cluster.sector}</span><b>{cluster.companies.length} companies shown · {cluster.count} roles</b></button>)}</aside></section></div>}
    </main>
  );
}

function JobCard({ job, applied, onOpen, onApply }: { job: Job; applied: boolean; onOpen: () => void; onApply: () => void }) {
  return <article className="job" onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
    <label className="appliedCheck" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={applied} onChange={onApply} /><span></span></label>
    <div className="logo">{job.company.slice(0, 1)}</div>
    <div className="jobMain"><div className="jobTop"><h3>{job.title}</h3><span>{fmtDate(job.date)}</span></div><p className="company">{job.company} <i>·</i> {job.location}</p><p className="summary">{job.summary}</p><div className="chips"><span className="category">{job.category}</span><span className="hq">{job.companySize}</span><span className="hq">{job.sector}</span><span className="source">Official careers</span>{job.remote && <span>Remote</span>}{applied && <span className="appliedChip">Applied</span>}</div></div>
    <a className="quickApply" aria-label={`Open application for ${job.title}`} href={job.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Apply ↗</a>
  </article>;
}
