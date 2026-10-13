import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { KeycloakUserService } from '../../src/common/infrastructure/keycloak/user.service';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { UserListQueryDto } from '../../src/modules/users/dto/user.dto';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { UsersService } from '../../src/modules/users/services/users.service';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('UsersService.list search (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let service: UsersService;
  let actor: Actor;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    service = new UsersService(
      dataSource.getRepository(UserEntity),
      {} as KeycloakUserService,
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  const insertUser = async (
    fullName: string,
    email: string,
  ): Promise<string> => {
    const keycloakId = randomUUID();
    await dataSource.query(
      `INSERT INTO users (id, version, keycloak_id, full_name, email, role, status)
       VALUES ($1, 1, $2, $3, $4, $5, 'ACTIVE')`,
      [randomUUID(), keycloakId, fullName, email, UserRole.CLUB_MANAGER],
    );
    return keycloakId;
  };

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const keycloakId = await insertUser('Quản lý', 'cm@test.local');
    actor = { sub: keycloakId, roles: [UserRole.CLUB_MANAGER] };
  });

  const names = async (search: string): Promise<string[]> => {
    const page = await service.list(
      actor,
      Object.assign(new UserListQueryDto(), { page: 1, limit: 50, search }),
    );
    return page.items.map((user) => user.fullName);
  };

  it('treats %, _ and \\ in the search as plain characters', async () => {
    await insertUser('An', 'an_b@test.local');
    await insertUser('Bình', 'anxb@test.local');
    await insertUser('Chi 100%', 'chi@test.local');

    await expect(names('an_b')).resolves.toEqual(['An']);
    await expect(names('%')).resolves.toEqual(['Chi 100%']);
  });
});
