import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { SupplyItemEntity } from '../../supplies/entities/supply-item.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';
import {
  CreateFeedingPlansDto,
  FeedingPlanItemInputDto,
  FeedingPlanListQueryDto,
  FeedingPlanResponseDto,
  ReplaceFeedingPlanDto,
} from '../dto/feeding-plan.dto';
import { FeedingPlanItemEntity } from '../entities/feeding-plan-item.entity';
import { FeedingPlanEntity } from '../entities/feeding-plan.entity';
import { toFeedingPlanResponse } from '../mappers/feeding-plan.mapper';
import {
  assertFeedableCategory,
  assertFeedingPlanDraft,
  assertGroomSeesActivePlan,
  assertNoDeletedSupplies,
  assertNoDuplicateMealItems,
  assertOneRationSource,
} from '../policies/feeding-plan.policy';
import { StableAccessService } from '../shared/stable-access.service';

const PLAN_RELATIONS = {
  horse: true,
  creator: true,
  approver: true,
  items: { supplyItem: true },
} as const;

const FEEDING_PLAN_NOT_FOUND = 'Không tìm thấy khẩu phần';

/**
 * Một dòng khẩu phần trước khi ghi, đã chuẩn hóa từ input hoặc từ khẩu phần nguồn
 */
type RationLine = Pick<
  FeedingPlanItemEntity,
  'meal' | 'supplyItemId' | 'quantity' | 'note'
>;

/**
 * Khẩu phần theo từng ngựa: Head Trainer của khu lập, sửa nháp, duyệt; các vai trò khác xem theo phạm vi
 */
@Injectable()
export class FeedingPlansService {
  constructor(
    @InjectRepository(FeedingPlanEntity)
    private readonly plans: Repository<FeedingPlanEntity>,
    private readonly access: StableAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Liệt kê khẩu phần của một con ngựa, mới nhất trước
   *
   * - Groom luôn chỉ nhận bản ACTIVE, bỏ qua bộ lọc trạng thái
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Lọc trạng thái
   * @returns Promise trả về các khẩu phần của ngựa
   * @throws ForbiddenException Nếu tài khoản không hoạt động, Head Trainer xem ngựa ngoài khu, hoặc Groom xem ngựa không do mình phụ trách
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi xem
   */
  async listForHorse(
    actor: Actor,
    horseId: string,
    query: FeedingPlanListQueryDto,
  ): Promise<FeedingPlanResponseDto[]> {
    const manager = this.dataSource.manager;
    const caller = await currentUserForActor(manager, actor);
    await this.access.findHorseForDailyCare(manager, actor, caller.id, horseId);
    const status = this.access.isGroomOnly(actor)
      ? FeedingPlanStatus.ACTIVE
      : query.status;
    const rows = await this.plans.find({
      where: { horseId, ...(status ? { status } : {}) },
      relations: PLAN_RELATIONS,
      withDeleted: true,
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return rows.map(toFeedingPlanResponse);
  }

  /**
   * Lập bản nháp khẩu phần cho một hoặc nhiều ngựa, mỗi ngựa một bản riêng
   *
   * - Dòng lấy từ items, hoặc sao từ khẩu phần copyFromPlanId mà người gọi được xem
   * - Khóa các ngựa theo thứ tự id trước khi ghi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Các ngựa, nguồn dòng khẩu phần và ghi chú
   * @returns Promise trả về các bản nháp vừa lập, theo thứ tự horseIds
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc ngựa (đích hay nguồn) không thuộc khu người gọi
   * @throws BadRequestException Nếu nguồn dòng không đúng một, một bữa trùng vật tư, hoặc vật tư không phải thức ăn/thực phẩm bổ sung
   * @throws NotFoundException Nếu không có ngựa, khẩu phần nguồn hoặc vật tư
   * @throws ConflictException Nếu ngựa chưa có khu, đã chuyển nhượng hoặc đã mất
   */
  async create(
    actor: Actor,
    body: CreateFeedingPlansDto,
  ): Promise<FeedingPlanResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    assertOneRationSource(Boolean(body.items), Boolean(body.copyFromPlanId));
    const ids = await this.dataSource.transaction(async (manager) => {
      const lines = body.copyFromPlanId
        ? await this.copyLines(manager, actor, caller.id, body.copyFromPlanId)
        : toRationLines(body.items ?? []);
      await this.assertFeedableLines(manager, lines);
      const created = new Map<string, string>();
      for (const horseId of [...body.horseIds].sort()) {
        await this.access.lockOperableHorse(
          manager,
          caller.id,
          horseId,
          'FEEDING',
        );
        const plan = await manager.save(
          manager.create(FeedingPlanEntity, {
            horseId,
            status: FeedingPlanStatus.DRAFT,
            note: body.note?.trim() || null,
            createdBy: caller.id,
          }),
        );
        await this.insertLines(manager, plan.id, lines);
        created.set(horseId, plan.id);
      }
      return body.horseIds.map((horseId) => created.get(horseId) as string);
    });
    const rows = await this.plans.find({
      where: { id: In(ids) },
      relations: PLAN_RELATIONS,
      withDeleted: true,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => toFeedingPlanResponse(byId.get(id)!));
  }

  /**
   * Lấy một khẩu phần
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của khẩu phần
   * @returns Promise trả về khẩu phần
   * @throws ForbiddenException Nếu tài khoản không hoạt động, ngựa ngoài phạm vi của người gọi, hoặc Groom xem bản không ACTIVE
   * @throws NotFoundException Nếu không có khẩu phần, hoặc ngựa nằm ngoài phạm vi xem
   */
  async get(actor: Actor, id: string): Promise<FeedingPlanResponseDto> {
    const manager = this.dataSource.manager;
    const caller = await currentUserForActor(manager, actor);
    const plan = await this.findWithRelations(manager, id);
    await this.access.findHorseForDailyCare(
      manager,
      actor,
      caller.id,
      plan.horseId,
    );
    if (this.access.isGroomOnly(actor)) assertGroomSeesActivePlan(plan.status);
    return toFeedingPlanResponse(plan);
  }

  /**
   * Thay toàn bộ dòng và ghi chú của một bản nháp
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của khẩu phần
   * @param body Các dòng mới và ghi chú (null để xóa ghi chú)
   * @returns Promise trả về khẩu phần sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc ngựa không thuộc khu người gọi
   * @throws NotFoundException Nếu không có khẩu phần, ngựa hoặc vật tư
   * @throws ConflictException Nếu ngựa chưa có khu, đã chuyển nhượng hoặc đã mất, hoặc khẩu phần không còn nháp
   * @throws BadRequestException Nếu một bữa trùng vật tư, hoặc vật tư không phải thức ăn/thực phẩm bổ sung
   */
  async replace(
    actor: Actor,
    id: string,
    body: ReplaceFeedingPlanDto,
  ): Promise<FeedingPlanResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockDraftForTrainer(manager, caller.id, id);
      const lines = toRationLines(body.items);
      await this.assertFeedableLines(manager, lines);
      await manager.delete(FeedingPlanItemEntity, { planId: plan.id });
      await this.insertLines(manager, plan.id, lines);
      if (body.note !== undefined) plan.note = body.note?.trim() || null;
      await manager.save(plan);
    });
    return this.get(actor, id);
  }

