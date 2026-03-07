import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto extends LoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  nickname: string;

  @IsOptional()
  @IsString()
  characterType?: string;

  @IsOptional()
  @IsString()
  gender?: string;
}

export class GuestLoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  nickname: string;

  @IsString()
  characterType: string;

  @IsString()
  gender: string;
}
