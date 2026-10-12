import type { Metadata } from "next";
import { Container, EVIDENCE_META, EvidenceBadge, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "About the data" };

export default function AboutPage() {
  return (
    <Container className="max-w-3xl">
      <PageHeader eyebrow="Transparency" title="About the data" description="How entries are sourced, labelled and reviewed — and what this site is not." />
      <div className="prose-tb mt-6 flex flex-col gap-6 text-[15px]">
        <section>
          <h2 className="mb-2 font-semibold text-ink">Evidence labels</h2>
          <ul className="flex flex-col gap-3">
            {Object.keys(EVIDENCE_META).map((k) => (
              <li key={k} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <span className="w-44 shrink-0">
                  <EvidenceBadge status={k} />
                </span>
                <span>{EVIDENCE_META[k]!.help}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-ink">Where the starting content came from</h2>
          <p>
            The initial entries were compiled from search-engine excerpts of club glossaries, Wikipedia, broadcaster explainers and the FIG Code of Points.
            Full pages could not be retrieved at the time, so every source is marked as such and no entry is labelled “verified”. Excerpts that are the
            search tool&apos;s paraphrase rather than a direct quote are prefixed “Search summary”.
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-ink">How new information gets in</h2>
          <p>
            Members can suggest additions, and a research agent can gather candidate sources. Both produce drafts with explicit citations. Drafts never
            reach the Trick Book automatically: a reviewer approves, rejects or sends them back for more sources, and only claims backed by a source are imported.
          </p>
          <p>
            Agreement between several sources is not proof — many glossaries copy each other. Where sources disagree, the entry is labelled
            “conflicting” and each version is shown.
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-ink">What this site is not</h2>
          <p>
            It is not coaching. Nothing here tells you how to perform a skill or whether you are ready to try one. Learn with a qualified coach,
            proper matting and spotting. Video analysis is limited to technical file information; automated skill recognition is in development and not available.
          </p>
        </section>
      </div>
    </Container>
  );
}
