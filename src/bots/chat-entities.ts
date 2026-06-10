export type ChatEntities = {
  date?: string;
  time?: string;
  location?: string;
  tokens: string[];
};

const RELATIVE_DATE: [RegExp, string][] = [
  [/вчера/i, "вчера"],
  [/сегодня/i, "сегодня"],
  [/завтра/i, "завтра"],
];

const TIME_RE =
  /(?:^|\s)(?:в\s+)?(\d{1,2})[:.\s](\d{2})(?:\s|$)|(?:^|\s)(?:в\s+)?(\d{1,2})\s*(?:час(?:а|ов)?|утра|дня|вечера|ночи)(?:\s|$)/iu;

const LOCATION_RE =
  /(?:^|\s)(?:где\s+ты\s+(?:был(?:а)?|жил(?:а)?|ходил(?:а)?)\s+)?(?:в|из|на)\s+([а-яё][а-яё\-]{2,}(?:\s+[а-яё][а-яё\-]{2,})?)/iu;

const CITY_HINT =
  /(?:^|\s)(?:в|из)\s+(москв\w*|спб|питер\w*|екб|екатеринбург\w*|новосиб\w*|казан\w*|самар\w*|ростов\w*|красноярск\w*|воронеж\w*|перм\w*|волгоград\w*|краснодар\w*)/iu;

export function extractChatEntities(text: string): ChatEntities {
  const tokens: string[] = [];
  let date: string | undefined;
  let time: string | undefined;
  let location: string | undefined;

  for (const [re, label] of RELATIVE_DATE) {
    if (re.test(text)) {
      date = label;
      tokens.push(label);
      break;
    }
  }

  const isoDate = text.match(
    /\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b/,
  );
  if (isoDate) {
    date = isoDate[0];
    tokens.push(isoDate[0]);
  }

  const tm = text.match(TIME_RE);
  if (tm) {
    if (tm[1] && tm[2]) {
      time = `${tm[1]}:${tm[2]}`;
    } else if (tm[3]) {
      time = `${tm[3]}:00`;
    }
    if (time) tokens.push(time);
  }

  const loc = text.match(LOCATION_RE);
  if (loc?.[1]) {
    location = loc[1].trim().toLowerCase();
    tokens.push(location);
  } else {
    const city = text.match(CITY_HINT);
    if (city?.[1]) {
      location = city[1].trim().toLowerCase();
      tokens.push(location);
    }
  }

  return { date, time, location, tokens };
}

export function mergeNlpEntities(
  base: ChatEntities,
  nlpEntities: Array<{
    entity?: string;
    utterance?: string;
    sourceText?: string;
  }>,
): ChatEntities {
  const out = { ...base, tokens: [...base.tokens] };
  for (const e of nlpEntities) {
    const name = String(e.entity ?? "").toLowerCase();
    const val = String(e.sourceText ?? e.utterance ?? "").trim();
    if (!val) continue;
    if (name.includes("date") && !out.date) {
      out.date = val;
      out.tokens.push(val);
    }
    if (name.includes("time") && !out.time) {
      out.time = val;
      out.tokens.push(val);
    }
    if (
      (name.includes("location") ||
        name.includes("place") ||
        name.includes("city")) &&
      !out.location
    ) {
      out.location = val.toLowerCase();
      out.tokens.push(out.location);
    }
  }
  return out;
}

export function buildEntityAwareReply(
  intent: string,
  message: string,
  entities: ChatEntities,
): string | null {
  const hasPast = entities.date === "вчера" || entities.date === "позавчера";

  if (intent === "ask_time") {
    if (hasPast && entities.time) {
      return `вчера в ${entities.time}? честно, не помню точно`;
    }
    if (hasPast) {
      return "вчера? не отслеживала время, если честно";
    }
    if (entities.time && !entities.date) {
      return `про ${entities.time}? не знаю, смотри на телефоне)`;
    }
    const now = new Date();
    const h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, "0");
    return `сейчас ${h}:${m}`;
  }

  if (intent === "ask_date") {
    if (entities.date) {
      return `про ${entities.date}? дата такая же как у всех)`;
    }
    const now = new Date();
    return `сегодня ${now.getDate()}.${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  if (intent === "ask_location") {
    if (entities.location && (hasPast || /был|была|ходил|жил/i.test(message))) {
      return `в ${entities.location}? не знаю, я тут в чате сижу`;
    }
    if (entities.location) {
      return `${entities.location}? не, я не там`;
    }
    if (hasPast && entities.time) {
      return `вчера в ${entities.time}? дома наверное, не помню`;
    }
  }

  return null;
}
