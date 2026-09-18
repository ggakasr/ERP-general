// Pre-commit secret scan (CLAUDE.md §13 "no secrets"). Deliberately narrow: this project's
// docs/UI intentionally publish a shared demo password everywhere, so a naive
// /password/i grep would block every commit. We only flag things that look like a
// REAL leaked credential — private keys, live connection strings, provider API keys —
// and skip files that are documented, known-safe places for placeholders/demo creds.
import { execSync } from 'node:child_process'

const SKIP_FILES = [
  'docs/demo-guide.md',
  'src/app/login/page.tsx',
  '.env.local.example',
  'supabase/seed/seed.sql',
  'scripts/pre-commit-secrets.mjs',
]

const PATTERNS = [
  { name: 'private key block', re: /-----BEGIN (RSA|EC|OPENSSH|PGP|DSA) PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'live Postgres connection string', re: /postgres(?:ql)?:\/\/[^:\s'"]+:[^@\s'"]{4,}@/ },
  { name: 'OpenAI-style API key', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'generic secret assignment', re: /\b(?:api[_-]?key|secret|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9/+_-]{16,}['"]/i },
]
// Placeholder values that would otherwise match "generic secret assignment" — never real leaks.
const ALLOW_VALUES = ['your-anon-key', 'your-project', 'choose-a-code']

function stagedFiles() {
  return execSync('git diff --cached --name-only --diff-filter=ACM').toString().trim().split('\n').filter(Boolean)
}

function main() {
  if (stagedFiles().some((f) => f === '.env.local' || f.endsWith('/.env.local'))) {
    console.error('BLOCKED: .env.local is staged for commit — this file must never be committed.')
    process.exit(1)
  }

  const diff = execSync('git diff --cached -U0 --diff-filter=ACM').toString()
  let file = null
  let hit = false
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) { file = line.slice(6); continue }
    if (!line.startsWith('+') || line.startsWith('+++')) continue
    if (file && SKIP_FILES.includes(file)) continue
    if (ALLOW_VALUES.some((v) => line.includes(v))) continue
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        console.error(`BLOCKED: possible ${p.name} in ${file}:\n  ${line.slice(0, 200)}`)
        hit = true
      }
    }
  }
  if (hit) {
    console.error('\nIf this is a false positive, adjust scripts/pre-commit-secrets.mjs — never bypass with --no-verify.')
    process.exit(1)
  }
}

main()
