export const COURSE_REDIRECT_TARGET = 'https://tanfolyam.bsstudio.hu/'

/**
 * The `/courses` path must be redirected on the server side, in the same
 * browser tab; trailing slashes are ignored.
 */
export function isCoursesPath(pathname: string): boolean {
  return (pathname.replace(/\/+$/, '') || '/') === '/courses'
}
