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
type GmailStatus = { configured: boolean; missing: string[]; connected: boolean; email: string | null; connectedAt: string | null };
type GmailUpdate = {
  id: string;
  company: string;
  role: string;
  signal: string;
  status: AppliedRecord["status"];
  subject: string;
  from: string;
  date: string;
  snippet: string;
  confidence: "High" | "Medium" | "Review";
  sourceUrl: string;
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
  const [nebulaClarity, setNebulaClarity] = useState<"markets" | "selection" | "all">("markets");
  const [nebulaRotation, setNebulaRotation] = useState(28);
  const [nebulaTilt, setNebulaTilt] = useState(62);
  const [nebulaZoom, setNebulaZoom] = useState(1);
  const [selectedNebulaSector, setSelectedNebulaSector] = useState<string | null>(null);
  const [selectedNebulaCompany, setSelectedNebulaCompany] = useState<string | null>(null);
  const [selectedNebulaSignal, setSelectedNebulaSignal] = useState<string | null>(null);
  const [gmailDays, setGmailDays] = useState("30");
  const [gmailMode, setGmailMode] = useState<"all" | "applied">("all");
  const [gmailScanned, setGmailScanned] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailUpdates, setGmailUpdates] = useState<GmailUpdate[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState("");
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
    async function loadJobs() {
      const plain = await fetch("/jobs-data.json").then((response) => response.json()).catch(() => []);
      if (Array.isArray(plain) && plain.length) {
        setJobs(plain);
        return;
      }
      if (!("DecompressionStream" in window)) throw new Error("Compressed job snapshot requires DecompressionStream.");
      const manifest = await fetch("/job-snapshot/manifest.json").then((response) => response.json()) as { encoding: "gzip"; parts: string[] };
      const chunks = await Promise.all(manifest.parts.map((part) => fetch(`/job-snapshot/${part}`).then((response) => response.arrayBuffer())));
      const compressed = new Blob(chunks);
      const stream = compressed.stream().pipeThrough(new DecompressionStream(manifest.encoding));
      const text = await new Response(stream).text();
      setJobs(JSON.parse(text));
    }
    loadJobs().catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    localStorage.setItem("launchpad-applied", JSON.stringify(applied));
  }, [applied]);

  useEffect(() => {
    if (!showGmail) return;
    fetch("/api/gmail/status").then((response) => response.json()).then(setGmailStatus).catch(() => setGmailStatus(null));
  }, [showGmail]);

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

  async function scanGmail() {
    setGmailLoading(true);
    setGmailError("");
    setGmailScanned(true);
    setGmailUpdates([]);
    try {
      if (!gmailStatus?.connected) {
        setGmailLoading(false);
        return;
      }
      const appliedCompanies = appliedJobs.map((job) => job.company);
      const appliedRoles = appliedJobs.map((job) => job.title);
      const response = await fetch("/api/gmail/updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: gmailDays, mode: gmailMode, companies: appliedCompanies, roles: appliedRoles }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Gmail scan failed.");
      setGmailUpdates(data.updates ?? []);
    } catch (e) {
      setGmailError(e instanceof Error ? e.message : "Gmail scan failed.");
    } finally {
      setGmailLoading(false);
    }
  }

  async function disconnectGmail() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setGmailStatus((status) => status ? { ...status, connected: false, email: null, connectedAt: null } : status);
    setGmailUpdates([]);
    setGmailScanned(false);
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
  }, [jobs, query, source, sector, size, remoteOnly, mode, sort, interestOnly, preferences]);

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
  const nebulaSectors = useMemo(() => sectors.filter((name) => name !== "All sectors").map((sectorName, sectorIndex) => {
    const sectorNeedle = sectorName.toLowerCase();
    const sectorJobs = jobs.filter((job) => {
      const postingSignals = [job.sector, job.category, ...job.tags].map((signal) => signal.toLowerCase());
      return postingSignals.includes(sectorNeedle);
    });
    const companies = Array.from(new Set(sectorJobs.map((job) => job.company))).map((company) => {
      const companyJobs = sectorJobs.filter((job) => job.company === company);
      return { company, count: companyJobs.length, size: companyJobs[0].companySize, tags: contributionTags(companyJobs, 4), roles: Array.from(new Set(companyJobs.map((job) => job.category))).slice(0, 4) };
    }).sort((a, b) => b.count - a.count);
    return { sector: sectorName, count: sectorJobs.length, companies, tags: contributionTags(sectorJobs, 6), index: sectorIndex };
  }).filter((cluster) => cluster.count > 0).sort((a, b) => b.count - a.count), [jobs, sectors]);
  const selectedNebulaCluster = nebulaSectors.find((cluster) => cluster.sector === selectedNebulaSector) ?? nebulaSectors[0];
  const selectedNebulaCompanyNode = selectedNebulaCluster?.companies.find((company) => company.company === selectedNebulaCompany) ?? selectedNebulaCluster?.companies[0];
  const visibleNebulaCompanies = selectedNebulaCluster?.companies.slice(0, 50) ?? [];
  const selectedCompanyMarketJobs = selectedNebulaCompanyNode && selectedNebulaCluster ? jobs.filter((job) => {
    const signals = [job.sector, job.category, ...job.tags];
    return job.company === selectedNebulaCompanyNode.company && signals.some((signal) => signal.toLowerCase() === selectedNebulaCluster.sector.toLowerCase());
  }) : [];
  const selectedCompanySignals = selectedCompanyMarketJobs.length ? Array.from(selectedCompanyMarketJobs.reduce((counts, job) => {
    [job.category, ...job.tags].forEach((raw) => {
      const signal = raw?.trim();
      if (!signal || ["official careers", "remote", "full time", "hybrid", "onsite", "on-site"].includes(signal.toLowerCase())) return;
      counts.set(signal, (counts.get(signal) || 0) + 1);
    });
    return counts;
  }, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([signal, count]) => ({ signal, count })) : [];
  const selectedSignalJobs = selectedNebulaSignal ? selectedCompanyMarketJobs.filter((job) => [job.category, ...job.tags].some((signal) => signal.toLowerCase() === selectedNebulaSignal.toLowerCase())).slice(0, 10) : selectedCompanyMarketJobs.slice(0, 10);
  const nebulaInteractions = selectedNebulaCompanyNode && selectedNebulaCluster ? selectedNebulaCluster.companies
    .filter((company) => company.company !== selectedNebulaCompanyNode.company)
    .map((company) => {
      const sharedTags = company.tags.filter((tag) => selectedNebulaCompanyNode.tags.includes(tag));
      const sharedRoles = company.roles.filter((role) => selectedNebulaCompanyNode.roles.includes(role));
      return { company, sharedTags, sharedRoles, score: sharedTags.length * 3 + sharedRoles.length * 2 + Math.min(3, company.count / 50) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8) : [];
  const selectedMarketJobs = selectedNebulaCluster ? jobs.filter((job) => [job.sector, job.category, ...job.tags].some((signal) => signal.toLowerCase() === selectedNebulaCluster.sector.toLowerCase())) : [];
  const selectedMarketRoleMix = Array.from(selectedMarketJobs.reduce((counts, job) => counts.set(job.category, (counts.get(job.category) || 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const selectedMarketRemoteShare = selectedMarketJobs.length ? Math.round(selectedMarketJobs.filter((job) => job.remote).length / selectedMarketJobs.length * 100) : 0;
  const selectedMarketLeaderShare = selectedNebulaCluster?.companies[0]?.count && selectedNebulaCluster.count ? Math.round(selectedNebulaCluster.companies[0].count / selectedNebulaCluster.count * 100) : 0;
  const selectedMarketFreshJobs = selectedMarketJobs.filter((job) => (Date.now() - new Date(job.date).getTime()) / 86400000 <= 7).length;
  const nebulaPathSignals = selectedCompanySignals.slice(0, 8);

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

      {showGmail && <div className="drawerBackdrop" onClick={() => setShowGmail(false)}><section className="onboard" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowGmail(false)}>×</button><p className="eyebrow">OPTIONAL GMAIL SYNC</p><h2>Email-aware tracking.</h2><p>Connect Gmail with Google OAuth read-only access. Real imported rows show sender, subject, date, and an open-email link. If OAuth is not configured, Launchpad keeps demo rows clearly separated.</p>{gmailStatus?.connected ? <div className="gmailTruth real">Connected to {gmailStatus.email ?? "Gmail"} · read-only</div> : <div className="gmailTruth">{gmailStatus?.configured ? "Gmail is ready · connect to scan your inbox" : "Gmail connection is waiting on admin setup"}</div>}<div className="gmailModeTabs"><button className={gmailMode === "all" ? "active" : ""} onClick={() => { setGmailMode("all"); setGmailScanned(false); }}>All Gmail updates</button><button className={gmailMode === "applied" ? "active" : ""} onClick={() => { setGmailMode("applied"); setGmailScanned(false); }}>Matched to applied</button></div><div className="gmailControls"><label>Look back<select value={gmailDays} onChange={(e) => { setGmailDays(e.target.value); setGmailScanned(false); }}><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90">Last 90 days</option></select></label>{gmailStatus?.connected ? <button className="apply" onClick={scanGmail} disabled={gmailLoading}>{gmailLoading ? "Scanning Gmail..." : "Scan real Gmail"}</button> : gmailStatus?.configured ? <a className="apply" href="/api/gmail/auth">Connect Gmail with Google →</a> : <button className="apply" disabled>Admin setup needed</button>}</div>{gmailStatus?.connected && <button className="ghost disconnectGmail" onClick={disconnectGmail}>Disconnect Gmail</button>}{gmailError && <div className="discoveryError">{gmailError}</div>}<div className="gmailMock"><div><b>Read-only scope</b><span>Gmail metadata, sender, subject, snippets, and source links. No send, archive, trash, or label access.</span></div><div><b>Matching strategy</b><span>{gmailMode === "all" ? "Searches recent application-looking messages in Gmail." : "Searches Gmail for companies and roles you marked as applied."}</span></div></div>{gmailScanned && <div className="emailResults"><p className="label">{gmailStatus?.connected ? "REAL GMAIL" : "DEMO PREVIEW"} · LAST {gmailDays} DAYS · {gmailMode === "all" ? "ALL UPDATES" : "MATCHED ONLY"}</p>{gmailStatus?.connected ? (gmailUpdates.length ? gmailUpdates.map((update) => <article key={update.id}><div><b>{update.signal}</b><span>{update.company} · {update.role}</span><div className="emailSource"><span>{update.subject}</span><span>{update.from}</span><span>{update.date}</span></div><div className="emailBadges"><em>Gmail source</em><em>{update.confidence} confidence</em></div></div><a href={update.sourceUrl} target="_blank" rel="noreferrer">Open email ↗</a></article>) : <div className="empty smallEmpty"><b>No Gmail updates found.</b><p>Try a longer lookback window or switch scan mode.</p></div>) : (mockEmailUpdates.length ? mockEmailUpdates.map(({ job, status, signal, confidence, matched }) => <article key={job.id}><div><b>{signal}</b><span>{job.company} · {job.title}</span><div className="emailBadges"><em>Demo row</em><em>{confidence} match confidence</em><em>{matched ? "Already applied" : "Not marked applied"}</em></div></div><button onClick={() => setApplied((records) => ({ ...records, [job.id]: { ...(records[job.id] || { jobId: job.id, appliedAt: new Date().toISOString(), notes: "" }), status: status as AppliedRecord["status"] } }))}>Simulate {status}</button></article>) : <div className="empty smallEmpty"><b>No demo matches in this window.</b><p>Connect Gmail to scan real application updates.</p></div>)}</div>}<small>OAuth tokens are stored in an encrypted HttpOnly cookie for this demo. A hardened public release should move refresh tokens to durable per-user storage and complete Google verification.</small></section></div>}
      {showNebula && <div className="marketOverlay"><button className="nebulaClose" onClick={() => setShowNebula(false)}>×</button><section className="marketShell">
        <header className="marketChrome"><div><p className="eyebrow">US MARKET GRAPH</p><h2>Company Nebula</h2><p>Explore US hiring as a recursive market graph: industries lead to companies, companies open into work signals, and signals resolve into the actual roles behind them.</p></div><div className="marketStats"><span>{nebulaSectors.length} industries</span><span>{feedSummary.companiesWithMatches} hiring companies</span><span>{feedSummary.jobs} roles</span></div></header>
        <div className="marketToolbar"><div><button className={nebulaClarity === "markets" ? "active" : ""} onClick={() => setNebulaClarity("markets")}>Markets</button><button className={nebulaClarity === "selection" ? "active" : ""} onClick={() => setNebulaClarity("selection")}>Selection</button><button className={nebulaClarity === "all" ? "active" : ""} onClick={() => setNebulaClarity("all")}>All nodes</button></div><label>Rotate<input type="range" min="-55" max="55" value={nebulaRotation} onChange={(e) => setNebulaRotation(Number(e.target.value))} /></label><label>Tilt<input type="range" min="42" max="76" value={nebulaTilt} onChange={(e) => setNebulaTilt(Number(e.target.value))} /></label><label>Zoom<input type="range" min="0.75" max="1.35" step="0.05" value={nebulaZoom} onChange={(e) => setNebulaZoom(Number(e.target.value))} /></label></div>
        <div className="marketGraphLayout">
          <div className="marketGraphStage" aria-label="Interactive US job market graph"><div className="marketGraphScene" style={{ "--rz": `${nebulaRotation}deg`, "--rx": `${nebulaTilt}deg`, "--zoom": nebulaZoom } as CSSProperties}>
            <div className="marketOrbit orbitOne"></div><div className="marketOrbit orbitTwo"></div><div className="marketOrbit orbitThree"></div>
            <button className="marketCore" onClick={() => { setNebulaClarity("markets"); setSelectedNebulaSector(null); setSelectedNebulaSignal(null); }}><b>US</b><span>{feedSummary.jobs.toLocaleString()} roles</span></button>
            {nebulaSectors.map((cluster, i) => {
              const active = selectedNebulaCluster?.sector === cluster.sector;
              return <button key={cluster.sector} className={`marketSectorNode ${active ? "active" : ""} ${nebulaClarity === "markets" || active || nebulaClarity === "all" ? "" : "dim"}`} style={{ "--angle": `${(i / Math.max(1, nebulaSectors.length)) * 360 - 90}deg`, "--radius": `${nebulaClarity === "markets" ? 265 : 235}px`, "--mass": Math.min(1.9, 0.78 + cluster.count / Math.max(1, nebulaSectors[0]?.count || 1) * 1.05) } as CSSProperties} onClick={() => { setSelectedNebulaSector(cluster.sector); setSelectedNebulaCompany(null); setSelectedNebulaSignal(null); setNebulaClarity("selection"); }}>
                <strong>{cluster.sector}</strong><span>{cluster.companies.length} companies · {cluster.count} roles</span>
              </button>;
            })}
            {nebulaClarity !== "markets" && visibleNebulaCompanies.map((company, i) => <button key={company.company} className={`marketCompanyNode ${selectedNebulaCompanyNode?.company === company.company ? "active" : ""}`} style={{ "--angle": `${(i * 137.5) % 360}deg`, "--radius": `${118 + (i % 3) * 52 + Math.floor(i / 12) * 28}px`, "--mass": Math.min(1.75, 0.72 + company.count / Math.max(1, visibleNebulaCompanies[0]?.count || 1) * 0.9) } as CSSProperties} onClick={() => { setSelectedNebulaCompany(company.company); setSelectedNebulaSignal(null); }} title={`${company.company}: ${company.tags.join(" · ")}`}><strong>{company.company.slice(0, 2)}</strong><span>{company.company}</span><em>{company.count}</em></button>)}
            {nebulaClarity !== "markets" && nebulaPathSignals.map((node, i) => <div key={`path-${node.signal}`} className="marketPathBeam" style={{ "--angle": `${(i / Math.max(1, nebulaPathSignals.length)) * 360 + 18}deg`, "--length": `${92 + Math.min(80, node.count * 6)}px` } as CSSProperties}></div>)}
            {nebulaClarity !== "markets" && selectedCompanySignals.map((node, i) => <button key={node.signal} className={`marketSignalNode ${selectedNebulaSignal === node.signal ? "active" : ""}`} style={{ "--angle": `${(i / Math.max(1, selectedCompanySignals.length)) * 360 + 18}deg`, "--radius": `${62 + (i % 2) * 36}px`, "--mass": Math.min(1.4, 0.8 + node.count / Math.max(1, selectedCompanySignals[0]?.count || 1) * 0.55) } as CSSProperties} onClick={() => setSelectedNebulaSignal(node.signal)} title={`${selectedNebulaCompanyNode?.company}: ${node.signal}`}><strong>{node.signal}</strong><em>{node.count}</em></button>)}
          </div></div>
          <aside className="marketInspector">
            <div className="marketBreadcrumb"><button onClick={() => { setNebulaClarity("markets"); setSelectedNebulaSector(null); setSelectedNebulaSignal(null); }}>US market</button><span>→</span><button onClick={() => { setNebulaClarity("selection"); setSelectedNebulaSignal(null); }}>{selectedNebulaCluster?.sector ?? "Select market"}</button>{selectedNebulaCompanyNode && <><span>→</span><button onClick={() => setSelectedNebulaSignal(null)}>{selectedNebulaCompanyNode.company}</button></>}{selectedNebulaSignal && <><span>→</span><b>{selectedNebulaSignal}</b></>}</div>
            <p className="eyebrow">SELECTED MARKET</p><h3>{selectedNebulaCluster?.sector ?? "US job market"}</h3><p>{selectedNebulaCluster ? `${selectedNebulaCluster.count.toLocaleString()} official-posting contributions across ${selectedNebulaCluster.companies.length} hiring companies. Showing up to the top 50 company nodes for this market. Companies can appear in multiple markets when their own postings carry those signals.` : "Choose an industry node to inspect company contribution signals."}</p>
            {selectedNebulaCluster && <div className="marketTags">{selectedNebulaCluster.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            {selectedNebulaCluster && <div className="marketBriefing"><b>Market briefing</b><div><span>Fresh roles</span><strong>{selectedMarketFreshJobs.toLocaleString()}</strong><em>last 7 days</em></div><div><span>Remote share</span><strong>{selectedMarketRemoteShare}%</strong><em>of postings</em></div><div><span>Leader concentration</span><strong>{selectedMarketLeaderShare}%</strong><em>{selectedNebulaCluster.companies[0]?.company ?? "top company"}</em></div>{selectedMarketRoleMix.length > 0 && <section><span>Dominant role families</span>{selectedMarketRoleMix.map(([role, count]) => <button key={role} onClick={() => { setMode(role); setSector("All sectors"); setQuery(selectedNebulaCluster.sector); setView("roles"); setShowNebula(false); }}>{role}<strong>{count}</strong></button>)}</section>}</div>}
            {selectedNebulaCompanyNode && <div className="companyLens"><span>Company lens</span><h4>{selectedNebulaCompanyNode.company}</h4><b>{selectedNebulaCompanyNode.count} market contributions</b><div>{selectedCompanySignals.map((node) => <em key={node.signal} onClick={() => setSelectedNebulaSignal(node.signal)}>{node.signal}</em>)}</div><button onClick={() => { setQuery(selectedNebulaCompanyNode.company); setSector("All sectors"); setView("companies"); setShowNebula(false); }}>Open company results →</button></div>}
            {selectedCompanySignals.length > 0 && <div className="marketTopCompanies"><b>Nested signals for {selectedNebulaCompanyNode?.company}</b>{selectedCompanySignals.map((node) => <button key={node.signal} className={selectedNebulaSignal === node.signal ? "active" : ""} onClick={() => setSelectedNebulaSignal(node.signal)}><span>{node.signal}</span><em>{selectedNebulaCluster?.sector} contribution node</em><strong>{node.count}</strong></button>)}</div>}
            {selectedSignalJobs.length > 0 && <div className="marketTopCompanies"><b>{selectedNebulaSignal ? `Postings tagged ${selectedNebulaSignal}` : "Postings behind this company node"}</b>{selectedSignalJobs.map((job) => <button key={job.id} onClick={() => { setSelected(job); setShowNebula(false); }}><span>{job.title}</span><em>{job.location}</em><strong>Open</strong></button>)}</div>}
            {visibleNebulaCompanies.length > 0 && <div className="marketTopCompanies"><b>Top companies in this market</b>{visibleNebulaCompanies.map((company, index) => <button key={company.company} className={selectedNebulaCompanyNode?.company === company.company ? "active" : ""} onClick={() => { setSelectedNebulaCompany(company.company); setSelectedNebulaSignal(null); }}><span>{index + 1}. {company.company}</span><em>{company.tags.slice(0, 3).join(" · ")}</em><strong>{company.count}</strong></button>)}</div>}
            {nebulaInteractions.length > 0 && <div className="marketInteractions"><b>How nodes interact</b>{nebulaInteractions.map(({ company, sharedTags, sharedRoles }) => <button key={company.company} onClick={() => { setSelectedNebulaCompany(company.company); setSelectedNebulaSignal(null); }}><span>{company.company}</span><em>{[...sharedTags, ...sharedRoles].slice(0, 4).join(" · ")}</em><strong>{company.count} roles</strong></button>)}<small>Interaction here means shared official-posting tags or role families inside the selected sector.</small></div>}
            <div className="marketList"><b>Industries</b>{nebulaSectors.map((cluster) => <button key={cluster.sector} className={selectedNebulaCluster?.sector === cluster.sector ? "active" : ""} onClick={() => { setSelectedNebulaSector(cluster.sector); setSelectedNebulaCompany(null); setSelectedNebulaSignal(null); setNebulaClarity("selection"); }}><span>{cluster.sector}</span><em>{cluster.companies.length} companies · {cluster.count.toLocaleString()} roles</em></button>)}</div>
          </aside>
        </div>
      </section></div>}
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
