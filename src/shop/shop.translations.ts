// Переводы названий категорий и предметов магазина
export type Locale = "en" | "ru";

export interface ShopTranslations {
  categories: Record<string, Record<Locale, string>>;
  items: Record<string, Record<Locale, string>>;
}

export const SHOP_TRANSLATIONS: ShopTranslations = {
  categories: {
    "My items": { en: "My items", ru: "Мои вещи" },
    Clothing: { en: "Clothing", ru: "Одежда" },
    Hats: { en: "Hats", ru: "Головные уборы" },
    Masks: { en: "Masks", ru: "Маски" },
    Items: { en: "Items", ru: "Предметы" },
    Vehicles: { en: "Vehicles", ru: "Транспорт" },
    Effects: { en: "Effects", ru: "Эффекты" },
  },
  items: {
    // Effects
    sparkle: { en: "Sparkle", ru: "Искорка" },
    bubbles: { en: "Bubbles", ru: "Пузыри" },
    hearts: { en: "Hearts", ru: "Сердечки" },
    leaves: { en: "Falling Leaves", ru: "Листопад" },
    music: { en: "Music Notes", ru: "Ноты" },
    ghost: { en: "Ghosts", ru: "Призраки" },
    rain: { en: "Rain", ru: "Дождь" },
    confetti: { en: "Confetti", ru: "Конфетти" },
    stars: { en: "Stars", ru: "Звёзды" },
    ice: { en: "Ice", ru: "Лёд" },
    skull: { en: "Skulls", ru: "Черепа" },
    matrix: { en: "Matrix", ru: "Матрица" },
    neon: { en: "Neon", ru: "Неон" },
    orbit: { en: "Orbit", ru: "Орбита" },
    glitch: { en: "Glitch", ru: "Глитч" },
    meme: { en: "Memes", ru: "Мемчики" },
    money: { en: "Dollars", ru: "Доллары" },
    plasma: { en: "Plasma", ru: "Плазма" },

    // Hats
    red_horns: { en: "Red Horns", ru: "Красные рожки" },
    beanie: { en: "Beanie", ru: "Шапка-бини" },
    black_cap: { en: "Black Cap", ru: "Чёрная кепка" },
    crown: { en: "Crown", ru: "Корона" },
    minecraft_cap: { en: "Minecraft Cap", ru: "Майнкрафт кепка" },

    // Masks
    hockey_mask: { en: "Hockey Mask", ru: "Хоккейная маска" },
    clown_mask: { en: "Clown Mask", ru: "Маска клоуна" },
    gold_chain: { en: "Gold Chain", ru: "Золотая цепь" },
    silver_chain: { en: "Silver Chain", ru: "Серебряная цепь" },

    // Items
    sparkler_item: { en: "Sparkler", ru: "Бенгальский огонь" },
    red_roses: { en: "Red Roses", ru: "Букет роз" },

    // Vehicles
    mercedes_benz_c: {
      en: "Mercedes-Benz C-Class",
      ru: "Mercedes-Benz C-Class",
    },
    bmw_3_series: { en: "BMW 3 Series", ru: "BMW 3 Series" },
  },
};

// Функция для получения перевода категории
export function getCategoryTranslation(
  categoryKey: string,
  locale: Locale = "en",
): string {
  return SHOP_TRANSLATIONS.categories[categoryKey]?.[locale] ?? categoryKey;
}

// Функция для получения перевода предмета
export function getItemTranslation(
  itemId: string,
  locale: Locale = "en",
): string {
  return SHOP_TRANSLATIONS.items[itemId]?.[locale] ?? itemId;
}

// Функция для получения всех переводов для клиента
export function getShopTranslations(locale: Locale = "en"): {
  categories: Record<string, string>;
  items: Record<string, string>;
} {
  const categories: Record<string, string> = {};
  const items: Record<string, string> = {};

  Object.entries(SHOP_TRANSLATIONS.categories).forEach(
    ([key, translations]) => {
      categories[key] = translations[locale];
    },
  );

  Object.entries(SHOP_TRANSLATIONS.items).forEach(([key, translations]) => {
    items[key] = translations[locale];
  });

  return { categories, items };
}
