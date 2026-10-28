import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const sqlFile = new URL('./init-data.sql', import.meta.url);

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

try {
  await client.connect();
  await client.query(await readFile(sqlFile, 'utf8'));
  console.log(`Seed xong: ${sqlFile.pathname}`);
} catch (error) {
  console.error(`Seed lỗi: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
