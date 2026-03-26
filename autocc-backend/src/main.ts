import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(appConfig.port);
}
bootstrap().catch((error) => {
  console.error('Error al iniciar la aplicación:', error);
  process.exit(1);
});
