// Creates the database named in .env (DB_NAME) if it does not exist yet.
// Usage: npm run db:create
import 'dotenv/config';
import pg from 'pg';

const dbName = process.env.DB_NAME ?? 'aiub_job_fair';
if (!/^[a-z_][a-z0-9_]*$/i.test(dbName)) {
  console.error(`Invalid DB_NAME "${dbName}"`);
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: 'postgres',
});

try {
  await client.connect();
  const { rowCount } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName],
  );
  if (rowCount) {
    console.log(`Database "${dbName}" already exists.`);
  } else {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Database "${dbName}" created.`);
  }
} catch (err) {
  console.error(`Could not create database: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
