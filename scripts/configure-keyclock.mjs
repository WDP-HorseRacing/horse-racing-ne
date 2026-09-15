import axios from 'axios';
import 'dotenv/config';

// Loi cua axios rat on: stack di xuyen node internals, khong noi hong o dau.
// Doi thanh mot dong nguoi doc hieu duoc, roi thoat.
const explain = (error) => {
  if (!axios.isAxiosError(error)) return error.message ?? String(error);
  const { status, data } = error.response ?? {};
  const detail =
    data?.error_description ?? data?.errorMessage ?? data?.error ?? '';
  const where = `${error.config?.method?.toUpperCase() ?? '?'} ${error.config?.url ?? '?'}`;
  if (status === 401) {
    return `${where} -> 401. Sai KEYCLOAK_ADMIN_USERNAME/PASSWORD, hoac tai khoan do khong o realm "${process.env.KEYCLOAK_ADMIN_REALM ?? 'master'}".${detail ? ' (' + detail + ')' : ''}`;
  }
  if (!status) {
    return `${where} -> khong ket noi duoc. Keycloak da chay chua? docker compose -f docker/compose.yaml ps`;
  }
  return `${where} -> ${status}${detail ? ': ' + detail : ''}`;
};

for (const signal of ['uncaughtException', 'unhandledRejection']) {
  process.on(signal, (error) => {
    console.error(`\n✗ ${explain(error)}\n`);
    process.exit(1);
  });
}

const required = (value, name) => {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
};

const baseUrl = required(
  process.env.KEYCLOAK_AUTH_SERVER_URL,
  'KEYCLOAK_AUTH_SERVER_URL',
).replace(/\/$/, '');
const realmName = required(process.env.KEYCLOAK_REALM, 'KEYCLOAK_REALM');
const realm = encodeURIComponent(realmName);
const clientId = required(process.env.KEYCLOAK_CLIENT_ID, 'KEYCLOAK_CLIENT_ID');
const clientSecret = required(process.env.KEYCLOAK_SECRET, 'KEYCLOAK_SECRET');
// Tai khoan admin BOOTSTRAP: do KEYCLOAK_ADMIN_* trong docker/compose.yaml tao,
// luon nam o realm `master`. Chi script nay dung, de tao realm ung dung.
const adminRealm = process.env.KEYCLOAK_ADMIN_REALM ?? 'master';
const redirectUris = (
  process.env.KEYCLOAK_REDIRECT_URI ??
  'http://localhost:3000/api/v1/auth/oidc/*'
)
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const webOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter((v) => v && v !== '*');

const REALM_ROLES = [
  'HEAD_TRAINER',
  'VETERINARIAN',
  'GROOM',
  'HORSE_OWNER',
  'CLUB_MANAGER',
];

// Script luon dang nhap vao realm MASTER: luc nay realm ung dung co the chua
// ton tai, va tai khoan admin cua no thi chac chan chua.
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

const authorization = `Bearer ${token.data.access_token}`;
const root = axios.create({
  baseURL: `${baseUrl}/admin`,
  headers: { authorization },
});
const admin = axios.create({
  baseURL: `${baseUrl}/admin/realms/${realm}`,
  headers: { authorization },
});
const missing = (e) => axios.isAxiosError(e) && e.response?.status === 404;

// 1. Realm  ->  Console: dropdown realm > Create realm
try {
  await root.get(`/realms/${realm}`);
  console.log(`realm "${realmName}" da ton tai`);
} catch (error) {
  if (!missing(error)) throw error;
  await root.post('/realms', {
    realm: realmName,
    enabled: true,
    // NONE vi moi thu chay tren http://localhost. Mac dinh cua Keycloak la
    // EXTERNAL: no mien HTTPS cho dia chi noi bo, nhung Docker NAT lam no
    // nhin request cua host thanh dia chi ngoai -> ca realm tra 403
    // "HTTPS required", ke ca endpoint JWKS. Dung NONE o moi truong that.
    sslRequired: 'NONE',
    registrationAllowed: false,
    loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false,
    resetPasswordAllowed: true,
  });
  console.log(`da tao realm "${realmName}"`);
}

// 1b. sslRequired cho realm da co san (tao tu truoc khi script co buoc nay)
const current = (await root.get(`/realms/${realm}`)).data;
if (current.sslRequired !== 'none') {
  await root.put(`/realms/${realm}`, { ...current, sslRequired: 'NONE' });
  console.log(`da dat sslRequired=NONE cho realm "${realmName}"`);
}

