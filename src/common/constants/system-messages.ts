export const JOIN_SYSTEM_MESSAGES = [
  "padded into the room",
  "wandered in — hi everyone!",
  "joined the party",
  "trotted in on soft paws",
  "sniffed around and decided to stay",
] as const;

export const LEAVE_SYSTEM_MESSAGES = [
  "darted off somewhere",
  "went to chase a butterfly",
  "slipped out quietly",
  "wandered off to new adventures",
  "left to nap in the sun",
] as const;

export const EMOTION_SYSTEM_MESSAGES: Record<string, string> = {
  happy: "smiles",
  love: "is in love",
  laugh: "laughs",
  cool: "is cool",
  cry: "cries",
  angry: "is angry",
  sleep: "fell asleep",
};

export function pickSystemMessage<T extends string>(messages: readonly T[]): T {
  return messages[Math.floor(Math.random() * messages.length)];
}
