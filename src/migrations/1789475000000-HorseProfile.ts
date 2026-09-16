import { MigrationInterface, QueryRunner } from 'typeorm';

export class HorseProfile1789475000000 implements MigrationInterface {
  name = 'HorseProfile1789475000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horses" ADD "gender" character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD "breed" character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD "color" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD "race_aptitude" character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "horses" ADD "is_reference" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE TABLE "horse_measurements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "horse_id" uuid NOT NULL, "type" character varying(32) NOT NULL, "value" numeric(7,2) NOT NULL, "measured_at" TIMESTAMP WITH TIME ZONE NOT NULL, "measured_by" uuid NOT NULL, CONSTRAINT "PK_horse_measurements" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "horse_measurements_horse_type_measured_idx" ON "horse_measurements" ("horse_id", "type", "measured_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD CONSTRAINT "FK_902fb8f8fab96a222e0f000ed73" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" ADD CONSTRAINT "FK_9d1245b365902a7dccf0b986501" FOREIGN KEY ("measured_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP CONSTRAINT "FK_9d1245b365902a7dccf0b986501"`,
    );
    await queryRunner.query(
      `ALTER TABLE "horse_measurements" DROP CONSTRAINT "FK_902fb8f8fab96a222e0f000ed73"`,
    );
    await queryRunner.query(
      `DROP INDEX "horse_measurements_horse_type_measured_idx"`,
    );
    await queryRunner.query(`DROP TABLE "horse_measurements"`);
    await queryRunner.query(`ALTER TABLE "horses" DROP COLUMN "is_reference"`);
    await queryRunner.query(`ALTER TABLE "horses" DROP COLUMN "race_aptitude"`);
    await queryRunner.query(`ALTER TABLE "horses" DROP COLUMN "color"`);
    await queryRunner.query(`ALTER TABLE "horses" DROP COLUMN "breed"`);
    await queryRunner.query(`ALTER TABLE "horses" DROP COLUMN "gender"`);
  }
}
