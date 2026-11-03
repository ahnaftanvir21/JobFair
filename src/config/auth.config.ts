import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'change_me') {
    throw new Error('JWT_SECRET must be set to a long random value in .env');
  }
  return {
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
    bcryptRounds: 10,
  };
});
