export default function EventCard() {
  return (
    <div className="bg-(--events-card-bg) m-2  max-w-[250px] max-h-[250px] w-[250px] flex flex-col items-center justify-center shadow-[0_2px_6px_rgba(255,145,0,0.35)]">
      <img
        src={'/test_event.png'}
        alt="Event"
        className="max-w-[250px] max-h-[216px]"
      />
      <p className="text-lg font-bold text-(--bss-text-secondary) w-fit">
        Event Name
      </p>
    </div>
  )
}
