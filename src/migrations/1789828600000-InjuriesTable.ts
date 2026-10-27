import { MigrationInterface, QueryRunner } from 'typeorm';

export class InjuriesTable1789828600000 implements MigrationInterface {
  name = 'InjuriesTable1789828600000';

  /**
   * Tách thông tin cố định của chấn thương ra bảng injuries, injury_markers chỉ còn mức hồi phục theo buổi khám
   *
   * - Gom các dòng cũ thành một chấn thương theo (ngựa, bệnh án của buổi khám, vùng cơ thể, loại); buổi khám ngoài bệnh án gom theo (ngựa, vùng cơ thể, loại)
   * - Tọa độ và buổi khám phát hiện lấy từ dòng sớm nhất của nhóm, ưu tiên dòng thuộc buổi khám chưa hủy; id của dòng đó dùng làm id chấn thương
   * - Mọi dòng injury_markers được gắn injury_id rồi bỏ cột vùng cơ thể, tọa độ, loại
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và chuyển dữ liệu
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "injuries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "horse_id" uuid NOT NULL, "body_region" character varying(80) NOT NULL, "injury_type" character varying(100) NOT NULL, "position" jsonb NOT NULL, "first_medical_record_id" uuid NOT NULL, CONSTRAINT "PK_7fee0e9dfd99db4c3205fd7601e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "injuries_horse_idx" ON "injuries" ("horse_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "injuries" ADD CONSTRAINT "FK_b5d9bfc42029e3ff4de301291b1" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "injuries" ADD CONSTRAINT "FK_34631dd6c6042dddb26559a2562" FOREIGN KEY ("first_medical_record_id") REFERENCES "medical_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ADD "injury_id" uuid`,
    );
    await queryRunner.query(
      `UPDATE "injury_markers" m
          SET "injury_id" = k."first_marker_id"
         FROM (SELECT x."id",
                      first_value(x."id") OVER (
                        PARTITION BY r."horse_id", r."case_id", x."body_region", x."injury_type"
                        ORDER BY (r."voided_at" IS NOT NULL), r."exam_date", x."created_at", x."id"
                      ) AS "first_marker_id"
                 FROM "injury_markers" x
                 JOIN "medical_records" r ON r."id" = x."medical_record_id") k
        WHERE m."id" = k."id"`,
    );
    await queryRunner.query(
      `INSERT INTO "injuries" ("id", "created_at", "horse_id", "body_region", "injury_type", "position", "first_medical_record_id")
       SELECT m."id", m."created_at", r."horse_id", m."body_region", m."injury_type", m."position", m."medical_record_id"
         FROM "injury_markers" m
         JOIN "medical_records" r ON r."id" = m."medical_record_id"
        WHERE m."id" = m."injury_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ALTER COLUMN "injury_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "injury_markers_injury_idx" ON "injury_markers" ("injury_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "injury_markers_record_injury_uq" ON "injury_markers" ("medical_record_id", "injury_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ADD CONSTRAINT "FK_24e880f70d0f6de55a0d8f32763" FOREIGN KEY ("injury_id") REFERENCES "injuries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" DROP COLUMN "body_region"`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" DROP COLUMN "position"`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" DROP COLUMN "injury_type"`,
    );
  }

  /**
   * Đưa vùng cơ thể, tọa độ, loại về lại từng dòng injury_markers rồi bỏ bảng injuries
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema và chuyển dữ liệu
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ADD "body_region" character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ADD "position" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ADD "injury_type" character varying(100)`,
    );
    await queryRunner.query(
      `UPDATE "injury_markers" m
          SET "body_region" = i."body_region",
              "position" = i."position",
              "injury_type" = i."injury_type"
         FROM "injuries" i
        WHERE i."id" = m."injury_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ALTER COLUMN "body_region" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ALTER COLUMN "position" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" ALTER COLUMN "injury_type" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "injury_markers" DROP CONSTRAINT "FK_24e880f70d0f6de55a0d8f32763"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."injury_markers_record_injury_uq"`,
    );
    await queryRunner.query(`DROP INDEX "public"."injury_markers_injury_idx"`);
    await queryRunner.query(
      `ALTER TABLE "injury_markers" DROP COLUMN "injury_id"`,
    );
    await queryRunner.query(`DROP TABLE "injuries"`);
  }
}
