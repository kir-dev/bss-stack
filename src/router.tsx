import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'
import { LoadingState } from '#/components/PageStates.tsx'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <LoadingState />,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })
  silenceQueryStreamEndError(router)

  return router
}

/** `hydrate()` runs as a no-op on empty state. */
const EMPTY_DEHYDRATED_QUERY_STATE = { queries: [], mutations: [] }

interface QueryStreamCarrier {
  queryStream?: {
    getReader: () => {
      read: () => Promise<{ done: boolean; value?: unknown }>
      cancel: (reason?: unknown) => Promise<void>
      releaseLock: () => void
    }
  }
}

/**
 * Workaround for a bug in `@tanstack/router-ssr-query-core@1.169.1`
 * (`dist/esm/index.js:93`): the hydration loop calls `hydrate()` even on the
 * stream's closing read, where `value` is already `undefined`. As a result,
 * at the end of every page load it throws away an
 * "Error reading query stream: TypeError: … dehydratedState is undefined"
 * error. No data is lost — all the real chunks have arrived by then — but it
 * fills up the console.
 *
 * For the closing read we return an empty dehydrated state instead of
 * `undefined`. This does not swallow real stream errors; it only supplies
 * the closing value. If it gets fixed upstream, this function can be deleted.
 */
function silenceQueryStreamEndError(router: {
  options: { hydrate?: (dehydrated: never) => unknown }
}): void {
  // The package only sets up `hydrate` on the client; nothing to do on the server.
  const ssrQueryHydrate = router.options.hydrate
  if (ssrQueryHydrate === undefined) {
    return
  }

  router.options.hydrate = (dehydrated: never) => {
    const carrier = dehydrated as QueryStreamCarrier | null
    const stream = carrier?.queryStream

    if (stream !== undefined) {
      carrier!.queryStream = {
        getReader: () => {
          const reader = stream.getReader()
          return {
            cancel: (reason?: unknown) => reader.cancel(reason),
            releaseLock: () => reader.releaseLock(),
            read: async () => {
              const result = await reader.read()
              return result.done
                ? { done: true, value: EMPTY_DEHYDRATED_QUERY_STATE }
                : result
            },
          }
        },
      }
    }

    return ssrQueryHydrate(dehydrated)
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
