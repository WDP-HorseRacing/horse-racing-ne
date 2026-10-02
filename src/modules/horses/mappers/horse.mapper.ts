import { plainToInstance } from 'class-transformer';
import { HorseResponseDto } from '../dto';
import type { HorseEntity } from '../entities/horse.entity';

/**
 * Chuyển các field hồ sơ ngựa dùng chung sang response DTO công khai
 *
 * @param entity Hồ sơ ngựa
 * @returns Response hồ sơ ngựa công khai
 */
export function toHorseResponse(entity: HorseEntity): HorseResponseDto {
  return plainToInstance(HorseResponseDto, entity, {
    excludeExtraneousValues: true,
  });
}

/**
 * Đọc tên người dùng từ quan hệ, báo lỗi rõ ràng khi quan hệ chưa được load
 *
 * @param user Người dùng của quan hệ, undefined hoặc null nếu chưa load
 * @param relation Tên quan hệ, dùng trong message lỗi
 * @returns Họ tên đầy đủ của người dùng
 * @throws Error Nếu quan hệ chưa được load
 */
export function requiredRelationName(
  user: { fullName: string } | null | undefined,
  relation: 'measurer',
): string {
  if (!user) {
    throw new Error(
      `Quan hệ ${relation} chưa được load khi ánh xạ dữ liệu ngựa`,
    );
  }
  return user.fullName;
}
