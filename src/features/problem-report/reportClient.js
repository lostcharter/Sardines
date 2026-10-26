import { validateReport } from './reportContract.js'

export function reportingConfigured(config) {
  try { return new URL(config.endpoint).protocol === 'https:' && Boolean(config.siteKey?.trim()) } catch { return false }
}

export async function submitReport(config, draft, token, fetcher = fetch) {
  const error = validateReport(draft)
  if (error) throw new Error(error)
  if (!reportingConfigured(config)) throw new Error('Reporting is not configured yet. Please contact the Sardines maintainer directly.')
  if (!token) throw new Error('Complete the spam check before sending.')
  let response
  try {
    response = await fetcher(config.endpoint, {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      // Explicit allowlist: never serialize a component, event, file, or app state.
      body: JSON.stringify({ name: draft.name.trim(), category: draft.category, description: draft.description.trim(), screen: draft.screen, turnstileToken: token }),
    })
  } catch {
    throw new Error('Could not confirm submission. Your text is still here. A report may have arrived; check with the maintainer before retrying.')
  }
  if (!response.ok) {
    const messages = {
      400: 'The report was rejected. Check the fields and try again.',
      403: 'The spam check failed or this site is not permitted. Please try a fresh check.',
      413: 'The report is too large. Shorten the description and try again.',
      429: 'Too many reports were sent recently. Wait a minute before trying again.',
      504: 'Could not confirm submission. Your text is still here. A report may have arrived; check with the maintainer before retrying.',
    }
    throw new Error(messages[response.status] || 'Reporting is temporarily unavailable. Your text is still here; please contact the maintainer directly if this continues.')
  }
  let result
  try { result = await response.json() } catch { /* Never expose upstream response bodies. */ }
  if (!Number.isSafeInteger(result?.number) || result.number < 1) throw new Error('Could not confirm submission. Your text is still here; check with the maintainer before retrying.')
  return result.number
}
