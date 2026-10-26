let loading

export function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      const timer = setTimeout(failed, 15000)
      function failed() {
        clearTimeout(timer)
        script.remove()
        loading = undefined
        reject(new Error('Spam check could not load. Close and reopen the reporter to try again.'))
      }
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = () => { clearTimeout(timer); if (window.turnstile) resolve(window.turnstile); else failed() }
      script.onerror = failed
      document.head.append(script)
    })
  }
  return loading
}
