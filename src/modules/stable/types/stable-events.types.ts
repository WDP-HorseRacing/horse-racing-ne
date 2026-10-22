import type { HorseCareTaskMode } from '../constants/horse-care-task-mode.enum';

/**
 * Payload của domain event GROOM_ASSIGNMENT_CHANGED_EVENT, phát sau khi transaction phân công Groom đã commit.
 *
 * - eventId: sinh mới cho mỗi lần đổi, dùng để chống gửi trùng thông báo
 * - newGroomId: Groom vừa được giao, null khi Head Trainer chỉ gỡ Groom mà không giao ai
 * - previousGroomId: Groom vừa bị đổi hoặc bị gỡ, null khi ngựa chưa có Groom trước đó
 */
export interface GroomAssignmentChangedEvent {
  eventId: string;
  horseId: string;
  newGroomId: string | null;
  previousGroomId: string | null;
}

/**
 * Payload của domain event CHECKLIST_TASK_ADDED_EVENT
 *
 * - eventId: UUID của dòng checklist vừa thêm
 * - groomId: Groom đang giữ checklist
 * - taskName: tên việc vừa thêm
 */
export interface ChecklistTaskAddedEvent {
  eventId: string;
  checklistId: string;
  horseId: string;
  groomId: string;
  taskName: string;
}

/**
 * Payload của domain event CARE_TASK_CHANGED_EVENT
 *
 * - eventId: sinh mới cho mỗi lần đổi, dùng để chống gửi trùng thông báo
 * - action: ADDED khi gắn dòng mới, REMOVED khi gỡ dòng
 * - mode: kiểu dòng việc riêng (gắn thêm hoặc miễn)
 * - fromDate, toDate: khoảng ngày của dòng (dòng bị gỡ: khoảng trước khi gỡ), YYYY-MM-DD
 * - note: ghi chú hoặc lý do miễn, null nếu không có
 * - veterinarianId, veterinarianName: bác sĩ đã đổi, chụp lúc đổi
 */
export interface CareTaskChangedEvent {
  eventId: string;
  horseId: string;
  action: 'ADDED' | 'REMOVED';
  mode: HorseCareTaskMode;
  taskName: string;
  fromDate: string;
  toDate: string;
  note: string | null;
  veterinarianId: string;
  veterinarianName: string;
}

/**
 * Payload của domain event INCIDENT_REPORTED_EVENT
 *
 * - eventId: UUID của sự cố
 * - urgent: sự cố khẩn
 * - description: mô tả của Groom
 * - assignedGroomId: Groom đang phụ trách ngựa lúc báo, chỉ có khi người báo không phải Groom đó; null nếu chính Groom phụ trách báo hoặc ngựa chưa có Groom
 */
export interface IncidentReportedEvent {
  eventId: string;
  incidentId: string;
  horseId: string;
  urgent: boolean;
  description: string;
  assignedGroomId: string | null;
}

/**
 * Payload của domain event STALL_HORSE_MOVED_EVENT
 *
 * - eventId: sinh mới cho mỗi lần xếp hoặc chuyển ô, dùng để chống gửi trùng thông báo
 * - barnId, stallCode: khu và mã ô mới, chụp lúc chuyển
 * - movedBy: người đã xếp hoặc chuyển ô
 */
export interface StallHorseMovedEvent {
  eventId: string;
  horseId: string;
  barnId: string;
  stallCode: string;
  movedBy: string;
}

/**
 * Payload của domain event INCIDENT_HANDLED_EVENT
 *
 * - eventId: sinh mới cho mỗi lần chuyển bác sĩ hoặc đóng, dùng để chống gửi trùng thông báo
 * - reportedBy: người đã báo sự cố
 * - handledBy: Head Trainer đã chuyển bác sĩ hoặc đóng sự cố
 * - action: REFERRED khi chuyển bác sĩ, RESOLVED khi đóng
 * - resolution: kết quả xử lý khi đóng, null khi chuyển bác sĩ
 */
export interface IncidentHandledEvent {
  eventId: string;
  incidentId: string;
  horseId: string;
  reportedBy: string;
  handledBy: string;
  action: 'REFERRED' | 'RESOLVED';
  resolution: string | null;
}

/**
 * Payload của domain event INCIDENT_STALE_EVENT
 *
 * - eventId: UUID suy ra cố định từ id sự cố, mỗi sự cố chỉ nhắc một lần
 * - hours: số giờ sự cố đã mở khi bị nhắc
 */
export interface IncidentStaleEvent {
  eventId: string;
  incidentId: string;
  horseId: string;
  description: string;
  hours: number;
}

/**
 * Payload của domain event CHECKLIST_GENERATION_FAILED_EVENT
 *
 * - eventId: UUID suy ra cố định từ ngày, mỗi ngày chỉ báo một lần
 * - date: ngày của checklist, YYYY-MM-DD
 * - horseNames: tên các ngựa chưa sinh được checklist; rỗng khi không đọc được danh sách ngựa
 */
export interface ChecklistGenerationFailedEvent {
  eventId: string;
  date: string;
  horseNames: string[];
}

/**
 * Payload của domain event CHECKLIST_GENERATION_RECOVERED_EVENT
 *
 * - eventId: UUID suy ra cố định từ ngày, mỗi ngày chỉ báo một lần
 * - date: ngày của checklist, YYYY-MM-DD
 */
export interface ChecklistGenerationRecoveredEvent {
  eventId: string;
  date: string;
}
