import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserRole } from '../../../common/enums/role.enum';
import { IsDateOnly } from '../../../common/utils/dto-input';
import { AuditAction } from '../constants/audit-action.enum';
import { AuditEntityType } from '../constants/audit-entity-type.enum';
import { AuditFeature } from '../constants/audit-feature.enum';

/**
 * Bộ lọc và phân trang nhật ký thao tác.
 */
export class AuditLogListQueryDto extends PickType(PaginationQueryDto, [
  'page',
  'limit',
] as const) {
  @ApiPropertyOptional({ format: 'uuid', description: 'Người thực hiện' })
  @IsOptional()
  @IsUUID('4')
  actorId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ enum: AuditEntityType })
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Id đối tượng bị thay đổi',
  })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({
    enum: AuditFeature,
    description: 'Mã chức năng của thao tác',
  })
  @IsOptional()
  @IsEnum(AuditFeature)
  feature?: AuditFeature;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Từ ngày (lịch câu lạc bộ), YYYY-MM-DD',
  })
  @IsOptional()
  @IsDateOnly({ message: 'Từ ngày phải có dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Tới hết ngày (lịch câu lạc bộ), YYYY-MM-DD',
  })
  @IsOptional()
  @IsDateOnly({ message: 'Đến ngày phải có dạng YYYY-MM-DD' })
  to?: string;
}

/**
 * Người thực hiện một thao tác.
 */
export class AuditLogActorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: UserRole, nullable: true })
  role!: UserRole | null;
}

/**
 * Một dòng nhật ký thao tác trong danh sách.
 */
export class AuditLogSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    type: AuditLogActorDto,
    nullable: true,
    description: 'null là thao tác do hệ thống tự làm',
  })
  actor!: AuditLogActorDto | null;

  @ApiProperty({ enum: AuditAction })
  action!: AuditAction;

  @ApiProperty({ enum: AuditEntityType })
  entityType!: AuditEntityType;

  @ApiProperty({ format: 'uuid' })
  entityId!: string;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Mã chức năng của thao tác',
  })
  feature!: string | null;
}

/**
 * Một dòng nhật ký thao tác kèm dữ liệu trước và sau.
 */
export class AuditLogDetailDto extends AuditLogSummaryDto {
  @ApiProperty({ type: Object, nullable: true })
  before!: Record<string, unknown> | null;

  @ApiProperty({ type: Object, nullable: true })
  after!: Record<string, unknown> | null;
}

/**
 * Một trang nhật ký thao tác.
 */
export class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogSummaryDto] })
  items!: AuditLogSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
