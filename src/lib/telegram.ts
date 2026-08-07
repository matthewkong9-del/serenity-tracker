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

/** Send a plain text message to the configured chat.
 *  Returns the Telegram message_id, or null on failure. */
export async function sendMessage(text: string): Promise<number | null> {
  const t = token();
  const c = chatId();
  if (!t || !c) {
    console.log("[telegram] not configured — skipping send");
    return null;
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
      return null;
    }

    const data = await res.json();
    return data.result?.message_id ?? null;
  } catch (e: any) {
    console.error(`[telegram] send error: ${e.message}`);
    return null;
  }
}

/**
 * Notify the user about new claims from a tweet.
 * Sends one message with all claims summarized — user can reply with orders.
 */
export async function notifyNewTweet(
  tweetContent: string,
  claims: ClaimNotification[]
): Promise<number | null> {
  const t = token();
  const c = chatId();
  if (!t || !c) return null;

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
    `🆕 *Serenity just tweeted*`,
    ``,
    `> ${preview}`,
    ``,
    `${claims.length} claim(s) found:`,
    claimLines,
    ``,
    `What should I do?`,
    `\`research 1 2\` — check specific claims`,
    `\`research all\` — check everything`,
    `\`deep 1\` — dig deeper on claim 1`,
    `\`review\` — claims awaiting your verdict`,
    `\`skip\` — ignore this one`,
  ].join("\n");

  return sendMessage(text);
}

/** Send a simple status message (pipeline complete, error, etc). */
export async function notify(message: string): Promise<number | null> {
  return sendMessage(`🤖 *Pipeline update*\n\n${message}`);
}

// ── Receiving orders ──

let lastUpdateId = 0;
/** When set, polling is paused until this timestamp (ms). Used to back off
 *  on a 409 Conflict — another process is polling this same bot token. */
let pollBackoffUntil = 0;
/** Suppress repeated 409 log lines — surface at most once per hour. */
let last409LogAt = 0;

export interface TelegramCommand {
  command: string;
  /** The message_id of the notification this command was a reply to, if any. */
  replyToMessageId: number | null;
}

/** Poll Telegram for new messages from the user. Returns parsed commands with
 *  reply-to info so the orchestrator can match commands to the right triage. */
export async function checkForOrders(): Promise<TelegramCommand[]> {
  const t = token();
  if (!t) return [];

  // Back off if we recently hit a 409 (another poller on this bot token).
  if (Date.now() < pollBackoffUntil) return [];

  try {
    const res = await fetch(
      `${API}/bot${t}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      const body = await res.text();
      // 409 Conflict = another process is polling this bot (e.g. an external
      // tweet-collector). Don't spam the log every tick — back off 5 minutes.
      let errorCode = 0;
      try {
        errorCode = JSON.parse(body).error_code;
      } catch {
        /* not JSON */
      }
      if (errorCode === 409) {
        pollBackoffUntil = Date.now() + 5 * 60 * 1000;
        if (Date.now() - last409LogAt > 60 * 60 * 1000) {
          last409LogAt = Date.now();
          console.warn(
            "[telegram] 409 conflict — another bot poller is active; backing off 5 min"
          );
        }
      } else {
        console.error(`[telegram] poll failed: ${body}`);
      }
      return [];
    }

    const data = await res.json();
    if (!data.ok || !data.result) return [];

    const commands: TelegramCommand[] = [];

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

      commands.push({
        command: msg.text.trim().toLowerCase(),
        replyToMessageId: msg.reply_to_message?.message_id ?? null,
      });
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
): { claimIds: number[]; depth: "quick" | "deep"; action: "research" | "skip" | "review" } {
  const trimmed = command.trim().toLowerCase();

  if (trimmed === "skip" || trimmed === "skip all") {
    return { claimIds: [], depth: "quick", action: "skip" };
  }

  // "review" — digest of claims awaiting a human verdict (the /review workspace)
  if (trimmed === "review") {
    return { claimIds: [], depth: "quick", action: "review" };
  }

  if (trimmed === "research all" || trimmed === "all") {
    return {
      claimIds: pendingClaims.map((c) => c.claimId),
      depth: "deep",
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
      depth: "deep",
      action: "research",
    };
  }

  const indices = rest.split(/\s+/).map(Number).filter((n) => !isNaN(n));
  const claimIds = indices
    .map((idx) => pendingClaims.find((c) => c.index === idx)?.claimId)
    .filter(Boolean) as number[];

  // Deep is the default research mode — plain "research N" runs the
  // adversarial 2-pass; the "deep" prefix is kept for explicitness.
  return { claimIds, depth: "deep", action: claimIds.length > 0 ? "research" : "skip" };
}
