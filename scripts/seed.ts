/**
 * Idempotent seed: categories, a non-login curator account, sourced knowledge-base entries.
 * Re-running skips entries whose name already exists.
 */
import { eq } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { categories, entries, profiles, users } from "../src/db/schema";
import { SEED_ACCESSED_AT, SEED_RETRIEVAL, seedCategories, seedEntries, seedRelations, seedSources } from "../src/db/seed-data";
import { normalizeName } from "../src/lib/text";
import type { Actor } from "../src/server/actor";
import { createEntry, setEntryState, setRelation } from "../src/server/kb/entries";
import { addClaim, upsertSource } from "../src/server/kb/sources";

export async function seed({ quiet = false } = {}) {
  const log = (...args: unknown[]) => !quiet && console.log(...args);

  for (const c of seedCategories) {
    await db.insert(categories).values(c).onConflictDoUpdate({ target: categories.slug, set: { name: c.name, description: c.description, sortOrder: c.sortOrder } });
  }

  // System curator: password hash is not a valid scrypt string, so this account can never sign in.
  const curatorEmail = "curator@system.invalid";
  let [curator] = await db.select({ id: users.id }).from(users).where(eq(users.email, curatorEmail));
  if (!curator) {
    [curator] = await db.insert(users).values({ email: curatorEmail, passwordHash: "!disabled", role: "admin" }).returning({ id: users.id });
    await db.insert(profiles).values({ userId: curator!.id, handle: "curator", displayName: "Seed curator", profileVisibility: "private" });
  }
  const actor: Actor = { id: curator!.id, role: "admin", handle: "curator", displayName: "Seed curator" };

  const sourceIds = new Map<string, string>();
  for (const s of seedSources) {
    const row = await upsertSource({
      url: s.url,
      title: s.title,
      publisher: s.publisher,
      reliability: s.reliability,
      retrievalMethod: SEED_RETRIEVAL,
      notes: s.notes ?? "",
    });
    sourceIds.set(s.key, row.id);
  }

  // Validate up front so a bad seed record cannot leave a half-written entry behind.
  for (const e of seedEntries)
    for (const c of e.claims)
      if ((c.status === "supported" || c.status === "limited") && !c.cites.some((ci) => (ci.stance ?? "supports") === "supports"))
        throw new Error(`Seed claim on "${e.name}" is marked ${c.status} but has no supporting citation`);

  const idsByName = new Map<string, string>();
  let created = 0;
  for (const e of seedEntries) {
    const [existing] = await db.select({ id: entries.id }).from(entries).where(eq(entries.normalizedName, normalizeName(e.name)));
    if (existing) {
      idsByName.set(e.name, existing.id);
      continue;
    }
    const entry = await createEntry(
      {
        canonicalName: e.name,
        summary: e.summary,
        body: e.body ?? "",
        kind: e.kind ?? "skill",
        categorySlug: e.category,
        figNotation: e.figNotation ?? null,
        quarterRotations: e.quarterRotations ?? null,
        halfTwists: e.halfTwists ?? null,
        position: e.position ?? null,
        evidenceStatus: e.evidence,
        tags: e.tags ?? [],
        aliases: e.aliases ?? [],
      },
      actor,
      { changeSummary: `Seeded from ${SEED_RETRIEVAL}, accessed ${SEED_ACCESSED_AT.slice(0, 10)}` },
    );
    idsByName.set(e.name, entry.id);
    for (const c of e.claims) {
      await addClaim(
        entry.id,
        {
          statement: c.statement,
          status: c.status,
          citations: c.cites.map((ci) => {
            const sourceId = sourceIds.get(ci.source);
            if (!sourceId) throw new Error(`Unknown seed source ${ci.source}`);
            return { sourceId, excerpt: ci.excerpt, stance: ci.stance ?? "supports" };
          }),
        },
        actor,
      );
    }
    if (e.publish) await setEntryState(entry.id, "published", actor);
    created++;
  }

  for (const r of seedRelations) {
    const from = idsByName.get(r.from);
    const to = idsByName.get(r.to);
    if (!from || !to) throw new Error(`Seed relation references unknown entry: ${r.from} -> ${r.to}`);
    await setRelation(from, to, r.kind, r.note, actor);
  }

  log(`Seed complete: ${created} new entries, ${seedSources.length} sources, ${seedRelations.length} relations.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seed();
  await closeDb();
}
