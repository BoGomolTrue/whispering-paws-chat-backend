import { NlpManager } from "node-nlp";
import type { DatasetIndex } from "./dataset-index";
import {
  extractChatEntities,
  mergeNlpEntities,
  type ChatEntities,
} from "./chat-entities";
import {
  ABOUT_SELF_RE,
  GREETING_ONLY_RE,
  GREETING_RE,
  INTENT_RULES,
} from "./chat-intent-rules";
import {
  CHAT_INTENTS,
  PROFILE_INTENTS,
  VALID_INTENTS,
  type ChatIntent,
} from "./chat-intents.constant";

export { CHAT_INTENTS, PROFILE_INTENTS, type ChatIntent } from "./chat-intents.constant";

const LANG = "ru";
const MIN_SCORE = 0.52;
const MODEL_PATH = "./model.nlp";

const ENTITY_TRAIN: { intent: ChatIntent; text: string }[] = [
  { intent: "ask_time", text: "который час" },
  { intent: "ask_time", text: "сколько времени" },
  { intent: "ask_time", text: "в %time% вечера где ты был" },
  { intent: "ask_time", text: "где ты был вчера в %time%" },
  { intent: "ask_date", text: "какое сегодня число" },
  { intent: "ask_date", text: "какая дата %date%" },
  { intent: "ask_date", text: "что было %date%" },
  { intent: "ask_location", text: "откуда ты" },
  { intent: "ask_location", text: "где ты живешь" },
  { intent: "ask_location", text: "ты из %location%" },
  { intent: "ask_location", text: "где ты был %date% в %location%" },
];

let manager: NlpManager | null = null;
let ready = false;

export function isAboutSelfQuestion(message: string): boolean {
  return ABOUT_SELF_RE.test(message.trim());
}

export function isProfileIntent(intent: ChatIntent): boolean {
  return (PROFILE_INTENTS as readonly string[]).includes(intent);
}

export function normalizeIntent(raw: string): ChatIntent {
  return VALID_INTENTS.has(raw) ? (raw as ChatIntent) : "small_talk";
}

export function detectScenarioRegex(message: string): ChatIntent {
  const lower = message.toLowerCase().trim();
  for (const { intent, re } of INTENT_RULES) {
    if (re.test(lower)) return intent;
  }
  return "small_talk";
}

export function isShortGreeting(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return GREETING_ONLY_RE.test(lower) || GREETING_RE.test(lower);
}

export async function initChatIntent(
  index?: DatasetIndex | null,
): Promise<void> {
  if (!index) {
    ready = false;
    manager = null;
    return;
  }

  const nlp = new NlpManager({
    languages: [LANG],
    forceNER: true,
    modelFileName: MODEL_PATH,
  });
  const seen = new Set<string>();

  nlp.addNamedEntityText("ru", "time", "ru", ["ru"], ["5 вечера", "17:00", "18:30", "7 утра"]);
  nlp.addNamedEntityText("ru", "date", "ru", ["ru"], ["вчера", "сегодня", "завтра", "позавчера"]);
  nlp.addNamedEntityText("ru", "location", "ru", ["ru"], [
    "москве",
    "москва",
    "спб",
    "питере",
    "екб",
    "новосибе",
    "казани",
  ]);

  for (const { intent, text } of ENTITY_TRAIN) {
    nlp.addDocument(LANG, text, intent);
  }

  for (const { intent, text } of index.sampleNlpDocs(150)) {
    const t = text.trim();
    if (t.length < 2) continue;
    const key = `${intent}:${t.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    nlp.addDocument(LANG, t, intent);
  }

  await nlp.train();
  manager = nlp;
  ready = true;
}

export function isChatIntentReady(): boolean {
  return ready;
}

export async function classifyIntent(
  message: string,
  opts?: { forceIntent?: ChatIntent },
): Promise<ChatIntent> {
  if (opts?.forceIntent) return opts.forceIntent;

  const regex = detectScenarioRegex(message);
  if (isShortGreeting(message)) return "greeting";
  if (isProfileIntent(regex)) return regex;
  if (regex !== "small_talk" && regex !== "general_question") return regex;
  if (!ready || !manager) return regex;
  const result = await manager.process(LANG, message);
  const intent = normalizeIntent(String(result.intent ?? ""));
  const score = Number(result.score ?? 0);
  if (score < MIN_SCORE) return regex;
  if (intent === "small_talk") return regex;
  return intent;
}

export async function extractMessageEntities(
  message: string,
): Promise<ChatEntities> {
  const base = extractChatEntities(message);
  if (!ready || !manager) return base;
  const result = await manager.process(LANG, message);
  const ents = (result.entities ?? []) as Array<{
    entity?: string;
    utterance?: string;
    sourceText?: string;
  }>;
  return mergeNlpEntities(base, ents);
}
