import { UserRole } from '../../../common/enums/index.js';

export class AuthUserDto {
  id: string;
  email: string;
  role: UserRole;
}

export class AuthResponseDto {
  accessToken: string;
  user: AuthUserDto;
}
