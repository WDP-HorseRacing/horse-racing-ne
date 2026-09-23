const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'src', 'modules');

const featureDomains = {
  horses: [
    'horse-profiles',
    'horse-statuses',
    'horse-ownerships',
    'horse-measurements',
  ],
  stable: [
    'barns',
    'stalls',
    'groom-assignments',
    'feeding-plans',
    'daily-checklists',
    'incidents',
  ],
  training: [
    'training-plans',
    'training-sessions',
    'time-trials',
    'trainging-evaluations',
  ],
  medical: [
    'medical-records',
    'injury-cases',
    'training-locks',
    'care-schedules',
  ],
  performance: [
    'performance-summaries',
    'performance-metrics',
    'performance-details',
  ],
  racing: ['races', 'race-registrations', 'race-results'],
  supplies: ['items', 'requests'],
};

const errors = [];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function moduleFileFor(feature) {
  return feature === 'trainging-evaluations'
    ? 'training-evaluations.module.ts'
    : `${feature}.module.ts`;
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

for (const [domain, features] of Object.entries(featureDomains)) {
  const domainDir = path.join(root, domain);
  const parentFile = path.join(domainDir, `${domain}.module.ts`);
  assert(fs.existsSync(parentFile), `${domain}: missing ${domain}.module.ts`);
  if (!fs.existsSync(parentFile)) continue;

  const parent = read(parentFile);
  assert(
    !/controllers\s*:\s*\[|providers\s*:\s*\[|TypeOrmModule\.forFeature/.test(
      parent,
    ),
    `${domain}: parent module must only compose feature modules`,
  );

  for (const feature of features) {
    const featureDir = path.join(domainDir, feature);
    const featureModuleName = moduleFileFor(feature);
    const featureModule = path.join(featureDir, featureModuleName);
    assert(
      fs.existsSync(featureModule),
      `${domain}/${feature}: missing ${featureModuleName}`,
    );
    if (!fs.existsSync(featureModule)) continue;

    const featureText = read(featureModule);
    const moduleBase = featureModuleName.replace(/\.ts$/, '');
    assert(
      featureText.includes(`@Module({`),
      `${domain}/${feature}: file is not a Nest module`,
    );
    const localControllerImport = /from ['"]\.\/[^'"\n]*controller['"]/.test(
      featureText,
    );
    assert(
      localControllerImport,
      `${domain}/${feature}: module should reference its local controller`,
    );
    assert(
      parent.includes(`./${feature}/${moduleBase}`),
      `${domain}: parent does not import ${feature}/${moduleBase}`,
    );

    const sourceFiles = fs
      .readdirSync(featureDir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));
    assert(
      sourceFiles.length > 0,
      `${domain}/${feature}: feature has no source files`,
    );

    const siblingImportPattern = new RegExp(
      `from ['"](?:\\.\\.?/)+(${features
        .filter((sibling) => sibling !== feature)
        .join('|')})/`,
    );
    for (const sourceFile of sourceFiles) {
      const sourceText = read(path.join(featureDir, sourceFile));
      assert(
        !siblingImportPattern.test(sourceText),
        `${domain}/${feature}: feature imports a sibling feature directly`,
      );
      if (sourceFile.endsWith('.service.ts')) {
        assert(
          sourceText.split(/\r?\n/).length <= 1000,
          `${domain}/${feature}: ${sourceFile} exceeds 1,000 lines`,
        );
      }
    }
  }
}

for (const domain of fs.readdirSync(root)) {
  const domainDir = path.join(root, domain);
  if (!fs.statSync(domainDir).isDirectory() || domain in featureDomains)
    continue;

  const files = [];
  function collect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts'))
        files.push(full);
    }
  }
  collect(domainDir);
  if (files.length >= 20) {
    const parent = path.join(domainDir, `${domain}.module.ts`);
    assert(
      fs.existsSync(parent),
      `${domain}: large domain needs a composition module`,
    );
  }
}

if (errors.length > 0) {
  console.error('Module architecture check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Module architecture check passed.');
}
