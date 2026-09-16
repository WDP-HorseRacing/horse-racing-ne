import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { NotificationType } from '../constants/notification-type.enum';

/**
 * NotificationEntity: thông báo nội bộ gửi đến người dùng.
 * Dùng cho cảnh báo, nhắc nhở và các sự kiện cần người dùng biết.
 */
@Entity({ name: 'notifications' })
@Index('notifications_event_recipient_uq', ['eventId', 'recipientId'], {
  unique: true,
  where: 'event_id IS NOT NULL',
})
export class NotificationEntity extends MutableRecordEntity {
  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId!: string | null;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recipient_id' })
  recipient!: UserEntity;

  @Column({ type: 'varchar', length: 80, enum: NotificationType })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', length: 16, default: 'NORMAL' })
  priority!: string;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;
}
