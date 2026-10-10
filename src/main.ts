import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { finalizeOpenApi } from './common/openapi/finalize-openapi';
import { validationExceptionFactory } from './common/utils/field-errors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  const origins = process.env.CORS_ORIGINS?.split(',').map((origin) =>
    origin.trim(),
  );
  if (origins?.length) app.enableCors({ origin: origins });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Racehorse API')
    .setDescription('Modular monolith API skeleton')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    finalizeOpenApi(SwaggerModule.createDocument(app, swaggerConfig)),
    { swaggerOptions: { persistAuthorization: true } },
  );

  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
