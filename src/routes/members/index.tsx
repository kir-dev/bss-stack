import { createFileRoute } from '@tanstack/react-router'
import MemberCard from '#/components/MemberCard.tsx'

export const Route = createFileRoute('/members/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <main
      className={
        'mx-auto w-[90dvw] flex flex-1 flex-col items-center justify-center my-[4dvh]'
      }
    >
      <div className={'text-4xl font-bold text-(--members-title) mb-5'}>
        TAGOK
      </div>
      <p className={'font-bold text-(--members-title)'}>
        Kik dolgoznak nap mint nap azert, hogy a BSS mukodjon? Kiforgatott
        golyabalon? Hol talalod meg a studiovezeto e-mail cimet?
      </p>
      <p className={'text-(--members-title)'}>
        Ez az oldal Neked keszult, ha kivsnics vagy a BSS tagjaira, reszletesebb
        adataikra.
      </p>
      <div className={'font-bold text-(--members-title) mt-[8dvh]'}>
        VEZETOSEG
      </div>
      <div className={'grid grid-cols-7 gap-x-[3dvw] gap-y-[3dvh] mt-5'}>
        <div className={'flex col-span-3 justify-end'}>
          <MemberCard />
        </div>
        <MemberCard />
        <div className={'flex col-span-3 justify-start'}>
          <MemberCard />
        </div>
        {Array.from({ length: 7 }).map((_, index) => (
          <MemberCard key={index} />
        ))}
      </div>
      <div className={'font-bold text-(--members-title) mt-[8dvh]'}>
        STUDIOSOK
      </div>
      <div className={'grid grid-cols-7 gap-x-[3dvw] gap-y-[3dvh] mt-5'}>
        {Array.from({ length: 14 }).map((_, index) => (
          <MemberCard key={index} />
        ))}
      </div>
      <div className={'font-bold text-(--members-title) mt-[8dvh]'}>
        UJONCOK
      </div>
      <div className={'grid grid-cols-7 gap-x-[3dvw] gap-y-[3dvh] mt-5'}>
        {Array.from({ length: 14 }).map((_, index) => (
          <MemberCard key={index} />
        ))}
      </div>
    </main>
  )
}
