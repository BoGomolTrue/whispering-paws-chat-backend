export interface ShopItem {
  id: string;
  name: string;
  category: string;
  price: number;
  salePercent?: number;
  saleEndsAt?: number;
  description?: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "sparkle", name: "Sparkle", category: "effects", price: 30 },
  { id: "bubbles", name: "Bubbles", category: "effects", price: 35 },
  { id: "hearts", name: "Hearts", category: "effects", price: 40 },
  { id: "leaves", name: "Falling Leaves", category: "effects", price: 40 },
  { id: "music", name: "Music Notes", category: "effects", price: 45 },
  { id: "ghost", name: "Ghosts", category: "effects", price: 50 },
  { id: "rain", name: "Rain", category: "effects", price: 50 },
  { id: "confetti", name: "Confetti", category: "effects", price: 55 },
  { id: "stars", name: "Stars", category: "effects", price: 60 },
  { id: "ice", name: "Ice", category: "effects", price: 70 },
  { id: "skull", name: "Skulls", category: "effects", price: 75 },
  { id: "matrix", name: "Matrix", category: "effects", price: 80 },
  { id: "neon", name: "Neon", category: "effects", price: 90 },
  { id: "orbit", name: "Orbit", category: "effects", price: 90 },
  { id: "glitch", name: "Glitch", category: "effects", price: 95 },
  { id: "meme", name: "Memes", category: "effects", price: 100 },
  { id: "money", name: "Dollars", category: "effects", price: 100 },
  { id: "plasma", name: "Plasma", category: "effects", price: 105 },
  { id: "red_horns", name: "Red Horns", category: "hats", price: 50 },
  { id: "beanie", name: "Beanie", category: "hats", price: 35 },
  { id: "black_cap", name: "Black Cap", category: "hats", price: 30 },
  { id: "hockey_mask", name: "Hockey Mask", category: "masks", price: 45 },
  { id: "clown_mask", name: "Clown Mask", category: "masks", price: 50 },
  { id: "gold_chain", name: "Gold Chain", category: "masks", price: 65 },
  { id: "silver_chain", name: "Silver Chain", category: "masks", price: 45 },
  { id: "sparkler_item", name: "Sparkler", category: "items", price: 40 },
  { id: "red_roses", name: "Red Roses", category: "items", price: 55 },
];

const SHOP_ITEMS_MAP = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

export function getActiveShopItems(): ShopItem[] {
  return SHOP_ITEMS;
}

export function getShopItemById(itemId: string): ShopItem | undefined {
  return SHOP_ITEMS_MAP.get(itemId);
}

export function getItemCategory(itemId: string): string | null {
  return SHOP_ITEMS_MAP.get(itemId)?.category ?? null;
}

export function applyEffectivePrice(
  item: ShopItem,
): ShopItem & { effectivePrice: number } {
  const now = Date.now();
  let saleActive = (item.salePercent ?? 0) > 0;
  if (saleActive && item.saleEndsAt && item.saleEndsAt < now) {
    saleActive = false;
  }
  return {
    ...item,
    salePercent: saleActive ? (item.salePercent ?? 0) : 0,
    effectivePrice: saleActive
      ? Math.round(item.price * (1 - (item.salePercent ?? 0) / 100))
      : item.price,
  };
}

export function getShopItemsForClient(): (ShopItem & {
  effectivePrice: number;
})[] {
  return getActiveShopItems().map(applyEffectivePrice);
}

export const VALID_CATEGORIES = [
  "effects",
  "hats",
  "masks",
  "bottom",
  "items",
] as const;
