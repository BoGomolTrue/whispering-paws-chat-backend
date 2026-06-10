import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sqlite = require("better-sqlite3") as typeof import("better-sqlite3");
import { createReadStream } from "fs";
import * as fs from "fs";
import * as path from "path";
import { createInterface } from "readline";
import {
  detectScenarioRegex,
  isShortGreeting,
  normalizeIntent,
  CHAT_INTENTS,
  type ChatIntent,
} from "./chat-intent";
import {
  isOppositeGender,
  scoreReplyGenderFit,
  type BotSpeechGender,
} from "./bot-gender";

export type StylePair = { user: string; reply: string };

export type RankedPair = StylePair & { score: number };

export type SearchOptions = {
  contextQuery?: string;
  contextKeywords?: string[];
  avoidReplies?: string[];
  botGender?: BotSpeechGender;
  storyKeywords?: string[];
  storyText?: string;
};

export const INDEX_SCHEMA_VERSION = 4;

const SKIP_TEXT = /^(gifted |joined |left$|padded |wandered |changed )/i;
const DATASET_EXT = new Set([".jsonl", ".json"]);
const BATCH = 5000;

export const DEFAULT_DATASETS_DIR = "./data/datasets";
export const DEFAULT_INDEX_PATH = "./data/datasets/.cache/retrieval.db";

export function listDatasetFiles(dirPath: string): string[] {
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(resolved)
    .filter((name) => DATASET_EXT.has(path.extname(name).toLowerCase()))
    .map((name) => path.join(resolved, name))
    .sort();
}

export type IndexBuildOptions = {
  onlyRelevant?: boolean;
  onProgress?: (info: {
    file: string;
    scanned: number;
    inserted: number;
  }) => void;
};

function isUsableUser(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 120) return false;
  if (SKIP_TEXT.test(t)) return false;
  return true;
}

const LONG_REPLY_INTENTS = new Set<ChatIntent>([
  "about_self",
  "sharing_personal_story",
  "sharing_daily_routine",
  "general_question",
  "ask_for_advice",
  "ask_opinion",
  "ask_for_recommendation",
  "tell_joke",
  "ask_occupation",
  "ask_hobbies",
  "ask_preferences",
]);

const QUESTION_REPLY_INTENTS = new Set<ChatIntent>([
  "general_question",
  "ask_opinion",
  "ask_for_advice",
  "ask_for_recommendation",
  "ask_for_clarification",
  "rhetorical_question",
  "turing_test",
]);

function isUsableReply(text: string, intent: ChatIntent): boolean {
  const t = text.trim();
  const maxLen = LONG_REPLY_INTENTS.has(intent) ? 220 : 100;
  if (t.length < 2 || t.length > maxLen) return false;
  if (!QUESTION_REPLY_INTENTS.has(intent) && t.includes("?")) return false;
  if (SKIP_TEXT.test(t)) return false;
  return true;
}

export function parseDatasetRow(
  row: Record<string, unknown>,
  onlyRelevant: boolean,
): (StylePair & { intent: ChatIntent }) | null {
  if (onlyRelevant && row.relevance !== undefined && row.relevance !== 1) {
    return null;
  }
  const user = String(row.user ?? row.question ?? row.input ?? "").trim();
  const reply = String(row.reply ?? row.answer ?? row.output ?? "").trim();
  const intent =
    row.intent != null && String(row.intent).trim()
      ? normalizeIntent(String(row.intent))
      : detectScenarioRegex(user);
  if (!isUsableUser(user) || !isUsableReply(reply, intent)) return null;
  return { user, reply, intent };
}

function fileFingerprint(filePath: string): { size: number; mtime: number } {
  const stat = fs.statSync(filePath);
  return { size: stat.size, mtime: stat.mtimeMs };
}

function manifestPath(dbPath: string): string {
  return path.join(path.dirname(dbPath), "manifest.json");
}

function readManifest(
  dbPath: string,
): Record<string, { size: number; mtime: number }> {
  const p = manifestPath(dbPath);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<
      string,
      { size: number; mtime: number }
    >;
  } catch {
    return {};
  }
}

