import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { RaceResultsController } from './race-results.controller';
import { RaceResultsService } from './race-results.service';

/**
 * Lắp ráp các use case đọc đăng ký và kết quả thi đấu, gồm lịch sử thi đấu của ngựa.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RaceRegistrationEntity]), HorsesSharedModule],
  controllers: [RaceResultsController],
  providers: [RaceResultsService],
})
export class RaceResultsModule {}
