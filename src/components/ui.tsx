import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius-control)] transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-soft",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-[15px]" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props} />;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-6 pt-8 sm:flex-row sm:items-end sm:justify-between sm:pt-10">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-pad">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-base font-semibold text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children: ReactNode }) {
  const tones = {
    info: "border-info/30 bg-info-soft text-info",
    warn: "border-warn/30 bg-warn-soft text-warn",
    danger: "border-danger/30 bg-danger-soft text-danger",
    ok: "border-ok/30 bg-ok-soft text-ok",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-[var(--radius-control)] border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={cn(title && "mt-0.5", "text-ink-2")}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

type Tone = "neutral" | "accent" | "ok" | "warn" | "info" | "violet" | "danger" | "pad";
const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
  danger: "bg-danger-soft text-danger",
  pad: "bg-pad-soft text-pad",
};

export function Badge({ tone = "neutral", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export const EVIDENCE_META: Record<string, { label: string; tone: Tone; help: string }> = {
  verified: { label: "Verified", tone: "ok", help: "Reviewed against an authoritative primary source." },
  limited_evidence: { label: "Limited evidence", tone: "warn", help: "Supported by secondary or club sources only, or by excerpts rather than full documents." },
  community: { label: "Community", tone: "info", help: "Submitted by a member and not yet source-checked." },
  ai_draft: { label: "AI draft", tone: "violet", help: "Machine-generated and not reviewed. Do not rely on it." },
  conflicting: { label: "Conflicting sources", tone: "danger", help: "The cited sources disagree. Read the claims below." },
};

export function EvidenceBadge({ status }: { status: string }) {
  const meta = EVIDENCE_META[status] ?? { label: status, tone: "neutral" as Tone, help: "" };
  return (
    <Badge tone={meta.tone} title={meta.help}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}

export const REVIEW_META: Record<string, { label: string; tone: Tone }> = {
  pending_review: { label: "Pending review", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "neutral" },
  needs_more_sources: { label: "Needs more sources", tone: "info" },
  conflicting_information: { label: "Conflicting information", tone: "danger" },
};

export function ReviewBadge({ status }: { status: string }) {
  const meta = REVIEW_META[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export const JOB_META: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "accent" },
  succeeded: { label: "Succeeded", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  blocked: { label: "Blocked", tone: "warn" },
  unavailable: { label: "Unavailable", tone: "warn" },
  uploaded: { label: "Uploaded", tone: "neutral" },
  processing: { label: "Processing", tone: "accent" },
  ready: { label: "Ready", tone: "ok" },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = JOB_META[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export const COLLECTION_META: Record<string, { label: string; tone: Tone }> = {
  saved: { label: "Saved", tone: "neutral" },
  working_on: { label: "Working on", tone: "accent" },
  landed: { label: "Landed", tone: "ok" },
};

// ---------------------------------------------------------------------------
// Rotation glyph: quarter-rotation arc + twist count, a compact visual signature for skills.
// ---------------------------------------------------------------------------

export function RotationGlyph({ quarters, halfTwists, size = 40 }: { quarters: number | null; halfTwists: number | null; size?: number }) {
  if (quarters === null && halfTwists === null) return null;
  const q = quarters ?? 0;
  const r = 15;
  const c = 20;
  const turns = Math.min(q, 12) / 4;
  const rings = Math.max(1, Math.ceil(turns));
  const label = `${q} quarter ${q === 1 ? "rotation" : "rotations"}${halfTwists !== null ? `, ${halfTwists} half ${halfTwists === 1 ? "twist" : "twists"}` : ""}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={label} className="shrink-0">
      <title>{label}</title>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
      {Array.from({ length: rings }).map((_, i) => {
        const portion = Math.min(1, turns - i);
        if (portion <= 0) return null;
        const rr = r - i * 4;
        const circ = 2 * Math.PI * rr;
        return (
          <circle
            key={i}
            cx={c}
            cy={c}
            r={rr}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${circ * portion} ${circ}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        );
      })}
      {halfTwists !== null && halfTwists > 0 && (
        <text x={c} y={c + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--pad)">
          {halfTwists % 2 === 0 ? halfTwists / 2 : `${(halfTwists - 1) / 2 || ""}½`}
        </text>
      )}
    </svg>
  );
}

export function fractionLabel(n: number, denom: 2 | 4) {
  const whole = Math.floor(n / denom);
  const rem = n % denom;
  const frac = denom === 4 ? ["", "¼", "½", "¾"][rem] : rem ? "½" : "";
  return `${whole || (frac ? "" : "0")}${frac}`;
}

export function rotationLabel(quarters: number | null, halfTwists: number | null) {
  const parts: string[] = [];
  if (quarters !== null) parts.push(quarters === 0 ? "No somersault" : `${fractionLabel(quarters, 4)} somersault${quarters > 4 ? "s" : ""}`);
  if (halfTwists !== null) parts.push(halfTwists === 0 ? "no twist" : `${fractionLabel(halfTwists, 2)} twist${halfTwists > 2 ? "s" : ""}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (p: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <LinkButton variant="secondary" size="sm" href={hrefFor(page - 1)} rel="prev">
          ← Previous
        </LinkButton>
      ) : (
        <span />
      )}
      <span className="text-muted">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <LinkButton variant="secondary" size="sm" href={hrefFor(page + 1)} rel="next">
          Next →
        </LinkButton>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
