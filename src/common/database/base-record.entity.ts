import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

// Base fields shared by every database entity.
export abstract class BaseRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

// Base entity for records that can be updated and need optimistic locking.
export abstract class MutableRecordEntity extends BaseRecordEntity {
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @VersionColumn()
  version!: number;
}

// Base entity for records that are hidden instead of physically deleted.
export abstract class SoftDeletableRecordEntity extends MutableRecordEntity {
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
