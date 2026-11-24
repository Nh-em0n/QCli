# QCli (Browser Terminal) — User Guide

QCli is a browser-based terminal that talks to the GitHub REST API v3
(with a GraphQL v4 passthrough). It gives you a bash-like virtual filesystem
for a repository, so you can browse, read, write, copy, move and delete files
directly through GitHub's API — each mutation becomes a real GitHub commit.

> **Files in this project**
>
> | File | Purpose |
> |---|---|
> | `index.html` | Page entry point; loads `style.css`, then `repo.js`, then `app.js` |
> | `style.css` | Terminal, theme and preferences-modal styling |
> | `repo.js` | Plain script: `GitHubRepo` class — all GitHub API, repository state and commit logic |
> | `app.js` | Plain script: `QCli` class — terminal UI, input, preferences and all commands |
> | `github-cli-improved.html` | Original single-file version (kept for reference) |

---

## Contents

1. [Requirements and startup](#1-requirements-and-startup)
2. [Authentication](#2-authentication)
3. [Initializing / selecting a repository](#3-initializing--selecting-a-repository)
4. [Terminal basics](#4-terminal-basics)
5. [Command reference](#5-command-reference)
   - [Help and session](#help-and-session)
   - [Preferences / appearance](#preferences--appearance)
   - [Repositories and branches](#repositories-and-branches)
   - [Navigation and filesystem](#navigation-and-filesystem)
   - [Auto-list after cd](#auto-list-after-cd)
   - [File details and listing cache](#file-details-and-listing-cache)
   - [Inline file preview](#inline-file-preview)
   - [Downloading files](#downloading-files)
   - [Uploading files and folders](#uploading-local-files)
   - [The editor](#the-editor)
   - [Committing changes](#committing-changes)
   - [Issues and pull requests](#issues-and-pull-requests)
   - [GitHub Actions](#github-actions)
   - [Gists](#gists)
   - [Users and social](#users-and-social)
   - [Organizations and teams](#organizations-and-teams)
   - [Notifications and search](#notifications-and-search)
   - [Releases, webhooks, keys, secrets, Pages, traffic, rate limit](#releases-webhooks-keys-secrets-pages-traffic-rate-limit)
   - [GraphQL](#graphql)
6. [Aliases](#6-aliases)
7. [Tips, limitations and troubleshooting](#7-tips-limitations-and-troubleshooting)

---

## 1. Requirements and startup

* A modern browser with `fetch`, `TextEncoder` and `localStorage` support.
* A GitHub Personal Access Token (PAT).
* No build step, no npm install, and no local server required.

Just keep `index.html`, `style.css`, `repo.js` and `app.js` together in the same
folder and **double-click `index.html`** (or drag it into a browser tab). It runs
directly from `file://`.

Optionally, you can serve the folder if you prefer an HTTP URL:

```bash
cd "path/to/QCli"
python3 -m http.server 8765
```

then open `http://127.0.0.1:8765/index.html`. Both ways behave identically.

---

## 2. Authentication

On startup QCli looks for credentials in the URL first, then in page globals,
then asks you interactively.

### Option A — URL (fastest)

Append `username@token` after `#` in the address bar:

```
index.html#octocat@ghp_your_token_here
```

QCli prints `Using credentials from the URL.` and validates the token with `GET /user`.

You can also open straight into a repository and folder:

```
index.html#octocat@ghp_your_token_here/octocat/Hello-World/src/lib
```

The part after the token is the repository (`owner/repo`) followed by an optional
directory path. See [section 3](#3-initializing--selecting-a-repository) for details.

> For `file://` URLs the `#` fragment is not sent to any server, but it is still
> visible in the address bar and browser history. Use a short-lived token and avoid
> shared machines.

### Option B — interactive (default)

```text
GitHub username: octocat
Personal Access Token: ████████████████████
```

The token field hides input. Press <kbd>Ctrl+C</kbd> at a prompt to abort.

### Option C — pre-seed globals

Add an inline script **before** the `repo.js` / `app.js` script tags in `index.html`:

```html
<script>
  window.__QCLI_USER__  = 'octocat';
  window.__QCLI_TOKEN__ = 'ghp_your_token_here';
</script>
<script src="./repo.js"></script>
<script src="./app.js"></script>
```

QCli prints `Using window.__QCLI_USER__ / window.__QCLI_TOKEN__.` and validates
the token with `GET /user`. The older `__GH_USER__` / `__GH_TOKEN__` names are
still accepted.

### Token permissions (classic PAT)

| Task | Suggested scope |
|---|---|
| Read public/private repos, files, commits, branches | `repo` (or `public_repo` for public only) |
| Create/delete repositories | `repo`, plus `delete_repo` for deletion |
| Issues, pull requests, comments, labels | `repo` |
| Dispatch workflows, read workflow runs | `workflow` |
| Gists | `gist` |
| Notifications | `notifications` |
| Organizations / teams | `read:org` (or `admin:org` for changes) |
| Follow/unfollow, profile info | `user` / `read:user` |
| Webhooks, deploy keys | `admin:repo_hook` / `repo` |
| GraphQL | same scopes as the data you query |

For fine-grained tokens, grant the equivalent repository permissions
(Contents: read/write, Issues: read/write, Pull requests: read/write,
Actions: read/write, Metadata: read).

> The token is kept in memory only; reloading the page clears it.
> Preferences (theme, font, etc.) are saved in `localStorage`.

---

## 3. Initializing / selecting a repository

A "repository" is not cloned locally. The terminal keeps a **virtual working
directory** that maps to paths in a GitHub repository. Select one first:

```text
repos                         # list repositories you can access
repos --all                   # include collaborator/org repos, all visibility
select octocat/Hello-World    # select by owner/repo
select Hello-World            # select by name under your username
```

After selecting, the status bar at the top shows `user`, `repo`, `branch` and
`path`, and the prompt becomes:

```text
gh:octocat/Hello-World$
```

Useful follow-ups:

```text
branch                        # show the active branch (default branch on select)
branch develop                # switch branch (the ref must exist)
pwd                           # print the virtual path
ls / tree / lt                # inspect files
open                          # open the repository on github.com
open src/app.js               # open a file or folder view in a new tab
```

### Opening a repository / directory from the URL

Put the repository (`owner/repo`) and optional directory after the credentials
in the URL:

```
index.html#octocat@ghp_token/octocat/Hello-World
index.html#octocat@ghp_token/octocat/Hello-World/src/lib
```

The first two segments after the token are always the repository owner and name;
anything after them is treated as a directory and `cd`-ed into on startup. A
single name (for example `.../QDoc-Test`) is not treated as a repository — use
the full `owner/repo` form instead.

### The URL stays in sync (opt-in)

> **Off by default.** The URL contains your token, so this feature is disabled
> until you turn it on in **Preferences → Sync repo / folder to URL** (or run
> `prefs set syncUrl on`). Turning it off removes the token from the address bar.

When enabled, whenever you `select`, `cd`, switch `branch`, or delete the
current repo, QCli rewrites the address bar to match. For example, after:

```text
cd foldera
cd folderb
```

the URL becomes:

```
index.html#octocat@ghp_token/octocat/Hello-World/foldera/folderb
```

You can copy that URL, bookmark it, or reload the page — QCli will sign in,
select the repo and open the same folder again. `cd ..`, `cd ~` and `cd /` update
it too.

On startup QCli will:

1. authenticate with `octocat` / `ghp_token`,
2. select `octocat/Hello-World` on its default branch,
3. `cd` into `src/lib` when a path is supplied.

You can be explicit with query parameters instead:

```
index.html?user=octocat&token=ghp_token&repo=octocat/Hello-World&path=src/lib&branch=dev
```

If a path is supplied without a repository, QCli remembers it and applies it the
first time you run `select <repo>`.

### Creating / forking a repository

```text
repo create my-new-repo --private --description "My project"
select my-new-repo
repo fork octocat/Hello-World
```

Deleting requires the `delete_repo` scope and an explicit confirmation:

```text
repo delete my-old-repo
```

---

## 4. Terminal basics

### Chaining

```text
sleep 1 && pwd && ls          # stop if a command fails
cd src ; ls ; cat README.md   # always continue
```

`&&` skips the rest of the chain after a failure; `;` continues regardless.

### Fresh data (`-f`)

API responses are cached by the browser by default (`cache: 'store'`), so
repeated loads — listings, previews, history — are fast. Add `-f` (or
`--fresh` / `--refresh`) to **any** command to fetch fresh data just once:

```text
ls -f                 # bypass the directory cache and the browser cache
cat README.md -f      # re-fetch the file instead of using a cached response
log -f                # fresh commit history
```

`-f` sets `cache: 'no-store'` for every API call that command makes (including
paginated follow-ups) and is reset automatically afterward. For `ls` / `info`
it also refreshes QCli's own in-memory directory listing. Commits always read
their SHA lookups fresh, even without `-f`, to avoid stale-SHA conflicts.

### Output groups

Each command you enter — its echoed prompt line, busy indicator and all output —
is placed in its own spaced group, separated from the previous command's group.
A **tree-style gutter** runs down the left of each group with a branch node at
the command, so you can see at a glance which output belongs to which command:

* Green branch = the command succeeded.
* Red branch = the command failed.
* Neutral branch = still running.

Older groups are dimmed slightly so the current command stands out. Use `clear`
to start fresh.

### Links and selecting text

Any `http://` or `https://` URL printed in the output (including the
`download_url` shown after each upload) is automatically a clickable link.
Click it to open it in a **new browser tab**. Trailing sentence punctuation such
as `.` or `)` is not included in the link.

Output text is fully selectable — drag over it to select and copy. QCli will not
yank focus back to the command input while you have a selection.

### Quoting and redirection

* Single and double quotes group arguments; `\"` escapes inside double quotes.
* `>` writes a file, `>>` appends:

```text
echo "line one" > notes.txt
echo "line two" >> notes.txt
```

### Commits and the busy animation

While a command runs, a spinner with a live timer is shown. You can keep typing:
pressing <kbd>Enter</kbd> while busy **queues** the command (`queued → ...`).
<kbd>Ctrl+C</kbd> clears the queue or cancels the current prompt.

<kbd>Ctrl+X</kbd> **cancels the whole operation**, wherever you are in the
terminal: it closes any open prompt, discards queued commands and stops the
running command (including in-progress uploads and `sleep` chains). It prints
`^X cancelled`; unfinished files are not committed. Inside the editor or
preferences text fields, <kbd>Ctrl+X</kbd> still performs a normal Cut.

Mutating commands ask for a commit message. You can pre-fill it in two ways:

```text
commit -m "Fix typo"
cat README.md
```

```text
echo "hello" > hello.txt -m "Add hello file"
mkdir docs -m "Add docs folder"
```

### Keyboard shortcuts

| Key | Action |
|---|---|
| <kbd>Enter</kbd> | Run command / answer prompt / queue while busy |
| <kbd>Tab</kbd> | Complete command name or repository path (repeat to cycle; popup for multiple matches) |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Command history |
| <kbd>PageUp</kbd> / <kbd>PageDown</kbd> | Scroll output by a page |
| <kbd>Ctrl</kbd>+<kbd>Home</kbd> / <kbd>End</kbd> | Scroll to top / bottom |
| <kbd>Ctrl</kbd>+<kbd>L</kbd> | Clear the output area |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> | Cancel prompt, clear queued commands |
| <kbd>Escape</kbd> | Close suggestion popup / preferences modal |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | Open preferences |
| Click `path` in status bar | Copy current path to clipboard |
| `↓ latest` button | Jump to the newest output after scrolling up |

---

## 5. Command reference

Type `help` or `?` in the terminal to print the built-in list. Each command is
listed once; aliases are shown together in an `[aliases: …]` tag rather than as
repeated rows.

### Help and session

| Command | Description | Example |
|---|---|---|
| `help` / `?` | Show every command with usage and description | `help` |
| `clear` / `cls` | Clear the terminal output | `clear` |
| `history` | Show command history with numbers | `history` |
| `exit` / `quit` | Log out, discard the token and stop the command loop | `exit` |
| `sleep <sec>` | Wait (max 30s) while showing the live await timer | `sleep 1.5` |
| `demo` | Run a short chained demonstration | `demo` |

### Preferences / appearance

| Command | Description | Example |
|---|---|---|
| `prefs` / `pref` / `settings` | Open the preferences modal | `prefs` |
| `prefs list` | List themes, fonts and the current preference values | `prefs list` |
| `prefs set <key> <value>` | Change one preference | `prefs set theme dracula` |
| `prefs theme <id>` | Shortcut for changing theme | `prefs theme nord` |
| `prefs reset` | Restore defaults | `prefs reset` |
| `prefs export` | Print preferences as JSON | `prefs export` |
| `prefs import <json>` | Load preferences from JSON (quote the JSON) | `prefs import '{"theme":"nord","fontSize":14}'` |

Preference keys:

| Key | Values |
|---|---|
| `theme` | `catppuccin`, `github-dark`, `github-light`, `light`, `atom`, `dracula`, `nord` |
| `fontFamily` / `font` | `menlo`, `jetbrains`, `fira`, `source`, `courier`, `system`, or a custom CSS font stack |
| `fontSize` | `10`–`22` (px) |
| `lineHeight` | `1.1`–`2` |
| `uploadConcurrency` | `1`–`10`, files uploaded at a time (default `3`) |
| `caretColor` | `#rrggbb` |
| `wrap`, `animations`, `autoScroll`, `statusBar`, `banner`, `timestamps`, `hints`, `syncUrl`, `autolog` | `on` / `off` (all default `on` except `syncUrl` and `autolog`, which default `off`) |

### Repositories and branches

| Command | Description | Example |
|---|---|---|
| `repos [--all]` (`-a`) | List your repositories (updated first); `--all` / `-a` includes collaborator and organization repos | `repos --all` |
| `select <repo\|owner/repo>` | Set the active repository and reset the virtual path | `select octocat/Hello-World` |
| `branch [name]` | Show or switch the active branch | `branch main` |
| `open [path]` | Open repo/path on GitHub in a new tab | `open docs/` |
| `commits` / `log` | List recent commits, 10 at a time in an interactive pager | `log` |
| `repo info` | Repository metadata | `repo info` |
| `repo create <name> [--private] [--description "..."]` | Create a repository in your account | `repo create site --private` |
| `repo delete <name>` | Delete a repository (asks for confirmation) | `repo delete old-site` |
| `repo fork <owner/repo>` | Fork a repository | `repo fork octocat/Hello-World` |
| `repo star / unstar [owner/repo]` | Star or unstar (defaults to active repo) | `repo star octocat/Hello-World` |
| `repo watch / unwatch` | Watch / unwatch the active repo | `repo watch` |
| `repo branches` / `repo tags` | List branches / tags | `repo branches` |
| `repo releases` | List releases (alias of `releases`) | `repo releases` |
| `repo collaborators` | List collaborators | `repo collaborators` |
| `repo issues` / `repo pulls` / `repo commits` | List issues / PRs / commits | `repo issues` |
| `repo contributors` | List contributors | `repo contributors` |
| `repo languages` | Language bytes and percentages | `repo languages` |
| `repo topics [name...]` | Show topics, or **replace** them with the given list | `repo topics cli browser github` |
| `repo license` | Show license file information | `repo license` |

### Paging through `log`

`log` (and its aliases `commits` / `repo commits`) no longer dumps thousands of
rows at once. It fetches the history and then shows **10 commits at a time** with
a live footer:

```text
SHA       MESSAGE                                              AUTHOR     DATE
────────  ───────────────────────────────────────────────────  ─────────  ──────────
a1b2c3d4  Fix parser crash on empty input                      dev1       2026-01-14
...
  [space] next 10  ·  [q] quit  ·  10/250 commits
```

- **Space** → append the next 10 commits (columns stay aligned) and move the
  footer. At the end it shows `── end of 250 commits ──  [q] quit`.
- **q** → quit the pager: the footer is removed, the rows you viewed stay in
  scrollback, and the normal prompt returns.
- **Ctrl+X** → cancel, which also closes the pager.
- Starting any other command also closes the pager automatically.

While the pager is active, Space and `q` are captured by the pager and are not
typed into the prompt.

### Navigation and filesystem

All paths are virtual paths inside the selected repository. `.` is the current
directory, `~` and `/` return to the repository root, `..` goes up.

### Numbered navigation

`ls` prefixes every entry with a 1-based number:

```text
 1 - foldera/
 2 - folderb/
 3 - README.md
```

Use those numbers with `cd` instead of typing long or awkward names:

```text
cd 1          # → cd foldera
cd 2          # → cd folderb
cd 1/3/4      # → enter item 1, then item 3 there, then item 4
cd docs/2     # mixed names and numbers also work
```

Each numeric segment is resolved against a cached listing of that directory
(dirs first, then alphabetical, same order as `ls`). A folder whose literal name
is numeric is used as-is when its index is out of range. Quote names containing
spaces as usual: `cd "folder a"`.

**Every command that takes a file reference accepts a name, a path, or an
`ls` index** (including nested indexes like `docs/2`):

```text
cat 2                 # print contents of item 2
head 2 / tail 2       # first / last lines of item 2
wc 2                  # word count for item 2
grep -n "todo" 2      # search inside item 2
rm 2                  # delete item 2
cp 2 backup/          # copy item 2 into backup/
mv 1 docs/            # move item 1 into docs/
download 3            # save item 3 to your computer
editor 2              # edit item 2
open 2                # open item 2 on GitHub
info 2 / stat 2       # properties of item 2
```

Destinations work the same way, but a name that does not exist is still
created normally (e.g. `cp 2 new-name.txt`). Indexes use the folder metadata
cached by `ls`; run `ls -f` if the listing may be stale.

### Auto-list after cd

`autolog` (alias `autols`, preference key `autolog`) toggles a "list as you
navigate" mode. While it is on, every successful `cd` — including `cd ..`,
`cd ~`, numeric paths such as `cd 1/3`, and aliases like `..` — immediately
prints the new folder's `ls` output, so you do not have to type `ls` separately:

```text
autolog            # enable
cd docs            # changes to docs/ and lists its contents
cd 1               # enters item 1 and lists it
cd ..              # goes up and lists the parent
autolog            # disable
```

It is off by default, persists in `localStorage`, and can also be switched with
`autolog on` / `autolog off` / `autolog status`, or the
`Auto-list after cd` checkbox in `prefs`.

| Command | Description | Example |
|---|---|---|
| `pwd` | Print current path | `pwd` |
| `cd <path>` | Change directory (validated against the API); numeric segments select items from `ls` | `cd src/lib`, `cd 1/3` |
| `autolog` / `autols` | Toggle automatic `ls` after every `cd` (also accepts `on` / `off` / `status`) | `autolog`, `autolog on` |
| `..` / `...` | Aliases for `cd ..` / `cd ../..` | `..` |
| `tree` | Recursive tree of the current path | `tree` |
| `ls [-l] [-f] [path]` | List files/folders with numbers (`-l` table, `-f` refresh cache) | `ls -f src` |
| `ll [path]` | Long listing (type, name, size, sha) | `ll` |
| `lt` | Tree view of the current folder (3 levels deep) | `lt` |
| `cat <file>` | Print file contents | `cat README.md` |
| `show <file\|index>` / `view` / `preview` | Preview a file inline: text, image, PDF, audio/video | `show 2`, `show docs/pic.png` |
| `info <file\|index>` / `stat` | Show file properties in a table (no content fetch) | `info 2`, `info README.md` |
| `download <file>` / `get <file>` | Save a repository file to your computer | `download docs/guide.md` |
| `head [-n N] <file>` | First N lines (default 10) | `head -n 5 app.js` |
| `tail [-n N] <file>` | Last N lines (default 10) | `tail -n 20 app.js` |
| `wc <file>` | Lines, words and characters | `wc README.md` |
| `grep [-n] [-i] <pattern> <file>` | Search inside a file (`-n` line numbers, `-i` case-insensitive) | `grep -ni "todo" app.js` |
| `find <pattern>` | Find filenames (supports `*` wildcards, case-insensitive) | `find *.md` |
| `chmod <path>` | Explain GitHub's file mode model (informational only) | `chmod script.sh` |
| `editor [file]` / `nano [file]` | Open a nano-like text editor; loads the file if it exists, otherwise starts empty | `editor notes.txt` |

### File details and listing cache

Typing a bare file name, path, or `ls` number shows that file's properties in a
table — it does **not** download or print the file's contents:

```text
info README.md     # or just type: README.md
info 2             # or just type: 2
stat docs/a.png    # stat is an alias for info
info -f 2          # refresh the cached folder listing first
```

```text
PROPERTY       VALUE
─────────────  ─────────────────────────────────────────────
#              2
NAME           README.md
PATH           README.md
TYPE           file
SIZE           4.21 KB
SHA            b13051d8fb4f5c03899209af4b6c345632b445e6
DOWNLOAD URL   https://raw.githubusercontent.com/...
HTML URL       https://github.com/...
GIT URL        https://api.github.com/.../git/blobs/...
ENCODING       base64
```

`ls` caches the **full metadata** of every entry in a folder (name, path, size,
sha, `download_url`, `html_url`, `git_url`, …). Looking up a file or index then
uses that cache, so it is instant and never reads file content. The cache is
cleared after every commit; use `ls -f` or `info -f` to refresh it manually.
Folders are not shown here — use `ls <folder>` to list them.

### Inline file preview

`show` (aliases `view`, `preview`) displays a file's contents **inside the
terminal output** — no external tab, no download. It accepts the same file
references as every other command: a name, a path, or an `ls` index.

```text
show README.md       # text rendered inline (like cat, but in a framed view)
show 2               # contents of item 2 in the current ls listing
show docs/2          # item 2 inside docs/
view pic.png         # image displayed inline
preview report.pdf   # PDF embedded in the output
```

Supported types:

| File type | Extensions | What you see |
|---|---|---|
| Text | `.txt`, `.md`, `.js`, `.ts`, `.json`, `.html`, `.css`, `.py`, `.yml`, … | Escaped, preformatted text with a small caption (name · size · MIME) |
| Image | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.avif`, … | The image itself, scaled to fit the terminal |
| PDF | `.pdf` | An embedded PDF viewer plus an "open in a new tab" link |
| Audio / video | `.mp3`, `.wav`, `.mp4`, `.webm`, … | Native browser player with controls |
| Other binary | anything else with binary bytes | A notice suggesting `download <file>` |

Notes:

- File type is detected from the file's **magic bytes** as well as its extension,
  so images still preview with unusual or missing extensions (`.dat`, no
  extension, uppercase, `.heic`, …).
- For files above GitHub's ~1 MB contents limit, `show` fetches the raw blob so
  the preview still works. If a preview cannot be rendered, QCli shows a link to
  the original file and suggests `download <file>`.
- Directories cannot be previewed — use `ls <dir>` or `cd <dir>`. Use
  `info <file>` first if you only want metadata without transferring content.
- After a preview renders, QCli scrolls the output to the bottom so the whole
  image/viewer is visible without manual scrolling.
- Previews use temporary browser blob URLs; they are released when you run
  `clear` (or `Ctrl+L`).

### Downloading files

`download` (alias `get`) reads a file from the selected repository and hands it
to your browser's normal download flow, so it lands in your Downloads folder:

```text
download README.md                 # saves as README.md
download docs/guide.md             # basename is used by default
download docs/guide.md as myguide.md   # choose a different filename
```

It works with relative paths inside the current `cd` directory, keeps binary
files intact, and falls back to the Git blob API for files too large for the
contents API. Requires a repository (`select <repo>` first).

### Uploading local files

`put` (alias `upload`) opens your browser's file picker so you can choose one
or more files from your computer:

```text
put                 # choose file(s) → uploaded into the current cd directory
put docs            # choose file(s) → uploaded into docs/ in the repository
```

To upload a **whole folder recursively**, use `-r` (or `putdir`). The selected
folder's own name is dropped; its files and subfolders keep their relative
paths inside the target directory:

```text
put -r              # choose folder(s) → contents go into the current cd directory
put -r docs         # contents go into docs/ in the repository
putdir assets       # same as put -r assets
upload -r docs      # alias also accepts -r
```

For example, selecting a folder `Site` containing `css/main.css` and
`img/logo.png` with `put -r docs` creates
`docs/css/main.css` and `docs/img/logo.png`. Empty folders are skipped because
Git cannot track them. Any `.git` directory inside the selected folder (at any
depth) is ignored, so repository internals are never uploaded; files such as
`.gitignore` are still included.

In Chromium-based browsers (Chrome, Edge, Yandex) QCli walks the selected
folder's directory entries directly, so nested files are uploaded even when the
file list only reports top-level files.

You are asked for the commit message **once**, no matter how many files you
select. A live table then shows every file with its size in MB and status
(`pending` → `uploading` → `uploaded` / `failed`). Files are uploaded in small
batches — **3 at a time by default** — so a large folder is fast without
overwhelming GitHub's API. You do not wait for the whole folder before the next
batch starts.

Use `-j` / `--jobs` / `--concurrency` to change the batch size for one command
(1–10), or set the persistent **Upload parallelism** preference / `prefs set
uploadConcurrency N`:

```text
put -r -j 5          # 5 files at a time for this upload
put -j 1             # one at a time (slowest, least API pressure)
prefs set uploadConcurrency 4
```

GitHub advances the branch ref on every commit, so QCli internally **serializes
the actual commits** even though several files are tracked as in-flight. This
prevents the HTTP 409 "is at … but expected …" conflicts that made large
parallel uploads fail. A transient 409 is still retried automatically (a
`retrying` step appears briefly). Binary files (images, PDFs, archives, …) are
preserved. Press Cancel in the picker or at the message prompt, or Ctrl+X, to
abort without changing the repository. Requires a repository (`select <repo>`
first); a queued `commit -m "..."` is respected.

After the whole batch finishes, QCli asks whether to **re-upload the files that
failed**:

```text
Retry 1 failed file? (y/N) y
```

Answer `y` and only the failed files are uploaded again (no need to pick them
again); the table resets those rows and the final count updates. Answer `n` (or
just press Enter) to leave them failed and see the error summary. You may be
asked again if a later retry round still has failures.

```text
FILE 3        SIZE 51.15MB    STATUS 2/3
────────────  ──────────      ────────
photo.png     2.341 MB        uploaded
  ✔ photo.png → https://raw.githubusercontent.com/owner/repo/main/photo.png
notes.txt     0.001 MB        uploaded
  ✔ notes.txt → https://raw.githubusercontent.com/owner/repo/main/notes.txt
big.zip      48.812 MB        failed
```

As soon as a file finishes uploading, its `download_url` (the raw GitHub URL)
is printed on the next line. With batches of more than one file these appear in
completion order, not necessarily selection order. Failed files do not print a
URL.

### The editor

`editor [file]` opens a full-screen, nano-style editor inside the terminal:

```text
editor README.md     # edit an existing file (content is loaded)
editor notes.txt     # edit a file that doesn't exist yet (starts empty)
editor               # empty editor — you choose the filename when saving
```

| Key | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>O</kbd> / <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save — opens a full-width commit message field; a file-name field appears only when editing a new file |
| <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Esc</kbd> | Close (press twice if there are unsaved changes) |
| <kbd>Tab</kbd> | Insert two spaces |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Move the caret; the line-number gutter follows |

Saving runs a real GitHub commit, so the same commit-message rules apply: a
queued `commit -m "..."` is used first, then the message typed in the save row,
then `Update <path>`. The status bar at the bottom shows the keyboard hints and
the current line/column. Requires a repository (`select <repo>` first).

### Committing changes

Each command below creates a GitHub commit (via the contents API for a single
file, or a single atomic commit via the Git tree API for multiple files).
You will be prompted for a commit message unless you use `-m "..."` or a
previous `commit -m "..."`.

| Command | Description | Example |
|---|---|---|
| `commit -m "msg"` | Queue a message for the next mutation | `commit -m "Update docs"` |
| `put [-r] [path]` / `upload` | Upload file(s), or a folder with `-r`, from a picker | `put -r docs` |
| `putdir [path]` | Upload a folder recursively (alias for `put -r`) | `putdir assets` |
| `mkdir <name> [-m "msg"]` | Create a directory (commits a `.gitkeep` file) | `mkdir docs` |
| `touch <file> [-m "msg"]` | Create an empty file | `touch CHANGELOG.md` |
| `echo "text" > file` | Create/overwrite a file | `echo "hello" > hello.txt` |
| `echo "text" >> file` | Append to a file | `echo "more" >> hello.txt` |
| `rm <path> [-m "msg"]` | Delete a file | `rm old.txt` |
| `rm -r <dir> [-m "msg"]` | Delete a directory tree in one commit | `rm -r old-docs` |
| `cp <src> <dst> [-m "msg"]` | Copy a file | `cp README.md README.bak` |
| `cp -r <src> <dst> [-m "msg"]` | Copy a directory tree | `cp -r docs docs-backup` |
| `mv <src> <dst> [-m "msg"]` | Move a file (copy + delete, one commit) | `mv notes.txt docs/notes.txt` |
| `rename <old> <new> [-m "msg"]` | Rename within the current folder | `rename a.txt b.txt` |

> Directories do not exist independently in Git: `mkdir` commits a `.gitkeep`
> placeholder. GitHub's contents API rejects truly empty files (HTTP 422), so
> `.gitkeep` and `touch` files contain a single newline. GitHub's contents API
> also limits single files to ~1 MB. If you delete the last file of a folder,
> that folder disappears from Git; QCli notices and moves `cwd` up to the
> nearest folder that still exists.

### Issues and pull requests

| Command | Description | Example |
|---|---|---|
| `issues` | List issues (PRs filtered out) | `issues` |
| `issue create <title>` | Create an issue with an empty body | `issue create Broken link` |
| `issue close <number>` | Close an issue | `issue close 12` |
| `issue reopen <number>` | Reopen an issue | `issue reopen 12` |
| `issue comment <number> <body>` | Add a comment | `issue comment 12 "Fixed in main"` |
| `issue label <number> <label...>` | Add labels | `issue label 12 bug docs` |
| `issue assign <number> <user...>` | Assign users | `issue assign 12 octocat` |
| `pulls` | List pull requests | `pulls` |
| `pr create <title>` | Open a pull request | `pr create Add search` |
| `pr merge <number>` | Merge a PR | `pr merge 7` |
| `pr close <number>` | Close a PR | `pr close 7` |
| `pr review <number> [body]` | Approve a PR (default body `LGTM`) | `pr review 7 "Looks good"` |
| `pr comment <number> <body>` | Comment on a PR | `pr comment 7 "Nice work"` |

### GitHub Actions

| Command | Description | Example |
|---|---|---|
| `workflows` | List workflows and their IDs | `workflows` |
| `workflow run <id> [ref]` | Dispatch a workflow (needs `workflow` scope) | `workflow run 12345 main` |
| `runs` | List the latest 20 workflow runs | `runs` |
| `run logs <run_id>` | Print the URL for a run's logs | `run logs 9876543210` |

### Gists

| Command | Description | Example |
|---|---|---|
| `gists` | List your gists | `gists` |
| `gist create <filename> [content]` | Create a **private** gist | `gist create snippet.txt "hello"` |
| `gist delete <id>` | Delete a gist | `gist delete abc123` |

### Users and social

| Command | Description | Example |
|---|---|---|
| `user` | Show the authenticated user's profile summary | `user` |
| `followers` / `following` | List followers / followed users | `followers` |
| `follow <user>` / `unfollow <user>` | Follow / unfollow | `follow octocat` |
| `starred` | List starred repositories | `starred` |
| `star <owner/repo>` / `unstar <owner/repo>` | Star / unstar any repo | `star octocat/Hello-World` |

### Organizations and teams

| Command | Description | Example |
|---|---|---|
| `orgs` | List your organizations | `orgs` |
| `org members <org>` | List organization members | `org members github` |
| `org repos <org>` | List organization repositories | `org repos github` |
| `teams <org>` | List teams in an organization | `teams github` |
| `team members <org> <slug>` | List members of a team | `team members github docs` |

### Notifications and search

| Command | Description | Example |
|---|---|---|
| `notifications` | List unread notifications | `notifications` |
| `mark-read` | Mark all notifications as read (uses the current time) | `mark-read` |
| `search repos <query>` | Search repositories | `search repos github cli in:name` |
| `search code <query>` | Search code | `search code "console.log" repo:octocat/Hello-World` |
| `search issues <query>` | Search issues and PRs | `search issues is:open label:bug` |
| `search users <query>` | Search users | `search users octocat` |

### Releases, webhooks, keys, secrets, Pages, traffic, rate limit

These commands operate on the active repository (use `select` first).

| Command | Description | Example |
|---|---|---|
| `releases` | List releases | `releases` |
| `release create <tag> [name]` | Create a release | `release create v1.0.0 "First release"` |
| `release delete <id>` | Delete a release | `release delete 12345` |
| `hooks` | List webhooks and their URLs | `hooks` |
| `hook create <url>` | Create a `push` webhook with JSON payloads | `hook create https://example.com/hook` |
| `hook delete <id>` | Delete a webhook | `hook delete 123` |
| `keys` | List deploy keys | `keys` |
| `key delete <id>` | Delete a deploy key | `key delete 123` |
| `secrets` | List Actions secret **names** (values are never readable) | `secrets` |
| `pages` | Show GitHub Pages configuration | `pages` |
| `pages build` | Trigger a Pages build | `pages build` |
| `traffic` | Show 14-day view and clone counts | `traffic` |
| `rate` / `rate_limit` / `ratelimit` | Show all API rate limits as a table (resource, limit, remaining, used, reset) | `rate_limit` |

Example output:

```text
  GitHub API rate limits

RESOURCE        LIMIT  REMAINING  USED  RESET IN
──────────────  ─────  ─────────  ────  ────────
code_search      10         10     0  59m
core            5000        4987   13  59m
graphql         5000        5000    0  59m
search            30          30    0  59m
```

The `core` row is highlighted in yellow/bold across every column, since it is
the limit that matters for normal REST API calls.

### GraphQL

| Command | Description | Example |
|---|---|---|
| `gql "<query>" [variables-json]` | Run a raw GraphQL v4 query; JSON variables are optional | `gql 'query { viewer { login } }'` |

---

## 6. Aliases

| Alias | Expands to |
|---|---|
| `?` | `help` |
| `cls` | `clear` |
| `quit` | `exit` |
| `pref`, `settings` | `prefs` |
| `log` | `commits` |
| `..` | `cd ..` |
| `...` | `cd ../..` |
| `ll` | `ls -l` |
| `rename` | `mv` |
| `nano` | `editor` |
| `get` | `download` |
| `upload` | `put` |
| `putdir` | `put -r` |
| `stat` | `info` |
| `view` / `preview` | `show` |
| `autols` | `autolog` |
| `ratelimit` / `rate_limit` | `rate` |

---

## 7. Tips, limitations and troubleshooting

* **Blank page.** Make sure all four files (`index.html`, `style.css`, `repo.js`,
  `app.js`) sit in the same folder, and that `repo.js` is loaded before `app.js`.
  The page shows a short error message if the scripts fail to start; the browser
  console has the exact error.
* **Changes from outside this tab not showing up.** API responses use the
  browser cache by default (`cache: 'store'`) so repeated loads are fast. Add the
  global `-f` / `--fresh` flag to any command to bypass it for that command
  (`cache: 'no-store'`), e.g. `ls -f`, `cat README.md -f`, `log -f`. If you still
  see stale data, check that the change was actually committed on the selected
  branch.
* **Token problems.** `HTTP 401` means the token is invalid or expired;
  `HTTP 403` usually means a missing scope or rate limiting (check `rate`).
* **No repository selected.** Commands like `ls`, `cd` and `tree` require `select <repo>` first.
* **`cd` validates paths.** It calls the contents API; a path that is a file or does not
  exist is rejected. Use `/` or `~` to return to the repository root.
* **Commit messages.** A queued `commit -m "..."` message is consumed by the next
  mutating command. Otherwise the terminal prompts with an action-specific
  default already filled in (e.g. `Delete a.txt`, `Copy a.txt → docs/a.txt`,
  `Upload 3 files to docs`, `Create directory src`). Press **Enter** to accept it,
  or just type to replace it. The editor's save row is prefilled the same way
  (`Update path` / `Create path`) and updates as you type a new filename.
  While the commit runs, the prompt changes to `…` — that is the busy indicator,
  not a second commit question.
* **`echo` and redirection.** Quoting matters: `echo "two words" > file` keeps the spaces.
* **`pr create`** currently uses the active branch as both `head` and `base`; GitHub
  will reject that combination. Create PRs from the web UI or adjust the command if you
  need a cross-branch PR.
* **Secrets are write-only** through the API; `secrets` only lists names.
* **`chmod` is informational.** GitHub supports only modes `100644` and `100755`.
* **Scrolled output.** When you scroll away from the bottom, a `↓ latest` button appears.
* **Preferences are local.** They are stored in your browser's `localStorage` under
  `qcli.prefs.v1`; the token is never persisted.
