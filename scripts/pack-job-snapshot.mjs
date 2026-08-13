import fs from "node:fs";
import zlib from "node:zlib";

const inputPath = "public/jobs-data.json";
const appEmptyPath = "app/jobs-data.json";
const snapshotDir = "public/job-snapshot";
const partSize = 760_000;

const jobs = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!Array.isArray(jobs) || jobs.length === 0) {
  console.error(`No jobs found in ${inputPath}; refusing to overwrite the snapshot.`);
  process.exit(1);
}

fs.mkdirSync(snapshotDir, { recursive: true });
const existingManifestPath = `${snapshotDir}/manifest.json`;
if (fs.existsSync(existingManifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(existingManifestPath, "utf8"));
  for (const part of manifest.parts || []) {
    const path = `${snapshotDir}/${part}`;
    if (fs.existsSync(path)) fs.unlinkSync(path);
  }
}

const json = JSON.stringify(jobs);
const compressed = zlib.gzipSync(Buffer.from(json));
const parts = [];
for (let offset = 0; offset < compressed.length; offset += partSize) {
  const part = `part-${String(parts.length + 1).padStart(3, "0")}.json.gz`;
  fs.writeFileSync(`${snapshotDir}/${part}`, compressed.subarray(offset, offset + partSize));
  parts.push(part);
}

fs.writeFileSync(`${snapshotDir}/manifest.json`, `${JSON.stringify({
  encoding: "gzip",
  generatedAt: new Date().toISOString(),
  jobs: jobs.length,
  parts,
  bytes: compressed.length,
  sourceBytes: Buffer.byteLength(json),
}, null, 2)}\n`);
fs.writeFileSync(inputPath, "[]");
fs.writeFileSync(appEmptyPath, "[]");

console.log(JSON.stringify({ jobs: jobs.length, parts: parts.length, bytes: compressed.length }, null, 2));
