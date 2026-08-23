import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/members/$memberId')({
  component: RouteComponent,
})

function RouteComponent() {
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({
    2022: true,
    2021: false,
    2020: false,
    2019: false,
  })

  const activities: Record<number, Array<{ title: string; role: string }>> = {
    2022: [
      { title: 'BSTV adas 2022. majus 20.', role: 'musorvezeto' },
      { title: 'BSTV adas 2022. majus 5.', role: 'musorvezeto' },
      { title: 'BSTV adas 2022. aprilis 21.', role: 'musorvezeto' },
      { title: 'BSTV adas 2022. februar 24.', role: 'rendezö' },
    ],
    2021: [{ title: 'BSTV adas 2021. december 15.', role: 'musorvezeto' }],
    2020: [{ title: 'BSTV adas 2020. oktober 10.', role: 'producer' }],
    2019: [{ title: 'BSTV adas 2019. szeptember 5.', role: 'musorvezeto' }],
  }

  function toggleYear(year: number) {
    setExpandedYears((prev) => ({
      ...prev,
      [year]: !prev[year],
    }))
  }

  function handleShowAll() {
    setExpandedYears({
      2022: true,
      2021: true,
      2020: true,
      2019: true,
    })
  }

  function handleHideAll() {
    setExpandedYears({
      2022: false,
      2021: false,
      2020: false,
      2019: false,
    })
  }

  return (
    <main className={'mx-auto w-[90dvw] my-[4dvh]'}>
      <div className={'flex flex-row gap-[5dvw]'}>
        <img
          className={
            'max-w-[300px] max-h-[440px] shadow-[0_5px_10px_rgba(255,145,0,0.45)] m-1'
          }
          src={'/test_member.png'}
          alt={'Member Name'}
        />
        <div className={'flex flex-col gap-[2dvh] *:text-xl'}>
          <div>
            <span className={'font-bold text-(--members-data-category)'}>
              Teljes nev:
            </span>
            <div className={'font-bold text-(--members-data)'}>
              Salamon Dora
            </div>
          </div>
          <div>
            <span className={'font-bold text-(--members-data-category)'}>
              Becenev:
            </span>
            <div className={'font-bold text-(--members-data)'}>Dotty</div>
          </div>
          <div>
            <span className={'font-bold text-(--members-data-category)'}>
              Status:
            </span>
            <div className={'text-(--members-data)'}>Studios</div>
          </div>
          <div>
            <span className={'font-bold text-(--members-data-category)'}>
              Csatlakozas feleve:
            </span>
            <div className={'text-(--members-data)'}>2019 tavasz</div>
          </div>
          <div>
            <span className={'font-bold text-(--members-data-category)'}>
              Bemutatkozas
            </span>
            <div className={'text-(--members-data)'}>
              Sziasztok Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              Nunc a tincidunt tellus. Nunc dolor mauris, tincidunt in felis
              quis, bibendum mattis dui. Sed ac dolor eu arcu interdum ultricies
              sit amet at ipsum. Nam ultrices in erat hendrerit rutrum. Mauris
              ut metus diam. Integer nisl lacus, aliquam sit amet metus non,
              suscipit bibendum lacus. Nulla auctor cursus hendrerit.{' '}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8">
        <div className="flex items-center justify-between border-b border-b-(--members-data) py-5">
          <h2 className="text-2xl font-bold text-(--members-data)">
            Tevekenyseg
          </h2>
          <div className="flex gap-4">
            <button
              onClick={handleShowAll}
              className="text-sm text-(--orange) hover:underline font-semibold"
            >
              Osszes mutatasa
            </button>
            <button
              onClick={handleHideAll}
              className="text-sm text-(--orange) hover:underline font-semibold"
            >
              Osszes elrejtese
            </button>
          </div>
        </div>

        <div className="">
          {Object.entries(activities)
            .sort((a, b) => Number(b[0]) - Number(a[0]))
            .map(([yearStr, items]) => {
              const year = Number(yearStr)
              const isExpanded = expandedYears[year]

              return (
                <div
                  key={year}
                  className={'border-b border-b-(--members-data)'}
                >
                  <button
                    type="button"
                    onClick={() => toggleYear(year)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <span className="font-bold text-(--members-data) text-lg">
                      {year}
                    </span>
                    <svg
                      className={`w-5 h-5 text-(--orange) transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="pl-4 space-y-2 ">
                      {items.map((activity, idx) => (
                        <div
                          key={`${year}-${idx}`}
                          className="flex items-start justify-between gap-4 px-4 py-2 "
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-(--bss-text-secondary) font-semibold underline">
                              {activity.title}
                            </div>
                          </div>
                          <div className="text-(--members-data) text-sm font-semibold whitespace-nowrap">
                            {activity.role}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </main>
  )
}
