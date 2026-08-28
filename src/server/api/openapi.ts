import {
  DELIVERY_ID_HEADER,
  DELIVERY_ID_MAX,
  MAX_BODY_BYTES,
  MEMBER_WEBHOOK_PATH,
} from './webhook-routes.ts'
import {
  exampleMember,
  MEMBER_FIELD_SPECS,
} from '#/server/members/member-fields.ts'
import type { MemberFieldSpec } from '#/server/members/member-fields.ts'
import { toYaml } from '#/server/shared/yaml.ts'

/** Where the generated document is checked in, relative to the repo root. */
export const MEMBER_WEBHOOK_OPENAPI_PATH =
  'docs/api/members-webhook.openapi.yaml'

export const OPENAPI_VERSION = '3.1.0'

/** Bumped by hand when the wire contract changes in a way clients must notice. */
export const MEMBER_WEBHOOK_API_VERSION = '1.0.0'

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** One field spec → its JSON Schema fragment. */
function fieldSchema(spec: MemberFieldSpec): JsonValue {
  const base: Record<string, JsonValue> = {}

  if (spec.type === 'boolean') {
    base['type'] = 'boolean'
    if (spec.default !== undefined) {
      base['default'] = spec.default
    }
  } else {
    base['type'] = spec.nullable ? ['string', 'null'] : 'string'
    if (spec.enumValues !== undefined) {
      base['enum'] = [...spec.enumValues]
    }
    if (spec.maxLength !== undefined) {
      base['maxLength'] = spec.maxLength
    }
    if (spec.pattern !== undefined) {
      base['pattern'] = spec.pattern
    }
  }

  base['description'] = spec.description
  if (spec.example !== null) {
    base['examples'] = [spec.example]
  }
  return base
}

function memberSchema(): JsonValue {
  const properties: Record<string, JsonValue> = {}
  for (const spec of MEMBER_FIELD_SPECS) {
    properties[spec.name] = fieldSchema(spec)
  }
  return {
    type: 'object',
    description:
      'Unknown fields are ignored rather than rejected. `introduction` is not part of the contract for now: a push never overwrites the bio stored in the database.',
    required: MEMBER_FIELD_SPECS.filter((spec) => spec.required).map(
      (spec) => spec.name,
    ),
    properties,
    examples: [exampleMember()],
  }
}

function errorSchema(description: string): JsonValue {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
      },
    },
  }
}

/**
 * Builds the OpenAPI document for the member webhook straight from the
 * server's own constants and field specs — never hand-maintained, so the
 * published contract cannot drift from the enforced one.
 */
