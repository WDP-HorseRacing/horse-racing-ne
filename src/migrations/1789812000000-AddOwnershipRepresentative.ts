import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnershipRepresentative1789812000000 implements MigrationInterface {
  name = 'AddOwnershipRepresentative1789812000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ADD "is_representative" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "horse_ownerships_active_rep_uq" ON "horse_ownerships" ("horse_id") WHERE is_representative AND end_date IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."horse_ownerships_active_rep_uq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" DROP COLUMN "is_representative"`,
    );
  }
}
