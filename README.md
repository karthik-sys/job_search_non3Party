# Launchpad Careers

Launchpad is a local-first, company-first job dashboard. It indexes official company careers feeds, lets users search roles and hiring companies, and sends applicants to the original company-controlled application page.

The product goal is simple: your next role, without the noisy third-party reposting layer. This is meant to be forked, remixed, and run locally — not to become another consolidated hiring network.

## What it does

- Tracks a broad US company watchlist and resolves supported official ATS feeds.
- Ingests live roles from Greenhouse, Ashby, Lever, and SmartRecruiters without paid job-board APIs.
- Keeps a visible separation between companies tracked, feeds resolved, and verified open roles.
- Searches across all kinds of US roles, not only software or AI.
- Defaults to US/US-eligible roles, with an optional international expansion path.
- Groups opportunities by role family, company, sector, company size, and applied status.
- Adds job and company contribution tags from official posting/careers text.
- Includes a Company Nebula market map for exploring sectors and hiring density.
- Lets users onboard a company by name/website and preview its live roles before submission.
- Supports optional personalization from pasted résumé text without storing the résumé.
- Tracks applied roles locally and previews a Gmail-aware update workflow.

## Quick start

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

That is enough to run the dashboard locally. There are no required paid APIs for the default demo dataset.

Build for production:

```bash
npm run build
npm start
```

Run validation:

```bash
npm test
```

Audit the bundled job snapshot:

```bash
npm run data:audit
```

Regenerate the sector-first company registry:

```bash
npm run data:registry
```

Fetch a fresh US-only official-feed snapshot:

```bash
npm run data:fetch
```

Fetch a broader international snapshot:

```bash
npm run data:fetch:global
```

Pack and validate a refreshed snapshot:

```bash
npm run data:pack
npm run data:repair
npm run data:audit
```

## Data model

The checked-in source includes a compressed public job snapshot under `public/job-snapshot/`, so a fresh clone can run the same dashboard dataset locally without paid APIs or a crawler step. The app first checks `public/jobs-data.json`; when that file is empty, it loads and decompresses the chunked snapshot.

Important files:

- `app/page.tsx` — dashboard, search, company view, applied tracker, Gmail preview, nebula UI.
- `app/api/discover/route.ts` — public company-site inspection and ATS discovery.
- `app/api/preferences/route.ts` — transient résumé-to-interest suggestions.
- `app/api/companies/route.ts` — moderation-queue submission endpoint.
- `app/sector-starter-companies.json` — curated starter pack for broad US sectors beyond tech.
- `app/company-registry-preview.json` — public company watchlist preview.
- `public/job-snapshot/` — compressed direct-ATS role snapshot used by local/dev builds.
- `app/job-feed-summary.json` — dashboard counts for the checked-in snapshot.
- `scripts/audit-job-snapshot.mjs` — local audit report for duplicates, source URLs, provider counts, geography split, and raw HTML leaks.
- `drizzle/0001_company_submissions.sql` — Cloudflare D1 submission schema.

## Supported careers systems

- Greenhouse public board APIs
- Ashby public job-board APIs
- Lever public postings APIs
- SmartRecruiters public company postings APIs

Provider adapters intentionally return a transparent unsupported result for custom career systems. Contributions for Workday, iCIMS, Workable, Breezy, schema.org JobPosting extraction, and company-specific adapters are welcome.

## How Launchpad avoids fabricated postings

The crawler should only promote a row to “open role” after it passes all of these gates:

1. The company appears in a local registry or is explicitly onboarded by the user.
2. The company website or careers page links to a recognized company-controlled careers system.
3. The provider adapter returns structured data with a title, location, stable id/source URL, and application URL.
4. The location is US/US-eligible by default, unless the user enables international roles.
5. Display text is cleaned of HTML and script/style content.
6. Duplicate rows are removed by provider-native job ID first. Canonical apply URL and company/title/location fingerprints are reported as audit signals because some companies reuse one apply URL for multiple legitimate roles.
7. The UI keeps the original listing link visible so users can verify before applying.

Anything that fails those checks should remain “tracked company / unresolved feed,” not a job posting.

Run the audit locally:

```bash
npm run data:audit
```

The audit fails if it finds duplicate provider IDs, missing source URLs/evidence, or visible raw HTML in display fields. Reused apply URLs and repeated company/title/location fingerprints are reported as review signals instead of hard failures.

## Gmail-aware tracking

The public UI has two scan modes:

- `All detected emails` — previews application-looking email updates even before a user marks roles as applied.
- `Matched to applied` — limits matching to roles the user explicitly marked as applied.

Launchpad includes a Google OAuth flow for user-owned Gmail access. It requests only:

```text
https://www.googleapis.com/auth/gmail.readonly
openid
email
```

Required environment variables:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GMAIL_COOKIE_SECRET=at-least-32-characters
```

These are optional for local browsing/search. Without them, the Gmail drawer shows setup-needed copy; all job search, company views, and Company Nebula still work.

Google OAuth redirect URI:

```text
https://YOUR_SITE_DOMAIN/api/gmail/callback
```

The app stores the Gmail refresh token in an encrypted HttpOnly cookie for the demo implementation. A hardened public release should move refresh tokens to durable per-user storage, complete Google OAuth app verification, show previews before import, store only minimal metadata, and provide disconnect/delete controls.

## Security and privacy model

- Discovery accepts only public HTTPS company websites.
- Localhost, loopback, link-local, private-network ranges, credentials, custom ports, and script execution are blocked.
- Company submissions enter a pending moderation queue; they are not automatically trusted.
- Résumé personalization is transient: pasted text is analyzed for suggestions and not stored.
- Applied-role tracking is local browser state in the demo.
- No paid third-party job aggregation APIs are required for the default workflow.

## Contributing

Good first contributions:

1. Add or improve a careers-system adapter.
2. Add representative response fixtures and malformed-input tests.
3. Improve company sector and contribution-tag classification.
4. Improve crawler coverage while preserving direct official application URLs.
5. Keep geography based on structured location fields wherever possible.

## License

Choose an open-source license before the first public GitHub release. Apache-2.0 is recommended for a project intended to accept provider adapters from outside contributors.
