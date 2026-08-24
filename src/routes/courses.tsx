import { createFileRoute } from '@tanstack/react-router'

/**
 * Course (spec 10.2): `/courses` redirects to the course page in the same
 * browser tab. No local form, data model or fake success message.
 * The server-side redirect happens at the application entry point
 * (src/server.ts); this handles client-side navigation.
 */
export const Route = createFileRoute('/courses')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      window.location.assign('https://tanfolyam.bsstudio.hu/')
    }
  },
})
