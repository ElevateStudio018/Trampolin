import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/db";
import { textArray } from "@/db/sql";
import {
  categories,
  claimSources,
  claims,
  entries,
  entryAliases,
  entryRelations,
  entryRevisions,
  sources,
} from "@/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { normalizeName, slugify } from "@/lib/text";
import { type Actor, assertRole, hasRole } from "@/server/actor";
import { audit } from "@/server/audit";

export const EVIDENCE_STATUSES = ["verified", "limited_evidence", "community", "ai_draft", "conflicting"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export const POSITIONS = ["tuck", "pike", "straight", "straddle", "any", "none"] as const;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  category: z.string().trim().max(60).optional(),
  evidence: z.enum(EVIDENCE_STATUSES).optional(),
  tag: z.string().trim().max(40).optional(),
  rotation: z.coerce.number().int().min(0).max(16).optional(),
  sort: z.enum(["relevance", "name", "updated", "rotation"]).optional().default("relevance"),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(24),
  includeDrafts: z.boolean().optional().default(false),
});
export type SearchInput = z.input<typeof searchSchema>;

export type EntryCard = {
  id: string;
  slug: string;
  canonicalName: string;
  summary: string;
  figNotation: string | null;
  evidenceStatus: EvidenceStatus;
  state: "draft" | "published" | "archived";
  categoryName: string | null;
  categorySlug: string | null;
  tags: string[];
  aliases: string[];
  quarterRotations: number | null;
  halfTwists: number | null;
};

/**
 * Full-text + fuzzy search over entry names, aliases, summaries and bodies.
 * Ranking combines Postgres FTS rank with trigram similarity on names so that
 * misspellings ("rudi", "baranni") still find the right entry.
 */
export async function searchEntries(input: SearchInput, actor: Actor) {
  const params = searchSchema.parse(input);
  const q = normalizeName(params.q);
  const where: SQL[] = [];
  const canSeeDrafts = params.includeDrafts && hasRole(actor, "reviewer");
  where.push(canSeeDrafts ? ne(entries.state, "archived") : eq(entries.state, "published"));
  if (params.category) where.push(eq(categories.slug, params.category));
  if (params.evidence) where.push(eq(entries.evidenceStatus, params.evidence));
  if (params.tag) where.push(sql`${params.tag} = any(${entries.tags})`);
  if (params.rotation !== undefined) where.push(eq(entries.quarterRotations, params.rotation));

  let rank: SQL = sql`0`;
  if (q) {
    const tsq = sql`websearch_to_tsquery('english', ${params.q})`;
    const tsqSimple = sql`websearch_to_tsquery('simple', ${params.q})`;
    where.push(
      sql`(${entries.searchVector} @@ ${tsq} or ${entries.searchVector} @@ ${tsqSimple} or word_similarity(${q}, ${entries.searchNames}) > 0.45 or ${entries.searchNames} ilike ${"%" + q + "%"})`,
    );
    rank = sql`(ts_rank(${entries.searchVector}, ${tsq}) + ts_rank(${entries.searchVector}, ${tsqSimple}) + 2 * word_similarity(${q}, ${entries.searchNames}) + case when ${entries.normalizedName} = ${q} then 5 when ${entries.searchNames} like ${"%" + q + "%"} then 1 else 0 end)`;
  }

  const order =
    params.sort === "name"
      ? [asc(entries.canonicalName)]
      : params.sort === "updated"
        ? [desc(entries.updatedAt)]
        : params.sort === "rotation"
          ? [sql`${entries.quarterRotations} asc nulls last`, sql`${entries.halfTwists} asc nulls last`, asc(entries.canonicalName)]
          : q
            ? [desc(rank), asc(entries.canonicalName)]
            : [asc(entries.canonicalName)];

  const whereSql = and(...where);
  const rows = await db
    .select({
      id: entries.id,
      slug: entries.slug,
      canonicalName: entries.canonicalName,
      summary: entries.summary,
      figNotation: entries.figNotation,
      evidenceStatus: entries.evidenceStatus,
      state: entries.state,
      categoryName: categories.name,
      categorySlug: categories.slug,
      tags: entries.tags,
      quarterRotations: entries.quarterRotations,
      halfTwists: entries.halfTwists,
      total: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(entries)
    .leftJoin(categories, eq(categories.id, entries.categoryId))
    .where(whereSql)
    .orderBy(...order)
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  const aliasMap = await aliasesFor(rows.map((r) => r.id));
  const items: EntryCard[] = rows.map(({ total: _t, ...r }) => ({ ...r, aliases: aliasMap.get(r.id) ?? [] }));
  const total = rows[0]?.total ?? 0;
  return { items, total, page: params.page, pageSize: params.pageSize, pageCount: Math.max(1, Math.ceil(total / params.pageSize)) };
}

async function aliasesFor(ids: string[]) {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ entryId: entryAliases.entryId, alias: entryAliases.alias })
    .from(entryAliases)
    .where(inArray(entryAliases.entryId, ids))
    .orderBy(asc(entryAliases.alias));
  for (const r of rows) map.set(r.entryId, [...(map.get(r.entryId) ?? []), r.alias]);
  return map;
}

