require('dotenv/config');

const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');

// Chay: pnpm postman:gen (can API dang chay de doc /docs-json).
// Collection luon ghi de; environment chi tao khi chua co (giu password da dien),
// them --force-env de tao lai.

const port = process.env.PORT ?? 3000;
const openApiUrl =
  process.env.POSTMAN_OPENAPI_URL ?? `http://localhost:${port}/docs-json`;
const outDir = join(__dirname, '../postman');
const collectionFile = join(outDir, 'racehorse.postman_collection.json');
const environmentFile = join(outDir, 'local.postman_environment.json');
const methods = ['get', 'post', 'put', 'patch', 'delete'];

// Khop tai khoan trong scripts/seed/init-data.sql.
const accounts = [
  ['CLUB_MANAGER', 'nhatruong5012@gmail.com'],
  ['HEAD_TRAINER', 'nhatruong5020@gmail.com'],
  ['VETERINARIAN', 'minhff.net@gmail.com'],
  ['GROOM', 'tnhdarkrai1457@gmail.com'],
  ['HORSE_OWNER', 'nhattruong.nguyen0512@gmail.com'],
];

const autoLoginScript = `
(function autoLogin() {
  const auth = pm.request.auth;
  if (auth && auth.type === 'noauth') return;

  const role = pm.environment.get('role');
  const expiresAt = Number(pm.environment.get('accessTokenExpiresAt') || 0);
  const fresh =
    pm.environment.get('accessToken') &&
    pm.environment.get('tokenRole') === role &&
    Date.now() < expiresAt - 15000;
  if (fresh) return;

  const email = pm.environment.get(role + '_email');
  const password = pm.environment.get(role + '_password');
  if (!email || !password) {
    console.error('[auto-login] Thieu ' + role + '_email/' + role + '_password trong environment');
    return;
  }

  pm.sendRequest(
    {
      url: pm.environment.get('baseUrl') + '/api/v1/auth/login',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      body: { mode: 'raw', raw: JSON.stringify({ email, password }) },
    },
    (err, res) => {
      if (err || res.code !== 200) {
        console.error('[auto-login] ' + role + ' that bai', err || res.code, res && res.text());
        return;
      }
      const body = res.json();
      pm.environment.set('accessToken', body.accessToken);
      pm.environment.set('refreshToken', body.refreshToken);
      pm.environment.set('accessTokenExpiresAt', String(Date.now() + body.expiresIn * 1000));
      pm.environment.set('tokenRole', role);
      console.log('[auto-login] Da dang nhap ' + role + ' (' + email + ')');
    },
  );
})();
`.trim();

function resolveRef(document, ref) {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((node, key) => node?.[key], document);
}

function sample(document, schema, seen = new Set()) {
  if (!schema) return undefined;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return {};
    return sample(
      document,
      resolveRef(document, schema.$ref),
      new Set([...seen, schema.$ref]),
    );
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.allOf) {
    return Object.assign(
      {},
      ...schema.allOf.map((part) => sample(document, part, seen)),
    );
  }
  switch (schema.type) {
    case 'object': {
      const result = {};
      for (const [key, value] of Object.entries(schema.properties ?? {})) {
        result[key] = sample(document, value, seen);
      }
      return result;
    }
    case 'array':
      return [sample(document, schema.items, seen)];
    case 'integer':
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return false;
    default:
      return (
        {
          email: 'user@example.com',
          uuid: '00000000-0000-0000-0000-000000000000',
          'date-time': new Date().toISOString(),
          date: new Date().toISOString().slice(0, 10),
        }[schema.format] ?? ''
      );
  }
}

