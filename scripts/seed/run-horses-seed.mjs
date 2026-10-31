import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const sqlFile = new URL('./init-horses.sql', import.meta.url);
const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

try {
  await client.connect();
  await client.query('BEGIN');
  try {
    await client.query(await readFile(sqlFile, 'utf8'));
    await client.query('COMMIT');
    console.log(`Seed xong 10 ngựa: ${sqlFile.pathname}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
} catch (error) {
  console.error(`Seed ngựa lỗi: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
