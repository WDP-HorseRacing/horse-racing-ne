import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserStatusDefault1789475100000 implements MigrationInterface {
  name = 'UserStatusDefault1789475100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users" SET "status" = 'INACTIVE' WHERE "status" = 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'INACTIVE'`,
    );
    await queryRunner.query(`DROP INDEX "public"."users_pending_email_uq"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_pending_email_uq" ON "users" ("email") WHERE club_id IS NULL AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
  }
}
