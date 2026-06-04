import {
  BadRequestException,
  Body,
  Controller,
  PayloadTooLargeException,
  Post,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { FilesService } from "./files.service";



@Controller("api/upload")
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post("avatar")
  async uploadAvatar(@Body() body: { dataUrl?: string; userId?: number }) {
    
    
    if (!body.dataUrl) throw new BadRequestException("No image data");

    try {
      const url = await this.filesService.saveAvatar(
        body.dataUrl,
        body.userId || 0,
      );
      return { url };
    } catch (e: any) {
      if (e.message === "INVALID_FORMAT")
        throw new UnsupportedMediaTypeException("Invalid image format");
      if (e.message === "TOO_LARGE")
        throw new PayloadTooLargeException("Image too large");
      throw e;
    }
  }

  @Post("chat-image")
  async uploadChatImage(@Body() body: { dataUrl?: string }) {
    if (!body.dataUrl) throw new BadRequestException("No image data");

    try {
      const url = await this.filesService.saveChatImage(body.dataUrl);
      return { url };
    } catch (e: any) {
      if (e.message === "INVALID_FORMAT")
        throw new UnsupportedMediaTypeException("Invalid image format");
      if (e.message === "TOO_LARGE")
        throw new PayloadTooLargeException("Image too large");
      throw e;
    }
  }
}
