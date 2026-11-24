## **QCli**

![QCli terminal screenshot](https://i.imgur.com/7SGMRCi.png)

[QCli](https://nh-em0n.github.io/QCli/) is a **browser-based GitHub terminal**
developed for the QDoc Project. It speaks GitHub REST API v3 (with a GraphQL v4
passthrough) and gives you a bash-like virtual filesystem for a repository, so
you can browse, read, write, copy, move and delete files. Every mutation becomes
a real GitHub commit — there is no backend and no build step.

### Quick start

1. Keep `index.html`, `style.css`, `repo.js` and `app.js` together in one folder.
2. Double-click `index.html` (it runs directly from `file://`), or serve the
   folder with `python3 -m http.server 8765` and open
   `http://127.0.0.1:8765/index.html`.
3. Sign in with a GitHub username and Personal Access Token, or press **Enter**
   at the token prompt for read-only guest access. You can also use the URL form
   `index.html#username@token/owner/repo`.

Type `help` for the command list, `Tab` to autocomplete, and `exit` to sign in
again.

### Highlights

- Bash-like commands over a GitHub repository: `ls`, `cd`, `tree`, `cat`,
  `grep`, `find`, `cp`, `mv`, `rm`, `editor`, `download`, `put`, `commit`, `log`…
- Inline previews for images, PDFs, audio/video, and syntax-highlighted text
  with line numbers and a Copy button.
- Repository and branch selection, issues/PRs, Actions, gists, releases,
  notifications and rate-limit info.
- Preferences with multiple dark and light themes, custom fonts, caret and
  outline colours, and a wrapping nano-style editor.

### Project files

| File | Purpose |
|---|---|
| `index.html` | Page entry point; loads `style.css`, then `repo.js`, then `app.js` |
| `style.css` | Terminal, theme and preferences/editor styling |
| `repo.js` | `GitHubRepo` class — GitHub API, repository state and commit logic |
| `app.js` | `QCli` class — terminal UI, input, preferences and all commands |

### Documentation

- **[guide.md](docs/guide.md)** — full user guide and command reference.
- **[docs/updates.md](docs/updates.md)** — change log of recent improvements.
