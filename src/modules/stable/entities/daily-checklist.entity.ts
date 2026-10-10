import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { DailyChecklistStatus } from '../constants/daily-checklist-status.enum';
import { DailyChecklistItemEntity } from './daily-checklist-item.entity';

/**
 * DailyChecklistEntity: checklist hàng ngày của groom đối với một con ngựa.
 * Dùng để ghi các việc cần kiểm tra mỗi ngày như ăn uống, vệ sinh, điều kiện sức khỏe.
 */
@Entity({ name: 'daily_checklists' })
@Index('daily_checklists_horse_date_uq', ['horseId', 'checklistDate'], {
  unique: true,
})
@Index('daily_checklists_groom_date_idx', ['groomId', 'checklistDate'])
@Index('daily_checklists_status_date_idx', ['status', 'checklistDate'])
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

  @Column({
    type: 'varchar',
    length: 16,
    default: DailyChecklistStatus.PENDING,
  })
  status!: DailyChecklistStatus;

  @OneToMany(() => DailyChecklistItemEntity, (item) => item.checklist)
  items!: DailyChecklistItemEntity[];

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
