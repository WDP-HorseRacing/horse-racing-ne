import { MigrationInterface, QueryRunner } from 'typeorm';

export class OwnershipTimestamps1789813000000 implements MigrationInterface {
  name = 'OwnershipTimestamps1789813000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" RENAME COLUMN "start_date" TO "start_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" RENAME COLUMN "end_date" TO "end_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ALTER COLUMN "start_at" TYPE TIMESTAMP WITH TIME ZONE USING ("start_at"::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ALTER COLUMN "end_at" TYPE TIMESTAMP WITH TIME ZONE USING ("end_at"::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ALTER COLUMN "end_at" TYPE date USING (("end_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ALTER COLUMN "start_at" TYPE date USING (("start_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" RENAME COLUMN "end_at" TO "end_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" RENAME COLUMN "start_at" TO "start_date"`,
    );
  }
}
