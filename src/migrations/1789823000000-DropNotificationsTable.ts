import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropNotificationsTable1789823000000 implements MigrationInterface {
  name = 'DropNotificationsTable1789823000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notifications"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL, "event_id" uuid, "recipient_id" uuid NOT NULL, "type" character varying(80) NOT NULL, "title" character varying(200) NOT NULL, "message" text NOT NULL, "priority" character varying(16) NOT NULL DEFAULT 'NORMAL', "read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "notifications_event_recipient_uq" ON "notifications" ("event_id", "recipient_id") WHERE event_id IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_5332a4daa46fd3f4e6625dd275d" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}
