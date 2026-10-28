import axios from 'axios';
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const sqlFile = new URL(
  process.argv.includes('--users-only') ? './init-users.sql' : './init-data.sql',
  import.meta.url,
);
const seedPassword = required(process.env.SEED_USER_PASSWORD, 'SEED_USER_PASSWORD');
const realmName = required(process.env.KEYCLOAK_REALM, 'KEYCLOAK_REALM');
const baseUrl = required(
  process.env.KEYCLOAK_AUTH_SERVER_URL ??
    (process.env.AUTH_DOMAIN ? `https://${process.env.AUTH_DOMAIN}` : ''),
  'KEYCLOAK_AUTH_SERVER_URL or AUTH_DOMAIN',
).replace(/\/+$/, '');
const adminRealm = process.env.KEYCLOAK_ADMIN_REALM ?? 'master';
const adminUsername = required(
  process.env.KEYCLOAK_ADMIN_USERNAME ?? process.env.KEYCLOAK_ADMIN,
  'KEYCLOAK_ADMIN_USERNAME or KEYCLOAK_ADMIN',
);
const adminPassword = required(
  process.env.KEYCLOAK_ADMIN_PASSWORD,
  'KEYCLOAK_ADMIN_PASSWORD',
);

const seedUsers = [
  {
    id: '4d2f2949-9d29-4a64-81c0-807c481188f1',
    placeholder: '__KC_CLUB_MANAGER_ID__',
    role: 'CLUB_MANAGER',
    username: 'club.manager@horse.test',
    email: 'club.manager@horse.test',
    firstName: 'Seed',
    lastName: 'Club Manager',
  },
  {
    id: '91315bf7-3eef-4d8c-a403-c20245b6cb36',
    placeholder: '__KC_HEAD_TRAINER_ID__',
    role: 'HEAD_TRAINER',
    username: 'head.trainer@horse.test',
    email: 'head.trainer@horse.test',
    firstName: 'Seed',
    lastName: 'Head Trainer',
  },
  {
    id: '0831b413-cf10-445e-96eb-97f354ef517d',
    placeholder: '__KC_HORSE_OWNER_ID__',
    role: 'HORSE_OWNER',
    username: 'horse.owner@horse.test',
    email: 'horse.owner@horse.test',
    firstName: 'Seed',
    lastName: 'Horse Owner',
  },
  {
    id: '793a2d08-28af-4652-9988-037be0d111de',
    placeholder: '__KC_GROOM_ID__',
    role: 'GROOM',
    username: 'groom@horse.test',
    email: 'groom@horse.test',
    firstName: 'Seed',
    lastName: 'Groom',
  },
  {
    id: 'd5a2188a-ab75-4537-b370-ddfc7c31e8ae',
    placeholder: '__KC_VETERINARIAN_ID__',
    role: 'VETERINARIAN',
    username: 'veterinarian@horse.test',
    email: 'veterinarian@horse.test',
    firstName: 'Seed',
    lastName: 'Veterinarian',
  },
];

function required(value, name) {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function isNotFound(error) {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

async function getAdminClient() {
  const tokenResponse = await axios.post(
    `${baseUrl}/realms/${encodeURIComponent(adminRealm)}/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'password',
      client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? 'admin-cli',
      username: adminUsername,
      password: adminPassword,
    }),
    { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
  );

  return axios.create({
    baseURL: `${baseUrl}/admin/realms/${encodeURIComponent(realmName)}`,
    headers: { authorization: `Bearer ${tokenResponse.data.access_token}` },
  });
}

async function ensureRealmRole(admin, roleName) {
  try {
    return (await admin.get(`/roles/${encodeURIComponent(roleName)}`)).data;
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await admin.post('/roles', { name: roleName, description: roleName });
    return (await admin.get(`/roles/${encodeURIComponent(roleName)}`)).data;
  }
}

async function getUserByUsername(admin, username) {
  const response = await admin.get('/users', {
    params: { username, exact: true },
  });
  return response.data[0] ?? null;
}

async function ensureKeycloakUser(admin, seedUser, role) {
  let user = await getUserByUsername(admin, seedUser.username);
  const userRepresentation = {
    ...(user ?? {}),
    username: seedUser.username,
    email: seedUser.email,
    firstName: seedUser.firstName,
    lastName: seedUser.lastName,
    enabled: true,
    emailVerified: true,
  };

  if (user) {
    await admin.put(`/users/${encodeURIComponent(user.id)}`, userRepresentation);
  } else {
    await admin.post('/users', userRepresentation);
    user = await getUserByUsername(admin, seedUser.username);
  }

  if (!user?.id) {
    throw new Error(`Could not find Keycloak user ${seedUser.username} after create`);
  }

  await admin.put(`/users/${encodeURIComponent(user.id)}/reset-password`, {
    type: 'password',
    value: seedPassword,
    temporary: false,
  });

  const availableRoles = (
    await admin.get(
      `/users/${encodeURIComponent(user.id)}/role-mappings/realm/available`,
    )
  ).data;
  if (availableRoles.some((available) => available.name === role.name)) {
    await admin.post(
      `/users/${encodeURIComponent(user.id)}/role-mappings/realm`,
      [role],
    );
  }

  return user.id;
}

async function seedKeycloakUsers() {
  const admin = await getAdminClient();
  const keycloakIds = new Map();

  for (const user of seedUsers) {
    const role = await ensureRealmRole(admin, user.role);
    const keycloakId = await ensureKeycloakUser(admin, user, role);
    if (!/^[0-9a-f-]{36}$/i.test(keycloakId)) {
      throw new Error(`Keycloak returned a non-UUID user id for ${user.username}`);
    }
    keycloakIds.set(user.placeholder, keycloakId);
    console.log(`Keycloak seed: ${user.email} (${user.role})`);
  }

  return keycloakIds;
}

async function seedDatabase(keycloakIds) {
  const databaseClient = new pg.Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  let sql = await readFile(sqlFile, 'utf8');
  for (const [placeholder, id] of keycloakIds) {
    sql = sql.replaceAll(placeholder, id);
  }
  if (/__KC_[A-Z_]+__/.test(sql)) {
    throw new Error('Seed SQL contains an unresolved Keycloak user id');
  }

  await databaseClient.connect();
  try {
    await databaseClient.query('BEGIN');
    await databaseClient.query(sql);
    await databaseClient.query('COMMIT');
  } catch (error) {
    await databaseClient.query('ROLLBACK');
    throw error;
  } finally {
    await databaseClient.end();
  }
}

try {
  const keycloakIds = await seedKeycloakUsers();
  await seedDatabase(keycloakIds);
  console.log(`Seed xong: ${sqlFile.pathname}`);
} catch (error) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  console.error(
    `Seed lỗi${status ? ` (Keycloak HTTP ${status})` : ''}: ${error.message}`,
  );
  process.exitCode = 1;
}
