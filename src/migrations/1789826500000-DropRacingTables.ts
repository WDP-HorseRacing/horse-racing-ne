import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropRacingTables1789826500000 implements MigrationInterface {
  name = 'DropRacingTables1789826500000';

  /**
   * Xóa bảng cuộc đua và đăng ký thi đấu
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "race_registrations"`);
    await queryRunner.query(`DROP TABLE "races"`);
  }

  /**
   * Tạo lại bảng cuộc đua và đăng ký thi đấu như lúc khởi tạo schema
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "races" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "name" character varying(200) NOT NULL, "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL, "distance_meters" integer, "surface" character varying(32), "race_class" character varying(80), "max_participants" smallint, "conditions" jsonb, "status" character varying(32) NOT NULL DEFAULT 'PLANNED', CONSTRAINT "PK_ba7d19b382156bc33244426c597" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "race_registrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "race_id" uuid NOT NULL, "horse_id" uuid NOT NULL, "requested_by" uuid NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'PROPOSED', "owner_approved_at" TIMESTAMP WITH TIME ZONE, "manager_confirmed_at" TIMESTAMP WITH TIME ZONE, "placing" smallint, "time_seconds" numeric(10,3), CONSTRAINT "PK_bbcbb587e1381eb51e0e51bc613" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "race_registrations_race_horse_uq" ON "race_registrations" ("race_id", "horse_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "race_registrations" ADD CONSTRAINT "FK_08fcda226baea0824fb7b2206fb" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_registrations" ADD CONSTRAINT "FK_cfb18e4e1529dcc0d18b6deb1e7" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_registrations" ADD CONSTRAINT "FK_d861588e8f04aa8fa01bd6ba231" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}
