import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingSubjectNameCaseInsensitive1789830200000 implements MigrationInterface {
  name = 'TrainingSubjectNameCaseInsensitive1789830200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const clashes = (await queryRunner.query(
      `SELECT string_agg('"' || "name" || '"', ', ' ORDER BY "name") AS "names"
         FROM "training_subjects"
        GROUP BY lower("name")
       HAVING count(*) > 1
        ORDER BY lower("name")`,
    )) as Array<{ names: string }>;
    if (clashes.length > 0) {
      throw new Error(
        `Tên môn học trùng nhau khi không phân biệt hoa thường: ${clashes
          .map((clash) => clash.names)
          .join('; ')}. Đổi tên hoặc xóa bớt rồi chạy lại migration`,
      );
    }
    await queryRunner.query(`DROP INDEX "public"."training_subjects_name_uq"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "training_subjects_name_uq" ON "training_subjects" (lower("name"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."training_subjects_name_uq"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "training_subjects_name_uq" ON "training_subjects" ("name")`,
    );
  }
}
