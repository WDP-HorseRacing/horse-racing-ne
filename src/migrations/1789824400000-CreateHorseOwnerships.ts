import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHorseOwnerships1789824400000 implements MigrationInterface {
  name = 'CreateHorseOwnerships1789824400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "horse_ownerships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "horse_id" uuid NOT NULL, "owner_id" uuid NOT NULL, "effective_date" date NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ended_at" TIMESTAMP WITH TIME ZONE, "reason" text, "recorded_by" uuid, CONSTRAINT "PK_horse_ownerships" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "horse_ownerships_open_horse_uq" ON "horse_ownerships" ("horse_id") WHERE ended_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_ownerships_owner_idx" ON "horse_ownerships" ("owner_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ADD CONSTRAINT "FK_3e221b15f14a65f4d32cb42e90a" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ADD CONSTRAINT "FK_d1e3d66782bccda90ac5112c0ed" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_ownerships" ADD CONSTRAINT "FK_c1d17159b7edf9b45f626276ab4" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "horse_ownerships" ("horse_id", "owner_id", "effective_date", "started_at", "version")
       SELECT "id", "owner_id", ("created_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, "created_at", 1
         FROM "horses"
        WHERE "owner_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "horse_ownerships"`);
  }
}
