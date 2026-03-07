export interface CoinPackage {
  id: string;
  coins: number;
  price: number;
  oldPrice: number | null;
  salePercent: number;
  starsPrice: number;
}

export const COIN_PACKAGES: CoinPackage[] = [
  {
    id: "pack_50",
    coins: 50,
    price: 15,
    oldPrice: null,
    salePercent: 0,
    starsPrice: 10,
  },
  {
    id: "pack_150",
    coins: 150,
    price: 39,
    oldPrice: null,
    salePercent: 0,
    starsPrice: 25,
  },
  {
    id: "pack_500",
    coins: 500,
    price: 99,
    oldPrice: null,
    salePercent: 0,
    starsPrice: 65,
  },
  {
    id: "pack_1200",
    coins: 1200,
    price: 199,
    oldPrice: 249,
    salePercent: 20,
    starsPrice: 125,
  },
  {
    id: "pack_2500",
    coins: 2500,
    price: 349,
    oldPrice: 499,
    salePercent: 30,
    starsPrice: 220,
  },
];
