# Report a Problem: free setup and operation

## Deployment status — October 25, 2026

The separate-origin isolation change passed local verification before release.
The existing Turnstile widget now allows only the reporter hostname; its mode and
secret were retained. The existing Worker now serves the reporter assets with the
security headers below. The matching Pages build was published by the unchanged
workflow (run `40260813510`, commit `dedcdbb`); reload previously opened tabs.

Local verification passed: lint, both production builds, 216 passing tests (five
private-input tests skipped), and a Chrome browser check using the production
builds at their intended origins with intercepted requests. That browser check
confirmed null opener, empty referrer, name persistence, validation, failure and
success handling through the Worker, and no transmission of synthetic passenger
or file markers. Turnstile and GitHub were mocked; this is not a real submission
or evidence of email delivery. The owner approved deployment after these local
checks, followed by a harmless genuine live acceptance test.

Live Chrome checks also confirmed null opener, empty referrer, only the fixed
screen label in the new tab URL, no Turnstile requests on the passenger page, and
no transmission of synthetic passenger/file markers. The published JS/CSS matched
the successful CI artifact; the app bundle has no Turnstile loader or reporter
name-storage code. Live malformed reports returned 400; the former Pages-origin
submission returned 403. The real Turnstile script loaded, but the automated
browser did not complete human verification. No real issue was submitted by
these checks; a human acceptance test and email confirmation remain pending.

### Configuration

- Intake: private `lostcharter/Sardines-feedback`, with Issues enabled.
- Worker: `sardines-problem-reporter` in the existing Cloudflare account; the owner
  confirmed Workers Free. No billing enrollment, paid service, or upgrade was enabled.
- Endpoint: `https://sardines-problem-reporter.lostcharter-studio.workers.dev/report`.
- Allowed submission origin: `https://sardines-problem-reporter.lostcharter-studio.workers.dev`;
  assignee: `lostcharter`. Submissions from the Pages origin are rejected.
- The form and Turnstile are hosted only on that separate Worker origin. The
  Sardines link opens a new tab with `noopener noreferrer` and passes only an
  allowlisted screen label. No iframe or cross-window messaging is used. Reporter
  responses also enforce opener isolation, no referrer, no framing, and a CSP.
- Both `GITHUB_TOKEN` and `TURNSTILE_SECRET` were entered through separate masked
  interactive Wrangler prompts. Only binding names were checked afterward.
- Frontend configuration contains the public endpoint/site key. The existing Pages
  workflow is unchanged. Reporter assets have a separate build and deploy with this
  Worker; no passenger parsers or operational UI are included. Other Workers are unchanged;
  reporter rate-limit namespace IDs `19401` and `19402` did not conflict with them.
- The account is subscribed to the feedback repository. Personal email preferences
  still need confirmation. **Real issue submission and email delivery are not yet verified.**
- Before the isolation change, live rejection checks passed for CORS preflight, disallowed origins, non-JSON,
  invalid forms, an invalid Turnstile token, and rate limiting (`429` with a 60-second
  retry indication). Rate limiting is approximate: short bursts can exceed 3 requests
  before counters synchronize. No issue was created by these checks.

The instructions below document setup and future reconfiguration. The app and tests
do not create resources or credentials automatically. Never edit the generated
`.wrangler/reporter-check/index.js`; the Worker source is
`workers/problem-reporter/index.js`.

## Budget boundary

Use **Workers Free** and **Turnstile Free** only. Do not upgrade, enroll in billing,
add payment details, enable R2, or add a paid plan, storage service, email service,
or subscription. If any screen requires payment or an upgrade, stop. Nothing here
requires a custom domain: the Worker uses its free `workers.dev` address.

Published limits checked October 25, 2026: Workers Free allows 100,000 requests
per day across the account, with 10 ms CPU per invocation; exhausted quotas cause
failures rather than an automatic paid upgrade. Turnstile has a free plan. Other
Workers on the same account share allowances. Confirm the account is actually on
Workers Free before deployment; this project cannot override account billing.

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/)

## 1. Create the private feedback repository

In your existing GitHub account, create a **Private** repository, for example
`Sardines-feedback`. Keep Issues enabled. Do not enable Pages or add workflows
that execute submitted issue text. GitHub Free supports private repositories.
Use this repository just for intake; do not change Sardines' repository visibility.

Create a **fine-grained personal access token** in GitHub Settings → Developer
settings → Personal access tokens → Fine-grained tokens:

1. Select the account/organization owning the feedback repository.
2. Select **Only select repositories**, then that feedback repository alone.
3. Grant repository **Issues: Read and write**. Metadata read access is included
   by GitHub; no Contents, Actions, Administration, or other write permission is needed.
