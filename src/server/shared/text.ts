/** Length limits fixed in chapter 4.3 of the specification. */
export const TEXT_LIMITS = {
  title: 200,
  slug: 200,
  tagOrRole: 64,
  description: 10_000,
  guestsOrSongs: 5_000,
  url: 2_048,
} as const

export class TextValidationError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(
      problems.length === 1
        ? (problems.at(0) ?? '')
        : `Érvénytelen mezők:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    )
    this.name = 'TextValidationError'
    this.problems = problems
  }
}

/**
 * Plain text validation (spec 4.3): HTML/Markdown/rich text is not part of V0.
 * The text is stored unchanged, but we check its length and that it contains
 * no control characters.
 */
export function validatePlainText(
  fieldName: string,
  value: string | null | undefined,
  maxLength: number,
  options: { required?: boolean } = {},
): string | null {
  if (value === null || value === undefined || value.trim() === '') {
    if (options.required) {
      throw new TextValidationError([`${fieldName}: kötelező mező.`])
    }
    return null
  }
  if (value.length > maxLength) {
    throw new TextValidationError([
      `${fieldName}: legfeljebb ${maxLength} karakter lehet (jelenlegi hossz: ${value.length}).`,
    ])
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new TextValidationError([
      `${fieldName}: vezérlőkarakter nem megengedett.`,
    ])
  }
  return value
}

export function validateRequiredText(
  fieldName: string,
  value: string | null | undefined,
  maxLength: number,
): string {
  if (value === null || value === undefined || value.trim() === '') {
    throw new TextValidationError([`${fieldName}: kötelező mező.`])
  }
  validatePlainText(fieldName, value, maxLength)
  return value
}
