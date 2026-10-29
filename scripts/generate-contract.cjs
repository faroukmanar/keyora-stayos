const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'packages', 'contracts', 'openapi', 'v1.json');
const outputPath = path.join(root, 'packages', 'contracts', 'src', 'generated.ts');
const document = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

function reference(value) {
  const name = value.split('/').at(-1);
  return `components['schemas']['${name}']`;
}

function toType(schema = {}) {
  if (schema.$ref) return reference(schema.$ref);
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (Array.isArray(schema.type)) return schema.type.map((type) => toType({ ...schema, type })).join(' | ');
  if (schema.type === 'array') return `(${toType(schema.items)})[]`;
  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {}).map(([name, value]) => `      ${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${toType(value)};`);
    if (schema.additionalProperties) properties.push(`      [key: string]: ${schema.additionalProperties === true ? 'unknown' : toType(schema.additionalProperties)};`);
    return `{\n${properties.join('\n')}\n    }`;
  }
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'null') return 'null';
  return 'string';
}

function responseType(response) {
  if (response.$ref) {
    const name = response.$ref.split('/').at(-1);
    return responseType(document.components.responses[name]);
  }
  const schema = response.content?.['application/json']?.schema;
  return schema ? toType(schema) : 'never';
}

function operationType(operation) {
  const lines = [];
  const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
  if (bodySchema) lines.push(`      requestBody: { content: { 'application/json': ${toType(bodySchema)} } };`);
  const responses = Object.entries(operation.responses ?? {}).map(([status, response]) => `        ${JSON.stringify(status)}: ${responseType(response)};`);
  lines.push(`      responses: {\n${responses.join('\n')}\n      };`);
  return `{\n${lines.join('\n')}\n    }`;
}

const pathLines = Object.entries(document.paths).flatMap(([route, pathItem]) => {
  const methods = ['get', 'post', 'put', 'patch', 'delete'].filter((method) => pathItem[method]);
  return [`  ${JSON.stringify(route)}: {`, ...methods.map((method) => `    ${method}: ${operationType(pathItem[method])};`), '  };'];
});
const schemaLines = Object.entries(document.components.schemas).map(([name, schema]) => `    ${JSON.stringify(name)}: ${toType(schema)};`);
const generated = `/**\n * AUTO-GENERATED from packages/contracts/openapi/v1.json.\n * Run npm run contract:generate; do not edit by hand.\n */\nexport interface paths {\n${pathLines.join('\n')}\n}\n\nexport interface components {\n  schemas: {\n${schemaLines.join('\n')}\n  };\n}\n`;

if (process.argv.includes('--check')) {
  const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (existing !== generated) {
    console.error('Generated contract types are stale. Run npm run contract:generate.');
    process.exitCode = 1;
  } else console.log('Generated contract types match the OpenAPI source.');
} else {
  fs.writeFileSync(outputPath, generated);
  console.log(`Generated ${pathLines.filter((line) => line.startsWith('  "')).length} paths and ${schemaLines.length} schemas.`);
}
