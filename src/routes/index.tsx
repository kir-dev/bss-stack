import { createFileRoute } from '@tanstack/react-router'
import { useRef, useEffect } from 'react'

import MiniVideo from '#/components/MiniVideo.tsx'
import Card from '#/components/Card.tsx'
import Videoplayer from '#/components/Videoplayer.tsx'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        container.scrollLeft += e.deltaY
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <main className="mx-auto w-[90dvw]">
      <div
        className={
          'h-fit  overflow-hidden font-bank-gothic text-[clamp(1rem,10dvw,66px)] font-bold leading-none my-[5dvh] text-(--bss-text)'
        }
      >
        Budavári Schönherz Studió
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-x-[3dvw] gap-y-[3dvh] mb-[10dvh]">
        <div className="">
          <div className={'text-(--orange) font-bold text-4xl mb-[3dvh]'}>
            Kiemelt video / adas neve
          </div>
          <Videoplayer />
        </div>

        <div>
          <div className="text-(--orange) font-bold text-4xl mb-[3dvh]">
            Tovabbi friss videoink
          </div>
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-x-[3dvw] gap-y-[3dvh]">
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
          </div>
        </div>
      </div>

      <div className="mb-[10dvh] ">
        <div className={'text-(--orange) font-bold text-4xl mb-[2dvh]'}>
          Legutobbi esemenyek
        </div>
        <div
          className={
            'flex flex-nowrap overflow-x-auto gap-[1dvw] *:shrink-0 scrollbar-hide'
          }
          ref={scrollContainerRef}
        >
          <MiniVideo />
          <MiniVideo />
          <MiniVideo />
          <MiniVideo />
          <MiniVideo />
          <MiniVideo />
        </div>
      </div>

      <div
        className={
          'grid grid-cols-1 md:grid-cols-2 gap-y-[2dvh] gap-x-[3dvw] p-x-[3dvw] mb-[2dvh]'
        }
      >
        <Card />
        <Card />
        <Card />
        <Card />
      </div>
    </main>
  )
}
