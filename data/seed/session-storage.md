# GrantReady Content-only session storage

## Configuration required before preview retesting

No external account or service has been connected by this change. No credentials belong in source control.

Use a Redis REST service supporting GET and atomic EVAL (Upstash-compatible). Configure these **server-only** variables for the intended Vercel Preview environment:

- `GRANTREADY_REDIS_REST_URL`: the service's HTTPS REST endpoint.
- `GRANTREADY_REDIS_REST_TOKEN`: its write-capable REST credential, kept secret.

Do not use a `NEXT_PUBLIC_` prefix. Neither value is sent to the browser or logged. Use a separate preview database rather than sharing production data. The adapter uses the `grantready:v1:` key prefix. Choose service retention/eviction settings and capacity that preserve keys until TTL; provider deletion, eviction or outages can still prevent recovery. Verify provider pricing before enabling anything: a free tier may suffice for a demonstration, but no pricing or free-tier availability has been independently confirmed. This implementation adds no npm dependency or paid API call.

Vercel and production runtime fail closed if either variable is missing. The page can load, but generation cannot create a campaign. Build does not require credentials. Local `npm run dev` uses process memory unless both variables are configured; memory mode is not a deployment solution.

Once Michelle authorizes configuration and a separate preview deployment of these changes, verify `/grantready` on that preview. The currently deployed commit has not been updated. No production deployment is necessary.

## Behavior and limits

Sessions store server-owned campaign snapshots, a fixed one-hour expiry and an approval timestamp. Updates use Redis Lua compare-and-set so different application instances cannot commit contradictory decisions. Repeated approval of the same variation/cycle returns the original decision; another variation or further revision is rejected. Failed validation never writes a replacement record. Current authorizations/policy are checked for new mutations; querying an already-recorded approval is historical recovery, not renewed approval of revoked claims.

When a write succeeds but its response is lost, the browser must check saved status. It must not infer success from a timeout. A checked review confirmation is still required for every approval request. A synchronous UI lock blocks repeated clicks while a request is pending, with immediate live status. New requests remain blocked after an uncertain response until recovery.

Only the random capability token is stored in browser sessionStorage, for same-tab reload recovery. Anyone possessing it can access that campaign; there is no authenticated reviewer identity. Do not share tokens. This is a demo session store, not a permanent audit archive. After one hour, closing/clearing the tab, or provider data loss, approval may no longer be recoverable. The interface explicitly warns that starting a separate campaign does not cancel or resolve unknown previous approval. Nothing automatically publishes.

The original incident's approval cannot be reconstructed from these changes: the previous in-memory record may already be lost. Selecting B never selects A in the existing approval path, but the actual outcome of the user's earlier request remains unknown.

## Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

Regression tests use disposable synthetic approvals, shared in-memory adapters and mocked Redis REST transport. They cover instance replacement, all three cycles, concurrent conflicting and identical approvals, lost responses, failed writes, revocation and status recovery. Browser checks use local synthetic fixtures. These are not live Redis/Vercel/Safari verification or Michelle's approval of generated drafts. Real provider connectivity and EVAL support remain to be tested after explicit configuration authorization.

The retained optional browser regression harness is `tests/content-agent-grantready-browser.mjs`. It refuses non-localhost targets and requires the synthetic-fixture banner before generating drafts. With a separately installed Playwright tool and Chromium, start the local app using a **disposable synthetic** `GRANTREADY_DATA_DIR`, then run:

```sh
CONTENT_AGENT_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
GRANTREADY_BROWSER_BASE_URL=http://127.0.0.1:3245 \
node --test tests/content-agent-grantready-browser.mjs
```

The harness currently uses `/usr/bin/chromium`. `GRANTREADY_BROWSER_ARTIFACT_DIR` optionally selects an existing output directory for desktop/mobile screenshots. It is separate from `npm test` and GitHub CI; it adds no application dependency. The verified local run passed four browser tests, including desktop/mobile, duplicate clicks, dropped responses and missing sessions.
