import { MigrationInterface, QueryRunner } from 'typeorm';

export class HorseLifecycleReason1789815000000 implements MigrationInterface {
  name = 'HorseLifecycleReason1789815000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "horses" ADD "lifecycle_reason" text`);
    await queryRunner.query(
      `ALTER TABLE "horses" ADD "lifecycle_changed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "horses" ADD "deleted_reason" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horses" DROP COLUMN "deleted_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" DROP COLUMN "lifecycle_changed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" DROP COLUMN "lifecycle_reason"`,
    );
  }
}
