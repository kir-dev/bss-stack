export interface MockRequest {
  url: URL
  method: string
  headers: Headers
  body: unknown
}

export interface MockResponseSpec {
  status: number
  headers?: Record<string, string>
  body?: string | Buffer | object
}

export interface MockRoute {
  method?: string
  urlPattern: RegExp | string
  respond: (
    request: MockRequest,
  ) => MockResponseSpec | Promise<MockResponseSpec>
}

export interface FetchMock {
  restore: () => void
  calls: () => Array<{ method: string; url: string }>
  reset: () => void
}

function matches(route: MockRoute, request: MockRequest): boolean {
  if (route.method && route.method.toUpperCase() !== request.method) {
    return false
  }
  if (typeof route.urlPattern === 'string') {
    return request.url.toString().includes(route.urlPattern)
  }
  return route.urlPattern.test(request.url.toString())
}

function toResponse(spec: MockResponseSpec): Response {
  const headers = new Headers(spec.headers)
  let body: BodyInit | undefined

  if (spec.body instanceof Buffer) {
    body = new Uint8Array(spec.body)
  } else if (typeof spec.body === 'object') {
    headers.set(
      'content-type',
      spec.headers?.['content-type'] ?? 'application/json',
    )
    body = JSON.stringify(spec.body)
  } else if (spec.body !== undefined) {
    body = spec.body
  }

  return new Response(body, { status: spec.status, headers })
}

export function installFetchMock(routes: MockRoute[]): FetchMock {
  const originalFetch = globalThis.fetch
  const recordedCalls: Array<{ method: string; url: string }> = []

  const mockedFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase()
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    )

    const request: MockRequest = {
      url: new URL(url),
      method,
      headers,
      body: init?.body,
    }

    recordedCalls.push({ method, url })

    for (const route of routes) {
      if (matches(route, request)) {
        const spec = await route.respond(request)
        return toResponse(spec)
      }
    }

    throw new Error(
      `Nincs mock a kéréshez: ${method} ${url}. Bővítsd a teszt fetch mock útvonalait.`,
    )
  }

  globalThis.fetch = mockedFetch

  return {
    restore() {
      globalThis.fetch = originalFetch
    },
    calls() {
      return [...recordedCalls]
    },
    reset() {
      recordedCalls.length = 0
    },
  }
}
