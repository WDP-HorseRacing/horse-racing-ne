import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import { AuditEntityType } from '../../src/modules/audit/constants/audit-entity-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../src/modules/horses/enums/horse-status.enum';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../../src/modules/medical/constants/care-schedule.enum';
import {
  ExamRequestSource,
  ExamRequestStatus,
} from '../../src/modules/medical/constants/exam-request.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';

/**
 * Tạo nhanh dữ liệu mẫu bằng SQL thô cho integration test, chỉ điền các cột bắt buộc và cột test cần
 *
 * @param dataSource DataSource của DB test
 * @returns Các hàm insert, mỗi hàm trả về id của dòng vừa tạo
 */
export function fixtures(dataSource: DataSource) {
  /**
   * Tạo người dùng
   *
   * @param role Vai trò
   * @param status Trạng thái tài khoản, mặc định ACTIVE
   * @returns A promise resolving to id người dùng
   */
  const user = async (
    role: UserRole,
    status: UserStatus = UserStatus.ACTIVE,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO users (id, version, keycloak_id, full_name, email, role, status)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [id, randomUUID(), role, `${id}@test.local`, role, status],
    );
    return id;
  };

  /**
   * Tạo khu chuồng
   *
   * @param name Tên khu
   * @returns A promise resolving to id khu
   */
  const barn = async (name: string): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barns (id, version, name) VALUES ($1, 1, $2)`,
      [id, name],
    );
    return id;
  };

  /**
   * Tạo hồ sơ ngựa
   *
   * @param name Tên ngựa
   * @param options Vòng đời, sức khỏe, đã xóa, khu, chủ, ngày tạo
   * @returns A promise resolving to id ngựa
   */
  const horse = async (
    name: string,
    options: {
      lifecycle?: HorseLifecycleStatus;
      health?: HorseHealthStatus;
      deleted?: boolean;
      barnId?: string;
      ownerId?: string;
      createdAt?: string;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO horses (id, version, name, lifecycle_status, health_status, deleted_at, barn_id, owner_id, created_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        name,
        options.lifecycle ?? HorseLifecycleStatus.ACTIVE,
        options.health ?? HorseHealthStatus.ELIGIBLE,
        options.deleted ? new Date() : null,
        options.barnId ?? null,
        options.ownerId ?? null,
        options.createdAt ?? '2026-01-01T03:00:00Z',
      ],
    );
    return id;
  };

  /**
   * Tạo lịch chăm sóc
   *
   * @param horseId Id ngựa
   * @param dueAt Thời điểm đến hạn (ISO)
   * @param options Loại, trạng thái, người được giao
   * @returns A promise resolving to id lịch
   */
  const schedule = async (
    horseId: string,
    dueAt: string,
    options: {
      type?: CareScheduleType;
      status?: CareScheduleStatus;
      assignedTo?: string | null;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO care_schedules (id, version, horse_id, type, due_at, status, assigned_to)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [
        id,
        horseId,
        options.type ?? CareScheduleType.FARRIER,
        dueAt,
        options.status ?? CareScheduleStatus.SCHEDULED,
        options.assignedTo ?? null,
      ],
    );
    return id;
  };

  /**
   * Tạo bệnh án
   *
   * @param horseId Id ngựa
   * @param vetId Id bác sĩ mở bệnh án
   * @param options Trạng thái, thời điểm mở, thời điểm đóng, chi phí
   * @returns A promise resolving to id bệnh án
   */
  const medicalCase = async (
    horseId: string,
    vetId: string,
    options: {
      status?: MedicalCaseStatus;
      openedAt?: string;
      closedAt?: string;
      totalCost?: number;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO medical_cases (id, version, horse_id, opened_at, opened_by, initial_diagnosis, status, closed_at, closed_by, total_cost)
       VALUES ($1, 1, $2, $3, $4, 'Chẩn đoán', $5, $6, $7, $8)`,
      [
        id,
        horseId,
        options.openedAt ?? '2026-09-01T02:00:00Z',
        vetId,
        options.status ?? MedicalCaseStatus.OPEN,
        options.closedAt ?? null,
        options.closedAt ? vetId : null,
        options.totalCost ?? null,
      ],
    );
    return id;
  };

  /**
   * Tạo buổi khám
   *
   * @param horseId Id ngựa
   * @param vetId Id bác sĩ khám
   * @param examDate Thời điểm khám (ISO)
   * @param options Đã hủy, bệnh án chứa buổi khám, ngày hẹn tái khám
   * @returns A promise resolving to id buổi khám
   */
  const visit = async (
    horseId: string,
    vetId: string,
    examDate: string,
    options: { voided?: boolean; caseId?: string; nextVisitAt?: string } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO medical_records (id, horse_id, vet_id, exam_date, resulting_status, kind, voided_at, case_id, next_visit_at)
       VALUES ($1, $2, $3, $4, 'ELIGIBLE', 'ROUTINE', $5, $6, $7)`,
      [
        id,
        horseId,
        vetId,
        examDate,
        options.voided ? new Date() : null,
        options.caseId ?? null,
        options.nextVisitAt ?? null,
      ],
    );
    return id;
  };

  /**
   * Ghi một dòng nhật ký đổi vòng đời ngựa
   *
   * @param horseId Id ngựa
   * @param from Vòng đời trước
   * @param to Vòng đời sau
   * @param at Thời điểm ghi (ISO)
   * @returns A promise resolving khi đã ghi
   */
  const lifecycleAudit = async (
    horseId: string,
    from: HorseLifecycleStatus,
    to: HorseLifecycleStatus,
    at: string,
  ): Promise<void> => {
    await dataSource.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, before_data, after_data, created_at)
       VALUES ('UPDATE', $1, $2, $3, $4, $5)`,
      [
        AuditEntityType.HORSE,
        horseId,
        JSON.stringify({ lifecycleStatus: from }),
        JSON.stringify({ lifecycleStatus: to }),
        at,
      ],
    );
  };

  /**
   * Ghi một dòng nhật ký HORSE có dữ liệu trước và sau tùy ý
   *
   * @param horseId Id ngựa
   * @param before Dữ liệu trước khi đổi
   * @param after Dữ liệu sau khi đổi
   * @param at Thời điểm ghi (ISO)
   * @param options Lý do, tính năng, người thực hiện, loại đối tượng
   * @returns A promise resolving khi đã ghi
   */
  const horseAudit = async (
    horseId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    at: string,
    options: {
      reason?: string;
      feature?: string;
      actorId?: string;
      entityType?: AuditEntityType;
    } = {},
  ): Promise<void> => {
    await dataSource.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, before_data, after_data, created_at, reason, feature, actor_id)
       VALUES ('UPDATE', $1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        options.entityType ?? AuditEntityType.HORSE,
        horseId,
        JSON.stringify(before),
        JSON.stringify(after),
        at,
        options.reason ?? null,
        options.feature ?? null,
        options.actorId ?? null,
      ],
    );
  };

  /**
   * Tạo yêu cầu khám
   *
   * @param horseId Id ngựa
   * @param options Trạng thái, khẩn, thời điểm tạo
   * @returns A promise resolving to id yêu cầu
   */
  const examRequest = async (
    horseId: string,
    options: {
      status?: ExamRequestStatus;
      urgent?: boolean;
      createdAt?: string;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO medical_exam_requests (id, version, horse_id, source, urgent, description, status, created_at)
       VALUES ($1, 1, $2, $3, $4, 'Mô tả', $5, $6)`,
      [
        id,
        horseId,
        ExamRequestSource.STAFF,
        options.urgent ?? false,
        options.status ?? ExamRequestStatus.PENDING,
        options.createdAt ?? '2026-09-20T02:00:00Z',
      ],
    );
    return id;
  };

  /**
   * Tạo một giai đoạn sở hữu
   *
   * @param horseId Id ngựa
   * @param ownerId Id chủ
   * @param startedAt Thời điểm bắt đầu (ISO)
   * @param endedAt Thời điểm kết thúc (ISO), bỏ trống nếu là giai đoạn đang mở
   * @returns A promise resolving to id giai đoạn
   */
  const ownership = async (
    horseId: string,
    ownerId: string,
    startedAt: string,
    endedAt?: string,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_ownerships (id, version, horse_id, owner_id, started_at, ended_at)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [id, horseId, ownerId, startedAt, endedAt ?? null],
    );
    return id;
  };

  return {
    user,
    barn,
    horse,
    ownership,
    schedule,
    medicalCase,
    visit,
    lifecycleAudit,
    horseAudit,
    examRequest,
  };
}
