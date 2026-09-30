import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CurrentCareInstructionsDto {
  @ApiProperty({
    description:
      'Ghi chú chăm sóc và hạn chế vận động của buổi khám gần nhất chưa hủy',
  })
  careInstructions!: string;

  @ApiProperty({ description: 'Thời điểm khám của buổi khám có ghi chú này' })
  examDate!: Date;

  @ApiProperty({ format: 'uuid', description: 'Buổi khám có ghi chú này' })
  medicalRecordId!: string;
}

export class CareInstructionsResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiPropertyOptional({
    type: CurrentCareInstructionsDto,
    nullable: true,
    description:
      'Ghi chú đang hiệu lực; null khi ngựa chưa được khám hoặc buổi khám gần nhất để trống ghi chú (không còn hạn chế)',
  })
  current!: CurrentCareInstructionsDto | null;
}
