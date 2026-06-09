import { applyBotEmotions } from "./bot-emotions";

const AI_GIVEAWAYS = [
  /как (?:ии|искусственный|нейросет)/i,
  /я (?:бот|нейросеть|языковая модель)/i,
  /я не бот/i,
  /нет,?\s*я просто/i,
  /почему спрашива/i,
  /не могу помочь с этим/i,
  /рад(?:а)? помочь/i,
  /конечно[!,]/i,
  /отличный вопрос/i,
];

export function humanizeBotText(
  text: string,
  lowercaseChance = 0.25,
  preserveEmoji = false,
): string {
  let out = text.trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("«") && out.endsWith("»"))
  ) {
    out = out.slice(1, -1).trim();
  }
  out = out.replace(/^\w+:\s*/u, "");
  out = applyBotEmotions(out, preserveEmoji);
  out = out.replace(/\s+/g, " ").trim();
  for (const re of AI_GIVEAWAYS) {
    if (re.test(out)) return "";
  }
  out = stripQuestions(out);
  if (!out) return "";
  if (out.length > 220) {
    const cut = out.slice(0, 200);
    const lastSpace = cut.lastIndexOf(" ");
    out = (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim();
  }
  if (Math.random() < lowercaseChance && out.length > 2) {
    out = out.charAt(0).toLowerCase() + out.slice(1);
  }
  return out;
}

function stripQuestions(text: string): string {
  if (!text.includes("?")) return text;
  const beforeQ = text.split("?")[0].trim();
  const parts = beforeQ
    .split(/[,;]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const declarative = parts.filter(
    (p) => !/^(что|как|почему|зачем|когда|где|кто|а |ну а)\b/i.test(p),
  );
  if (declarative.length > 0) return declarative.join(", ").trim();
  return beforeQ
    .replace(/\b(что случилось|почему|зачем|как дела)\b/gi, "")
    .trim();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