// 2. Confidential client  ->  Console: Clients > Create client
let clients = await admin.get('/clients', { params: { clientId } });
if (!clients.data[0]?.id) {
  await admin.post('/clients', {
    clientId,
    secret: clientSecret,
    protocol: 'openid-connect',
    enabled: true,
    publicClient: false,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: true,
    serviceAccountsEnabled: true,
    implicitFlowEnabled: false,
    redirectUris,
    webOrigins,
  });
  clients = await admin.get('/clients', { params: { clientId } });
  console.log(`da tao client "${clientId}"`);
}
const client = clients.data[0];
if (!client?.id) throw new Error(`Khong cau hinh duoc client "${clientId}"`);
await admin.put(`/clients/${encodeURIComponent(client.id)}`, {
  ...client,
  secret: clientSecret,
  publicClient: false,
  standardFlowEnabled: true,
  directAccessGrantsEnabled: true,
  serviceAccountsEnabled: true,
  redirectUris: [...new Set([...(client.redirectUris ?? []), ...redirectUris])],
  webOrigins: [...new Set([...(client.webOrigins ?? []), ...webOrigins])],
});

// 3. Audience mapper  ->  Console: Client scopes > <client>-dedicated > Add mapper
const mapperName = `${clientId}-audience`;
const mappers = await admin.get(
  `/clients/${encodeURIComponent(client.id)}/protocol-mappers/models`,
);
if (!mappers.data.some((m) => m.name === mapperName)) {
  await admin.post(
    `/clients/${encodeURIComponent(client.id)}/protocol-mappers/models`,
    {
      name: mapperName,
      protocol: 'openid-connect',
      protocolMapper: 'oidc-audience-mapper',
      config: {
        'included.client.audience': clientId,
        'access.token.claim': 'true',
        'id.token.claim': 'false',
        'introspection.token.claim': 'true',
      },
    },
  );
  console.log(`da tao audience mapper "${mapperName}"`);
}

// 4. Realm roles  ->  Console: Realm roles > Create role
for (const name of REALM_ROLES) {
  try {
    await admin.get(`/roles/${encodeURIComponent(name)}`);
  } catch (error) {
    if (!missing(error)) throw error;
    await admin.post('/roles', { name, description: name });
    console.log(`da tao realm role "${name}"`);
  }
}

// 5. Quyen Admin API cho service account cua client
//    Runtime lay token bang client_credentials cua chinh client nay, nen no can
//    4 role realm-management. Thieu `view-realm` thi assignRealmRole hong nhung
//    tao user van chay - nua loi rat kho doan, de script lam cho chac.
const REALM_MANAGEMENT_ROLES = [
  'manage-users',
  'view-users',
  'query-users',
  'view-realm',
];

const [realmManagement] = (
  await admin.get('/clients', { params: { clientId: 'realm-management' } })
).data;
if (!realmManagement?.id) {
  throw new Error('Khong tim thay client "realm-management" trong realm');
}

const serviceAccount = (
  await admin.get(
    `/clients/${encodeURIComponent(client.id)}/service-account-user`,
  )
).data;

const missingRoles = (
  await admin.get(
    `/users/${encodeURIComponent(serviceAccount.id)}/role-mappings/clients/${encodeURIComponent(realmManagement.id)}/available`,
  )
).data.filter((role) => REALM_MANAGEMENT_ROLES.includes(role.name));

if (missingRoles.length) {
  await admin.post(
    `/users/${encodeURIComponent(serviceAccount.id)}/role-mappings/clients/${encodeURIComponent(realmManagement.id)}`,
    missingRoles,
  );
  console.log(
    `da gan realm-management role: ${missingRoles.map((r) => r.name).join(', ')}`,
  );
}

// 6. Google identity provider  ->  Console: Identity providers > Google
//    Bo qua neu chua cau hinh GOOGLE_* - phan con lai cua script van chay duoc.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const provider = {
    alias: 'google',
    providerId: 'google',
    enabled: true,
    // trustEmail: tin email Google tra ve da xac minh -> cho phep lien ket tu
    // dong voi tai khoan cung email da co san trong realm.
    trustEmail: true,
    storeToken: false,
    addReadTokenRoleOnCreate: false,
    authenticateByDefault: false,
    linkOnly: false,
    firstBrokerLoginFlowAlias: 'first broker login',
    config: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      defaultScope: 'openid profile email',
      syncMode: 'IMPORT',
    },
  };

  try {
    await admin.get('/identity-provider/instances/google');
    await admin.put('/identity-provider/instances/google', provider);
    console.log('da cap nhat identity provider "google"');
  } catch (error) {
    if (!missing(error)) throw error;
    await admin.post('/identity-provider/instances', provider);
    console.log('da tao identity provider "google"');
  }

  console.log(
    `  google redirect URI (dan vao Google Cloud Console):\n` +
      `  ${baseUrl}/realms/${realmName}/broker/google/endpoint`,
  );
}

console.log('\nKeycloak da cau hinh xong.');
console.log(`  issuer   ${baseUrl}/realms/${realmName}`);
console.log(
  `  jwks     ${baseUrl}/realms/${realmName}/protocol/openid-connect/certs`,
);
console.log(`  console  ${baseUrl}/admin/master/console/#/${realmName}`);
