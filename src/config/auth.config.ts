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
    /** New accounts must confirm their email with a code. Off only if set to false. */
    requireEmailVerification:
      process.env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() !== 'false',
  };
});
