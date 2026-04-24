const path = require('path')
const fs = require('fs')

const ROOT_DIR = __dirname
const IS_WIN32 = process.platform === 'win32'

// 跨平台 venv 可执行文件目录
const VENV_BIN_DIR = IS_WIN32 ? 'Scripts' : 'bin'
const VENV_DIR = path.join(ROOT_DIR, 'backend', '.venv')
const UVICORN = path.join(VENV_DIR, VENV_BIN_DIR, IS_WIN32 ? 'uvicorn.exe' : 'uvicorn')

// 解析 server.env 为环境变量对象
function loadEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    env[key] = val
  }
  return env
}

const SERVER_ENV = loadEnvFile(path.join(ROOT_DIR, 'deploy', 'env', 'server.env'))

// 日志目录
const LOG_DIR = path.join(ROOT_DIR, 'deploy', 'logs')
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

module.exports = {
  apps: [
    {
      name: 'cas-node',
      cwd: ROOT_DIR,
      script: path.join(ROOT_DIR, 'dist-server', 'server', 'index.js'),
      interpreter: 'node',
      env: SERVER_ENV,
      error_file: path.join(LOG_DIR, 'node-error.log'),
      out_file: path.join(LOG_DIR, 'node-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 3000,
      autorestart: true,
      watch: false,
    },
    {
      name: 'cas-python',
      cwd: ROOT_DIR,
      script: UVICORN,
      args: 'backend.main:app --host 127.0.0.1 --port 8000',
      interpreter: 'none',
      error_file: path.join(LOG_DIR, 'python-error.log'),
      out_file: path.join(LOG_DIR, 'python-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 3000,
      autorestart: true,
      watch: false,
    },
  ],
}