export async function listCategories(actor: Actor) {
  const visible = hasRole(actor, "reviewer") ? sql`${entries.state} <> 'archived'` : sql`${entries.state} = 'published'`;
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      count: sql<number>`count(${entries.id}) filter (where ${visible})`.mapWith(Number),
    })
    .from(categories)
    .leftJoin(entries, eq(entries.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function listTags() {
  const res = await db.execute<{ tag: string; count: number }>(
    sql`select tag, count(*)::int as count from entries, unnest(tags) as tag where state = 'published' group by tag order by count desc, tag asc limit 40`,
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// Entry detail
// ---------------------------------------------------------------------------

export async function getEntryBySlug(slug: string, actor: Actor) {
  const [row] = await db
    .select({ entry: entries, categoryName: categories.name, categorySlug: categories.slug })
    .from(entries)
    .leftJoin(categories, eq(categories.id, entries.categoryId))
    .where(eq(entries.slug, slug));
  if (!row) return null;
  if (row.entry.state !== "published" && !hasRole(actor, "reviewer")) return null;
  return { ...row.entry, categoryName: row.categoryName, categorySlug: row.categorySlug, ...(await entryDetails(row.entry.id, actor)) };
}

/** Finds an entry whose alias matches; used to redirect /tricks/<alias-slug> to the canonical page. */
export async function findSlugByAlias(term: string): Promise<string | null> {
  const n = normalizeName(term.replace(/-/g, " "));
  const [hit] = await db
    .select({ slug: entries.slug })
    .from(entryAliases)
    .innerJoin(entries, eq(entries.id, entryAliases.entryId))
    .where(and(eq(entryAliases.normalizedAlias, n), eq(entries.state, "published")));
  return hit?.slug ?? null;
}

async function entryDetails(entryId: string, actor: Actor) {
  const [aliasRows, claimRows, relRows, revisions] = await Promise.all([
    db.select().from(entryAliases).where(eq(entryAliases.entryId, entryId)).orderBy(asc(entryAliases.alias)),
    db
      .select({
        claimId: claims.id,
        statement: claims.statement,
        status: claims.status,
        sortOrder: claims.sortOrder,
        sourceId: sources.id,
        sourceTitle: sources.title,
        sourceUrl: sources.url,
        publisher: sources.publisher,
        reliability: sources.reliability,
        retrievalMethod: sources.retrievalMethod,
        accessedAt: sources.accessedAt,
        stance: claimSources.stance,
        excerpt: claimSources.excerpt,
      })
      .from(claims)
      .leftJoin(claimSources, eq(claimSources.claimId, claims.id))
      .leftJoin(sources, eq(sources.id, claimSources.sourceId))
      .where(eq(claims.entryId, entryId))
      .orderBy(asc(claims.sortOrder), asc(claims.createdAt)),
    db
      .select({
        kind: entryRelations.kind,
        note: entryRelations.note,
        fromId: entryRelations.fromEntryId,
        toId: entryRelations.toEntryId,
        slug: entries.slug,
        name: entries.canonicalName,
        state: entries.state,
      })
      .from(entryRelations)
      .innerJoin(
        entries,
        or(
          and(eq(entryRelations.fromEntryId, entryId), eq(entries.id, entryRelations.toEntryId)),
          and(eq(entryRelations.toEntryId, entryId), eq(entries.id, entryRelations.fromEntryId)),
        ),
      )
      .where(or(eq(entryRelations.fromEntryId, entryId), eq(entryRelations.toEntryId, entryId))),
    db
      .select({
        revision: entryRevisions.revision,
        changeSummary: entryRevisions.changeSummary,
        createdAt: entryRevisions.createdAt,
      })
      .from(entryRevisions)
      .where(eq(entryRevisions.entryId, entryId))
      .orderBy(desc(entryRevisions.revision)),
  ]);

  type Citation = {
    sourceId: string;
    title: string;
    url: string;
    publisher: string;
    reliability: string;
    retrievalMethod: string;
    accessedAt: Date;
    stance: string;
    excerpt: string;
  };
  const claimMap = new Map<string, { id: string; statement: string; status: string; citations: Citation[] }>();
  for (const r of claimRows) {
    const c = claimMap.get(r.claimId) ?? { id: r.claimId, statement: r.statement, status: r.status, citations: [] };
    if (r.sourceId)
      c.citations.push({
        sourceId: r.sourceId,
        title: r.sourceTitle!,
        url: r.sourceUrl!,
        publisher: r.publisher!,
        reliability: r.reliability!,
        retrievalMethod: r.retrievalMethod!,
        accessedAt: r.accessedAt!,
        stance: r.stance!,
        excerpt: r.excerpt ?? "",
      });
    claimMap.set(r.claimId, c);
  }
  const claimList = [...claimMap.values()];
  const sourceMap = new Map<string, Citation>();
  for (const c of claimList) for (const s of c.citations) if (!sourceMap.has(s.sourceId)) sourceMap.set(s.sourceId, s);

  const seeDrafts = hasRole(actor, "reviewer");
  const relations = relRows
    .filter((r) => seeDrafts || r.state === "published")
    .map((r) => ({ kind: r.kind, note: r.note, slug: r.slug, name: r.name, direction: r.fromId === entryId ? "out" : "in" }));

  return { aliases: aliasRows, claims: claimList, sources: [...sourceMap.values()], relations, revisions };
}

/**
 * Related-entry discovery: explicit relations first, then entries that share the
 * same rotation/twist structure, category or tags. Returns at most `limit` cards.
 */
export async function relatedEntries(entryId: string, limit = 6) {
  const [base] = await db.select().from(entries).where(eq(entries.id, entryId));
  if (!base) return [];
  const res = await db.execute<{ slug: string; canonical_name: string; summary: string; score: number; reason: string; evidence_status: EvidenceStatus }>(sql`
    select e.slug, e.canonical_name, e.summary, e.evidence_status,
      (case when r.kind is not null then 10 else 0 end)
      + (case when e.quarter_rotations is not null and e.quarter_rotations = ${base.quarterRotations} then 3 else 0 end)
      + (case when e.half_twists is not null and e.half_twists = ${base.halfTwists} then 1 else 0 end)
      + (case when e.category_id = ${base.categoryId} then 2 else 0 end)
      + coalesce(cardinality(array(select unnest(e.tags) intersect select unnest(${textArray(base.tags)}))), 0) as score,
      case
        when r.kind is not null then 'Linked by editors'
        when e.quarter_rotations is not null and e.quarter_rotations = ${base.quarterRotations} then 'Same amount of rotation'
        when e.category_id = ${base.categoryId} then 'Same category'
        else 'Shared tags'
      end as reason
    from entries e
    left join entry_relations r on (r.from_entry_id = ${entryId} and r.to_entry_id = e.id) or (r.to_entry_id = ${entryId} and r.from_entry_id = e.id)
    where e.id <> ${entryId} and e.state = 'published'
    order by score desc, e.canonical_name asc
    limit ${limit}`);
  return res.rows.filter((r) => Number(r.score) > 0);
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export type DuplicateCandidate = { entryId: string; slug: string; name: string; match: "exact" | "similar"; via: string; score: number };

/** Checks a proposed name and aliases against every existing entry name and alias. */
export async function findPossibleDuplicates(names: string[], excludeEntryId?: string, tx: DbOrTx = db): Promise<DuplicateCandidate[]> {
  const normalized = [...new Set(names.map(normalizeName).filter(Boolean))];
  if (normalized.length === 0) return [];
  const exclude = excludeEntryId ? sql`and e.id <> ${excludeEntryId}` : sql``;
  const res = await tx.execute<{ entry_id: string; slug: string; name: string; via: string; score: number }>(sql`
    with candidates as (
      select e.id as entry_id, e.slug, e.canonical_name as name, e.normalized_name as via
      from entries e where e.state <> 'archived' ${exclude}
      union all
      select e.id, e.slug, e.canonical_name, a.normalized_alias
      from entry_aliases a join entries e on e.id = a.entry_id where e.state <> 'archived' ${exclude}
    )
    select entry_id, slug, name, via, max(similarity(via, n)) as score
    from candidates, unnest(${textArray(normalized)}) as n
    where via = n or similarity(via, n) > 0.55
    group by entry_id, slug, name, via
    order by score desc
    limit 10`);
  const seen = new Set<string>();
  const out: DuplicateCandidate[] = [];
  for (const r of res.rows) {
    if (seen.has(r.entry_id)) continue;
    seen.add(r.entry_id);
    const exact = normalized.includes(r.via);
    out.push({ entryId: r.entry_id, slug: r.slug, name: r.name, via: r.via, match: exact ? "exact" : "similar", score: exact ? 1 : Number(r.score) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Editing (reviewer+)
// ---------------------------------------------------------------------------

const nullableInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).max(20).nullable());

export const entryInputSchema = z.object({
  canonicalName: z.string().trim().min(2).max(80),
  summary: z.string().trim().min(10, "Write at least a sentence").max(600),
  body: z.string().trim().max(10_000).default(""),
  kind: z.enum(["skill", "term", "rule"]).default("skill"),
  categorySlug: z.string().trim().max(60).optional().nullable(),
  figNotation: z.string().trim().max(20).optional().nullable(),
  quarterRotations: nullableInt.optional(),
  halfTwists: nullableInt.optional(),
  position: z.enum(POSITIONS).optional().nullable(),
  evidenceStatus: z.enum(EVIDENCE_STATUSES).default("ai_draft"),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(12).default([]),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});
export type EntryInput = z.input<typeof entryInputSchema>;

function parseEntryInput(input: EntryInput) {
  const parsed = entryInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Please fix the highlighted fields", z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  const canonicalNorm = normalizeName(data.canonicalName);
  const aliases = [...new Map(data.aliases.map((a) => [normalizeName(a), a] as const)).entries()].filter(([n]) => n && n !== canonicalNorm);
  return { ...data, canonicalNorm, aliases };
}

async function categoryIdFor(slug: string | null | undefined, tx: DbOrTx) {
  if (!slug) return null;
  const [c] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  if (!c) throw new ValidationError("Unknown category", { categorySlug: ["Unknown category"] });
  return c.id;
}

async function snapshot(entryId: string, tx: DbOrTx) {
  const [e] = await tx.select().from(entries).where(eq(entries.id, entryId));
  const aliasRows = await tx.select({ alias: entryAliases.alias }).from(entryAliases).where(eq(entryAliases.entryId, entryId));
  const claimRows = await tx.select({ id: claims.id, statement: claims.statement, status: claims.status }).from(claims).where(eq(claims.entryId, entryId));
  const { searchVector: _sv, ...rest } = e!;
  return { ...rest, aliases: aliasRows.map((a) => a.alias), claims: claimRows };
}

async function writeAliases(entryId: string, aliases: [string, string][], tx: DbOrTx) {
  await tx.delete(entryAliases).where(eq(entryAliases.entryId, entryId));
  if (aliases.length) await tx.insert(entryAliases).values(aliases.map(([normalizedAlias, alias]) => ({ entryId, alias, normalizedAlias })));
}

function searchNamesFor(name: string, aliases: [string, string][]) {
  return [normalizeName(name), ...aliases.map(([n]) => n)].join(" | ");
}

async function uniqueSlug(base: string, tx: DbOrTx, excludeId?: string) {
  let slug = slugify(base);
  for (let i = 2; ; i++) {
    const [hit] = await tx.select({ id: entries.id }).from(entries).where(eq(entries.slug, slug));
    if (!hit || hit.id === excludeId) return slug;
    slug = `${slugify(base)}-${i}`;
  }
}

function rethrowUnique(err: unknown): never {
  const cause = (err as { cause?: { code?: string; constraint?: string } }).cause ?? (err as { code?: string; constraint?: string });
  if (cause?.code === "23505") {
    if (String(cause.constraint).includes("alias")) throw new ConflictError("One of the aliases already belongs to another entry");
    throw new ConflictError("An entry with that name already exists");
  }
  throw err;
}

export async function createEntry(input: EntryInput, actor: Actor, opts: { tx?: DbOrTx; changeSummary?: string } = {}) {
  assertRole(actor, "reviewer");
  const data = parseEntryInput(input);
  const run = async (tx: DbOrTx) => {
    const dupes = (await findPossibleDuplicates([data.canonicalName, ...data.aliases.map(([, a]) => a)], undefined, tx)).filter((d) => d.match === "exact");
    if (dupes.length) throw new ConflictError(`Duplicate of existing entry "${dupes[0]!.name}"`);
    const [entry] = await tx
      .insert(entries)
      .values({
        slug: await uniqueSlug(data.canonicalName, tx),
        canonicalName: data.canonicalName,
        normalizedName: data.canonicalNorm,
        kind: data.kind,
        categoryId: await categoryIdFor(data.categorySlug, tx),
        summary: data.summary,
        body: data.body,
        figNotation: data.figNotation || null,
        quarterRotations: data.quarterRotations ?? null,
        halfTwists: data.halfTwists ?? null,
        position: data.position ?? null,
        evidenceStatus: data.evidenceStatus,
        tags: [...new Set(data.tags)],
        searchNames: searchNamesFor(data.canonicalName, data.aliases),
        createdBy: actor.id,
      })
      .returning();
    await writeAliases(entry!.id, data.aliases, tx);
    await tx.insert(entryRevisions).values({
      entryId: entry!.id,
      revision: 1,
      snapshot: await snapshot(entry!.id, tx),
      changeSummary: opts.changeSummary ?? "Created",
      authorId: actor.id,
    });
    await audit(actor.id, "entry.create", "entry", entry!.id, { name: data.canonicalName }, tx);
    return entry!;
  };
  try {
    return opts.tx ? await run(opts.tx) : await db.transaction(run);
  } catch (err) {
    rethrowUnique(err);
  }
}

/** Updates an entry with optimistic concurrency: `expectedRevision` must match the stored revision. */
export async function updateEntry(entryId: string, input: EntryInput, expectedRevision: number, changeSummary: string, actor: Actor) {
  assertRole(actor, "reviewer");
  const data = parseEntryInput(input);
  if (!changeSummary.trim()) throw new ValidationError("Describe what changed", { changeSummary: ["Required"] });
  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(entries).where(eq(entries.id, entryId)).for("update");
      if (!current) throw new NotFoundError("Entry not found");
      if (current.revision !== expectedRevision)
        throw new ConflictError("This entry was changed by someone else since you opened it. Reload and re-apply your edit.");
      const dupes = (await findPossibleDuplicates([data.canonicalName, ...data.aliases.map(([, a]) => a)], entryId, tx)).filter((d) => d.match === "exact");
      if (dupes.length) throw new ConflictError(`Name or alias clashes with existing entry "${dupes[0]!.name}"`);
      const nextRevision = current.revision + 1;
      const [updated] = await tx
        .update(entries)
        .set({
          canonicalName: data.canonicalName,
          normalizedName: data.canonicalNorm,
          kind: data.kind,
          categoryId: await categoryIdFor(data.categorySlug, tx),
          summary: data.summary,
          body: data.body,
          figNotation: data.figNotation || null,
          quarterRotations: data.quarterRotations ?? null,
          halfTwists: data.halfTwists ?? null,
          position: data.position ?? null,
          evidenceStatus: data.evidenceStatus,
          tags: [...new Set(data.tags)],
          searchNames: searchNamesFor(data.canonicalName, data.aliases),
          revision: nextRevision,
          updatedAt: new Date(),
          lastReviewedAt: new Date(),
        })
        .where(eq(entries.id, entryId))
        .returning();
      await writeAliases(entryId, data.aliases, tx);
      await tx.insert(entryRevisions).values({ entryId, revision: nextRevision, snapshot: await snapshot(entryId, tx), changeSummary, authorId: actor.id });
      await audit(actor.id, "entry.update", "entry", entryId, { revision: nextRevision, changeSummary }, tx);
      return updated!;
    });
  } catch (err) {
    rethrowUnique(err);
  }
}

/**
 * Publishing rules: AI drafts can never be published directly, and every published
 * entry except community submissions needs at least one sourced claim.
 */
export async function setEntryState(entryId: string, state: "draft" | "published" | "archived", actor: Actor, outerTx?: DbOrTx) {
  assertRole(actor, "reviewer");
  const run = async (tx: DbOrTx) => {
    const [e] = await tx.select().from(entries).where(eq(entries.id, entryId)).for("update");
    if (!e) throw new NotFoundError("Entry not found");
    if (state === "published") {
      if (e.evidenceStatus === "ai_draft")
        throw new ValidationError("AI drafts cannot be published. Review the claims and set an evidence status first.");
      if (e.evidenceStatus !== "community") {
        const [{ n }] = (await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from claims c join claim_sources cs on cs.claim_id = c.id where c.entry_id = ${entryId} and cs.stance = 'supports'`,
        )).rows as [{ n: number }];
        if (n === 0) throw new ValidationError("Add at least one claim backed by a source before publishing.");
      }
    }
    const nextRevision = e.revision + 1;
    await tx.update(entries).set({ state, revision: nextRevision, updatedAt: new Date(), lastReviewedAt: new Date() }).where(eq(entries.id, entryId));
    await tx.insert(entryRevisions).values({ entryId, revision: nextRevision, snapshot: await snapshot(entryId, tx), changeSummary: `State changed to ${state}`, authorId: actor.id });
    await audit(actor.id, `entry.${state}`, "entry", entryId, {}, tx);
  };
  return outerTx ? run(outerTx) : db.transaction(run);
}

export async function setRelation(fromEntryId: string, toEntryId: string, kind: "related" | "variant_of" | "distinct_from" | "component_of", note: string, actor: Actor) {
  assertRole(actor, "reviewer");
  if (fromEntryId === toEntryId) throw new ValidationError("An entry cannot relate to itself");
  await db
    .insert(entryRelations)
    .values({ fromEntryId, toEntryId, kind, note: note.slice(0, 300) })
    .onConflictDoUpdate({ target: [entryRelations.fromEntryId, entryRelations.toEntryId], set: { kind, note: note.slice(0, 300) } });
  await audit(actor.id, "entry.relate", "entry", fromEntryId, { toEntryId, kind });
}

export async function getEntryById(entryId: string) {
  const [e] = await db.select().from(entries).where(eq(entries.id, entryId));
  return e ?? null;
}

export async function getRevision(entryId: string, revision: number, actor: Actor) {
  assertRole(actor, "reviewer");
  const [r] = await db
    .select()
    .from(entryRevisions)
    .where(and(eq(entryRevisions.entryId, entryId), eq(entryRevisions.revision, revision)));
  return r ?? null;
}

export async function kbStats() {
  const res = await db.execute<{ status: EvidenceStatus; n: number }>(
    sql`select evidence_status as status, count(*)::int as n from entries where state = 'published' group by evidence_status`,
  );
  const [{ n: sourcesCount }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from sources`)).rows as [{ n: number }];
  return { byStatus: Object.fromEntries(res.rows.map((r) => [r.status, r.n])) as Partial<Record<EvidenceStatus, number>>, sources: sourcesCount };
}
