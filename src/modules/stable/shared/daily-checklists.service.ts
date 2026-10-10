import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager, In, IsNull, MoreThanOrEqual } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { DailyChecklistStatus } from '../constants/daily-checklist-status.enum';
import { CHECKLIST_TASK_ADDED_EVENT } from '../constants/stable-events.constants';
import { CareTaskTypeEntity } from '../entities/care-task-type.entity';
import { DailyChecklistItemEntity } from '../entities/daily-checklist-item.entity';
import { DailyChecklistEntity } from '../entities/daily-checklist.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';
import { checklistStatusOf } from '../policies/daily-checklist.policy';
import type { ChecklistTaskAddedEvent } from '../types/stable-events.types';

/**
 * Loại việc của một ngày cho một con ngựa: việc chung đang dùng cộng việc riêng còn hiệu lực, theo thứ tự tạo loại việc
 */
const TASK_TYPES_FOR_DAY_SQL = `SELECT t.id
  FROM care_task_types t
 WHERE t.active
   AND (t.applies_to_all
        OR EXISTS (SELECT 1
                     FROM horse_care_tasks h
                    WHERE h.task_type_id = t.id
                      AND h.horse_id = $1
                      AND h.from_date <= $2::date
                      AND h.to_date >= $2::date))
 ORDER BY t.created_at, t.name`;

/**
 * Các thao tác trên checklist hằng ngày mà feature khác trong module stable được gọi (vd groom-assignments khi đổi groom).
 *
 * - Chạy trên manager nơi gọi truyền vào, chung transaction và lock với nơi gọi
 */
@Injectable()
export class DailyChecklistsService {
  constructor(private readonly events: DomainEventPublisher) {}

