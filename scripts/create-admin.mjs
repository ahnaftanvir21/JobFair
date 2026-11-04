// Creates an admin account, or sets a new password for an existing admin.
// Usage: npm run admin:create -- admin@aiub.edu "a-long-password"
// Run the server once first so the tables exist. Admins log in with POST /api/auth/login.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [rawEmail, password] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!email || !password) {
  console.error('Usage: npm run admin:create -- <email> <password>');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`"${rawEmail}" is not a valid email address.`);
  process.exit(1);
}
if (password.length < 8 || Buffer.byteLength(password) > 72) {
  console.error('Password must be 8 to 72 characters.');
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'aiub_job_fair',
});

try {
  await client.connect();
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await client.query('SELECT id, role FROM users WHERE email = $1', [email]);
  if (rows.length && rows[0].role !== 'admin') {
    console.error(`${email} is already a ${rows[0].role} account. Use another email.`);
    process.exitCode = 1;
  } else if (rows.length) {
    // Bumping the token version logs the admin out everywhere.
    await client.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2',
      [passwordHash, rows[0].id],
    );
    console.log(`Admin ${email} already existed. Password updated.`);
  } else {
    await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')",
      [email, passwordHash],
    );
    console.log(`Admin ${email} created. Log in with POST /api/auth/login.`);
  }
} catch (err) {
  if (err.code === '22P02' || err.code === '42P01') {
    console.error('The database is not ready for admins yet. Start the server once (npm run start:dev), then try again.');
  } else {
    console.error(err.message);
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
