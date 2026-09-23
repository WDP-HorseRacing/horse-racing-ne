import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AssignHorseBarnDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Khu chuồng mới. Phải đang hoạt động, có Head Trainer phụ trách và còn ô trống',
  })
  @IsUUID()
  barnId!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do xếp hoặc đổi khu, bắt buộc',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
