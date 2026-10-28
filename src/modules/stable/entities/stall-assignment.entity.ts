import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { StallEntity } from './stall.entity';

/**
 * StallAssignmentEntity: lịch sử xếp ngựa vào ô chuồng. Groom phụ trách nằm ở GroomAssignmentEntity.
 * Dùng để đảm bảo một ngựa chỉ đang ở một chuồng, và một chuồng chỉ có một ngựa
 * active trong cùng thời điểm.
 */
@Entity({ name: 'stall_assignments' })
@Index('stall_assignments_active_horse_uq', ['horseId'], {
  unique: true,
  where: 'end_at IS NULL',
})
@Index('stall_assignments_active_stall_uq', ['stallId'], {
  unique: true,
  where: 'end_at IS NULL',
})
export class StallAssignmentEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'stall_id', type: 'uuid' })
  stallId!: string;

  @ManyToOne(() => StallEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stall_id' })
  stall!: StallEntity;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt!: Date | null;
}
