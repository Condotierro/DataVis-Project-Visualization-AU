import useSWR from 'swr'

const fetchJson = (file: string) =>
  fetch(`${import.meta.env.BASE_URL}data/${file}`).then((res) => {
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
    return res.json()
  })

/**
 * Load a JSON file produced by preprocessing/aggregate.py (served from web/public/data/).
 * Cached by SWR, so several tabs can share a file without refetching.
 *
 *   const rows = useData<MyRow[]>('results_by_elo.json')
 */
export function useData<T>(file: string): T | undefined {
  return useSWR<T>(file, fetchJson).data
}
