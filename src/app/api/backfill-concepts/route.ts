import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const tweets = await prisma.tweet.findMany({
    orderBy: { timestamp: "desc" },
  });

  let extracted = 0;
  let skipped = 0;
  let totalConcepts = 0;
  const errors: { tweetId: number; error: string }[] = [];

  for (const tweet of tweets) {
    // Skip tweets that already have concepts linked
    const existingCount = await prisma.tweetConcept.count({
      where: { tweetId: tweet.id },
    });
    if (existingCount > 0) {
      skipped++;
      continue;
    }

    try {
      const concepts = await extractConcepts(tweet.content, tweet.timestamp, apiKey);

      for (const c of concepts) {
        if (!c.name || c.name.length > 100) continue;

        let concept = await prisma.concept.findUnique({ where: { name: c.name } });
        if (!concept) {
          concept = await prisma.concept.create({
            data: {
              name: c.name,
              description: c.description?.slice(0, 500) || null,
              category: c.category?.trim() || null,
            },
          });
        }

        const existingLink = await prisma.tweetConcept.findUnique({
          where: { tweetId_conceptId: { tweetId: tweet.id, conceptId: concept.id } },
        });
        if (!existingLink) {
          await prisma.tweetConcept.create({
            data: { tweetId: tweet.id, conceptId: concept.id },
          });
        }
        totalConcepts++;
      }
      extracted++;
    } catch (e: any) {
      errors.push({ tweetId: tweet.id, error: e.message });
    }
  }

  return NextResponse.json({
    processed: tweets.length,
    extracted,
    skipped: skipped + (tweets.length - extracted - errors.length),
    totalConcepts,
    errors,
  });
}

async function extractConcepts(
  content: string,
  timestamp: Date | null,
  apiKey: string
): Promise<{ name: string; description?: string; category?: string }[]> {
  const prompt = `You are an investment research assistant. Extract key CONCEPTS from this tweet by a smart investor named "Serenity" (@aleaboreddit).

A concept is NOT a stock ticker — it's an idea, technology, supply chain dynamic, or investment theme.

Look for:
- Technologies ("Silicon Photonics", "HBM", "CW Laser", "InP Substrates", "Glass substrates", "CPO")
- Supply chain dynamics ("OSAT consolidation", "China export controls", "NVIDIA supply chain", "foundry competition")
- Investment themes ("optical interconnect", "AI capex cycle", "semiconductor equipment boom", "HBM demand")
- Notable private companies, products, consortiums, or events
- Industry standards, regulations, or market shifts

For each concept provide:
- name: short label (max 100 chars)
- description: one sentence explanation from the tweet's context
- category: one of "Technology", "Supply Chain", "Market Theme", "Product", or "Other"

Return ONLY valid JSON, no markdown:
{
  "concepts": [
    {"name": "Silicon Photonics", "description": "Photonic integrated circuit technology for optical interconnects", "category": "Technology"}
  ]
}

If no concepts found, return {"concepts": []}.

Tweet timestamp: ${timestamp ? new Date(timestamp).toISOString() : "unknown"}
Tweet content:
${content.slice(0, 8000)}`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  const text = data.choices[0].message.content;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");
  const result = JSON.parse(jsonMatch[0]);
  return result.concepts || [];
}
