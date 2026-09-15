import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmOptions } from './common/database/typeorm.options';
import { DomainEventsModule } from './common/events/domain-events.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { AxiosModule } from './common/integration/axios/axios.module';
import { KeycloakGuard } from './common/integration/keycloak/guard/keycloak.guard';
import { KeycloakModule } from './common/integration/keycloak/keycloak.module';
import { RedisModule } from './common/redis/redis.module';
import { ObjectStorageModule } from './common/storage/object-storage.module';
import { validateEnvironment } from './config/env.validation';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HorsesModule } from './modules/horses/horses.module';
import { MediaModule } from './modules/media/media.module';
import { MedicalModule } from './modules/medical/medical.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { RacingModule } from './modules/racing/racing.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';
import { StableModule } from './modules/stable/stable.module';
import { SuppliesModule } from './modules/supplies/supplies.module';
import { TrainingModule } from './modules/training/training.module';
import { UsersModule } from './modules/users/users.module';

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
    AxiosModule,
    KeycloakModule,
    ObjectStorageModule,
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
    { provide: APP_GUARD, useClass: KeycloakGuard },
  ],
})
export class AppModule {}
