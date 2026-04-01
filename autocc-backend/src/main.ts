import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  app.enableCors({
    origin:
      appConfig.corsOrigin.length === 0
        ? false
        : (origin, callback) => {
            if (!origin || appConfig.corsOrigin.includes(origin)) {
              callback(null, true);
              return;
            }
            callback(new Error('CORS origin not allowed'));
          },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');
  await app.listen(appConfig.port);
  logger.log(`API listening on port ${appConfig.port}`);
}
bootstrap().catch((error) => {
  console.error('Error al iniciar la aplicación:', error);
  process.exit(1);
});
