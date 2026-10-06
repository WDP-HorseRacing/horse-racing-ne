import { MigrationInterface, QueryRunner } from 'typeorm';

export class HorseDateOfDeath1789824300000 implements MigrationInterface {
  name = 'HorseDateOfDeath1789824300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "horses" ADD "date_of_death" date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "horses" DROP COLUMN "date_of_death"`);
  }
}