  /**
   * Chuyển checklist chưa hoàn thành từ một ngày trở đi của groom cũ sang groom mới
   *
   * - Chỉ chuyển checklist của đúng con ngựa, của groom cũ, chưa hoàn thành và có ngày từ fromDate trở đi
   * - Checklist đã hoàn thành hoặc của ngày trước fromDate giữ nguyên tên người đã làm
   * - Lock các checklist sẽ chuyển (pessimistic_write) trước khi kiểm trùng ngày
   * - Groom mới đã có checklist cùng ngày cho ngựa này thì báo lỗi, không gộp và không bỏ qua
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param fromGroomId UUID của groom cũ
   * @param toGroomId UUID của groom mới
   * @param fromDate Ngày bắt đầu chuyển, dạng YYYY-MM-DD (thường là hôm nay theo giờ câu lạc bộ)
   * @returns Promise trả về UUID các checklist đã chuyển
   * @throws ConflictException Nếu groom mới đã có checklist trùng ngày cho ngựa này
   */
  async moveOpenChecklistsToGroom(
    manager: EntityManager,
    horseId: string,
    fromGroomId: string,
    toGroomId: string,
    fromDate: string,
  ): Promise<string[]> {
    // look các checklist của của groom cũ đc phân công từ chưa hoàn thành và có từ ngày fromDate trở đi
    const openChecklists = await manager.find(DailyChecklistEntity, {
      where: {
        horseId,
        groomId: fromGroomId,
        completedAt: IsNull(),
        checklistDate: MoreThanOrEqual(fromDate),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (openChecklists.length === 0) return [];

    // Kiểm tra xem groom mới đã có checklist cùng ngày cho ngựa này thì báo lỗi, không gộp và không bỏ qua
    const clashes = await manager.find(DailyChecklistEntity, {
      where: {
        horseId,
        groomId: toGroomId,
        checklistDate: In(openChecklists.map((c) => c.checklistDate)),
      },
      order: { checklistDate: 'ASC' },
    });
    if (clashes.length > 0) {
      const clashDates = clashes.map((c) => c.checklistDate).join(', ');
      throw new ConflictException(
        `Groom mới đã có checklist của ngựa này vào ngày ${clashDates}, không chuyển được checklist chưa hoàn thành của groom cũ`,
      );
    }

    const ids = openChecklists.map((c) => c.id);
    await manager.update(
      DailyChecklistEntity,
      { id: In(ids) },
      { groomId: toGroomId },
    );
    return ids;
  }

  /**
   * Lấy checklist của ngựa trong một ngày, chưa có thì sinh từ việc chung đang dùng và việc riêng còn hiệu lực
   *
   * - Giao cho Groom đang phụ trách ngựa; ngựa chưa có Groom thì không sinh
   * - Ngày không có việc nào thì không sinh
   * - Khóa chia sẻ row ngựa trước khi đọc, chạy tuần tự với thao tác đang khóa ghi ngựa (gắn việc riêng)
   * - Hai lần gọi cùng lúc không tạo trùng
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param date Ngày cần lấy, YYYY-MM-DD
   * @returns Promise trả về UUID checklist, hoặc null nếu không có và không sinh được
   */
  async ensureChecklist(
    manager: EntityManager,
    horseId: string,
    date: string,
  ): Promise<string | null> {
    await manager.findOne(HorseEntity, {
      where: { id: horseId },
      withDeleted: true,
      lock: { mode: 'pessimistic_read' },
    });
    const existing = await manager.findOneBy(DailyChecklistEntity, {
      horseId,
      checklistDate: date,
    });
    if (existing) return existing.id;
    const assignment = await manager.findOneBy(GroomAssignmentEntity, {
      horseId,
      endAt: IsNull(),
    });
    if (!assignment) return null;
    const types: { id: string }[] = await manager.query(
      TASK_TYPES_FOR_DAY_SQL,
      [horseId, date],
    );
    if (types.length === 0) return null;
    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(DailyChecklistEntity)
      .values({ horseId, groomId: assignment.groomId, checklistDate: date })
      .orIgnore()
      .returning('id')
      .execute();
    const insertedId = (inserted.raw as { id: string }[])[0]?.id;
    if (!insertedId) {
      const winner = await manager.findOneByOrFail(DailyChecklistEntity, {
        horseId,
        checklistDate: date,
      });
      return winner.id;
    }
    await manager.insert(
      DailyChecklistItemEntity,
      types.map((type, position) => ({
        checklistId: insertedId,
        taskTypeId: type.id,
        position,
      })),
    );
    return insertedId;
  }

  /**
   * Thêm một loại việc vào checklist đã sinh của ngựa trong ngày, rồi báo Groom của checklist
   *
   * - Checklist chưa sinh thì không làm gì (lúc sinh sẽ có việc này)
   * - Checklist đã có việc này thì không thêm, không báo
   * - Checklist đang COMPLETED quay về IN_PROGRESS
   * - Ghi CHECKLIST_TASK_ADDED_EVENT vào outbox trong cùng transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param date Ngày của checklist, YYYY-MM-DD
   * @param taskType Loại việc cần thêm
   * @returns Promise trả về true nếu đã thêm việc
   */
  async addTaskToChecklist(
    manager: EntityManager,
    horseId: string,
    date: string,
    taskType: Pick<CareTaskTypeEntity, 'id' | 'name'>,
  ): Promise<boolean> {
    const checklist = await manager.findOne(DailyChecklistEntity, {
      where: { horseId, checklistDate: date },
      lock: { mode: 'pessimistic_write' },
    });
    if (!checklist) return false;
    const lastPosition = await manager.maximum(
      DailyChecklistItemEntity,
      'position',
      { checklistId: checklist.id },
    );
    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(DailyChecklistItemEntity)
      .values({
        checklistId: checklist.id,
        taskTypeId: taskType.id,
        position: (lastPosition ?? -1) + 1,
      })
      .orIgnore()
      .returning('id')
      .execute();
    const itemId = (inserted.raw as { id: string }[])[0]?.id;
    if (!itemId) return false;
    await this.refreshStatus(manager, checklist);
    const event: ChecklistTaskAddedEvent = {
      eventId: itemId,
      checklistId: checklist.id,
      horseId,
      groomId: checklist.groomId,
      taskName: taskType.name,
    };
    await this.events.publish(manager, CHECKLIST_TASK_ADDED_EVENT, event);
    return true;
  }

  /**
   * Tính lại và lưu trạng thái, thời điểm hoàn thành của checklist theo các việc đã xong
   *
   * @param manager EntityManager của transaction đang chạy
   * @param checklist Checklist đã khóa trong transaction
   * @returns Promise trả về checklist sau khi lưu
   */
  async refreshStatus(
    manager: EntityManager,
    checklist: DailyChecklistEntity,
  ): Promise<DailyChecklistEntity> {
    const [counts]: { done: number; total: number }[] = await manager.query(
      `SELECT COUNT(*) FILTER (WHERE done_at IS NOT NULL)::int AS done,
              COUNT(*)::int AS total
         FROM daily_checklist_items
        WHERE checklist_id = $1`,
      [checklist.id],
    );
    const status = checklistStatusOf(counts.done, counts.total);
    checklist.status = status;
    checklist.completedAt =
      status === DailyChecklistStatus.COMPLETED
        ? (checklist.completedAt ?? new Date())
        : null;
    return manager.save(checklist);
  }
}
