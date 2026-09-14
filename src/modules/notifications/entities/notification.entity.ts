import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity({ name: 'notifications' })
@Index('notifications_recipient_read_created_idx', [
  'recipientId',
  'readAt',
  'createdAt',
])
@Index('notifications_event_recipient_uq', ['eventId', 'recipientId'], {
  unique: true,
  where: 'event_id IS NOT NULL',
})
export class NotificationEntity extends MutableRecordEntity {
  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recipient_id' })
  recipient!: UserEntity;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId!: string | null;

  @Column({ type: 'varchar', length: 80 })
  type!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', length: 16, default: 'NORMAL' })
  priority!: string;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;
}
