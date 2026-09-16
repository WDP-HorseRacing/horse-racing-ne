import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RaceStatus } from '../constants/race-status.enum';
import { RegistrationStatus } from '../constants/registration-status.enum';

export class HorseRaceResultResponseDto {
  @ApiProperty({ format: 'uuid' })
  registrationId!: string;

  @ApiProperty({ format: 'uuid' })
  raceId!: string;

  @ApiProperty()
  raceName!: string;

  @ApiProperty({ format: 'date-time' })
  scheduledAt!: Date;

  @ApiProperty({ enum: RaceStatus })
  raceStatus!: RaceStatus;

  @ApiProperty({ enum: RegistrationStatus })
  registrationStatus!: RegistrationStatus;

  @ApiPropertyOptional({ nullable: true })
  placing!: number | null;

  @ApiPropertyOptional({ nullable: true })
  timeSeconds!: string | null;
}
