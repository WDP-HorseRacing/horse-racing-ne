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
  Max,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import {
  SupplyItemResponseDto,
  SupplyUserSummaryResponseDto,
} from './supply-item.dto';

const MAX_QUANTITY = 1_000_000_000;

export class CreateSupplyRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({
    minimum: 0.01,
    maximum: MAX_QUANTITY,
    description: 'Số lượng xin thêm',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class EditSupplyRequestDto {
  @ApiPropertyOptional({ minimum: 0.01, maximum: MAX_QUANTITY })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantity?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
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
  @MaxLength(500)
  reason?: string;
}

export class SupplyRequestListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SupplyRequestStatus })
  @IsOptional()
  @IsEnum(SupplyRequestStatus)
  status?: SupplyRequestStatus;
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

export class SupplyRequestPageResponseDto {
  @ApiProperty({ type: [SupplyRequestResponseDto] })
  items!: SupplyRequestResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  @Type(() => PaginationMetaDto)
  meta!: PaginationMetaDto;
}