function writeManifest(
  dbPath: string,
  files: string[],
  meta: { totalScanned: number; totalInserted: number },
): void {
  const manifest: Record<string, { size: number; mtime: number }> = {};
  for (const f of files) {
    manifest[path.basename(f)] = fileFingerprint(f);
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(
    manifestPath(dbPath),
    JSON.stringify(
      { ...manifest, _meta: meta, _schemaVersion: INDEX_SCHEMA_VERSION },
      null,
      0,
    ),
  );
}

export function needsIndexRebuild(dbPath: string, files: string[]): boolean {
  if (!fs.existsSync(dbPath)) return true;
  const prev = readManifest(dbPath) as Record<string, unknown>;
  if (prev._schemaVersion !== INDEX_SCHEMA_VERSION) return true;
  for (const f of files) {
    const name = path.basename(f);
    const cur = fileFingerprint(f);
    const old = prev[name] as { size: number; mtime: number } | undefined;
    if (!old || old.size !== cur.size || old.mtime !== cur.mtime) return true;
  }
  return false;
}

function createSchema(db: SqliteDatabase): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    DROP TABLE IF EXISTS pairs_fts;
    DROP TABLE IF EXISTS pairs;
    CREATE TABLE pairs (
      id INTEGER PRIMARY KEY,
      user TEXT NOT NULL,
      reply TEXT NOT NULL,
      intent TEXT NOT NULL
    );
    CREATE INDEX idx_pairs_intent ON pairs(intent);
    CREATE VIRTUAL TABLE pairs_fts USING fts5(
      user,
      reply,
      content='pairs',
      content_rowid='id',
      tokenize='unicode61'
    );
  `);
}

function finalizeFts(db: SqliteDatabase): void {
  db.exec(
    `INSERT INTO pairs_fts(rowid, user, reply) SELECT id, user, reply FROM pairs`,
  );
}

async function ingestJsonl(
  filePath: string,
  db: SqliteDatabase,
  insert: Statement,
  onlyRelevant: boolean,
  onProgress?: IndexBuildOptions["onProgress"],
): Promise<{ scanned: number; inserted: number }> {
  let scanned = 0;
  let inserted = 0;
  let batch: { user: string; reply: string; intent: string }[] = [];

  const flush = () => {
    if (batch.length === 0) return;
    const tx = db.transaction((rows: typeof batch) => {
      for (const r of rows) insert.run(r.user, r.reply, r.intent);
    });
    tx(batch);
    inserted += batch.length;
    batch = [];
  };

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    scanned++;
    const lineTrim = line.trim();
    if (!lineTrim) continue;
    try {
      const row = JSON.parse(lineTrim) as Record<string, unknown>;
      const pair = parseDatasetRow(row, onlyRelevant);
      if (!pair) continue;
      batch.push({
        user: pair.user,
        reply: pair.reply,
        intent: pair.intent,
      });
      if (batch.length >= BATCH) flush();
    } catch {
      continue;
    }
    if (scanned % 100_000 === 0) {
      flush();
      onProgress?.({
        file: path.basename(filePath),
        scanned,
        inserted,
      });
    }
  }

  flush();
  onProgress?.({ file: path.basename(filePath), scanned, inserted });
  return { scanned, inserted };
}

export async function buildDatasetIndex(
  dirPath: string,
  dbPath: string = DEFAULT_INDEX_PATH,
  options: IndexBuildOptions = {},
): Promise<{ scanned: number; inserted: number; files: string[] }> {
  const onlyRelevant = options.onlyRelevant !== false;
  const files = listDatasetFiles(dirPath);
  if (files.length === 0) {
    return { scanned: 0, inserted: 0, files: [] };
  }

  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Sqlite(dbPath);
  createSchema(db);
  const insert = db.prepare(
    "INSERT INTO pairs (user, reply, intent) VALUES (?, ?, ?)",
  );

  let totalScanned = 0;
  let totalInserted = 0;

  for (const file of files) {
    if (file.endsWith(".jsonl")) {
      const r = await ingestJsonl(
        file,
        db,
        insert,
        onlyRelevant,
        options.onProgress,
      );
      totalScanned += r.scanned;
      totalInserted += r.inserted;
    }
  }

  finalizeFts(db);
  writeManifest(dbPath, files, {
    totalScanned,
    totalInserted: totalInserted,
  });
  db.close();

  return { scanned: totalScanned, inserted: totalInserted, files };
}

export class DatasetIndex {
  private db: SqliteDatabase;
  private searchStmt: Statement;
  private intentStmt: Statement;
  private randomReplyStmt: Statement;
  private nlpSampleStmt: Statement;

  constructor(dbPath: string = DEFAULT_INDEX_PATH) {
    this.db = new Sqlite(dbPath, { readonly: true });
    this.searchStmt = this.db.prepare(`
      SELECT p.user, p.reply, p.intent
      FROM pairs_fts f
      JOIN pairs p ON p.id = f.rowid
      WHERE pairs_fts MATCH ?
      LIMIT 80
    `);
    this.intentStmt = this.db.prepare(`
      SELECT user, reply FROM pairs
      WHERE intent = ?
      ORDER BY RANDOM()
      LIMIT 1
    `);
    this.randomReplyStmt = this.db.prepare(`
      SELECT reply FROM pairs ORDER BY RANDOM() LIMIT 1
    `);
    this.nlpSampleStmt = this.db.prepare(`
      SELECT user FROM pairs
      WHERE intent = ?
      ORDER BY RANDOM()
      LIMIT ?
    `);
  }

  getStats(): { pairs: number } {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM pairs").get() as {
      c: number;
    };
    return { pairs: row.c };
  }

  private scorePair(
    msg: string,
    scenario: string,
    row: { user: string; reply: string; intent: string },
    options: SearchOptions = {},
  ): number {
    const userL = row.user.toLowerCase().trim();
    const replyL = row.reply.toLowerCase().trim();
    let score = 0;

    if (options.avoidReplies?.some((r) => r === replyL || replyL.includes(r))) {
      return -1;
    }

    if (row.intent === scenario) score += 10;
    else if (row.intent === "small_talk" && scenario !== "small_talk")
      score += 1;
    else if (row.intent !== scenario) score -= 4;

    if (userL === msg) score += 24;
    else if (userL.startsWith(msg) || msg.startsWith(userL)) score += 12;

    const msgWords = msg.split(/[^a-zа-яё0-9]+/u).filter((w) => w.length > 1);
    for (const w of msgWords) {
      if (userL.includes(w)) score += 3;
      if (replyL.includes(w)) score += 1;
    }

    for (const kw of options.contextKeywords ?? []) {
      if (userL.includes(kw)) score += 2;
      if (replyL.includes(kw)) score += 1;
    }

    if (options.botGender) {
      score += scoreReplyGenderFit(row.reply, options.botGender);
    }

    if (
      scenario === "sharing_personal_story" &&
      options.storyKeywords?.length
    ) {
      for (const kw of options.storyKeywords) {
        if (replyL.includes(kw)) score += 5;
        if (userL.includes(kw)) score += 3;
      }
      if (
        /рассказ|слуша|ого|жесть|интерес|понят|жалко|круто|страш|продолж|дальше/i.test(
          replyL,
        )
      ) {
        score += 6;
      }
    }

    if (options.storyKeywords?.length) {
      for (const kw of options.storyKeywords) {
        if (replyL.includes(kw)) score += 4;
      }
    }

    score -= row.reply.length / 14;

    if (scenario === "greeting" || isShortGreeting(msg)) {
      if (row.reply.length > 50) score -= 25;
      if (row.user.length > 35) score -= 15;
      if (row.reply.length <= 20) score += 8;
      if (/^(прив|привет|хай|йо|здаров|салют|хей|ку)/i.test(replyL))
        score += 12;
    }

    if (scenario === "about_self") {
      if (row.reply.length < 18) score -= 30;
      if (row.reply.length >= 40) score += 10;
      if (row.reply.length >= 80) score += 6;
      if (/^(да|нет|ок|ага|угу|не|хз)\b/i.test(replyL)) score -= 20;
    }

    if (scenario === "how_are_you" || scenario === "checking_in") {
      if (row.reply.length > 60) score -= 12;
      if (/норм|нормально|ок|неплох|так\s+себе|ты\s+как|тут/i.test(replyL))
        score += 10;
    }

    if (
      scenario === "thanks" ||
      scenario === "gift_giving" ||
      scenario === "gift_receiving"
    ) {
      if (row.reply.length > 55) score -= 15;
      if (/спасиб|не\s+за\s+что|пожал|ого/i.test(replyL)) score += 8;
    }

    if (scenario === "farewell") {
      if (row.reply.length > 45) score -= 12;
      if (/пока|bb|бб|удачи|увид/i.test(replyL)) score += 8;
    }

    if (scenario === "compliment" || scenario === "expressing_affection") {
      if (/спасиб|благодар|ты\s+тоже|смущ|мило/i.test(replyL)) score += 8;
    }

    if (scenario === "expressing_boredom") {
      if (/скучн|соглас|да\s+тут|тоже|можно\s+поболт/i.test(replyL)) score += 6;
    }

    if (
      scenario === "expressing_sadness" ||
      scenario === "expressing_loneliness" ||
      scenario === "expressing_stress"
    ) {
      if (/понима|держ|обним|сочув|эх/i.test(replyL)) score += 6;
    }

    if (scenario === "expressing_anger" || scenario === "insult") {
      if (row.reply.length > 65) score -= 10;
    }

    if (scenario === "apology" || scenario === "forgiveness") {
      if (/ничего|ладно|ок|забуд|не\s+страш/i.test(replyL)) score += 8;
    }

    if (scenario === "agreement" || scenario === "disagreement") {
      if (row.reply.length > 40) score -= 8;
    }

    if (scenario === "bot_accusation" || scenario === "turing_test") {
      if (row.reply.length > 70) score -= 15;
      if (/не\s+бот|чё\s+ты|серьёз|человек/i.test(replyL)) score += 8;
      if (/нейросет|языков|модел/i.test(replyL)) score -= 30;
    }

    if (scenario === "inappropriate_content" || scenario === "ask_for_money") {
      if (/нет|не\s+буд|не\s+дел|без\s+этого/i.test(replyL)) score += 10;
    }

    if (
      scenario === "general_question" ||
      scenario === "ask_opinion" ||
      scenario === "ask_for_advice"
    ) {
      if (row.reply.length < 8) score -= 10;
      if (row.reply.length > 140) score -= 8;
    }

    if (scenario === "nonsense" || scenario === "spam") {
      if (row.reply.length <= 25) score += 6;
    }

    return score;
  }

  private collectCandidates(
    rows: { user: string; reply: string; intent: string }[],
    msg: string,
    scenario: string,
    candidates: Map<string, RankedPair>,
    options: SearchOptions,
  ): void {
    for (const row of rows) {
      const score = this.scorePair(msg, scenario, row, options);
      if (score <= 0) continue;
      const key = `${row.user}→${row.reply}`;
      const prev = candidates.get(key);
      if (!prev || score > prev.score) {
        candidates.set(key, { user: row.user, reply: row.reply, score });
      }
    }
  }

  searchRanked(
    message: string,
    scenario: string,
    options: SearchOptions = {},
  ): RankedPair[] {
    const msg = message.toLowerCase().trim();
    const contextMsg = (options.contextQuery ?? message).toLowerCase().trim();
    const candidates = new Map<string, RankedPair>();

    const shortGreeting = isShortGreeting(msg);
    const longReply = LONG_REPLY_INTENTS.has(scenario as ChatIntent);
    const isQuestion = scenario === "general_question";
    const maxUserLen = shortGreeting
      ? 25
      : longReply
        ? 100
        : isQuestion
          ? 90
          : 80;
    const maxReplyLen = shortGreeting
      ? 40
      : longReply
        ? 220
        : isQuestion
          ? 140
          : 100;

    const intentRows = this.db
      .prepare(
        `SELECT user, reply, intent FROM pairs
         WHERE intent = ?
         AND length(user) <= ?
         AND length(reply) <= ?
         ORDER BY length(user) ASC, length(reply) ASC
         LIMIT 80`,
      )
      .all(scenario, maxUserLen, maxReplyLen) as {
      user: string;
      reply: string;
      intent: string;
    }[];
    this.collectCandidates(intentRows, msg, scenario, candidates, options);

    const tokenSource = contextMsg.length > msg.length ? contextMsg : msg;
    const tokens = tokenSource
      .split(/[^a-zа-яё0-9]+/u)
      .filter((w) => w.length > 1)
      .slice(0, 10);

    if (tokens.length > 0) {
      const query = tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
      try {
        const ftsRows = this.searchStmt.all(query) as {
          user: string;
          reply: string;
          intent: string;
        }[];
        this.collectCandidates(ftsRows, msg, scenario, candidates, options);
      } catch {
        // FTS syntax edge case
      }
    }

    if (candidates.size === 0) {
      const row = this.intentStmt.get(scenario) as
        | { user: string; reply: string }
        | undefined;
      if (row) return [{ user: row.user, reply: row.reply, score: 5 }];
      return [];
    }

    return [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
  }

  pickWeightedReply(ranked: RankedPair[], botGender?: BotSpeechGender): string {
    let top = ranked.slice(0, 12);
    if (botGender) {
      const matched = top.filter((c) => !isOppositeGender(c.reply, botGender));
      if (matched.length > 0) top = matched;
    }
    top = top.slice(0, 8);
    if (top.length === 0) return "";
    if (top.length === 1) return top[0].reply;
    const weights = top.map((c, i) =>
      Math.max(1, c.score + (top.length - i) * 2),
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * sum;
    for (let i = 0; i < top.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return top[i].reply;
    }
    return top[0].reply;
  }

  sampleStyleReply(
    scenario: string,
    maxLen = 42,
    botGender?: BotSpeechGender,
  ): string | null {
    const rows = this.db
      .prepare(
        `SELECT reply FROM pairs
         WHERE intent = ?
         AND length(reply) <= ?
         AND length(reply) >= 6
         ORDER BY RANDOM()
         LIMIT 12`,
      )
      .all(scenario, maxLen) as { reply: string }[];
    if (rows.length === 0) return null;
    if (botGender) {
      const matched = rows.filter((r) => !isOppositeGender(r.reply, botGender));
      if (matched.length > 0) return matched[0].reply;
    }
    return rows[0].reply;
  }

  search(
    message: string,
    scenario: string,
    options: SearchOptions = {},
  ): StylePair[] {
    return this.searchRanked(message, scenario, options).map(
      ({ user, reply }) => ({ user, reply }),
    );
  }

  randomReply(scenario?: string): string {
    if (scenario) {
      const row = this.intentStmt.get(scenario) as
        | { user: string; reply: string }
        | undefined;
      if (row) return row.reply;
    }
    const row = this.randomReplyStmt.get() as { reply: string } | undefined;
    return row?.reply ?? "";
  }

  randomUser(): string {
    const row = this.db
      .prepare("SELECT user FROM pairs ORDER BY RANDOM() LIMIT 1")
      .get() as { user: string } | undefined;
    return row?.user ?? "";
  }

  sampleReplies(limit: number): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT reply FROM pairs ORDER BY RANDOM() LIMIT ?")
      .all(limit) as { reply: string }[];
    return rows.map((r) => r.reply);
  }

  sampleNlpDocs(maxPerIntent: number): { intent: string; text: string }[] {
    const docs: { intent: string; text: string }[] = [];
    for (const intent of CHAT_INTENTS) {
      const rows = this.nlpSampleStmt.all(intent, maxPerIntent) as {
        user: string;
      }[];
      for (const row of rows) {
        docs.push({ intent, text: row.user });
      }
    }
    return docs;
  }

  close(): void {
    this.db.close();
  }
}

export async function ensureDatasetIndex(
  dirPath: string,
  dbPath: string = DEFAULT_INDEX_PATH,
  options: IndexBuildOptions = {},
): Promise<{ index: DatasetIndex | null; rebuilt: boolean }> {
  const files = listDatasetFiles(dirPath);
  if (files.length === 0) return { index: null, rebuilt: false };

  const rebuilt = needsIndexRebuild(dbPath, files);
  if (rebuilt) {
    await buildDatasetIndex(dirPath, dbPath, options);
  }

  if (!fs.existsSync(dbPath)) return { index: null, rebuilt };
  return { index: new DatasetIndex(dbPath), rebuilt };
}
