import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const entitiesGlob = [__dirname + '/../**/*.entity{.ts,.js}'];

const synchronizeEnabled = process.env.DB_SYNCHRONIZE !== 'false';
const loggingEnabled = process.env.DB_LOGGING === 'true';

/**
 * `mysql` (default): desarrollo / producción actual con mysql2.
 * `postgres`: Neon u otro Postgres (Render). Coexiste con mysql2 hasta migración completa.
 */
const dbType = (process.env.DB_TYPE ?? 'mysql').toLowerCase();

function postgresSslOption():
  | boolean
  | { rejectUnauthorized: boolean }
  | undefined {
  if (process.env.DB_SSL === 'false') {
    return undefined;
  }
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('sslmode=disable')) {
    return undefined;
  }
  // Neon y muchos hosts cloud: cert no local; mismo criterio que suele documentar Neon para Node.
  return { rejectUnauthorized: false };
}

function buildMysqlConfig(): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    host: process.env.DB_HOST ?? 'localhost',
    port: parsePort(process.env.DB_PORT, 3306),
    username: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'auto_cc',
    entities: entitiesGlob,
    synchronize: synchronizeEnabled,
    logging: loggingEnabled,
    charset: 'utf8mb4',
    // Evita corrimientos por timezone en columnas DATE (día sin hora).
    dateStrings: ['DATE'],
    timezone: process.env.DB_TIMEZONE ?? 'Z',
  };
}

function buildPostgresConfig(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL?.trim();
  const ssl = postgresSslOption();

  if (url && url.length > 0) {
    return {
      type: 'postgres',
      url,
      entities: entitiesGlob,
      synchronize: synchronizeEnabled,
      logging: loggingEnabled,
      ...(ssl !== undefined ? { ssl } : {}),
    };
  }

  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parsePort(process.env.DB_PORT, 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'postgres',
    entities: entitiesGlob,
    synchronize: synchronizeEnabled,
    logging: loggingEnabled,
    ...(ssl !== undefined ? { ssl } : {}),
  };
}

export const databaseConfig: TypeOrmModuleOptions =
  dbType === 'postgres' ? buildPostgresConfig() : buildMysqlConfig();
