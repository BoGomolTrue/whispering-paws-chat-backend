import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class FilesService {
  private uploadsDir: string;

  constructor(private configService: ConfigService) {
    this.uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async saveAvatar(dataUrl: string, userId: number): Promise<string> {
    const { buffer, ext } = this.parseDataUrl(dataUrl);
    if (buffer.length > 2 * 1024 * 1024) throw new Error("TOO_LARGE");

    const filename = `avatar_${userId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
    const filePath = path.join(this.uploadsDir, filename);

    await fs.promises.writeFile(filePath, buffer);
    return `/uploads/${filename}`;
  }

  async saveChatImage(dataUrl: string): Promise<string> {
    const { buffer, ext } = this.parseDataUrl(dataUrl);
    if (buffer.length > 2 * 1024 * 1024) throw new Error("TOO_LARGE");

    const filename = `chat_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
    const filePath = path.join(this.uploadsDir, filename);

    await fs.promises.writeFile(filePath, buffer);
    return `/uploads/${filename}`;
  }

  private parseDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
    const match = dataUrl.match(
      /^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/i,
    );
    if (!match) throw new Error("INVALID_FORMAT");

    const ext =
      match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], "base64");

    return { buffer, ext };
  }
}
