# Launchpad Careers

A company-first job index that discovers official careers pages, reads public ATS feeds, and sends applicants to the company-controlled application page.

## What it does

- Indexes direct Greenhouse and Ashby feeds from a curated US-company watchlist.
- Discovers Greenhouse, Lever, and Ashby when a user submits a company website.
- Previews every live role before a company is submitted to the registry.
- Strictly classifies software-engineering and applied-AI titles.
- Filters against structured US location fields rather than description keywords.
- Stores new company submissions in a moderation queue using Cloudflare D1.
- Links directly to the official ATS application URL.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The production build is Cloudflare Worker-compatible:

```bash
npm run build
```

## Architecture

- `app/page.tsx` — searchable job dashboard and onboarding UI
- `app/api/discover/route.ts` — safe public-site inspection and ATS discovery
- `app/api/companies/route.ts` — persistent moderation-queue submission
- `work/direct-company-seeds.tsv` — curated starter watchlist
- `work/fetch-direct-jobs.mjs` — direct ATS ingestion and strict classification
- `drizzle/0001_company_submissions.sql` — D1 schema

## Supported careers systems

- Greenhouse
- Lever
- Ashby

Provider adapters intentionally return a transparent unsupported result for custom career systems. Contributions for Workday, SmartRecruiters, iCIMS, and company-specific adapters are welcome.

## Security model

The discovery endpoint accepts only public HTTPS origins, rejects credentials, custom ports, localhost, loopback, link-local, and common private-network ranges, follows bounded timeouts, and never executes scripts from inspected sites. Submissions enter a pending moderation queue; they are not automatically trusted or merged into the public index.

## Contributing

1. Add or improve a provider adapter.
2. Include representative response fixtures and malformed-input cases.
3. Preserve direct official application URLs.
4. Keep geography based on structured fields.
5. Never classify a role from generic AI/engineering words in its description.

## License

Choose an open-source license before the first public GitHub release. Apache-2.0 is recommended for a project intended to accept provider adapters from outside contributors.
