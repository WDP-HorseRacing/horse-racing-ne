import { ApiProperty } from '@nestjs/swagger';

export class HorsePermissionsResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({
    description:
      'Sửa thông tin hồ sơ (định danh, ảnh, cha mẹ, chủ sở hữu): Club Manager',
  })
  canEditProfile!: boolean;

  @ApiProperty({
    description: 'Sửa sở trường cự ly: Head Trainer phụ trách khu của ngựa',
  })
  canEditRaceAptitude!: boolean;

  @ApiProperty({ description: 'Xếp hoặc đổi khu chuồng: Club Manager' })
  canAssignBarn!: boolean;

  @ApiProperty({
    description:
      'Xếp ô chuồng và phân công Groom: Head Trainer phụ trách khu, ngựa đã có khu',
  })
  canAssignStallAndGroom!: boolean;

  @ApiProperty({
    description:
      'Đổi trạng thái vòng đời (kể cả kích hoạt lại ngựa đã chuyển nhượng)',
  })
  canChangeLifecycle!: boolean;

  @ApiProperty({
    description:
      'Hiện nút xóa hồ sơ. API vẫn chặn nếu ngựa đã có dữ liệu nghiệp vụ hoặc là cha/mẹ',
  })
  canDelete!: boolean;

  @ApiProperty({ description: 'Khôi phục hồ sơ đã xóa' })
  canRestore!: boolean;

  @ApiProperty({ description: 'Đổi trạng thái sức khỏe' })
  canChangeHealth!: boolean;

  @ApiProperty({
    description: 'Ghi chỉ số cơ thể (được ghi thì ghi được cả bốn loại)',
  })
  canRecordMeasurement!: boolean;

  @ApiProperty({ description: 'Xóa bản ghi chỉ số sai: Veterinarian' })
  canDeleteMeasurement!: boolean;

  @ApiProperty({ description: 'Mở tab Bệnh án: mọi vai trò trừ Groom' })
  canViewMedicalTab!: boolean;

  @ApiProperty({ description: 'Mở tab Huấn luyện: mọi vai trò trừ Groom' })
  canViewTrainingTab!: boolean;

  @ApiProperty({
    description:
      'Mở tab Thành tích thi đấu: Club Manager, Head Trainer, Horse Owner',
  })
  canViewPerformanceTab!: boolean;
}
