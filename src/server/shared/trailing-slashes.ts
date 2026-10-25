// Linear in the input length; a regex like /\/+$/ backtracks quadratically on a
// long run of slashes that does not end the string.
export function trimTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') {
    end--
  }
  return value.slice(0, end)
}
