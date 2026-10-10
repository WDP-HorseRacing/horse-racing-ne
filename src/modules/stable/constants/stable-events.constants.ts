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
 * Tên domain event phát khi Groom báo một sự cố tại chuồng.
 * Payload là IncidentReportedEvent; module notifications nghe event này để báo Head Trainer của khu chứa ngựa.
 */
export const INCIDENT_REPORTED_EVENT = 'stable.incident.reported';

/**
 * Tên domain event phát khi sự cố thường còn mở quá hạn mà chưa chuyển bác sĩ.
 * Payload là IncidentStaleEvent; module notifications nghe event này để nhắc Head Trainer của khu và Club Manager.
 */
export const INCIDENT_STALE_EVENT = 'stable.incident.stale';
