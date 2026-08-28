import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/courses')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      window.location.assign('https://tanfolyam.bsstudio.hu/')
    }
  },
})
