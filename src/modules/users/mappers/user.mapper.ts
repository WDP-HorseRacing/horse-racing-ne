import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from '../dto/user.dto';
import type { UserEntity } from '../entities/user.entity';

// Khong tra thang UserEntity ra ngoai: ro keycloakId, passwordHash va version.
export function toUserResponse(entity: UserEntity): UserResponseDto {
  return plainToInstance(UserResponseDto, entity, {
    excludeExtraneousValues: true,
  });
}
