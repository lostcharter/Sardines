import { useEffect, useRef, useState } from 'react'
import { DESCRIPTION_LIMIT, NAME_LIMIT, REPORT_CATEGORIES, REPORT_SCREENS, readReporterName, rememberReporterName, validateReport } from '../../../src/features/problem-report/reportContract.js'
import { reportingConfigured, submitReport } from '../../../src/features/problem-report/reportClient.js'
import { loadTurnstile } from './turnstile.js'
import defaultConfig from '../../../src/features/problem-report/reportingConfig.json'
import './reporter.css'

function SpamCheck({ siteKey, onToken, onError, widgetRef }) {
  const container = useRef(null)
  useEffect(() => {
    let cancelled = false
    let widget
    let api
    loadTurnstile().then((loaded) => {
      if (cancelled) return
      api = loaded
      widget = api.render(container.current, {
        sitekey: siteKey, action: 'problem_report',
        callback: (token) => { onToken(token); onError('') },
        'expired-callback': () => onToken(''),
        'error-callback': () => { onToken(''); onError('Spam check failed. Close and reopen the reporter to try again.'); return true },
      })
      widgetRef.current = () => api.reset(widget)
    }).catch((error) => { if (!cancelled) onError(error.message) })
    return () => { cancelled = true; widgetRef.current = null; if (api && widget !== undefined) api.remove(widget) }
  }, [siteKey, onToken, onError, widgetRef])
  return <div ref={container} className="problem-report-spam" />
}

export default function ReportForm({ screen = 'General', config = defaultConfig }) {
  const resetSpam = useRef(null)
  const [name, setName] = useState(() => { try { return readReporterName(window.localStorage) } catch { return '' } })
  const [category, setCategory] = useState('Bug')
  const [description, setDescription] = useState('')
  const [reportScreen, setReportScreen] = useState(REPORT_SCREENS.includes(screen) ? screen : 'General')
  const [token, setToken] = useState('')
  const [spamError, setSpamError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sending, setSending] = useState(false)
  const configured = reportingConfigured(config)

  async function send(event) {
    event.preventDefault()
    if (sending) return
    setError(''); setSuccess('')
    const draft = { name, category, description, screen: reportScreen }
    const invalid = validateReport(draft)
    if (invalid) { setError(invalid); return }
    setSending(true)
    try {
      const number = await submitReport(config, draft, token)
      setSuccess(`Report #${number} sent. Thanks, ${name.trim()}.`)
      setDescription('')
    } catch (caught) { setError(caught.message) }
    finally {
      setSending(false); setToken('')
      try { resetSpam.current?.() } catch { setSpamError('Close and reopen the reporter to refresh the spam check.') }
    }
  }
  return <main className="problem-report-card" aria-labelledby="problem-report-title">
      <form onSubmit={send}>
        <h2 id="problem-report-title">Report a Problem</h2>
        <p id="problem-report-privacy">Do not include passenger, passport, ticket, or booking details.</p>
        <label>Your name<input autoFocus autoComplete="name" required maxLength={NAME_LIMIT} value={name} disabled={sending} onChange={(event) => {
          setName(event.target.value)
          try { rememberReporterName(window.localStorage, event.target.value) } catch { /* Storage may be disabled. */ }
        }} /></label>
        <small>Remembered on this browser.</small>
        <div className="problem-report-fields">
          <label>Category<select value={category} disabled={sending} onChange={(event) => setCategory(event.target.value)}>{REPORT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Screen<select value={reportScreen} disabled={sending} onChange={(event) => setReportScreen(event.target.value)}>{REPORT_SCREENS.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <label>Description<textarea required minLength={10} maxLength={DESCRIPTION_LIMIT} rows={4} value={description} disabled={sending} onChange={(event) => setDescription(event.target.value)} placeholder="What happened? What did you expect?" /></label>
        {!configured && <p role="status">Reporting is not configured yet. Please contact the Sardines maintainer directly.</p>}
        {configured && <SpamCheck siteKey={config.siteKey} onToken={setToken} onError={setSpamError} widgetRef={resetSpam} />}
        {spamError && <p role="alert">{spamError}</p>}
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">{success}</p>}
        <div className="problem-report-actions"><button type="button" disabled={sending} onClick={() => window.close()}>Close tab</button><button type="submit" disabled={sending || !configured || !token}>{sending ? 'Sending…' : 'Send report'}</button></div>
      </form>
  </main>
}
