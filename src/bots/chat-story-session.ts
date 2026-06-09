const STORY_TTL_MS = 12 * 60 * 1000;
const STORY_TURNS = 3;

const STOP = new Set([
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
  "это",
  "то",
  "же",
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
  "был",
  "была",
  "было",
  "есть",
  "был",
  "today",
  "the",
]);

export type StorySession = {
  storyText: string;
  keywords: string[];
  turnsLeft: number;
  expiresAt: number;
};

const sessions = new Map<string, StorySession>();

const CONTINUATION_RE =
  /^(?:и\s+что|и\s+дальше|и\s+потом|продолжай|рассказывай|ого|жесть|да\s+ладно|понятно|интересно|угу|ну|да|прям|серьёзно|реально|круто|страшно|жалко|фу|блин|ахах|лол|мда|ясно|ясненько)(?:[\s!?.…,)]+|$)/iu;

export function storySessionKey(roomOrDm: string, userKey: string): string {
  return `${roomOrDm}:${userKey}`;
}

function extractStoryKeywords(text: string, limit = 14): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

export function openStorySession(key: string, userText: string): void {
  const text = userText.trim();
  if (text.length < 8) return;
  sessions.set(key, {
    storyText: text,
    keywords: extractStoryKeywords(text),
    turnsLeft: STORY_TURNS,
    expiresAt: Date.now() + STORY_TTL_MS,
  });
}

export function peekStorySession(key: string): StorySession | null {
  const s = sessions.get(key);
  if (!s) return null;
  if (Date.now() > s.expiresAt || s.turnsLeft <= 0) {
    sessions.delete(key);
    return null;
  }
  return s;
}

export function closeStorySession(key: string): void {
  sessions.delete(key);
}

export function markStoryBotReply(key: string): void {
  const s = peekStorySession(key);
  if (!s) return;
  s.turnsLeft -= 1;
  if (s.turnsLeft <= 0) sessions.delete(key);
}

export function isStoryContinuation(message: string): boolean {
  const t = message.trim();
  if (t.length <= 35 && CONTINUATION_RE.test(t)) return true;
  if (t.length <= 18 && !t.includes("?")) return true;
  return false;
}

export function shouldContinueStory(
  key: string,
  message: string,
  intent: string,
): boolean {
  const session = peekStorySession(key);
  if (!session) return false;
  if (intent === "sharing_personal_story") return true;
  if (intent === "change_topic" || intent === "farewell") {
    closeStorySession(key);
    return false;
  }
  return isStoryContinuation(message);
}
