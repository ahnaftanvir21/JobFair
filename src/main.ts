import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip fields not in the DTO
      forbidNonWhitelisted: true, // and reject requests that send them
      transform: true,
    }),
  );

  // Interactive API docs at /api/docs.
  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
