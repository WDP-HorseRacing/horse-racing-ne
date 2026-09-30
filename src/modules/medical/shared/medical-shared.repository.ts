import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { CLUB_TIME_ZONE } from '../../horses/constants/horse.constants';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../horses/enums/horse-status.enum';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import type { CheckupAnchors } from '../policies/medical.policy';

/**
 * Một con ngựa trong đàn cùng các mốc tính hạn khám định kỳ, đọc từ DB.
 */
export interface HorseCheckupAnchorRow extends CheckupAnchors {
  horseId: string;
  horseName: string;
  barnId: string | null;
  stallId: string | null;
  stallCode: string | null;
  healthStatus: HorseHealthStatus;
}

/**
 * Bộ lọc đàn ngựa cho lịch khám và bảng điều khiển y tế (F3.1 mục 3).
 */
export interface HerdFilter {
  horseIds?: string[];
  barnId?: string;
  healthStatus?: HorseHealthStatus;
}

/**
 * Một lịch chăm sóc định kỳ đến hạn, đọc từ DB.
 */
export interface DueCareScheduleRow {
  scheduleId: string;
  horseId: string;
  horseName: string;
  type: CareScheduleType;
  dueDate: string;
  assignedTo: string | null;
}

@Injectable()
export class MedicalSharedRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Tìm bệnh án đang mở của con ngựa (tối đa một, Flow 3 mục III.2.2)
   *
   * @param horseId UUID của ngựa
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns A promise resolving to bệnh án đang mở, hoặc null nếu không có
   */
  findOpenCase(
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<MedicalCaseEntity | null> {
    return manager.findOne(MedicalCaseEntity, {
      where: { horseId, status: MedicalCaseStatus.OPEN },
    });
  }

  /**
   * Đọc đàn ngựa còn được chăm sóc tại câu lạc bộ cùng các mốc tính hạn khám định kỳ (Flow 3 mục III.3, F3.1)
   *
   * - Chỉ lấy ngựa chưa xóa, đang ACTIVE hoặc RETIRED
   * - lastVisitDate: buổi khám chưa hủy có thời điểm khám lớn nhất
   * - reactivatedDate: lần kích hoạt lại gần nhất (nhật ký HORSE chuyển sang ACTIVE từ trạng thái khác), vẫn giữ được khi ngựa sau đó giải nghệ
   * - Mọi ngày đổi sang lịch câu lạc bộ dạng YYYY-MM-DD
   * - Kèm ô chuồng đang xếp (stall_assignments còn mở) để vẽ sơ đồ đàn theo ô (F3.1 khối 1)
   *
   * @param filter Giới hạn theo danh sách ngựa, khu, trạng thái sức khỏe; bỏ trống để lấy cả đàn
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns A promise resolving to từng con ngựa kèm mốc tính hạn, xếp theo tên
   */
  herdCheckupAnchors(
    filter: HerdFilter = {},
    manager: EntityManager = this.dataSource.manager,
  ): Promise<HorseCheckupAnchorRow[]> {
    const params: unknown[] = [
      CLUB_TIME_ZONE,
      HorseLifecycleStatus.ACTIVE,
      HorseLifecycleStatus.RETIRED,
      AuditEntityType.HORSE,
    ];
    const conditions: string[] = [];
    if (filter.horseIds) {
      params.push(filter.horseIds);
      conditions.push(`AND h.id = ANY($${params.length}::uuid[])`);
    }
    if (filter.barnId) {
      params.push(filter.barnId);
      conditions.push(`AND h.barn_id = $${params.length}`);
    }
    if (filter.healthStatus) {
      params.push(filter.healthStatus);
      conditions.push(`AND h.health_status = $${params.length}`);
    }
    return manager.query(
      `SELECT h.id AS "horseId",
              h.name AS "horseName",
              h.barn_id AS "barnId",
              st.id AS "stallId",
              st.code AS "stallCode",
              h.health_status AS "healthStatus",
              to_char(MAX(r.exam_date) AT TIME ZONE $1, 'YYYY-MM-DD') AS "lastVisitDate",
              to_char(h.created_at AT TIME ZONE $1, 'YYYY-MM-DD') AS "createdDate",
              (SELECT to_char(MAX(a.created_at) AT TIME ZONE $1, 'YYYY-MM-DD')
                 FROM audit_logs a
                WHERE a.entity_type = $4
                  AND a.entity_id = h.id
                  AND a.after_data->>'lifecycleStatus' = $2
                  AND a.before_data->>'lifecycleStatus' <> $2
              ) AS "reactivatedDate"
         FROM horses h
         LEFT JOIN medical_records r
                ON r.horse_id = h.id AND r.voided_at IS NULL
         LEFT JOIN stall_assignments sa
                ON sa.horse_id = h.id AND sa.end_at IS NULL
         LEFT JOIN stalls st ON st.id = sa.stall_id
        WHERE h.deleted_at IS NULL
          AND h.lifecycle_status IN ($2, $3)
          ${conditions.join(' ')}
        GROUP BY h.id, st.id
        ORDER BY h.name`,
      params,
    );
  }

  /**
   * Ngày hẹn khám định kỳ đang hiệu lực của các con ngựa (F3.2 mục 3), mỗi ngựa tối đa một
   *
   * @param horseIds Các con ngựa cần lấy
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns A promise resolving to map từ horseId sang lịch hẹn
   */
  async activeAppointments(
    horseIds: string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<string, CareScheduleEntity>> {
    if (horseIds.length === 0) return new Map();
    const appointments = await manager.find(CareScheduleEntity, {
      where: {
        horseId: In(horseIds),
        type: CareScheduleType.ROUTINE_CHECKUP,
        status: CareScheduleStatus.SCHEDULED,
      },
    });
    return new Map(
      appointments.map((appointment) => [appointment.horseId, appointment]),
    );
  }

  /**
   * Lịch tiêm phòng, tẩy giun, kiểm tra móng còn Đã lên lịch và đến hạn tới một ngày (F3.11 mục 5)
   *
   * - Không gồm ngày hẹn khám định kỳ; bỏ ngựa đã chuyển nhượng và hồ sơ đã xóa
   * - Ngày đến hạn tính theo lịch câu lạc bộ
   * - assignedTo chỉ giữ khi người được giao còn hoạt động và còn hợp lệ (Veterinarian, hoặc Groom đang phụ trách ngựa); không thì null để không nhắc nhầm người
   *
   * @param untilDate Lấy lịch có ngày đến hạn không muộn hơn ngày này (YYYY-MM-DD)
   * @param horseIds Giới hạn theo danh sách ngựa; bỏ trống để lấy cả đàn
   * @returns A promise resolving to các lịch đến hạn, ngày đến hạn sớm nhất lên trên
   */
  dueCareSchedules(
    untilDate: string,
    horseIds?: string[],
  ): Promise<DueCareScheduleRow[]> {
    const params: unknown[] = [
      CLUB_TIME_ZONE,
      untilDate,
      CareScheduleStatus.SCHEDULED,
      CareScheduleType.ROUTINE_CHECKUP,
      HorseLifecycleStatus.TRANSFERRED,
      UserStatus.ACTIVE,
      UserRole.VETERINARIAN,
      UserRole.GROOM,
    ];
    let horseFilter = '';
    if (horseIds) {
      params.push(horseIds);
      horseFilter = `AND s.horse_id = ANY($${params.length}::uuid[])`;
    }
    return this.dataSource.query(
      `SELECT s.id AS "scheduleId",
              s.horse_id AS "horseId",
              h.name AS "horseName",
              s.type,
              to_char(s.due_at AT TIME ZONE $1, 'YYYY-MM-DD') AS "dueDate",
              CASE WHEN EXISTS (
                     SELECT 1 FROM users u
                      WHERE u.id = s.assigned_to
                        AND u.deleted_at IS NULL
                        AND u.status = $6
                        AND (u.role = $7
                             OR (u.role = $8 AND EXISTS (
                                   SELECT 1 FROM groom_assignments ga
                                    WHERE ga.horse_id = s.horse_id
                                      AND ga.groom_id = u.id
                                      AND ga.end_at IS NULL)))
                   ) THEN s.assigned_to
              END AS "assignedTo"
         FROM care_schedules s
         JOIN horses h ON h.id = s.horse_id
        WHERE s.status = $3
          AND s.type <> $4
          AND h.deleted_at IS NULL
          AND h.lifecycle_status <> $5
          AND (s.due_at AT TIME ZONE $1)::date <= $2::date
          ${horseFilter}
        ORDER BY s.due_at ASC`,
      params,
    );
  }
}
