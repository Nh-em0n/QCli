# QCli — Updates / Change Log

This file lists the changes made to QCli in this work session (24 Nov 2026). The
complete command reference and user guide live in [guide.md](../guide.md); the
root [README.md](../README.md) is now a short project summary.

Changes are grouped by feature. Files touched: `app.js`, `style.css`, `README.md`
(now `guide.md`), plus the new `docs/updates.md`, `guide.md` and the rewritten
`README.md`.

---

## 1. Light themes and theme-driven outlines

Already committed as `04d2501 add light theme`.

- Added six light themes: `github-light` (now the **default**), `light`,
  `one-light`, `gruvbox-light`, `nord-light` and `ayu-light`.
- Tagged every light theme with `light: true` and improved the contrast of
  `github-light` (darker `fg`, `muted`, `muted-2` and ANSI white/gray).
- `applyPrefs()` now sets the CSS `color-scheme` to `light` or `dark`, so native
  form controls, scrollbars and dialogs follow the active theme.
- Added an `outlineColor` preference (`#rrggbb` or `auto`, defaulting to the
  theme accent), a matching colour picker in the preferences dialog, and a
  `--outline` CSS variable.
- All focusable controls now get a consistent `2px solid var(--outline)` focus
  ring; the preferences card uses a `2px` outline as well.
- `caretColor` also accepts `auto` / `theme` / `default`.
- Striped upload rows use `color-mix(in srgb, var(--fg) 3%, transparent)` so
  they work on both light and dark backgrounds.

## 2. Guest access (no token required)

- Pressing **Enter** at the token prompt starts a read-only guest session.
  Guest credentials are validated with `GET /users/<username>` (no
  `Authorization` header) instead of `GET /user`.
- Added `GUEST_READ_COMMANDS` and `GUEST_READ_REPO_SUBS` allowlists. Read-only
  commands (`repos`, `select`, `cd`, `ls`, `cat`, `show`, `find`, `grep`,
  `download`, `rate`, read-only `repo …` subcommands, …) work; writes and
  token-only commands are blocked with an explanatory message.
- In guest mode `repos` calls `/users/<name>/repos` (`--all` adds `type=all`)
  instead of `/user/repos`.
- Guest validation failures are non-fatal: a GitHub 403 (60 req/hour limit) or
  an offline browser warns but still starts the command loop.
- Guest mode can be started from config: `#octocat`, `?user=octocat` or
  `window.__QCLI_USER__` without a token. The status bar shows
  `mode: guest (read-only)`.

## 3. Re-authentication and startup recovery

- `exit`, `quit` and the new `logout` alias discard the token, username, user
  object, active repo and URL hash, then prompt for username/token again.
- Sign-in retries in-place until it succeeds or Ctrl+X aborts; a bad token is
  cleared so the next attempt asks for a fresh one, and the last username is
  prefilled.
- Startup failures and a stale prompt no longer leave a dead terminal: Enter
  resumes the loop or restarts authentication instead of being swallowed.
- Ctrl+X still aborts pending questions, queued commands and running commands.

## 4. Current repository in the prompt

- The prompt now shows the active repository, e.g. `gh:/octocat/Hello-World$`,
  including subfolders (`gh:/octocat/Hello-World/src$`).
- `restorePrompt()` runs after every command in the loop, so `select`, `cd`
  and `branch` immediately refresh the displayed location.

## 5. Numbered `find` references

- `find` prints an `f1`, `f2`, … index beside every match.
- `resolvePath()` resolves `f<N>` anywhere a path is accepted (`show`, `cat`,
  `info`, `download`, …), but tries a real file name first so an actual file
  called `f3` still wins.
- A single-result hint now says `show f1`.

## 6. Numbered `repos` references

- `repos` adds a `#` column and stores the last listing in `_lastRepos`.
- `select 3` opens the third repo from the most recent `repos` output; the
  indexes refresh each time `repos` runs.

## 7. Rate limit table

- Swapped the `USED` and `REMAINING` columns so `USED` comes first.

## 8. Readable file sizes

- Added `fmtSize()` and used it in `download` confirmations and binary commit
  entries: bytes below 1 KB, then `KB` / `MB` (e.g. `2638669` → `2.52 MB`).

## 9. Syntax-highlighted, numbered text previews

- Added a dependency-free highlighter to `app.js`: `codeLanguage()` (extension
  → language), `codeRules()` (token regexes) and `highlightCode()` (HTML-safe
  per-line markup) covering JavaScript/TypeScript, Python, HTML/XML, CSS,
  JSON/YAML, SQL, Markdown, shell, C/C++/Java/Go/Rust, diff, GraphQL, PHP/Ruby/
  Perl, Dockerfile/Make and more.
- `show` now renders text files in a `.code-view` with a line-number gutter and
  theme-coloured `.tok-*` tokens; unknown/plain text still gets line numbers.
- Added a **Copy** button in the preview header. It copies the original file
  text via `navigator.clipboard` with an `execCommand('copy')` fallback for
  `file://`, then briefly shows “Copied!”.
- The preview is full terminal width, at least **150px** tall, wraps long lines
  to the window (`pre-wrap` + `overflow-wrap: anywhere`) with no horizontal
  scrolling, and uses a minimum 14px font. `cat` remains raw output.
- Added matching `.code-view`, `.code-ln`, `.code-src`, `.tok-*` and `.code-copy`
  styles in `style.css`.

## 10. Wrapping editor

- The editor textarea now uses soft wrapping (`wrap="soft"`, `pre-wrap`,
  `overflow-wrap: anywhere`) with horizontal scrolling disabled.
- A hidden measuring twin (`editorWrappedRows()`) lets the line-number gutter
  reserve the right height for each wrapped line.
- `editorFollowCaret()` keeps the view at the bottom while typing past the last
  visible row; Tab insertion preserves the scroll offset.
- On screens **1200px+** the editor panel is `50vw` wide (up to 720px tall).
  The status line now reports column correctly for wrapped lines.

## 11. Interactive pager for `find`

- `find` now shares the `log` pager: it shows **10 matches first**, Space
  appends the next 10, and `q` or **Ctrl+X** closes the pager footer
  (breadcrumb) and returns focus to the command line.
- The footer reads `[space] next 10 · [q / ^X] back to command · N/M matches`.
- `closePager()` removes the footer and focuses the prompt unless a modal owns
  focus; Ctrl+X used only to dismiss a pager no longer prints `^X cancelled`.
- Documentation for the pager was updated in the guide.

## 12. Documentation restructure (this change)

- Copied the full command reference into **`guide.md`**.
- Rewrote **`README.md`** as a short project summary with a quick start and
  links to the guide and this change log.
- Created **`docs/updates.md`** (this file).

---

## Verification

- Browser checks with stubbed GitHub responses: guest auth and rate-limit
  handling, re-auth flow, prompt after `select`/`cd`, `f<N>`/`#N` refs,
  `fmtSize`, code-view rendering and Copy button (including the clipboard
  fallback), wrapped editor gutter/caret behaviour, 50vw media rule, and the
  `find` pager (10 per page, Space, `q`, Ctrl+X).
- Highlighting a 3,000-line JavaScript file took roughly 59 ms in the browser.
- No console errors in the final checks, and `git diff --check` is clean.
