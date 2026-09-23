import { ApiProperty } from '@nestjs/swagger';
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
