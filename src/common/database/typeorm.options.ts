import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'node:path';

export function typeOrmOptions(databaseUrl: string): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [join(__dirname, '../../modules/**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, '../../migrations/*{.ts,.js}')],
    synchronize: false,
    migrationsRun: false,
  };
}
