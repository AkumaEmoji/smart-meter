# Security

## Exposed Firebase service-account key

A Firebase Admin service-account JSON file was previously committed to this
repository. Removing the file from the latest checkout does **not** make that
key safe because it remains in Git history and may exist in clones, caches, or
GitHub archives.

The Firebase/Google Cloud project owner must complete these external actions:

1. In Google Cloud IAM & Admin, open **Service Accounts**, select the affected
   Firebase Admin service account, and revoke/delete the exposed key.
2. Create a replacement key only if local development genuinely needs one.
   Prefer workload identity or tightly scoped environment-managed credentials
   where available.
3. Replace the Firebase environment variables in Vercel and any meter host,
   then redeploy or restart them.
4. Verify that the old key can no longer access the project.

Do not postpone revocation until after history cleanup. Key rotation is the
step that removes the immediate access risk.

## Git-history cleanup

History rewriting affects every clone and any open branch or pull request, so
coordinate it with all collaborators before proceeding. After taking a backup
and installing `git-filter-repo`, a repository owner can remove the old file
from all history with a command of this form:

```text
git filter-repo --path smart-meter-project-497ac-firebase-adminsdk-fbsvc-98a2a903d2.json --invert-paths
```

Then review the rewritten repository, force-push the affected branches and
tags, and have collaborators make fresh clones. GitHub Support may need to
purge cached views for a public exposure. Even after cleanup, the old key must
remain revoked permanently.

## Runtime secrets

- Never commit service-account JSON, private keys, `.env` files, or ingestion
  tokens.
- Keep `SMART_METER_INGEST_TOKEN` different from Firebase credentials and use a
  long random value.
- Configure the token in both Vercel and the one authorised ingestion client.
- Rotate the token if it appears in logs, screenshots, source control, or a
  shared command transcript.
- `GET /api/data` is intentionally public for the current university demo.
  `POST /api/data` fails closed when its token is missing and accepts only a
  valid Bearer token.

Report suspected credential exposure privately to the repository owner rather
than opening a public issue containing the secret.

## Dependency audit status

On 2026-07-14, non-breaking npm security updates and a deliberate migration to
Firebase Admin SDK 14 reduced the production audit from 21 findings to 11. The
remaining report contains 9 moderate and 2 critical findings:

- The critical findings come from the deprecated `request`/`form-data` chain
  pulled in by `smartmeter-obis`. npm reports no fix for that package chain.
- The remaining Google-client UUID findings have no safe current audit action;
  npm's forced suggestion would downgrade Firebase Admin across major versions.

Do not run `npm audit fix --force` for this project. Keep the physical meter
reader on a trusted local host with no inbound network exposure, and replace or
isolate the legacy `smartmeter-obis` dependency when Phase 2 introduces captured
SML fixtures. Re-run the audit whenever the lock file changes.
