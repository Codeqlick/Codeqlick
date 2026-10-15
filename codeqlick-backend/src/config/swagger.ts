/**
 * OpenAPI generation. Isolated in its own file because the Standard Schema converter hook of
 * @nestjs/swagger 12 is new: if its option name or callback signature differs from what is
 * assumed here, this is the only file to fix.
 */
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type SwaggerDocumentOptions } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Converts a Zod 4 schema (seen through the Standard Schema interface) to an OpenAPI 3.0
 * JSON schema. Returns undefined for anything that is not a Zod schema, so Swagger falls
 * back to its default behaviour.
 */
export function zodToOpenApi(
  schema: unknown,
  schemaType?: string,
): { schema: Record<string, unknown> } | undefined {
  if (typeof schema !== 'object' || schema === null) return undefined;
  const standard = (schema as { '~standard'?: { vendor?: unknown } })['~standard'];
  if (!standard || standard.vendor !== 'zod') return undefined;
  try {
    // `target: 'openapi-3.0'` exists since Zod 4.1; the cast keeps this compiling regardless.
    const params = {
      target: 'openapi-3.0',
      io: schemaType === 'output' ? 'output' : 'input',
      unrepresentable: 'any',
    } as unknown as Parameters<typeof z.toJSONSchema>[1];
    const json = z.toJSONSchema(schema as z.ZodType, params);
    return { schema: json as Record<string, unknown> };
  } catch {
    return undefined;
  }
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Codeqlick API')
    .setDescription('REST API of the Codeqlick platform (see docs/architecture.md, section 5).')
    .setVersion('1')
    .addBearerAuth()
    .build();

  const options: SwaggerDocumentOptions = {};
  // Assigned untyped on purpose: keeps compiling even if the option is typed differently.
  Object.assign(options, { standardSchemaConverter: zodToOpenApi });

  const document = SwaggerModule.createDocument(app, config, options);
  SwaggerModule.setup('docs', app, document);
}
