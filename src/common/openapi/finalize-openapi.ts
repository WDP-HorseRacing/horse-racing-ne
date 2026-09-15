import { OpenAPIObject } from '@nestjs/swagger';

/** Remove Nest's inferred success response from contract-only operations. */
export function finalizeOpenApi(document: OpenAPIObject): OpenAPIObject {
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
  for (const pathItem of Object.values(document.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation?.responses?.['501']) continue;
      for (const status of Object.keys(operation.responses)) {
        if (/^2\d\d$/.test(status)) delete operation.responses[status];
      }
      Object.assign(operation, { 'x-implementation-status': 'contract-only' });
    }
  }
  return document;
}
