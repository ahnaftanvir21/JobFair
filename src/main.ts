import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

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

  // Interactive API docs at /api/docs. Click "Authorize" and paste the accessToken.
  const config = new DocumentBuilder()
    .setTitle('AIUB Job Fair 2026 API')
    .setDescription(
      'Students register, build profiles, apply for jobs and drop CVs. ' +
        'Employers build company profiles, post jobs with questions and review applicants.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();
  SwaggerModule.setup('api/docs', app, () =>
    SwaggerModule.createDocument(app, config),
  );

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
