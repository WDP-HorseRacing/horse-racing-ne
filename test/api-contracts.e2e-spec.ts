import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditController } from '../src/modules/audit/controllers/audit.controller';
import { AuthController } from '../src/modules/auth/auth.controller';
import { HorsesController } from '../src/modules/horses/controllers/horses.controller';
import { MedicalController } from '../src/modules/medical/controllers/medical.controller';
import { NotificationsController } from '../src/modules/notifications/controllers/notifications.controller';
import { PerformanceController } from '../src/modules/performance/controllers/performance.controller';
import { RacingController } from '../src/modules/racing/controllers/racing.controller';
import { StableController } from '../src/modules/stable/controllers/stable.controller';
import { TrainingController } from '../src/modules/training/controllers/training.controller';
import { UsersController } from '../src/modules/users/users.controller';

describe('API contracts', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        AuditController,
        AuthController,
        HorsesController,
        MedicalController,
        NotificationsController,
        PerformanceController,
        RacingController,
        StableController,
        TrainingController,
        UsersController,
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes the core route groups in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    for (const path of [
      '/api/v1/auth/login',
      '/api/v1/horses',
      '/api/v1/horses/{horseId}/training-plans',
      '/api/v1/sessions/{id}/metrics',
      '/api/v1/horses/{horseId}/training-locks',
      '/api/v1/notifications',
      '/api/v1/audit-logs',
    ]) {
      expect(document.paths[path]).toBeDefined();
    }
  });

  it('returns 501 for a valid unimplemented domain request', async () => {
    await request(app.getHttpServer()).get('/api/v1/horses').expect(501);
    await request(app.getHttpServer())
      .post('/api/v1/horses')
      .send({ name: 'Example Horse' })
      .expect(501);
  });

  it('validates request DTOs before the pending service', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email' })
      .expect(400);
  });
});
