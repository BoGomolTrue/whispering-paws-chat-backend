import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";
import { SEED_BOTS } from "./seed-bots.data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const force = process.argv.includes("--force");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const roomRes = await client.query(
    `SELECT id FROM rooms WHERE name = 'General Room' LIMIT 1`,
  );
  if (!roomRes.rows[0]) {
    console.error("Комната General Room не найдена. Запусти сервер или миграции.");
    process.exit(1);
  }
  const roomId = roomRes.rows[0].id;
  const now = new Date();

  let inserted = 0;
  let skipped = 0;
  let updated = 0;

  function botFields(profile) {
    return {
      nickname: profile.nickname,
      roomId,
      characterType: profile.characterType,
      gender: profile.gender,
      eyeColor: profile.eyeColor,
      socketId: profile.socketId,
      status: profile.status ?? "",
      coins: profile.coins ?? 100,
      inventoryValue: profile.inventoryValue ?? 0,
      badges: JSON.stringify(profile.badges ?? []),
      ownedItems: JSON.stringify(profile.ownedItems ?? []),
      equipped: JSON.stringify(profile.equipped ?? {}),
      anketa_about: profile.anketa_about ?? null,
      anketa_city: profile.anketa_city ?? null,
      anketa_interests: profile.anketa_interests ?? null,
      anketa_age: profile.anketa_age ?? null,
      anketa_looking_for: profile.anketa_looking_for ?? null,
      statusPool: JSON.stringify(profile.statusPool ?? []),
      hidden: profile.hidden ?? true,
    };
  }

  for (const profile of SEED_BOTS) {
    const existing = await client.query(
      `SELECT id FROM bots WHERE "socketId" = $1`,
      [profile.socketId],
    );

    if (existing.rows[0] && !force) {
      console.log(`  skip ${profile.nickname} (уже в БД)`);
      skipped++;
      continue;
    }

    const f = botFields(profile);

    if (existing.rows[0] && force) {
      await client.query(
        `UPDATE bots SET
          nickname = $1, "roomId" = $2, "characterType" = $3, gender = $4,
          "eyeColor" = $5, status = $6, coins = $7, "inventoryValue" = $8,
          badges = $9, "ownedItems" = $10, equipped = $11,
          anketa_about = $12, anketa_city = $13, anketa_interests = $14,
          anketa_age = $15, anketa_looking_for = $16, "statusPool" = $17,
          hidden = $18, "updatedAt" = $19
        WHERE id = $20`,
        [
          f.nickname,
          f.roomId,
          f.characterType,
          f.gender,
          f.eyeColor,
          f.status,
          f.coins,
          f.inventoryValue,
          f.badges,
          f.ownedItems,
          f.equipped,
          f.anketa_about,
          f.anketa_city,
          f.anketa_interests,
          f.anketa_age,
          f.anketa_looking_for,
          f.statusPool,
          f.hidden,
          now,
          existing.rows[0].id,
        ],
      );
      console.log(`  update ${profile.nickname}`);
      updated++;
      continue;
    }

    await client.query(
      `INSERT INTO bots (
        nickname, "roomId", "characterType", gender, "eyeColor", "socketId",
        status, coins, "inventoryValue", badges, "ownedItems", equipped,
        anketa_about, anketa_city, anketa_interests, anketa_age, anketa_looking_for,
        "statusPool", hidden, "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17,
        $18, $19, $20, $21
      )`,
      [
        f.nickname,
        f.roomId,
        f.characterType,
        f.gender,
        f.eyeColor,
        f.socketId,
        f.status,
        f.coins,
        f.inventoryValue,
        f.badges,
        f.ownedItems,
        f.equipped,
        f.anketa_about,
        f.anketa_city,
        f.anketa_interests,
        f.anketa_age,
        f.anketa_looking_for,
        f.statusPool,
        f.hidden,
        now,
        now,
      ],
    );
    console.log(`  add ${profile.nickname}`);
    inserted++;
  }

  console.log(`\nГотово: +${inserted}, обновлено ${updated}, пропущено ${skipped}`);
  if (skipped > 0) console.log("Перезапись: npm run bots:seed:force");
  if (updated > 0 || inserted > 0) {
    console.log("Перезапусти backend — боты подхватят новые данные из БД.");
  }
} finally {
  await client.end();
}
