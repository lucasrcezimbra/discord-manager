import Database from 'better-sqlite3'
import { vi } from 'vitest'

type QueryPlanStep = { detail: string }

async function queryPlansWhile(run: () => Promise<unknown>) {
  const prepare = Database.prototype.prepare
  const steps: string[] = []

  const spy = vi
    .spyOn(Database.prototype, 'prepare')
    .mockImplementation(function (this: Database.Database, source: string) {
      const statement = prepare.call(this, source)
      if (!statement.reader) return statement

      const all = statement.all.bind(statement)
      statement.all = (parameters: unknown[]) => {
        const plan = prepare
          .call(this, `explain query plan ${source}`)
          .all(parameters) as QueryPlanStep[]
        steps.push(...plan.map(({ detail }) => detail))
        return all(parameters)
      }

      return statement
    })

  try {
    await run()
  } finally {
    spy.mockRestore()
  }

  return steps
}

export { queryPlansWhile }
