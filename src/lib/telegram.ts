// ── Telegram integration ──────────────────────────────────────────────────
// Sends notifications when new tweets arrive. Polls for user orders.
//
// Setup:
//   1. Create a bot with @BotFather on Telegram → get TELEGRAM_BOT_TOKEN
//   2. Message @userinfobot to get your TELEGRAM_CHAT_ID
//   3. Add both to .env
//
// No webhook needed — simple polling for commands is sufficient for a
// single-user system.

const API = "https://api.telegram.org";

function token(): string {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

function chatId(): string {
  return process.env.TELEGRAM_CHAT_ID || "";
}

// ── Types ──

export interface TelegramMessage {
  updateId: number;
  chatId: number;
  text: string;
  date: number;
}

export interface ClaimNotification {
  claimId: number;
  ticker: string;
  text: string;
  impactScore: number | null;
  insightType: string | null;
}

// ── Sending ──

/** Send a plain text message to the configured chat. */
export async function sendMessage(text: string): Promise<boolean> {
  const t = token();
  const c = chatId();
  if (!t || !c) {
    console.log("[telegram] not configured — skipping send");
    return false;
  }

  try {
    const res = await fetch(`${API}/bot${t}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: c,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[telegram] send failed: ${err}`);
      return false;
    }

    return true;
  } catch (e: any) {
    console.error(`[telegram] send error: ${e.message}`);
    return false;
  }
}

/**
 * Notify the user about new claims from a tweet.
 * Sends one message with all claims summarized — user can reply with orders.
 */
export async function notifyNewTweet(
  tweetContent: string,
  claims: ClaimNotification[]
): Promise<boolean> {
  const t = token();
  const c = chatId();
  if (!t || !c) return false;

  // Truncate tweet for the preview
  const preview =
    tweetContent.length > 150 ? tweetContent.slice(0, 150) + "…" : tweetContent;

  // Build claim list with impact indicators
  const impactEmoji = (score: number | null) => {
    if (!score) return "⚪";
    if (score >= 4) return "🔴"; // high impact — needs attention
    if (score >= 3) return "🟡"; // medium
    return "🟢"; // low
  };

  const typeLabel = (t: string | null) => {
    if (!t) return "";
    const labels: Record<string, string> = {
      chokepoint: "🔗 chokepoint",
      dependency: "🔗 dependency",
      pricing_power: "💰 pricing power",
      moat_signal: "🏰 moat",
      risk_factor: "⚠️ risk",
      general: "📝 general",
    };
    return labels[t] || t;
  };

  const claimLines = claims
    .map(
      (c, i) =>
        `${i + 1}. ${impactEmoji(c.impactScore)} *$${c.ticker}*: ${c.text.slice(0, 150)}` +
        (c.insightType ? ` _(${typeLabel(c.insightType)})_` : "")
    )
    .join("\n");

  const text = [
    `🆕 *New tweet from Serenity*`,
    ``,
    `> ${preview}`,
    ``,
    `${claims.length} claim(s) extracted:`,
    claimLines,
    ``,
    `Reply with orders:`,
    `\`research 1 2 3\` — research specific claims`,
    `\`research all\` — research everything`,
    `\`skip\` — skip all`,
    `\`deep 1\` — deep (adversarial) research on claim 1`,
  ].join("\n");

  return sendMessage(text);
}

/** Send a simple status message (pipeline complete, error, etc). */
export async function notify(message: string): Promise<boolean> {
  return sendMessage(`🤖 *Pipeline update*\n\n${message}`);
}

// ── Receiving orders ──

let lastUpdateId = 0;

/** Poll Telegram for new messages from the user. Returns parsed commands. */
export async function checkForOrders(): Promise<string[]> {
  const t = token();
  if (!t) return [];

  try {
    const res = await fetch(
      `${API}/bot${t}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      console.error(`[telegram] poll failed: ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    if (!data.ok || !data.result) return [];

    const commands: string[] = [];

    for (const update of data.result) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);

      const msg = update.message;
      if (!msg?.text) continue;

      // Only accept messages from the configured user
      const fromId = String(msg.chat?.id);
      if (fromId !== chatId()) {
        console.log(`[telegram] ignoring message from unknown chat ${fromId}`);
        continue;
      }

      commands.push(msg.text.trim().toLowerCase());
    }

    return commands;
  } catch {
    // Timeout or network error — normal during polling, not an error
    return [];
  }
}

/**
 * Get pending claim IDs from a notification batch.
 * Called when parsing user commands like "research 1 2 3".
 */
export function parseResearchCommand(
  command: string,
  pendingClaims: { index: number; claimId: number }[]
): { claimIds: number[]; depth: "quick" | "deep"; action: "research" | "skip" } {
  const trimmed = command.trim().toLowerCase();

  if (trimmed === "skip" || trimmed === "skip all") {
    return { claimIds: [], depth: "quick", action: "skip" };
  }

  if (trimmed === "research all" || trimmed === "all") {
    return {
      claimIds: pendingClaims.map((c) => c.claimId),
      depth: "quick",
      action: "research",
    };
  }

  // "deep 1 3" or "deep all" → adversarial research
  if (trimmed.startsWith("deep ")) {
    const rest = trimmed.slice(5).trim();
    if (rest === "all") {
      return {
        claimIds: pendingClaims.map((c) => c.claimId),
        depth: "deep",
        action: "research",
      };
    }
    const indices = rest.split(/\s+/).map(Number).filter((n) => !isNaN(n));
    const claimIds = indices
      .map((idx) => pendingClaims.find((c) => c.index === idx)?.claimId)
      .filter(Boolean) as number[];
    return { claimIds, depth: "deep", action: "research" };
  }

  // "research 1 2 3" or just "1 2 3"
  let rest = trimmed;
  if (rest.startsWith("research ")) rest = rest.slice(9).trim();
  if (rest === "all") {
    return {
      claimIds: pendingClaims.map((c) => c.claimId),
      depth: "quick",
      action: "research",
    };
  }

  const indices = rest.split(/\s+/).map(Number).filter((n) => !isNaN(n));
  const claimIds = indices
    .map((idx) => pendingClaims.find((c) => c.index === idx)?.claimId)
    .filter(Boolean) as number[];

  return { claimIds, depth: "quick", action: claimIds.length > 0 ? "research" : "skip" };
}
