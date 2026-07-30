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
A specific, falsifiable statement extracted from a Tweet by the AI. Each Claim belongs to one Stock and optionally one Tweet. Carries AI **extractionConfidence** (how sure the AI is that it extracted the claim correctly).

**`status`** — the AI's **authoritative** verdict, set by the research pipeline. Must be evidence-backed: the AI only moves a claim out of `unverified` when research supports it.
- `unverified` — not yet checked, or evidence was insufficient (default)
- `supported` — research found evidence confirming the claim
- `refuted` — research found evidence contradicting the claim
- `disputed` — sources disagree, evidence is mixed

The human does **not** override `status`. The human's input is a **`humanNote`** — free-text observations on the claim. (The one-click status-cycling UI is removed; `status` is AI-owned.) When a claim is re-researched, the AI's new verdict overwrites the old `status`.

**`researchStatus`** — pipeline state of the research job: `pending` → `researching` → `done` | `failed`. Independent of `status`.
**`impactScore`** (1–5) — how chokepoint-relevant the claim is; drives triage routing (low-impact auto-researches, high-impact escalates to Telegram).
**`insightType`** — taxonomy tag: `chokepoint` | `dependency` | `pricing_power` | `moat_signal` | `risk_factor` | `general`.
**`humanNote`** — the human's observations on the claim; does not affect `status`. Separate from the AI's `evidence`.
**`evidence`** — AI-written research output (verdict, sources, reasoning). AI-only.
**`extractionConfidence`** (1–5) — AI self-rating of how reliably it extracted the claim from the tweet.

**Research freshness:** research must stay current. A claim whose research is stale can be re-queued (`researchStatus` → `pending`) for re-research.

**Verification verdict** (from the research pipeline): `supported` | `refuted` | `disputed` | `unresolved`.
- `unresolved` — insufficient evidence to reach any verdict; the claim stays `unverified`.
- The verdict becomes the claim's `status` (except `unresolved`, which leaves `status` unchanged).
- **verificationConfidence** (`high`/`medium`/`low`) is ephemeral — it lives in the `evidence` text, not a column.

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

## Knowledge Base & Autonomous Layer

### Chokepoint Depth
A 1–5 rating of how essential what a Stock controls is to its supply chain (5 = irreplaceable sole-source, no substitutes; 1 = commodity, easily substituted). Set by the AI during summarization. Drives scoring.

### Narrative
A conversational, knowledge-base-style story about a Stock, generated from its analytical summary after summarization. Editable on the stock page. Distinct from the `summary` (the structured analyst output).

### Annotation
A margin note attached to a specific section of a Stock's Narrative (`what` | `chokepoint` | `numbers` | `risk` | `bottom`). Human-authored; does not affect the AI's analysis.

### Scoring
Live, computed-on-read classification of a Stock into an **OpportunityBucket**: `strong_buy` | `watch` | `pass`. Multi-factor: chokepoint depth × evidence quality × market ignorance × asymmetric bonus × valuation discount. Not persisted — recomputed each read.

### Triage
Impact-based routing of newly-extracted claims. Low-impact claims (`impactScore` ≤ 3) auto-flow to research; high-impact claims (≥ 4) escalate to Telegram for human review. Telegram is an escalation channel, not a gate.

### Research
The pipeline that checks a Claim against web sources and sets its `status`. Exa search (primary) → Brave + scrape (fallback) → DeepSeek verdict. **quick** = single pass; **deep** = two adversarial passes (confirm + refute); agreeing verdicts are applied, disagreements marked `disputed`.

### Autonomous Pipeline
The system runs itself via an in-process scheduler (every 30s) dispatching periodic agents (ingest, research, price, auditor, editor, cleanup, watchdog, ops, decision). Reactivity between agents is event-driven (`claim:researched` → re-summarize), with the scheduler's tick as a catch-up safety net. See ADR-0001.

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
| manual status-cycling (UI) | removed — human leaves `humanNote` instead | 2026-07-30 |
| verification verdict "ephemeral, doesn't overwrite status" | verdict is authoritative, becomes `status` | 2026-07-30 |
