import { plainToInstance } from 'class-transformer';
import { SupplyRequestResponseDto } from '../dto/supply-request.dto';
import type { SupplyRequestEntity } from '../entities/supply-request.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toSupplyRequestResponse(
  entity: SupplyRequestEntity,
): SupplyRequestResponseDto {
  const source = {
    ...entity,
    item: requiredRelation(entity.item, 'item'),
    requester: requiredRelation(entity.requester, 'requester'),
    reviewer: entity.reviewedBy
      ? requiredRelation(entity.reviewer, 'reviewer')
      : null,
    fulfiller: entity.fulfilledBy
      ? requiredRelation(entity.fulfiller, 'fulfiller')
      : null,
  };

  return plainToInstance(SupplyRequestResponseDto, source, MAPPER_OPTIONS);
}

function requiredRelation<T>(relation: T | null | undefined, name: string): T {
  if (!relation) {
    throw new Error(`Quan hệ ${name} chưa được load khi ánh xạ supply request`);
  }
  return relation;
}
