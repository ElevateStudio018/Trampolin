import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "@/lib/env";

export type FetchedDocument = { url: string; title: string; publisher: string; text: string };

export class FetchBlockedError extends Error {}

const USER_AGENT = "TrampolinResearchBot/0.1 (+knowledge-base research; respects robots.txt)";
const MAX_BYTES = 2 * 1024 * 1024;

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v === "::";
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Rejects non-https URLs, disallowed domains and hosts that resolve to private networks (SSRF guard). */
export async function assertFetchable(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("Not a valid URL");
  }
  if (url.protocol !== "https:") throw new FetchBlockedError("Only https URLs are fetched");
  if (url.username || url.password) throw new FetchBlockedError("URLs with credentials are not allowed");
  const allowed = env()
    .RESEARCH_ALLOWED_DOMAINS?.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const host = url.hostname.toLowerCase();
  if (allowed?.length && !allowed.some((d) => host === d || host.endsWith(`.${d}`))) throw new FetchBlockedError(`Domain ${host} is not on the research allow-list`);
  const addrs = await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new FetchBlockedError(`Could not resolve ${host}`);
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new FetchBlockedError("Refusing to fetch a private network address");
  return url;
}

/** Minimal robots.txt check for our user agent and "*". Unreachable robots.txt = allowed. */
export async function robotsAllows(url: URL): Promise<boolean> {
  try {
    const res = await fetch(`${url.origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(5000), redirect: "follow" });
    if (!res.ok) return true;
    return parseRobots(await res.text(), url.pathname + url.search);
  } catch {
    return true;
  }
}

export function parseRobots(txt: string, path: string): boolean {
  let applies = false;
  let disallows: string[] = [];
  let allows: string[] = [];
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[]; allow: string[] } | null = null;
  for (const rawLine of txt.split(/\r?\n/)) {
    const lineText = rawLine.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(lineText);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && key === "disallow" && value) current.disallow.push(value);
    else if (current && key === "allow" && value) current.allow.push(value);
  }
  const ours = groups.find((g) => g.agents.some((a) => a !== "*" && USER_AGENT.toLowerCase().startsWith(a)));
  const star = groups.find((g) => g.agents.includes("*"));
  const group = ours ?? star;
  if (group) {
    applies = true;
    disallows = group.disallow;
    allows = group.allow;
  }
  if (!applies) return true;
  const longest = (rules: string[]) => Math.max(-1, ...rules.filter((r) => path.startsWith(r.replace(/\*$/, ""))).map((r) => r.length));
  return longest(allows) >= longest(disallows);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", frac12: "½", frac14: "¼", frac34: "¾", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function htmlToText(html: string): { title: string; publisher: string; text: string } {
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim();
  const publisher = decode(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? "").trim();
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article|dd|dt)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { title, publisher, text };
}

function decode(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+\d*);/gi, (m, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Fetches a page politely: SSRF guard, robots.txt, timeout, size cap, text/html only. */
export async function fetchDocument(rawUrl: string, redirects = 0): Promise<FetchedDocument> {
  if (redirects > 3) throw new Error("Too many redirects");
  const url = await assertFetchable(rawUrl);
  if (!(await robotsAllows(url))) throw new FetchBlockedError("robots.txt disallows fetching this page");
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain" }, redirect: "manual", signal: AbortSignal.timeout(12_000) });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) throw new Error(`Redirect without location (HTTP ${res.status})`);
    // Re-validate the redirect target rather than following blindly.
    return fetchDocument(new URL(loc, url).toString(), redirects + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/(html|plain)/i.test(type)) throw new FetchBlockedError(`Unsupported content type ${type || "unknown"}`);
  const reader = res.body?.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const parsed = /html/i.test(type) ? htmlToText(raw) : { title: "", publisher: "", text: raw };
  return { url: url.toString(), title: parsed.title || url.hostname, publisher: parsed.publisher || url.hostname.replace(/^www\./, ""), text: parsed.text };
}