export function buildMemberWebhookOpenApi(): JsonValue {
  const example = exampleMember() as JsonValue

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'BSS member update webhook',
      version: MEMBER_WEBHOOK_API_VERSION,
      description: [
        'This file is generated — do not edit by hand. Regenerate with `pnpm openapi:generate`.',
      ].join('\n'),
    },
    servers: [{ url: 'https://bss.kir-dev.hu', description: 'Lois' }],
    tags: [
      {
        name: 'members',
        description: 'Member registry push',
      },
    ],
    paths: {
      [MEMBER_WEBHOOK_PATH]: {
        post: {
          tags: ['members'],
          operationId: 'pushMembers',
          summary: 'Push member data',
          description: [
            'A single request may carry any number of operations; they all run in',
            'one transaction, so either every one of them takes effect or none does.',
            'The same `sub` may appear only once per request.',
            '',
            '`delete` is a soft delete: the member disappears from the public',
            'surfaces, but their row and the roles recorded in credit lists are kept,',
            'and a later `upsert` restores them.',
          ].join('\n'),
          security: [{ webhookBearer: [] }],
          parameters: [
            {
              name: DELIVERY_ID_HEADER,
              in: 'header',
              required: false,
              description: [
                'Idempotency key. When supplied, the same request never runs twice:',
                'the repeat gets a `200` with `duplicate: true`. A rejected push does',
                'not consume the identifier, so after a fix it can be retried with the',
                'same one. The `Idempotency-Key` header works as well.',
              ].join('\n'),
              schema: { type: 'string', maxLength: DELIVERY_ID_MAX },
              example: '2026-08-28T10:00:00Z-1',
            },
          ],
          requestBody: {
            required: true,
            description: `At most ${MAX_BODY_BYTES} bytes.`,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/OperationsPayload' },
                    { $ref: '#/components/schemas/ReplacePayload' },
                  ],
                },
                examples: {
                  operations: {
                    summary: 'Operations (create and delete in one request)',
                    value: {
                      operations: [
                        { op: 'upsert', member: example },
                        { op: 'delete', sub: '57' },
                      ],
                    },
                  },
                  replace: {
                    summary: 'Full roster replacement',
                    value: { mode: 'replace', members: [example] },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Processed, or a repeat.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PushResponse' },
                },
              },
            },
            '400': errorSchema(
              'Invalid request body. The `problems` array lists every error.',
            ),
            '401': errorSchema(
              'Missing, unknown or revoked token, or one with a wrong secret.',
            ),
            '405': errorSchema('Only POST requests are accepted.'),
            '409': errorSchema(
              'One of the supplied usernames already belongs to another member.',
            ),
            '413': errorSchema(
              `The request body exceeds ${MAX_BODY_BYTES} bytes.`,
            ),
            '500': errorSchema('Saving the member update failed.'),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        webhookBearer: {
          type: 'http',
          scheme: 'bearer',
          description: [
            'The token of a webhook client issued by a leadership member, in',
            '`<client-id>.<secret>` form. The secret is shown only at creation and',
            'on secret rotation; the application stores a scrypt hash.',
          ].join('\n'),
        },
      },
      schemas: {
        Member: memberSchema(),
        UpsertOperation: {
          type: 'object',
          required: ['op', 'member'],
          properties: {
            op: { type: 'string', const: 'upsert' },
            member: { $ref: '#/components/schemas/Member' },
          },
        },
        DeleteOperation: {
          type: 'object',
          required: ['op', 'sub'],
          properties: {
            op: { type: 'string', const: 'delete' },
            sub: {
              type: 'string',
              maxLength: 255,
              description:
                'The `sub` of the member to delete. An unknown `sub` is not an error, it is simply ignored.',
            },
          },
        },
        OperationsPayload: {
          type: 'object',
          required: ['operations'],
          description: 'A list of targeted operations.',
          properties: {
            mode: {
              type: 'string',
              const: 'operations',
              default: 'operations',
            },
            operations: {
              type: 'array',
              minItems: 1,
              items: {
                oneOf: [
                  { $ref: '#/components/schemas/UpsertOperation' },
                  { $ref: '#/components/schemas/DeleteOperation' },
                ],
              },
            },
          },
        },
        ReplacePayload: {
          type: 'object',
          required: ['mode', 'members'],
          description: [
            'The full member roster. Anything left out of the list gets deleted —',
            'a faulty client can empty the entire roster this way.',
          ].join('\n'),
          properties: {
            mode: { type: 'string', const: 'replace' },
            members: {
              type: 'array',
              items: { $ref: '#/components/schemas/Member' },
            },
          },
        },
        IngestResult: {
          type: 'object',
          required: [
            'mode',
            'operationCount',
            'created',
            'updated',
            'deleted',
            'restored',
            'unchanged',
            'ignored',
          ],
          properties: {
            mode: { type: 'string', enum: ['operations', 'replace'] },
            operationCount: { type: 'integer' },
            created: { type: 'integer' },
            updated: { type: 'integer' },
            deleted: { type: 'integer', description: 'Soft-deleted members.' },
            restored: {
              type: 'integer',
              description: 'Members previously deleted and now restored.',
            },
            unchanged: {
              type: 'integer',
              description: 'Unchanged members; no audit row is written for these.',
            },
            ignored: {
              type: 'integer',
              description: 'Deletes targeting an unknown `sub`.',
            },
          },
        },
        PushResponse: {
          type: 'object',
          required: ['ok', 'duplicate'],
          properties: {
            ok: { type: 'boolean', const: true },
            duplicate: {
              type: 'boolean',
              description:
                'True when this delivery identifier has already been processed; `result` is then absent.',
            },
            deliveryId: { type: ['string', 'null'] },
            result: { $ref: '#/components/schemas/IngestResult' },
            message: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          required: ['error', 'message'],
          properties: {
            error: {
              type: 'string',
              enum: [
                'validation',
                'bad_request',
                'unauthorized',
                'method_not_allowed',
                'conflict',
                'payload_too_large',
                'internal',
              ],
            },
            message: { type: 'string' },
            problems: {
              type: 'array',
              items: { type: 'string' },
              description:
                'On a validation error, every problem in the body at once.',
            },
          },
        },
      },
    },
  }
}

/** The checked-in YAML rendering; a test asserts the file matches this. */
export function renderMemberWebhookOpenApi(): string {
  return `# Generated file — do not edit by hand.\n# Source: src/server/api/openapi.ts (pnpm openapi:generate)\n${toYaml(
    buildMemberWebhookOpenApi(),
  )}`
}
