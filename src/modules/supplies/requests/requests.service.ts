import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  CreateSupplyRequestDto,
  EditSupplyRequestDto,
  SupplyRequestResponseDto,
  UpdateSupplyRequestStatusDto,
} from '../dto/supply-request.dto';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { SupplyRequestEntity } from '../entities/supply-request.entity';
import { toSupplyRequestResponse } from '../mappers/supply-request.mapper';

const REQUEST_RELATIONS = {
  item: true,
  requester: true,
  reviewer: true,
  fulfiller: true,
} as const;

@Injectable()
export class SupplyRequestsService {
  constructor(
    @InjectRepository(SupplyRequestEntity)
    private readonly requestRepository: Repository<SupplyRequestEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(actor: Actor): Promise<SupplyRequestResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const requests = await this.requestRepository.find({
      relations: REQUEST_RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return requests.map(toSupplyRequestResponse);
  }

  async get(actor: Actor, id: string): Promise<SupplyRequestResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const request = await this.findWithRelations(this.dataSource.manager, id);
    return toSupplyRequestResponse(request);
  }

  async create(
    actor: Actor,
    body: CreateSupplyRequestDto,
  ): Promise<SupplyRequestResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const itemExists = await this.dataSource.manager.exists(SupplyItemEntity, {
      where: { id: body.itemId },
    });
    if (!itemExists) throw new NotFoundException('Không tìm thấy vật tư');

    const request = this.requestRepository.create({
      itemId: body.itemId,
      requestedBy: caller.id,
      quantity: body.quantity.toString(),
      status: SupplyRequestStatus.PENDING,
      note: body.note?.trim() || null,
    });
    const saved = await this.requestRepository.save(request);
    const created = await this.findWithRelations(
      this.dataSource.manager,
      saved.id,
    );
    return toSupplyRequestResponse(created);
  }

  async edit(
    actor: Actor,
    id: string,
    body: EditSupplyRequestDto,
  ): Promise<SupplyRequestResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const updated = await this.dataSource.transaction(async (manager) => {
      const request = await this.findLocked(manager, id);
      this.assertCanEdit(caller.id, caller.role, request);
      if (request.status !== SupplyRequestStatus.PENDING) {
        throw new ConflictException(
          'Chỉ có thể chỉnh sửa yêu cầu đang ở trạng thái PENDING',
        );
      }

      if (body.quantity !== undefined) {
        request.quantity = body.quantity.toString();
      }
      if (body.note !== undefined) {
        request.note = body.note.trim() || null;
      }

      await manager.save(request);
      return this.findWithRelations(manager, request.id);
    });

    return toSupplyRequestResponse(updated);
  }

  async updateStatus(
    actor: Actor,
    id: string,
    body: UpdateSupplyRequestStatusDto,
  ): Promise<SupplyRequestResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const updated = await this.dataSource.transaction(async (manager) => {
      const request = await this.findLocked(manager, id);
      this.assertStatusTransition(request.status, body.status);

      if (
        body.status === SupplyRequestStatus.APPROVED ||
        body.status === SupplyRequestStatus.REJECTED
      ) {
        this.assertRole(caller.role, UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER);
        request.reviewedBy = caller.id;
        request.reviewedAt = new Date();
        request.rejectionReason =
          body.status === SupplyRequestStatus.REJECTED
            ? body.reason?.trim() || null
            : null;
      } else {
        this.assertRole(
          caller.role,
          UserRole.CLUB_MANAGER,
          UserRole.HEAD_TRAINER,
          UserRole.GROOM,
        );
        request.fulfilledBy = caller.id;
        request.fulfilledAt = new Date();
      }

      request.status = body.status;
      await manager.save(request);
      return this.findWithRelations(manager, request.id);
    });

    return toSupplyRequestResponse(updated);
  }

  private async findWithRelations(
    manager: EntityManager,
    id: string,
  ): Promise<SupplyRequestEntity> {
    const request = await manager.findOne(SupplyRequestEntity, {
      where: { id },
      relations: REQUEST_RELATIONS,
    });
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu cấp vật tư');
    return request;
  }

  private async findLocked(
    manager: EntityManager,
    id: string,
  ): Promise<SupplyRequestEntity> {
    const request = await manager.findOne(SupplyRequestEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu cấp vật tư');
    return request;
  }

  private assertCanEdit(
    callerId: string,
    callerRole: UserRole,
    request: SupplyRequestEntity,
  ): void {
    if (
      callerRole !== UserRole.CLUB_MANAGER &&
      request.requestedBy !== callerId
    ) {
      throw new ForbiddenException(
        'Chỉ người tạo yêu cầu hoặc Club Manager mới được chỉnh sửa',
      );
    }
  }

  private assertRole(callerRole: UserRole, ...allowedRoles: UserRole[]): void {
    if (!allowedRoles.includes(callerRole)) {
      throw new ForbiddenException('Không đủ quyền xử lý yêu cầu vật tư');
    }
  }

  private assertStatusTransition(
    current: SupplyRequestStatus,
    next: SupplyRequestStatus,
  ): void {
    const valid =
      (current === SupplyRequestStatus.PENDING &&
        (next === SupplyRequestStatus.APPROVED ||
          next === SupplyRequestStatus.REJECTED)) ||
      (current === SupplyRequestStatus.APPROVED &&
        next === SupplyRequestStatus.FULFILLED);

    if (!valid) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái từ ${current} sang ${next}`,
      );
    }
  }
}
