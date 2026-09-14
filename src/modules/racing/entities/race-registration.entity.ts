import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { RaceEntity } from './race.entity';

@Entity({ name: 'race_registrations' })
@Index('race_registrations_race_horse_uq', ['raceId', 'horseId'], {
  unique: true,
})
export class RaceRegistrationEntity extends MutableRecordEntity {
  @Column({ name: 'race_id', type: 'uuid' })
  raceId!: string;

  @ManyToOne(() => RaceEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'race_id' })
  race!: RaceEntity;

  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requester!: UserEntity;

  @Column({ type: 'varchar', length: 32, default: 'PROPOSED' })
  status!: string;

  @Column({ name: 'owner_approved_at', type: 'timestamptz', nullable: true })
  ownerApprovedAt!: Date | null;

  @Column({ name: 'manager_confirmed_at', type: 'timestamptz', nullable: true })
  managerConfirmedAt!: Date | null;

  @Column({ type: 'smallint', nullable: true })
  placing!: number | null;

  @Column({
    name: 'time_seconds',
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
  })
  timeSeconds!: string | null;
}
