import { UserRole } from '../users/entities/user.entity';

/** Payload firmado en el access token JWT (login / bootstrap). */
export type JwtAccessPayload = {
  sub: number;
  email: string;
  role: UserRole;
};