4. Choose an expiration and set yourself a reminder to replace the token.
5. If an organization owns the repository, complete any required approval.

Do not paste the token into this chat, source files, frontend configuration, GitHub
Pages settings, or shell command arguments. It will be entered at a hidden prompt
as a Cloudflare Worker secret. The token acts as your GitHub user; the entered
reporter name is displayed prominently in the body and is explicitly unverified.

## 2. Create a free Turnstile widget

In Cloudflare, open **Turnstile**, choose its **Free** plan, and add a managed widget
for Sardines. Set the allowed hostname to the reporter hostname,
`sardines-problem-reporter.lostcharter-studio.workers.dev` (no scheme or path).
Remove the former `lostcharter.github.io` hostname. Keep pre-clearance off.
There is no need to move DNS, proxy Pages, or add Cloudflare Access/logins.

Keep the **site key** for the public frontend configuration and the **secret key**
for the Worker. These are different values. The Worker checks hostname and the
fixed `problem_report` action after server-side verification. Do not use Turnstile
test keys in production.

## 3. Configure and deploy the separate Worker

Edit `workers/problem-reporter/wrangler.jsonc`:

| Variable | Value |
| --- | --- |
| `ALLOWED_ORIGIN` | Reporter Worker origin, `https://sardines-problem-reporter.lostcharter-studio.workers.dev`, with no trailing slash or path |
| `GITHUB_OWNER` | Feedback repository owner |
| `GITHUB_REPO` | Private feedback repository name |
| `GITHUB_ASSIGNEE` | Your GitHub login, or blank to omit assignment |

Your assignee must have access to the private repository. Assignment is convenience,
not the notification mechanism. GitHub may ignore an ineligible assignee; verify it
in the live test. Do not broaden the credential to fix an assignment problem.

The config also defines two native rate-limiter bindings: `REPORT_IP_LIMITER`
(3 requests/minute per IP) and `REPORT_GLOBAL_LIMITER` (10/minute across IPs within
each Cloudflare location). Their namespace IDs must be unused elsewhere in your
account, unless deliberately sharing the same limits. These require no database
or billing enrollment. Limits are approximate and per location, not a strict
worldwide daily cap. Coworkers sharing an office IP share the small IP allowance.

Use a current Node LTS release (22.22.2+ or 24.15+ for the form-test dependency).
From the Sardines project root in PowerShell:

```powershell
$env:WRANGLER_SEND_METRICS = 'false'
npx wrangler@4 login
npx wrangler@4 whoami
```

Confirm the intended account in Cloudflare and verify **Workers Free**. If the
account requires billing enrollment or is on a paid Workers plan, stop before
deployment and resolve that; do not enable anything billable.

Optional local packaging check (does not deploy):

```powershell
npm run build:reporter
npx wrangler@4 deploy --dry-run --config workers/problem-reporter/wrangler.jsonc --outdir .wrangler/reporter-check
```

Deploy the Worker, then enter each secret at its hidden prompt:

```powershell
npm run build:reporter
npx wrangler@4 deploy --config workers/problem-reporter/wrangler.jsonc
npx wrangler@4 secret put GITHUB_TOKEN --config workers/problem-reporter/wrangler.jsonc
npx wrangler@4 secret put TURNSTILE_SECRET --config workers/problem-reporter/wrangler.jsonc
```

The initial deployment fails closed until both secrets exist. Secret commands may
deploy a new Worker version. No credential goes in `vars`, JSON, the frontend,
or the repository. Local `.dev.vars*` and `.env*` files are ignored if needed later;
the normal setup does not need them. Worker observability is disabled in the config,
and handler code never logs reports, tokens, or upstream errors.

