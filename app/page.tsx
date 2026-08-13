"use client";

import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
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
  isUs?: boolean;
  searchIndex?: {
    title: string;
    category: string;
    tags: string;
    company: string;
    context: string;
    summary: string;
    all: string;
  };
};
type Company = (typeof registry)[number];
type AppliedRecord = {
  jobId: string;
  status: "Applied" | "Assessment" | "Interview" | "Offer" | "Rejected" | "Withdrawn";
  appliedAt: string;
  notes: string;
  company?: string;
  title?: string;
  source?: "job" | "gmail";
  emailSubject?: string;
  emailFrom?: string;
  emailDate?: string;
  emailUrl?: string;
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
  "Customer Success & Solutions": ["Customer Success & Solutions", "customer success", "technical account", "implementation", "solutions"],
  "Customer Support": ["Customer Support", "support", "customer care", "helpdesk"],
  "Go-to-Market": ["Go-to-Market", "sales", "marketing", "revenue", "partnerships"],
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

const decodeTextEntities = (value: string) => value
  .replace(/\\u003c/gi, "<")
  .replace(/\\u003e/gi, ">")
  .replace(/\\u0026/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&amp;/gi, "&")
  .replace(/&nbsp;/gi, " ")
  .replace(/&quot;/gi, "\"")
  .replace(/&#39;|&apos;/gi, "'");

const cleanDisplayText = (value = "") => {
  let text = String(value);
  for (let i = 0; i < 3; i += 1) {
    text = decodeTextEntities(text)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/\b(?:class|style|data-[\w-]+)=["'][^"']*["']/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/<[^>]*$/g, " ");
  }
  return text
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/<[^>]*$/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
};

const cleanJob = (job: Job): Job => ({
  ...job,
  source: cleanDisplayText(job.source),
  company: cleanDisplayText(job.company),
  companySize: cleanDisplayText(job.companySize),
  sector: cleanDisplayText(job.sector),
  title: cleanDisplayText(job.title),
  category: cleanDisplayText(job.category),
  location: cleanDisplayText(job.location),
  type: cleanDisplayText(job.type),
  level: cleanDisplayText(job.level),
  salary: cleanDisplayText(job.salary),
  summary: cleanDisplayText(job.summary),
  companyEvidence: cleanDisplayText(job.companyEvidence),
  tags: job.tags.map((tag) => cleanDisplayText(tag)).filter(Boolean),
});

const normalizeSearch = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
const withSearchIndex = (job: Job): Job => {
  const title = normalizeSearch(job.title);
  const category = normalizeSearch(job.category);
  const tags = normalizeSearch(job.tags.join(" "));
  const company = normalizeSearch(job.company);
  const context = normalizeSearch(`${job.sector} ${job.companySize} ${job.location}`);
  const summary = normalizeSearch(job.summary);
  return { ...job, searchIndex: { title, category, tags, company, context, summary, all: `${title} ${category} ${tags} ${company} ${context} ${summary}` } };
};
const searchTerms = (value: string) => {
  const base = normalizeSearch(value).split(" ").filter((term) => term && term !== "and" && term.length > 1);
  return Array.from(new Set(base.flatMap((term) => [term, ...(searchSynonyms[term] || [])])));
};
const fieldScore = (text: string, terms: string[], weight: number) => {
  return terms.reduce((score, term) => score + (text.includes(term) ? weight : 0), 0);
};
const relevanceScore = (job: Job, query: string) => {
  const terms = searchTerms(query);
  if (!terms.length) return 1;
  const search = job.searchIndex ?? withSearchIndex(job).searchIndex!;
  const score =
    fieldScore(search.title, terms, 12) +
    fieldScore(search.category, terms, 10) +
    fieldScore(search.tags, terms, 8) +
    fieldScore(search.company, terms, 6) +
    fieldScore(search.context, terms, 4) +
    fieldScore(search.summary, terms, 2);
  const required = normalizeSearch(query).split(" ").filter((term) => term && term !== "and" && term.length > 1);
  const requiredHits = required.filter((term) => search.all.includes(term) || (searchSynonyms[term] || []).some((alt) => search.all.includes(alt))).length;
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

const roleSpecialization = (job: Job) => {
  const text = `${job.title} ${job.category} ${job.tags.join(" ")} ${job.summary}`.toLowerCase();
  if (/embedded|firmware|fpga|hardware|robotics|autonomy|avionics|controls|sensor|iot|edge/.test(text)) return "Embedded, Hardware & Robotics";
  if (/front[ -]?end|frontend|react|vue|angular|web engineer|ui engineer|javascript|typescript|design system/.test(text)) return "Frontend & Web";
  if (/back[ -]?end|backend|api|server|distributed|platform|microservice|service engineer/.test(text)) return "Backend & Distributed Systems";
  if (/full[ -]?stack|fullstack/.test(text)) return "Full-stack";
  if (/mobile|ios|android|react native|swift|kotlin/.test(text)) return "Mobile";
  if (/data engineer|analytics engineer|etl|pipeline|warehouse|spark|dbt|data platform/.test(text)) return "Data Engineering";
  if (/machine learning| ml | ai |artificial intelligence|llm|model|research scientist|applied scientist|computer vision|nlp/.test(` ${text} `)) return "Machine Learning & AI";
  if (/infra|infrastructure|cloud|devops|sre|site reliability|kubernetes|terraform|release|build|developer productivity/.test(text)) return "Infrastructure, DevOps & SRE";
  if (/security engineer|appsec|application security|detection|threat|identity|privacy|trust/.test(text)) return "Security Engineering";
  if (/qa|quality|test engineer|automation engineer|verification|validation|reliability test/.test(text)) return "QA, Test & Validation";
  if (/product manager|program manager|project manager|scrum|roadmap/.test(text)) return "Product & Program";
  if (/designer|design|ux|user experience|visual|brand|content design|researcher/.test(text)) return "Design & Research";
  if (/technical account|customer success|implementation|solutions? (engineer|architect|consultant|manager)|professional services|sales engineer|pre[ -]?sales|post[ -]?sales|customer solution|customer education/.test(text)) return "Technical Success & Solutions";
  if (/sales|account executive|revenue|business development|partnership|commercial|marketing|growth/.test(text)) return "Sales & Revenue";
  if (/support|customer experience|customer care|help.?desk|contact center|call center|service desk|technical support/.test(text)) return "Support & Care";
  if (/operations|supply|logistics|manufacturing|procurement|warehouse|facilities/.test(text)) return "Operations & Supply Chain";
  if (/finance|accounting|legal|people|hr|recruit|talent|payroll|counsel/.test(text)) return "Business Operations";
  return "General / Other";
};

const canonicalSpecialization = (job: Job, selectedFamily: string) => {
  const specialty = roleSpecialization(job);
  if (selectedFamily === "All roles") return specialty;
  const family = selectedFamily.toLowerCase();
  const spec = specialty.toLowerCase();
  if (family.includes("software") && ["sales, success & solutions", "support & implementation", "business operations", "operations & supply chain", "design & research", "product & program"].includes(spec)) return "General Software Engineering";
  if (family.includes("hardware") && !/(embedded|hardware|robotics|qa|test|validation|operations)/.test(spec)) return "Hardware & Robotics - General";
  if (family.includes("customer success") && !/(technical success|solutions|sales|revenue|product|business)/.test(spec)) return "Customer Success & Solutions - General";
  if (family.includes("customer support") && !/(support|care|technical success|solutions)/.test(spec)) return "Customer Support - General";
  if (family.includes("go-to-market") && !/(sales|revenue|product|business)/.test(spec)) return "Go-to-Market - General";
  if (family.includes("machine learning") && !/(machine learning|data engineering|backend|infrastructure)/.test(spec)) return "ML & AI - General";
  return specialty;
};

export default function Home() {
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [source, setSource] = useState("All sources");
  const [sector, setSector] = useState("All sectors");
  const [size, setSize] = useState("All sizes");
  const [mode, setMode] = useState("All roles");
  const [specialization, setSpecialization] = useState("All specializations");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [includeInternational, setIncludeInternational] = useState(false);
  const [interestOnly, setInterestOnly] = useState(false);
  const [sort, setSort] = useState("Newest");
  const [companyFocus, setCompanyFocus] = useState("");
  const [selected, setSelected] = useState<Job | null>(null);
  const [visible, setVisible] = useState(30);
  const [view, setView] = useState<"roles" | "companies" | "universe" | "applied" | "audit">("roles");
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
      const cacheBust = `v=${feedSummary.jobs}-${feedSummary.usJobs ?? 0}`;
      const plain = await fetch(`/jobs-data.json?${cacheBust}`, { cache: "no-store" }).then((response) => response.json()).catch(() => []);
      if (Array.isArray(plain) && plain.length) {
        setJobs(plain.map(cleanJob).map(withSearchIndex));
        return;
      }
      if (!("DecompressionStream" in window)) throw new Error("Compressed job snapshot requires DecompressionStream.");
      const manifest = await fetch(`/job-snapshot/manifest.json?${cacheBust}`, { cache: "no-store" }).then((response) => response.json()) as { encoding: "gzip"; parts: string[] };
      const chunks = await Promise.all(manifest.parts.map((part) => fetch(`/job-snapshot/${part}?${cacheBust}`, { cache: "no-store" }).then((response) => response.arrayBuffer())));
      const compressed = new Blob(chunks);
      const stream = compressed.stream().pipeThrough(new DecompressionStream(manifest.encoding));
      const text = await new Response(stream).text();
      setJobs(JSON.parse(text).map(cleanJob).map(withSearchIndex));
    }
    loadJobs().catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    localStorage.setItem("launchpad-applied", JSON.stringify(applied));
  }, [applied]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(searchDraft);
      setVisible(30);
    }, 220);
    return () => window.clearTimeout(handle);
  }, [searchDraft]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailState = params.get("gmail");
    if (gmailState === "error") {
      setShowGmail(true);
      setGmailError(params.get("message") || "Gmail connection failed.");
    } else if (gmailState === "connected") {
      setShowGmail(true);
      setGmailError("");
    }
  }, []);

  useEffect(() => {
    setSpecialization("All specializations");
  }, [mode]);

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
      else next[job.id] = { jobId: job.id, status: "Applied", appliedAt: new Date().toISOString(), notes: "", company: job.company, title: job.title, source: "job" };
      return next;
    });
  }

  function importGmailUpdate(update: GmailUpdate) {
    const key = `gmail-${update.id}`;
    const parsedDate = update.date ? new Date(update.date) : new Date();
    const appliedAt = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
    setApplied((records) => ({
      ...records,
      [key]: {
        jobId: key,
        status: update.status,
        appliedAt,
        notes: update.snippet,
        company: cleanDisplayText(update.company),
        title: cleanDisplayText(update.role),
        source: "gmail",
        emailSubject: cleanDisplayText(update.subject),
        emailFrom: cleanDisplayText(update.from),
        emailDate: update.date,
        emailUrl: update.sourceUrl,
      },
    }));
    setView("applied");
  }

  function importVisibleGmailUpdates() {
    if (!gmailUpdates.length) return;
    const importedAt = new Date().toISOString();
    setApplied((records) => {
      const next = { ...records };
      for (const update of gmailUpdates) {
        const key = `gmail-${update.id}`;
        const parsedDate = update.date ? new Date(update.date) : new Date(importedAt);
        const appliedAt = Number.isNaN(parsedDate.getTime()) ? importedAt : parsedDate.toISOString();
        next[key] = {
          jobId: key,
          status: update.status,
          appliedAt,
          notes: update.snippet,
          company: cleanDisplayText(update.company),
          title: cleanDisplayText(update.role),
          source: "gmail",
          emailSubject: cleanDisplayText(update.subject),
          emailFrom: cleanDisplayText(update.from),
          emailDate: update.date,
          emailUrl: update.sourceUrl,
        };
      }
      return next;
    });
    setShowGmail(false);
    setView("applied");
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

  function toggleRoleFamily(label: string) {
    setMode((current) => (current === label ? "All roles" : label));
    setVisible(30);
  }

  function toggleSpecialization(label: string) {
    setSpecialization((current) => (current === label ? "All specializations" : label));
    setVisible(30);
  }

  function toggleSize(label: string) {
    setSize((current) => (current === label ? "All sizes" : label));
    setVisible(30);
  }

  function toggleSector(label: string) {
    setSector((current) => (current === label ? "All sectors" : label));
    setVisible(30);
  }

  const scopedJobs = useMemo(() => includeInternational ? jobs : jobs.filter((job) => job.isUs !== false), [jobs, includeInternational]);
  const usJobs = useMemo(() => jobs.filter((job) => job.isUs !== false), [jobs]);
  const internationalJobs = useMemo(() => jobs.filter((job) => job.isUs === false), [jobs]);
  const scopedJobTotal = scopedJobs.length || (includeInternational ? feedSummary.jobs : feedSummary.usJobs || feedSummary.jobs);
  const scopedCompanyTotal = new Set(scopedJobs.map((job) => job.company)).size || (includeInternational ? feedSummary.companiesWithMatches : feedSummary.usCompaniesWithMatches || feedSummary.companiesWithMatches);
  const usJobTotal = usJobs.length || feedSummary.usJobs || 0;
  const internationalJobTotal = internationalJobs.length || feedSummary.internationalJobs || 0;
  const roleCounts = useMemo(() => scopedJobs.reduce((counts, job) => counts.set(job.category, (counts.get(job.category) || 0) + 1), new Map<string, number>()), [scopedJobs]);
  const sizeCounts = useMemo(() => scopedJobs.reduce((counts, job) => counts.set(job.companySize, (counts.get(job.companySize) || 0) + 1), new Map<string, number>()), [scopedJobs]);
  const sectorCounts = useMemo(() => scopedJobs.reduce((counts, job) => counts.set(job.sector, (counts.get(job.sector) || 0) + 1), new Map<string, number>()), [scopedJobs]);
  const roleFamilies = ["All roles", ...Array.from(roleCounts.keys()).sort()];
  const specializationJobs = mode === "All roles" ? scopedJobs : scopedJobs.filter((job) => job.category === mode);
  const specializations = ["All specializations", ...Array.from(new Set(specializationJobs.map((job) => canonicalSpecialization(job, mode)))).sort((a, b) => {
    if (a === "General / Other") return 1;
    if (b === "General / Other") return -1;
    return a.localeCompare(b);
  })];
  const specializationCount = (label: string) => label === "All specializations" ? specializationJobs.length : specializationJobs.filter((job) => canonicalSpecialization(job, mode) === label).length;
  const sources = ["All sources", ...Array.from(new Set(jobs.map((j) => j.source)))];
  const sectors = ["All sectors", ...Array.from(sectorCounts.keys()).sort()];
  const sizes = ["All sizes", "Startup", "Small", "Medium", "Large", "Enterprise", "Unknown"];
  const appliedJobs = scopedJobs.filter((job) => applied[job.id]);
  const appliedRows = useMemo(() => Object.values(applied).sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()), [applied]);
  const appliedCompanyGroups = useMemo(() => Array.from(appliedRows.reduce((groups, record) => {
    const company = cleanDisplayText(record.company || "Unknown company");
    const group = groups.get(company) || { company, total: 0, statuses: new Map<AppliedRecord["status"], number>() };
    group.total += 1;
    group.statuses.set(record.status, (group.statuses.get(record.status) || 0) + 1);
    groups.set(company, group);
    return groups;
  }, new Map<string, { company: string; total: number; statuses: Map<AppliedRecord["status"], number> }>()).values()).sort((a, b) => b.total - a.total || a.company.localeCompare(b.company)), [appliedRows]);
  const sizeCount = (label: string) => label === "All sizes" ? scopedJobs.length : sizeCounts.get(label) || 0;
  const discoverySeedJobs = scopedJobs.filter((job) => /engineer|manager|analyst|specialist|associate|designer|scientist|account|support|product/i.test(job.title)).slice(0, 8);
  const emailPreviewSource = gmailMode === "applied" ? appliedJobs : discoverySeedJobs;
  const mockEmailUpdates = emailPreviewSource.slice(0, 8).map((job, index) => ({
    job,
    status: index % 7 === 0 ? "Rejected" : index % 5 === 0 ? "Interview" : index % 3 === 0 ? "Assessment" : "Applied",
    signal: index % 7 === 0 ? "Status update" : index % 5 === 0 ? "Interview invite" : index % 3 === 0 ? "Assessment request" : "Application confirmation",
    confidence: index % 3 === 0 ? "High" : index % 3 === 1 ? "Medium" : "Review",
    matched: Boolean(applied[job.id]),
  }));

  const auditSourceCounts = useMemo(() => Array.from(jobs.reduce((counts, job) => counts.set(job.source, (counts.get(job.source) || 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]), [jobs]);
  const auditSectorCounts = useMemo(() => Array.from(scopedJobs.reduce((counts, job) => counts.set(job.sector, (counts.get(job.sector) || 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 10), [scopedJobs]);
  const auditCompanies = useMemo(() => new Set(scopedJobs.map((job) => job.company)).size, [scopedJobs]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim();
    const base = scopedJobs.filter((job) => (!companyFocus || job.company === companyFocus) && (source === "All sources" || job.source === source) && (sector === "All sectors" || job.sector === sector) && (size === "All sizes" || job.companySize === size) && (!remoteOnly || job.remote) && (mode === "All roles" || job.category === mode) && (specialization === "All specializations" || canonicalSpecialization(job, mode) === specialization) && (!interestOnly || matchesInterest(job, preferences)));
    if (q) return base.map((job) => ({ job, score: relevanceScore(job, q) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || new Date(b.job.date).getTime() - new Date(a.job.date).getTime()).map(({ job }) => job);
    if (sort === "Company") return [...base].sort((a, b) => a.company.localeCompare(b.company));
    if (sort === "Role family") return [...base].sort((a, b) => a.category.localeCompare(b.category));
    return base;
  }, [scopedJobs, deferredQuery, companyFocus, source, sector, size, remoteOnly, mode, specialization, sort, interestOnly, preferences]);

  const companyGroups = useMemo(() => Array.from(filtered.reduce((groups, job) => {
    const group = groups.get(job.company) || [];
    group.push(job);
    groups.set(job.company, group);
    return groups;
  }, new Map<string, Job[]>()).entries()).map(([company, companyJobs]) => {
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
    const sectorJobs = scopedJobs.filter((job) => {
      const postingSignals = [job.sector, job.category, ...job.tags].map((signal) => signal.toLowerCase());
      return postingSignals.includes(sectorNeedle);
    });
    const companies = Array.from(new Set(sectorJobs.map((job) => job.company))).map((company) => {
      const companyJobs = sectorJobs.filter((job) => job.company === company);
      return { company, count: companyJobs.length, size: companyJobs[0].companySize, tags: contributionTags(companyJobs, 4), roles: Array.from(new Set(companyJobs.map((job) => job.category))).slice(0, 4) };
    }).sort((a, b) => b.count - a.count);
    return { sector: sectorName, count: sectorJobs.length, companies, tags: contributionTags(sectorJobs, 6), index: sectorIndex };
  }).filter((cluster) => cluster.count > 0).sort((a, b) => b.count - a.count), [scopedJobs, sectors]);
  const selectedNebulaCluster = nebulaSectors.find((cluster) => cluster.sector === selectedNebulaSector) ?? nebulaSectors[0];
  const selectedNebulaCompanyNode = selectedNebulaCluster?.companies.find((company) => company.company === selectedNebulaCompany) ?? selectedNebulaCluster?.companies[0];
  const visibleNebulaCompanies = selectedNebulaCluster?.companies.slice(0, 50) ?? [];
  const selectedCompanyMarketJobs = selectedNebulaCompanyNode && selectedNebulaCluster ? scopedJobs.filter((job) => {
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
  const selectedMarketJobs = selectedNebulaCluster ? scopedJobs.filter((job) => [job.sector, job.category, ...job.tags].some((signal) => signal.toLowerCase() === selectedNebulaCluster.sector.toLowerCase())) : [];
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
        <div className="headerActions"><button className="ghost" onClick={() => setShowNebula(true)}>Company Nebula</button><button className="ghost" onClick={() => setView("applied")}>Applied list</button><button className="ghost" onClick={() => setShowGmail(true)}>Link Gmail</button><button className="ghost" onClick={() => setShowOnboard(true)}>+ Add company</button></div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Local-first · free/public careers sources</div>
        <h1>Your next role,<br /><em>without the noise.</em></h1>
        <p>Run your own job-market bulletin from official company careers systems. The broad watchlist is 5,000 companies; live counts only include free direct feeds this copy can resolve.</p>
        <div className="searchBox">
          <span className="searchIcon">⌕</span>
          <input aria-label="Search jobs" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search roles, companies, skills, sectors, locations..." />
          <kbd>⌘ K</kbd>
        </div>
        <div className="stats">
          <div><strong>{scopedJobTotal}</strong><span>{includeInternational ? "open roles" : "US open roles"}</span></div>
          <div><strong>{scopedCompanyTotal}</strong><span>{includeInternational ? "global hiring companies" : "US-visible hiring companies"}</span></div>
          <div><strong>{feedSummary.feedsChecked}</strong><span>feeds checked</span></div>
          <div><strong>{registrySummary.total}</strong><span>companies tracked</span></div>
        </div>
      </section>

      <section className="workspace">
        <aside>
          <p className="label">JOB ROLE FAMILY · LIVE ROLES</p>
          {roleFamilies.map((x) => <div key={x} className="roleFilterGroup"><button className={mode === x ? "filter active" : "filter"} onClick={() => toggleRoleFamily(x)}>{x}<span>{x === "All roles" ? scopedJobTotal : roleCounts.get(x) || 0}</span></button>{mode === x && x !== "All roles" && <div className="nestedFilters"><p className="label">{x.toUpperCase()} · SPECIALIZATION</p>{specializations.map((specializationLabel) => <button key={specializationLabel} className={specialization === specializationLabel ? "filter active subFilter" : "filter subFilter"} onClick={() => toggleSpecialization(specializationLabel)}>{specializationLabel}<span>{specializationCount(specializationLabel)}</span></button>)}</div>}</div>)}
          <p className="label space">COMPANY SIZE · LIVE ROLES</p>
          {sizes.map((x) => <button key={x} className={size === x ? "filter active" : "filter"} onClick={() => toggleSize(x)}>{x}<span>{x === "All sizes" ? scopedJobTotal : sizeCount(x)}</span></button>)}
          <p className="label space">COMPANY SECTOR · LIVE ROLES</p>
          {sectors.map((x) => <button key={x} className={sector === x ? "filter active" : "filter"} onClick={() => toggleSector(x)}>{x}<span>{x === "All sectors" ? scopedJobTotal : sectorCounts.get(x) || 0}</span></button>)}
          <div className="fantastic"><div><span className="pulse"></span><b>Coverage model</b></div><p>This is a forkable local index, not a claim about the whole US market. Watchlist: {registrySummary.total} companies. Free feeds checked: {feedSummary.feedsChecked}. Resolved today: {feedSummary.boardsResolved}. US-visible hiring now: {feedSummary.usCompaniesWithMatches ?? scopedCompanyTotal}. Total resolved with international: {feedSummary.companiesWithMatches}.</p></div>
        </aside>

        <div className="results">
          <div className="viewTabs" role="tablist" aria-label="Browse jobs">
            <button role="tab" aria-selected={view === "roles"} className={view === "roles" ? "active" : ""} onClick={() => setView("roles")}><span>01</span> Roles</button>
            <button role="tab" aria-selected={view === "companies"} className={view === "companies" ? "active" : ""} onClick={() => setView("companies")}><span>02</span> Hiring companies</button>
            <button role="tab" aria-selected={view === "universe"} className={view === "universe" ? "active" : ""} onClick={() => setView("universe")}><span>03</span> 5,000 tracked</button>
            <button role="tab" aria-selected={view === "applied"} className={view === "applied" ? "active" : ""} onClick={() => setView("applied")}><span>04</span> Applied</button>
            <button role="tab" aria-selected={view === "audit"} className={view === "audit" ? "active" : ""} onClick={() => setView("audit")}><span>05</span> Audit</button>
            <button className="addInline" onClick={() => setShowOnboard(true)}>+ Onboard company</button>
          </div>

          <div className="personalizeBar">
            <div><span>Optional personalization</span><b>{preferences.length ? preferences.join(" · ") : "Browse neutrally, or tune the index to your interests."}</b></div>
            <div className="personalActions"><label className="toggle"><input type="checkbox" checked={interestOnly} disabled={!preferences.length} onChange={(e) => setInterestOnly(e.target.checked)} /><span></span>Use interests</label><button onClick={() => setShowTune(true)}>{preferences.length ? "Edit interests" : "Tune for me ->"}</button></div>
          </div>
          <div className="auditStrip">
            <div><b>Free/public sources only</b><span>Official ATS and company-controlled careers feeds; no paid job-board APIs needed for the bundled snapshot.</span></div>
            <div><b>Source-audited postings</b><span>Rows need a provider response, stable source URL, title, location, and original apply link.</span></div>
            <div><b>Dedupe-first index</b><span>Provider job ID first; canonical apply URL and company/title/location are retained as audit checks.</span></div>
            <div><b>US default, global optional</b><span>{usJobTotal.toLocaleString()} US / US-eligible rows across {(feedSummary.usCompaniesWithMatches ?? scopedCompanyTotal).toLocaleString()} US-visible companies; {internationalJobTotal.toLocaleString()} international rows appear only when enabled.</span></div>
          </div>

          <div className="resultHead">
            <div><p className="label">OFFICIAL CAREERS RESULTS</p><h2>{view === "roles" ? `${filtered.length} roles found` : view === "companies" ? `${companyGroups.length} companies hiring` : view === "applied" ? `${appliedRows.length} applied roles` : view === "audit" ? "Source audit & coverage" : `${registryFiltered.length} tracked companies shown`}</h2></div>
            <div className="controls">
              <label className="toggle"><input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} /><span></span>Remote only</label>
              <label className="toggle"><input type="checkbox" checked={includeInternational} onChange={(e) => { setIncludeInternational(e.target.checked); setVisible(30); }} /><span></span>Include international</label>
              <select aria-label="Sort jobs" value={sort} onChange={(e) => setSort(e.target.value)}><option>Newest</option><option>Company</option><option>Role family</option></select>
            </div>
          </div>
          {companyFocus && <div className="focusBanner"><div><span>Company focus</span><b>{companyFocus}</b><small>Opened from Company Nebula. Clear this to return to all hiring companies.</small></div><button onClick={() => { setCompanyFocus(""); setVisible(30); }}>Clear company focus ×</button></div>}

          {view === "roles" && <><div className="jobList">{filtered.slice(0, visible).map((job) => <JobCard key={job.id} job={job} applied={Boolean(applied[job.id])} onOpen={() => setSelected(job)} onApply={() => toggleApplied(job)} />)}</div>{visible < filtered.length && <button className="load" onClick={() => setVisible((v) => v + 30)}>Load 30 more <span>↓</span></button>}</>}

          {view === "companies" && <div className="companyGrid">{companyGroups.map((group) => <details className="companyCard" key={group.company}>
            <summary><div className="companyMonogram">{group.company.slice(0, 2)}</div><div className="companyIdentity"><p className="label">{group.companySize} · {group.sector}</p><h3>{group.company}</h3><span>Official {group.source.replace("Direct ", "")} careers feed</span><div className="companyTags">{group.contributionTags.map((tag) => <em key={tag}>{tag}</em>)}</div></div><div className="companyCount"><strong>{group.jobs.length}</strong><span>open roles</span></div><span className="expand">+</span></summary>
            <div className="companyMetrics">{Object.entries(group.byRole).slice(0, 5).map(([role, count]) => <span key={role}><b>{count}</b> {role}</span>)}<span><b>{group.remote}</b> Remote</span></div>
            <div className="companyJobs">{group.jobs.map((job) => <a key={job.id} href={job.url} target="_blank" rel="noreferrer"><div><b>{job.title}</b><span>{job.location}</span></div><em>{job.category}</em><strong>Apply ↗</strong></a>)}</div>
          </details>)}</div>}

          {view === "universe" && <div className="registryGrid">{registryFiltered.slice(0, 240).map((company: Company) => <article className="registryCard" key={company.id}><div><p className="label">{company.size} · {company.sector}</p><h3>{company.name}</h3><span>{company.location}</span></div><div className="registryMeta"><span>{company.provider}</span><span>{company.source}</span></div>{company.website && <a href={company.website} target="_blank" rel="noreferrer">Website ↗</a>}</article>)}</div>}

          {view === "applied" && <div className="appliedPanel">
            <div className="gmailCta"><div><p className="label">OPTIONAL EMAIL SYNC</p><h3>Track application updates from Gmail</h3><span>Choose a lookback window, preview detected application emails, then import status changes.</span></div><button className="ghost" onClick={() => setShowGmail(true)}>Connect / import</button></div>
            {appliedRows.length > 0 && <div className="appliedSummary"><div><p className="label">APPLICATION BULLETIN</p><h3>{appliedCompanyGroups.length} companies applied to</h3><span>{appliedRows.filter((record) => record.source === "gmail").length} imported from Gmail · {appliedRows.filter((record) => record.source !== "gmail").length} marked from Launchpad</span></div>{appliedCompanyGroups.slice(0, 8).map((group) => <div key={group.company}><b>{group.company}</b><span>{group.total} role{group.total === 1 ? "" : "s"} · {Array.from(group.statuses.entries()).map(([status, count]) => `${count} ${status}`).join(" · ")}</span></div>)}</div>}
            {appliedRows.map((record) => <article className="appliedRow" key={record.jobId}><div><b>{cleanDisplayText(record.title || "Role not parsed")}</b><span>{cleanDisplayText(record.company || "Unknown company")} · marked {fmtDate(record.appliedAt)} · {record.source === "gmail" ? "Gmail import" : "Launchpad role"}</span>{record.emailSubject && <small>{record.emailSubject}</small>}</div><select value={record.status} onChange={(e) => setApplied((records) => ({ ...records, [record.jobId]: { ...records[record.jobId], status: e.target.value as AppliedRecord["status"] } }))}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select><div className="appliedLinks">{record.emailUrl && <a href={record.emailUrl} target="_blank" rel="noreferrer">Email</a>}{!record.emailUrl && appliedJobs.find((job) => job.id === record.jobId)?.url && <a href={appliedJobs.find((job) => job.id === record.jobId)?.url} target="_blank" rel="noreferrer">Open</a>}<button onClick={() => setApplied((records) => { const next = { ...records }; delete next[record.jobId]; return next; })}>Remove</button></div></article>)}
            {!appliedRows.length && <div className="empty"><b>No applied roles yet.</b><p>Check a role as applied or import applications from Gmail and they will appear here.</p></div>}
          </div>}

          {view === "audit" && <div className="auditPanel">
            <section><p className="label">SOURCE TRUTH</p><h3>No fabricated postings.</h3><p>Launchpad keeps a row only when it came back from a company-controlled careers feed or ATS endpoint with a stable provider id, title, location, source URL, and apply link. Descriptions are cleaned before display so raw HTML never leaks into the UI.</p></section>
            <div className="auditGrid"><div><span>US / US-eligible rows</span><strong>{usJobTotal.toLocaleString()}</strong></div><div><span>International rows</span><strong>{internationalJobTotal.toLocaleString()}</strong></div><div><span>{includeInternational ? "Total resolved companies" : "US-visible companies"}</span><strong>{auditCompanies.toLocaleString()}</strong></div><div><span>Feeds checked</span><strong>{feedSummary.feedsChecked.toLocaleString()}</strong></div></div>
            <section><p className="label">DEDUPE GATES</p><ol><li>Provider job id must be unique when the ATS exposes one.</li><li>Canonical source/apply URLs are retained and reported as audit review signals.</li><li>Company + normalized title + normalized location fingerprints are retained to inspect repost mirrors.</li><li>Rows with leaked HTML, missing title, missing company, missing audit evidence, or invalid URL fail the audit script.</li></ol><code>npm run data:audit</code></section>
            <section><p className="label">CURRENT FREE SOURCES</p><div className="auditSources">{auditSourceCounts.map(([name, count]) => <span key={name}><b>{name}</b><em>{count.toLocaleString()} rows</em></span>)}</div></section>
            <section><p className="label">COVERAGE HONESTY</p><p>This is not the entire US job market yet. The current snapshot is strongest where official public feeds are easy to resolve: Greenhouse, Ashby, Lever, SmartRecruiters, BambooHR, Breezy, Recruitee, and Workable. The next broadening pass should add stronger Workday, iCIMS, Jobvite, Oracle/Taleo, UKG, government, hospital, university, and custom careers-page adapters.</p><div className="auditSources">{auditSectorCounts.map(([name, count]) => <span key={name}><b>{name}</b><em>{count.toLocaleString()} rows</em></span>)}</div></section>
          </div>}

          {!filtered.length && view === "roles" && <div className="empty"><b>No roles match that search.</b><p>Try a broader title, skill, or location.</p></div>}
        </div>
      </section>

      {selected && <div className="drawerBackdrop" onClick={() => setSelected(null)}><aside className="drawer" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setSelected(null)}>×</button><span className="category">{cleanDisplayText(selected.category)}</span> <span className="source">{cleanDisplayText(selected.source)}</span><h2>{cleanDisplayText(selected.title)}</h2><h3>{cleanDisplayText(selected.company)}</h3><div className="drawerMeta"><span>⌖ {cleanDisplayText(selected.location)}</span><span>{selected.isUs === false ? "International" : "US / US-eligible"}</span><span>{selected.remote ? "Remote" : "On-site / hybrid"}</span><span>{fmtDate(selected.date)}</span></div><p className="hqEvidence"><b>Audit trail:</b> {cleanDisplayText(selected.companyEvidence)} Provider-native job IDs are deduped; source URLs and company/title/location fingerprints stay visible as audit signals.</p><p>{cleanDisplayText(selected.summary)}</p><div className="chips">{selected.tags.slice(0, 8).map((t, i) => <span key={`${t}-${i}`}>{cleanDisplayText(t)}</span>)}</div><button className="apply" onClick={() => toggleApplied(selected)}>{applied[selected.id] ? "Remove from applied" : "Mark as applied"}</button><a className="apply secondaryApply" href={selected.url} target="_blank" rel="noreferrer">View original listing ↗</a><small>Personalization is optional. Results remain official-company listings and are not résumé match scores.</small></aside></div>}

      {showOnboard && <div className="drawerBackdrop" onClick={() => setShowOnboard(false)}><section className="onboard" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowOnboard(false)}>×</button><p className="eyebrow">CAREERS DISCOVERY ENGINE</p><h2>Onboard any company.</h2><p>Enter a company and its website. Launchpad will inspect the official site, detect its careers system, and preview every live position directly from the source.</p><form onSubmit={discoverCompany}><label>Company name<input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Linear" /></label><label>Company website <small>recommended</small><input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} placeholder="e.g. linear.app" /></label><button className="apply" disabled={discovering}>{discovering ? "Scanning official site..." : "Find careers page ->"}</button></form>{discoveryError && <div className="discoveryError">{discoveryError}</div>}{discovery && <div className="discoveryResult"><div className="verified">Official {discovery.provider} feed detected</div><h3>{discovery.company}</h3><p>{discovery.totalJobs} live positions found</p><div className="previewJobs">{discovery.jobs.slice(0, 8).map((j: any) => <a key={j.id} href={j.url} target="_blank" rel="noreferrer"><b>{j.title}</b><span>{j.location}</span></a>)}</div>{discovery.submitted ? <div className="submitted">Company submitted to the tracked registry.</div> : <button className="apply" onClick={submitCompany}>Add company to registry</button>}</div>}</section></div>}

      {showTune && <div className="drawerBackdrop" onClick={() => setShowTune(false)}><section className="onboard" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowTune(false)}>×</button><p className="eyebrow">OPTIONAL · USER CONTROLLED</p><h2>Tune the noise out.</h2><p>Paste résumé text for suggested interest areas. Nothing is stored, and every suggestion can be ignored or replaced with your own.</p><form onSubmit={analyzePreferences}><label>Résumé text<textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste résumé text here..." /></label><button className="apply">Suggest interest areas</button></form>{suggestions.length > 0 && <div className="suggestions"><p className="label">SUGGESTED - CHOOSE ANY</p>{suggestions.map((s) => <button key={s.id} className={preferences.includes(s.label) ? "chosen" : ""} onClick={() => addPreference(s.label)}><b>{s.label}</b><span>{s.signals.join(" · ")}</span><em>{preferences.includes(s.label) ? "Added" : "+ Add"}</em></button>)}</div>}<div className="customPref"><input value={customPreference} onChange={(e) => setCustomPreference(e.target.value)} placeholder="Create your own interest..." /><button onClick={() => { if (customPreference.trim()) { addPreference(customPreference.trim()); setCustomPreference(""); } }}>Add</button></div><small>Interests now affect filters when Use interests is on. Résumé text is analyzed transiently and is not saved.</small></section></div>}

      {showGmail && <div className="drawerBackdrop" onClick={() => setShowGmail(false)}><section className="onboard" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowGmail(false)}>×</button><p className="eyebrow">OPTIONAL GMAIL SYNC</p><h2>Email-aware tracking.</h2><p>Scan recent read-only Gmail messages, then port real application confirmations and updates into your local applied-role bulletin.</p>{gmailStatus?.connected ? <div className="gmailTruth real">Connected to {gmailStatus.email ?? "Gmail"} · read-only</div> : <div className="gmailTruth">{gmailStatus?.configured ? "Gmail is ready · connect to scan your inbox" : "Bring your own Google OAuth keys to enable Gmail locally"}</div>}{!gmailStatus?.connected && !gmailStatus?.configured && <div className="gmailSetup"><b>Optional local setup</b><span>Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GMAIL_COOKIE_SECRET to your local env. Redirect URI: {typeof window !== "undefined" ? `${window.location.origin}/api/gmail/callback` : "/api/gmail/callback"}</span></div>}<div className="gmailModeTabs"><button className={gmailMode === "all" ? "active" : ""} onClick={() => { setGmailMode("all"); setGmailScanned(false); }}>All Gmail updates</button><button className={gmailMode === "applied" ? "active" : ""} onClick={() => { setGmailMode("applied"); setGmailScanned(false); }}>Matched to applied</button></div><div className="gmailControls"><label>Look back<select value={gmailDays} onChange={(e) => { setGmailDays(e.target.value); setGmailScanned(false); }}><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90">Last 90 days</option></select></label>{gmailStatus?.connected ? <button className="apply" onClick={scanGmail} disabled={gmailLoading}>{gmailLoading ? "Scanning Gmail..." : "Scan real Gmail"}</button> : gmailStatus?.configured ? <a className="apply" href="/api/gmail/auth">Connect Gmail with Google →</a> : <button className="apply" disabled>OAuth keys needed</button>}</div>{gmailStatus?.connected && <button className="ghost disconnectGmail" onClick={disconnectGmail}>Disconnect Gmail</button>}{gmailError && <div className="discoveryError">{gmailError}</div>}<div className="gmailMock"><div><b>Read-only scope</b><span>Gmail metadata, sender, subject, snippets, and source links. No send, archive, trash, or label access.</span></div><div><b>Personal bulletin</b><span>{gmailMode === "all" ? "Import any application-looking email into Applied." : "Searches Gmail for companies and roles you already marked as applied."}</span></div></div>{gmailStatus?.connected && gmailScanned && gmailUpdates.length > 0 && <div className="gmailImportBar"><div><b>{gmailUpdates.length} Gmail updates ready</b><span>Port the visible scan into your local Applied list, then review by company.</span></div><button onClick={importVisibleGmailUpdates}>Add all visible to applied</button></div>}{gmailScanned && <div className="emailResults"><p className="label">{gmailStatus?.connected ? "REAL GMAIL" : "DEMO PREVIEW"} · LAST {gmailDays} DAYS · {gmailMode === "all" ? "ALL UPDATES" : "MATCHED ONLY"}</p>{gmailStatus?.connected ? (gmailUpdates.length ? gmailUpdates.map((update) => <article key={update.id}><div><b>{update.signal}</b><span>{update.company} · {update.role}</span><div className="emailSource"><span>{update.subject}</span><span>{update.from}</span><span>{update.date}</span></div><div className="emailBadges"><em>Gmail source</em><em>{update.confidence} confidence</em><em>{applied[`gmail-${update.id}`] ? "In applied" : "Not imported"}</em></div></div><div className="emailActions"><button onClick={() => importGmailUpdate(update)}>{applied[`gmail-${update.id}`] ? "Update applied" : "Add to applied"}</button><a href={update.sourceUrl} target="_blank" rel="noreferrer">Open email ↗</a></div></article>) : <div className="empty smallEmpty"><b>No Gmail updates found.</b><p>Try a longer lookback window or switch scan mode.</p></div>) : (mockEmailUpdates.length ? mockEmailUpdates.map(({ job, status, signal, confidence, matched }) => <article key={job.id}><div><b>{signal}</b><span>{job.company} · {job.title}</span><div className="emailBadges"><em>Demo row</em><em>{confidence} match confidence</em><em>{matched ? "Already applied" : "Not marked applied"}</em></div></div><button onClick={() => setApplied((records) => ({ ...records, [job.id]: { ...(records[job.id] || { jobId: job.id, appliedAt: new Date().toISOString(), notes: "", company: job.company, title: job.title, source: "job" }), status: status as AppliedRecord["status"] } }))}>Simulate {status}</button></article>) : <div className="empty smallEmpty"><b>No demo matches in this window.</b><p>Connect Gmail to scan real application updates.</p></div>)}</div>}<small>OAuth tokens are stored in an encrypted HttpOnly cookie for this demo. A hardened public release should move refresh tokens to durable per-user storage and complete Google verification.</small></section></div>}
      {showNebula && <div className="marketOverlay"><button className="nebulaClose" onClick={() => setShowNebula(false)}>×</button><section className="marketShell">
        <header className="marketChrome"><div><p className="eyebrow">{includeInternational ? "GLOBAL MARKET GRAPH" : "US MARKET GRAPH"}</p><h2>Company Nebula</h2><p>Explore {includeInternational ? "global" : "US"} hiring as a recursive market graph: industries lead to companies, companies open into work signals, and signals resolve into the actual roles behind them.</p></div><div className="marketStats"><span>{nebulaSectors.length} industries</span><span>{scopedCompanyTotal} hiring companies</span><span>{scopedJobTotal} roles</span></div></header>
        <div className="marketToolbar"><div><button className={nebulaClarity === "markets" ? "active" : ""} onClick={() => setNebulaClarity("markets")}>Markets</button><button className={nebulaClarity === "selection" ? "active" : ""} onClick={() => setNebulaClarity("selection")}>Selection</button><button className={nebulaClarity === "all" ? "active" : ""} onClick={() => setNebulaClarity("all")}>All nodes</button></div><label>Rotate<input type="range" min="-55" max="55" value={nebulaRotation} onChange={(e) => setNebulaRotation(Number(e.target.value))} /></label><label>Tilt<input type="range" min="42" max="76" value={nebulaTilt} onChange={(e) => setNebulaTilt(Number(e.target.value))} /></label><label>Zoom<input type="range" min="0.75" max="1.35" step="0.05" value={nebulaZoom} onChange={(e) => setNebulaZoom(Number(e.target.value))} /></label></div>
        <div className="marketGraphLayout">
          <div className="marketGraphStage" aria-label="Interactive US job market graph"><div className="marketGraphScene" style={{ "--rz": `${nebulaRotation}deg`, "--rx": `${nebulaTilt}deg`, "--zoom": nebulaZoom } as CSSProperties}>
            <div className="marketOrbit orbitOne"></div><div className="marketOrbit orbitTwo"></div><div className="marketOrbit orbitThree"></div>
            <button className="marketCore" onClick={() => { setNebulaClarity("markets"); setSelectedNebulaSector(null); setSelectedNebulaSignal(null); }}><b>{includeInternational ? "Global" : "US"}</b><span>{scopedJobTotal.toLocaleString()} roles</span></button>
            {nebulaSectors.map((cluster, i) => {
              const active = selectedNebulaCluster?.sector === cluster.sector;
              return <button key={cluster.sector} className={`marketSectorNode ${active ? "active" : ""} ${nebulaClarity === "markets" || active || nebulaClarity === "all" ? "" : "dim"}`} style={{ "--angle": `${(i / Math.max(1, nebulaSectors.length)) * 360 - 90}deg`, "--radius": `${nebulaClarity === "markets" ? 265 : 235}px`, "--mass": Math.min(1.9, 0.78 + cluster.count / Math.max(1, nebulaSectors[0]?.count || 1) * 1.05) } as CSSProperties} onClick={() => { if (selectedNebulaSector === cluster.sector) { setSelectedNebulaSector(null); setSelectedNebulaCompany(null); setSelectedNebulaSignal(null); setNebulaClarity("markets"); } else { setSelectedNebulaSector(cluster.sector); setSelectedNebulaCompany(null); setSelectedNebulaSignal(null); setNebulaClarity("selection"); } }}>
                <strong>{cluster.sector}</strong><span>{cluster.companies.length} companies · {cluster.count} roles</span>
              </button>;
            })}
            {nebulaClarity !== "markets" && visibleNebulaCompanies.map((company, i) => <button key={company.company} className={`marketCompanyNode ${selectedNebulaCompanyNode?.company === company.company ? "active" : ""}`} style={{ "--angle": `${(i * 137.5) % 360}deg`, "--radius": `${118 + (i % 3) * 52 + Math.floor(i / 12) * 28}px`, "--mass": Math.min(1.75, 0.72 + company.count / Math.max(1, visibleNebulaCompanies[0]?.count || 1) * 0.9) } as CSSProperties} onClick={() => { setSelectedNebulaCompany((current) => current === company.company ? null : company.company); setSelectedNebulaSignal(null); }} title={`${company.company}: ${company.tags.join(" · ")}`}><strong>{company.company.slice(0, 2)}</strong><span>{company.company}</span><em>{company.count}</em></button>)}
            {nebulaClarity !== "markets" && nebulaPathSignals.map((node, i) => <div key={`path-${node.signal}`} className="marketPathBeam" style={{ "--angle": `${(i / Math.max(1, nebulaPathSignals.length)) * 360 + 18}deg`, "--length": `${92 + Math.min(80, node.count * 6)}px` } as CSSProperties}></div>)}
            {nebulaClarity !== "markets" && selectedCompanySignals.map((node, i) => <button key={node.signal} className={`marketSignalNode ${selectedNebulaSignal === node.signal ? "active" : ""}`} style={{ "--angle": `${(i / Math.max(1, selectedCompanySignals.length)) * 360 + 18}deg`, "--radius": `${62 + (i % 2) * 36}px`, "--mass": Math.min(1.4, 0.8 + node.count / Math.max(1, selectedCompanySignals[0]?.count || 1) * 0.55) } as CSSProperties} onClick={() => setSelectedNebulaSignal((current) => current === node.signal ? null : node.signal)} title={`${selectedNebulaCompanyNode?.company}: ${node.signal}`}><strong>{node.signal}</strong><em>{node.count}</em></button>)}
          </div></div>
          <aside className="marketInspector">
            <div className="marketBreadcrumb"><button onClick={() => { setNebulaClarity("markets"); setSelectedNebulaSector(null); setSelectedNebulaSignal(null); }}>{includeInternational ? "Global market" : "US market"}</button><span>→</span><button onClick={() => { setNebulaClarity("selection"); setSelectedNebulaSignal(null); }}>{selectedNebulaCluster?.sector ?? "Select market"}</button>{selectedNebulaCompanyNode && <><span>→</span><button onClick={() => setSelectedNebulaSignal(null)}>{selectedNebulaCompanyNode.company}</button></>}{selectedNebulaSignal && <><span>→</span><b>{selectedNebulaSignal}</b></>}</div>
            <p className="eyebrow">SELECTED MARKET</p><h3>{selectedNebulaCluster?.sector ?? "US job market"}</h3><p>{selectedNebulaCluster ? `${selectedNebulaCluster.count.toLocaleString()} official-posting contributions across ${selectedNebulaCluster.companies.length} hiring companies. Showing up to the top 50 company nodes for this market. Companies can appear in multiple markets when their own postings carry those signals.` : "Choose an industry node to inspect company contribution signals."}</p>
            {selectedNebulaCluster && <div className="marketTags">{selectedNebulaCluster.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            {selectedNebulaCluster && <div className="marketBriefing"><b>Market briefing</b><div><span>Fresh roles</span><strong>{selectedMarketFreshJobs.toLocaleString()}</strong><em>last 7 days</em></div><div><span>Remote share</span><strong>{selectedMarketRemoteShare}%</strong><em>of postings</em></div><div><span>Leader concentration</span><strong>{selectedMarketLeaderShare}%</strong><em>{selectedNebulaCluster.companies[0]?.company ?? "top company"}</em></div>{selectedMarketRoleMix.length > 0 && <section><span>Dominant role families</span>{selectedMarketRoleMix.map(([role, count]) => <button key={role} onClick={() => { setMode(role); setSector("All sectors"); setSearchDraft(selectedNebulaCluster.sector); setQuery(selectedNebulaCluster.sector); setView("roles"); setShowNebula(false); }}>{role}<strong>{count}</strong></button>)}</section>}</div>}
            {selectedNebulaCompanyNode && <div className="companyLens"><span>Company lens</span><h4>{selectedNebulaCompanyNode.company}</h4><b>{selectedNebulaCompanyNode.count} market contributions</b><div>{selectedCompanySignals.map((node) => <em key={node.signal} onClick={() => setSelectedNebulaSignal(node.signal)}>{node.signal}</em>)}</div><button onClick={() => { setCompanyFocus(selectedNebulaCompanyNode.company); setSearchDraft(""); setQuery(""); setSector("All sectors"); setSource("All sources"); setView("companies"); setVisible(30); setShowNebula(false); }}>Open company results →</button></div>}
            {selectedCompanySignals.length > 0 && <div className="marketTopCompanies"><b>Nested signals for {selectedNebulaCompanyNode?.company}</b>{selectedCompanySignals.map((node) => <button key={node.signal} className={selectedNebulaSignal === node.signal ? "active" : ""} onClick={() => setSelectedNebulaSignal((current) => current === node.signal ? null : node.signal)}><span>{node.signal}</span><em>{selectedNebulaCluster?.sector} contribution node</em><strong>{node.count}</strong></button>)}</div>}
            {selectedSignalJobs.length > 0 && <div className="marketTopCompanies"><b>{selectedNebulaSignal ? `Postings tagged ${selectedNebulaSignal}` : "Postings behind this company node"}</b>{selectedSignalJobs.map((job) => <button key={job.id} onClick={() => { setSelected(job); setShowNebula(false); }}><span>{job.title}</span><em>{job.location}</em><strong>Open</strong></button>)}</div>}
            {visibleNebulaCompanies.length > 0 && <div className="marketTopCompanies"><b>Top companies in this market</b>{visibleNebulaCompanies.map((company, index) => <button key={company.company} className={selectedNebulaCompanyNode?.company === company.company ? "active" : ""} onClick={() => { setSelectedNebulaCompany((current) => current === company.company ? null : company.company); setSelectedNebulaSignal(null); }}><span>{index + 1}. {company.company}</span><em>{company.tags.slice(0, 3).join(" · ")}</em><strong>{company.count}</strong></button>)}</div>}
            {nebulaInteractions.length > 0 && <div className="marketInteractions"><b>How nodes interact</b>{nebulaInteractions.map(({ company, sharedTags, sharedRoles }) => <button key={company.company} onClick={() => { setSelectedNebulaCompany((current) => current === company.company ? null : company.company); setSelectedNebulaSignal(null); }}><span>{company.company}</span><em>{[...sharedTags, ...sharedRoles].slice(0, 4).join(" · ")}</em><strong>{company.count} roles</strong></button>)}<small>Interaction here means shared official-posting tags or role families inside the selected sector.</small></div>}
            <div className="marketList"><b>Industries</b>{nebulaSectors.map((cluster) => <button key={cluster.sector} className={selectedNebulaCluster?.sector === cluster.sector ? "active" : ""} onClick={() => { if (selectedNebulaSector === cluster.sector) { setSelectedNebulaSector(null); setSelectedNebulaCompany(null); setSelectedNebulaSignal(null); setNebulaClarity("markets"); } else { setSelectedNebulaSector(cluster.sector); setSelectedNebulaCompany(null); setSelectedNebulaSignal(null); setNebulaClarity("selection"); } }}><span>{cluster.sector}</span><em>{cluster.companies.length} companies · {cluster.count.toLocaleString()} roles</em></button>)}</div>
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
    <div className="jobMain"><div className="jobTop"><h3>{cleanDisplayText(job.title)}</h3><span>{fmtDate(job.date)}</span></div><p className="company">{cleanDisplayText(job.company)} <i>·</i> {cleanDisplayText(job.location)}</p><p className="summary">{cleanDisplayText(job.summary)}</p><div className="chips"><span className="category">{cleanDisplayText(job.category)}</span><span className="hq">{cleanDisplayText(job.companySize)}</span><span className="hq">{cleanDisplayText(job.sector)}</span><span className="source">Official careers</span>{job.remote && <span>Remote</span>}{applied && <span className="appliedChip">Applied</span>}</div></div>
    <a className="quickApply" aria-label={`Open application for ${job.title}`} href={job.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Apply ↗</a>
  </article>;
}
