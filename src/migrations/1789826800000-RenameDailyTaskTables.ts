import { MigrationInterface, QueryRunner } from 'typeorm';

const RENAMES: Array<[string, string]> = [
  ['care_task_types', 'daily_task_types'],
  ['horse_care_tasks', 'horse_daily_tasks'],
];

const CONSTRAINTS: Array<[string, string, string]> = [
  ['daily_task_types', 'PK_care_task_types', 'PK_daily_task_types'],
  ['horse_daily_tasks', 'PK_horse_care_tasks', 'PK_horse_daily_tasks'],
  [
    'horse_daily_tasks',
    'horse_care_tasks_date_range_ck',
    'horse_daily_tasks_date_range_ck',
  ],
  [
    'horse_daily_tasks',
    'horse_care_tasks_horse_fk',
    'horse_daily_tasks_horse_fk',
  ],
  [
    'horse_daily_tasks',
    'horse_care_tasks_task_type_fk',
    'horse_daily_tasks_task_type_fk',
  ],
  [
    'horse_daily_tasks',
    'horse_care_tasks_created_by_fk',
    'horse_daily_tasks_created_by_fk',
  ],
];

const INDEXES: Array<[string, string]> = [
  ['care_task_types_name_uq', 'daily_task_types_name_uq'],
  ['horse_care_tasks_horse_dates_idx', 'horse_daily_tasks_horse_dates_idx'],
];

export class RenameDailyTaskTables1789826800000 implements MigrationInterface {
  name = 'RenameDailyTaskTables1789826800000';

  /**
   * Đổi tên bảng loại việc và việc riêng của ngựa sang tiền tố daily, kèm tên khóa, ràng buộc và index
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [from, to] of RENAMES) {
      await queryRunner.query(`ALTER TABLE "${from}" RENAME TO "${to}"`);
    }
    for (const [table, from, to] of CONSTRAINTS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME CONSTRAINT "${from}" TO "${to}"`,
      );
    }
    for (const [from, to] of INDEXES) {
      await queryRunner.query(`ALTER INDEX "${from}" RENAME TO "${to}"`);
    }
  }

  /**
   * Trả tên bảng, khóa, ràng buộc và index về tiền tố care
   *
   * @param queryRunner QueryRunner của TypeORM
   * @returns Promise hoàn tất khi đã đổi schema
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [from, to] of INDEXES) {
      await queryRunner.query(`ALTER INDEX "${to}" RENAME TO "${from}"`);
    }
    for (const [table, from, to] of CONSTRAINTS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME CONSTRAINT "${to}" TO "${from}"`,
      );
    }
    for (const [from, to] of RENAMES) {
      await queryRunner.query(`ALTER TABLE "${to}" RENAME TO "${from}"`);
    }
  }
}
