import { registerAs } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from '../common/database/snake-naming.strategy.js';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'aiub_job_fair',
  // Hosted databases such as Supabase need an encrypted connection.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // Entities register themselves via TypeOrmModule.forFeature in each module.
  autoLoadEntities: true,
  // camelCase properties become snake_case columns.
  namingStrategy: new SnakeNamingStrategy(),
  // Auto-creates tables from entities. Keep false in production and use migrations.
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  logging: process.env.DB_LOGGING === 'true',
}));
