import { Controller, Get } from "@nestjs/common";
import { ShopService } from "./shop.service";

@Controller("api/shop")
export class ShopController {
  constructor(private shopService: ShopService) {}

  @Get("items")
  getItems() {
    return this.shopService.getItems();
  }
}
