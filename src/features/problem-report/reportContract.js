export const REPORT_CATEGORIES = ['Bug', 'Annoyance', 'Suggestion']
export const REPORT_SCREENS = ['Pack the Tin', 'Relabel the Tin', 'Quality Check', 'Test Can', 'General']
export const NAME_LIMIT = 80
export const DESCRIPTION_LIMIT = 4000
export const NAME_STORAGE_KEY = 'sardines-reporter-name-v1'

const hasControls = (text, multiline = false) => [...text].some((char) => {
  const code = char.charCodeAt(0)
  return (code < 32 && !(multiline && '\t\r\n'.includes(char))) || code === 127
})

export function validateReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Enter a report.'
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > NAME_LIMIT || hasControls(value.name)) return 'Enter your name (up to 80 characters, on one line).'
  if (!REPORT_CATEGORIES.includes(value.category)) return 'Choose a problem category.'
  if (!REPORT_SCREENS.includes(value.screen)) return 'Choose an application screen.'
  if (typeof value.description !== 'string' || value.description.trim().length < 10 || value.description.length > DESCRIPTION_LIMIT || hasControls(value.description, true)) return 'Describe the problem in 10–4,000 characters.'
  return ''
}

// Storage is optional. No description, report history, or operational data is saved.
export function readReporterName(storage) {
  try { return (storage.getItem(NAME_STORAGE_KEY) || '').slice(0, NAME_LIMIT) } catch { return '' }
}

export function rememberReporterName(storage, name) {
  try { storage.setItem(NAME_STORAGE_KEY, name.slice(0, NAME_LIMIT)) } catch { /* Reporting still works without storage. */ }
}
