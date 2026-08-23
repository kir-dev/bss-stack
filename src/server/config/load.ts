import { readFileSync } from 'node:fs'
import { validateOobConfig } from './oob-schema.ts'
import type { OobConfig } from './oob-schema.ts'

export const DEFAULT_OOB_CONFIG_PATH = 'oob/config.json'

export function resolveOobConfigPath(explicitPath?: string): string {
  return (
    explicitPath ?? process.env['BSS_OOB_CONFIG'] ?? DEFAULT_OOB_CONFIG_PATH
  )
}

export class OobConfigFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OobConfigFileError'
  }
}

export function loadOobConfig(explicitPath?: string): OobConfig {
  const path = resolveOobConfigPath(explicitPath)

  let content: string
  try {
    content = readFileSync(path, 'utf-8')
  } catch (error) {
    throw new OobConfigFileError(
      `Nem olvasható a BSS OOB config fájl: ${path}. ` +
        `Hozd létre a dokumentált formátumban (lásd docs/oob-inputs.md), vagy állítsd be a BSS_OOB_CONFIG környezeti változót. ` +
        `Eredeti hiba: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new OobConfigFileError(
      `A BSS OOB config fájl nem érvényes JSON: ${path}`,
    )
  }

  return validateOobConfig(parsed)
}
