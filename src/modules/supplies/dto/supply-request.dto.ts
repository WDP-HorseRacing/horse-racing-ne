import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import { SupplyItemResponseDto } from './supply-item.dto';

export class CreateSupplyRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class EditSupplyRequestDto {
  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateSupplyRequestStatusDto {
  @ApiProperty({
    enum: [
      SupplyRequestStatus.APPROVED,
      SupplyRequestStatus.REJECTED,
      SupplyRequestStatus.FULFILLED,
    ],
  })
  @IsEnum(SupplyRequestStatus)
  @IsIn([
    SupplyRequestStatus.APPROVED,
    SupplyRequestStatus.REJECTED,
    SupplyRequestStatus.FULFILLED,
  ])
  status!: SupplyRequestStatus;

  @ApiPropertyOptional({ description: 'Required when status is REJECTED' })
  @ValidateIf(
    (request: { status?: SupplyRequestStatus }) =>
      request.status === SupplyRequestStatus.REJECTED,
  )
  @IsString()
  @MinLength(1)
  reason?: string;
}

export class SupplyUserSummaryResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  fullName!: string;

  @Expose()
  @ApiProperty({ format: 'email' })
  email!: string;
}

export class SupplyRequestResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @Expose()
  @Type(() => SupplyItemResponseDto)
  @ApiProperty({ type: SupplyItemResponseDto })
  item!: SupplyItemResponseDto;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  requestedBy!: string;

  @Expose()
  @Type(() => SupplyUserSummaryResponseDto)
  @ApiProperty({ type: SupplyUserSummaryResponseDto })
  requester!: SupplyUserSummaryResponseDto;

  @Expose()
  @ApiProperty({ type: String })
  quantity!: string;

  @Expose()
  @ApiProperty({ enum: SupplyRequestStatus })
  status!: SupplyRequestStatus;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  reviewedBy!: string | null;

  @Expose()
  @Type(() => SupplyUserSummaryResponseDto)
  @ApiPropertyOptional({
    type: SupplyUserSummaryResponseDto,
    nullable: true,
  })
  reviewer!: SupplyUserSummaryResponseDto | null;

  @Expose()
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  reviewedAt!: Date | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  fulfilledBy!: string | null;

  @Expose()
  @Type(() => SupplyUserSummaryResponseDto)
  @ApiPropertyOptional({
    type: SupplyUserSummaryResponseDto,
    nullable: true,
  })
  fulfiller!: SupplyUserSummaryResponseDto | null;

  @Expose()
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  fulfilledAt!: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  rejectionReason!: string | null;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
