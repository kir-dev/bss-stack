import { createFileRoute } from '@tanstack/react-router'

/**
 * Tanfolyam (spec 10.2): a `/courses` ugyanabban a böngészőfülben a
 * tanfolyami oldalra irányít. Helyi űrlap, adatmodell és ál-sikerüzenet nincs.
 * A szerveroldali átirányítás az alkalmazás belépési pontján történik
 * (src/server.ts); ez a kliensoldali navigációt kezeli le.
 */
export const Route = createFileRoute('/courses')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      window.location.assign('https://tanfolyam.bsstudio.hu/')
    }
  },
})
