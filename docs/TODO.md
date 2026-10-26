# Sardines to-do

Entries describe planned work or outstanding setup, not authorization to implement
unrelated features. See the [README](../README.md) for current behavior.

## Report a Problem

**Design revised October 25, 2026. Worker deployed and frontend configured; real
submission/email verification remain pending.** This replaces the October 24
browser archive, screenshots, issue dashboard, and ZIP-export proposal.

### Implemented design

The separate-origin isolation update passed local verification before release.
The Worker, Turnstile hostname, and Pages build are deployed. Live browser checks
confirmed the new-tab isolation and no challenge requests on the passenger page.
Genuine submission and email acceptance checks remain outstanding.

- An application-level **Report a Problem** link is accessible from Pack the Tin,
  Relabel the Tin, Quality Check, and Test Can. It opens the form on the separate
  Worker origin with no opener or referrer, leaving the active workflow untouched.
  Turnstile never loads in the passenger-processing page. Only an allowlisted
  screen label crosses from Sardines to the reporter; no window messaging is used.
- Required **Your name**, category (Bug / Annoyance / Suggestion), description,
  and editable application-screen label.
- Only the name is remembered locally on the reporter origin, and it stays editable.
  It is self-reported identification for follow-up, not authentication. Blocked
  browser storage does not prevent submission.
- No accounts or login for reporters. A separate Cloudflare Worker creates issues
  in a dedicated private GitHub repository using a narrowly scoped Worker secret.
- The name appears prominently in the issue body. An optional configured assignee
  sends incoming issues to the maintainer; GitHub watch/email preferences provide
  notifications, including own activity when using the maintainer's token.
- Spam checks use Turnstile Free with mandatory server verification, bounded and
  allowlisted inputs, restricted CORS, and native per-IP/aggregate rate limiting.
- No automatically transmitted passenger information, uploaded files, filenames,
  operational application data, or logs. Users see a sensitive-information warning.
- Clear success/failure messages; failure retains text in memory and does not
  disrupt other workflows. Uncertain delivery is reported without automatic retry.
- **Strict $0:** Workers Free and Turnstile Free only. No paid services,
  subscriptions, billing enrollment, usage-based charges, R2, or email provider.
- No screenshots, ZIP exports, local report archive, custom dashboard, or sounds.
  Sardines remains silent. Reports are managed in GitHub.

### Remaining setup and acceptance

Follow [problem-reporting-setup.md](problem-reporting-setup.md):

- [x] Create private `lostcharter/Sardines-feedback` with Issues enabled.
- [x] Owner created the narrowly scoped token and Turnstile widget and confirmed
  Workers Free. No billing enrollment or paid service was enabled.
- [x] Deploy the separate Worker with limiter bindings and interactively entered
  secrets. Existing Workers were not modified.
- [x] Configure the public endpoint/site key in the frontend. Publish through the
  unchanged Pages workflow and verify the deployment.
- [x] Subscribe the maintainer to the feedback repository.
- [ ] Confirm personal GitHub email preferences and **Include your own updates**.
- [ ] Submit a harmless real report without a GitHub login, verify the name,
   assignment, privacy, and notification email. Check that workflow data survives
   opening/closing the reporting tab and that remembered names can be changed.

Automated tests mock services. Live rejection checks create no issues. Actual
issue creation, assignment, and notification delivery require the final live test.
