import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum SupplyRequestStatus {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FULFILLED = 'FULFILLED',
}

export class UpdateSupplyRequestDto {
  @ApiProperty({ enum: SupplyRequestStatus })
  @IsEnum(SupplyRequestStatus)
  status!: SupplyRequestStatus;
}
