import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'node:path';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export function typeOrmOptions(database: DatabaseConfig): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: database.host,
    port: database.port,
    username: database.username,
    password: database.password,
    database: database.database,
    entities: [join(__dirname, '../../modules/**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, '../../migrations/*{.ts,.js}')],
    synchronize: false,
    migrationsRun: false,
  };
}
