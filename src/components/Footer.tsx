import { Link } from '@tanstack/react-router'

const partners = [
  {
    name: 'AC',
    href: 'https://acstudio.sch.bme.hu/',
    src: '/partners/ac.svg',
    width: 56,
    height: 42,
  },
  {
    name: 'Schönherz',
    href: 'https://sch.bme.hu/',
    src: '/partners/schonherz.svg',
    width: 100,
    height: 32,
  },
  {
    name: 'Simonyi Károly Szakkollégium',
    href: 'https://simonyi.bme.hu/hu',
    src: '/partners/simonyi.svg',
    width: 142,
    height: 30,
  },
  {
    name: 'schdesign',
    href: 'https://schdesign.hu/',
    src: '/partners/schdesign.svg',
    width: 112,
    height: 30,
  },
  {
    name: 'SPOT',
    href: 'https://spot.sch.bme.hu/',
    src: '/partners/spot.svg',
    width: 42,
    height: 42,
  },
]

export const SOCIAL_LINKS = [
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/bsstudio',
    src: '/social/facebook.svg',
  },
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/bsstudi0',
    src: '/social/youtube.svg',
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/budavari_schonherz_studio/',
    src: '/social/instagram.svg',
  },
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@bsstudio_',
    src: '/social/tiktok.svg',
  },
]

function KirDevLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1498.79 1275.57"
      fill="currentColor"
      role="img"
      aria-label="Kir-Dev"
      className={className}
    >
      <path d="M903.06,109.54c52.51,0,105.16-1.19,157.65.21a561.05,561.05,0,0,1,59.62,4.76l-14.56-2c39.51,5.38,78.39,15.22,115.2,30.64l-13.09-5.52a365.13,365.13,0,0,1,80.67,46.57l-11.08-8.56a316.8,316.8,0,0,1,56.88,56.6l-8.57-11.08a289.6,289.6,0,0,1,37.2,63.54l-5.52-13.08a273.37,273.37,0,0,1,19,69.15l-2-14.56a263.89,263.89,0,0,1,0,69.68q1-7.28,2-14.56a260.29,260.29,0,0,1-17.81,65.26l5.52-13.09a267.94,267.94,0,0,1-34.41,58.9l8.56-11.09a292.59,292.59,0,0,1-52.21,52l11.08-8.56a347.8,347.8,0,0,1-76.94,44.41l13.09-5.52c-37.51,15.74-77.2,25.56-117.46,31l14.56-2c-32.63,4.32-65.36,5.23-98.22,5.23H903.06c-29.86,0-54.77,24.92-54.77,54.77s24.91,54.77,54.77,54.77c50.8,0,101.61.42,152.41,0,90.08-.8,182.45-18.63,261.14-64.06,60.44-34.89,113.62-88.33,141.44-153,7.42-17.22,14.25-34.38,18.79-52.59s7.07-36.74,8.63-55.27c2.73-32.47-.88-65.94-8.41-97.55-15.81-66.37-54.66-128.12-105.61-173.15-61.11-54-137.72-88.1-217.81-102A667.8,667.8,0,0,0,1038.82,0H903.06c-29.86,0-54.77,24.92-54.77,54.77s24.91,54.77,54.77,54.77Z" />
      <path d="M572.6,599.21A540.71,540.71,0,0,0,274,690.37,606.59,606.59,0,0,0,67.32,928.51,672.69,672.69,0,0,0,.14,1220.8c0,29.85,25,54.77,54.77,54.77s54.74-24.92,54.77-54.77a638.89,638.89,0,0,1,5.65-84.08l-2,14.56A609.18,609.18,0,0,1,155.54,997q-2.76,6.54-5.53,13.08a582.31,582.31,0,0,1,74.47-127.65l-8.56,11.09a546.71,546.71,0,0,1,97.52-97.72l-11.09,8.57a508.87,508.87,0,0,1,111.41-65.24l-13.09,5.52a485.16,485.16,0,0,1,122.74-33.58l-14.56,2a490.71,490.71,0,0,1,63.75-4.24c29.86,0,54.77-24.88,54.77-54.77s-24.91-54.82-54.77-54.78Z" />
      <path d="M682.38,54.77v1166c0,29.85,24.91,54.77,54.77,54.77s54.77-24.92,54.77-54.77V54.77C791.92,24.92,767,0,737.15,0s-54.77,24.91-54.77,54.77Z" />
      <path
        fill="#f15a29"
        d="M0,54.79C.14,170.14,27.12,284.47,80,387.06c48.49,94.16,121.11,176,209.77,234.05a521.65,521.65,0,0,0,282.73,84.63c29.86,0,54.77-25,54.77-54.77s-24.91-54.72-54.77-54.77a467.33,467.33,0,0,1-60.62-4l14.56,2a465.38,465.38,0,0,1-117.23-32l13.08,5.52A499.68,499.68,0,0,1,311.4,502.58l11.09,8.57a555.88,555.88,0,0,1-97.93-98.41l8.56,11.08a614.87,614.87,0,0,1-79.34-136.41l5.52,13.09a665.34,665.34,0,0,1-45.53-167.7q1,7.27,2,14.56a704.18,704.18,0,0,1-6.19-92.57C109.51,24.93,84.65,0,54.77,0S0,24.93,0,54.79Z"
      />
      <path
        fill="#f15a29"
        d="M1498.79,1220.8c-.15-111.42-29.14-222.25-84.46-319-52.61-92-129.81-170.59-221.32-224.12a578.92,578.92,0,0,0-290-78.59c-29.86,0-54.77,24.95-54.77,54.77s24.91,54.73,54.77,54.77a531.75,531.75,0,0,1,69.86,4.7l-14.56-2a523,523,0,0,1,132.42,36.35l-13.09-5.52a539.37,539.37,0,0,1,118,69.14l-11.09-8.57A562.89,562.89,0,0,1,1284.72,903q-4.28-5.54-8.56-11.08a579.47,579.47,0,0,1,74.78,128.23l-5.52-13.08a589.71,589.71,0,0,1,40.52,149.12l-2-14.56a608.17,608.17,0,0,1,5.25,79.21c0,29.85,24.89,54.77,54.77,54.77s54.81-24.92,54.78-54.77Z"
      />
    </svg>
  )
}

export default function Footer() {
  return (
    <footer className="flex flex-col items-center gap-4 bg-(--darker-blue) pt-[1dvh] pb-[calc(1dvh+env(safe-area-inset-bottom))] text-white">
      <Link to="/contact" className="nav-link text-lg">
        Kapcsolat
      </Link>
      <a href="mailto:bss@sch.bme.hu" className="text-(--orange) font-semibold">
        info@bsstudio.hu
      </a>
      <div className="mx-auto flex gap-4">
        {SOCIAL_LINKS.map((social) => (
          <a
            key={social.name}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src={social.src} alt={social.name} width={40} height={40} />
          </a>
        ))}
      </div>
      <div
        className={'mx-auto flex flex-wrap items-center justify-center gap-6'}
      >
        {partners.map((partner) => (
          <a
            key={partner.name}
            href={partner.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={partner.src}
              alt={partner.name}
              width={partner.width}
              height={partner.height}
              className="h-8 w-auto"
            />
          </a>
        ))}
      </div>
      <a
        href="https://kir-dev.hu"
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center gap-2"
      >
        <KirDevLogo className="h-12 w-12" />
        <span className="flex items-center gap-1">
          Made with
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="red"
            role="img"
            aria-label="love"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
            />
          </svg>
          by <span className="underline">Kir-Dev</span>
        </span>
      </a>
    </footer>
  )
}
