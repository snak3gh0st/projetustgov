// One run per sync job at a time in this process. A second click (or a cron
// firing during a manual run) gets 409 instead of a concurrent run that doubles
// the load on the pool and the government download.

const running = new Set<string>()

export class SyncAlreadyRunningError extends Error {
  constructor(job: string) {
    super(`Sincronização ${job} já está em andamento`)
  }
}

export async function runExclusive<T>(job: string, fn: () => Promise<T>): Promise<T> {
  if (running.has(job)) throw new SyncAlreadyRunningError(job)
  running.add(job)
  try {
    return await fn()
  } finally {
    running.delete(job)
  }
}
