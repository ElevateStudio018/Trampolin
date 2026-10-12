const FRACTIONS: Record<string, string> = { "¼": " 1/4", "½": " 1/2", "¾": " 3/4" };

/**
 * Canonical comparison key for names and aliases: case-, accent-, punctuation- and
 * hyphen-insensitive, with unicode fractions expanded ("Full-in ½-out" -> "full in 1/2 out").
 */
export function normalizeName(input: string): string {
  return input
    .replace(/[¼½¾]/g, (m) => FRACTIONS[m] ?? m)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‐-―_-]+/g, " ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(input: string): string {
  return normalizeName(input).replace(/\//g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80) || "entry";
}

/** Normalises a URL for de-duplication: lowercase host, no fragment, no tracking params, no trailing slash. */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  let out = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  const qs = url.searchParams.toString();
  if (qs) out += `?${qs}`;
  return out.replace(/^http:/, "https:");
}

/** Character-trigram Jaccard similarity in [0,1]; mirrors pg_trgm closely enough for in-app checks. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Set<string>();
    for (const word of normalizeName(s).split(" ")) {
      const padded = `  ${word} `;
      for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    }
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

export function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, max - 1).trimEnd()}…`;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
