export const EMOTION_NAMES = [
  "happy",
  "smiled",
  "love",
  "heart",
  "cool",
  "surprised",
  "clown",
  "up",
  "down",
  "sad",
  "angry",
  "fier",
  "sleep",
  "poop",
  "neitral",
] as const;

export type EmotionName = (typeof EMOTION_NAMES)[number];

const EMOTION_SET = new Set<string>(EMOTION_NAMES);

const UNICODE_EMOTION: Record<string, EmotionName> = {
  "😀": "happy",
  "😃": "happy",
  "😄": "happy",
  "😁": "happy",
  "😊": "smiled",
  "🙂": "smiled",
  "☺": "smiled",
  "☺️": "smiled",
  "😍": "love",
  "🥰": "love",
  "😘": "love",
  "❤": "heart",
  "❤️": "heart",
  "💕": "heart",
  "💖": "heart",
  "💗": "heart",
  "👋": "happy",
  "🙋": "happy",
  "🙋‍♀️": "happy",
  "🙋‍♂️": "happy",
  "😢": "sad",
  "😭": "sad",
  "☹": "sad",
  "☹️": "sad",
  "😡": "angry",
  "🤬": "angry",
  "😠": "angry",
  "😴": "sleep",
  "💤": "sleep",
  "🔥": "cool",
  "😎": "cool",
  "🤡": "clown",
  "👍": "up",
  "👎": "down",
  "😮": "surprised",
  "😲": "surprised",
  "😯": "surprised",
  "😐": "neitral",
  "😑": "neitral",
  "💩": "poop",
};

const UNICODE_RE =
  /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/gu;

const EMOTION_TAG_RE = /:(\w+):/g;

function isEmotionName(name: string): name is EmotionName {
  return EMOTION_SET.has(name);
}

function emotionTag(name: EmotionName): string {
  return `:${name}:`;
}

function replaceUnicodeEmotions(text: string, useCustom: boolean): string {
  return text.replace(UNICODE_RE, (char) => {
    const mapped = UNICODE_EMOTION[char];
    if (mapped) return useCustom ? emotionTag(mapped) : "";
    return "";
  });
}

function convertTrailingTextSmileys(text: string): string {
  let out = text.trimEnd();
  const parenMatch = out.match(/\)+$/);
  if (parenMatch) {
    const tag = parenMatch[0].length >= 2 ? "happy" : "smiled";
    out = out.slice(0, -parenMatch[0].length).trimEnd();
    return `${out} ${emotionTag(tag)}`.trim();
  }
  if (out.endsWith("(")) {
    out = out.slice(0, -1).trimEnd();
    return `${out} ${emotionTag("sad")}`.trim();
  }
  return out;
}

function sanitizeEmotionTags(text: string): string {
  return text.replace(EMOTION_TAG_RE, (full, name: string) =>
    isEmotionName(name) ? full : "",
  );
}

function stripEmotionTags(text: string): string {
  return text.replace(EMOTION_TAG_RE, "");
}

export function applyBotEmotions(text: string, useCustom: boolean): string {
  let out = replaceUnicodeEmotions(text, useCustom);
  if (useCustom) {
    out = convertTrailingTextSmileys(out);
    out = sanitizeEmotionTags(out);
  } else {
    out = stripEmotionTags(out);
  }
  return out.replace(/\s+/g, " ").trim();
}
