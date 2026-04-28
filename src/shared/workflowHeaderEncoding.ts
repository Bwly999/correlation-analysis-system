export const encodeWorkflowHeaderValue = (value: string): string => encodeURIComponent(value)

export const decodeWorkflowHeaderValue = (value: string | undefined): string | undefined => {
  if (!value) return value

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
