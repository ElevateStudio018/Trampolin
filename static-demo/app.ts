/**
 * Static, read-only Trampolin demo (GitHub Pages). Data comes from data.json, exported
 * from the real database by scripts/build-static-demo.ts. Text normalisation, trigram
 * similarity and the assistant's safety classifier are the app's own modules.
 */
import { normalizeName, trigramSimilarity } from "@/lib/text";
import { classifyQuestion, SAFETY_NOTICE } from "@/server/assistant/safety";
import { SKILL_SPECS } from "@/animation/catalog";

// The 3D animator (three.js) is loaded only when a page needs it.
type AnimatorMod = typeof import("@/animation/ui");
let animator: { destroy(): void } | null = null;
const loadAnimator = (): Promise<AnimatorMod> => import("@/animation/ui");
function mountAnimations() {
  const entryHost = document.getElementById("entry-anim");
  const studioHost = document.getElementById("anim-studio");
  if (!entryHost && !studioHost) return;
  loadAnimator()
    .then((m) => {
      if (entryHost && document.body.contains(entryHost)) animator = m.mountEntryAnimation(entryHost, entryHost.dataset.slug!);
      if (studioHost && document.body.contains(studioHost)) animator = m.mountStudio(studioHost, { linkFor: (slug) => `#/tricks/${slug}` });
    })
    .catch(() => {
      const host = entryHost ?? studioHost;
      if (host) host.innerHTML = `<p class="muted small">The 3D animation couldn't load. Reload the page to try again.</p>`;
    });
}

type Citation = { sourceId: string; stance: string; excerpt: string };
type Claim = { statement: string; status: string; citations: Citation[] };
type Entry = {
  slug: string;
  name: string;
  kind: string;
  summary: string;
  body: string;
  figNotation: string | null;
  quarterRotations: number | null;
  halfTwists: number | null;
  position: string | null;
  evidenceStatus: string;
  tags: string[];
  category: string | null;
  categoryName: string | null;
  aliases: string[];
  lastReviewedAt: string | null;
  revision: number;
  revisions: { revision: number; summary: string; at: string }[];
  claims: Claim[];
  relations: { slug: string; name: string; kind: string; note: string }[];
  related: { slug: string; name: string; reason: string }[];
};
type Source = { title: string; url: string; publisher: string; reliability: string; retrievalMethod: string; accessedAt: string };
type Data = {
  generatedAt: string;
  entries: Entry[];
  sources: Record<string, Source>;
  categories: { slug: string; name: string; description: string; count: number }[];
  stats: { byStatus: Record<string, number>; sources: number };
};

let DATA: Data;
const main = document.getElementById("main")!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const EVIDENCE: Record<string, { label: string; tone: string; help: string }> = {
  verified: { label: "Verified", tone: "t-ok", help: "Reviewed against an authoritative primary source." },
  limited_evidence: { label: "Limited evidence", tone: "t-warn", help: "Supported by secondary or club sources only, or by excerpts rather than full documents." },
  community: { label: "Community", tone: "t-info", help: "Submitted by a member and not yet source-checked." },
  ai_draft: { label: "AI draft", tone: "t-violet", help: "Machine-generated and not reviewed. Do not rely on it." },
  conflicting: { label: "Conflicting sources", tone: "t-danger", help: "The cited sources disagree. Read the claims below." },
};
const CLAIM_STATUS: Record<string, [string, string]> = {
  supported: ["Supported", "t-ok"],
  limited: ["Limited support", "t-warn"],
  disputed: ["Disputed", "t-danger"],
  unsupported: ["Unsupported", ""],
};
const RELATION: Record<string, string> = { related: "Related", variant_of: "Variant", distinct_from: "Not to be confused with", component_of: "Part of" };
const COLLECTION: Record<string, string> = { saved: "Saved", working_on: "Working on", landed: "Landed" };

const evidenceBadge = (s: string) => {
  const m = EVIDENCE[s] ?? { label: s, tone: "", help: "" };
  return `<span class="badge ${m.tone}" title="${esc(m.help)}"><span class="dot" aria-hidden="true"></span>${esc(m.label)}</span>`;
};

