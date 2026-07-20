/**
 * Brave Search API wrapper.
 * Free tier: 2,000 queries/month, 1 query/second, 20 results/query.
 * Sign up: https://brave.com/search/api/
 */
export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

interface BraveResponse {
  web?: {
    results?: {
      title: string;
      url: string;
      description: string;
    }[];
  };
}

export async function braveSearch(query: string, count = 5): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) throw new Error("BRAVE_API_KEY not configured");

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(count, 20)));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Brave API error ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data: BraveResponse = await res.json();
  return (data.web?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description,
  }));
}
