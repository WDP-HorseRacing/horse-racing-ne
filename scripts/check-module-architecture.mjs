#!/usr/bin/env node
/**
 * Kiểm cấu trúc module theo docs/module-development-guide.md (mục 2, 11, 13).
 *
 * Domain đã có feature module con:
 * - Module cha chỉ lắp ráp: không khai báo controllers/providers, không gọi TypeOrmModule.forFeature, và import đủ mọi feature module
 * - Mỗi feature module đăng ký controller (*.controller.ts) và service/repository (*.service.ts, *.repository.ts) nằm trong thư mục của nó
 * - File trong một feature không import trực tiếp từ thư mục feature anh em
 *
 * Domain chưa có feature module:
 * - Có từ MAX_FILES_WITHOUT_FEATURES file TypeScript không phải test trở lên thì báo lỗi (trừ LEGACY_EXCEPTIONS)
 *
 * Mọi domain: service vượt MAX_SERVICE_LINES dòng thì báo lỗi (trừ LEGACY_EXCEPTIONS).
 *
 * Cách dùng: pnpm check:module-architecture. Thoát mã 1 nếu có lỗi.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const MODULES_DIR = path.resolve('src/modules');
const MAX_FILES_WITHOUT_FEATURES = 20;
const MAX_SERVICE_LINES = 1000;
const LEGACY_EXCEPTIONS = new Set(['racing']);
const NON_FEATURE_DIRS = new Set([
  'shared',
  'constants',
  'controllers',
  'dto',
  'entities',
  'enums',
  'listeners',
  'mappers',
  'policies',
  'repositories',
  'services',
  'types',
  'utils',
]);

const errors = [];

/**
 * Liệt kê đệ quy file .ts không phải test trong một thư mục
 *
 * @param dir Thư mục cần duyệt
 * @returns Đường dẫn tuyệt đối các file
 */
function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [full]
      : [];
  });
}

/**
 * Đọc một file TypeScript thành AST
 *
 * @param file Đường dẫn file
 * @returns SourceFile của TypeScript
 */
