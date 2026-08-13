# PR Guardrails

Drop-in GitHub Actions that make every pull request **traceable and reviewed**:

1. **PR Scope Check** — finds the issue-tracker ticket linked to a PR (ClickUp or
   Jira), reads its title + description, and uses an AI model to decide whether
   the PR's changes stay **within the ticket's scope**. Out-of-scope PRs are
   blocked with a sticky comment explaining why.
2. **PR Agent Review** — runs [qodo-ai/pr-agent](https://github.com/qodo-ai/pr-agent)
   to auto-post a **2-line summary**, a **detailed review** with recommendations,
   and **inline code suggestions**. A companion **security gate** fails the check
   when the review flags a security concern.
3. **CI** — a minimal build/test gate (`npm ci` → build → test).

All AI runs through **[OpenRouter](https://openrouter.ai)** (default model
`qwen/qwen3-coder`), so both features share one API key.

> This suite is **provider-agnostic** for issue tracking: **ClickUp** is the
> default; **Jira** is fully supported via one env change — see
> [docs/jira-setup.md](docs/jira-setup.md).

---

## What's in here

```
.github/
  workflows/
    pr-scope-check.yml   # ticket-scope gate (ClickUp/Jira + AI)
    pr-agent.yml         # AI reviewer + security gate
    ci.yml               # build/test gate
  scripts/
    scope-check.mjs      # the scope-check logic (Node 18+, no dependencies)
docs/
    jira-setup.md        # switch the scope check to Jira
```

---

## Quick start (integrating into your repo)

### 1. Copy the files

Copy the `.github/` folder from this repo into the root of your repo. That's it —
the workflows and the script live entirely under `.github/`.

```bash
# from your repo root
cp -R /path/to/pr-automation-suite/.github .
git add .github && git commit -m "ci: add PR automation suite"
```

### 2. Add the required secrets

In your repo → **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Needed for | Where to get it |
|--------|-----------|-----------------|
| `OPENROUTER_API_KEY` | scope check **and** PR-Agent | <https://openrouter.ai/settings/keys> |
| `CLICKUP_TOKEN` | scope check (ClickUp mode) | ClickUp → avatar → **Settings → Apps → API Token** (`pk_…`) |

`GITHUB_TOKEN` is provided automatically by Actions — you don't create it.

Using **Jira** instead of ClickUp? Skip `CLICKUP_TOKEN` and follow
[docs/jira-setup.md](docs/jira-setup.md) (`JIRA_API_TOKEN` + two variables).

### 3. Set your environment branches

Every workflow triggers on PRs that **target** certain branches. The defaults
are `dev, test, prod` (an environment-branch model). Edit the `branches:` list
in each workflow to match your repo:

```yaml
on:
  pull_request:
    branches: [dev, test, prod]   # ← change to [main] for a single-branch repo
```

Files to edit: `pr-scope-check.yml`, `ci.yml`. (`pr-agent.yml` runs on all PRs by
design — see below.)

### 4. Adopt the branch naming convention

The scope check finds the ticket id from the PR **link**, **title marker**, or
**branch name**. The most reliable, zero-friction option is to put the id in the
branch name:

- **ClickUp:** `feature/86d3bzhgq-add-login` (id from the task URL `app.clickup.com/t/<id>`)
- **Jira:** `feature/PROJ-123-add-login`

Then open the PR normally — the check finds the ticket automatically. You can
also paste the ticket link in the PR description or put `[<id>]` in the title.

> **Write a real description on the ticket.** The scope check sends the
> ticket's title + description (not the PR diff alone) to the AI to decide
> what's "in scope." A ClickUp task or Jira issue with just a title and no
> description gives the AI nothing to compare the PR against, so it can't
> reliably judge scope — add a few sentences on what should change and why.

### 5. (Recommended) Make the checks required

Settings → **Branches → Branch protection rules** → require the status checks
(`scope-check`, `review` / `security gate`, `build`) to pass before merging. The
checks post ✅/🚫 either way, but this turns them into hard merge gates.

---

## How each piece works

### PR Scope Check (`pr-scope-check.yml` + `scope-check.mjs`)

On a PR to a configured branch it:

1. Extracts the ticket id (priority: tracker link → `[id]`/`#id` marker → branch
   name → optional `ISSUE_ID_REGEX` override).
2. Fetches the ticket's title + description from ClickUp or Jira.
3. Sends the ticket + the PR's changed files + a (truncated) diff to the AI with
   a strict JSON contract.
4. Posts a single sticky comment: ✅ in scope, or 🚫 with the out-of-scope files
   and the reason. Exit code gates the check.
5. On an `out_of_scope` verdict, **closes the PR automatically** (configurable via
   `AUTO_CLOSE_OUT_OF_SCOPE`) — the author fixes the ticket/scope and opens a new
   PR. A missing ticket or a check error only blocks the merge; they don't close
   the PR, since those are often fixable without abandoning the branch.

**Key env vars** (set in the workflow, not secrets):

| Var | Default | Meaning |
|-----|---------|---------|
| `AI_PROVIDER` | `openrouter` | `openrouter` \| `gemini` \| `github-models` |
| `AI_MODEL` | `qwen/qwen3-coder` | model id for the provider |
| `ISSUE_PROVIDER` | `clickup` | `clickup` \| `jira` |
| `REQUIRE_TASK` | `true` | block if no ticket is linked |
| `FAIL_OPEN_ON_ERROR` | `false` | on API/AI error: block (`false`) or pass (`true`) |
| `MAX_DIFF_CHARS` | `60000` | cap the diff sent to the model |
| `AUTO_CLOSE_OUT_OF_SCOPE` | `true` | close the PR automatically on an `out_of_scope` verdict |

> **Note:** the AI's `confidence` value is shown in the comment for humans — it
> does **not** affect pass/fail. Only the `verdict` (`in_scope`/`out_of_scope`),
> a missing ticket (when `REQUIRE_TASK=true`), or an error (when
> `FAIL_OPEN_ON_ERROR=false`) can fail the check.

### PR Agent Review (`pr-agent.yml`)

- Runs on every PR (open/reopen/ready) and on `/review`, `/describe`, `/improve`
  comments. Not restricted by target branch, so it reviews PRs everywhere.
- Uses OpenRouter Qwen. Auto-posts summary + review + inline suggestions.
- Preserves the author's original PR description (so the ticket link the scope
  check relies on survives) and never rewrites the PR title.
