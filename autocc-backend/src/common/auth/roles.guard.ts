import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtAccessPayload } from '../../auth/jwt-payload.types';
import { ROLES_KEY } from './roles.decorator';
import { UserRole } from '../../users/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: JwtAccessPayload;
    }>();
    const role = request.user?.role;
    if (!role || !Object.values(UserRole).includes(role)) {
      throw new ForbiddenException('Invalid role in token');
    }

    if (!requiredRoles.includes(role)) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }
}
