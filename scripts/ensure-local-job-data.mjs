import fs from "node:fs";
import zlib from "node:zlib";

const plainPath = "public/jobs-data.json";
const manifestPath = "public/job-snapshot/manifest.json";
const appEmptyPath = "app/jobs-data.json";

if (process.env.LAUNCHPAD_SKIP_UNPACK === "1") {
  process.exit(0);
}

function hasUsablePlainData() {
  try {
    const stat = fs.statSync(plainPath);
    if (stat.size < 1000) return false;
    const fd = fs.openSync(plainPath, "r");
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    return buffer.toString("utf8").trimStart().startsWith("[{");
  } catch {
    return false;
  }
}

if (hasUsablePlainData()) {
  process.exit(0);
}

if (!fs.existsSync(manifestPath)) {
  console.warn("[launchpad] No bundled job snapshot found. The app will start with an empty local dataset.");
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const parts = manifest.parts || [];
if (!parts.length) {
  console.warn("[launchpad] Job snapshot manifest has no parts. The app will start with an empty local dataset.");
  process.exit(0);
}

const compressed = Buffer.concat(parts.map((part) => fs.readFileSync(`public/job-snapshot/${part}`)));
const json = zlib.gunzipSync(compressed);
fs.writeFileSync(plainPath, json);
if (fs.existsSync(appEmptyPath)) fs.writeFileSync(appEmptyPath, "[]");

const count = JSON.parse(json.toString("utf8")).length;
console.log(`[launchpad] Local job dataset ready: ${count.toLocaleString()} official postings.`);
