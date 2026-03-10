// Локальные определения типов для backend
type CharacterType = "cat" | "dog" | "fox" | "panda" | "raccoon";

interface RenderBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
}

export interface ShopItemRaw {
  id: string;
  name: string;
  category: string;
  price: number;
  svg: string;
  render: RenderBox;
  renderByCharacter?: Partial<Record<CharacterType, RenderBox>>;
  isActive: boolean;
  rarity?: string;
  salePercent: number;
  saleEndsAt: number | null; // Changed from string | null to number | null
  availableFrom: string | null;
  availableUntil: string | null;
}

const R = { x: -40, y: -74, w: 80, h: 120 };
// const _BOTTOM_R = { x: -24, y: -2, w: 48, h: 40 }; // Currently unused but kept for consistency
// const _HAT_R = { x: -28, y: -88, w: 56, h: 36 }; // Currently unused but kept for consistency
const MASK_R = { x: -22, y: -64, w: 44, h: 38 };
const CHAIN_R = { x: -24, y: -30, w: 48, h: 22 };
const D = {
  isActive: true,
  rarity: "common" as const,
  salePercent: 0,
  saleEndsAt: null,
  availableFrom: null,
  availableUntil: null,
};

const SHOP_ITEMS: ShopItemRaw[] = [
  {
    id: "sparkle",
    name: "Sparkle",
    category: "effects",
    price: 30,
    svg: "/accessories/sparkle.svg",
    render: { x: -28, y: -70, w: 56, h: 56 },
    renderByCharacter: {
      cat: { x: -28, y: -70, w: 56, h: 56 },
    },
    ...D,
  },
  {
    id: "bubbles",
    name: "Bubbles",
    category: "effects",
    price: 35,
    svg: "/accessories/bubbles.svg",
    render: R,
    ...D,
  },
  {
    id: "hearts",
    name: "Hearts",
    category: "effects",
    price: 40,
    svg: "/accessories/hearts.svg",
    render: R,
    ...D,
  },
  {
    id: "leaves",
    name: "Falling Leaves",
    category: "effects",
    price: 40,
    svg: "/accessories/leaves.svg",
    render: R,
    ...D,
  },
  {
    id: "music",
    name: "Music Notes",
    category: "effects",
    price: 45,
    svg: "/accessories/music.svg",
    render: R,
    ...D,
  },
  {
    id: "ghost",
    name: "Ghosts",
    category: "effects",
    price: 50,
    svg: "/accessories/ghost.svg",
    render: R,
    ...D,
  },
  {
    id: "rain",
    name: "Rain",
    category: "effects",
    price: 50,
    svg: "/accessories/rain.svg",
    render: R,
    ...D,
  },
  {
    id: "confetti",
    name: "Confetti",
    category: "effects",
    price: 55,
    svg: "/accessories/confetti.svg",
    render: R,
    ...D,
  },
  {
    id: "stars",
    name: "Stars",
    category: "effects",
    price: 60,
    svg: "/accessories/stars.svg",
    render: R,
    ...D,
  },
  {
    id: "ice",
    name: "Ice",
    category: "effects",
    price: 70,
    svg: "/accessories/ice.svg",
    render: R,
    ...D,
  },
  {
    id: "skull",
    name: "Skulls",
    category: "effects",
    price: 75,
    svg: "/accessories/skull.svg",
    render: R,
    ...D,
  },
  {
    id: "matrix",
    name: "Matrix",
    category: "effects",
    price: 80,
    svg: "/accessories/matrix.svg",
    render: R,
    ...D,
  },
  {
    id: "neon",
    name: "Neon",
    category: "effects",
    price: 90,
    svg: "/accessories/neon.svg",
    render: R,
    ...D,
  },
  {
    id: "orbit",
    name: "Orbit",
    category: "effects",
    price: 90,
    svg: "/accessories/orbit.svg",
    render: R,
    ...D,
  },
  {
    id: "glitch",
    name: "Glitch",
    category: "effects",
    price: 95,
    svg: "/accessories/glitch.svg",
    render: R,
    ...D,
  },
  {
    id: "meme",
    name: "Memes",
    category: "effects",
    price: 100,
    svg: "/accessories/meme.svg",
    render: R,
    ...D,
  },
  {
    id: "money",
    name: "Dollars",
    category: "effects",
    price: 100,
    svg: "/accessories/money.svg",
    render: R,
    ...D,
  },
  {
    id: "plasma",
    name: "Plasma",
    category: "effects",
    price: 105,
    svg: "/accessories/plasma.svg",
    render: R,
    ...D,
  },
  {
    id: "minecraft_cap",
    name: "Minecraft Cap",
    category: "hats",
    price: 50,
    svg: "/accessories/minecraft_cap.png",
    render: { x: -28, y: -88, w: 56, h: 32 },
    renderByCharacter: {
      cat: { x: -54, y: -88, w: 98, h: 51 },
      fox: { x: -48, y: -68, w: 88, h: 43 },
    },
    ...D,
  },

  {
    id: "red_horns",
    name: "Red Horns",
    category: "hats",
    price: 50,
    svg: "/accessories/red_horns.svg",
    render: { x: -28, y: -88, w: 56, h: 32 },
    renderByCharacter: { cat: { x: -25, y: -92, w: 51, h: 39 } },
    ...D,
  },
  {
    id: "beanie",
    name: "Beanie",
    category: "hats",
    price: 35,
    svg: "/accessories/beanie.svg",
    render: { x: -28, y: -86, w: 56, h: 44 },
    renderByCharacter: { cat: { x: -29, y: -95, w: 60, h: 56 } },
    ...D,
  },
  {
    id: "black_cap",
    name: "Black Cap",
    category: "hats",
    price: 30,
    svg: "/accessories/black_cap.svg",
    render: { x: -28, y: -84, w: 56, h: 35 },
    renderByCharacter: { cat: { x: -20, y: -83, w: 39, h: 27 } },
    ...D,
  },
  {
    id: "hockey_mask",
    name: "Hockey Mask",
    category: "masks",
    price: 45,
    svg: "/accessories/hockey_mask.svg",
    renderByCharacter: { cat: { x: -27, y: -68, w: 57, h: 49 } },
    render: MASK_R,
    ...D,
  },
  {
    id: "clown_mask",
    name: "Clown Mask",
    category: "masks",
    price: 50,
    svg: "/accessories/clown_mask.svg",
    render: { x: -24, y: -60, w: 48, h: 30 },
    renderByCharacter: { cat: { x: -39, y: -73, w: 81, h: 53 } },
    ...D,
  },
  {
    id: "gold_chain",
    name: "Gold Chain",
    category: "masks",
    price: 65,
    svg: "/accessories/gold_chain.svg",
    renderByCharacter: {
      cat: { x: -15, y: -25, w: 34, h: 15 },
    },
    render: CHAIN_R,
    ...D,
    rarity: "rare",
  },
  {
    id: "silver_chain",
    name: "Silver Chain",
    category: "masks",
    price: 45,
    svg: "/accessories/silver_chain.svg",
    render: CHAIN_R,
    renderByCharacter: {
      cat: { x: -15, y: -25, w: 34, h: 15 },
    },
    ...D,
  },
  {
    id: "sparkler_item",
    name: "Sparkler",
    category: "items",
    price: 40,
    svg: "/accessories/sparkler_item.svg",
    render: { x: 20, y: -28, w: 14, h: 26 },
    ...D,
  },
  {
    id: "red_roses",
    name: "Red Roses",
    category: "items",
    price: 55,
    svg: "/accessories/red_roses.svg",
    render: { x: 16, y: -20, w: 30, h: 32 },
    renderByCharacter: { cat: { x: 11, y: -34, w: 34, h: 37 } },
    ...D,
    rarity: "rare",
  },
  {
    id: "mercedes_benz_c",
    name: "Mercedes-Benz C-Class",
    category: "vehicles",
    price: 1225,
    svg: "/accessories/mercedes_benz_c.png",
    render: { x: -33, y: -38, w: 120, h: 100, rotate: -1 },
    renderByCharacter: {},
    ...D,
    rarity: "epic",
  },
  {
    id: "bmw_3_series",
    name: "BMW 3 Series",
    category: "vehicles",
    price: 1325,
    svg: "/accessories/bmw_3_series.png",
    render: { x: -33, y: -60, w: 120, h: 136, rotate: -3 },
    renderByCharacter: {},
    ...D,
    rarity: "epic",
  },
];

const SHOP_ITEMS_MAP = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

export function getActiveShopItems(): ShopItemRaw[] {
  const now = new Date();
  return SHOP_ITEMS.filter((i) => {
    if (!i.isActive) return false;
    if (i.availableFrom && new Date(i.availableFrom) > now) return false;
    if (i.availableUntil && new Date(i.availableUntil) < now) return false;
    return true;
  });
}

export function getShopItemById(itemId: string): ShopItemRaw | undefined {
  return SHOP_ITEMS_MAP.get(itemId);
}

export function getItemCategory(itemId: string): string | null {
  return SHOP_ITEMS_MAP.get(itemId)?.category ?? null;
}

export function applyEffectivePrice(
  item: ShopItemRaw,
): ShopItemRaw & { effectivePrice: number } {
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

export function getShopItemsForClient(): (ShopItemRaw & {
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
  "vehicles",
] as const;
