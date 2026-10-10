import { plainToInstance } from 'class-transformer';
import {
  CareTaskTypeResponseDto,
  HorseCareTaskResponseDto,
} from '../dto/care-task.dto';
import { DailyChecklistResponseDto } from '../dto/daily-checklist.dto';
import type { CareTaskTypeEntity } from '../entities/care-task-type.entity';
import type { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import type { HorseCareTaskEntity } from '../entities/horse-care-task.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Chuyển loại việc sang response
 *
 * @param entity Loại việc
 * @returns Response của loại việc
 */
export function toCareTaskTypeResponse(
  entity: CareTaskTypeEntity,
): CareTaskTypeResponseDto {
  return plainToInstance(CareTaskTypeResponseDto, entity, MAPPER_OPTIONS);
}

/**
 * Chuyển việc riêng của ngựa sang response
 *
 * @param entity Việc riêng, đã load taskType và creator
 * @returns Response của việc riêng
 */
export function toHorseCareTaskResponse(
  entity: HorseCareTaskEntity,
): HorseCareTaskResponseDto {
  return plainToInstance(HorseCareTaskResponseDto, entity, MAPPER_OPTIONS);
}

/**
 * Chuyển checklist sang response, việc sắp theo vị trí
 *
 * @param entity Checklist đã load horse, groom, items.taskType, items.doer (kể cả bản đã xóa)
 * @returns Response của checklist
 */
export function toDailyChecklistResponse(
  entity: DailyChecklistEntity,
): DailyChecklistResponseDto {
  const items = [...entity.items]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.id,
      taskTypeId: item.taskTypeId,
      name: item.taskType.name,
      done: item.doneAt !== null,
      doneAt: item.doneAt,
      doer: item.doneBy ? item.doer : null,
      note: item.note,
    }));
  return plainToInstance(
    DailyChecklistResponseDto,
    { ...entity, horseName: entity.horse.name, items },
    MAPPER_OPTIONS,
  );
}
