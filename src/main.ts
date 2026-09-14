import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { finalizeOpenApi } from './common/api/finalize-openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
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
  );

  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
