import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { toQueryBoolean } from '../../../common/utils/query-boolean';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationResourceType } from '../enums/notification-resource-type.enum';

/**
 * Lọc và phân trang danh sách thông báo của người gọi (cursor, mới nhất trước).
 */
export class NotificationListQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @ApiPropertyOptional({
    description:
      'Giá trị nextCursor của trang trước; bỏ trống để lấy trang đầu',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Chỉ lấy thông báo chưa đọc',
  })
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  unreadOnly: boolean = false;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;
}

/**
 * Đối tượng mà thông báo trỏ tới để mở màn hình chi tiết.
 */
export class NotificationResourceDto {
  @ApiProperty({ enum: NotificationResourceType })
  type!: NotificationResourceType;

  @ApiProperty({ format: 'uuid' })
  id!: string;
}

/**
 * Một thông báo của người gọi.
 */
export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NotificationCategory })
  category!: NotificationCategory;

  @ApiProperty({ enum: NotificationPriority })
  priority!: NotificationPriority;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: NotificationResourceDto, nullable: true })
  resource!: NotificationResourceDto | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'null khi chưa đọc',
  })
  readAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

/**
 * Một trang thông báo, mới nhất trước.
 */
export class NotificationPageResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items!: NotificationResponseDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Cursor của trang tiếp theo; null khi đã hết',
  })
  nextCursor!: string | null;
}

/**
 * Số thông báo chưa đọc của người gọi.
 */
export class NotificationUnreadCountResponseDto {
  @ApiProperty({ minimum: 0 })
  count!: number;
}

/**
 * Kết quả đánh dấu đã đọc toàn bộ.
 */
export class NotificationMarkAllReadResponseDto {
  @ApiProperty({
    minimum: 0,
    description: 'Số thông báo vừa chuyển sang đã đọc',
  })
  count!: number;
}
