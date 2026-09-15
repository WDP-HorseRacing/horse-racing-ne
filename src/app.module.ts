import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnvironment } from './config/env.validation';
import { typeOrmOptions } from './common/database/typeorm.options';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HorsesModule } from './modules/horses/horses.module';
import { TrainingModule } from './modules/training/training.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { MedicalModule } from './modules/medical/medical.module';
import { StableModule } from './modules/stable/stable.module';
import { RacingModule } from './modules/racing/racing.module';
import { SuppliesModule } from './modules/supplies/supplies.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { MediaModule } from './modules/media/media.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RedisModule } from './common/redis/redis.module';
import { DomainEventsModule } from './common/events/domain-events.module';
import { ObjectStorageModule } from './common/storage/object-storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        typeOrmOptions({
          host: config.getOrThrow<string>('DB_HOST'),
          port: config.getOrThrow<number>('DB_PORT'),
          username: config.getOrThrow<string>('DB_USERNAME'),
          password: config.getOrThrow<string>('DB_PASSWORD'),
          database: config.getOrThrow<string>('DB_NAME'),
        }),
    }),
    EventEmitterModule.forRoot(),
    DomainEventsModule,
    RedisModule,
    ObjectStorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    HorsesModule,
    TrainingModule,
    PerformanceModule,
    MedicalModule,
    StableModule,
    RacingModule,
    SuppliesModule,
    ReportsModule,
    NotificationsModule,
    AuditModule,
    MediaModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
  ],
})
export class AppModule {}
