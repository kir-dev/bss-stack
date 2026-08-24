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
    name: 'BME VIK',
    href: 'https://vik.bme.hu/',
    src: '/partners/vik.svg',
    width: 42,
    height: 42,
  },
]

const socialLinks = [
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
]

export default function Footer() {
  return (
    <footer className="flex flex-col items-center gap-4 bg-(--darker-blue) py-[1dvh] text-white">
      <div className="text-lg">Kapcsolat</div>
      <a href="mailto:bss@sch.bme.hu" className="text-(--orange)">
        bss@sch.bme.hu
      </a>
      <div className="mx-auto flex gap-4">
        {socialLinks.map((social) => (
          <a
            key={social.name}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={social.name}
          >
            <img src={social.src} alt="" width={40} height={40} />
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
            aria-label={partner.name}
          >
            <img
              src={partner.src}
              alt=""
              width={partner.width}
              height={partner.height}
              className="h-8 w-auto"
            />
          </a>
        ))}
      </div>
    </footer>
  )
}
