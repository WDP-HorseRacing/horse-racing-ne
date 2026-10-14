import { AuditFeature } from '../../audit/constants/audit-feature.enum';

/**
 * Mã chức năng ghi vào cột feature của nhật ký thao tác, theo từng nhóm use case chuồng trại
 */
export const STABLE_AUDIT_FEATURE = {
  BARN: AuditFeature.BARN,
  STALL_AND_GROOM: AuditFeature.STALL_GROOM,
} as const;
