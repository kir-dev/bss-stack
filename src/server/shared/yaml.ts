/**
 * Minimal deterministic YAML emitter for the generated OpenAPI document.
 * Only what that document needs: objects, arrays, strings, numbers, booleans
 * and null. Deterministic output keeps the checked-in file diff-stable, which
 * is what lets a test detect drift.
 */

type YamlValue =
  string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue }

const PLAIN_SAFE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/

const RESERVED_PLAIN = new Set([
  'true',
  'false',
  'null',
  'yes',
  'no',
  'on',
  'off',
  '~',
])

function quote(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

const NUMBER_LIKE = /^[-+]?[0-9]/

/**
 * Keys are emitted plain when unambiguous, quoted otherwise. Number-like keys
 * are always quoted: OpenAPI response codes are strings, and a bare `200:`
 * would parse back as an integer.
 */
function formatKey(key: string): string {
  const plain =
    PLAIN_SAFE.test(key) &&
    !RESERVED_PLAIN.has(key.toLowerCase()) &&
    !NUMBER_LIKE.test(key)
  return plain ? key : quote(key)
}

function formatScalar(value: string | number | boolean | null): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`A YAML nem tud nem véges számot ábrázolni: ${value}`)
    }
    return String(value)
  }
  return quote(value)
}

function isScalar(value: YamlValue): value is string | number | boolean | null {
  return value === null || typeof value !== 'object'
}

function isEmpty(value: YamlValue): boolean {
  return Array.isArray(value)
    ? value.length === 0
    : typeof value === 'object' &&
        value !== null &&
        Object.keys(value).length === 0
}

function emitContainer(
  value: YamlValue[] | { [key: string]: YamlValue },
  indent: string,
  lines: string[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isScalar(item)) {
        lines.push(`${indent}- ${formatScalar(item)}`)
        continue
      }
      if (isEmpty(item)) {
        lines.push(`${indent}- ${Array.isArray(item) ? '[]' : '{}'}`)
        continue
      }
      const nested: string[] = []
      emitContainer(item, `${indent}  `, nested)
      const first = nested.shift()!
      lines.push(`${indent}- ${first.trimStart()}`)
      lines.push(...nested)
    }
    return
  }

  for (const [key, entry] of Object.entries(value)) {
    const prefix = `${indent}${formatKey(key)}:`

    if (isScalar(entry)) {
      if (typeof entry === 'string' && entry.includes('\n')) {
        lines.push(`${prefix} |-`)
        for (const line of entry.split('\n')) {
          lines.push(line === '' ? '' : `${indent}  ${line}`)
        }
        continue
      }
      lines.push(`${prefix} ${formatScalar(entry)}`)
      continue
    }

    if (isEmpty(entry)) {
      lines.push(`${prefix} ${Array.isArray(entry) ? '[]' : '{}'}`)
      continue
    }

    lines.push(prefix)
    emitContainer(entry, Array.isArray(entry) ? indent : `${indent}  `, lines)
  }
}

export function toYaml(value: YamlValue): string {
  if (isScalar(value)) {
    return `${formatScalar(value)}\n`
  }
  const lines: string[] = []
  emitContainer(value, '', lines)
  return `${lines.join('\n')}\n`
}
