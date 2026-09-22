import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * GroomAssignmentEntity: lịch sử groom phụ trách chăm ngựa, độc lập với việc xếp chuồng.
 * Một ngựa chỉ có một groom phụ trách tại một thời điểm (dòng có end_at NULL).
 */
@Entity({ name: 'groom_assignments' })
@Index('groom_assignments_active_horse_uq', ['horseId'], {
  unique: true,
  where: 'end_at IS NULL',
})
@Index('groom_assignments_groom_active_idx', ['groomId', 'endAt'])
export class GroomAssignmentEntity extends MutableRecordEntity {
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

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt!: Date | null;
}
