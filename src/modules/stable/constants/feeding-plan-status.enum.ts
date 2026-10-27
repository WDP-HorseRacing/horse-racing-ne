/**
 * Trạng thái khẩu phần của một con ngựa
 *
 * - DRAFT: bản nháp, Head Trainer còn sửa được
 * - ACTIVE: đang áp dụng; mỗi ngựa tối đa một bản
 * - ARCHIVED: đã hết hiệu lực, giữ làm lịch sử
 */
export enum FeedingPlanStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}
