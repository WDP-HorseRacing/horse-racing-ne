import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { AuditAction } from '../constants/audit-action.enum';
import { AuditEntityType } from '../constants/audit-entity-type.enum';

/**
 * AuditLogEntity: nhật ký thay đổi dữ liệu.
 * Dùng để ghi hành động, đối tượng bị thay đổi và dữ liệu trước/sau để truy vết.
 */
@Entity({ name: 'audit_logs' })
export class AuditLogEntity extends BaseRecordEntity {
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor!: UserEntity | null;

  @Column({ type: 'varchar', length: 100 })
  action!: AuditAction;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType!: AuditEntityType;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ name: 'before_data', type: 'jsonb', nullable: true })
  beforeData!: Record<string, unknown> | null;

  @Column({ name: 'after_data', type: 'jsonb', nullable: true })
  afterData!: Record<string, unknown> | null;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  correlationId!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  feature!: string | null;
}
