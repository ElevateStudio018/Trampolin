import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader, SectionTitle, fractionLabel } from "@/components/ui";
import { getActor } from "@/server/auth/current";
import { listCategories, listTags } from "@/server/kb/entries";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const metadata: Metadata = { title: "Explore" };

export default async function ExplorePage() {
  const actor = await getActor();
  const [categories, tags, rotations] = await Promise.all([
    listCategories(actor),
    listTags(),
    db.execute<{ q: number; n: number }>(sql`select quarter_rotations as q, count(*)::int as n from entries where state = 'published' and quarter_rotations is not null group by 1 order by 1`),
  ]);
  return (
    <Container>
      <PageHeader eyebrow="Trick Book" title="Explore" description="Browse by category, by amount of somersault rotation, or by tag." />
      <section className="mt-8" aria-labelledby="cats">
        <SectionTitle id="cats">Categories</SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/tricks?category=${c.slug}`} className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-line-strong">
                <span className="flex justify-between font-semibold">
                  {c.name} <span className="font-normal text-muted">{c.count}</span>
                </span>
                <span className="mt-1 text-sm text-ink-2">{c.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10" aria-labelledby="rot">
        <SectionTitle id="rot">By somersault rotation</SectionTitle>
        <ul className="flex flex-wrap gap-2">
          {rotations.rows.map((r) => (
            <li key={r.q}>
              <Link href={`/tricks?rotation=${r.q}&sort=rotation`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-line-strong">
                <span className="font-medium">{r.q === 0 ? "No somersault" : `${fractionLabel(r.q, 4)} somersault${r.q > 4 ? "s" : ""}`}</span>
                <span className="text-muted">{r.n}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10" aria-labelledby="tags">
        <SectionTitle id="tags">Tags</SectionTitle>
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t.tag}>
              <Link href={`/tricks?tag=${encodeURIComponent(t.tag)}`} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm text-ink-2 hover:bg-line">
                {t.tag} <span className="text-muted">{t.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
