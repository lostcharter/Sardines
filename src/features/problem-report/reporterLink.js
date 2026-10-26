import { REPORT_SCREENS } from './reportContract.js'

export function reporterLink(endpoint, screen, appOrigin) {
  try {
    const configured = new URL(endpoint)
    const url = new URL('/', configured)
    if (url.protocol !== 'https:' || url.origin === appOrigin || configured.username || configured.password) return null
    url.searchParams.set('screen', REPORT_SCREENS.includes(screen) ? screen : 'General')
    return url.href
  } catch { return null }
}
