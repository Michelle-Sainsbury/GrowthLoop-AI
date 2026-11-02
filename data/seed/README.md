# GL-02 GrantReady authorized demonstration package

Michelle Sainsbury approved the GrantReady product brief, ICP, content policy, and claims GR-P01/GR-P02 on **November 2, 2026** for a hypothetical marketing demonstration. The actual files pass the protected campaign's authorization gates. GrantReady is a service concept, not an operating grant discovery, eligibility, submission, or award service.

**These approvals do not approve generated LinkedIn drafts or the evaluation samples.** Every generated draft still requires a separate explicit human decision. Nothing is automatically published.

## Files and recorded authorization

- `brief.json`: approved campaign positioning, message, tone, scope, and disclosure.
- `icp.json`: approved NYC nonprofit leadership audience and communication context, not surveyed customer findings.
- `banned_phrases.json`: approved Content-only prohibited-language policy.
- `claims.json`: GR-P01 and GR-P02 are `approved_demo_claim`, with `reviewer: Michelle Sainsbury`, `reviewed_at: 2026-11-02`, and `demo_only: true`. Rejected rows remain rejected; their original metadata is preserved.
- `../examples/grantready_content_examples.json`: four compliant and four noncompliant pre-authored evaluation samples. These remain evaluation-only; their pending review marker is not a campaign generation gate or publication authorization.

The three approved documents separately record `authorization_state: approved_for_demo`, `reviewer: Michelle Sainsbury`, and `reviewed_at: 2026-11-02`. Claim provenance records Codex's derivation from the GL-02 request submitted in this session, not original authorship or operating-product evidence. Approval metadata is separate from that provenance.

## Format and integration boundary

The original Content Agent test branch had no JSON seed schema. The added `gl02-proposal-1.0` authoring schema supports the current authorized data plus pending/revoked states for fail-closed validation and review tests. This schema version identifies a format, not a pending approval state. Nullable metadata remains intentional for policy-rejected examples without fabricated human review events.

This is a Content-only package. Do not feed it into a later shared database seeder as though compatibility were verified. No shared controller, Analytics, database, or Content Studio integration is claimed.

`lib/content-agent/grantready-campaign.ts` validates the package with Zod. `generateGrantReadyDrafts(brief, icp, registry, policy, variable)` offers the five-variable controlled A/B adapter. Approved-demo/verified statuses map to runtime approved only when the registry is authorized; pending/revoked/rejected stay unusable, and unknown statuses fail. `approveGrantReadyDraft` rechecks current claims, policy, and explicit human approval.

## Protected three-cycle entry point

Start Next.js and open `/grantready`. The original Week 1 dashboard at `/` is preserved. The new entry point loads campaign files on the server and never accepts client-submitted approval markers, registries, or draft bodies.

The protected workflow uses the original framing/revision engine:

1. Initial A/B generation (Cycle 1).
2. First human-guided revision (Cycle 2).
3. Second revision (Cycle 3).
4. Separate explicit human approval, which stops the loop.

Generation, revisions and new approvals reload authorization, claims, and policy, validate the output history, and check the original campaign snapshot. Changed inputs require a new campaign and fresh review. Pending, revoked, rejected, missing, or unauthorized claims block advancement and approval. Unsupported/prohibited feedback, stale actions, fourth cycles, and conflicting post-approval actions fail without changing session state. Identical approval retries recover the existing decision without recording another approval.

The three-cycle framing workflow is distinct from the five-variable controlled experiment adapter. Existing core generator/revision/approval functions and legacy dashboard behavior remain unchanged; direct legacy calls do not automatically acquire the new checks.

## Policy limits and human oversight

The protected workflow applies the policy's case-insensitive patterns to initial output, revisions, feedback, and final approval. This is actual bounded enforcement, not universal semantic fact-checking. It can miss paraphrases, cannot establish evidence truth, and can conservatively flag quoted or negated language. The numerical rules flag matching dollar amounts and percentages rather than deciding whether they are fabricated. Human review remains necessary.

A policy-compliant evaluation sample is not a publication-approved draft. Noncompliant examples deliberately contain false claims and must never become generation inputs.

## Session and environment limits

Production requires Content-only shared Redis REST storage, configured through server-only environment variables. Sessions and approval receipts expire one hour after creation; they survive application restarts and instance changes while retained by the configured service. Development defaults to process memory and does not provide that durability. This storage is separate from Shawn's Experiment Memory. The random session token is a bearer capability; the human checkbox does not authenticate a person's identity. See [session storage configuration and limitations](session-storage.md).

Approval is atomic: one selected variation wins, repeated requests for the same decision return the saved result, and conflicting decisions fail. A lost response is treated as uncertain until saved status is checked. Recovery is available in the same browser tab after reload; clearing tab storage or expiry prevents recovery. Recovery reads existing decisions and does not approve drafts again.

`GRANTREADY_DATA_DIR` is trusted server-only configuration for isolated fixture directories, never a request parameter. Any override displays a synthetic-fixture banner. Do not use synthetic authorizations for a real campaign. Normal use reads these actual authorized files.

Geist and Geist Mono are bundled locally; the build needs no Google Fonts request. Existing CSS variables/classes and the original dashboard markup are preserved. Content generation is deterministic TypeScript; no model/API is called.

## Testing evidence for this PR

**Local automated verification:** `npm test` passed **104 tests, 0 failed, 0 skipped**. This includes the original Content tests, seed/authorization validation, all five controlled variables, protected three-cycle revisions, claim withdrawal/revocation, prohibited language, failed-action state preservation, concurrency/stale actions, and explicit approval requirements. Local TypeScript, lint, and production build also passed. The final pre-PR rerun confirmed these results; its logs are retained in the local evidence bundle.

**Current approval-reliability browser checks:** four synthetic local Chromium tests passed (desktop/mobile, repeated clicks, dropped approval response and missing-session recovery). One additional local production-build browser test passed: missing shared-storage configuration blocks generation, and both `/grantready` and the original `/` route load. No real deployed draft was approved.

**Previously executed local browser checks:** two production-build Chromium walkthroughs used the actual authorized campaign at desktop (1280 px) and mobile (390 px). Both passed generation and two revisions, retained both exact claims, and left drafts unapproved with approval buttons disabled until an explicit human decision. Separate earlier checks exercised the original dashboard and synthetic revocation/approval cases. No deployed Safari or Vercel result is implied.

**Approval tests:** positive approval-path tests use disposable in-memory test sessions and explicitly simulated decisions; they do not record Michelle's approval of LinkedIn drafts or modify seed files. Other tests use real authorized campaign inputs or clearly identified synthetic fixtures as appropriate.

**GitHub CI:** configured, **not yet verified for these uncommitted changes**. The Content Agent workflow now covers branch pushes and scoped PRs targeting `feature/content-agent`, running installation, automated tests, TypeScript, lint, build, and patch whitespace checks. It does not run the external browser harness. Do not describe local results as green GitHub checks.

Commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. Runtime metadata markers are data gates, not cryptographic proof of approval. No deployment or automatic publication is part of this package.
