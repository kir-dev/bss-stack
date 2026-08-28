export default function MemberCard() {
  return (
    <div
      className={
        'max-w-[178px] w-[178px] max-h-[240px] h-full shadow-[0_2px_2px_rgba(0,0,0,0.2)] flex flex-col items-center justify-center p-3 bg-(--members-card-bg)'
      }
    >
      <img
        className={'max-h-[178px] max-w-[178px] overflow-hidden'}
        src={'/default-avatar.png'}
        alt={'Member Name'}
      />
      <p className={'text-lg font-bold text-(--bss-text-secondary)'}>
        Member Name
      </p>
      <p className={'text-(--bss-text-secondary'}>Pozi</p>
    </div>
  )
}
