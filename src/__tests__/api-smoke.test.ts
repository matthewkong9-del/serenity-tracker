import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

// GET /api/stocks — list all stocks with counts
import { GET as getStocks } from "@/app/api/stocks/route";

// GET /api/tweets — list all tweets
import { GET as getTweets } from "@/app/api/tweets/route";

// GET /api/claims — global claims list
import { GET as getClaims } from "@/app/api/claims/route";

async function jsonBody(res: Response) {
  return res.json();
}

function makeRequest(url: string, method = "GET"): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, { method });
}

describe("GET /api/stocks", () => {
  it("returns 200 and an array", async () => {
    const res = await getStocks();
    expect(res.status).toBe(200);
    const data = await jsonBody(res);
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns stocks with expected shape when data exists", async () => {
    const res = await getStocks();
    const data = await jsonBody(res);
    if (data.length > 0) {
      const stock = data[0];
      expect(stock).toHaveProperty("ticker");
      expect(stock).toHaveProperty("name");
      expect(stock).toHaveProperty("_count");
      expect(stock._count).toHaveProperty("claims");
    }
  });
});

describe("GET /api/tweets", () => {
  it("returns 200 and an array", async () => {
    const res = await getTweets();
    expect(res.status).toBe(200);
    const data = await jsonBody(res);
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns tweets with expected shape when data exists", async () => {
    const res = await getTweets();
    const data = await jsonBody(res);
    if (data.length > 0) {
      const tweet = data[0];
      expect(tweet).toHaveProperty("id");
      expect(tweet).toHaveProperty("content");
      expect(tweet).toHaveProperty("claimCount");
    }
  });
});

describe("GET /api/claims", () => {
  it("returns 200 with claims array and status counts", async () => {
    const res = await getClaims(makeRequest("/api/claims"));
    expect(res.status).toBe(200);
    const data = await jsonBody(res);
    expect(data).toHaveProperty("claims");
    expect(data).toHaveProperty("counts");
    expect(Array.isArray(data.claims)).toBe(true);
  });

  it("returns status counts covering all statuses", async () => {
    const res = await getClaims(makeRequest("/api/claims"));
    const data = await jsonBody(res);
    expect(data.counts).toHaveProperty("unverified");
    expect(data.counts).toHaveProperty("supported");
    expect(data.counts).toHaveProperty("refuted");
    expect(data.counts).toHaveProperty("disputed");
  });

  it("returns claims with nested stock and tweet", async () => {
    const res = await getClaims(makeRequest("/api/claims"));
    const data = await jsonBody(res);
    if (data.claims.length > 0) {
      const claim = data.claims[0];
      expect(claim).toHaveProperty("text");
      expect(claim).toHaveProperty("status");
      expect(claim).toHaveProperty("stock");
      if (claim.stock) {
        expect(claim.stock).toHaveProperty("ticker");
      }
    }
  });
});
