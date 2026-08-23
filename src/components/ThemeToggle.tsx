import { useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark' | 'auto'

type ResolvedTheme = 'light' | 'dark'

function resolveThemeMode(mode: ThemeMode): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }

  return mode
}

function applyThemeMode(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveThemeMode(mode)

  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)

  if (mode === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = mode
  }

  document.documentElement.style.colorScheme = resolved
  return resolved
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--nav-icon)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M6.34 17.66l-1.41 1.41" />
      <path d="M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="var(--nav-icon)"
      aria-hidden="true"
    >
      <path d="M12 3c.132 0 .263.003.393.009a7.5 7.5 0 0 0 7.2 9.873 7.5 7.5 0 0 1-7.593 11.109A9 9 0 1 1 12 3z" />
    </svg>
  )
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('auto')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemeMode('auto'),
  )

  useEffect(() => {
    setMode('auto')
    setResolvedTheme(applyThemeMode('auto'))
  }, [])

  useEffect(() => {
    if (mode !== 'auto') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolvedTheme(applyThemeMode('auto'))

    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [mode])

  function toggleMode() {
    let nextMode: ThemeMode
    if (mode === 'light') {
      nextMode = 'dark'
    } else {
      nextMode = 'light'
    }

    setMode(nextMode)
    setResolvedTheme(applyThemeMode(nextMode))
    window.localStorage.setItem('theme', nextMode)
  }

  const label =
    mode === 'auto'
      ? 'Theme mode: auto (system). Click to switch to light mode.'
      : `Theme mode: ${mode}. Click to switch mode.`

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-2 rounded-full  px-3 py-1.5 text-sm font-semibold shadow-[0_8px_22px_rgba(30,90,72,0.08)]"
    >
      {resolvedTheme === 'dark' ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}
