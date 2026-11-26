// Resilient, rate-limit-aware per-device reads for ManageEngine MDM details (FileVault, passcode, compliance).
//
// The dashboard is the team's source of truth, so a device must never lose its details just because a call was
// throttled. Reads run on a worker pool whose width adapts to the API: a 429 halves the concurrency, pauses every
// worker for the server's Retry-After (or an exponential backoff) and retries; steady successes widen it again.
// Devices that are still unread get further rounds, the whole run is bounded by a time budget, and every failure
// reason is counted so the gap is visible in diagnostics rather than swallowed as "no data".

export interface DetailReadStats {
  at: string
  requested: number
  /** Read on the first attempt. */
  firstTry: number
  /** Failed at first but read after a retry or a later round. */
  recovered: number
  /** Still unreadable after every attempt (or when the time budget ran out). */
  failed: number
  /** Failure reasons by HTTP status (or "network") across ALL failed attempts. */
  reasons: Record<string, number>
  /** Concurrency the pool ended on — low means the API kept throttling. */
  endConcurrency: number
  /** Devices skipped because their cached details were still fresh (set by the caller). */
  fromCache?: number
}

export interface ReaderOptions {
  /** Starting and maximum concurrency. */
  concurrency: number
  minConcurrency?: number
  /** Attempts per device per round. */
  attempts?: number
  /** Extra rounds over devices that are still unread after a round. */
  extraRounds?: number
  /** Pause between rounds, letting a rate-limit window pass. */
  roundDelayMs?: number
  baseDelayMs?: number
  /** Total time the reader may spend; the rest is reported unreadable so the caller's own deadline is never blown. */
  budgetMs?: number
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

/** HTTP status carried by an error (our API wrapper sets `status`; message "… API 429 on …" is the fallback). */
export function statusOf(e: unknown): number | null {
  const direct = (e as { status?: unknown } | null)?.status
  if (typeof direct === 'number') return direct
  const m = e instanceof Error ? /\bAPI (\d{3})\b/.exec(e.message) : null
  return m ? Number(m[1]) : null
}

/** Server-requested wait (Retry-After) carried by an error, in ms. */
export const retryAfterOf = (e: unknown): number | null => {
  const v = (e as { retryAfterMs?: unknown } | null)?.retryAfterMs
  return typeof v === 'number' && v > 0 ? v : null
}

const retryable = (status: number | null): boolean => status === null || status === 429 || status === 408 || status >= 500
const MAX_WAIT_MS = 30_000

export async function readDetailsResilient<T>(
  ids: string[], get: (id: string) => Promise<T>, opts: ReaderOptions,
): Promise<{ results: Map<string, T | null>; stats: DetailReadStats }> {
  const sleep = opts.sleep ?? realSleep
  const attempts = opts.attempts ?? 4
  const base = opts.baseDelayMs ?? 500
  const max = Math.max(1, opts.concurrency)
  const min = Math.min(max, Math.max(1, opts.minConcurrency ?? 2))
  const endAt = opts.budgetMs === undefined ? Infinity : Date.now() + opts.budgetMs
  const outOfTime = (): boolean => Date.now() >= endAt

  const results = new Map<string, T | null>()
  const reasons: Record<string, number> = {}
  const permanent = new Set<string>()
  const firstTryOk = new Set<string>()
  let cur = max
  let pauseUntil = 0
  let streak = 0

  const throttle = (waitMs: number) => {
    cur = Math.max(min, Math.floor(cur / 2))
    streak = 0
    pauseUntil = Math.max(pauseUntil, Date.now() + Math.min(waitMs, MAX_WAIT_MS))
  }

  async function readOne(id: string, round: number): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const wait = pauseUntil - Date.now()
      if (wait > 0) await sleep(wait)
      if (outOfTime()) return
      try {
        results.set(id, await get(id))
        if (round === 0 && attempt === 1) firstTryOk.add(id)
        if (++streak >= 10 && cur < max) { cur++; streak = 0 }
        return
      } catch (e) {
        const status = statusOf(e)
        const key = String(status ?? 'network')
        reasons[key] = (reasons[key] ?? 0) + 1
        if (!retryable(status)) { permanent.add(id); return }
        const backoff = base * 2 ** (attempt - 1) + Math.floor(Math.random() * base)
        if (status === 429) throttle(retryAfterOf(e) ?? backoff)
        else await sleep(backoff)
      }
    }
  }

  async function runRound(list: string[], round: number): Promise<void> {
    const queue = [...list]
    const worker = async (w: number): Promise<void> => {
      while (queue.length > 0 && !outOfTime()) {
        if (w >= cur) { await sleep(50); continue }       // parked while the pool is narrowed
        const id = queue.shift()
        if (id === undefined) return
        await readOne(id, round)
      }
    }
    await Promise.all(Array.from({ length: Math.min(max, list.length) }, (_, w) => worker(w)))
  }

  await runRound(ids, 0)
  for (let round = 1; round <= (opts.extraRounds ?? 2); round++) {
    const left = ids.filter(id => !results.has(id) && !permanent.has(id))
    if (!left.length || outOfTime()) break
    cur = min                                              // after a throttled round, start gently
    await sleep(opts.roundDelayMs ?? 3000)
    await runRound(left, round)
  }

  const failedIds = ids.filter(id => !results.has(id))
  for (const id of failedIds) results.set(id, null)
  const ok = ids.length - failedIds.length
  return {
    results,
    stats: { at: new Date().toISOString(), requested: ids.length, firstTry: firstTryOk.size, recovered: ok - firstTryOk.size, failed: failedIds.length, reasons, endConcurrency: cur },
  }
}

let lastStats: DetailReadStats | null = null
export const recordDetailReadStats = (s: DetailReadStats): void => { lastStats = s }
/** The most recent MDM detail read, for diagnostics. */
export const getDetailReadStats = (): DetailReadStats | null => lastStats
