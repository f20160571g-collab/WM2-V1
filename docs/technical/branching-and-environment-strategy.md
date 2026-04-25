# WM2 Branching and Environment Strategy

Last updated: 2026-04-25  
Audience: Technical maintainers  
Owner: Technical Maintainers

This document defines how WM2 keeps the stable version running while architecture changes are developed in parallel.

## 1. Branch Topology

| Branch | Purpose | Deployment Target |
|---|---|---|
| `release/v1-stable` | Production-safe line, hotfix-only merges | Production frontend + production Apps Script + production Sheet |
| `main` | Integration branch for approved changes | Optional preview/integration deployment |
| `arch/next-gen` | Long-lived architecture redesign | Staging frontend + staging Apps Script + staging Sheet |
| `hotfix/*` | Temporary fixes branched from `release/v1-stable` | Preview only; merged back to stable after review |

## 2. Runtime Config Contract

Frontend runtime config is loaded from `runtime-config.js` before `app.js`.

Supported keys:

- `ENV_NAME` (for environment labeling/logging)
- `APPS_SCRIPT_URL` (active backend endpoint)

`app.js` uses `window.WM2_RUNTIME_CONFIG` when available and falls back to defaults.

## 3. Environment Mapping Sheet

### 3.1 Current Baseline Snapshot

This captures what is already known from repository state.

| Item | Value |
|---|---|
| Stable tag | `v1-stable-2026-04-25` |
| Stable branch | `release/v1-stable` |
| Redesign branch | `arch/next-gen` |
| Current production fallback endpoint in frontend | `https://script.google.com/macros/s/AKfycbwcuEVIltrQDeZK2J40wKjKkA8ms3r9gZHBX4UKEHTIfdxyvcbzAiEXiOH-rcCBhmfO/exec` |
| Runtime config entry point | `runtime-config.js` |

### 3.2 Deployment Mapping (Fill and Freeze)

Fill this table once and treat it as release-controlled configuration.

| Environment | Frontend URL | Branch Source | `ENV_NAME` | Apps Script Deployment URL | Spreadsheet ID | Owner |
|---|---|---|---|---|---|---|
| Production | TODO | `release/v1-stable` | `production` | TODO | TODO | TODO |
| Staging | TODO | `arch/next-gen` | `staging` | TODO | TODO | TODO |

### 3.3 Runtime Config Values To Apply

Production `runtime-config.js` values:

```javascript
window.WM2_RUNTIME_CONFIG = {
	ENV_NAME: 'production',
	APPS_SCRIPT_URL: 'PRODUCTION_APPS_SCRIPT_URL',
};
```

Staging `runtime-config.js` values:

```javascript
window.WM2_RUNTIME_CONFIG = {
	ENV_NAME: 'staging',
	APPS_SCRIPT_URL: 'STAGING_APPS_SCRIPT_URL',
};
```

## 4. Daily Working Rules

1. Production users stay on `release/v1-stable`.
2. Major architectural work happens only in `arch/next-gen`.
3. Hotfixes branch from stable and merge into stable first.
4. Every stable hotfix is cherry-picked into `arch/next-gen`.
5. Do not point staging frontend to production Apps Script.

## 5. Hotfix Procedure

1. Create hotfix branch from stable.
2. Implement and review.
3. Merge into `release/v1-stable`.
4. Deploy production.
5. Cherry-pick hotfix commit into `arch/next-gen`.

## 6. Cutover Procedure (When Redesign Is Ready)

1. Freeze feature work on `arch/next-gen`.
2. Execute full regression checklist and inbound checklist.
3. Merge `arch/next-gen` into `main` via PR.
4. Deploy to staging one final time.
5. Promote to production and tag release.

## 7. Rollback Procedure

1. Revert bad commit on `release/v1-stable`.
2. Redeploy previous known-good Apps Script version.
3. Confirm frontend points to known-good production `APPS_SCRIPT_URL`.

## 8. Branch and Tag Baseline Created

- Stable tag: `v1-stable-2026-04-25`
- Stable branch: `release/v1-stable`
- Redesign branch: `arch/next-gen`

## 9. One-Pass Rollout Checklist

Use this once to complete setup without ambiguity.

### Phase A: Protect Stable Line

1. Confirm `release/v1-stable` is protected (PR required, no force push).
2. Confirm `main` is protected.
3. Confirm tag `v1-stable-2026-04-25` exists in remote.

### Phase B: Wire Environment Endpoints

1. Set production `runtime-config.js` with production Apps Script URL.
2. Set staging `runtime-config.js` with staging Apps Script URL.
3. Confirm staging points to staging sheet, not production sheet.

### Phase C: Connect Hosting

1. Configure production frontend deployment from `release/v1-stable`.
2. Configure staging frontend deployment from `arch/next-gen`.
3. Record both frontend URLs in section 3.2.

### Phase D: Smoke Validate Separation

1. Open production URL, login, run one read operation.
2. Open staging URL, login, run one read operation.
3. Verify production and staging show different `APPS_SCRIPT_URL` values in runtime config source.
4. Perform one safe write in staging and verify no production data changed.

### Phase E: Operationalize

1. Hotfix flow: `hotfix/*` -> `release/v1-stable` -> deploy production.
2. Mirror hotfix into redesign using cherry-pick onto `arch/next-gen`.
3. Keep redesign-only work out of `release/v1-stable` until cutover.

### Signoff Record

- Setup owner:
- Date:
- Production URL:
- Staging URL:
- Production Apps Script deployment ID: 
- Staging Apps Script deployment ID: https://script.google.com/macros/s/AKfycbzpZ1nMVhutLkEIau8z4g5iNqI6nm-i-MGFnDzC8VY0ZQlWS6ZfcM2r-ixCDlLIq_TpZg/exec
- Production sheet ID:
- Staging sheet ID:1Giy1RtTbSY1RlQ8XWML9I3cP7UiqgiH9eb-LitVCbyE
- Result: Pass / Fail
