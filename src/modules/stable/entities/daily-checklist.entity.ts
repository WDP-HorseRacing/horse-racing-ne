import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * DailyChecklistEntity: checklist hàng ngày của groom đối với một con ngựa.
 * Dùng để ghi các việc cần kiểm tra mỗi ngày như ăn uống, vệ sinh, điều kiện sức khỏe.
 */
@Entity({ name: 'daily_checklists' })
@Index(
  'daily_checklists_horse_groom_date_uq',
  ['horseId', 'groomId', 'checklistDate'],
  { unique: true },
)
export class DailyChecklistEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'groom_id', type: 'uuid' })
  groomId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'groom_id' })
  groom!: UserEntity;

  @Column({ name: 'checklist_date', type: 'date' })
  checklistDate!: string;

  @Column({ type: 'jsonb' })
  items!: Record<string, boolean>;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
