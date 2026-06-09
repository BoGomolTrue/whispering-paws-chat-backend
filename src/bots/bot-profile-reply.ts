import type { ChatIntent } from "./chat-intents.constant";
import { rand } from "./bot-utils";
import type { BotInstance } from "./bots.constants";

const FALLBACK_OPENERS = ["ну", "мм", "хм", "короче", "если честно"];

export function extractStyleOpener(styleReply: string): string | null {
  const t = styleReply.trim();
  const m = t.match(
    /^((?:ну|мм|да|ладно|хм|ээ|ого|вобщем|короче|слушай|если\s+честно)[,.!\s—-]+)/i,
  );
  if (m) return m[1].trim().replace(/[,.!\s—-]+$/, "");
  if (t.length <= 28 && t.split(/[.!?]/).length <= 2) return t;
  return null;
}

function applyStyle(text: string, styleReply?: string | null): string {
  const styled = styleReply ? extractStyleOpener(styleReply) : null;
  if (styled && Math.random() < 0.6) {
    return `${styled}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }
  if (Math.random() < 0.35) {
    const opener = FALLBACK_OPENERS[rand(0, FALLBACK_OPENERS.length - 1)];
    return `${opener}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }
  return text;
}

function trimLong(text: string, max = 220): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 80 ? cut.slice(0, lastSpace) : cut}…`;
}

function buildFullProfile(bot: BotInstance): string | null {
  const about = bot.anketa_about?.trim();
  const city = bot.anketa_city?.trim();
  const age = bot.anketa_age?.trim();
  const interests = bot.anketa_interests?.trim();
  const looking = bot.anketa_looking_for?.trim();
  if (!about && !city && !age && !interests && !looking) return null;

  const chunks: string[] = [];
  if (about) chunks.push(about);
  const meta: string[] = [];
  if (city) meta.push(city);
  if (age) meta.push(age);
  if (meta.length > 0) chunks.push(meta.join(", "));
  if (interests) chunks.push(interests);
  if (looking) chunks.push(`ищу ${looking}`);
  return chunks.join(". ").replace(/\.\s*\./g, ".").trim() || null;
}

export function buildBotProfileReply(
  bot: BotInstance,
  intent: ChatIntent = "about_self",
  styleReply?: string | null,
): string | null {
  let core: string | null = null;

  switch (intent) {
    case "ask_name":
      core = bot.nickname?.trim() || null;
      break;
    case "ask_age":
      core = bot.anketa_age?.trim() ? `мне ${bot.anketa_age}` : null;
      break;
    case "ask_location":
      core = bot.anketa_city?.trim() ? `из ${bot.anketa_city}` : null;
      break;
    case "ask_hobbies":
    case "ask_preferences":
      core = bot.anketa_interests?.trim() || null;
      break;
    case "ask_occupation":
      core =
        bot.anketa_about?.trim() ||
        bot.anketa_interests?.trim() ||
        null;
      break;
    case "about_self":
      core = buildFullProfile(bot);
      break;
    default:
      core = null;
      break;
  }

  if (!core) {
    if (intent !== "about_self") {
      core = buildFullProfile(bot);
    }
    if (!core) return null;
  }

  return trimLong(applyStyle(core, styleReply));
}