function fraction(n: number, denom: 2 | 4) {
  const whole = Math.floor(n / denom);
  const rem = n % denom;
  const frac = denom === 4 ? ["", "¼", "½", "¾"][rem]! : rem ? "½" : "";
  return `${whole || (frac ? "" : "0")}${frac}`;
}
function rotationLabel(q: number | null, t: number | null) {
  const parts: string[] = [];
  if (q !== null) parts.push(q === 0 ? "No somersault" : `${fraction(q, 4)} somersault${q > 4 ? "s" : ""}`);
  if (t !== null) parts.push(t === 0 ? "no twist" : `${fraction(t, 2)} twist${t > 2 ? "s" : ""}`);
  return parts.join(" · ");
}
function glyph(q: number | null, t: number | null, size = 40) {
  if (q === null && t === null) return "";
  const turns = Math.min(q ?? 0, 12) / 4;
  const rings = Math.max(1, Math.ceil(turns));
  let arcs = "";
  for (let i = 0; i < rings; i++) {
    const portion = Math.min(1, turns - i);
    if (portion <= 0) continue;
    const r = 15 - i * 4;
    const circ = 2 * Math.PI * r;
    arcs += `<circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="${circ * portion} ${circ}" transform="rotate(-90 20 20)"/>`;
  }
  const label = rotationLabel(q, t);
  const twist = t ? `<text x="20" y="24" text-anchor="middle" font-size="11" font-weight="700" fill="var(--pad)">${fraction(t, 2)}</text>` : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" role="img" aria-label="${esc(label)}" style="flex-shrink:0"><title>${esc(label)}</title><circle cx="20" cy="20" r="15" fill="none" stroke="var(--line)" stroke-width="3"/>${arcs}${twist}</svg>`;
}

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: the demo still works, it just won't remember */
    }
  },
};
const collection = () => store.get<Record<string, string>>("tb-collection", {});

function bySlug(slug: string) {
  return DATA.entries.find((e) => e.slug === slug);
}

// ---------------------------------------------------------------------------
// Search (same idea as the server: names + aliases with trigram fuzziness, then text)
// ---------------------------------------------------------------------------

function score(e: Entry, q: string, words: string[]) {
  const names = [e.name, ...e.aliases].map(normalizeName);
  let s = 0;
  if (names[0] === q) s += 10;
  else if (names.includes(q)) s += 9;
  if (names.some((n) => n.startsWith(q))) s += 4;
  if (names.some((n) => n.includes(q))) s += 2;
  const sim = Math.max(...names.map((n) => trigramSimilarity(n, q)));
  if (sim > 0.3) s += sim * 4;
  const text = ` ${normalizeName(`${e.summary} ${e.body} ${e.claims.map((c) => c.statement).join(" ")}`)} `;
  const hits = words.filter((w) => w.length > 2 && text.includes(` ${w}`)).length;
  if (words.length) s += (hits / words.length) * 1.5;
  return s;
}

function search(params: URLSearchParams) {
  const q = normalizeName(params.get("q") ?? "");
  const words = q.split(" ").filter(Boolean);
  let items = DATA.entries.slice();
  const cat = params.get("category");
  const ev = params.get("evidence");
  const tag = params.get("tag");
  const rot = params.get("rotation");
  if (cat) items = items.filter((e) => e.category === cat);
  if (ev) items = items.filter((e) => e.evidenceStatus === ev);
  if (tag) items = items.filter((e) => e.tags.includes(tag));
  if (rot) items = items.filter((e) => e.quarterRotations === Number(rot));
  const sort = params.get("sort") ?? "relevance";
  if (q) {
    const scored = items.map((e) => ({ e, s: score(e, q, words) })).filter((x) => x.s >= 1);
    scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
    items = scored.map((x) => x.e);
  }
  if (sort === "name" || (!q && sort === "relevance")) items.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "rotation") items.sort((a, b) => (a.quarterRotations ?? 99) - (b.quarterRotations ?? 99) || (a.halfTwists ?? 99) - (b.halfTwists ?? 99));
  return items;
}

