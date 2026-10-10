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
