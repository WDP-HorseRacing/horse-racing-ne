require('reflect-metadata');
require('ts-node/register');

const { readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { PATH_METADATA } = require('@nestjs/common/constants');
const { Test } = require('@nestjs/testing');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { finalizeOpenApi } = require('../src/common/api/finalize-openapi');

const root = join(__dirname, '../src/modules');
const methods = ['get', 'post', 'put', 'patch', 'delete'];

function controllerFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.name.endsWith('controller.ts') ? [path] : [];
  });
}

async function main() {
  const controllers = controllerFiles(root).flatMap((file) =>
    Object.values(require(file)).filter(
      (value) =>
        typeof value === 'function' &&
        Reflect.hasMetadata(PATH_METADATA, value),
    ),
  );
  // useMocker: script nay chi doc metadata decorator, khong goi handler nao.
  // Controller da co constructor (AuthService, UsersService...) nen phai co
  // cho Nest resolve - mock rong la du, va tu dong dung cho controller sau nay.
  const module = await Test.createTestingModule({ controllers })
    .useMocker(() => ({}))
    .compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();

  const document = finalizeOpenApi(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Racehorse API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    ),
  );
  const groups = new Map();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;
      const group = operation.tags?.[0] ?? 'other';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? '',
      });
    }
  }

  const count = [...groups.values()].reduce(
    (sum, rows) => sum + rows.length,
    0,
  );
  const lines = [
    '# API endpoint catalog',
    '',
    `Generated from NestJS controller metadata. ${count} REST operations are registered under \`/api/v1\`.`,
    '',
    'The health operation is functional. Every other operation is a contract-only route that returns HTTP 501 until authentication, authorization and its service are implemented. Request DTOs and operation details are available in Swagger at `/docs` when the API is running.',
    '',
    'Socket.IO uses the `/events` namespace. Its gateway currently rejects connections until JWT handshake authorization and room policies are implemented. Refresh sessions, audit writes, and domain events are internal operations rather than public REST endpoints.',
    '',
  ];
  for (const group of [...groups.keys()].sort()) {
    lines.push(
      `## ${group}`,
      '',
      '| Method | Path | Purpose |',
      '| --- | --- | --- |',
    );
    for (const row of groups
      .get(group)
      .sort(
        (a, b) =>
          a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
      )) {
      lines.push(
        `| ${row.method} | \`${row.path}\` | ${row.summary.replaceAll('|', '\\|')} |`,
      );
    }
    lines.push('');
  }
  writeFileSync(
    join(__dirname, '../docs/api-catalog.md'),
    `${lines.join('\n')}\n`,
  );
  writeFileSync(
    join(__dirname, '../docs/openapi.contracts.json'),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  await app.close();
  process.stdout.write(
    `Wrote catalog and OpenAPI for ${count} operations across ${groups.size} groups.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
