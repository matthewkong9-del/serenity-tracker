# Serenity Tracker — Domain Glossary

A stock research tool that tracks companies mentioned by the investor "Serenity" (@aleaboreddit), extracts falsifiable claims from his tweets, and uses AI to cross-reference those claims against uploaded documents and web sources.

## Core Entities

### Stock
A publicly traded company being tracked. Identified by its **ticker** symbol (unique). May have a name, sector, AI-generated **summary**, and a **stance** extracted from that summary. A Stock accumulates **notes**, **files**, **claims**, **relationships**, and one **decision**.

### Note
A user-written research note attached to a Stock. Has an optional title, required content, and optional tag (free text). Formerly called "Entry" — renamed 2026-06-30.

### File
A user-uploaded document attached to a Stock. Auto-converted to Markdown on upload via `markit-ai`. Original file preserved on disk; converted Markdown stored in DB for AI consumption. Non-convertible files are marked "not indexed."

### Tweet
A post by Serenity, synced from a Google Sheets CSV. Deduplicated by **contentHash** (SHA-256, first 16 chars). Each Tweet may yield multiple **claims** and **concepts** via AI extraction.

### Claim
A specific, falsifiable statement extracted from a Tweet by the AI. Each Claim belongs to one Stock and optionally one Tweet. A Claim moves through a **status** lifecycle and carries AI **extractionConfidence** (how sure the AI is that it extracted the claim correctly).

**Status lifecycle:** `unverified` → `supported` | `refuted` | `disputed`
- `unverified` — not yet checked against evidence (default)
- `supported` — evidence confirms the claim
- `refuted` — evidence contradicts the claim
- `disputed` — evidence is mixed or sources disagree

**Verification verdict** (ephemeral, from AI pipeline): `supported` | `refuted` | `disputed` | `unresolved`
- `unresolved` — insufficient evidence to reach any verdict. Does NOT overwrite Claim status — the claim stays at its current status. This is a verification-only concept, not a Claim lifecycle state.

### Concept
A technology, supply chain dynamic, market theme, product, or other non-stock idea extracted from Tweets. Examples: "Silicon Photonics," "OSAT consolidation," "AI capex cycle." Connected to Tweets via a many-to-many join (TweetConcept). Categorized: Technology, Supply Chain, Market Theme, Product, Other.

### Relationship
A connection between a Stock and another entity (company, concept, policy, person). AI-discovered from the full research context. Has a **type** (see below) and **sourceConfidence** (how well-sourced the connection is).

**Relationship types** (seeded, AI can extend):
- `competitor` — direct competitor
- `partner` — business partner or collaborator
- `supplier` — supplies goods/services to the Stock
- `moat` — competitive advantage or barrier
- `policy` — regulatory or government relationship
- `gap` — missing capability or vulnerability
- Any other type the AI discovers — shown as "other" with raw text preserved

**Sections:**
- `known` — standard relationship mapping (formerly called "map")
- `contrarian` — contrarian angles, hidden risks, second-order effects

**sourceConfidence** (quality of evidence for the relationship):
- `confirmed` — solid evidence from multiple sources
- `speculative` — plausible but not proven (default)
- `gap` — identified absence or vulnerability (dotted-line relationship)

### Decision
An AI-generated investment maturity assessment for a Stock. One-to-one with Stock.

**Maturity levels:**
- `beginning` — early research, gathering data
- `core` — deep understanding forming
- `actionable` — ready for a decision

**Actions** (only when maturity is `actionable`): `buy` | `hold` | `sell`

### Stance
The AI's assessment of Serenity's current position on a Stock. Extracted from the summary text. Values: `Bullish` | `Bearish` | `Neutral`. Not stored as a DB column — parsed from the summary markdown on read.

## Confidence (three distinct concepts)

| Term | Type | Values | Applies to |
|---|---|---|---|
| **extractionConfidence** | Int (1–5) | 5 = direct quote, 1 = very uncertain | `Claim` — AI self-rating during tweet extraction |
| **verificationConfidence** | String | high / medium / low | Verification verdict (ephemeral) — AI confidence in the verify result |
| **sourceConfidence** | String | confirmed / speculative / gap | `Relationship` — how well-sourced the connection is |

These were all formerly called "confidence" — disambiguated 2026-06-30.

## Verification
The pipeline that checks a Claim against web sources: Exa search (free tier, 20K req/month) → DeepSeek evaluates results → returns a **verdict** with **verificationConfidence** and **corroboratingSources** count. Multi-source rule: `supported` verdict requires 2+ independent sources agreeing. Single-source evidence produces `unresolved`.

## Portfolio
Cross-stock analysis layer. Includes:
- **Urgency ranking** — which stocks need attention based on claim velocity and staleness
- **Thesis drift** — whether the original thesis is strengthening, weakening, or holding as claims get verified/refuted
- **Research plan** — AI-generated prioritization of documents to find, claims to verify, gaps to fill

## Synonyms & Renamed Terms

| Old term | New term | When changed |
|---|---|---|
| Entry | Note | 2026-06-30 |
| Relationship section "map" | section "known" | 2026-06-30 |
| Tab label "Map" | "Relationships" | 2026-06-30 |
| confidence (Claim, 1-5) | extractionConfidence | 2026-06-30 |
| confidence (Verdict) | verificationConfidence | 2026-06-30 |
| confidence (Relationship) | sourceConfidence | 2026-06-30 |
| "Maturity Ladder" (UI) | "Decisions" | 2026-06-30 |
| Claim "verified" label | "supported" | 2026-06-30 |
