import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
  MEDICAL_TRAINING_LOCK_SET_EVENT,
} from '../constants/medical-events.constants';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import {
  CreateTrainingLockDto,
  ReleaseTrainingLockDto,
  TrainingLockResponseDto,
} from '../dto';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { toTrainingLockResponse } from '../mappers/medical.mapper';
import {
  assertLockActive,
  assertLockEnd,
  assertNoActiveLock,
} from '../policies/medical.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import { TrainingLockWritesService } from '../shared/training-lock-writes.service';
import type {
  TrainingLockReleasedEvent,
  TrainingLockSetEvent,
} from '../types/medical-events.types';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';

@Injectable()
export class TrainingLockService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TrainingLockEntity)
    private readonly locks: Repository<TrainingLockEntity>,
    private readonly access: MedicalAccessService,
    private readonly lockWrites: TrainingLockWritesService,
    private readonly horseAccess: HorseAccessService,
    private readonly audit: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Bác sĩ đặt khóa huấn luyện cho con ngựa (F3.8)
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa trước khi kiểm
   * - Mỗi ngựa tối đa một lệnh khóa hiệu lực: 409; ngựa đã chuyển nhượng: 409
   * - Thời điểm bắt đầu là lúc đặt; ngày dự kiến gỡ (nếu có) không ở quá khứ
   * - Ngựa đang có bệnh án mở thì lệnh khóa gắn vào bệnh án đó
   * - Sau commit báo Head Trainer của khu và Club Manager (HIGH)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Lý do và ngày dự kiến gỡ
   * @returns A promise resolving to lệnh khóa vừa đặt
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws BadRequestException Nếu ngày dự kiến gỡ ở quá khứ
   * @throws ConflictException Nếu ngựa đã có khóa hiệu lực, hoặc đã chuyển nhượng
   */
  async setLock(
    actor: Actor,
    horseId: string,
    body: CreateTrainingLockDto,
  ): Promise<TrainingLockResponseDto> {
    const now = new Date();
    const lockEnd = body.lockEnd ? new Date(body.lockEnd) : null;
    const lock = await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const active = await manager.exists(TrainingLockEntity, {
        where: { horseId, status: TrainingLockStatus.ACTIVE },
      });
      assertNoActiveLock(active);
      if (lockEnd) assertLockEnd(lockEnd, now);
      const openCase = await this.access.findOpenCase(horseId, manager);
      const saved = await manager.save(
        manager.create(TrainingLockEntity, {
          horseId,
          lockedBy: caller.id,
          reason: body.reason,
          lockStart: now,
          lockEnd,
          status: TrainingLockStatus.ACTIVE,
          releasedBy: null,
          releasedAt: null,
          releaseConclusion: null,
          caseId: openCase?.id ?? null,
        }),
      );
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TRAINING_LOCK,
        entityId: saved.id,
        before: null,
        after: {
          horseId,
          reason: body.reason,
          lockEnd,
          caseId: saved.caseId,
        },
        feature: MEDICAL_AUDIT_FEATURE.TRAINING_LOCK,
      });
      return saved;
    });
    const event: TrainingLockSetEvent = {
      eventId: randomUUID(),
      horseId,
      lockId: lock.id,
      reason: lock.reason,
      expectedEnd: lock.lockEnd,
    };
    this.events.publish(MEDICAL_TRAINING_LOCK_SET_EVENT, event);
    return toTrainingLockResponse(lock);
  }

  /**
   * Bác sĩ gỡ khóa huấn luyện, bắt buộc lý do (F3.8 mục 6)
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa rồi row lệnh khóa
   * - Lệnh khóa đã gỡ: 409
   * - Sau commit báo Head Trainer của khu và Club Manager (NORMAL)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param lockId UUID của lệnh khóa
   * @param body Lý do gỡ khóa
   * @returns A promise resolving to lệnh khóa sau khi gỡ
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có lệnh khóa, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu lệnh khóa đã gỡ, hoặc ngựa đã chuyển nhượng
   */
  async releaseLock(
    actor: Actor,
    lockId: string,
    body: ReleaseTrainingLockDto,
  ): Promise<TrainingLockResponseDto> {
    const { horseId } = await this.findLock(lockId);
    const released = await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const lock = await manager.findOneOrFail(TrainingLockEntity, {
        where: { id: lockId },
        lock: { mode: 'pessimistic_write' },
      });
      assertLockActive(lock.status);
      const changes = await this.lockWrites.releaseLock(manager, lockId, {
        releasedBy: caller.id,
        releasedAt: new Date(),
        releaseConclusion: body.conclusion,
      });
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.TRAINING_LOCK,
        entityId: lockId,
        before: { status: lock.status },
        after: { status: TrainingLockStatus.RELEASED },
        reason: body.conclusion,
        feature: MEDICAL_AUDIT_FEATURE.TRAINING_LOCK,
      });
      return { ...lock, ...changes };
    });
    const event: TrainingLockReleasedEvent = {
      eventId: randomUUID(),
      horseId,
      lockId,
      conclusion: body.conclusion,
    };
    this.events.publish(MEDICAL_TRAINING_LOCK_RELEASED_EVENT, event);
    return toTrainingLockResponse(released);
  }

  /**
   * Lệnh khóa đang hiệu lực và lịch sử khóa của con ngựa, mới nhất lên trên (F3.10 mục 7)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns A promise resolving to danh sách lệnh khóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listByHorse(
    actor: Actor,
    horseId: string,
  ): Promise<TrainingLockResponseDto[]> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    const locks = await this.locks.find({
      where: { horseId },
      order: { lockStart: 'DESC' },
    });
    return locks.map(toTrainingLockResponse);
  }

  /**
   * Chi tiết một lệnh khóa huấn luyện
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param lockId UUID của lệnh khóa
   * @returns A promise resolving to lệnh khóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có lệnh khóa, hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async getLock(
    actor: Actor,
    lockId: string,
  ): Promise<TrainingLockResponseDto> {
    const lock = await this.findLock(lockId);
    await this.horseAccess.findReadableHorseForActor(actor, lock.horseId);
    return toTrainingLockResponse(lock);
  }

  /**
   * Hệ thống tự gỡ lệnh khóa huấn luyện đang ACTIVE của một con ngựa. Dùng cho module khác gọi trong transaction của họ (vd: F1.8 chuyển nhượng ngựa).
   *
   * - Chuyển lệnh khóa sang RELEASED, releasedAt là thời điểm gọi hàm
   * - releasedBy để null vì hệ thống gỡ, không phải bác sĩ gỡ
   * - releaseConclusion ghi đúng lý do nơi gọi truyền vào (vd: "Gỡ do chuyển nhượng")
   * - Không tự mở transaction và không publish event; nơi gọi truyền manager của transaction đang chạy
   * - Mỗi ngựa chỉ có tối đa một lệnh khóa ACTIVE (unique index training_locks_active_horse_uq), nên nhiều nhất một dòng bị gỡ
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param conclusion Kết luận ghi vào lệnh khóa, nói rõ lý do tự gỡ
   * @returns A promise resolving to true nếu có lệnh khóa ACTIVE được gỡ, false nếu ngựa không có lệnh khóa nào đang hiệu lực
   */
  async releaseActiveLockByHorse(
    manager: EntityManager,
    horseId: string,
    conclusion: string,
  ): Promise<boolean> {
    return (
      (await this.lockWrites.releaseActiveLockOfHorse(
        manager,
        horseId,
        conclusion,
      )) > 0
    );
  }

  /**
   * Tìm lệnh khóa theo id
   *
   * @param lockId UUID của lệnh khóa
   * @returns A promise resolving to lệnh khóa
   * @throws NotFoundException Nếu không có lệnh khóa
   */
  private async findLock(lockId: string): Promise<TrainingLockEntity> {
    const lock = await this.locks.findOne({ where: { id: lockId } });
    if (!lock) {
      throw new NotFoundException('Không tìm thấy lệnh khóa huấn luyện');
    }
    return lock;
  }
}
