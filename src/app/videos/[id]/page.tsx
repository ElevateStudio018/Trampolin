import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Card, Container, Notice, SectionTitle, StatusBadge, formatBytes, formatDate } from "@/components/ui";
import { getActor } from "@/server/auth/current";
import { searchEntries } from "@/server/kb/entries";
import { analyzerCatalog, getVideo } from "@/server/video/service";
import { BROWSER_PLAYABLE_CODECS } from "@/server/video/analyzers";
import { ReportButton } from "@/app/community/report";
import { AnalyzeButton, DeleteVideoButton, EditVideoForm } from "./edit-form";

export const metadata: Metadata = { title: "Video" };

function Result({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="font-mono text-xs">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  const data = await getVideo(actor, id);
  if (!data) notFound();
  const v = data.video;
  const catalog = analyzerCatalog();
  const processing = v.status === "processing" || v.status === "uploaded" || data.analyses.some((a) => a.status === "queued" || a.status === "running");
  const entries = data.isOwner ? (await searchEntries({ sort: "name", pageSize: 100 }, actor)).items : [];

  return (
    <Container className="py-8">
      {processing && <AutoRefresh />}
      <Link href="/videos" className="text-sm text-muted hover:text-ink">
        ← Videos
      </Link>
      <div className="mt-3 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-black">
            {v.status === "ready" ? (
              <video controls preload="metadata" className="aspect-video w-full" src={`/api/videos/${v.id}/stream`} poster={v.posterKey ? `/api/videos/${v.id}/poster` : undefined}>
                Your browser can&apos;t play this video.
              </video>
            ) : (
              <div className="grid aspect-video place-items-center text-sm text-white/80">
                {v.status === "failed" ? "This file could not be processed." : "Processing…"}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{v.title}</h1>
              <p className="text-sm text-muted">
                <Link href={`/u/${data.ownerHandle}`} className="hover:text-ink">
                  @{data.ownerHandle}
                </Link>{" "}
                · {formatDate(v.createdAt)}
                {data.entryName && (
                  <>
                    {" · "}
                    <Link href={`/tricks/${data.entrySlug}`} className="text-accent hover:underline">
                      {data.entryName}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={v.status} />
              <Badge>{v.visibility === "private" ? "Only owner" : v.visibility}</Badge>
            </div>
          </div>
          {v.hiddenByModeration && <Notice tone="danger" title="Hidden by moderators">Only you and administrators can see this video.</Notice>}
          {v.status === "failed" && <Notice tone="danger" title="Processing failed">{v.statusMessage}</Notice>}
          {v.status === "ready" && v.codec && !BROWSER_PLAYABLE_CODECS.has(v.codec) && (
            <Notice tone="warn" title="May not play in every browser">
              This video uses the {v.codec.toUpperCase()} codec, which some browsers can&apos;t play. Re-export it as H.264 (MP4) if it doesn&apos;t play for you.
            </Notice>
          )}
          {v.description && <p className="whitespace-pre-line text-ink-2">{v.description}</p>}
          {actor && !data.isOwner && <ReportButton targetType="video" targetId={v.id} />}

          {data.isOwner && (
            <section aria-labelledby="analysis" className="mt-4">
              <SectionTitle id="analysis">Analysis</SectionTitle>
              <div className="flex flex-col gap-3">
                {catalog.map((a) => (
                  <Card key={a.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{a.label}</p>
                        <p className="text-xs text-muted">
                          {a.availability.available ? `Available · ${a.version}` : a.availability.reason}
                        </p>
                      </div>
                      {v.status === "ready" && <AnalyzeButton id={v.id} analyzer={a.id} label={a.availability.available ? "Run" : "Check availability"} disabled={!a.availability.available} />}
                    </div>
                    {data.analyses
                      .filter((r) => r.analyzer === a.id)
                      .slice(0, 1)
                      .map((r) => (
                        <div key={r.id} className="mt-3 border-t border-line pt-3">
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                            <StatusBadge status={r.status} /> {formatDate(r.createdAt)}
                          </div>
                          {r.message && <p className="text-sm text-ink-2">{r.message}</p>}
                          {r.status === "succeeded" && r.result != null && (
                            <>
                              <Result data={(r.result as { data: Record<string, unknown> }).data} />
                              <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                                {((r.result as { limitations: string[] }).limitations ?? []).map((l) => (
                                  <li key={l}>{l}</li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      ))}
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">File</h2>
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-muted">Format</dt>
              <dd>{v.mimeType}</dd>
              <dt className="text-muted">Size</dt>
              <dd>{formatBytes(v.sizeBytes)}</dd>
              <dt className="text-muted">Resolution</dt>
              <dd>{v.width && v.height ? `${v.width}×${v.height}` : "—"}</dd>
              <dt className="text-muted">Duration</dt>
              <dd>{v.durationMs ? `${(v.durationMs / 1000).toFixed(1)} s` : "—"}</dd>
              <dt className="text-muted">Codec</dt>
              <dd>{v.codec ?? "—"}</dd>
            </dl>
          </Card>
          {data.isOwner && (
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Edit</h2>
              <EditVideoForm
                video={{ id: v.id, title: v.title, description: v.description, visibility: v.visibility, entryId: v.entryId, trainingConsent: v.trainingConsent }}
                entries={entries.map((e) => ({ id: e.id, name: e.canonicalName }))}
              />
              <div className="mt-4 border-t border-line pt-4">
                <DeleteVideoButton id={v.id} />
              </div>
            </Card>
          )}
        </aside>
      </div>
    </Container>
  );
}
