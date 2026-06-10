import {
  buildRetrievalQuery,
  extractContextKeywords,
  getRecentBotReplies,
  type ChatTurn,
} from "./chat-context";
import { buildEntityAwareReply } from "./chat-entities";
import {
  classifyIntent,
  detectScenarioRegex,
  extractMessageEntities,
  isProfileIntent,
  type ChatIntent,
} from "./chat-intent";
import {
  alignReplyGender,
  resolveBotGender,
  type BotSpeechGender,
} from "./bot-gender";
import { buildBotProfileReply } from "./bot-profile-reply";
import {
  isStoryContinuation,
  markStoryBotReply,
  openStorySession,
  peekStorySession,
  shouldContinueStory,
} from "./chat-story-session";
import { humanizeBotText, rand } from "./bot-utils";
import type { BotInstance } from "./bots.constants";
import type { DatasetIndex, SearchOptions } from "./dataset-index";

const FALLBACK_INTENTS: ChatIntent[] = [
  "small_talk",
  "general_question",
  "agreement",
];

const LOW_HUMANIZE: ChatIntent[] = [
  "about_self",
  "ask_name",
  "ask_age",
  "ask_location",
  "ask_occupation",
  "ask_hobbies",
  "ask_preferences",
  "sharing_personal_story",
];

const ENTITY_INTENTS: ChatIntent[] = ["ask_time", "ask_date", "ask_location"];

const EMOJI_INTENTS = new Set<ChatIntent>([
  "greeting",
  "expressing_excitement",
  "react_to_joke",
  "compliment",
  "thanks",
  "farewell",
  "playful_teasing",
  "flirting",
  "expressing_affection",
  "sharing_personal_story",
]);

function preserveEmoji(scenario: ChatIntent): boolean {
  return EMOJI_INTENTS.has(scenario);
}

function buildSearchOptions(
  message: string,
  context: ChatTurn[],
  bot?: BotInstance | null,
  story?: { storyText: string; keywords: string[] } | null,
): SearchOptions {
  const contextQuery = story
    ? `${story.storyText} ${buildRetrievalQuery(message, context)}`.trim()
    : buildRetrievalQuery(message, context);
  const contextKeywords = [
    ...extractContextKeywords(context),
    ...(story?.keywords ?? []),
  ].slice(0, 16);

  return {
    contextQuery,
    contextKeywords,
    avoidReplies: getRecentBotReplies(context),
    botGender: bot ? resolveBotGender(bot.gender) : undefined,
    storyKeywords: story?.keywords,
    storyText: story?.storyText,
  };
}

function tryHumanized(
  reply: string,
  scenario: ChatIntent,
  botGender?: BotSpeechGender,
): string {
  const chance = LOW_HUMANIZE.includes(scenario) ? 0.22 : 0.34;
  let out = humanizeBotText(reply, chance, preserveEmoji(scenario));
  if (!out) return "";
  if (botGender) out = alignReplyGender(out, botGender);
  return out;
}

async function searchScenario(
  index: DatasetIndex,
  message: string,
  scenario: ChatIntent,
  options: SearchOptions,
): Promise<string> {
  const ranked = index.searchRanked(message, scenario, options);
  if (ranked.length === 0) return "";
  const pick = index.pickWeightedReply(ranked, options.botGender);
  return tryHumanized(pick, scenario, options.botGender);
}

function finishStoryReply(
  sessionKey: string | undefined,
  hadStory: boolean,
  text: string,
): string {
  if (sessionKey && hadStory && text) markStoryBotReply(sessionKey);
  return text;
}

export async function pickRetrievalReply(
  message: string,
  stylePhrases: string[],
  index?: DatasetIndex | null,
  bot?: BotInstance | null,
  context: ChatTurn[] = [],
  sessionKey?: string,
): Promise<string> {
  const botGender = bot ? resolveBotGender(bot.gender) : undefined;
  const trimmed = message.trim();
  if (!trimmed && context.length > 0) {
    const last = [...context].reverse().find((t) => !t.isMe);
    if (last) message = last.text;
  }
  if (!message.trim()) {
    if (bot) {
      const profile = buildBotProfileReply(bot);
      if (profile) return profile;
    }
    if (stylePhrases.length > 0) {
      let out = humanizeBotText(
        stylePhrases[rand(0, stylePhrases.length - 1)],
        0.34,
        true,
      );
      if (out && botGender) out = alignReplyGender(out, botGender);
      return out;
    }
    return "";
  }

  const regexIntent = detectScenarioRegex(message);
  let storySession = sessionKey ? peekStorySession(sessionKey) : null;

  if (sessionKey && regexIntent === "sharing_personal_story") {
    openStorySession(sessionKey, message);
    storySession = peekStorySession(sessionKey);
  }

  let forceIntent: ChatIntent | undefined;
  if (
    sessionKey &&
    storySession &&
    (shouldContinueStory(sessionKey, message, regexIntent) ||
      isStoryContinuation(message))
  ) {
    forceIntent = "sharing_personal_story";
  }

  const scenario = await classifyIntent(message, { forceIntent });
  const storyActive = Boolean(storySession);
  const options = buildSearchOptions(message, context, bot, storySession);

  if (ENTITY_INTENTS.includes(scenario)) {
    const entities = await extractMessageEntities(message);
    const entityReply = buildEntityAwareReply(scenario, message, entities);
    if (entityReply) {
      const out = tryHumanized(entityReply, scenario, botGender);
      if (out) return finishStoryReply(sessionKey, storyActive, out);
    }
  }

  if (bot && isProfileIntent(scenario)) {
    const style = index?.sampleStyleReply(scenario, 42, options.botGender);
    const profile = buildBotProfileReply(bot, scenario, style);
    if (profile) return finishStoryReply(sessionKey, storyActive, profile);
  }

  if (index) {
    let reply = await searchScenario(index, message, scenario, options);
    if (reply) return finishStoryReply(sessionKey, storyActive, reply);

    for (const fallback of FALLBACK_INTENTS) {
      if (fallback === scenario) continue;
      reply = await searchScenario(index, message, fallback, options);
      if (reply) return finishStoryReply(sessionKey, storyActive, reply);
    }

    if (storyActive) {
      reply = await searchScenario(
        index,
        message,
        "sharing_personal_story",
        options,
      );
      if (reply) return finishStoryReply(sessionKey, storyActive, reply);
    }

    const casualRanked = index.searchRanked(message, "small_talk", options);
    if (casualRanked.length > 0) {
      const pick = index.pickWeightedReply(casualRanked, options.botGender);
      const humanized = tryHumanized(pick, "small_talk", options.botGender);
      if (humanized)
        return finishStoryReply(sessionKey, storyActive, humanized);
    }
  }

  if (bot && isProfileIntent(scenario)) {
    const profile = buildBotProfileReply(bot, scenario);
    if (profile) return finishStoryReply(sessionKey, storyActive, profile);
  }

  const random = index?.randomReply(scenario);
  if (random) {
    const humanized = tryHumanized(random, scenario, botGender);
    if (humanized) return finishStoryReply(sessionKey, storyActive, humanized);
  }

  if (stylePhrases.length > 0) {
    let out = humanizeBotText(
      stylePhrases[rand(0, stylePhrases.length - 1)],
      0.34,
      preserveEmoji(scenario),
    );
    if (out && botGender) out = alignReplyGender(out, botGender);
    return finishStoryReply(sessionKey, storyActive, out);
  }

  return "";
}
