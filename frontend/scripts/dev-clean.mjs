import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const cliPorts = process.argv.slice(2)
const TARGET_PORTS = cliPorts.length > 0
  ? cliPorts
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0)
  : [5173]

function findPidsForPort(port) {
  const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  return Array.from(
    new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/))
        .filter((parts) => parts.length >= 5 && parts[3] === 'LISTENING')
        .map((parts) => parts[4]),
    ),
  )
}

function killPid(pid) {
  execSync(`taskkill /PID ${pid} /F`, {
    stdio: 'ignore',
  })
}

for (const port of TARGET_PORTS) {
  let pids = []
  try {
    pids = findPidsForPort(port)
  } catch {
    pids = []
  }

  if (pids.length === 0) {
    console.log(`Port ${port}: clear`)
    continue
  }

  for (const pid of pids) {
    try {
      killPid(pid)
      console.log(`Port ${port}: stopped PID ${pid}`)
    } catch {
      console.log(`Port ${port}: failed to stop PID ${pid}`)
    }
  }
}

const viteCacheDir = path.resolve(process.cwd(), 'node_modules', '.vite')
try {
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  console.log(`Cleared Vite cache: ${viteCacheDir}`)
} catch {
  console.log(`Failed to clear Vite cache: ${viteCacheDir}`)
}
