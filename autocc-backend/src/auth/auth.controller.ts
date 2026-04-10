import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../common/auth/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('bootstrap-admin')
  @Public()
  bootstrapAdmin(@Body() dto: BootstrapAdminDto) {
    return this.authService.bootstrapAdmin(dto);
  }
}
