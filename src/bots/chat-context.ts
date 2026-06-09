export type ChatTurn = {
  nickname: string;
  text: string;
  isMe: boolean;
};

const STOP_WORDS = new Set([
  "и",
  "в",
  "на",
  "не",
  "что",
  "как",
  "ты",
  "я",
  "мы",
  "он",
  "она",
  "они",
  "это",
  "то",
  "же",
  "ли",
  "бы",
  "вот",
  "ну",
  "да",
  "нет",
  "а",
  "но",
  "у",
  "с",
  "к",
  "о",
  "за",
  "из",
  "по",
  "мне",
  "тебе",
  "меня",
  "тебя",
  "мой",
  "твой",
  "very",
  "the",
]);

export function buildRetrievalQuery(message: string, context: ChatTurn[]): string {
  const parts = [message.trim()];
  const recent = context.slice(-6);
  for (const turn of recent) {
    if (turn.isMe) continue;
    const t = turn.text.trim();
    if (t.length >= 2 && t.length <= 120) parts.push(t);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function extractContextKeywords(context: ChatTurn[], limit = 12): string[] {
  const text = context
    .slice(-8)
    .map((t) => t.text)
    .join(" ")
    .toLowerCase();
  const words = text.split(/[^a-zа-яё0-9]+/u).filter((w) => w.length > 2);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (STOP_WORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

export function getRecentBotReplies(context: ChatTurn[], limit = 6): string[] {
  return context
    .filter((t) => t.isMe)
    .map((t) => t.text.toLowerCase().trim())
    .filter(Boolean)
    .slice(-limit);
}

export function getLastUserTurn(context: ChatTurn[]): ChatTurn | null {
  for (let i = context.length - 1; i >= 0; i--) {
    if (!context[i].isMe) return context[i];
  }
  return null;
}
