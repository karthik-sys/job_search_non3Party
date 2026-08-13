# Launchpad Careers

Launchpad is a company-first US job dashboard. It indexes official company careers feeds, lets users search roles and hiring companies, and sends applicants to the original company-controlled application page.

The product goal is simple: your next role, without the noisy third-party reposting layer.

## What it does

- Tracks a broad US company watchlist and resolves supported official ATS feeds.
- Ingests live roles from Greenhouse, Ashby, and Lever without paid job-board APIs.
- Searches across all kinds of US roles, not only software or AI.
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

## Data model

The checked-in source keeps the app code small. Production builds can include a generated `public/jobs-data.json` snapshot from the direct careers feed crawler.

Important files:

- `app/page.tsx` — dashboard, search, company view, applied tracker, Gmail preview, nebula UI.
- `app/api/discover/route.ts` — public company-site inspection and ATS discovery.
- `app/api/preferences/route.ts` — transient résumé-to-interest suggestions.
- `app/api/companies/route.ts` — moderation-queue submission endpoint.
- `app/company-registry-preview.json` — public company watchlist preview.
- `work/fetch-direct-jobs.mjs` — direct ATS ingestion crawler.
- `drizzle/0001_company_submissions.sql` — Cloudflare D1 submission schema.

## Supported careers systems

- Greenhouse
- Ashby
- Lever

Provider adapters intentionally return a transparent unsupported result for custom career systems. Contributions for Workday, SmartRecruiters, iCIMS, Workable, and company-specific adapters are welcome.

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
