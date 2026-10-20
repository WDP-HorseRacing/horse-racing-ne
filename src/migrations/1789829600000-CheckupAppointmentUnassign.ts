import { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckupAppointmentUnassign1789829600000 implements MigrationInterface {
  name = 'CheckupAppointmentUnassign1789829600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "care_schedules"
          SET "assignee_type" = NULL, "assigned_to" = NULL
        WHERE "type" = 'ROUTINE_CHECKUP'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "care_schedules" s
          SET "assignee_type" = 'VET', "assigned_to" = a."actor_id"
         FROM (
           SELECT DISTINCT ON (l."entity_id") l."entity_id", l."actor_id"
             FROM "audit_logs" l
             JOIN "users" u ON u."id" = l."actor_id"
            WHERE l."entity_type" = 'CARE_SCHEDULE'
              AND u."role" = 'VETERINARIAN'
            ORDER BY l."entity_id", l."created_at" DESC
         ) a
        WHERE a."entity_id" = s."id"
          AND s."type" = 'ROUTINE_CHECKUP'
          AND s."assignee_type" IS NULL`,
    );
  }
}
