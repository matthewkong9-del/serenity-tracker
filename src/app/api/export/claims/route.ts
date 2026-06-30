import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** GET /api/export/claims?format=csv|md&ticker=XYZ */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "csv";
  const ticker = url.searchParams.get("ticker");

  const claims = await prisma.claim.findMany({
    where: ticker ? { stock: { ticker: ticker.toUpperCase() } } : {},
    include: {
      stock: { select: { ticker: true } },
      tweet: { select: { content: true, timestamp: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (format === "md") {
    const lines = ["# Claims Export", ""];
    if (ticker) lines[0] = `# Claims — $${ticker.toUpperCase()}`;
    lines.push(`Exported: ${new Date().toISOString().split("T")[0]}`, "");

    for (const c of claims) {
      lines.push(`## $${c.stock.ticker} — ${c.status.toUpperCase()}`);
      lines.push(`- **Claim:** ${c.text}`);
      if (c.source) lines.push(`- **Source:** ${c.source}`);
      if (c.evidence) lines.push(`- **Evidence:** ${c.evidence.slice(0, 300)}`);
      lines.push("");
    }

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="claims${ticker ? `-${ticker}` : ""}.md"`,
      },
    });
  }

  // CSV
  const headers = ["ticker", "status", "text", "source", "evidence", "createdAt"];
  const rows = [headers.join(",")];
  for (const c of claims) {
    rows.push(
      [
        c.stock.ticker,
        c.status,
        `"${c.text.replace(/"/g, '""')}"`,
        c.source ? `"${c.source.replace(/"/g, '""')}"` : "",
        c.evidence ? `"${c.evidence.slice(0, 200).replace(/"/g, '""')}"` : "",
        new Date(c.createdAt).toISOString().split("T")[0],
      ].join(",")
    );
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="claims${ticker ? `-${ticker}` : ""}.csv"`,
    },
  });
}
