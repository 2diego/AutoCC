import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class BootstrapAdminDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(190)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
