import { ConfigService } from "@nestjs/config";

export type BotTimingConfig = {
  enabled: boolean;
  replyChance: number;
  dialogueRunChance: number;
  ambientRunChance: number;
  dialogueMinMs: number;
  dialogueMaxMs: number;
  replyDelayMinMs: number;
  replyDelayMaxMs: number;
  cooldownMs: number;
  dmDelayMinMs: number;
  dmDelayMaxMs: number;
  mentionIgnoreChance: number;
  dmIgnoreChance: number;
  typingMinMs: number;
  typingMaxMs: number;
  moveMinMs: number;
  moveMaxMs: number;
  ambientMinMs: number;
  ambientMaxMs: number;
  dialogueTurnsMin: number;
  dialogueTurnsMax: number;
};

function envNum(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadBotTimingConfig(config: ConfigService): BotTimingConfig {
  return {
    enabled: config.get<string>("AI_BOTS") === "true",
    replyChance: envNum(config, "BOT_REPLY_CHANCE", 0.08),
    dialogueRunChance: envNum(config, "BOT_DIALOGUE_RUN_CHANCE", 0.35),
    ambientRunChance: envNum(config, "BOT_AMBIENT_RUN_CHANCE", 0.3),
    dialogueMinMs: envNum(config, "BOT_DIALOGUE_MIN_MS", 90_000),
    dialogueMaxMs: envNum(config, "BOT_DIALOGUE_MAX_MS", 240_000),
    replyDelayMinMs: envNum(config, "BOT_REPLY_DELAY_MIN_MS", 1_500),
    replyDelayMaxMs: envNum(config, "BOT_REPLY_DELAY_MAX_MS", 10_000),
    cooldownMs: envNum(config, "BOT_COOLDOWN_MS", 12_000),
    dmDelayMinMs: envNum(config, "BOT_DM_DELAY_MIN_MS", 2_000),
    dmDelayMaxMs: envNum(config, "BOT_DM_DELAY_MAX_MS", 12_000),
    mentionIgnoreChance: envNum(config, "BOT_MENTION_IGNORE_CHANCE", 0.1),
    dmIgnoreChance: envNum(config, "BOT_DM_IGNORE_CHANCE", 0.06),
    typingMinMs: envNum(config, "BOT_TYPING_MIN_MS", 400),
    typingMaxMs: envNum(config, "BOT_TYPING_MAX_MS", 2_500),
    moveMinMs: envNum(config, "BOT_MOVE_MIN_MS", 20_000),
    moveMaxMs: envNum(config, "BOT_MOVE_MAX_MS", 60_000),
    ambientMinMs: envNum(config, "BOT_AMBIENT_MIN_MS", 75_000),
    ambientMaxMs: envNum(config, "BOT_AMBIENT_MAX_MS", 180_000),
    dialogueTurnsMin: envNum(config, "BOT_DIALOGUE_TURNS_MIN", 2),
    dialogueTurnsMax: envNum(config, "BOT_DIALOGUE_TURNS_MAX", 2),
  };
}
