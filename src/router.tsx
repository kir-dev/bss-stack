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

/** A `hydrate()` üres állapotra no-opként fut le. */
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
 * Kerülőmegoldás a `@tanstack/router-ssr-query-core@1.169.1` hibájára
 * (`dist/esm/index.js:93`): a hidratáló ciklus a stream lezáró olvasásánál is
 * meghívja a `hydrate()`-et, pedig ott a `value` már `undefined`. Ettől minden
 * oldalbetöltés végén eldobja az
 * „Error reading query stream: TypeError: … dehydratedState is undefined”
 * hibát. Adat nem vész el — a valódi darabok addigra mind beérkeztek —, de a
 * konzolt teleírja.
 *
 * A lezáró olvasásra üres dehidratált állapotot adunk vissza `undefined`
 * helyett. Valódi stream-hibát ez nem nyel el, csak a záró értéket pótolja.
 * Ha fölfelé javítják, ez a függvény törölhető.
 */
function silenceQueryStreamEndError(router: {
  options: { hydrate?: (dehydrated: never) => unknown }
}): void {
  // A csomag csak a kliensen állít be `hydrate`-et; a szerveren nincs teendő.
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
