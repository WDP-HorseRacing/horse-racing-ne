/**
 * Tên domain event phát ra sau khi phân công Groom của một con ngựa thay đổi (giao mới, đổi, gỡ) và transaction đã commit.
 * Payload là GroomAssignmentChangedEvent; module notifications nghe event này để báo Groom mới và Groom cũ.
 */
export const GROOM_ASSIGNMENT_CHANGED_EVENT = 'stable.groom-assignment.changed';

/**
 * Tên domain event phát khi Head Trainer thêm việc vào checklist hôm nay đã sinh của một con ngựa.
 * Payload là ChecklistTaskAddedEvent; module notifications nghe event này để báo Groom của checklist.
 */
export const CHECKLIST_TASK_ADDED_EVENT = 'stable.checklist.task-added';

/**
 * Tên domain event phát khi Veterinarian gắn thêm, miễn hoặc gỡ việc riêng của một con ngựa mà không phải Head Trainer của khu.
 * Payload là CareTaskChangedEvent; module notifications nghe event này để báo Head Trainer của khu chứa ngựa.
 */
export const CARE_TASK_CHANGED_EVENT = 'stable.care-task.changed';

/**
 * Tên domain event phát khi Head Trainer xếp ngựa vào ô chuồng hoặc chuyển ô, trừ khi giao groom mới cùng lúc.
 * Payload là StallHorseMovedEvent; module notifications nghe event này để báo Groom đang phụ trách ngựa.
 */
export const STALL_HORSE_MOVED_EVENT = 'stable.stall.horse-moved';

/**
 * Tên domain event phát khi Groom báo một sự cố tại chuồng.
 * Payload là IncidentReportedEvent; module notifications nghe event này để báo Head Trainer của khu chứa ngựa.
 */
export const INCIDENT_REPORTED_EVENT = 'stable.incident.reported';

/**
 * Tên domain event phát khi Head Trainer chuyển sự cố cho bác sĩ hoặc đóng sự cố; sự cố hệ thống tự đóng không phát event này.
 * Payload là IncidentHandledEvent; module notifications nghe event này để báo người báo sự cố và Groom đang phụ trách ngựa.
 */
export const INCIDENT_HANDLED_EVENT = 'stable.incident.handled';

/**
 * Tên domain event phát khi sự cố thường còn mở quá hạn mà chưa chuyển bác sĩ.
 * Payload là IncidentStaleEvent; module notifications nghe event này để nhắc Head Trainer của khu và Club Manager.
 */
export const INCIDENT_STALE_EVENT = 'stable.incident.stale';

/**
 * Tên domain event phát khi sinh checklist hôm nay vẫn còn ngựa lỗi sau nhiều lần thử.
 * Payload là ChecklistGenerationFailedEvent; module notifications nghe event này để báo Club Manager.
 */
export const CHECKLIST_GENERATION_FAILED_EVENT =
  'stable.checklist.generation-failed';

/**
 * Tên domain event phát khi checklist hôm nay đã sinh đủ sau khi đã báo lỗi.
 * Payload là ChecklistGenerationRecoveredEvent; module notifications nghe event này để báo Club Manager.
 */
export const CHECKLIST_GENERATION_RECOVERED_EVENT =
  'stable.checklist.generation-recovered';
