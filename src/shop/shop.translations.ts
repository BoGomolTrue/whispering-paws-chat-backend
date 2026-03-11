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
    Pants: { en: "Pants", ru: "Штаны" },
    Tops: { en: "Tops", ru: "Верхняя одежда" },
    Shoes: { en: "Shoes", ru: "Обувь" },
    Hats: { en: "Hats", ru: "Головные уборы" },
    Masks: { en: "Masks", ru: "Маски" },
    Glasses: { en: "Glasses", ru: "Очки" },
    Items: { en: "Items", ru: "Предметы" },
    Vehicles: { en: "Vehicles", ru: "Транспорт" },
    Effects: { en: "Effects", ru: "Эффекты" },
    Tattoos: { en: "Tattoos", ru: "Татуировки" },
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
    drone: { en: "Drone", ru: "Дрон" },
    meme: { en: "Memes", ru: "Мемчики" },
    money: { en: "Dollars", ru: "Доллары" },
    plasma: { en: "Plasma", ru: "Плазма" },

    // Tops (верхняя одежда)
    black_hoodie: { en: "Black Hoodie", ru: "Чёрное худи" },
    stripped_long_sleeve: {
      en: "Stripped Long Sleeve",
      ru: "Полосатая лонгслив",
    },
    black_hoodie_paws: { en: "Black Hoodie Paws", ru: "Чёрное худи с лапками" },

    // Bottom (штаны)
    blue_jeens: { en: "Blue Jeans", ru: "Синие джинсы" },
    cargo_pant: { en: "Cargo Pant", ru: "Брюки карго" },
    splatter_cargo_pant: {
      en: "Splatter Cargo Pant",
      ru: "Брюки карго с брызгами",
    },
    embroidered_pant: { en: "Embroidered Pant", ru: "Брюки с вышивкой" },
    urban_acid_jeans: { en: "Urban Acid Jeans", ru: "Джинсы Urban Acid" },
    punk_pleated: { en: "Punk Pleated", ru: "Панк плиссированная юбка" },
    pink_pant: { en: "Pink Pant", ru: "Розовые штаны" },
    anime_pant: { en: "Anime Pant", ru: "Аниме штаны" },
    paws_print_pant: { en: "Paws Print Pant", ru: "Штаны с лапками" },
    leather_pant: { en: "Leather Pant", ru: "Кожаные штаны" },

    // Shoes (обувь)
    green_skateboard_sneakers: {
      en: "Green Skateboard Sneakers",
      ru: "Зелёные скейтерские кеды",
    },

    // Hats (головные уборы)
    red_horns: { en: "Red Horns", ru: "Красные рожки" },
    beanie: { en: "Beanie", ru: "Шапка-бини" },
    black_cap: { en: "Black Cap", ru: "Чёрная кепка" },
    crown: { en: "Crown", ru: "Корона" },
    minecraft_cap: { en: "Minecraft Cap", ru: "Майнкрафт кепка" },

    // Masks (маски и цепи)
    hockey_mask: { en: "Hockey Mask", ru: "Хоккейная маска" },
    clown_mask: { en: "Clown Mask", ru: "Маска клоуна" },
    gold_chain: { en: "Gold Chain", ru: "Золотая цепь" },
    silver_chain: { en: "Silver Chain", ru: "Серебряная цепь" },

    // Items (предметы в руке)
    sparkler_item: { en: "Sparkler", ru: "Бенгальский огонь" },
    red_roses: { en: "Red Roses", ru: "Букет роз" },

    // Vehicles (транспорт)
    mercedes_benz_c: {
      en: "Mercedes-Benz C-Class",
      ru: "Mercedes-Benz C-Class",
    },
    bmw_3_series: { en: "BMW 3 Series", ru: "BMW 3 Series" },

    // Tattoos (татуировки)
    symbols_tatoo: { en: "Symbols Tattoo", ru: "Татуировка символы" },
    tatoo_m: { en: "M Tattoo", ru: "Татуировка M" },
    skull_tatoo: { en: "Skull Tattoo", ru: "Татуировка череп" },
    heart_tatto: { en: "Heart Tattoo", ru: "Татуировка сердце" },

    // Glasses (очки)
    sunglasses_black: {
      en: "Black Sunglasses",
      ru: "Чёрные солнцезащитные очки",
    },
    glasses_round: { en: "Round Glasses", ru: "Круглые очки" },
    glasses_aviator: { en: "Aviator Glasses", ru: "Очки авиаторы" },
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
