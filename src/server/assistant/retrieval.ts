import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { claimSources, claims, entries, sources } from "@/db/schema";
import { normalizeName } from "@/lib/text";

export type RetrievedClaim = {
  key: string; // stable citation key used in prompts and answers, e.g. "C3"
  claimId: string;
  statement: string;
  status: string;
  sources: { title: string; url: string; publisher: string; reliability: string; stance: string; excerpt: string }[];
};

export type RetrievedEntry = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  evidenceStatus: string;
  aliases: string[];
  matchedBy: "name" | "text";
  claims: RetrievedClaim[];
};

const STOPWORDS = new Set(
  "a an and are as at be by can could did do does for from how i in is it me my of on or should the this to was what when where which who why will with you your about tell explain difference between vs versus".split(" "),
);

export function contentTerms(question: string): string[] {
  return [...new Set(normalizeName(question).split(" ").filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w)))].slice(0, 12);
}

/**
 * Two-stage retrieval over published entries only (private user content is never searched):
 * 1. Name/alias mentions — the question literally names a skill ("what is a rudy").
 * 2. Full-text OR-query over names, summaries and bodies for descriptive questions.
 */
export async function retrieve(question: string, limit = 4): Promise<RetrievedEntry[]> {
  const nq = ` ${normalizeName(question)} `;
  const terms = contentTerms(question);

  const nameHits = await db.execute<{ id: string; len: number }>(sql`
    select e.id, max(length(n)) as len
    from entries e,
      lateral (select e.normalized_name as n union all select a.normalized_alias from entry_aliases a where a.entry_id = e.id) names
    where e.state = 'published' and length(n) >= 3 and position(' ' || n || ' ' in ${nq}) > 0
    group by e.id
    order by len desc
    limit ${limit}`);
  const ids = nameHits.rows.map((r) => r.id);
  const matchedByName = new Set(ids);

  if (ids.length < limit && terms.length) {
    const tsq = terms.map((t) => t.replace(/[^a-z0-9]/g, "")).filter(Boolean).join(" | ");
    if (tsq) {
      const ft = await db.execute<{ id: string }>(sql`
        select id from entries
        where state = 'published' and search_vector @@ to_tsquery('english', ${tsq})
        order by ts_rank(search_vector, to_tsquery('english', ${tsq})) desc
        limit ${limit * 2}`);
      for (const r of ft.rows) if (!ids.includes(r.id) && ids.length < limit) ids.push(r.id);
    }
  }
  if (ids.length === 0) return [];

  const entryRows = await db
    .select({ id: entries.id, slug: entries.slug, name: entries.canonicalName, summary: entries.summary, evidenceStatus: entries.evidenceStatus })
    .from(entries)
    .where(inArray(entries.id, ids));
  const aliasRows = await db.execute<{ entry_id: string; alias: string }>(
    sql`select entry_id, alias from entry_aliases where entry_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`,
  );
  const claimRows = await db
    .select({
      entryId: claims.entryId,
      claimId: claims.id,
      statement: claims.statement,
      status: claims.status,
      sortOrder: claims.sortOrder,
      title: sources.title,
      url: sources.url,
      publisher: sources.publisher,
      reliability: sources.reliability,
      stance: claimSources.stance,
      excerpt: claimSources.excerpt,
    })
    .from(claims)
    .leftJoin(claimSources, sql`${claimSources.claimId} = ${claims.id}`)
    .leftJoin(sources, sql`${sources.id} = ${claimSources.sourceId}`)
    .where(inArray(claims.entryId, ids))
    .orderBy(claims.sortOrder);

  let n = 0;
  const out: RetrievedEntry[] = [];
  for (const id of ids) {
    const e = entryRows.find((r) => r.id === id);
    if (!e) continue;
    const byClaim = new Map<string, RetrievedClaim>();
    for (const c of claimRows.filter((r) => r.entryId === id)) {
      let rc = byClaim.get(c.claimId);
      if (!rc) {
        rc = { key: `C${++n}`, claimId: c.claimId, statement: c.statement, status: c.status, sources: [] };
        byClaim.set(c.claimId, rc);
      }
      if (c.url) rc.sources.push({ title: c.title!, url: c.url, publisher: c.publisher!, reliability: c.reliability!, stance: c.stance!, excerpt: c.excerpt ?? "" });
    }
    out.push({
      ...e,
      aliases: aliasRows.rows.filter((a) => a.entry_id === id).map((a) => a.alias),
      matchedBy: matchedByName.has(id) ? "name" : "text",
      claims: [...byClaim.values()],
    });
  }
  return out;
}
