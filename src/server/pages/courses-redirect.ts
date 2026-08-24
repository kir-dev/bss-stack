/** A tanfolyam-átirányítás célja (spec 10.2). */
export const COURSE_REDIRECT_TARGET = 'https://tanfolyam.bsstudio.hu/'

/**
 * A `/courses` útvonalat szerveroldalon kell átirányítani, ugyanabban a
 * böngészőfülben; a záró perjelek nem számítanak.
 */
export function isCoursesPath(pathname: string): boolean {
  return (pathname.replace(/\/+$/, '') || '/') === '/courses'
}