- **Security gate:** PR-Agent labels the PR when it finds a security concern; the
  `security_gate` job reads that label and **fails the check** with a "fix
  security first" comment pointing to PR-Agent's review.

### CI (`ci.yml`)

`npm ci --legacy-peer-deps` → `npm run build --if-present` → `npm test --if-present`.
Drop `--legacy-peer-deps` if your project doesn't need it; the `--if-present`
flags make build/test no-ops if those scripts don't exist.

### ClickUp task sync (`clickup-sync.yml`)

Closes the loop between a merge and the ticket that motivated it. The branch
name **is** the link:

```
feature/CU-<task-id>/<description>     e.g. feature/CU-86d4150hr/document-clickup-sync
```

When a pull request from such a branch is **merged into `dev`**, the workflow
reads the task id out of the head branch, looks the task up with
`CLICKUP_TOKEN`, and — only if the task is still in a to-do status (`to do`,
`todo`, `open`, `backlog`, `pending`) — moves it to **in progress**. A task
already in progress, in review, or done is left untouched, so a later merge
can never drag a ticket backwards. A closed-but-unmerged PR changes nothing.

The same `CU-<task-id>` convention is what the scope check uses to find the
ticket, so one branch name drives both gates. A `workflow_dispatch` trigger
accepts a branch name as input for testing the wiring without merging
anything.

---

## Costs

- **PR-Agent** and **scope-check.mjs** are free/open-source; you pay only for
  **OpenRouter** tokens (`qwen/qwen3-coder` is a fraction of a cent per PR).
- **ClickUp** API tokens are free on all plans; **Jira Cloud** API tokens are
  free.
- Runs consume your repo's normal GitHub Actions minutes.

---

## Swapping providers at a glance

| Want to… | Change |
|----------|--------|
| Use Jira | `ISSUE_PROVIDER: jira` + Jira secrets — see [docs/jira-setup.md](docs/jira-setup.md) |
| Use a different AI model | `AI_MODEL: <openrouter-model-id>` in `pr-scope-check.yml` and `CONFIG__MODEL` in `pr-agent.yml` |
| Use Gemini for the scope check | `AI_PROVIDER: gemini` + `GEMINI_API_KEY` secret |
| Let PRs through when the check errors | `FAIL_OPEN_ON_ERROR: 'true'` |
| Not require a ticket | `REQUIRE_TASK: 'false'` |
| Keep out-of-scope PRs open instead of auto-closing | `AUTO_CLOSE_OUT_OF_SCOPE: 'false'` |

---

## Troubleshooting

- **"No ticket linked" on every PR** — your branch/title/description doesn't
  contain a detectable id. Adopt the branch convention (step 4) or set
  `ISSUE_ID_REGEX`.
- **ClickUp/Jira 401/403** — bad or unauthorised token; for Jira, the account
  needs browse permission on the project.
- **Scope check "couldn't complete"** — the AI call errored; check the workflow
  log. With `FAIL_OPEN_ON_ERROR=false` this blocks by design.
- **PR-Agent didn't post** — confirm `OPENROUTER_API_KEY` is set and the event
  wasn't bot-authored.
- **Security gate didn't fire** — check the `security gate` job log line
  `PR labels: …` to see the exact label PR-Agent applied; adjust the `grep` in
  `pr-agent.yml` if the wording differs in your PR-Agent version.

---

## License

MIT — see [LICENSE](LICENSE).
