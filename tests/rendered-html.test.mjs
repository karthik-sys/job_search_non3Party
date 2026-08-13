import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Launchpad public shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Launchpad — Direct Company US Jobs<\/title>/i);
  assert.match(html, /Your next role/);
  assert.match(html, /without the noise/);
  assert.match(html, /Run your own job-market bulletin from official company careers systems/);
  assert.match(html, /Company Nebula/);
  assert.match(html, /Link Gmail/);
  assert.match(html, /\+ Add company/);
  assert.match(html, /JOB ROLE FAMILY · LIVE ROLES/);
  assert.match(html, /COMPANY SECTOR · LIVE ROLES/);
  assert.match(html, /Coverage model/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|react-loading-skeleton/i);
});

test("keeps public docs and source aligned with the product", async () => {
  const [readme, page, preferences, layout] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/preferences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(readme, /npm install\nnpm run dev/);
  assert.match(readme, /No paid third-party job aggregation APIs are required/);
  assert.match(readme, /forked, remixed, and run locally/);
  assert.match(readme, /npm run data:audit/);
  assert.match(page, /Include international/);
  assert.match(page, /Dedupe-first index/);
  assert.match(readme, /All detected emails/);
  assert.match(readme, /Matched to applied/);
  assert.match(page, /gmailMode === "all"/);
  assert.match(page, /Matched to applied/);
  assert.match(page, /contributionTags/);
  assert.match(page, /slice\(0, 50\)/);
  assert.match(page, /Top companies in this market/);
  assert.match(page, /Companies can appear in multiple markets/);
  assert.match(preferences, /Customer Success & Support/);
  assert.match(preferences, /Finance, People & Legal/);
  assert.match(layout, /Direct Company US Jobs/);
  assert.doesNotMatch(layout, /Software & AI Jobs/);
});