Always rebuild reporter assets before deploying the Worker. `vite.reporter.config.js`
builds only `workers/problem-reporter/ui` into the ignored `workers/problem-reporter/public`
directory. Wrangler uploads these static assets alongside the handler; there is no
R2/KV/database/billing enrollment. Requests run through the handler to apply security
headers and count against Workers Free allowances; exhausted allowances cause errors,
not paid overage. [Static asset pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

## 4. Configure the frontend without changing Pages deployment

Edit `src/features/problem-report/reportingConfig.json`:

```json
{
  "endpoint": "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/report",
  "siteKey": "YOUR-PUBLIC-TURNSTILE-SITE-KEY"
}
```

Both values are public. **Never put either secret here.** The endpoint's `/report`
path is required for submission. The operational launcher derives the reporter's
root page from that endpoint and refuses a same-origin or insecure URL; it never
imports the form, Turnstile, storage code, or submission client. Commit public config
and publish through the existing Pages workflow. No workflow changes or Pages secrets
are needed. Build/deploy the reporter separately when its form or configuration changes.
Submissions are authorized only from the reporter origin, not localhost or Pages.

## 5. Configure GitHub email notifications

In the feedback repository, choose **Watch → Custom → Issues** (or All Activity).
In GitHub **Settings → Notifications**, enable **Email** for watched repositories
and verify the desired notification email address. Enable **Include your own
updates**: a Worker using your token creates issues as you, even when a coworker
submitted the form. Assignment alone does not guarantee an email.

These are personal account preferences; the Worker does not change them. No
separate email provider or subscription is needed.

## 6. Real acceptance test after configuration

1. Open deployed Sardines while signed out of GitHub in that browser.
2. Reload any Sardines tabs that predate this fix; an old tab retains its old code.
   Keep an ordinary workflow with unsaved work open. **Report a Problem** must open
   a separate Worker-origin tab; `window.opener` must be null. The Sardines tab
   must make no Turnstile/challenge requests before or after clicking the link.
3. Enter a fictional/test name, choose a category and screen, and submit a short
   harmless test description. Do not use real traveler information.
4. Confirm the success message with an issue number. Close the reporting tab and
   confirm the original workflow is intact. Reopen the reporter and confirm its name
   is remembered and editable. Names saved on the former Pages origin are not migrated.
5. In the private feedback repository, verify the reporter name, description,
   category, screen, assignment, and received timestamp. Confirm there are no
   uploaded files, filenames, logs, passenger rows, or credentials.
6. Verify you receive the GitHub email, including spam/junk folders if necessary.
   Close the test issue after checking. A private issue link is not shown to
   reporters because they may not have GitHub access.
7. Test offline submission: the form retains the text and reports failure; closing
   it lets the main workflow continue. Reconnect before refreshing the spam check.

No live submission or email receipt has been verified until this test is completed.

## Privacy, failures, and upkeep

The required name is identification for convenience, not authentication. A person
can enter any name. Only the editable name is stored locally, under
`sardines-reporter-name-v1` on the Worker origin. The launcher neither reads nor
transfers the formerly remembered Pages-origin name. On shared browsers, change
or clear saved names as needed.
Storage failures do not block reports. Descriptions remain in memory after
submission failures and are cleared on success; they do not survive reporter reload or tab close.

Only name, category, screen, description, and a Turnstile token are submitted.
Cloudflare processes normal connection information and the spam check. The Worker
uses the connection IP only for rate limiting; it does not forward it to GitHub
or include it in reports. It adds a server timestamp. User text is literal Markdown
code-block content to avoid activating supplied mentions, images, or links.
The selected screen is an allowlisted label, not a URL, page capture, or file name.
Nothing reads operational workflow state or automatically attaches passenger data.

Users can still type sensitive information themselves. The form warns against it;
there is no claim of automatic personal-data detection. Review incoming reports,
limit repository access, and remove accidental sensitive content promptly, including
any notification emails. Private GitHub issues can still be copied into email.

The Worker accepts only small JSON reports from the configured origin, validates
all fields, rejects extra properties/files, verifies Turnstile server-side, rate
limits, and checks repository privacy before each creation. CORS is not authentication;
Turnstile and limits reduce spam, but do not prevent all human abuse. The Worker
does not accept arbitrary repositories, labels, API URLs, or assignees from users.

No automatic retries are performed. If a connection times out after GitHub accepts
an issue, the UI warns that it may have arrived. Check intake before retrying to
avoid duplicates; there is no report database or exactly-once delivery mechanism.
An invalid credential, unavailable service, missing binding, public destination,
or quota exhaustion makes reporting unavailable without stopping the main app.

To disable intake quickly, disable/delete the Worker or revoke its GitHub token.
To disable the frontend integration, clear the public endpoint/site key and rebuild.
Replace expiring secrets with `wrangler secret put`; retain narrow permissions.

Automated checks: `npm test`, `npm run lint`, `npm run build`, `npm run build:reporter`.
Build-isolation tests assert that the passenger bundle contains no Turnstile loader
and that the reporting bundle contains no passenger parsers or operational screens.
Form tests use jsdom
and Vite's module loader; Worker tests mock Cloudflare bindings and outbound HTTP.
They require no accounts, secrets, external submissions, or paid resources.

## Official references

- [Create an issue and permissions](https://docs.github.com/en/rest/issues/issues#create-an-issue)
- [GitHub plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Rate limiting bindings and limitations](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [GitHub notification settings](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications)
- [Email for your own activity](https://github.blog/news-insights/email-updates-about-your-own-activity/)
