import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function findJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? findJavaScriptFiles(path) : entry.name.endsWith('.js') ? [path] : []
    }),
  )

  return files.flat()
}

const files = await findJavaScriptFiles('dist/assets')

if (files.length === 0) {
  console.error('Static showcase artifact contains no JavaScript assets.')
  process.exit(1)
}

const artifact = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n')

if (/supabase\.co/i.test(artifact) || /VITE_SUPABASE_(URL|ANON_KEY)/.test(artifact)) {
  console.error('Static showcase artifact contains Supabase configuration.')
  process.exit(1)
}
