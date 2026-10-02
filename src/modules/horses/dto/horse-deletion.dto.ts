import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteHorseDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do xóa hồ sơ tạo nhầm, bắt buộc',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
export class RestoreHorseDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do khôi phục hồ sơ đã xóa, bắt buộc',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class HorseDeletionPreviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ description: 'true nếu xóa được ngay' })
  allowed!: boolean;

  @ApiProperty({ description: 'Ngựa đã chuyển nhượng, hồ sơ chỉ đọc' })
  transferred!: boolean;

  @ApiProperty({
    type: [String],
    description:
      'Các loại dữ liệu nghiệp vụ ngựa đã phát sinh (vd "chỉ số cơ thể", "lớp học"), rỗng nếu chưa có',
  })
  businessData!: string[];

  @ApiProperty({ description: 'Ngựa đang là cha hoặc mẹ của ngựa khác' })
  isParent!: boolean;
}

export class HorseRestorePreviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Tên khu ngựa sẽ rời khi khôi phục (khôi phục luôn đưa ngựa vào Chờ xếp khu), null nếu ngựa không có khu',
  })
  barnCleared!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Tên chủ sẽ bị bỏ trống khi tài khoản không còn là chủ ngựa đang hoạt động, null nếu giữ chủ',
  })
  ownerCleared!: string | null;

  @ApiProperty({
    description:
      'Câu tóm tắt hệ quả, ví dụ "Nếu khôi phục, Winx sẽ rời khu “Khu A” và vào Chờ xếp khu."',
  })
  summary!: string;
}
