---
name: tradeetf-pre-push-check
description: Run tradeETF pre-push quality checks before pushing, committing final work, or validating repository changes. Use when the user asks to push code, prepare a push, verify changes before publishing, run quality gates, run tests/build, or start the local app to ensure it does not crash before code leaves the machine.
---

# tradeETF Pre-Push Check

Use this skill before pushing tradeETF changes or when the user asks for a final local quality pass.

## Workflow

1. Read the repository `AGENTS.md` first if it exists.
2. Inspect `git status --short` to understand pending changes.
3. Run the bundled script from the repository root:

```bash
.codex/skills/tradeetf-pre-push-check/scripts/pre-push-check.sh
```

4. If the user explicitly wants a browser window opened, rerun or run with:

```bash
PRE_PUSH_OPEN_BROWSER=1 PRE_PUSH_KEEP_PREVIEW=1 .codex/skills/tradeetf-pre-push-check/scripts/pre-push-check.sh
```

On WSL, the script tries to open Google Chrome first, then falls back to other available browser openers.

5. Report the outcome clearly:

- Node version used.
- Whether `npm run validate` passed.
- Whether the local production preview responded.
- The local URL checked.
- The screenshot proof rendered visibly in the chat. Do not report only the filesystem path.
- Any failure message and the next concrete fix.

## Behavior

The script loads `nvm` when available and tries to use Node 22, matching this repository's GitHub Actions workflow. It installs dependencies with `npm ci` only when `node_modules` is missing.

It then runs `npm run validate`, which should cover unit tests and the production build for this repository.

After validation, it starts `npm run preview` on localhost, waits until Vite exposes a local URL, requests that URL with `curl`, captures a mobile-size screenshot proof, optionally opens it in the desktop browser, then shuts the preview server down by default. This is a smoke test, not a full visual or interaction test.

Screenshot proof is attempted systematically. On WSL with Chrome installed, the screenshot is written under:

```text
/mnt/c/Temp/tradeetf-pre-push-screens/
```

If no compatible headless browser is available, the script warns and continues. Set `PRE_PUSH_REQUIRE_SCREENSHOT=1` to make screenshot capture mandatory.

When the script prints `Screenshot proof: <path>`, treat that path as an internal artifact handle. Load that image with the available local image viewing/rendering tool and show the image in the chat response. Mention the path only as secondary detail when useful, or when image rendering is unavailable.

When the user wants to inspect the app manually, set `PRE_PUSH_KEEP_PREVIEW=1`. In that mode, the script keeps the preview server running until the user presses `Ctrl+C`.

## Push Discipline

Do not push if the script fails. Fix the failure, rerun the check, then push only after the user has asked for a push or confirmed that pushing is desired.

If the browser cannot be opened automatically from WSL, do not treat that alone as a code failure when the HTTP preview check passed. Give the URL to the user and say that automatic browser opening was unavailable.
