import { UserRole } from '../enums/index.js';

/** Payload stored inside the JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** The account's token version when the token was issued (see User.tokenVersion). */
  tv?: number;
}

/** The logged-in user attached to each request by the JWT guard. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
