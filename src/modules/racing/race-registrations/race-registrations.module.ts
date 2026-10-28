import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { RaceRegistrationsController } from './race-registrations.controller';
import { RaceRegistrationsRepository } from './race-registrations.repository';

/**
 * Owns registration proposal, approval and detail routes.
 * The registration workflow service is still contract-only.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RaceRegistrationEntity])],
  controllers: [RaceRegistrationsController],
  providers: [RaceRegistrationsRepository],
  exports: [RaceRegistrationsRepository],
})
export class RaceRegistrationsModule {}
