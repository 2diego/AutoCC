const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCsvList = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const appConfig = {
  port: parsePort(process.env.PORT, 3000),
  timezone: process.env.APP_TIMEZONE ?? 'UTC',
  uploadTmpDir: process.env.UPLOAD_TMP_DIR ?? 'tmp/uploads',
  corsOrigin: parseCsvList(
    process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:3000',
  ),
  uploadMaxFileSizeBytes:
    parsePort(process.env.UPLOAD_MAX_FILE_SIZE_MB, 10) * 1024 * 1024,
  jwtSecret: process.env.JWT_SECRET,
  /** Valor aceptado por `jsonwebtoken` / Nest `JwtModule` (ej. `8h`, `7d`). */
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
};
