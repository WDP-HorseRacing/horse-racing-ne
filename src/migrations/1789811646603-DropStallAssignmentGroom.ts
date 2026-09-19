import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropStallAssignmentGroom1789811646603 implements MigrationInterface {
  name = 'DropStallAssignmentGroom1789811646603';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stall_assignments" DROP CONSTRAINT "FK_b8324be18db3aead0f1f08cce1f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stall_assignments" DROP COLUMN "groom_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stall_assignments" ADD "groom_id" uuid`,
    );
    await queryRunner.query(
      `UPDATE "stall_assignments" sa SET "groom_id" = (SELECT ga."groom_id" FROM "groom_assignments" ga WHERE ga."horse_id" = sa."horse_id" AND ga."start_at" <= COALESCE(sa."end_at", now()) AND (ga."end_at" IS NULL OR ga."end_at" > sa."start_at") ORDER BY ga."start_at" DESC LIMIT 1)`,
    );
    await queryRunner.query(
      `ALTER TABLE "stall_assignments" ADD CONSTRAINT "FK_b8324be18db3aead0f1f08cce1f" FOREIGN KEY ("groom_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}
