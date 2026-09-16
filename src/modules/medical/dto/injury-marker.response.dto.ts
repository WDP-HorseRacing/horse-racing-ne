import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../constants/injury-marker.enum';

export class InjuryMarkerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  medicalRecordId!: string;

  @ApiProperty({ enum: InjuryBodyRegion })
  bodyRegion!: InjuryBodyRegion;

  @ApiProperty({ enum: InjuryType })
  injuryType!: InjuryType;

  @ApiProperty({ enum: RecoveryStatus })
  recoveryStatus!: RecoveryStatus;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}
