import Link from "next/link";
import type { EntryCard as EntryCardData } from "@/server/kb/entries";
import { Badge, EvidenceBadge, RotationGlyph, rotationLabel } from "./ui";

export function EntryCard({ entry, extra }: { entry: EntryCardData; extra?: React.ReactNode }) {
  const rot = rotationLabel(entry.quarterRotations, entry.halfTwists);
  return (
    <article className="group relative flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <RotationGlyph quarters={entry.quarterRotations} halfTwists={entry.halfTwists} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug text-ink">
            <Link href={`/tricks/${entry.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {entry.canonicalName}
            </Link>
          </h3>
          {entry.aliases.length > 0 && <p className="truncate text-xs text-muted">aka {entry.aliases.slice(0, 3).join(", ")}</p>}
        </div>
        {entry.state !== "published" && <Badge tone="warn">{entry.state}</Badge>}
      </div>
      <p className="line-clamp-3 text-sm leading-relaxed text-ink-2">{entry.summary}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <EvidenceBadge status={entry.evidenceStatus} />
        {entry.categoryName && <Badge>{entry.categoryName}</Badge>}
        {rot && <span className="text-xs text-muted">{rot}</span>}
      </div>
      {extra && <div className="relative z-10">{extra}</div>}
    </article>
  );
}
