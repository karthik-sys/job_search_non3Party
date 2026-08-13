CREATE TABLE IF NOT EXISTS company_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  website TEXT NOT NULL,
  careers_url TEXT NOT NULL,
  ats_provider TEXT NOT NULL,
  ats_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_submissions_provider_slug ON company_submissions(ats_provider, ats_slug);
CREATE INDEX IF NOT EXISTS idx_company_submissions_status ON company_submissions(status);
