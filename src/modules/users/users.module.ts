import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KeycloakModule } from '../../common/infrastructure/keycloak/keycloak.module';
import { BarnsModule } from '../stable/barns/barns.module';
import { TrainingSharedModule } from '../training/shared/training-shared.module';
import { UserEntity } from './entities/user.entity';
import { HeadTrainerHandoverService } from './services/head-trainer-handover.service';
import { ProvisioningService } from './services/provisioning.service';
import { UsersService } from './services/users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    KeycloakModule,
    BarnsModule,
    TrainingSharedModule,
  ],
  providers: [ProvisioningService, UsersService, HeadTrainerHandoverService],
  controllers: [UsersController],
  exports: [ProvisioningService],
})
export class UsersModule {}
