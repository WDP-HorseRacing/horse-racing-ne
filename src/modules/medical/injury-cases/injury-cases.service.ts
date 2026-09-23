import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { findReadableHorse } from '../../horses/utils/horse-access';
import { assertTrainerBarn } from '../../stable/utils/trainer-barn';
import { currentUserForActor } from '../../users/utils/current-user';
import { InjuryMarkerResponseDto } from '../dto/injury-marker.response.dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { toInjuryMarkerResponse } from '../mappers/medical.mapper';

@Injectable()
export class InjuryCasesService {
  constructor(
    @InjectRepository(InjuryMarkerEntity)
    private readonly injuriesRepo: Repository<InjuryMarkerEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy danh sách vết thương của con ngựa.
   *
   * - Horse Owner xem đầy đủ như Veterinarian, nhưng chỉ với ngựa đang sở hữu.
   * - Head Trainer chỉ xem ngựa trong khu mình phụ trách.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Danh sách vết thương
   */
  async listInjuries(
    actor: Actor,
    horseId: string,
  ): Promise<InjuryMarkerResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await findReadableHorse(this.dataSource.manager, actor, caller.id, horseId);
    await assertTrainerBarn(this.dataSource.manager, actor, caller.id, horseId);
    const injuries = await this.injuriesRepo.find({
      where: { medicalRecord: { horseId } },
      order: { createdAt: 'DESC' },
    });
    return injuries.map(toInjuryMarkerResponse);
  }
}
