import { env } from "@/lib/env";

export type SearchResult = { url: string; title: string; snippet: string };

export interface SearchProvider {
  readonly name: string;
  search(query: string, limit: number): Promise<SearchResult[]>;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 10_000): Promise<unknown> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
        continue;
      }
    }
    throw new Error(`Search API returned HTTP ${res.status}`);
  }
  throw new Error("Search API unavailable");
}

class BraveSearch implements SearchProvider {
  readonly name = "brave";
  constructor(private readonly key: string) {}
  async search(query: string, limit: number) {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
    const data = (await fetchJson(url, { headers: { Accept: "application/json", "X-Subscription-Token": this.key } })) as {
      web?: { results?: { url: string; title: string; description?: string }[] };
    };
    return (data.web?.results ?? []).map((r) => ({ url: r.url, title: r.title, snippet: r.description ?? "" }));
  }
}

class TavilySearch implements SearchProvider {
  readonly name = "tavily";
  constructor(private readonly key: string) {}
  async search(query: string, limit: number) {
    const data = (await fetchJson("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ query, max_results: limit, search_depth: "basic" }),
    })) as { results?: { url: string; title: string; content?: string }[] };
    return (data.results ?? []).map((r) => ({ url: r.url, title: r.title, snippet: r.content ?? "" }));
  }
}

let override: SearchProvider | null | undefined;
/** Tests inject a deterministic provider; production reads SEARCH_PROVIDER / SEARCH_API_KEY. */
export function setSearchProviderForTests(p: SearchProvider | null | undefined) {
  override = p;
}

export function getSearchProvider(): SearchProvider | null {
  if (override !== undefined) return override;
  const { SEARCH_PROVIDER, SEARCH_API_KEY } = env();
  if (!SEARCH_PROVIDER || !SEARCH_API_KEY) return null;
  if (SEARCH_PROVIDER === "brave") return new BraveSearch(SEARCH_API_KEY);
  if (SEARCH_PROVIDER === "tavily") return new TavilySearch(SEARCH_API_KEY);
  return null;
}
