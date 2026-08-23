export default function Footer() {
  return (
    <footer className="flex flex-col items-center gap-4 bg-(--darker-blue) py-[1dvh] text-white">
      <div className="text-lg">Kapcsolat</div>
      <a href="mailto:bss@sch.bme.hu" className="text-(--orange)">
        bss@sch.bme.hu
      </a>
      <div className={'mx-auto flex gap-4'}>
        <img alt={'instagram icon'} />
        <img alt={'youtube icon'} />
        <img alt={'facebook icon'} />
      </div>
      <div className={'mx-auto flex gap-4'}>
        <img alt={'ac'} />
        <img alt={'schonherz'} />
        <img alt={'simonyi'} />
        <img alt={'schdesign'} />
        <img alt={'vik'} />
      </div>
    </footer>
  )
}
