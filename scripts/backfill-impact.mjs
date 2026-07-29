import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function defaultImpactScore(text, insightType) {
  if (insightType === "chokepoint") return 5;
  if (insightType === "dependency" || insightType === "pricing_power" || insightType === "moat_signal") return 4;
  if (insightType === "risk_factor") return 2;
  const t = text.toLowerCase();
  if (t.match(/\b(sole|only supplier|monopoly|bottleneck|cannot replace|critical|exclusive|must have|irreplaceable|single source)\b/)) return 4;
  if (t.match(/\b(vague|rumor|might|maybe|possibly|unclear|speculation)\b/)) return 2;
  return 3;
}

const claims = await prisma.claim.findMany({
  where: { impactScore: null },
  select: { id: true, text: true, insightType: true },
});

console.log(`Found ${claims.length} claims with null impactScore`);

let updated = 0;
for (const c of claims) {
  const score = defaultImpactScore(c.text, c.insightType);
  await prisma.claim.update({ where: { id: c.id }, data: { impactScore: score } });
  updated++;
  if (updated % 100 === 0) console.log(`  ${updated}/${claims.length}...`);
}

console.log(`Done — scored ${updated} claims`);
await prisma.$disconnect();
