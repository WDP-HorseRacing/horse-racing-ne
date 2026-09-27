/**
 * Tên domain event của Flow 3, phát sau khi transaction đã commit. Người nhận từng event theo Flow 3 mục III.7.
 */
export const MEDICAL_EXAM_REQUEST_URGENT_EVENT = 'medical.exam-request.urgent';
export const MEDICAL_TRAINING_LOCK_SET_EVENT = 'medical.training-lock.set';
export const MEDICAL_TRAINING_LOCK_RELEASED_EVENT =
  'medical.training-lock.released';
export const MEDICAL_HEALTH_CHANGED_EVENT = 'medical.health.changed';
export const MEDICAL_CASE_OPENED_EVENT = 'medical.case.opened';
export const MEDICAL_CASE_CLOSED_EVENT = 'medical.case.closed';
export const MEDICAL_CASE_CANCELLED_EVENT = 'medical.case.cancelled';
export const MEDICAL_CASE_COST_ADJUSTED_EVENT = 'medical.case.cost-adjusted';
export const MEDICAL_CHECKUP_OVERDUE_EVENT = 'medical.checkup.overdue';
export const MEDICAL_CARE_SCHEDULE_DUE_EVENT = 'medical.care-schedule.due';
