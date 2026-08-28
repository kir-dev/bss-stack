import type { ReactNode } from 'react'
import { EmptyState } from '#/components/PageStates.tsx'

export interface AdminColumn<TRow> {
  key: string
  header: string
  render: (row: TRow) => ReactNode
  /** The primary (bold) row in card view. */
  primary?: boolean
}

export function ResponsiveTable<TRow>({
  columns,
  rows,
  emptyTitle,
  emptyDescription,
}: {
  columns: Array<AdminColumn<TRow>>
  rows: readonly TRow[]
  emptyTitle: string
  emptyDescription?: string
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-(--nav-border-b) text-xs text-(--bss-text-secondary)">
              {columns.map((column) => (
                <th key={column.key} scope="col" className="px-2 py-2">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                className="border-b border-(--nav-border-b)/50 align-top"
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-2 py-2">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile card view */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row, index) => (
          <div
            key={index}
            className="rounded border border-(--nav-border-b) p-3"
          >
            {columns.map((column) => (
              <div key={column.key} className="py-0.5 text-sm">
                <span className="mr-2 text-xs text-(--bss-text-secondary)">
                  {column.header}:
                </span>
                <span className={column.primary ? 'font-bold' : undefined}>
                  {column.render(row)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
