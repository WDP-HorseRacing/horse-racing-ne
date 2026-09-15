import { Module } from '@nestjs/common';
import { KeycloakModule } from '../../common/infrastructure/keycloak/keycloak.module';
import { RealtimeGateway } from './realtime.gateway';

// KeycloakModule khong global nen gateway khong tu thay KeycloakService.
// DataSource thi van den tu TypeOrmCoreModule global, khong can khai.
@Module({
  imports: [KeycloakModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
