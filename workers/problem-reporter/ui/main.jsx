import { createRoot } from 'react-dom/client'
import ReportForm from './ReportForm.jsx'

// Only a fixed screen label is accepted. No opener access or cross-window messages.
const screen = new URLSearchParams(window.location.search).get('screen')
createRoot(document.getElementById('root')).render(<ReportForm screen={screen} />)
