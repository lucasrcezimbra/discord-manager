import { chmod, readdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const migrations = await readdir(
  new URL('../app/db/migrations/', import.meta.url)
)

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true })

await build({
  absWorkingDir: root,
  entryPoints: [
    'app/cli.ts',
    'app/mcp/run.ts',
    'app/ingest/run.ts',
    'app/db/scripts/migrate.ts',
    ...migrations
      .filter((file) => file.endsWith('.ts'))
      .map((file) => `app/db/migrations/${file}`),
  ],
  outbase: 'app',
  outdir: 'dist',
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning',
})

await chmod(new URL('../dist/cli.js', import.meta.url), 0o755)
