import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../constants/injury-marker.enum';
import { InjuryPositionDto } from './create-injury.dto';

export class InjuryMarkerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  medicalRecordId!: string;

  @ApiProperty({ enum: InjuryBodyRegion })
  bodyRegion!: InjuryBodyRegion;

  @ApiPropertyOptional({ type: InjuryPositionDto, nullable: true })
  position!: InjuryPositionDto | null;

  @ApiProperty({ enum: InjuryType })
  injuryType!: InjuryType;

  @ApiProperty({ enum: RecoveryStatus })
  recoveryStatus!: RecoveryStatus;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}
