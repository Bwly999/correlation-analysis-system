const sanitizeFilenamePart = (value: string) =>
  value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

export const formatExportTimestamp = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

export const resolveExportFilename = (
  requestedName: unknown,
  fallbackBaseName: string,
  extension: string,
  options?: { appendTimestamp?: boolean },
) => {
  const shouldAppendTimestamp = options?.appendTimestamp ?? false
  const requested =
    typeof requestedName === 'string' && requestedName.trim() !== '' && requestedName !== 'export_data'
      ? requestedName
      : fallbackBaseName

  const normalizedBase = sanitizeFilenamePart(requested) || sanitizeFilenamePart(fallbackBaseName) || 'export'
  const baseName = shouldAppendTimestamp
    ? `${normalizedBase}_${formatExportTimestamp()}`
    : normalizedBase

  return `${baseName}.${extension}`
}
