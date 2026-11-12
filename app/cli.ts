#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { parseArgs, parseEnv } from 'node:util'
import packageMetadata from '../package.json'

const commands = {
  mcp: './mcp/run.js',
  ingest: './ingest/run.js',
  migrate: './db/scripts/migrate.js',
}

const usage = `Usage: discord-manager <mcp|ingest|migrate> [--config <path>]

Commands:
  mcp       Start the MCP stdio server
  ingest    Start Discord gateway ingestion
  migrate   Apply database migrations

Options:
  --config <path>  Read configuration from this file; existing environment values win
  --help, -h        Show this help
  --version, -v     Show the package version
`

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  })

  if (values.help) {
    process.stdout.write(usage)
  } else if (values.version) {
    process.stdout.write(`${packageMetadata.version}\n`)
  } else {
    const [command] = positionals

    if (!command) throw new Error(usage)
    if (!Object.hasOwn(commands, command)) {
      throw new Error(`Unknown command: ${command}\n\n${usage}`)
    }
    if (positionals.length !== 1) {
      throw new Error(
        `Unexpected arguments: ${positionals.slice(1).join(' ')}\n\n${usage}`
      )
    }

    if (values.config) {
      const configuration = parseEnv(readFileSync(values.config, 'utf8'))
      for (const [key, value] of Object.entries(configuration)) {
        process.env[key] ??= value
      }
    }

    await import(
      new URL(commands[command as keyof typeof commands], import.meta.url).href
    )
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Discord Manager could not start'
  )
  process.exitCode = 1
}
