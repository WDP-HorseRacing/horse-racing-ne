import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnaccentExtension1789808900000 implements MigrationInterface {
  name = 'UnaccentExtension1789808900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS unaccent`);
  }
}
