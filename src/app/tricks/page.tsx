import type { Metadata } from "next";
import Link from "next/link";
import { Container, EmptyState, EVIDENCE_META, LinkButton, PageHeader, Pagination } from "@/components/ui";
import { EntryCard } from "@/components/entry-card";
import { getActor } from "@/server/auth/current";
import { hasRole } from "@/server/actor";
import { EVIDENCE_STATUSES, listCategories, searchEntries, searchSchema } from "@/server/kb/entries";

export const metadata: Metadata = { title: "Trick Book" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const control = "h-10 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

export default async function TricksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await getActor();
  const isReviewer = hasRole(actor, "reviewer");
  const raw = {
    q: one(sp.q) ?? "",
    category: one(sp.category),
    evidence: one(sp.evidence),
    tag: one(sp.tag),
    rotation: one(sp.rotation),
    sort: one(sp.sort),
    page: one(sp.page),
    includeDrafts: one(sp.drafts) === "1",
  };
  const parsed = searchSchema.safeParse(raw);
  const params = parsed.success ? parsed.data : searchSchema.parse({ q: raw.q });
  const [results, categories] = await Promise.all([searchEntries(params, actor), listCategories(actor)]);

  const hrefFor = (overrides: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    const merged = { q: params.q, category: params.category, evidence: params.evidence, tag: params.tag, rotation: params.rotation, sort: params.sort === "relevance" ? undefined : params.sort, drafts: raw.includeDrafts ? "1" : undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") qs.set(k, String(v));
    const s = qs.toString();
    return s ? `/tricks?${s}` : "/tricks";
  };
  const filtersActive = Boolean(params.q || params.category || params.evidence || params.tag || params.rotation !== undefined);

  return (
    <Container>
      <PageHeader
        eyebrow="Knowledge base"
        title="Trick Book"
        description="Every entry shows where its information comes from and how much the sources can be trusted."
        actions={isReviewer ? <LinkButton href="/studio/entries/new" variant="secondary">New entry</LinkButton> : undefined}
      />

      <form role="search" action="/tricks" className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label htmlFor="q" className="sr-only">
          Search skills and terms
        </label>
        <input id="q" name="q" type="search" defaultValue={params.q} placeholder="Search names, aliases or descriptions — e.g. rudy, ball out, double" className={`${control} h-11 text-[15px]`} />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <label className="sr-only" htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={params.category ?? ""} className={control}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="evidence">Evidence</label>
          <select id="evidence" name="evidence" defaultValue={params.evidence ?? ""} className={control}>
            <option value="">Any evidence</option>
            {EVIDENCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EVIDENCE_META[s]!.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="sort">Sort</label>
          <select id="sort" name="sort" defaultValue={params.sort} className={control}>
            <option value="relevance">Best match</option>
            <option value="name">Name A–Z</option>
            <option value="rotation">Rotation</option>
            <option value="updated">Recently updated</option>
          </select>
          {params.tag && <input type="hidden" name="tag" value={params.tag} />}
          {params.rotation !== undefined && <input type="hidden" name="rotation" value={params.rotation} />}
          {isReviewer && (
            <label className="flex items-center gap-2 px-1 text-sm text-ink-2">
              <input type="checkbox" name="drafts" value="1" defaultChecked={raw.includeDrafts} /> Drafts
            </label>
          )}
          <button className="h-10 rounded-[var(--radius-control)] bg-ink px-4 text-sm font-medium text-bg hover:opacity-90">Search</button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <p className="text-muted">
          {results.total} {results.total === 1 ? "result" : "results"}
          {params.q && (
            <>
              {" "}for <span className="font-medium text-ink">“{params.q}”</span>
            </>
          )}
        </p>
        {params.tag && (
          <Link href={hrefFor({ tag: undefined, page: undefined })} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2 hover:bg-line">
            tag: {params.tag} ✕
          </Link>
        )}
        {params.rotation !== undefined && (
          <Link href={hrefFor({ rotation: undefined, page: undefined })} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2 hover:bg-line">
            {params.rotation} quarter rotations ✕
          </Link>
        )}
        {filtersActive && (
          <Link href="/tricks" className="text-accent hover:underline">
            Clear all
          </Link>
        )}
      </div>

      {results.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={params.q ? `Nothing matches “${params.q}”` : "No entries match these filters"}
            action={<LinkButton href="/tricks" variant="secondary">Reset search</LinkButton>}
          >
            Try a different spelling or a broader term. If a skill is missing, {actor ? <Link className="text-accent hover:underline" href={`/tricks/suggest?name=${encodeURIComponent(params.q)}`}>suggest it for review</Link> : "sign in to suggest it for review"}.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.items.map((e) => (
            <li key={e.id}>
              <EntryCard entry={e} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={results.page} pageCount={results.pageCount} hrefFor={(p) => hrefFor({ page: p })} />
    </Container>
  );
}
