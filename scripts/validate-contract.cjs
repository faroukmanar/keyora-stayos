const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contractPath = path.join(root, 'packages', 'contracts', 'openapi', 'v1.json');
const generatedPath = path.join(root, 'packages', 'contracts', 'src', 'generated.ts');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const generated = fs.readFileSync(generatedPath, 'utf8');

const fail = (message) => { throw new Error(`Contract validation failed: ${message}`); };
if (contract.openapi !== '3.1.0') fail('OpenAPI 3.1.0 is required');
if (contract.info?.version !== '1.0.0') fail('the checked-in v1 contract must declare version 1.0.0');
if (!contract.components?.securitySchemes?.session) fail('a session security scheme is required');
if (!contract.components?.schemas?.ApiError) fail('the safe API error envelope is missing');
if (!generated.includes("Source: packages/contracts/openapi/v1.json")) fail('generated transport types are not traceable to the source');

const operationIds = new Set();
for (const [route, pathItem] of Object.entries(contract.paths ?? {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem[method];
    if (!operation) continue;
    if (!operation.operationId) fail(`${method.toUpperCase()} ${route} lacks operationId`);
    if (operationIds.has(operation.operationId)) fail(`duplicate operationId ${operation.operationId}`);
    operationIds.add(operation.operationId);
    if (method !== 'get' && route !== '/v1/health') {
      const idempotency = operation.parameters?.some((value) => value.$ref === '#/components/parameters/IdempotencyKey');
      if (!idempotency) fail(`${method.toUpperCase()} ${route} must require Idempotency-Key`);
    }
  }
}

console.log(`Validated KEYORA OpenAPI ${contract.info.version}: ${operationIds.size} operations, ${Object.keys(contract.components.schemas).length} schemas.`);
