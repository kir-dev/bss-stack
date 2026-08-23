import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/courses')({
  component: RouteComponent,
})

function RouteComponent() {
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  function handleSubmit(event: {
    preventDefault: () => void
    currentTarget: HTMLFormElement
  }) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const toText = (value: FormDataEntryValue | null) =>
      typeof value === 'string' ? value.trim() : ''

    const name = toText(formData.get('name'))
    const email = toText(formData.get('email'))
    const interests = formData.getAll('interest').map(String)
    const greetingName = name ? `, ${name}` : ''

    setSubmitMessage(
      `Köszönjük${greetingName}! A jelentkezés sikeresen elküldve.`,
    )

    console.log('Courses form submitted', {
      name,
      email,
      interests,
    })
  }

  return (
    <main className="flex-1 mx-auto w-[90dvw] max-w-275 py-[6dvh]">
      <h1 className="text-4xl font-extrabold tracking-tight text-(--courses-title) md:text-5xl">
        Tanfolyamok
      </h1>
      <div className="flex flex-row justify-between">
        <div className="mt-6 text-(--bss-text-secondary) w-[30dvw]">
          <p>
            Célunk elsősorban a média iránt érdeklődő egyetemisták, vagy
            főiskolai hallgatók szakmai fejlődésének elősegítése. Ha érdekel a
            televíziózás, filmgyártás mikéntje, és rendelkezel hallgatói
            jogviszonnyal, csatlakozz te is az öntevékeny körünkhöz!
          </p>
          <p className={'mt-6'}>
            Ebben a félévben a jelentkezési időszak lezárult, de ha a
            következőben nem szeretnél lemaradni a tanfolyamainkról, akkor
            töltsd ki az alábbi adatlapot és értesíteni fogunk a tanfolyam
            indulásáról, valamint a felvételi folyamat részleteiről.
          </p>
        </div>

        <div className="p-6 min-w-[334px]">
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="name"
                className="mb-1 block text-xs font-medium text-(--courses-input-label)"
              >
                Név
              </label>
              <div
                className={
                  'bg-(--courses-input-bg) border-0 border-b border-(--nav-border-b)'
                }
              >
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  placeholder="User input text"
                  className="w-full bg-transparent mx-4 px-0 py-2 text-sm outline-none transition-colors focus:border-(--blue) focus:ring-0 text-(--courses-input-placeholder)"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-xs font-medium text-(--courses-input-label)"
              >
                E-mail cím
              </label>
              <div
                className={
                  'bg-(--courses-input-bg) border-0 border-b border-(--nav-border-b)'
                }
              >
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  placeholder="User input text"
                  className="w-full bg-transparent mx-4 px-0 py-2 text-sm outline-none transition-colors focus:border-(--blue) focus:ring-0 text-(--courses-input-placeholder)"
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-(--courses-input-label)">
                Milyen tanfolyam érdekel?
              </legend>

              {[
                ['operator', 'Operatőr tanfolyam'],
                ['editor', 'Szerkesztő-riporteri tanfolyam'],
                ['cutting', 'Vágó tanfolyam'],
                ['video-tech', 'Videótechn tanfolyam'],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2 text-sm text-(--bss-text-secondary)"
                >
                  <input
                    type="checkbox"
                    name="interest"
                    value={value}
                    className="h-4 w-4 accent-(--courses-title)"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            <button
              type="submit"
              className="flex items-center justify-between rounded-none bg-(--courses-title) px-5 py-3 text-sm font-semibold text-white hover:bg-(--orange)"
            >
              <div>Elküldés</div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                className="bi bi-send"
                viewBox="0 0 16 16"
              >
                <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76z" />
              </svg>
            </button>

            {submitMessage && (
              <p className="text-sm font-medium text-(--orange)">
                {submitMessage}
              </p>
            )}
          </form>
        </div>
      </div>
    </main>
  )
}
