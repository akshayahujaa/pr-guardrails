# Using Jira instead of ClickUp

The scope check ships with ClickUp as the default issue tracker, but it also
supports **Jira (Atlassian Cloud)** out of the box. Switch by changing a few
environment variables in `.github/workflows/pr-scope-check.yml` — no code
changes needed.

## 1. Create a Jira API token

1. Go to <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. **Create API token**, give it a label, copy the value.

## 2. Add secrets / variables in GitHub

In your repo → **Settings → Secrets and variables → Actions**:

| Name | Type | Value |
|------|------|-------|
| `JIRA_API_TOKEN` | Secret | the API token from step 1 |
| `JIRA_BASE_URL` | Variable | `https://your-org.atlassian.net` |
| `JIRA_EMAIL` | Variable | the Atlassian account email that owns the token |

(`JIRA_BASE_URL` and `JIRA_EMAIL` aren't secret, so they can be Actions
**variables**; the token must be a **secret**.)

## 3. Flip the workflow to Jira

In `.github/workflows/pr-scope-check.yml`, set the provider and pass the Jira
env, and comment out the ClickUp line:

```yaml
          # ---- issue tracker ----
          ISSUE_PROVIDER: jira

          # ClickUp (unused now)
          # CLICKUP_TOKEN: ${{ secrets.CLICKUP_TOKEN }}

          # Jira
          JIRA_BASE_URL: ${{ vars.JIRA_BASE_URL }}
          JIRA_EMAIL: ${{ vars.JIRA_EMAIL }}
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
```

## 4. How Jira issues are detected on a PR

The check looks for a Jira **issue key** (`PROJ-123` style) in this order:

1. A Jira browse link in the PR body — `https://your-org.atlassian.net/browse/PROJ-123`
2. A bare issue key anywhere in the **title** or **body** — e.g. `[PROJ-123] Add login`
3. An issue key in the **branch name** — e.g. `feature/PROJ-123-add-login`

Recommended team convention (mirrors the ClickUp one):

```
feature/PROJ-123-short-description
```

The check then calls the Jira REST API (`/rest/api/3/issue/PROJ-123`), reads the
issue **summary** and **description** (Atlassian Document Format is flattened to
text automatically), and uses them as the scope definition.

## Notes

- The account behind `JIRA_EMAIL` / `JIRA_API_TOKEN` must have **browse
  permission** on the projects whose issues you link, or the API returns 404/403
  and the check blocks (by design, unless `FAIL_OPEN_ON_ERROR=true`).
- Jira Server / Data Center (self-hosted) uses a slightly different auth model
  (personal access tokens, `/rest/api/2/`). This suite targets **Jira Cloud**;
  for Server, adjust `getJiraTask()` in `.github/scripts/scope-check.mjs`.
