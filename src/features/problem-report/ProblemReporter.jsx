import { reporterLink } from './reporterLink.js'
import config from './reportingConfig.json'
import './problemReport.css'

export default function ProblemReporter({ screen = 'General' }) {
  const href = reporterLink(config.endpoint, screen, window.location.origin)
  return href
    ? <a className="problem-report-trigger" href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title="Opens a separate reporting tab">Report a Problem</a>
    : <button type="button" className="problem-report-trigger" disabled>Reporting unavailable</button>
}
