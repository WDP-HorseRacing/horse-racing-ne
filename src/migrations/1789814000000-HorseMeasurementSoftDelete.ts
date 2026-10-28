import { MigrationInterface, QueryRunner } from 'typeorm';

export class HorseMeasurementSoftDelete1789814000000 implements MigrationInterface {
  name = 'HorseMeasurementSoftDelete1789814000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP COLUMN "deleted_at"`,
    );
  }
}
