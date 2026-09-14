import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHorses1789344000000 implements MigrationInterface {
  name = 'CreateHorses1789344000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE horses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        club_id uuid NOT NULL,
        name varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        version integer NOT NULL DEFAULT 1
      )
    `);
    await queryRunner.query(
      'CREATE INDEX horses_club_id_idx ON horses (club_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE horses');
  }
}