function parse(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

/**
 * Lấy tên các class được export trong file
 *
 * @param file Đường dẫn file
 * @returns Tên các class export
 */
function exportedClasses(file) {
  const names = [];
  parse(file).forEachChild((node) => {
    if (
      ts.isClassDeclaration(node) &&
      node.name &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      names.push(node.name.text);
    }
  });
  return names;
}

/**
 * Đọc metadata của decorator @Module trong file module
 *
 * @param file Đường dẫn file *.module.ts
 * @returns Tên class module, tên trong imports/controllers/providers và cờ có gọi forFeature
 */
function readModule(file) {
  const result = {
    name: null,
    imports: [],
    controllers: [],
    providers: [],
    forFeature: false,
  };
  const namesIn = (node) =>
    ts.isArrayLiteralExpression(node)
      ? node.elements.map((element) => element.getText())
      : [];
  parse(file).forEachChild((node) => {
    if (!ts.isClassDeclaration(node) || !node.name) return;
    for (const decorator of ts.getDecorators(node) ?? []) {
      const call = decorator.expression;
      if (
        !ts.isCallExpression(call) ||
        call.expression.getText() !== 'Module'
      ) {
        continue;
      }
      result.name = node.name.text;
      const options = call.arguments[0];
      if (!options || !ts.isObjectLiteralExpression(options)) continue;
      for (const property of options.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const key = property.name.getText();
        if (key in result && Array.isArray(result[key])) {
          result[key] = namesIn(property.initializer);
        }
      }
      result.forFeature = options.getText().includes('forFeature');
    }
  });
  return result;
}

/**
 * Lấy các đường dẫn import tương đối của một file
 *
 * @param file Đường dẫn file
 * @returns Chuỗi module specifier của các import
 */
function importSpecifiers(file) {
  const specifiers = [];
  parse(file).forEachChild((node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });
  return specifiers;
}

/**
 * Kiểm một domain đã có feature module con
 *
 * @param domain Tên domain
 * @param domainDir Thư mục domain
 * @param features Tên các thư mục feature
 */
function checkComposedDomain(domain, domainDir, features) {
  const parentFile = path.join(domainDir, `${domain}.module.ts`);
  if (!fs.existsSync(parentFile)) {
    errors.push(`${domain}: thiếu module cha ${domain}.module.ts`);
    return;
  }
  const parent = readModule(parentFile);
  if (parent.controllers.length > 0 || parent.providers.length > 0) {
    errors.push(
      `${domain}: module cha không được khai báo controllers/providers (chỉ lắp ráp feature)`,
    );
  }
  if (parent.forFeature) {
    errors.push(
      `${domain}: module cha không được gọi TypeOrmModule.forFeature`,
    );
  }

  for (const feature of features) {
    const featureDir = path.join(domainDir, feature);
    const moduleFiles = fs
      .readdirSync(featureDir)
      .filter((name) => name.endsWith('.module.ts'));
    for (const moduleName of moduleFiles) {
      const featureModule = readModule(path.join(featureDir, moduleName));
      if (featureModule.name && !parent.imports.includes(featureModule.name)) {
        errors.push(
          `${domain}: module cha chưa import feature ${featureModule.name}`,
        );
      }
      for (const name of fs.readdirSync(featureDir)) {
        const file = path.join(featureDir, name);
        const kind = name.endsWith('.controller.ts')
          ? 'controllers'
          : name.endsWith('.service.ts') || name.endsWith('.repository.ts')
            ? 'providers'
            : null;
        if (!kind) continue;
        for (const className of exportedClasses(file)) {
          if (!featureModule[kind].includes(className)) {
            errors.push(
              `${domain}/${feature}: ${className} chưa được đăng ký trong ${kind} của ${featureModule.name}`,
            );
          }
        }
      }
    }
    for (const file of listSourceFiles(featureDir)) {
      for (const specifier of importSpecifiers(file)) {
        if (!specifier.startsWith('.')) continue;
        const target = path.resolve(path.dirname(file), specifier);
        const relative = path.relative(domainDir, target).split(path.sep);
        if (
          relative.length > 1 &&
          features.includes(relative[0]) &&
          relative[0] !== feature
        ) {
          errors.push(
            `${domain}/${feature}: ${path.relative(domainDir, file)} import feature anh em '${specifier}'`,
          );
        }
      }
    }
  }
}

for (const domain of fs.readdirSync(MODULES_DIR).sort()) {
  const domainDir = path.join(MODULES_DIR, domain);
  if (!fs.statSync(domainDir).isDirectory()) continue;
  const features = fs
    .readdirSync(domainDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !NON_FEATURE_DIRS.has(entry.name) &&
        fs
          .readdirSync(path.join(domainDir, entry.name))
          .some((name) => name.endsWith('.module.ts')),
    )
    .map((entry) => entry.name);
  const sourceFiles = listSourceFiles(domainDir);

  if (features.length > 0) {
    checkComposedDomain(domain, domainDir, features);
  } else if (
    sourceFiles.length >= MAX_FILES_WITHOUT_FEATURES &&
    !LEGACY_EXCEPTIONS.has(domain)
  ) {
    errors.push(
      `${domain}: ${sourceFiles.length} file TypeScript (không tính test) mà chưa tách feature module (ngưỡng ${MAX_FILES_WITHOUT_FEATURES})`,
    );
  }

  if (LEGACY_EXCEPTIONS.has(domain)) continue;
  for (const file of sourceFiles.filter((f) => f.endsWith('.service.ts'))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    if (lines > MAX_SERVICE_LINES) {
      errors.push(
        `${path.relative(MODULES_DIR, file)}: ${lines} dòng, vượt ${MAX_SERVICE_LINES} dòng, cần tách theo use case`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`Kiến trúc module: ${errors.length} lỗi`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Kiến trúc module: không có lỗi');
