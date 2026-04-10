import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { appConfig } from '../config/app.config';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import type { JwtAccessPayload } from './jwt-payload.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  private async signToken(payload: JwtAccessPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      expiresIn: appConfig.jwtExpiresIn,
    } as SignOptions);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async bootstrapAdmin(dto: BootstrapAdminDto) {
    const usersCount = await this.usersService.countAll();
    if (usersCount > 0) {
      throw new BadRequestException(
        'Bootstrap admin disabled: users already exist',
      );
    }

    const created = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      role: UserRole.ADMIN,
    });

    const accessToken = await this.signToken({
      sub: created.id,
      email: created.email,
      role: created.role,
    });

    return {
      accessToken,
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
      },
    };
  }
}
