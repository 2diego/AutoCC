import 'dotenv/config';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dbType = (process.env.DB_TYPE ?? 'mysql').toLowerCase();
const commonOptions = {
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
};

const options: DataSourceOptions =
  dbType === 'postgres'
    ? {
        type: 'postgres',
        ...(process.env.DATABASE_URL
          ? { url: process.env.DATABASE_URL.trim() }
          : {
              host: process.env.DB_HOST ?? 'localhost',
              port: parsePort(process.env.DB_PORT, 5432),
              username: process.env.DB_USER ?? 'postgres',
              password: process.env.DB_PASSWORD ?? '',
              database: process.env.DB_NAME ?? 'postgres',
            }),
        ...(process.env.DB_SSL === 'false'
          ? {}
          : { ssl: { rejectUnauthorized: false } }),
        ...commonOptions,
      }
    : {
        type: 'mysql',
        host: process.env.DB_HOST ?? 'localhost',
        port: parsePort(process.env.DB_PORT, 3306),
        username: process.env.DB_USER ?? 'root',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_NAME ?? 'auto_cc',
        charset: 'utf8mb4',
        timezone: process.env.DB_TIMEZONE ?? 'Z',
        ...commonOptions,
      };

export default new DataSource(options);
