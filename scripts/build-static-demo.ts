/**
 * Builds a static, read-only demo of Trampolin for GitHub Pages.
 *
 * Exports the published Trick Book from the configured database to JSON and bundles a
 * small client app that reuses the real text-normalisation and safety-classification
 * modules. Output: ./static-demo-dist (upload as-is to any static host).
 *
 * Usage: npm run build:static-demo   (needs a migrated + seeded DATABASE_URL)
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { closeDb } from "../src/db";
import { getEntryBySlug, kbStats, listCategories, relatedEntries, searchEntries } from "../src/server/kb/entries";

const OUT = path.resolve("static-demo-dist");

async function exportData() {
  const cards = [];
  for (let page = 1; ; page++) {
    const res = await searchEntries({ sort: "name", pageSize: 100, page }, null);
    cards.push(...res.items);
    if (page >= res.pageCount) break;
  }
  const entries = [];
  for (const c of cards) {
    const e = await getEntryBySlug(c.slug, null);
    if (!e) continue;
    const related = await relatedEntries(e.id, 6);
    entries.push({
      slug: e.slug,
      name: e.canonicalName,
      kind: e.kind,
      summary: e.summary,
      body: e.body,
      figNotation: e.figNotation,
      quarterRotations: e.quarterRotations,
      halfTwists: e.halfTwists,
      position: e.position,
      evidenceStatus: e.evidenceStatus,
      tags: e.tags,
      category: e.categorySlug,
      categoryName: e.categoryName,
      aliases: e.aliases.map((a) => a.alias),
      lastReviewedAt: e.lastReviewedAt?.toISOString() ?? null,
      revision: e.revision,
      revisions: e.revisions.map((r) => ({ revision: r.revision, summary: r.changeSummary, at: r.createdAt.toISOString() })),
      claims: e.claims.map((cl) => ({
        statement: cl.statement,
        status: cl.status,
        citations: cl.citations.map((ci) => ({ sourceId: ci.sourceId, stance: ci.stance, excerpt: ci.excerpt })),
      })),
      relations: e.relations.map((r) => ({ slug: r.slug, name: r.name, kind: r.kind, note: r.note })),
      related: related.map((r) => ({ slug: r.slug, name: r.canonical_name, reason: r.reason })),
    });
  }
  const sources: Record<string, unknown> = {};
  for (const c of cards) {
    const e = await getEntryBySlug(c.slug, null);
    for (const s of e?.sources ?? [])
      sources[s.sourceId] = { title: s.title, url: s.url, publisher: s.publisher, reliability: s.reliability, retrievalMethod: s.retrievalMethod, accessedAt: s.accessedAt.toISOString() };
  }
  const categories = (await listCategories(null)).map((c) => ({ slug: c.slug, name: c.name, description: c.description, count: c.count }));
  const stats = await kbStats();
  return { generatedAt: new Date().toISOString(), entries, sources, categories, stats };
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const data = await exportData();
await writeFile(path.join(OUT, "data.json"), JSON.stringify(data));
await build({
  entryPoints: ["static-demo/app.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  outfile: path.join(OUT, "app.js"),
  alias: { "@": path.resolve("src") },
  logLevel: "warning",
});
for (const f of ["index.html", "styles.css", "404.html"]) await cp(path.join("static-demo", f), path.join(OUT, f));
await writeFile(path.join(OUT, ".nojekyll"), "");
console.log(`Static demo written to ${OUT}: ${data.entries.length} entries, ${Object.keys(data.sources).length} sources.`);
await closeDb();