function entryCard(e: Entry) {
  const rot = rotationLabel(e.quarterRotations, e.halfTwists);
  const saved = collection()[e.slug];
  return `<article class="card entry-card">
    <div class="row">${glyph(e.quarterRotations, e.halfTwists)}
      <div class="min0"><h3><a href="#/tricks/${esc(e.slug)}">${esc(e.name)}</a></h3>
      ${e.aliases.length ? `<p class="muted xs" style="margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">aka ${esc(e.aliases.slice(0, 3).join(", "))}</p>` : ""}</div>
      ${saved ? `<span class="badge t-accent">${esc(COLLECTION[saved])}</span>` : ""}
    </div>
    <p class="summary">${esc(e.summary)}</p>
    <div class="wrap push">${evidenceBadge(e.evidenceStatus)}${e.categoryName ? `<span class="badge">${esc(e.categoryName)}</span>` : ""}${rot ? `<span class="muted xs">${esc(rot)}</span>` : ""}</div>
  </article>`;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function header(eyebrow: string, title: string, lede = "", actions = "") {
  return `<header class="page-header"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div>${actions}</header>`;
}

function viewHome() {
  const published = Object.values(DATA.stats.byStatus).reduce((a, b) => a + b, 0);
  const col = collection();
  const working = Object.entries(col).filter(([, s]) => s === "working_on").map(([slug]) => bySlug(slug)).filter(Boolean) as Entry[];
  return `<section class="hero"><div class="container">
      <p class="eyebrow">Trampoline trick book</p>
      <h1>Every skill, every name it goes by, and exactly where the information comes from.</h1>
      <form id="home-search" role="search"><label for="home-q" class="skip">Search the Trick Book</label>
        <input id="home-q" type="search" placeholder="Search a skill — barani, rudy, ball out…" /><button class="btn primary">Search</button></form>
      <dl class="stats">
        <div><dt>Published entries</dt><dd>${published}</dd></div>
        <div><dt>Cited sources</dt><dd>${DATA.stats.sources}</dd></div>
        <div><dt>Verified against a primary source</dt><dd>${DATA.stats.byStatus.verified ?? 0}</dd></div>
        <div><dt>With conflicting sources</dt><dd>${DATA.stats.byStatus.conflicting ?? 0}</dd></div>
      </dl></div></section>
    <div class="container two-col"><div class="stack">
      ${working.length ? `<section><h2>Working on</h2><ul class="grid cols">${working.map((e) => `<li><a class="tile" href="#/tricks/${esc(e.slug)}">${esc(e.name)}</a></li>`).join("")}</ul></section>` : ""}
      <section><h2>Browse by category</h2><ul class="grid cols">${DATA.categories
        .map((c) => `<li><a class="card pad tile" style="height:100%" href="#/tricks?category=${esc(c.slug)}"><b>${esc(c.name)}</b> <span class="muted small">${c.count}</span><br><span class="muted small">${esc(c.description)}</span></a></li>`)
        .join("")}</ul></section>
      <section class="card pad"><h2>How to read an entry</h2><p class="muted small" style="margin-top:0">Each entry carries an evidence label, and every statement links to the excerpt that supports it.</p>
        <div class="wrap">${Object.keys(EVIDENCE).map(evidenceBadge).join("")}</div><p style="margin-bottom:0"><a href="#/about">About the data →</a></p></section>
    </div><aside class="stack">
      <section class="card pad"><h2>3D animations</h2><p class="muted small">See each skill in 3D, phase by phase, including twisting doubles and combinations.</p><a class="btn" href="#/animate">Open animations</a></section>
      <section class="card pad"><h2>Ask the assistant</h2><p class="muted small">Answers come only from Trick Book records, with citations. It says so when the records don't cover something.</p><a class="btn" href="#/assistant">Open assistant</a></section>
      <section class="card pad"><h2>Full version</h2><p class="muted small" style="margin:0">Accounts, private notes, video uploads, the community and the research agent with its review queue run in the server version. See the <a href="https://github.com/ElevateStudio018/Trampolin#readme">README</a>.</p></section>
    </aside></div>`;
}

function viewTricks(params: URLSearchParams) {
  const items = search(params);
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const shown = items.slice((page - 1) * pageSize, page * pageSize);
  const q = params.get("q") ?? "";
  const href = (over: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(over)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return `#/tricks${s ? `?${s}` : ""}`;
  };
  const opt = (v: string, label: string, cur: string | null) => `<option value="${esc(v)}"${cur === v ? " selected" : ""}>${esc(label)}</option>`;
  return `<div class="container">${header("Knowledge base", "Trick Book", "Every entry shows where its information comes from and how much the sources can be trusted.")}
    <form id="tricks-search" class="search" role="search">
      <label for="q" class="skip">Search skills and terms</label>
      <input id="q" name="q" type="search" value="${esc(q)}" placeholder="Search names, aliases or descriptions — e.g. rudy, ball out, double" />
      <label for="category" class="skip">Category</label><select id="category" name="category">${opt("", "All categories", params.get("category") ?? "")}${DATA.categories.map((c) => opt(c.slug, `${c.name} (${c.count})`, params.get("category"))).join("")}</select>
      <label for="evidence" class="skip">Evidence</label><select id="evidence" name="evidence">${opt("", "Any evidence", params.get("evidence") ?? "")}${Object.entries(EVIDENCE).map(([k, m]) => opt(k, m.label, params.get("evidence"))).join("")}</select>
      <label for="sort" class="skip">Sort</label><select id="sort" name="sort">${opt("relevance", "Best match", params.get("sort") ?? "relevance")}${opt("name", "Name A–Z", params.get("sort"))}${opt("rotation", "Rotation", params.get("sort"))}</select>
    </form>
    <p class="muted small" aria-live="polite">${items.length} ${items.length === 1 ? "result" : "results"}${q ? ` for <b style="color:var(--ink)">“${esc(q)}”</b>` : ""}
      ${params.get("tag") ? ` · tag ${esc(params.get("tag"))} <a href="${href({ tag: null, page: null })}">✕</a>` : ""}
      ${params.get("rotation") ? ` · ${esc(params.get("rotation"))} quarter rotations <a href="${href({ rotation: null, page: null })}">✕</a>` : ""}
      ${params.toString() ? ` · <a href="#/tricks">Clear all</a>` : ""}</p>
    ${
      shown.length
        ? `<ul class="grid cols">${shown.map((e) => `<li>${entryCard(e)}</li>`).join("")}</ul>`
        : `<div class="empty"><p><b>${q ? `Nothing matches “${esc(q)}”` : "No entries match these filters"}</b></p><p class="muted small">Try a different spelling or a broader term.</p><p><a class="btn" href="#/tricks">Reset search</a></p></div>`
    }
    ${pageCount > 1 ? `<nav class="pager" aria-label="Pagination">${page > 1 ? `<a class="btn" href="${href({ page: String(page - 1) })}">← Previous</a>` : "<span></span>"}<span class="muted">Page ${page} of ${pageCount}</span>${page < pageCount ? `<a class="btn" href="${href({ page: String(page + 1) })}">Next →</a>` : "<span></span>"}</nav>` : ""}
  </div>`;
}

function viewEntry(slug: string) {
  const e = bySlug(slug);
  if (!e) {
    const n = normalizeName(slug.replace(/-/g, " "));
    const alias = DATA.entries.find((x) => x.aliases.some((a) => normalizeName(a) === n));
    if (alias) {
      location.replace(`#/tricks/${alias.slug}`);
      return "";
    }
    return `<div class="container" style="padding-top:48px"><div class="empty"><p><b>Entry not found</b></p><p><a class="btn" href="#/tricks">Browse the Trick Book</a></p></div></div>`;
  }
  const status = collection()[e.slug] ?? null;
  const sourceIds: string[] = [];
  for (const c of e.claims) for (const ci of c.citations) if (!sourceIds.includes(ci.sourceId)) sourceIds.push(ci.sourceId);
  const idx = (id: string) => sourceIds.indexOf(id) + 1;
  const distinct = e.relations.filter((r) => r.kind === "distinct_from");
  const linked = e.relations.filter((r) => r.kind !== "distinct_from");
  const discover = e.related.filter((r) => !e.relations.some((x) => x.slug === r.slug));
  const rot = rotationLabel(e.quarterRotations, e.halfTwists);
  return `<div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/tricks">Trick Book</a>${e.categoryName ? ` / <a href="#/tricks?category=${esc(e.category)}">${esc(e.categoryName)}</a>` : ""}</nav>
    <header class="entry-head"><div class="row">${glyph(e.quarterRotations, e.halfTwists, 56)}<div class="min0">
        <h1>${esc(e.name)}</h1>
        ${e.aliases.length ? `<p class="muted small" style="margin:4px 0 0">Also called: <span style="color:var(--ink-2)">${esc(e.aliases.join(", "))}</span></p>` : ""}
        <div class="wrap" style="margin-top:12px">${evidenceBadge(e.evidenceStatus)}${e.figNotation ? `<span class="badge t-accent" title="FIG numeric notation" style="font-family:var(--mono)">${esc(e.figNotation)}</span>` : ""}${rot ? `<span class="badge">${esc(rot)}</span>` : ""}${e.position && e.position !== "none" ? `<span class="badge">${esc(e.position === "any" ? "any position" : e.position)}</span>` : ""}</div>
      </div></div>
      <div class="wrap" role="group" aria-label="Collection status (saved in this browser)" style="align-self:flex-start">
        ${(["saved", "working_on", "landed"] as const).map((s) => `<button class="btn" data-collect="${s}" data-slug="${esc(e.slug)}" aria-pressed="${status === s}">${status === s ? "✓ " : ""}${COLLECTION[s]}</button>`).join("")}
        ${status ? `<button class="btn ghost" data-collect="remove" data-slug="${esc(e.slug)}">Remove</button>` : ""}
      </div>
    </header>
    <div class="two-col"><div class="stack">
      <section><p class="big-summary">${esc(e.summary)}</p>${e.body ? `<p style="color:var(--ink-2);white-space:pre-line">${esc(e.body)}</p>` : ""}<p class="muted small">${esc(EVIDENCE[e.evidenceStatus]?.help)}</p></section>
      ${SKILL_SPECS[e.slug] ? `<section><h2>3D animation</h2><div id="entry-anim" data-slug="${esc(e.slug)}"><div class="anim-loading">Loading animation…</div></div></section>` : ""}
      ${distinct.length ? `<section><h2>Not to be confused with</h2><ul class="side-list">${distinct.map((r) => `<li class="card pad small"><a href="#/tricks/${esc(r.slug)}"><b>${esc(r.name)}</b></a>${r.note ? ` — ${esc(r.note)}` : ""}</li>`).join("")}</ul></section>` : ""}
      <section><h2>What the sources say <span class="muted xs" style="font-weight:400">· ${e.claims.length} claims · ${sourceIds.length} sources</span></h2>
        ${
          e.claims.length
            ? `<ol class="side-list">${e.claims
                .map((c) => {
                  const [label, tone] = CLAIM_STATUS[c.status] ?? CLAIM_STATUS.unsupported!;
                  return `<li class="card claim"><div class="row"><p class="min0">${esc(c.statement)}</p><span class="badge ${tone}">${esc(label)}</span></div>
                  ${
                    c.citations.length
                      ? `<details><summary>${c.citations.map((ci) => `[${idx(ci.sourceId)}]`).join(" ")} Show ${c.citations.length === 1 ? "excerpt" : "excerpts"}</summary>${c.citations
                          .map((ci) => {
                            const s = DATA.sources[ci.sourceId];
                            return `<div class="excerpt">${ci.stance !== "supports" ? `<span class="badge ${ci.stance === "contradicts" ? "t-danger" : ""}">${esc(ci.stance)}</span> ` : ""}${ci.excerpt ? `<q>${esc(ci.excerpt)}</q>` : `<span class="muted">No excerpt recorded.</span>`}<div class="muted xs">[${idx(ci.sourceId)}] ${esc(s?.publisher || s?.title)} · ${esc(s?.retrievalMethod)}</div></div>`;
                          })
                          .join("")}</details>`
                      : ""
                  }</li>`;
                })
                .join("")}</ol>`
            : `<p class="empty muted small">No sourced claims yet. This entry should not be relied on.</p>`
        }</section>
      <section><h2>Sources</h2><ol class="sources">${sourceIds
        .map((id, i) => {
          const s = DATA.sources[id]!;
          const tone = s.reliability === "primary" ? "t-ok" : s.reliability === "secondary" ? "t-info" : "";
          return `<li><span class="num">[${i + 1}]</span><div class="min0"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.title)}</a> <span class="muted">— ${esc(s.publisher || "unknown publisher")}</span>
            <div class="wrap xs muted" style="margin-top:2px"><span class="badge ${tone}">${esc(s.reliability)}</span> accessed ${esc(new Date(s.accessedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}</div></div></li>`;
        })
        .join("")}</ol></section>
    </div><aside class="stack">
      ${linked.length ? `<section><h2>Linked entries</h2><ul class="side-list">${linked.map((r) => `<li class="small"><a href="#/tricks/${esc(r.slug)}"><b>${esc(r.name)}</b></a> <span class="muted xs">· ${esc(RELATION[r.kind])}</span>${r.note ? `<div class="muted xs">${esc(r.note)}</div>` : ""}</li>`).join("")}</ul></section>` : ""}
      ${discover.length ? `<section><h2>Discover similar</h2><ul class="side-list">${discover.map((r) => `<li><a class="tile" href="#/tricks/${esc(r.slug)}"><span class="small" style="font-weight:500">${esc(r.name)}</span><span class="muted xs" style="display:block">${esc(r.reason)}</span></a></li>`).join("")}</ul></section>` : ""}
      <section><h2>Revision history</h2><p class="muted xs">Revision ${e.revision}</p><ol class="side-list xs" style="color:var(--ink-2)">${e.revisions.slice(0, 6).map((r) => `<li><span class="num" style="min-width:auto">r${r.revision}</span> ${esc(r.summary)}</li>`).join("")}</ol></section>
    </aside></div></div>`;
}

function viewExplore() {
  const rot = new Map<number, number>();
  const tags = new Map<string, number>();
  for (const e of DATA.entries) {
    if (e.quarterRotations !== null) rot.set(e.quarterRotations, (rot.get(e.quarterRotations) ?? 0) + 1);
    for (const t of e.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  return `<div class="container">${header("Trick Book", "Explore", "Browse by category, by amount of somersault rotation, or by tag.")}
    <section style="margin-top:28px"><h2>Categories</h2><ul class="grid cols">${DATA.categories.map((c) => `<li><a class="card pad tile" style="height:100%" href="#/tricks?category=${esc(c.slug)}"><b>${esc(c.name)}</b> <span class="muted small">${c.count}</span><br><span class="muted small">${esc(c.description)}</span></a></li>`).join("")}</ul></section>
    <section style="margin-top:36px"><h2>By somersault rotation</h2><div class="chips">${[...rot.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([q, n]) => `<a class="chip" href="#/tricks?rotation=${q}&sort=rotation">${q === 0 ? "No somersault" : `${fraction(q, 4)} somersault${q > 4 ? "s" : ""}`} <span class="muted">${n}</span></a>`)
      .join("")}</div></section>
    <section style="margin-top:36px"><h2>Tags</h2><div class="chips">${[...tags.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t, n]) => `<a class="chip" href="#/tricks?tag=${encodeURIComponent(t)}">${esc(t)} <span class="muted">${n}</span></a>`)
      .join("")}</div></section></div>`;
}

function viewCollection() {
  const col = collection();
  const items = Object.entries(col)
    .map(([slug, status]) => ({ e: bySlug(slug), status }))
    .filter((x): x is { e: Entry; status: string } => !!x.e);
  return `<div class="container">${header("Personal", "My collection", "Saved in this browser only. In the full version your collection is stored in your account and private by default.")}
    ${
      items.length
        ? `<ul class="side-list" style="margin-top:24px">${items
            .map(
              ({ e, status }) => `<li class="card pad"><div class="row">${glyph(e.quarterRotations, e.halfTwists)}<div class="min0"><a href="#/tricks/${esc(e.slug)}"><b>${esc(e.name)}</b></a><p class="muted small" style="margin:2px 0 6px">${esc(e.summary)}</p><div class="wrap">${evidenceBadge(e.evidenceStatus)}<span class="badge t-accent">${esc(COLLECTION[status])}</span></div></div>
              <button class="btn ghost" data-collect="remove" data-slug="${esc(e.slug)}">Remove</button></div></li>`,
            )
            .join("")}</ul>`
        : `<div class="empty" style="margin-top:24px"><p><b>Your collection is empty</b></p><p class="muted small">Open any entry and mark it Saved, Working on or Landed.</p><p><a class="btn primary" href="#/tricks">Browse the Trick Book</a></p></div>`
    }</div>`;
}

// ---------------------------------------------------------------------------
// Assistant (retrieval-only, same rules as the server's fallback mode)
// ---------------------------------------------------------------------------

type Answer = { id: string; question: string; safety: string; mode: "retrieval_only" | "no_match"; blocks: { text: string; keys: string[] }[]; citations: { key: string; statement: string; status: string; slug: string; name: string; sourceIds: string[] }[]; entries: string[]; caveats: string[] };

const STOP = new Set("a an and are as at be by can could did do does for from how i in is it me my of on or should the this to was what when where which who why will with you your about tell explain difference between vs versus".split(" "));

function retrieve(question: string) {
  const nq = ` ${normalizeName(question)} `;
  const byName = DATA.entries
    .map((e) => ({ e, len: Math.max(0, ...[e.name, ...e.aliases].map(normalizeName).filter((n) => n.length >= 3 && nq.includes(` ${n} `)).map((n) => n.length)) }))
    .filter((x) => x.len > 0)
    .sort((a, b) => b.len - a.len)
    .map((x) => x.e);
  const found = byName.slice(0, 4);
  const terms = normalizeName(question).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  if (found.length < 4 && terms.length) {
    const scored = DATA.entries
      .filter((e) => !found.includes(e))
      .map((e) => {
        const text = ` ${normalizeName(`${e.name} ${e.aliases.join(" ")} ${e.summary} ${e.body}`)} `;
        return { e, s: terms.filter((t) => text.includes(` ${t}`)).length };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    for (const x of scored) if (found.length < 4) found.push(x.e);
  }
  return { found, byName };
}

function answer(question: string): Answer {
  const safety = classifyQuestion(question);
  const { found, byName } = retrieve(question);
  const id = Date.now().toString(36);
  if (!found.length)
    return { id, question, safety, mode: "no_match", blocks: [{ text: "The knowledge base doesn't have an entry that covers this question, so I can't answer it reliably. Try different wording.", keys: [] }], citations: [], entries: [], caveats: [] };
  const shown = (byName.length ? byName : found).slice(0, 3);
  let n = 0;
  const citations: Answer["citations"] = [];
  const blocks = shown.map((e) => {
    const supported = e.claims.filter((c) => c.citations.some((ci) => ci.stance === "supports")).slice(0, 3);
    const keys: string[] = [];
    const lines = supported.map((c) => {
      const key = `C${++n}`;
      keys.push(key);
      citations.push({ key, statement: c.statement, status: c.status, slug: e.slug, name: e.name, sourceIds: c.citations.map((ci) => ci.sourceId) });
      return `${c.status === "disputed" ? "Disputed: " : ""}${c.statement}`;
    });
    return { text: `${e.name}: ${e.summary}${lines.length ? `\n${lines.join("\n")}` : ""}`, keys };
  });
  const caveats: string[] = [];
  if (found.some((e) => e.evidenceStatus === "conflicting")) caveats.push("Some of these sources disagree with each other. Read the cited claims before relying on the answer.");
  if (found.some((e) => e.evidenceStatus === "limited_evidence")) caveats.push("Most supporting sources are secondary or club glossaries; none has been verified against a primary source in full.");
  return { id, question, safety, mode: "retrieval_only", blocks, citations, entries: found.map((e) => e.slug), caveats };
}

const EXAMPLES = ["What is a barani?", "What's the difference between a ball out and a cody?", "How is a trampoline routine scored?", "How do I do a rudy step by step?"];

function viewAssistant(params: URLSearchParams) {
  const history = store.get<Answer[]>("tb-assistant", []);
  const current = history.find((h) => h.id === params.get("a")) ?? null;
  const num = new Map(current?.citations.map((c, i) => [c.key, i + 1]) ?? []);
  return `<div class="container">${header("Assistant", "Ask the Trick Book", "Answers come only from published Trick Book records and cite them. This demo runs in retrieval-only mode: it shows the matching records and their cited claims as stored, without generated wording.")}
    <div class="two-col"><div class="stack">
      <form id="ask" class="card pad" style="display:flex;flex-direction:column;gap:12px">
        <label for="question" class="skip">Your question</label>
        <textarea id="question" rows="3" maxlength="500" required placeholder="Ask about a skill, a term or competition rules…"></textarea>
        <div class="row" style="justify-content:space-between;flex-wrap:wrap"><div class="chips">${EXAMPLES.map((q) => `<button type="button" class="chip" data-example="${esc(q)}">${esc(q)}</button>`).join("")}</div><button class="btn primary">Ask</button></div>
      </form>
      ${
        current
          ? `<article class="card pad answer" aria-label="Answer"><div class="wrap" style="margin-bottom:12px"><h2 style="margin:0">${esc(current.question)}</h2><span class="badge ${current.mode === "no_match" ? "" : "t-warn"}">${current.mode === "no_match" ? "No matching records" : "Retrieval only — records shown as stored"}</span></div>
          ${current.safety !== "ok" ? `<div class="notice warn" style="margin-bottom:12px"><b>Safety</b>${esc(SAFETY_NOTICE[current.safety as "instructions"])}</div>` : ""}
          ${current.blocks.map((b) => `<p>${esc(b.text)} ${b.keys.map((k) => `<sup><a href="#cite-${k}" data-anchor="cite-${k}">[${num.get(k)}]</a></sup>`).join("")}</p>`).join("")}
          ${current.caveats.length ? `<ul class="muted small">${current.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
          ${
            current.citations.length
              ? `<h2 style="border-top:1px solid var(--line);padding-top:12px">Citations</h2><ol class="sources">${current.citations
                  .map(
                    (c) => `<li id="cite-${c.key}"><span class="num">[${num.get(c.key)}]</span><div class="min0">${esc(c.statement)} ${c.status === "disputed" ? `<span class="badge t-danger">disputed</span>` : ""}<div class="muted xs"><a href="#/tricks/${esc(c.slug)}">${esc(c.name)}</a> · ${c.sourceIds
                      .map((id) => DATA.sources[id])
                      .filter(Boolean)
                      .map((s) => `<a href="${esc(s!.url)}" target="_blank" rel="noopener noreferrer nofollow" style="color:inherit">${esc(s!.publisher || s!.title)}</a>`)
                      .join(", ")}</div></div></li>`,
                  )
                  .join("")}</ol>`
              : ""
          }</article>`
          : ""
      }
    </div><aside><h2>Your questions <span class="muted xs" style="font-weight:400">(this browser)</span></h2>${
      history.length
        ? `<ul class="side-list history">${history.map((h) => `<li><a href="#/assistant?a=${h.id}" aria-current="${h.id === current?.id}">${esc(h.question)}</a></li>`).join("")}</ul><button class="btn ghost" id="clear-history" style="margin-top:8px">Clear</button>`
        : `<p class="muted small">No questions yet.</p>`
    }</aside></div></div>`;
}

function viewAnimate() {
  return `<div class="container">${header("3D animations", "Skill animations", "Watch skills in 3D, step through each phase, type FIG notation to see any twisting somersault — such as 822o, a fliffis with a full twist in each somersault — or chain skills into a combination.")}
    <div id="anim-studio" style="margin-top:24px"><div class="anim-loading">Loading animator…</div></div></div>`;
}

function viewAbout() {
  return `<div class="container" style="max-width:48rem">${header("Transparency", "About the data", "How entries are sourced, labelled and reviewed, and what this site is not.")}
    <section style="margin-top:24px"><h2>Evidence labels</h2><ul class="side-list">${Object.entries(EVIDENCE).map(([k, m]) => `<li class="row"><span style="width:11rem;flex-shrink:0">${evidenceBadge(k)}</span><span class="min0">${esc(m.help)}</span></li>`).join("")}</ul></section>
    <section style="margin-top:28px"><h2>Where the starting content came from</h2><p>The entries were compiled from search-engine excerpts of club glossaries, Wikipedia, broadcaster explainers and the FIG Code of Points. Full pages could not be retrieved at the time, so every source is marked as such and no entry is labelled “verified”. Excerpts that are the search tool's paraphrase rather than a direct quote are prefixed “Search summary”.</p></section>
    <section style="margin-top:28px"><h2>How new information gets in</h2><p>In the full version, members suggest additions and a research agent gathers candidate sources. Both produce drafts with explicit citations; nothing reaches the Trick Book until a reviewer approves it, and only claims backed by a source are imported. Agreement between several sources is not proof: many glossaries copy each other.</p></section>
    <section style="margin-top:28px"><h2>What this site is not</h2><p>It is not coaching. Nothing here tells you how to perform a skill or whether you are ready to try one. Learn with a qualified coach, proper matting and spotting.</p></section>
    <p class="muted small" style="margin-top:28px">Data exported ${esc(new Date(DATA.generatedAt).toLocaleString("en-GB"))}.</p></div>`;
}

// ---------------------------------------------------------------------------
// Router and events
// ---------------------------------------------------------------------------

function route() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = raw.split("?");
  const params = new URLSearchParams(qs);
  const parts = path!.split("/").filter(Boolean);
  let html: string;
  let nav = "";
  let title = "Trampolin";
  if (parts[0] === "tricks" && parts[1]) {
    html = viewEntry(decodeURIComponent(parts[1]));
    nav = "tricks";
    title = `${bySlug(parts[1])?.name ?? "Entry"} · Trampolin`;
  } else if (parts[0] === "tricks") [html, nav, title] = [viewTricks(params), "tricks", "Trick Book · Trampolin"];
  else if (parts[0] === "explore") [html, nav, title] = [viewExplore(), "explore", "Explore · Trampolin"];
  else if (parts[0] === "collection") [html, nav, title] = [viewCollection(), "collection", "My collection · Trampolin"];
  else if (parts[0] === "assistant") [html, nav, title] = [viewAssistant(params), "assistant", "Assistant · Trampolin"];
  else if (parts[0] === "about") [html, nav, title] = [viewAbout(), "about", "About the data · Trampolin"];
  else if (parts[0] === "animate") [html, nav, title] = [viewAnimate(), "animate", "3D animations · Trampolin"];
  else html = viewHome();
  if (!html) return;
  animator?.destroy();
  animator = null;
  main.innerHTML = html;
  mountAnimations();
  document.title = title;
  document.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((a) => (a.dataset.nav === nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
}

let lastPath = "";
window.addEventListener("hashchange", () => {
  const path = location.hash.split("?")[0];
  route();
  if (path !== lastPath) window.scrollTo(0, 0);
  lastPath = path ?? "";
});

document.addEventListener("click", (ev) => {
  const t = ev.target as HTMLElement;
  const collect = t.closest<HTMLElement>("[data-collect]");
  if (collect) {
    const col = collection();
    const slug = collect.dataset.slug!;
    if (collect.dataset.collect === "remove") delete col[slug];
    else col[slug] = collect.dataset.collect!;
    store.set("tb-collection", col);
    route();
    return;
  }
  const ex = t.closest<HTMLElement>("[data-example]");
  if (ex) {
    const ta = document.getElementById("question") as HTMLTextAreaElement;
    ta.value = ex.dataset.example!;
    ta.focus();
    return;
  }
  const anchor = t.closest<HTMLElement>("[data-anchor]");
  if (anchor) {
    ev.preventDefault();
    document.getElementById(anchor.dataset.anchor!)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (t.id === "clear-history") {
    store.set("tb-assistant", []);
    location.hash = "#/assistant";
    route();
  }
});

document.addEventListener("submit", (ev) => {
  const form = ev.target as HTMLFormElement;
  ev.preventDefault();
  if (form.id === "home-search") {
    const q = (document.getElementById("home-q") as HTMLInputElement).value.trim();
    location.hash = q ? `#/tricks?q=${encodeURIComponent(q)}` : "#/tricks";
  } else if (form.id === "tricks-search") {
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (typeof v === "string" && v && !(k === "sort" && v === "relevance")) p.set(k, v);
    location.hash = `#/tricks${p.toString() ? `?${p}` : ""}`;
  } else if (form.id === "ask") {
    const q = (document.getElementById("question") as HTMLTextAreaElement).value.trim();
    if (q.length < 3) return;
    const a = answer(q.slice(0, 500));
    store.set("tb-assistant", [a, ...store.get<Answer[]>("tb-assistant", [])].slice(0, 30));
    location.hash = `#/assistant?a=${a.id}`;
  }
});

document.addEventListener("change", (ev) => {
  const el = ev.target as HTMLElement;
  if (el.closest("#tricks-search") && el.tagName === "SELECT") (el.closest("form") as HTMLFormElement).requestSubmit();
});

fetch("data.json")
  .then((r) => r.json())
  .then((d: Data) => {
    DATA = d;
    lastPath = location.hash.split("?")[0] ?? "";
    route();
  })
  .catch(() => {
    main.innerHTML = `<div class="container" style="padding-top:48px"><div class="empty"><p><b>Couldn't load the Trick Book data.</b></p><p class="muted small">Reload the page to try again.</p></div></div>`;
  });
