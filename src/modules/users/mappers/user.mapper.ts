import { UserResponseDto } from '../dto/user.response.dto';
import { UserEntity } from '../entities/user.entity';

// Khong tra thang UserEntity ra ngoai: ro keycloakId, passwordHash va version.
export function toUserResponse(entity: UserEntity): UserResponseDto {
  return {
    id: entity.id,
    clubId: entity.clubId,
    fullName: entity.fullName,
    email: entity.email,
    role: entity.role,
    status: entity.status,
  };
}
