/**
 * Admin kliensoldali hívási segéd (BSS-028). A szerver JSON-válaszait
 * diszkriminált eredménnyé fordítja: a 401-es (lejárt session) esetén
 * a loginUrl-t adja vissza, hogy a kliens megőrizze az űrlapadatot és
 * új belépés után újraküldhesse (spec 12.4).
 */

export interface ApiError {
  status: number
  code:
    | 'auth_required'
    | 'forbidden'
    | 'conflict'
    | 'validation'
    | 'confirmation'
    | 'name_conflict'
    | 'overlap'
    | 'role_in_use'
    | 'not_found'
    | 'bad_request'
    | 'internal'
  message: string
  problems?: string[]
  loginUrl?: string
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError }

export async function postJson<T>(
  url: string,
  body: unknown,
): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return {
      ok: false,
      error: {
        status: 0,
        code: 'internal',
        message: 'A kérés nem érte el a szervert. Ellenőrizd a kapcsolatot.',
      },
    }
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    // Nem JSON válasz (pl. proxy hibaoldal)
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        status: response.status,
        code: payload['error'] as ApiError['code'],
        message:
          typeof payload['message'] === 'string'
            ? payload['message']
            : 'Váratlan hiba történt.',
        problems: Array.isArray(payload['problems'])
          ? (payload['problems'] as string[])
          : undefined,
        loginUrl:
          typeof payload['loginUrl'] === 'string'
            ? payload['loginUrl']
            : undefined,
      },
    }
  }
  return { ok: true, data: payload as T }
}
