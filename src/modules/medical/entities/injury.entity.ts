import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { InjuryBodyRegion, InjuryType } from '../constants/injury-marker.enum';
import type { InjuryPosition } from '../constants/injury-marker.enum';
import { MedicalRecordEntity } from './medical-record.entity';

/**
 * InjuryEntity: một chấn thương của ngựa, chỉ giữ thông tin cố định lúc phát hiện.
 * Mức hồi phục theo từng buổi khám nằm ở InjuryMarkerEntity; không sửa, không xóa.
 */
@Entity({ name: 'injuries' })
@Index('injuries_horse_idx', ['horseId'])
export class InjuryEntity extends BaseRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'body_region', type: 'varchar', length: 80 })
  bodyRegion!: InjuryBodyRegion;

  @Column({ name: 'injury_type', type: 'varchar', length: 100 })
  injuryType!: InjuryType;

  @Column({ type: 'jsonb' })
  position!: InjuryPosition;

  @Column({ name: 'first_medical_record_id', type: 'uuid' })
  firstMedicalRecordId!: string;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'first_medical_record_id' })
  firstMedicalRecord!: MedicalRecordEntity;
}
