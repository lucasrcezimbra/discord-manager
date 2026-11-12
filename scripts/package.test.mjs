import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const repository = fileURLToPath(new URL('../', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'discord-manager-package-'))
const database = join(directory, 'store.db')
const environment = {
  ...process.env,
  DATABASE_PATH: database,
  DISCORD_BOT_TOKEN: 'package-test-token',
  DISCORD_OWNER_USER_ID: '123456789012345678',
  DISCORD_GUILD_ID: '234567890123456789',
}
const executable = join(directory, 'node_modules', '.bin', 'discord-manager')
const manifest = JSON.parse(
  readFileSync(join(repository, 'package.json'), 'utf8')
)

function run(command, args, cwd = directory, env = environment) {
  return spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  })
}

function succeeds(result) {
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
}

before(() => {
  succeeds(run('npm', ['run', 'build'], repository))
  const packed = run(
    'npm',
    ['pack', '--json', '--pack-destination', directory],
    repository
  )
  succeeds(packed)
  const [{ filename, files }] = JSON.parse(packed.stdout)
  assert.ok(files.some(({ path }) => path === 'dist/cli.js'))
  assert.ok(files.some(({ path }) => path.startsWith('dist/db/migrations/')))
  assert.equal(
    files.some(({ path }) => path === '.env' || path.startsWith('data/')),
    false
  )
  succeeds(
    run('npm', [
      'install',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      join(directory, filename),
    ])
  )
})

after(() => rmSync(directory, { recursive: true, force: true }))

test('the installed command shows help without credentials', () => {
  const env = {
    ...environment,
    DISCORD_BOT_TOKEN: undefined,
    DISCORD_OWNER_USER_ID: undefined,
    DISCORD_GUILD_ID: undefined,
  }
  const result = run(executable, ['--help'], directory, env)
  succeeds(result)
  assert.match(result.stdout, /discord-manager <mcp\|ingest\|migrate>/)
  assert.equal(result.stderr, '')
})

test('the installed command reports its package version', () => {
  const result = run(executable, ['--version'])
  succeeds(result)
  assert.equal(result.stdout.trim(), manifest.version)
})

test('an unknown command fails before loading credentials', () => {
  const result = run(executable, ['not-a-command'])
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Unknown command: not-a-command/)
})

test('a missing explicit environment file fails without starting MCP', () => {
  const result = run(executable, [
    'mcp',
    '--config',
    join(directory, 'missing.env'),
  ])
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /missing.env/)
})

test('the installed migrator finds every packaged migration from another directory', () => {
  const result = run(executable, ['migrate'])
  succeeds(result)
  assert.match(result.stdout, /Migration .* was executed successfully/)
  succeeds(run(executable, ['migrate']))
})

test('MCP loads an explicit environment file and answers a real client from another directory', async () => {
  const envFile = join(directory, 'manager.env')
  writeFileSync(
    envFile,
    Object.entries(environment)
      .filter(([key]) => key.startsWith('DISCORD_') || key === 'DATABASE_PATH')
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join('\n')
  )
  const env = {
    ...environment,
    DATABASE_PATH: undefined,
    DISCORD_BOT_TOKEN: undefined,
    DISCORD_OWNER_USER_ID: undefined,
    DISCORD_GUILD_ID: undefined,
  }
  const transport = new StdioClientTransport({
    command: executable,
    args: ['mcp', '--config', envFile],
    cwd: directory,
    env,
    stderr: 'pipe',
  })
  const client = new Client({
    name: 'installed-package-test',
    version: '1.0.0',
  })
  try {
    await client.connect(transport)
    const { tools } = await client.listTools()
    assert.ok(tools.some(({ name }) => name === 'ingestion_status'))
    const result = await client.callTool({
      name: 'ingestion_status',
      arguments: {},
    })
    assert.notEqual(result.isError, true)
    assert.ok(result.content.length > 0)
  } finally {
    await client.close()
  }
})

test('MCP reports missing credentials on stderr without writing protocol noise', () => {
  const env = { ...environment, DISCORD_BOT_TOKEN: undefined }
  const result = run(executable, ['mcp'], directory, env)
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /DISCORD_BOT_TOKEN/)
})
