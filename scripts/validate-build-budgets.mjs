import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

const manifestPath = ".next/server/app/page_client-reference-manifest.js";
const sandbox = { globalThis: {} };
vm.runInNewContext(await readFile(manifestPath, "utf8"), sandbox);
const manifest = sandbox.globalThis.__RSC_MANIFEST?.["/page"];
assert.ok(manifest, "missing /page client reference manifest; run npm run build first");

const projectModules = Object.entries(manifest.clientModules).filter(([name]) =>
  name.startsWith("[project]/components/") || name.startsWith("[project]/lib/")
);
const frameworkChunks = new Set(Object.entries(manifest.clientModules)
  .filter(([name]) => name.startsWith("[project]/node_modules/"))
  .flatMap(([, module]) => module.chunks));
const chunks = [...new Set(projectModules.flatMap(([, module]) => module.chunks))]
  .filter((chunk) => !frameworkChunks.has(chunk));
assert.ok(chunks.length > 0, "no app-owned client chunks found");

let decodedBytes = 0;
let gzipBytes = 0;
const sources = [];
for (const chunk of chunks) {
  const path = `.next/${chunk.replace(/^\/_next\//, "")}`;
  const source = await readFile(path);
  decodedBytes += source.byteLength;
  gzipBytes += gzipSync(source).byteLength;
  sources.push(source.toString("utf8"));
}

const rootHtmlBytes = (await stat(".next/server/app/index.html")).size;
const combined = sources.join("\n");
const forbiddenServerTokens = ["site.api.espn.com", "/scoreboard?dates=", "sports/core/", "sports/football/"];
const leaked = forbiddenServerTokens.filter((token) => combined.includes(token));

const budgets = {
  appClientDecodedBytes: { actual: decodedBytes, maximum: 45 * 1024 },
  appClientGzipBytes: { actual: gzipBytes, maximum: 14 * 1024 },
  rootHtmlBytes: { actual: rootHtmlBytes, maximum: 160 * 1024 },
};
for (const [name, budget] of Object.entries(budgets)) {
  assert.ok(budget.actual <= budget.maximum, `${name} ${budget.actual} exceeds ${budget.maximum}`);
}
assert.deepEqual(leaked, [], `server-only registry tokens leaked into client chunks: ${leaked.join(", ")}`);

console.log(JSON.stringify({
  projectClientModules: projectModules.length,
  chunks,
  budgets,
  forbiddenServerTokens: "absent",
}, null, 2));
