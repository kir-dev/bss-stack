import { createFileRoute } from '@tanstack/react-router'
import Videoplayer from '#/components/Videoplayer.tsx'
import MiniVideo from '#/components/MiniVideo.tsx'

export const Route = createFileRoute('/videos/$videoId')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <main className={'flex-1'}>
      <div className={'flex bg-black w-full justify-center items-center'}>
        <div className={'w-[55dvw]'}>
          <Videoplayer />
        </div>
      </div>
      <div className={'mx-auto flex-1 w-[55dvw] my-5'}>
        <span className={'text-5xl font-bold text-(--videos-video-title)'}>
          Video cime
        </span>
        <div className={'flex justify-between my-5'}>
          <p>Video description</p>
          <div className={'flex flex-col items-end'}>
            <div>
              <span className={'text-(--videos-video-title) font-semibold'}>
                Riporter:{' '}
              </span>
              <span className={'underline'}>Gipsz Jakab</span>
            </div>
            <div>
              <span className={'text-(--videos-video-title) font-semibold'}>
                Vago:{' '}
              </span>
              <span className={'underline'}>Pelda Bela</span>
            </div>
          </div>
        </div>
        <div>
          <span className={'text-(--videos-video-title) font-semibold'}>
            Felhasznalt zenek:
          </span>
          <p>Alma egyuttes - Valami Dal</p>
          <p>Alma egyuttes - Valami Dal</p>
          <p>Alma egyuttes - Valami Dal</p>
        </div>
        <div className={'my-5'}>
          <span className={'text-(--videos-video-title) font-semibold'}>
            Az esemeny datuma:{' '}
          </span>
          2022. november 03.
        </div>
        <div>
          <span className={'text-(--videos-video-title) text-4xl font-bold'}>
            Tovabbi videok
          </span>
          <div className={'grid grid-cols-3 gap-y-[2dvh] mt-5'}>
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
            <MiniVideo />
          </div>
        </div>
      </div>
    </main>
  )
}
