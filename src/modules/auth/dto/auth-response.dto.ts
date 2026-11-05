import { UserRole } from '../../../common/enums/index.js';

export class AuthUserDto {
  id: string;
  email: string;
  role: UserRole;
  /** False until the 6-digit code from the email is entered. */
  emailVerified: boolean;
}

export class AuthResponseDto {
  accessToken: string;
  user: AuthUserDto;
}
