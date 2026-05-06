import { join } from 'node:path'

export const LOCAL_SEVEN_ZIP_DIRS = ['.local-tools/7zip', 'tools/7zip']
export const SEVEN_ZIP_EXECUTABLES = ['7z.exe', '7za.exe']
export const SEVEN_ZIP_PATH_COMMANDS = ['7z', '7za']

const EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  'dist-ssr',
  'dist-server',
  'coverage',
  '__screenshots__',
  '__pycache__',
  '.vscode',
  '.idea',
  '.worktrees',
  '.superpowers',
  '.venv310',
  '.workflow-storage',
  '.local-tools',
  'tools/7zip',
]

const EXCLUDE_FILE_PATTERNS = [
  'cloc-*',
  '*.tsbuildinfo',
  '*.local',
  '*.sw?',
  '*.suo',
  '*.ntvs*',
  '*.njsproj',
  '*.sln',
  '*.py[cod]',
  '*.timestamp-*-*.mjs',
  '*.zip.tmp',
  '.DS_Store',
  '.eslintcache',
  '.env.local',
]

export function getArchiveGlobIgnore(projectName) {
  return [
    ...EXCLUDE_DIRS.map((dir) => `${dir}/**`),
    ...EXCLUDE_FILE_PATTERNS,
    `${projectName}*.zip`,
  ]
}

export function getSevenZipExcludeArgs(projectName) {
  return [
    ...EXCLUDE_DIRS.map((dir) => `-xr!${dir}`),
    ...EXCLUDE_FILE_PATTERNS.map((pattern) => `-xr!${pattern}`),
    `-xr!${projectName}*.zip`,
  ]
}

export function getLocalSevenZipPaths(projectDir) {
  return LOCAL_SEVEN_ZIP_DIRS.flatMap((dir) =>
    SEVEN_ZIP_EXECUTABLES.map((exe) => join(projectDir, dir, exe)),
  )
}

export function getSevenZipCommandCandidates(projectDir) {
  return [...getLocalSevenZipPaths(projectDir), ...SEVEN_ZIP_PATH_COMMANDS]
}