function toRequest(document, path, method, operation) {
  const params = operation.parameters ?? [];
  const pathVars = params.filter((param) => param.in === 'path');
  const query = params.filter((param) => param.in === 'query');
  const segments = path
    .replace(/\{(\w+)\}/g, ':$1')
    .split('/')
    .filter(Boolean);
  const isPublic = !operation.security?.length;
  const contractOnly = operation['x-implementation-status'] === 'contract-only';

  const request = {
    method: method.toUpperCase(),
    header: [],
    url: {
      raw: `{{baseUrl}}/${segments.join('/')}`,
      host: ['{{baseUrl}}'],
      path: segments,
      variable: pathVars.map((param) => ({
        key: param.name,
        value: '',
        description: param.description ?? '',
      })),
      query: query.map((param) => {
        const value = sample(document, param.schema);
        return {
          key: param.name,
          value: value === undefined ? '' : String(value),
          description: param.description ?? '',
          disabled: !param.required,
        };
      }),
    },
    description: [
      operation.description,
      contractOnly ? 'Chua implement: tra 501.' : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
  if (isPublic) request.auth = { type: 'noauth' };

  const jsonBody = operation.requestBody?.content?.['application/json'];
  if (jsonBody) {
    request.header.push({ key: 'Content-Type', value: 'application/json' });
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(sample(document, jsonBody.schema) ?? {}, null, 2),
      options: { raw: { language: 'json' } },
    };
  }

  const name = `${contractOnly ? '[501] ' : ''}${operation.summary ?? `${request.method} ${path}`}`;
  return { name, request };
}

function buildCollection(document) {
  const folders = new Map();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;
      const tag = operation.tags?.[0] ?? 'other';
      if (!folders.has(tag)) folders.set(tag, []);
      folders.get(tag).push(toRequest(document, path, method, operation));
    }
  }
  return {
    info: {
      _postman_id: '5b9e0f3a-7c1d-4e2b-9f6a-2d8c4b1e7a90',
      name: document.info?.title ?? 'Racehorse API',
      description:
        'Sinh tu /docs-json bang `pnpm postman:gen`. Chon role trong environment, request tu dang nhap.',
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
    },
    event: [
      {
        listen: 'prerequest',
        script: { type: 'text/javascript', exec: autoLoginScript.split('\n') },
      },
    ],
    item: [...folders.keys()].sort().map((tag) => ({
      name: tag,
      item: folders.get(tag),
    })),
  };
}

function buildEnvironment() {
  const values = [
    { key: 'baseUrl', value: `http://localhost:${port}`, type: 'default' },
    { key: 'role', value: 'CLUB_MANAGER', type: 'default' },
    ...accounts.flatMap(([role, email]) => [
      { key: `${role}_email`, value: email, type: 'default' },
      { key: `${role}_password`, value: '', type: 'secret' },
    ]),
    { key: 'accessToken', value: '', type: 'secret' },
    { key: 'refreshToken', value: '', type: 'secret' },
    { key: 'accessTokenExpiresAt', value: '', type: 'default' },
    { key: 'tokenRole', value: '', type: 'default' },
  ];
  return {
    id: randomUUID(),
    name: 'Racehorse Local',
    values: values.map((value) => ({ ...value, enabled: true })),
    _postman_variable_scope: 'environment',
  };
}

async function main() {
  const response = await fetch(openApiUrl);
  if (!response.ok) {
    throw new Error(
      `GET ${openApiUrl} -> ${response.status}. API da chay chua?`,
    );
  }
  const document = await response.json();
  const collection = buildCollection(document);
  const count = collection.item.reduce(
    (sum, folder) => sum + folder.item.length,
    0,
  );

  mkdirSync(outDir, { recursive: true });
  writeFileSync(collectionFile, `${JSON.stringify(collection, null, 2)}\n`);
  const writeEnv =
    !existsSync(environmentFile) || process.argv.includes('--force-env');
  if (writeEnv) {
    writeFileSync(
      environmentFile,
      `${JSON.stringify(buildEnvironment(), null, 2)}\n`,
    );
  }
  process.stdout.write(
    `Wrote ${count} requests in ${collection.item.length} folders -> ${collectionFile}\n` +
      (writeEnv
        ? `Wrote environment -> ${environmentFile}\n`
        : 'Environment da co, giu nguyen (--force-env de tao lai).\n'),
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
