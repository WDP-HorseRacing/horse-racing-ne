import axios from 'axios';
import 'dotenv/config';
import pg from 'pg';

// Don user Keycloak "mo coi": sinh ra khi nguoi chua duoc cap login Google
// truoc khi realm dung flow `link existing only`. Chi xet user CO lien ket IdP
// (tao qua broker) va KHONG co row nao trong bang `users` (ke ca da xoa mem).
// Mac dinh chi liet ke. Them --apply de xoa that.
//   pnpm keycloak:cleanup            # xem truoc
//   pnpm keycloak:cleanup --apply    # xoa

const apply = process.argv.includes('--apply');

const required = (value, name) => {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
};

const baseUrl = required(
  process.env.KEYCLOAK_AUTH_SERVER_URL,
  'KEYCLOAK_AUTH_SERVER_URL',
).replace(/\/$/, '');
const realm = encodeURIComponent(
  required(process.env.KEYCLOAK_REALM, 'KEYCLOAK_REALM'),
);
const adminRealm = process.env.KEYCLOAK_ADMIN_REALM ?? 'master';

const token = await axios.post(
  `${baseUrl}/realms/${encodeURIComponent(adminRealm)}/protocol/openid-connect/token`,
  new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? 'admin-cli',
    username: required(
      process.env.KEYCLOAK_ADMIN_USERNAME,
      'KEYCLOAK_ADMIN_USERNAME',
    ),
    password: required(
      process.env.KEYCLOAK_ADMIN_PASSWORD,
      'KEYCLOAK_ADMIN_PASSWORD',
    ),
  }),
  { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
);
const admin = axios.create({
  baseURL: `${baseUrl}/admin/realms/${realm}`,
  headers: { authorization: `Bearer ${token.data.access_token}` },
});

const db = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
await db.connect();
const known = new Set(
  (await db.query('SELECT keycloak_id FROM users')).rows.map((r) =>
    String(r.keycloak_id),
  ),
);
await db.end();

const pageSize = 100;
const orphans = [];
for (let first = 0; ; first += pageSize) {
  const page = (
    await admin.get('/users', {
      params: { first, max: pageSize, briefRepresentation: true },
    })
  ).data;
  for (const user of page) {
    if (known.has(user.id) || user.username.startsWith('service-account-')) {
      continue;
    }
    const links = (
      await admin.get(
        `/users/${encodeURIComponent(user.id)}/federated-identity`,
      )
    ).data;
    if (links.length)
      orphans.push({ ...user, idps: links.map((l) => l.identityProvider) });
  }
  if (page.length < pageSize) break;
}

if (!orphans.length) {
  console.log('Khong co user mo coi.');
  process.exit(0);
}

for (const user of orphans) {
  console.log(
    `${user.id}  ${user.email ?? user.username}  [${user.idps.join(', ')}]`,
  );
}

if (!apply) {
  console.log(`\n${orphans.length} user mo coi. Chay lai voi --apply de xoa.`);
  process.exit(0);
}

for (const user of orphans) {
  await admin.delete(`/users/${encodeURIComponent(user.id)}`);
}
console.log(`\nDa xoa ${orphans.length} user mo coi.`);