  /**
   * Xóa một bản nháp
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của khẩu phần
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc ngựa không thuộc khu người gọi
   * @throws NotFoundException Nếu không có khẩu phần hoặc ngựa
   * @throws ConflictException Nếu ngựa chưa có khu, đã chuyển nhượng hoặc đã mất, hoặc khẩu phần không còn nháp
   */
  async remove(actor: Actor, id: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockDraftForTrainer(manager, caller.id, id);
      await manager.remove(plan);
    });
  }

  /**
   * Duyệt bản nháp thành khẩu phần đang áp dụng; bản ACTIVE cũ của ngựa chuyển ARCHIVED
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của khẩu phần
   * @returns Promise trả về khẩu phần sau khi duyệt
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc ngựa không thuộc khu người gọi
   * @throws NotFoundException Nếu không có khẩu phần hoặc ngựa
   * @throws ConflictException Nếu ngựa chưa có khu, đã chuyển nhượng hoặc đã mất, khẩu phần không còn nháp, hoặc còn vật tư đã xóa
   */
  async approve(actor: Actor, id: string): Promise<FeedingPlanResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockDraftForTrainer(manager, caller.id, id);
      const deleted = await manager
        .getRepository(SupplyItemEntity)
        .createQueryBuilder('supply')
        .withDeleted()
        .innerJoin(
          FeedingPlanItemEntity,
          'line',
          'line.supplyItemId = supply.id AND line.planId = :planId',
          { planId: plan.id },
        )
        .where('supply.deletedAt IS NOT NULL')
        .orderBy('supply.name', 'ASC')
        .getMany();
      assertNoDeletedSupplies(deleted.map((supply) => supply.name));
      const now = new Date();
      await manager.update(
        FeedingPlanEntity,
        { horseId: plan.horseId, status: FeedingPlanStatus.ACTIVE },
        { status: FeedingPlanStatus.ARCHIVED, archivedAt: now },
      );
      plan.status = FeedingPlanStatus.ACTIVE;
      plan.approvedBy = caller.id;
      plan.approvedAt = now;
      await manager.save(plan);
    });
    return this.get(actor, id);
  }

  /**
   * Lấy dòng của khẩu phần nguồn mà người gọi được xem, để sao sang bản nháp mới
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param planId UUID của khẩu phần nguồn
   * @returns Promise trả về các dòng của khẩu phần nguồn
   * @throws NotFoundException Nếu không có khẩu phần nguồn hoặc ngựa của nó nằm ngoài phạm vi xem
   * @throws ForbiddenException Nếu ngựa của khẩu phần nguồn không thuộc khu người gọi
   */
  private async copyLines(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    planId: string,
  ): Promise<RationLine[]> {
    const source = await manager.findOne(FeedingPlanEntity, {
      where: { id: planId },
      relations: { items: true },
    });
    if (!source) throw new NotFoundException('Không tìm thấy khẩu phần nguồn');
    await this.access.findHorseForDailyCare(
      manager,
      actor,
      callerId,
      source.horseId,
    );
    return [...source.items]
      .sort((a, b) => a.position - b.position)
      .map(({ meal, supplyItemId, quantity, note }) => ({
        meal,
        supplyItemId,
        quantity,
        note,
      }));
  }

  /**
   * Kiểm các dòng: một bữa không trùng vật tư, vật tư còn dùng và là thức ăn hoặc thực phẩm bổ sung; khóa chia sẻ các vật tư tới hết transaction
   *
   * @param manager EntityManager dùng để query
   * @param lines Các dòng khẩu phần
   * @returns Promise hoàn tất khi các dòng hợp lệ
   * @throws BadRequestException Nếu một bữa trùng vật tư, hoặc vật tư không phải thức ăn/thực phẩm bổ sung
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   */
  private async assertFeedableLines(
    manager: EntityManager,
    lines: readonly RationLine[],
  ): Promise<void> {
    assertNoDuplicateMealItems(lines);
    const ids = [...new Set(lines.map((line) => line.supplyItemId))];
    const supplies = await manager.find(SupplyItemEntity, {
      where: { id: In(ids) },
      lock: { mode: 'pessimistic_read' },
    });
    const byId = new Map(supplies.map((supply) => [supply.id, supply]));
    for (const id of ids) {
      const supply = byId.get(id);
      if (!supply) throw new NotFoundException('Không tìm thấy vật tư');
      assertFeedableCategory(supply.name, supply.category);
    }
  }

  /**
   * Ghi các dòng của một khẩu phần, vị trí theo thứ tự gửi lên
   *
   * @param manager EntityManager của transaction đang chạy
   * @param planId UUID của khẩu phần
   * @param lines Các dòng khẩu phần
   * @returns Promise hoàn tất khi đã ghi
   */
  private async insertLines(
    manager: EntityManager,
    planId: string,
    lines: readonly RationLine[],
  ): Promise<void> {
    await manager.insert(
      FeedingPlanItemEntity,
      lines.map((line, position) => ({ ...line, planId, position })),
    );
  }

  /**
   * Khóa ngựa rồi khóa bản nháp, kiểm Head Trainer phụ trách khu của ngựa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID của người gọi
   * @param id UUID của khẩu phần
   * @returns Promise trả về khẩu phần đã khóa, chắc chắn còn nháp
   * @throws NotFoundException Nếu không có khẩu phần hoặc ngựa
   * @throws ConflictException Nếu ngựa chưa có khu, đã chuyển nhượng hoặc đã mất, hoặc khẩu phần không còn nháp
   * @throws ForbiddenException Nếu ngựa không thuộc khu người gọi
   */
  private async lockDraftForTrainer(
    manager: EntityManager,
    callerId: string,
    id: string,
  ): Promise<FeedingPlanEntity> {
    const found = await manager.findOneBy(FeedingPlanEntity, { id });
    if (!found) throw new NotFoundException(FEEDING_PLAN_NOT_FOUND);
    await this.access.lockOperableHorse(
      manager,
      callerId,
      found.horseId,
      'FEEDING',
    );
    const plan = await manager.findOne(FeedingPlanEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!plan) throw new NotFoundException(FEEDING_PLAN_NOT_FOUND);
    assertFeedingPlanDraft(plan.status);
    return plan;
  }

  /**
   * Đọc khẩu phần kèm ngựa, người lập, người duyệt và dòng (kể cả bản đã xóa)
   *
   * @param manager EntityManager dùng để query
   * @param id UUID của khẩu phần
   * @returns Promise trả về khẩu phần đủ quan hệ để map
   * @throws NotFoundException Nếu không có khẩu phần
   */
  private async findWithRelations(
    manager: EntityManager,
    id: string,
  ): Promise<FeedingPlanEntity> {
    const plan = await manager.findOne(FeedingPlanEntity, {
      where: { id },
      relations: PLAN_RELATIONS,
      withDeleted: true,
    });
    if (!plan) throw new NotFoundException(FEEDING_PLAN_NOT_FOUND);
    return plan;
  }
}

/**
 * Chuẩn hóa dòng khẩu phần từ input
 *
 * @param items Các dòng gửi lên
 * @returns Các dòng sẵn sàng ghi
 */
function toRationLines(
  items: readonly FeedingPlanItemInputDto[],
): RationLine[] {
  return items.map((item) => ({
    meal: item.meal,
    supplyItemId: item.supplyItemId,
    quantity: item.quantity.toString(),
    note: item.note?.trim() || null,
  }));
}
