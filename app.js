/**
 * app.js — terminal UI layer.
 * Owns rendering, input, preferences and command dispatch; delegates all
 * GitHub data work to the GitHubRepo instance in repo.js.
 *
 * Plain classic script: repo.js must be loaded before this file.
 */

/* ══════════════════════════════════════════════════════════════════════════
 *  ANSI → HTML
 * ══════════════════════════════════════════════════════════════════════════ */
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', gray: '\x1b[90m'
};
const paint = (c, s) => `${c}${s}${C.reset}`;

const ANSI_MAP = {
  0: null, 1: 'font-weight:bold', 2: 'opacity:0.55', 4: 'text-decoration:underline',
  30: 'color:var(--ansi-black)', 31: 'color:var(--ansi-red)', 32: 'color:var(--ansi-green)',
  33: 'color:var(--ansi-yellow)', 34: 'color:var(--ansi-blue)', 35: 'color:var(--ansi-magenta)',
  36: 'color:var(--ansi-cyan)', 37: 'color:var(--ansi-white)', 90: 'color:var(--ansi-gray)',
  91: 'color:var(--ansi-red)', 92: 'color:var(--ansi-green)', 93: 'color:var(--ansi-yellow)',
  94: 'color:var(--ansi-blue)', 95: 'color:var(--ansi-magenta)', 96: 'color:var(--ansi-cyan)'
};

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Raised by cooperative cancellation points (Ctrl+X) to unwind a running
   command cleanly instead of reporting it as an ordinary error. */
class CancelError extends Error {}

/* MIME hints for `show` (inline file viewer). Everything else is treated as
   text unless it looks binary (see cmdShow). */
const SHOW_MIME = {
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', jpe:'image/jpeg',
  jfif:'image/jpeg', pjpeg:'image/jpeg', pjp:'image/jpeg', gif:'image/gif',
  webp:'image/webp', bmp:'image/bmp', ico:'image/x-icon', cur:'image/x-icon',
  avif:'image/avif', heic:'image/heic', heif:'image/heif',
  apng:'image/png', jxl:'image/jxl',
  tif:'image/tiff', tiff:'image/tiff', svg:'image/svg+xml',
  pdf:'application/pdf',
  mp4:'video/mp4', m4v:'video/mp4', webm:'video/webm', mov:'video/quicktime',
  ogv:'video/ogg',
  mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4', aac:'audio/aac',
  flac:'audio/flac', oga:'audio/ogg'
};

const SHOW_TEXT = new Set([
  'txt','text','md','markdown','mdx','js','jsx','mjs','cjs','ts','tsx',
  'json','jsonc','json5','html','htm','xhtml','css','scss','sass','less',
  'py','pyw','java','kt','kts','c','h','cc','cpp','cxx','hpp','hh','cs',
  'go','rs','rb','php','sh','bash','zsh','fish','ps1','bat','cmd',
  'yml','yaml','toml','ini','cfg','conf','properties','env','xml','xsd',
  'sql','csv','tsv','log','diff','patch','tex','rst','adoc','vue','svelte',
  'swift','scala','r','lua','pl','pm','ex','exs','erl','hrl','hs','dart',
  'groovy','gradle','make','mk','dockerfile','gitignore','gitattributes',
  'editorconfig','npmignore','tf','hcl','graphql','gql','ipynb','lock'
]);

function ansiToHtml(text) {
  text = escapeHtml(text);
  let out = '', open = 0, last = 0;
  for (const m of text.matchAll(/\x1b\[([\d;]*)m/g)) {
    out += text.slice(last, m.index);
    const codes = (m[1] || '0').split(';').map((n) => parseInt(n, 10));
    for (const n of codes) {
      const style = ANSI_MAP[n];
      if (n === 0) { out += '</span>'.repeat(open); open = 0; }
      else if (style) { out += `<span style="${style}">`; open++; }
    }
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  out += '</span>'.repeat(open);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  THEMES / FONTS / PREFERENCES
 * ══════════════════════════════════════════════════════════════════════════ */

const THEMES = {
  catppuccin: {
    name: 'Catppuccin', vars: { bg:'#1e1e2e', fg:'#cdd6f4', surface:'#181825', 'surface-2':'#313244', border:'#313244', muted:'#6c7086', 'muted-2':'#585b70', 'text-soft':'#a6adc8', accent:'#c678dd', blue:'#61afef', green:'#a6e3a1', red:'#f38ba8', yellow:'#f9e2af', 'scroll-thumb':'#585b70', 'scroll-hover':'#7f849c', 'scroll-track':'#181825', caret:'#cdd6f4' },
    ansi: { black:'#3b4252', red:'#e06c75', green:'#98c379', yellow:'#e5c07b', blue:'#61afef', magenta:'#c678dd', cyan:'#56b6c2', white:'#d8dee9', gray:'#6c7086' }
  },
  'github-dark': {
    name: 'GitHub Dark', vars: { bg:'#0d1117', fg:'#c9d1d9', surface:'#161b22', 'surface-2':'#21262d', border:'#30363d', muted:'#8b949e', 'muted-2':'#6e7681', 'text-soft':'#b1bac4', accent:'#bc8cff', blue:'#58a6ff', green:'#3fb950', red:'#f85149', yellow:'#d29922', 'scroll-thumb':'#484f58', 'scroll-hover':'#6e7681', 'scroll-track':'#161b22', caret:'#c9d1d9' },
    ansi: { black:'#484f58', red:'#f85149', green:'#3fb950', yellow:'#d29922', blue:'#58a6ff', magenta:'#bc8cff', cyan:'#39c5cf', white:'#c9d1d9', gray:'#8b949e' }
  },
  'github-light': {
    light: true, name: 'GitHub Light', vars: { bg:'#ffffff', fg:'#1f2328', surface:'#f6f8fa', 'surface-2':'#eaeef2', border:'#d0d7de', muted:'#59636e', 'muted-2':'#818b98', 'text-soft':'#424a53', accent:'#8250df', blue:'#0969da', green:'#1a7f37', red:'#cf222e', yellow:'#9a6700', 'scroll-thumb':'#afb8c1', 'scroll-hover':'#8c959f', 'scroll-track':'#f6f8fa', caret:'#1f2328' },
    ansi: { black:'#d0d7de', red:'#cf222e', green:'#1a7f37', yellow:'#9a6700', blue:'#0969da', magenta:'#8250df', cyan:'#0550ae', white:'#1f2328', gray:'#59636e' }
  },
  light: {
    light: true, name: 'Light (Solarized)', vars: { bg:'#fdf6e3', fg:'#657b83', surface:'#eee8d5', 'surface-2':'#e9e2cc', border:'#d3c6aa', muted:'#93a1a1', 'muted-2':'#a8a094', 'text-soft':'#586e75', accent:'#6c71c4', blue:'#268bd2', green:'#859900', red:'#dc322f', yellow:'#b58900', 'scroll-thumb':'#c9bda3', 'scroll-hover':'#a89c80', 'scroll-track':'#eee8d5', caret:'#657b83' },
    ansi: { black:'#d3c6aa', red:'#dc322f', green:'#859900', yellow:'#b58900', blue:'#268bd2', magenta:'#6c71c4', cyan:'#2aa198', white:'#657b83', gray:'#93a1a1' }
  },
  'one-light': {
    light: true, name: 'One Light', vars: { bg:'#ffffff', fg:'#383a42', surface:'#fafafa', 'surface-2':'#eaeef2', border:'#d4d4d4', muted:'#6b7681', 'muted-2':'#8d959c', 'text-soft':'#4b4d56', accent:'#a626a4', blue:'#3563d6', green:'#2f7d32', red:'#c4382d', yellow:'#9a6a00', 'scroll-thumb':'#c7c7c7', 'scroll-hover':'#a0a0a0', 'scroll-track':'#fafafa', caret:'#383a42' },
    ansi: { black:'#d4d4d4', red:'#c4382d', green:'#2f7d32', yellow:'#9a6a00', blue:'#3563d6', magenta:'#a626a4', cyan:'#01779f', white:'#383a42', gray:'#6b7681' }
  },
  'gruvbox-light': {
    light: true, name: 'Gruvbox Light', vars: { bg:'#fbf1c7', fg:'#3c3836', surface:'#f2e5bc', 'surface-2':'#ebdbb2', border:'#d5c4a1', muted:'#6f6257', 'muted-2':'#8a7b6e', 'text-soft':'#504945', accent:'#8f3f71', blue:'#076678', green:'#6b6708', red:'#9d0006', yellow:'#96600d', 'scroll-thumb':'#bdae93', 'scroll-hover':'#a89984', 'scroll-track':'#f2e5bc', caret:'#3c3836' },
    ansi: { black:'#d5c4a1', red:'#9d0006', green:'#6b6708', yellow:'#96600d', blue:'#076678', magenta:'#8f3f71', cyan:'#427b58', white:'#3c3836', gray:'#6f6257' }
  },
  'nord-light': {
    light: true, name: 'Nord Light', vars: { bg:'#fafafa', fg:'#4c566a', surface:'#eceff4', 'surface-2':'#e5e9f0', border:'#d8dee9', muted:'#667389', 'muted-2':'#8792a8', 'text-soft':'#434c5e', accent:'#8b5682', blue:'#4c6d96', green:'#4a7757', red:'#a94c55', yellow:'#8c6b1f', 'scroll-thumb':'#b8c0cc', 'scroll-hover':'#9aa5b8', 'scroll-track':'#eceff4', caret:'#4c566a' },
    ansi: { black:'#d8dee9', red:'#a94c55', green:'#4a7757', yellow:'#8c6b1f', blue:'#4c6d96', magenta:'#8b5682', cyan:'#4a7582', white:'#4c566a', gray:'#667389' }
  },
  'ayu-light': {
    light: true, name: 'Ayu Light', vars: { bg:'#f8f9fa', fg:'#5c6166', surface:'#f0f2f3', 'surface-2':'#e4e8ea', border:'#d5dbde', muted:'#68737e', 'muted-2':'#8d969c', 'text-soft':'#636c73', accent:'#8250a8', blue:'#226da8', green:'#34773b', red:'#bd394a', yellow:'#8e6500', 'scroll-thumb':'#c1c9cd', 'scroll-hover':'#a6afb5', 'scroll-track':'#f0f2f3', caret:'#5c6166' },
    ansi: { black:'#d5dbde', red:'#bd394a', green:'#34773b', yellow:'#8e6500', blue:'#226da8', magenta:'#8250a8', cyan:'#247777', white:'#5c6166', gray:'#68737e' }
  },
  atom: {
    name: 'Atom One Dark', vars: { bg:'#282c34', fg:'#abb2bf', surface:'#21252b', 'surface-2':'#383a42', border:'#3b4048', muted:'#7f848e', 'muted-2':'#636b78', 'text-soft':'#9da7b3', accent:'#c678dd', blue:'#61afef', green:'#98c379', red:'#e06c75', yellow:'#e5c07b', 'scroll-thumb':'#4b5263', 'scroll-hover':'#616a7d', 'scroll-track':'#21252b', caret:'#abb2bf' },
    ansi: { black:'#3b4048', red:'#e06c75', green:'#98c379', yellow:'#e5c07b', blue:'#61afef', magenta:'#c678dd', cyan:'#56b6c2', white:'#abb2bf', gray:'#7f848e' }
  },
  dracula: {
    name: 'Dracula', vars: { bg:'#282a36', fg:'#f8f8f2', surface:'#21222c', 'surface-2':'#343746', border:'#44475a', muted:'#6272a4', 'muted-2':'#4c4f69', 'text-soft':'#d3d7de', accent:'#bd93f9', blue:'#8be9fd', green:'#50fa7b', red:'#ff5555', yellow:'#f1fa8c', 'scroll-thumb':'#6272a4', 'scroll-hover':'#8a93c7', 'scroll-track':'#21222c', caret:'#f8f8f2' },
    ansi: { black:'#44475a', red:'#ff5555', green:'#50fa7b', yellow:'#f1fa8c', blue:'#8be9fd', magenta:'#bd93f9', cyan:'#8be9fd', white:'#f8f8f2', gray:'#6272a4' }
  },
  nord: {
    name: 'Nord', vars: { bg:'#2e3440', fg:'#d8dee9', surface:'#242932', 'surface-2':'#3b4252', border:'#434c5e', muted:'#7b88a1', 'muted-2':'#616e88', 'text-soft':'#b3bdcc', accent:'#b48ead', blue:'#88c0d0', green:'#a3be8c', red:'#bf616a', yellow:'#ebcb8b', 'scroll-thumb':'#616e88', 'scroll-hover':'#7b88a1', 'scroll-track':'#242932', caret:'#d8dee9' },
    ansi: { black:'#434c5e', red:'#bf616a', green:'#a3be8c', yellow:'#ebcb8b', blue:'#88c0d0', magenta:'#b48ead', cyan:'#88c0d0', white:'#d8dee9', gray:'#7b88a1' }
  }
};

const FONTS = {
  menlo:    "'Menlo','Consolas','Liberation Mono',monospace",
  jetbrains:"'JetBrains Mono','Fira Code',monospace",
  fira:     "'Fira Code','JetBrains Mono',monospace",
  source:   "'Source Code Pro',Menlo,Consolas,monospace",
  courier:  "'Courier New',Courier,monospace",
  system:   'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
};

const DEFAULT_PREFS = {
  theme: 'github-light', fontFamily: 'menlo', fontSize: 13, lineHeight: 1.45,
  caretColor: null, outlineColor: null, wrap: true, animations: true, autoScroll: true,
  statusBar: true, banner: true, timestamps: false, hints: true,
  syncUrl: false,  // opt-in only: putting the token in the address bar is risky
  autolog: false,  // automatically list a folder after cd
  uploadConcurrency: 3  // files in flight at once for put / putdir
};

const PREFS_KEY = 'qcli.prefs.v1';
function loadPrefs() {
  try { const raw = localStorage.getItem(PREFS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch (_) { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (_) {}
}


/* ══════════════════════════════════════════════════════════════════════════
 *  class QCli — browser terminal UI
 * ══════════════════════════════════════════════════════════════════════════ */
class QCli {

  constructor(opts = {}) {
    this.username = opts.username || null;
    this.token    = opts.token    || null;
    this.user     = null;

    /* GitHub data layer (repo.js) */
    this.github = new GitHubRepo({ username: this.username, token: this.token });

    this.urlConfig = this.parseUrlConfig();
    this._pendingPath = null;

    this.history  = [];
    this.pendingMessage = null;

    /* Directory listings fetched by ls are cached here so `info 2` / `info a.md`
       can show metadata instantly without re-fetching or reading file content. */
    this._dirCache = new Map();

    /* Blob URLs created by `show` for inline images/PDF/media. Revoked on clear. */
    this._objectUrls = [];

    this.running  = false;
    this._pending = null;
    this._histIdx = -1;

    /* sequential execution / UX state */
    this.busy        = false;
    this._queue      = [];
    this._busyStack  = [];
    this._busyEl     = null;
    this._busyTimer  = null;
    this._busyT0     = 0;
    this._busyLabel  = '';
    this._errCount   = 0;
    this._tabState   = null;
    this._abortRequested = false;   /* set by Ctrl+X, checked in long operations */

    /* interactive output pager (log / commits): { total, size, from, footer, render } */
    this._pager = null;
    this._pagerHandler = null;

    this.container = opts.container || document.body;
    this.outEl = null; this.promptEl = null; this.inputEl = null;
    this.suggestEl = null; this.statusEl = null; this.jumpEl = null;
    this._groupEl = null;   // current command/output group

    /* output scrolling */
    this._stickToBottom = true;

    /* preferences */
    this.prefs = { ...DEFAULT_PREFS, ...loadPrefs() };
    if (!THEMES[this.prefs.theme]) this.prefs.theme = DEFAULT_PREFS.theme;
    this.prefEl = null;
    this.applyPrefs();

    this.commands = this.buildCommands();
  }

  /* Active repository / working directory live in the GitHubRepo instance,
     but are exposed here so existing command handlers read naturally. */
  get repo() { return this.github.active; }
  set repo(value) { this.github.active = value; }
  get cwd() { return this.github.cwd; }
  set cwd(value) { this.github.cwd = value; }


  async branchTree() {
    const tree = await this.github.branchTree();
    if (this.github.lastTreeTruncated) this.warn('Tree listing truncated (>100k entries).');
    return tree;
  }

  /* Git drops directories once their last file is deleted. If cwd was inside
     such a directory, walk up to the nearest path that still exists. */
  async ensureValidCwd() {
    let moved = false;
    while (this.cwd.length) {
      const p = this.cwd.join('/');
      let data = null;
      try { data = await this.github.getContent(p); }
      catch (e) { if (e && e.status !== 404) throw e; }
      if (Array.isArray(data)) break;   // still a real directory
      this.cwd.pop();
      moved = true;
    }
    if (moved) {
      this.updateStatus();
      this.syncUrl();
      this.warn(`Current folder no longer exists — moved up to ${this.github.pwd()}`);
    }
    return moved;
  }


  async commit(changes, message) {
    if (this._dirCache) this._dirCache.clear();
    const result = await this.github.commit(changes, message);
    if (!result || result.empty) { this.info('Nothing to commit.'); return null; }
    this.printDiff(result.changes);
    this.ok(result.text);
    if (result.commitSha) this.info(`commit ${result.commitSha.slice(0, 7)}  "${result.message}"`);
    await this.ensureValidCwd();
    return result.commit || null;
  }


  async start() {
    this.render();
    if (this.prefs.banner) this.banner();
    void this.bootstrap().catch((e) => this.err(String((e && e.message) || e)));
  }


  /* Read startup config from the URL:
       #username@token
       #username@token/owner/repo[/path/to/dir]
     Also accepts query params: ?user=...&token=...&repo=...&path=...&branch=...  */
  parseUrlConfig() {
    const cfg = { username: null, token: null, repo: null, path: null, branch: null };
    const decode = (v) => {
      if (!v) return null;
      try { return decodeURIComponent(v); } catch (_) { return v; }
    };
    const params = new URLSearchParams(location.search || '');
    cfg.username = decode(params.get('user') || params.get('username') || params.get('u'));
    cfg.token    = decode(params.get('token') || params.get('t'));
    cfg.repo     = decode(params.get('repo'));
    cfg.path     = decode(params.get('path'));
    cfg.branch   = decode(params.get('branch'));

    // compact "user@token[/owner/repo/path]" form in the hash, or bare query
    const hash   = (location.hash || '').replace(/^#\/?/, '');
    const search = (location.search || '').replace(/^\?/, '');
    let compact = null;
    if (/^[^&?]+@[^&]+$/.test(hash)) compact = hash;
    else if (/^[^&?]+@[^&]+$/.test(search)) compact = search;

    if (compact) {
      const at = compact.indexOf('@');
      cfg.username = decode(compact.slice(0, at));
      let rest = compact.slice(at + 1).split('?')[0];
      const slash = rest.indexOf('/');
      if (slash === -1) {
        cfg.token = decode(rest);
      } else {
        cfg.token = decode(rest.slice(0, slash));
        const segs = rest.slice(slash + 1).split('/').filter(Boolean).map(decode);
        if (segs.length >= 2) {
          if (!cfg.repo) cfg.repo = `${segs[0]}/${segs[1]}`;
          const tail = segs.slice(2).join('/');
          if (!cfg.path && tail) cfg.path = tail;
        }
      }
    }
    return cfg;
  }


  async bootstrap() {
    try {
      const cfg = this.urlConfig;
      let source = null;
      if (cfg.username && cfg.token) {
        this.username = cfg.username;
        this.token = cfg.token;
        source = 'the URL';
      } else if (window.__QCLI_USER__ && window.__QCLI_TOKEN__) {
        this.username = window.__QCLI_USER__;
        this.token    = window.__QCLI_TOKEN__;
        source = 'window.__QCLI_USER__ / window.__QCLI_TOKEN__';
      } else if (window.__GH_USER__ && window.__GH_TOKEN__) {
        this.username = window.__GH_USER__;
        this.token    = window.__GH_TOKEN__;
        source = 'window.__GH_USER__ / window.__GH_TOKEN__ (legacy)';
      }

      if (source) {
        this.info(`Using credentials from ${source}.`);
        await this.validateToken();
      } else {
        await this.authenticate();
      }
      this.ok(`Signed in as ${C.bold}${this.username}${C.reset}`);
      this.info('Type "help" for commands. Tab autocompletes. Use && to chain.');
      this.running = true;

      /* Startup repository / branch / directory supplied in the URL. */
      if (cfg.repo) await this.cmdSelect([cfg.repo]);
      if (cfg.branch) await this.cmdBranch([cfg.branch]);
      if (cfg.path) {
        if (this.repo) await this.cmdCd([cfg.path]);
        else this._pendingPath = cfg.path;
      }

      await this.loop();
    } catch (e) {
      this.err(`Startup failed: ${(e && e.message) || e}`);
    }
  }


  render() {
    this.container.innerHTML = '';
    const term = document.createElement('div');
    term.className = 'term';
    term.innerHTML = `
      <div class="term-status"></div>
      <div class="term-out"></div>
      <button class="jump-bottom" hidden>↓ latest</button>
      <div class="term-input-wrap">
        <div class="term-suggest" hidden></div>
        <div class="term-line">
          <span class="term-prompt"></span>
          <input class="term-input" autocomplete="off" spellcheck="false" />
        </div>
      </div>
      <div class="pref-modal" hidden></div>
      <div class="editor-modal" hidden></div>`;
    this.container.appendChild(term);

    this.outEl    = term.querySelector('.term-out');
    this.promptEl = term.querySelector('.term-prompt');
    this.inputEl  = term.querySelector('.term-input');
    this.suggestEl = term.querySelector('.term-suggest');
    this.statusEl  = term.querySelector('.term-status');
    this.jumpEl    = term.querySelector('.jump-bottom');
    this.prefEl    = term.querySelector('.pref-modal');
    this.editorEl  = term.querySelector('.editor-modal');
    this.buildPrefsUI();
    this.buildEditorUI();

    this.outEl.addEventListener('scroll', () => {
      const distance = this.outEl.scrollHeight - this.outEl.scrollTop - this.outEl.clientHeight;
      this._stickToBottom = distance <= 60;
      this.updateJump();
    });
    this.jumpEl.addEventListener('click', () => {
      this.scroll(true);
      this.inputEl.focus();
    });

    term.addEventListener('click', (e) => {
      /* Never steal focus from controls, links, or a text selection made by the
         user — focusing the input would immediately collapse that selection. */
      if (e.target.closest('.pref-modal, .editor-modal, .term-suggest, ' +
                           '.st-path, .jump-bottom, a')) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && String(sel).trim()) return;
      this.inputEl.focus();
    });
    this.inputEl.addEventListener('keydown', (e) => this.onKey(e));
    this.inputEl.addEventListener('input', () => { this.hideSuggest(); this._tabState = null; });
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
        const t = e.target;
        /* Keep normal Cut behaviour inside the editor / preferences fields. */
        const editing = t && (
          (t.closest && t.closest('.editor-modal, .pref-modal')) ||
          ((t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t !== this.inputEl)
        );
        if (!editing) { e.preventDefault(); this.cancelOperation(); return; }
      }
      if (this.editorEl && !this.editorEl.hidden && e.key === 'Escape') { this.closeEditor(); return; }
      if (this.prefEl && !this.prefEl.hidden && e.key === 'Escape') { this.closePrefs(); return; }
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); this.openPrefs(); }
    });

    this.suggestEl.addEventListener('mousedown', (e) => e.preventDefault());
    this.suggestEl.addEventListener('click', (e) => {
      const item = e.target.closest('.sug');
      if (!item || !this._tabState) return;
      const st = this._tabState;
      const picked = st.candidates[Number(item.dataset.i)];
      this.inputEl.value = st.before + picked + (picked.endsWith('/') ? '' : ' ');
      this.inputEl.focus();
      this.hideSuggest();
      this._tabState = null;
    });

    this.statusEl.addEventListener('click', (e) => {
      if (e.target.closest('.gear')) { this.openPrefs(); return; }
      if (!e.target.classList.contains('st-path')) return;
      const p = this.github.pwd();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(p).then(() => this.info(`Copied path: ${p}`)).catch(() => {});
      } else this.info(`Path: ${p}`);
    });

    this.updateStatus();
  }


  async onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.busy && !this._pending) {
        const value = this.inputEl.value.trim();
        if (value) {
          this._queue.push(value);
          this.out(paint(C.gray, '   queued → ') + value);
        }
        this.inputEl.value = '';
        this.hideSuggest();
        return;
      }
      if (!this._pending) return;
      const value = this.inputEl.value;
      const { resolve, opts, question } = this._pending;
      this._pending = null;
      this.inputEl.type = 'text';
      this.inputEl.value = '';
      this._histIdx = -1;
      this.hideSuggest();
      this._tabState = null;
      const shown = (opts && opts.hidden && value)
        ? '•'.repeat(Math.min(value.length, 24)) : value;
      const stamp = this.prefs.timestamps ? paint(C.gray, `[${new Date().toTimeString().slice(0, 8)}] `) : '';
      this.beginGroup();
      this.out(`${stamp}${question}${shown}`, { newline: true });
      this.scroll(true);
      this.restorePrompt();
      resolve(value);
      return;
    }
    if (e.key === 'PageUp' || e.key === 'PageDown' ||
        (e.ctrlKey && (e.key === 'Home' || e.key === 'End'))) {
      e.preventDefault();
      const page = Math.max(80, this.outEl.clientHeight - 40);
      const up = e.key === 'PageUp' || e.key === 'Home';
      this.scrollBy(up ? -page : page);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!this._pending) await this.complete();
      return;
    }
    if (e.key === 'Escape') { this.hideSuggest(); this._tabState = null; return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.history.length) return;
      if (e.key === 'ArrowUp') {
        if (this._histIdx === -1) this._histIdx = this.history.length - 1;
        else this._histIdx = Math.max(0, this._histIdx - 1);
        this.inputEl.value = this.history[this._histIdx];
      } else if (this._histIdx !== -1) {
        this._histIdx = Math.min(this.history.length, this._histIdx + 1);
        this.inputEl.value = this._histIdx < this.history.length ? this.history[this._histIdx] : '';
      }
      this.hideSuggest();
      return;
    }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault(); this.outEl.innerHTML = ''; return;
    }
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      if (this._queue.length) {
        this.out(paint(C.yellow, `  ^C — cleared ${this._queue.length} queued command(s)`));
        this._queue = [];
      }
      if (this._pending) {
        const { resolve } = this._pending;
        this._pending = null;
        this.inputEl.type = 'text';
        this.inputEl.value = '';
        this.out('^C');
        this.restorePrompt();
        resolve(null);
      }
      this.hideSuggest();
      return;
    }
  }


  banner() {
    this.out(paint(C.magenta, `
   ██████╗   ██████╗ ██╗ ██╗
  ██╔═══██╗ ██╔════╝ ██║ ╚═╝
  ██║   ██║ ██║      ██║ ██╗
  ██║▄▄ ██║ ██║      ██║ ██║
  ╚██████╔╝ ╚██████╗ ██║ ██║
   ╚══▀▀═╝   ╚═════╝ ╚═╝ ╚═╝`));
    this.out(paint(C.gray, '  GitHub REST v3 + bash-like filesystem — QCli browser build\n'));
  }


  async authenticate() {
    if (this.username && this.token) return this.validateToken();
    const u = await this.ask(paint(C.cyan, 'GitHub username: '));
    if (u === null) throw new Error('aborted');
    this.username = String(u).trim();
    if (!this.username) throw new Error('A username is required.');
    const t = await this.askHidden(paint(C.cyan, 'Personal Access Token: '));
    if (t === null) throw new Error('aborted');
    this.token = String(t).trim();
    if (!this.token) throw new Error('A token is required.');
    await this.validateToken();
  }


  async validateToken() {
    this.github.setCredentials(this.username, this.token);
    const me = await this.github.request('GET', '/user');
    this.username = me.login;
    this.user = me;
    this.updateStatus();
  }


  ask(question, opts = {}) {
    return new Promise((resolve) => {
      if (this._pending) { resolve(null); return; }
      this.hideSuggest();
      this._tabState = null;
      this.promptEl.innerHTML = ansiToHtml(question);
      const prefill = opts.value == null ? '' : String(opts.value);
      this.inputEl.value = prefill;
      this.inputEl.placeholder = '';
      this.inputEl.type = opts.hidden ? 'password' : 'text';
      try {
        this.inputEl.focus();
        /* Prefilled answers are selected so Enter accepts and typing replaces. */
        if (prefill && opts.select !== false) this.inputEl.select();
      } catch (_) {}
      this._pending = { resolve, opts, question };
    });
  }


  askHidden(question) { return this.ask(question, { hidden: true }); }


  /* An answered question must not leave its label on screen — otherwise a long
     file operation looks like it is asking for a second commit message. */
  restorePrompt() {
    if (!this.promptEl) return;
    this.promptEl.innerHTML = ansiToHtml(this.busy ? paint(C.gray, '  … ') : this.promptStr());
  }


  /* Ctrl+X aborts whatever is happening: an open question, queued commands and
     the currently running command (which checks abortIfRequested()). */
  cancelOperation() {
    this._abortRequested = true;
    this.closePager();
    let cleared = 0;
    if (this._queue.length) {
      cleared = this._queue.length;
      this._queue = [];
    }
    if (this._pending) {
      const { resolve } = this._pending;
      this._pending = null;
      this.inputEl.type = 'text';
      this.inputEl.value = '';
      this.restorePrompt();
      resolve(null);
    }
    this.out(paint(C.yellow, `  ^X cancelled${cleared ? ` — cleared ${cleared} queued command(s)` : ''}`));
    this.scroll(true);
  }


  abortIfRequested() {
    if (this._abortRequested) throw new CancelError();
  }


  promptStr() {
    const p = this.github.pwd();
    return `${paint(C.magenta, 'gh')}${paint(C.gray, ':')}${paint(C.blue, p)}${paint(C.gray, '$ ')}`;
  }


  async loop() {
    if (!this.running) {
      this.out(paint(C.gray, 'Goodbye. Token discarded from memory.'));
      return;
    }

    let line;
    if (this._queue.length) {
      line = this._queue.shift();
      const stamp = this.prefs.timestamps ? paint(C.gray, `[${new Date().toTimeString().slice(0, 8)}] `) : '';
      this.beginGroup();
      this.out(`${stamp}${this.promptStr()}${paint(C.gray, line)}`, { newline: true });
      this.scroll(true);
    } else {
      try {
        line = await this.ask(this.promptStr());
      } catch (_) {
        this.running = false;
        return this.loop();
      }
    }

    if (line === null || line === undefined) {
      this.running = false;
      return this.loop();
    }

    try {
      await this.execute(line);
    } catch (e) {
      this.err(e instanceof ApiError ? e.message : (e && e.message) || String(e));
    }

    this.updateStatus();
    await new Promise((r) => setTimeout(r, 0));
    return this.loop();
  }


  scroll(force = false) {
    if (!this.outEl) return;
    if (force || this._stickToBottom) {
      this.outEl.scrollTop = this.outEl.scrollHeight;
      this._stickToBottom = true;
    }
    this.updateJump();
  }


  updateJump() {
    if (!this.outEl || !this.jumpEl) return;
    const distance = this.outEl.scrollHeight - this.outEl.scrollTop - this.outEl.clientHeight;
    this.jumpEl.hidden = distance <= 60;
  }


  /* Media changes the output height *after* insertion (on load), so an immediate
     scroll only reaches the caption. Re-scroll when every element in the preview
     has loaded, with a timer fallback for viewers that never fire `load`. */
  scrollToPreview(view) {
    if (!view) return;
    this.scroll(true);
    const media = [...view.querySelectorAll('img, iframe, video, audio')];
    if (!media.length) return;
    const finish = () => { this.scroll(true); setTimeout(() => this.scroll(true), 60); };
    let pending = media.length;
    const done = () => { if (--pending === 0) finish(); };
    for (const el of media) {
      let settled = false;
      const once = () => { if (!settled) { settled = true; done(); } };
      if (el.tagName === 'IMG' && el.complete) once();
      else { el.addEventListener('load', once, { once: true });
             el.addEventListener('error', once, { once: true }); }
    }
    setTimeout(finish, 900);
  }


  scrollBy(delta) {
    if (!this.outEl) return;
    const max = this.outEl.scrollHeight - this.outEl.clientHeight;
    this.outEl.scrollTop = Math.max(0, Math.min(max, this.outEl.scrollTop + delta));
  }


  /* Start a new visual group for one entered command and everything it prints.
     Older groups are dimmed slightly so the current command stands out. */
  beginGroup() {
    if (!this.outEl) return;
    if (this._groupEl) this._groupEl.classList.add('out-group--past');
    const group = document.createElement('div');
    group.className = 'out-group';
    const marker = document.createElement('span');
    marker.className = 'out-group-marker';
    group.appendChild(marker);
    this.outEl.appendChild(group);
    this._groupEl = group;
    this.scroll();
  }


  /* Turn plain http(s) URLs found in output text into real links. Runs on a
     detached container before insertion, so it never touches trusted markup
     produced by outHtml() or attributes of existing anchors. */
  linkifyTextNodes(root) {
    if (!root || typeof document.createTreeWalker !== 'function') return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    let node;
    while ((node = walker.nextNode())) texts.push(node);

    for (const n of texts) {
      const text = n.nodeValue;
      if (!text || !/https?:\/\//i.test(text)) continue;
      let p = n.parentElement;
      if (!p || p.closest('a, button, .term-suggest, .pref-modal, .editor-modal')) continue;

      const frag = document.createDocumentFragment();
      const re = /(https?:\/\/[^\s<>"'`]+)/gi;
      let m, last = 0, found = 0;
      while ((m = re.exec(text))) {
        let url = m[0], trail = '';
        /* Sentence punctuation is usually not part of the URL. */
        while (url && /[.,;:!?)\]]$/.test(url)) {
          trail = url.slice(-1) + trail;
          url = url.slice(0, -1);
        }
        if (!url) continue;
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const a = document.createElement('a');
        a.className = 'term-link';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = url;
        frag.appendChild(a);
        if (trail) frag.appendChild(document.createTextNode(trail));
        last = m.index + m[0].length;
        found++;
      }
      if (!found) continue;
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      n.parentNode.replaceChild(frag, n);
    }
  }


  appendRendered(html, linkify) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    if (linkify) this.linkifyTextNodes(tmp);
    const parent = this._groupEl || this.outEl;
    while (tmp.firstChild) parent.appendChild(tmp.firstChild);
    this.scroll();
  }


  out(text, opts = {}) {
    if (!this.outEl) return;
    const line = String(text) + (opts.newline === false ? '' : '\n');
    this.appendRendered(ansiToHtml(line), true);
  }


  outRaw(text, opts = {}) {
    if (!this.outEl) return;
    const line = String(text) + (opts.newline === false ? '' : '\n');
    this.appendRendered(escapeHtml(line), true);
  }


  /* Append trusted markup (built from escaped values) to the current group.
     Used by `show` to render images, PDFs and media inline in the terminal. */
  outHtml(html) {
    if (!this.outEl) return;
    (this._groupEl || this.outEl).insertAdjacentHTML('beforeend', html);
    this.scroll();
  }


  ok(m)   { this.out(paint(C.green, '✔ ') + m); }


  err(m)  { this._errCount++; this.out(paint(C.red, '✖ ' + m)); }


  info(m) { this.out(paint(C.gray,  '· ' + m)); }


  warn(m) { this.out(paint(C.yellow,'! ' + m)); }


  fmtMs(ms) { return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`; }


  busyStart(label) {
    if (!this.outEl) return;
    this._busyStack.push({
      el: this._busyEl, timer: this._busyTimer,
      t0: this._busyT0, label: this._busyLabel
    });

    const el = document.createElement('div');
    el.className = 'busy-line';
    const short = String(label).length > 72 ? String(label).slice(0, 69) + '...' : String(label);
    el.innerHTML = `<span class="spinner"></span><span class="busy-cmd">${escapeHtml(short)}</span>` +
                   `<span class="dots"></span><span class="busy-time">0ms</span>`;
    (this._groupEl || this.outEl).appendChild(el);
    this.scroll();

    this._busyEl = el;
    this._busyLabel = short;
    this._busyT0 = performance.now();
    this.busy = true;
    if (this.inputEl) this.inputEl.placeholder = 'type next command — it runs after this one…';
    if (this.promptEl) this.promptEl.innerHTML = ansiToHtml(paint(C.gray, '  … '));
    this._busyTimer = setInterval(() => {
      el.querySelector('.busy-time').textContent = this.fmtMs(performance.now() - this._busyT0);
    }, 100);
  }


  busyEnd(ok, ms) {
    if (this._busyTimer) { clearInterval(this._busyTimer); this._busyTimer = null; }
    if (this._groupEl) {
      this._groupEl.classList.remove('out-group--ok', 'out-group--fail');
      this._groupEl.classList.add(ok ? 'out-group--ok' : 'out-group--fail');
    }
    if (this._busyEl) {
      this._busyEl.classList.add(ok ? 'busy-ok' : 'busy-fail');
      this._busyEl.innerHTML =
        `<span class="busy-mark">${ok ? '✔' : '✖'}</span>` +
        `<span class="busy-cmd">${escapeHtml(this._busyLabel)}</span>` +
        `<span class="busy-time">${this.fmtMs(ms)}</span>`;
      this._busyEl = null;
    }

    const prev = this._busyStack.pop();
    if (prev && prev.el) {
      this._busyEl = prev.el; this._busyTimer = prev.timer;
      this._busyT0 = prev.t0; this._busyLabel = prev.label;
      this.busy = true;
      if (this.inputEl) this.inputEl.placeholder = 'type next command — it runs after this one…';
    } else {
      this.busy = false;
      if (this.inputEl) this.inputEl.placeholder = '';
      if (this.promptEl) this.promptEl.innerHTML = ansiToHtml(this.promptStr());
    }
    this.updateStatus();
  }


  hideSuggest() {
    if (this.suggestEl) this.suggestEl.hidden = true;
  }


  showSuggest(items, active) {
    if (!this.suggestEl) return;
    this.suggestEl.innerHTML = items
      .map((x, i) => `<div class="sug${i === active ? ' active' : ''}" data-i="${i}">${escapeHtml(x)}</div>`)
      .join('');
    this.suggestEl.hidden = false;
  }


  async complete() {
    const el = this.inputEl;
    const value = el.value;
    const cursor = el.selectionStart == null ? value.length : el.selectionStart;
    let start = cursor;
    while (start > 0 && !/\s/.test(value[start - 1])) start--;
    const frag = value.slice(start, cursor);
    const before = value.slice(0, start);
    let candidates = [];

    if (!before.trim()) {
      candidates = [...this.commands.keys()].filter((k) => k.startsWith(frag)).sort();
    } else if (this.repo) {
      const abs = frag.startsWith('/');
      const pieces = frag.split('/');
      const fragName = pieces.pop() || '';
      const parentStr = pieces.join('/');
      let parentSegs;
      if (abs) parentSegs = this.github.resolve('/' + parentStr);
      else if (parentStr) parentSegs = this.github.resolve(parentStr);
      else parentSegs = [...this.cwd];

      let data = null;
      try { data = await this.github.getContent(parentSegs.join('/')); } catch (_) { data = null; }
      if (Array.isArray(data)) {
        candidates = data
          .filter((e) => e.name.startsWith(fragName))
          .map((e) => e.name + (e.type === 'dir' ? '/' : ''))
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      }
    }

    if (!candidates.length) { this.hideSuggest(); this._tabState = null; return; }

    let st = this._tabState;
    if (!(st && st.before === before && st.candidates.includes(frag))) {
      st = { candidates, before, start, index: -1 };
      this._tabState = st;
    }
    st.index = (st.index + 1) % candidates.length;
    const picked = candidates[st.index];
    el.value = st.before + picked;
    const pos = el.value.length;
    try { el.setSelectionRange(pos, pos); } catch (_) {}

    if (candidates.length === 1) {
      el.value += ' ';
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {}
      this.hideSuggest();
      this._tabState = null;
    } else {
      this.showSuggest(candidates, st.index);
    }
  }


  updateStatus() {
    if (!this.statusEl) return;
    const user = this.username || '—';
    const repo = this.repo ? `${this.repo.owner}/${this.repo.name}` : '—';
    const branch = this.repo ? this.repo.branch : '—';
    this.statusEl.innerHTML =
      `<span class="st-key">user</span><span class="st-val">${escapeHtml(user)}</span>` +
      `<span class="st-key">repo</span><span class="st-val">${escapeHtml(repo)}</span>` +
      `<span class="st-key">branch</span><span class="st-val">${escapeHtml(branch)}</span>` +
      `<span class="st-key">path</span><span class="st-val st-path" title="Click to copy">${escapeHtml(this.github.pwd())}</span>` +
      `<span class="st-hint">Tab ▸ autocomplete · Enter ▸ run · ↑/↓ ▸ history · Ctrl+C ▸ cancel</span>` +
      `<button class="gear" title="Preferences (prefs)">⚙</button>`;
  }


  /* Mirror the selected repo + current folder into the URL hash.
     Disabled by default — the token would be visible in the address bar. */
  syncUrl() {
    if (!this.prefs.syncUrl || !this.username || !this.token) return;
    const enc = (s) => encodeURIComponent(String(s));
    let hash = `#${enc(this.username)}@${enc(this.token)}`;
    if (this.repo) {
      hash += `/${enc(this.repo.owner)}/${enc(this.repo.name)}`;
      const path = (this.cwd || []).map(enc).join('/');
      if (path) hash += `/${path}`;
    }
    try {
      history.replaceState(null, '', location.pathname + location.search + hash);
    } catch (_) {
      /* history API may be blocked on some file:// browsers — keep working */
    }
  }


  /* Remove credentials from the address bar when URL sync is turned off. */
  clearUrlHash() {
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch (_) {}
  }


  applyPrefs() {
    const root = document.documentElement.style;
    const theme = THEMES[this.prefs.theme] || THEMES[DEFAULT_PREFS.theme];
    for (const [k, v] of Object.entries(theme.vars)) root.setProperty(`--${k}`, v);
    for (const [k, v] of Object.entries(theme.ansi)) root.setProperty(`--ansi-${k}`, v);
    root.setProperty('color-scheme', theme.light ? 'light' : 'dark');
    root.setProperty('--font', FONTS[this.prefs.fontFamily] || this.prefs.fontFamily || FONTS.menlo);
    root.setProperty('--font-size', `${this.prefs.fontSize}px`);
    root.setProperty('--line-height', String(this.prefs.lineHeight));
    root.setProperty('--caret', this.prefs.caretColor || theme.vars.caret);
    root.setProperty('--outline', this.prefs.outlineColor || theme.vars.accent);

    document.body.classList.toggle('no-wrap', !this.prefs.wrap);
    document.body.classList.toggle('no-anim', !this.prefs.animations);
    document.body.classList.toggle('hide-status', !this.prefs.statusBar);
    document.body.classList.toggle('no-hints', !this.prefs.hints);
    this._stickToBottom = this.prefs.autoScroll;
    if (this.statusEl) this.updateStatus();
    savePrefs(this.prefs);
  }


  setPref(key, raw) {
    const boolKeys = ['wrap', 'animations', 'autoScroll', 'statusBar', 'banner', 'timestamps', 'hints', 'syncUrl', 'autolog'];
    const numKeys = ['fontSize', 'lineHeight', 'uploadConcurrency'];
    if (key === 'theme') {
      if (!THEMES[raw]) { this.err(`Unknown theme: ${raw}  (prefs list)`); return false; }
      this.prefs.theme = raw;
    } else if (key === 'fontFamily' || key === 'font') {
      this.prefs.fontFamily = FONTS[raw] ? raw : String(raw);
    } else if (key === 'caretColor' || key === 'outlineColor') {
      const label = key === 'caretColor' ? 'Caret' : 'Outline';
      if (/^(auto|theme|default)$/i.test(String(raw))) this.prefs[key] = null;
      else if (/^#[0-9a-f]{6}$/i.test(raw)) this.prefs[key] = raw;
      else { this.err(`${label} colour must be #rrggbb or auto`); return false; }
    } else if (boolKeys.includes(key)) {
      if (typeof raw === 'boolean') this.prefs[key] = raw;
      else if (/^(on|true|yes|1)$/i.test(raw)) this.prefs[key] = true;
      else if (/^(off|false|no|0)$/i.test(raw)) this.prefs[key] = false;
      else { this.err(`Use on/off for ${key}`); return false; }
    } else if (numKeys.includes(key)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) { this.err(`Invalid number for ${key}`); return false; }
      this.prefs[key] = key === 'fontSize'
        ? Math.max(10, Math.min(22, Math.round(n)))
        : key === 'uploadConcurrency'
          ? Math.max(1, Math.min(10, Math.round(n)))
          : Math.max(1.1, Math.min(2, Math.round(n * 100) / 100));
    } else {
      this.err(`Unknown preference: ${key}  (prefs list)`); return false;
    }
    this.applyPrefs();
    this.syncPrefsUI();
    if (key === 'syncUrl') {
      if (this.prefs.syncUrl) this.syncUrl();
      else this.clearUrlHash();   // hide the token as soon as sync is disabled
    }
    return true;
  }


  buildPrefsUI() {
    if (!this.prefEl) return;
    const themes = Object.entries(THEMES)
      .map(([id, t]) => `<option value="${id}">${escapeHtml(t.name)}</option>`).join('');
    const fonts = Object.entries(FONTS)
      .map(([id]) => `<option value="${id}">${escapeHtml(id)}</option>`).join('');
    const check = (key, label) =>
      `<label><input type="checkbox" data-key="${key}"> ${label}</label>`;

    this.prefEl.innerHTML = `
      <div class="pref-card">
        <div class="pref-head"><strong>⚙ Terminal preferences</strong><button class="pref-close" title="Close">×</button></div>
        <div class="pref-body">
          <label>Theme<select data-key="theme">${themes}</select></label>
          <div class="pref-row">
            <label>Font<select data-key="fontFamily">${fonts}</select></label>
            <label>Custom font family<input type="text" data-key="fontFamilyCustom" placeholder="'Fira Code', monospace"></label>
          </div>
          <div class="pref-row">
            <label>Font size <span data-val="fontSize"></span><input type="range" data-key="fontSize" min="10" max="22" step="1"></label>
            <label>Line height <span data-val="lineHeight"></span><input type="range" data-key="lineHeight" min="1.1" max="2" step="0.05"></label>
          </div>
          <div class="pref-row">
            <label>Caret colour<input type="color" data-key="caretColor"></label>
            <label>Outline colour<input type="color" data-key="outlineColor"></label>
          </div>
          <label>Upload parallelism <span data-val="uploadConcurrency"></span><input type="range" data-key="uploadConcurrency" min="1" max="10" step="1"></label>
          <div class="pref-checks">
            ${check('wrap', 'Word wrap')}
            ${check('animations', 'Busy animation')}
            ${check('autoScroll', 'Auto-scroll')}
            ${check('statusBar', 'Status bar')}
            ${check('banner', 'Startup banner')}
            ${check('timestamps', 'Timestamps')}
            ${check('hints', 'Key hints')}
            ${check('autolog', 'Auto-list after cd')}
          </div>
          <div class="pref-sync">
            ${check('syncUrl', 'Sync repo / folder to URL')}
            <div class="pref-warn">Off by default — turning this on puts your token in the address bar. Turning it off removes it.</div>
          </div>
          <div class="pref-note">Saved in localStorage. You can also use: prefs list / prefs set &lt;key&gt; &lt;value&gt; / prefs reset.</div>
        </div>
        <div class="pref-foot"><span class="pref-note">Changes apply instantly</span><span><button class="pref-btn pref-reset">Reset</button> <button class="pref-btn pref-close">Done</button></span></div>
      </div>`;

    this.prefEl.addEventListener('input', (e) => this.onPrefInput(e));
    this.prefEl.addEventListener('change', (e) => this.onPrefInput(e));
    this.prefEl.addEventListener('click', (e) => {
      if (e.target.closest('.pref-close')) this.closePrefs();
      else if (e.target.closest('.pref-reset')) {
        this.prefs = { ...DEFAULT_PREFS };
        this.applyPrefs(); this.syncPrefsUI(); this.clearUrlHash();
        this.ok('Preferences reset to defaults.');
      }
    });
    this.syncPrefsUI();
  }


  onPrefInput(e) {
    const key = e.target.dataset && e.target.dataset.key;
    if (!key) return;
    if (key === 'fontFamilyCustom') {
      const v = e.target.value.trim();
      this.setPref('fontFamily', v || 'menlo');
      return;
    }
    if (e.target.type === 'checkbox') this.setPref(key, e.target.checked);
    else if (e.target.type === 'range') this.setPref(key, e.target.value);
    else this.setPref(key, e.target.value);
  }


  syncPrefsUI() {
    if (!this.prefEl) return;
    for (const el of this.prefEl.querySelectorAll('[data-key]')) {
      const key = el.dataset.key;
      if (key === 'fontFamilyCustom') {
        if (!FONTS[this.prefs.fontFamily] && el.value !== this.prefs.fontFamily) {
          el.value = this.prefs.fontFamily;   // don't reset the caret while typing
        }
      } else if (el.type === 'checkbox') el.checked = !!this.prefs[key];
      else if (el.type === 'range') {
        el.value = this.prefs[key];
        const label = this.prefEl.querySelector(`[data-val="${key}"]`);
        if (label) label.textContent = key === 'fontSize' ? `${this.prefs[key]}px`
          : key === 'uploadConcurrency' ? `${this.prefs[key]} files`
          : this.prefs[key].toFixed(2);
      } else if (el.type === 'color') {
        const theme = THEMES[this.prefs.theme] || THEMES[DEFAULT_PREFS.theme];
        el.value = this.prefs[key] || (key === 'caretColor' ? theme.vars.caret : theme.vars.accent);
      } else el.value = this.prefs[key];
    }
  }


  openPrefs() {
    if (!this.prefEl) return;
    this.syncPrefsUI();
    this.prefEl.hidden = false;
    const first = this.prefEl.querySelector('select');
    if (first) first.focus();
  }


  closePrefs() {
    if (this.prefEl) this.prefEl.hidden = true;
    if (this.inputEl) this.inputEl.focus();
  }


  /* ══════════════════════════════════════════════════════════════════════
   *  nano-like in-terminal editor
   * ══════════════════════════════════════════════════════════════════════ */

  buildEditorUI() {
    if (!this.editorEl) return;
    this.editorEl.innerHTML = `
      <div class="editor-card">
        <div class="editor-head">
          <strong>QCli Editor</strong>
          <span class="editor-file"></span>
          <button class="editor-x" title="Close (Ctrl+X)">×</button>
        </div>
        <div class="editor-body">
          <div class="editor-gutter" aria-hidden="true">1</div>
          <textarea class="editor-area" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea>
        </div>
        <div class="editor-save" hidden>
          <input class="editor-filename" type="text" placeholder="File name (e.g. notes.txt)" aria-label="File name" hidden>
          <input class="editor-msg" type="text" placeholder="Commit message" aria-label="Commit message">
          <div class="editor-save-actions">
            <button class="editor-do">Save ^O</button>
            <button class="editor-cancel">Cancel</button>
          </div>
        </div>
        <div class="editor-status">
          <span class="editor-hint">^O Save  ·  ^X Close  ·  Tab Indent  ·  Esc Close</span>
          <span class="editor-pos">Ln 1, Col 1</span>
        </div>
      </div>`;

    this.editorArea    = this.editorEl.querySelector('.editor-area');
    this.editorGutter  = this.editorEl.querySelector('.editor-gutter');
    this.editorFileEl  = this.editorEl.querySelector('.editor-file');
    this.editorSaveBar = this.editorEl.querySelector('.editor-save');
    this.editorNameEl  = this.editorEl.querySelector('.editor-filename');
    this.editorMsgEl   = this.editorEl.querySelector('.editor-msg');
    this.editorPosEl   = this.editorEl.querySelector('.editor-pos');
    this.editorHintEl  = this.editorEl.querySelector('.editor-hint');

    this.editorArea.addEventListener('input', () => this.editorRefresh());
    this.editorArea.addEventListener('scroll', () => {
      this.editorGutter.scrollTop = this.editorArea.scrollTop;
    });
    this.editorArea.addEventListener('keydown', (e) => this.onEditorKey(e));
    this.editorEl.querySelector('.editor-x').addEventListener('click', () => this.closeEditor());
    this.editorEl.querySelector('.editor-cancel').addEventListener('click', () => this.hideEditorSave());
    this.editorEl.querySelector('.editor-do').addEventListener('click', () => this.saveEditor());
    this.editorNameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.editorMsgEl.focus(); }
    });
    this.editorNameEl.addEventListener('input', () => {
      if (this._autoEditorMsg) this.editorMsgEl.value = `Create ${this.editorNameEl.value.trim() || 'new file'}`;
    });
    this.editorMsgEl.addEventListener('input', () => { this._autoEditorMsg = false; });
    this.editorMsgEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.saveEditor(); }
    });
  }


  editorRefresh() {
    if (!this.editorArea) return;
    const lines = this.editorArea.value.split('\n').length;
    this.editorGutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    this.editorGutter.scrollTop = this.editorArea.scrollTop;
    const pos = this.editorArea.selectionStart;
    const before = this.editorArea.value.slice(0, pos);
    this.editorPosEl.textContent =
      `Ln ${before.split('\n').length}, Col ${pos - before.lastIndexOf('\n')}`;
    this._editorDiscardArmed = false;
  }


  editorIsDirty() {
    return !!this.editorArea && this.editorArea.value !== this._editorOriginal;
  }


  editorHint(text) {
    if (!this.editorHintEl) return;
    this.editorHintEl.textContent = text;
    clearTimeout(this._editorHintTimer);
    this._editorHintTimer = setTimeout(() => {
      this.editorHintEl.textContent = '^O Save  ·  ^X Close  ·  Tab Indent  ·  Esc Close';
    }, 3500);
  }


  /* Live status table for file uploads. */
  uploadTable(items) {
    const wrap = document.createElement('div');
    wrap.className = 'up-table';
    const totalBytes = items.reduce((n, it) => n + (it.size || 0), 0);
    const head = document.createElement('div');
    head.className = 'up-head';
    head.innerHTML =
      `<span>FILE ${items.length}</span>` +
      `<span>SIZE ${(totalBytes / 1048576).toFixed(2)}MB</span>` +
      `<span class="up-head-status">STATUS 0/${items.length}</span>`;
    wrap.appendChild(head);
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'up-row';
      row.dataset.i = String(i);
      for (const [cls, text] of [
        ['up-file', it.name], ['up-size', it.mb], ['up-status up-pending', 'pending']
      ]) {
        const cell = document.createElement('span');
        cell.className = cls; cell.textContent = text;
        row.appendChild(cell);
      }
      wrap.appendChild(row);
    });
    (this._groupEl || this.outEl).appendChild(wrap);
    this.scroll(true);
    return wrap;
  }


  setUploadStatus(wrap, i, text, kind) {
    const cell = wrap.querySelector(`.up-row[data-i="${i}"] .up-status`);
    if (!cell) return;
    cell.textContent = text;
    cell.className = `up-status up-${kind || 'pending'}`;
    const total = wrap.querySelectorAll('.up-row').length;
    const done = wrap.querySelectorAll('.up-status.up-ok').length;
    const status = wrap.querySelector('.up-head-status');
    if (status) status.textContent = `STATUS ${done}/${total}`;
  }


  /* Chromium exposes selected directories as webkitEntries. input.files can be
     incomplete in some Chromium forks (e.g. only top-level files), so walk the
     entries ourselves to get every descendant with its relative path. */
  async walkDirectoryEntries(entries) {
    const out = [];
    const readAll = (reader) => new Promise((resolve, reject) => {
      const acc = [];
      const next = () => reader.readEntries((batch) => {
        if (!batch || !batch.length) { resolve(acc); return; }
        acc.push(...batch);
        next();
      }, reject);
      next();
    });
    const fileOf = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));
    const walk = async (reader, prefix) => {
      for (const e of await readAll(reader)) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isFile) out.push({ file: await fileOf(e), rel });
        else if (e.isDirectory) await walk(e.createReader(), rel);
      }
    };
    for (const e of entries) {
      if (e.isFile) out.push({ file: await fileOf(e), rel: e.name });
      else if (e.isDirectory) await walk(e.createReader(), e.name);
    }
    return out;
  }


  /* Folder variant: same flow, but the picker selects directories. */
  async cmdPutDir(args) { return this.cmdPut(args, true); }


  /* Upload one or more local files chosen in the browser's file picker.
     With -r / --dir (or the putdir alias) the picker selects whole folders and
     keeps their internal paths. One prompt for the message, parallel commits.
     `.git` directories are skipped in folder uploads. */
  async cmdPut(args, recursive) {
    this.github.needRepo();
    const av = args || [];
    const isDir = !!recursive || av.some((x) => /^(-r|--dir|--folder|-d)$/i.test(x));
    let concurrency = Math.max(1, Math.min(10, Number(this.prefs.uploadConcurrency) || 3));
    const paths = [];
    for (let i = 0; i < av.length; i++) {
      const a = av[i];
      if (/^(-r|--dir|--folder|-d)$/i.test(a)) continue;
      let n = null;
      const eq = /^(?:-j|--jobs|--concurrency)=(\d+)$/i.exec(a);
      if (eq) n = eq[1];
      else if (/^-j\d+$/i.test(a)) n = a.slice(2);
      else if (/^(-j|--jobs|--concurrency)$/i.test(a)) n = av[++i];
      if (n !== null) {
        const num = Number(n);
        if (!Number.isFinite(num) || num < 1) {
          this.err('Upload limit must be 1-10  (e.g. put -j 3)'); return;
        }
        concurrency = Math.max(1, Math.min(10, Math.round(num)));
        continue;
      }
      paths.push(a);
    }
    const dir = (await this.resolveNumericPath(paths.join(' '))).join('/');
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.style.display = 'none';
    if (isDir) { input.webkitdirectory = true; input.setAttribute('webkitdirectory', ''); }
    document.body.appendChild(input);

    const picked = await new Promise((resolve) => {
      const done = (files, entries) => resolve({ files, entries });
      input.addEventListener('change', () => done(
        [...(input.files || [])], [...(input.webkitEntries || [])]
      ), { once: true });
      input.addEventListener('cancel', () => done([], []), { once: true });
      try { input.click(); }
      catch (e) { this.err(`Could not open file picker: ${e.message}`); done([], []); }
    });
    input.remove();
    let selected = picked.files.map((file) => ({
      file, rel: file.webkitRelativePath || file.name
    }));
    if (isDir && picked.entries.length) {
      try {
        const walked = await this.walkDirectoryEntries(picked.entries);
        if (walked.length) selected = walked;
      } catch (e) {
        this.warn(`Could not walk folder entries: ${(e && e.message) || e}`);
      }
    }
    if (!selected.length) { this.info('Upload cancelled — no files selected.'); return; }

    this.info(`Reading ${selected.length} local file${selected.length === 1 ? '' : 's'}${isDir ? ' from folder(s)' : ''}…`);
    const changes = [];
    for (const { file, rel: rawRel } of selected) {
      this.abortIfRequested();
      let rel = String(rawRel).replace(/\\/g, '/');
      /* Never upload repository internals from a selected folder. */
      if (isDir && rel.split('/').some((s) => s.toLowerCase() === '.git')) continue;
      if (isDir) {
        const parts = rel.split('/');
        if (parts.length > 1) parts.shift(); /* drop the selected root folder */
        rel = parts.join('/');
      }
      rel = rel.split('/').filter((s) => s && s !== '.' && s !== '..').join('/');
      if (!rel) continue;
      const path = dir ? `${dir}/${rel}` : rel;
      let buf;
      if (file.arrayBuffer) {
        buf = await file.arrayBuffer();
      } else {
        buf = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result); r.onerror = () => rej(r.error);
          r.readAsArrayBuffer(file);
        });
      }
      const bytes = new Uint8Array(buf);
      changes.push({ path, rel, base64: window.bytesToBase64(bytes), size: bytes.length });
    }
    if (!changes.length) {
      this.info('No files to upload — nothing left after filtering (e.g. only .git contents).');
      return;
    }

    /* Ask exactly once — never through promptCommit() here, so a queued
       message or the shell loop cannot trigger a second commit question. */
    let message;
    if (this.pendingMessage) {
      message = this.pendingMessage; this.pendingMessage = null;
      this.info(`Using queued message: "${message}"`);
    } else {
      const noun = changes.length === 1 ? 'file' : 'files';
      const where = dir ? ` to ${dir}` : '';
      message = await this.ask(paint(C.cyan, 'Commit message: '), {
        value: `Upload ${changes.length} ${noun}${where}`
      });
    }
    if (message === null) { this.info('Upload cancelled — no commit message.'); return; }
    message = String(message).trim() || `Upload ${changes.length} file${changes.length === 1 ? '' : 's'}`;

    const items = changes.map((ch) => ({
      ...ch,
      name: ch.rel || ch.path.split('/').pop(),
      mb: (ch.size / 1048576).toFixed(3) + ' MB'
    }));
    const table = this.uploadTable(items);
    this.info(`Uploading ${concurrency} file${concurrency === 1 ? '' : 's'} at a time.`);

    /* A bounded worker pool: only `concurrency` files are in flight at once.
       GitHub commits are serialized in repo.js, so this limit controls how
       many files are prepared/reported concurrently without 409 collisions. */
    const uploadOne = async (it, i) => {
      this.abortIfRequested();
      this.setUploadStatus(table, i, 'uploading', 'uploading');
      let lastErr = null, downloadUrl = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const saved = await this.github.commit([{ path: it.path, base64: it.base64 }], message);
          this.abortIfRequested();
          /* The contents API returns the authoritative download_url; fall back
             to a constructed raw URL only when that field is missing. */
          downloadUrl = (saved && saved.downloadUrl) || this.github.rawUrl(it.path);
          lastErr = null;
          break;
        } catch (e) {
          if (e instanceof CancelError) throw e;
          lastErr = e;
          if (!(e && e.status === 409) || attempt === 9) break;
          this.setUploadStatus(table, i, 'retrying', 'uploading');
          await new Promise((r) => setTimeout(r, 80 + Math.floor(Math.random() * 140) + attempt * 80));
          this.abortIfRequested();
        }
      }
      if (lastErr) {
        this.setUploadStatus(table, i, 'failed', 'fail');
        return { it, i, error: lastErr };
      }
      this.setUploadStatus(table, i, 'uploaded', 'ok');
      if (downloadUrl) {
        this.out(paint(C.green, '  ✔ ') + paint(C.gray, it.name + ' → ') +
                 paint(C.blue, downloadUrl));
      }
      return null;
    };

    /* Run only `concurrency` files at a time, then — once the whole batch is
       finished — offer to re-upload any that failed. Repeat until none fail or
       the user declines. Files stay in memory, so no picker interaction. */
    const runPool = async (queue, limit) => {
      const results = new Array(queue.length);
      let next = 0;
      const worker = async () => {
        while (true) {
          if (this._abortRequested) throw new CancelError();
          const idx = next++;
          if (idx >= queue.length) return;
          const { it, i } = queue[idx];
          results[idx] = await uploadOne(it, i);
        }
      };
      const count = Math.min(limit, queue.length);
      await Promise.all(Array.from({ length: count }, worker));
      return results.filter(Boolean);
    };

    let queue = items.map((it, i) => ({ it, i }));
    let failed = [];
    while (queue.length) {
      this.abortIfRequested();
      failed = await runPool(queue, concurrency);
      this.abortIfRequested();
      if (!failed.length) break;
      const noun = failed.length === 1 ? 'file' : 'files';
      const again = await this.confirm(`Retry ${failed.length} failed ${noun}?`);
      if (!again) break;
      for (const f of failed) this.setUploadStatus(table, f.i, 'pending', 'pending');
      queue = failed.map((f) => ({ it: f.it, i: f.i }));
    }
    const done = items.length - failed.length;
    if (done) this.ok(`${done}/${items.length} file${items.length === 1 ? '' : 's'} uploaded`);
    for (const f of failed) {
      this.err(`Upload failed — ${f.it.name}: ${(f.error && f.error.message) || f.error}`);
    }
  }


  /* Download a repository file into the browser's normal download folder. */
  async cmdDownload(args) {
    this.github.needRepo();
    let raw = (args || []).filter((a) => !a.startsWith('-')).join(' ').trim();
    if (!raw) return this.err('Usage: download <file> [as <name>]');
    let target = raw, saveName = null;
    const rename = raw.match(/^(.*?)\s+as\s+(.+)$/i);
    if (rename) { target = rename[1].trim(); saveName = rename[2].trim(); }
    const path = await this.resolvePath(target);
    const data = await this.github.getContent(path);
    if (!data) return this.err(`download: no such file: ${target}`);
    if (Array.isArray(data)) return this.err(`download: ${target} is a directory`);

    let b64 = data.content || '';
    if (!b64) {
      const blob = await this.github.request('GET', `${this.github.rp()}/git/blobs/${data.sha}`);
      b64 = blob.content || '';
    }
    const bytes = window.base64ToBytes(b64);
    const name = saveName || path.split('/').pop() || 'download';
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url; link.download = name; link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.ok(`Downloaded ${path} → ${name} (${bytes.length} bytes)`);
  }


  async cmdEditor(args) {
    this.github.needRepo();
    const raw = (args || []).join(' ').trim();
    const path = raw ? await this.resolvePath(raw) : null;
    let initial = '';
    if (path) {
      const data = await this.github.getContent(path);
      if (Array.isArray(data)) return this.err(`editor: ${raw} is a directory`);
      if (data) initial = (await this.github.readFile(path)).content;
    }
    this._editorPath = path;
    this._editorOriginal = initial;
    this._editorDiscardArmed = false;
    this.editorFileEl.textContent = path || '(new file)';
    this.editorArea.value = initial;
    this.editorSaveBar.hidden = true;
    this.editorEl.hidden = false;
    this.editorRefresh();
    this.editorArea.focus();
    try { this.editorArea.setSelectionRange(0, 0); } catch (_) {}
  }


  onEditorKey(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 's')) {
      e.preventDefault(); this.showEditorSave(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      e.preventDefault(); this.closeEditor(); return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const a = this.editorArea, s = a.selectionStart, end = a.selectionEnd;
      a.value = a.value.slice(0, s) + '  ' + a.value.slice(end);
      a.selectionStart = a.selectionEnd = s + 2;
      this.editorRefresh();
    }
  }


  showEditorSave() {
    this.editorNameEl.hidden = !!this._editorPath;
    if (!this._editorPath) this.editorNameEl.value = '';
    this._autoEditorMsg = !this.pendingMessage;
    const target = this._editorPath || this.editorNameEl.value.trim();
    this.editorMsgEl.value = this.pendingMessage ||
      (this._editorPath ? `Update ${target}` : `Create ${target || 'new file'}`);
    this.editorSaveBar.hidden = false;
    (this._editorPath ? this.editorMsgEl : this.editorNameEl).focus();
  }


  hideEditorSave() {
    this.editorSaveBar.hidden = true;
    this.editorArea.focus();
  }


  async saveEditor() {
    if (this._editorSaving) return;
    const isNew = !this._editorPath;
    let path = this._editorPath;
    if (!path) {
      const name = this.editorNameEl.value.trim();
      if (!name) { this.editorHint('Enter a filename to save.'); this.editorNameEl.focus(); return; }
      path = this.github.resolve(name).join('/');
    }
    const content = this.editorArea.value;
    const message = this.pendingMessage || this.editorMsgEl.value.trim() ||
                    `${isNew ? 'Create' : 'Update'} ${path}`;
    this._editorSaving = true;
    try {
      await this.commit([{ path, content }], message);
      if (this.pendingMessage) this.pendingMessage = null;
      this._editorPath = path;
      this._editorOriginal = content;
      this.editorFileEl.textContent = path;
      this.editorSaveBar.hidden = true;
      this.editorHint(`Saved ${path}`);
      this.editorArea.focus();
    } catch (e) {
      this.editorHint(`Save failed: ${(e && e.message) || e}`);
    } finally {
      this._editorSaving = false;
    }
  }


  closeEditor() {
    if (!this.editorEl || this.editorEl.hidden) return;
    if (this.editorIsDirty() && !this._editorDiscardArmed) {
      this._editorDiscardArmed = true;
      this.editorHint('Unsaved changes — press ^X / Esc again to discard.');
      return;
    }
    this.editorEl.hidden = true;
    this.editorSaveBar.hidden = true;
    this._editorDiscardArmed = false;
    this._editorPath = null;
    this._editorOriginal = '';
    if (this.inputEl) this.inputEl.focus();
  }


  /* opts.highlight(row) may return true to emphasise every cell in that row. */
  tableWidths(rows, cols) {
    const val = (r, c) => String(c.fmt ? c.fmt(r) : (r[c.key] == null ? '' : r[c.key]));
    return cols.map((c) => Math.max(c.label.length, ...rows.map((r) => val(r, c).length)));
  }


  table(rows, cols, opts = {}) {
    if (!Array.isArray(rows) || rows.length === 0) { this.info('(empty)'); return; }
    const val = (r, c) => {
      const v = c.fmt ? c.fmt(r) : (r[c.key] == null ? '' : r[c.key]);
      return String(v);
    };
    /* opts.widths keeps column alignment steady across pager pages. */
    const widths = opts.widths || this.tableWidths(rows, cols);
    const pad = (cells) => cells.map((v, i) => v.padEnd(widths[i]));
    const join = (cells) => cells.join('  ');
    this.out(paint(C.bold, join(pad(cols.map((c) => c.label)))));
    this.out(paint(C.gray, widths.map((w) => '─'.repeat(w)).join('  ')));
    for (const r of rows) {
      const cells = pad(cols.map((c) => val(r, c)));
      this.out(opts.highlight && opts.highlight(r)
        ? join(cells.map((v) => paint(C.yellow + C.bold, v)))
        : join(cells));
    }
  }


  /* ── Interactive output pager ──────────────────────────────────────────
     Renders `size` rows at a time. Space shows the next page, q quits.
     Only one pager is ever active; starting another closes the old one. */
  showPager(opts) {
    this.closePager();
    if (!opts || !opts.total) return;
    const st = {
      total: opts.total, size: opts.size || 10, from: 0,
      footer: null, render: opts.render, label: opts.label || 'entries'
    };
    this._pager = st;
    this._pagerHandler = (e) => this._onPagerKey(e, st);
    document.addEventListener('keydown', this._pagerHandler, true);
    this._renderPagerPage(st);
  }


  _renderPagerPage(st) {
    if (this._pager !== st) return;
    if (st.footer && st.footer.parentNode) st.footer.remove();
    const from = st.from, to = Math.min(st.total, from + st.size);
    st.render(from, to);

    const foot = document.createElement('div');
    foot.className = 'pager-foot';
    const atEnd = to >= st.total;
    const msg = atEnd
      ? `  ── end of ${st.label} (${st.total}) ──  [q] quit`
      : `  [space] next ${st.size}  ·  [q] quit  ·  ${to}/${st.total} ${st.label}`;
    foot.innerHTML = ansiToHtml(paint(C.cyan, msg));
    (this._groupEl || this.outEl).appendChild(foot);
    st.footer = foot;
    st._atEnd = atEnd;
    st._shownEnd = false;
    this.scroll(true);
  }


  _onPagerKey(e, st) {
    if (this._pager !== st) return;
    /* Ctrl+X is handled by the global handler (it also closes this pager). */
    if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) return;
    const isSpace = e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space';
    if (isSpace) {
      e.preventDefault();
      e.stopPropagation();
      if (st.from + st.size >= st.total) {
        if (!st._shownEnd) {
          st._shownEnd = true;
          if (st.footer) st.footer.innerHTML = ansiToHtml(
            paint(C.yellow, `  ── end of ${st.total} ${st.label} ──  [q] quit`));
        }
        return;
      }
      st.from += st.size;
      this._renderPagerPage(st);
      return;
    }
    if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      e.stopPropagation();
      this.closePager();
    }
  }


  closePager() {
    if (!this._pager) return;
    if (this._pager.footer && this._pager.footer.parentNode) this._pager.footer.remove();
    if (this._pagerHandler) document.removeEventListener('keydown', this._pagerHandler, true);
    this._pager = null;
    this._pagerHandler = null;
    if (this.promptEl && !this.busy) this.promptEl.innerHTML = ansiToHtml(this.promptStr());
  }


  kv(obj) {
    const keys = Object.keys(obj);
    const w = Math.max(...keys.map((k) => k.length));
    for (const k of keys) this.out(`${paint(C.cyan, k.padEnd(w))}  ${obj[k]}`);
  }


  async promptCommit(suggested) {
    if (this.pendingMessage) {
      const m = this.pendingMessage; this.pendingMessage = null;
      this.info(`Using queued message: "${m}"`);
      return m;
    }
    const ans = await this.ask(paint(C.cyan, 'Commit message: '), { value: suggested || '' });
    if (ans === null) return null;
    return String(ans).trim() || suggested || 'Update via QCli';
  }


  printDiff(changes) {
    this.out(paint(C.gray, '── changes ──────────────────────────────'));
    for (const ch of changes) {
      if (ch.content === null) {
        this.out(paint(C.red, `  - ${ch.path}`) + paint(C.gray, '  (deleted)'));
      } else if (ch.sha) {
        this.out(paint(C.green, `  + ${ch.path}`) + paint(C.gray, '  (copied blob)'));
      } else if (typeof ch.content === 'string') {
        const lines = ch.content === '' ? 0 : ch.content.split('\n').length - (ch.content.endsWith('\n') ? 1 : 0);
        this.out(paint(C.green, `  + ${ch.path}`) + paint(C.gray, `  (${lines} line${lines === 1 ? '' : 's'})`));
      } else {
        const size = ch.size != null ? `${ch.size} bytes` : 'binary';
        this.out(paint(C.green, `  + ${ch.path}`) + paint(C.gray, `  (${size})`));
      }
    }
    this.out(paint(C.gray, '─────────────────────────────────────────'));
  }


  tokenize(s) {
    const out = [];
    let cur = '', quote = null, touched = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) {
        if (ch === quote) quote = null;
        else if (ch === '\\' && quote === '"' && i + 1 < s.length) cur += s[++i];
        else cur += ch;
      } else if (ch === '"' || ch === "'") { quote = ch; touched = true; }
      else if (ch === ' ' || ch === '\t') { if (cur || touched) { out.push(cur); cur = ''; touched = false; } }
      else cur += ch;
    }
    if (cur || touched) out.push(cur);
    return out;
  }


  splitChain(s) {
    const parts = [];
    let cur = '', quote = null, nextOp = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) {
        cur += ch;
        if (ch === quote && s[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '&' && s[i + 1] === '&') {
        parts.push({ text: cur, nextOp: '&&' }); cur = ''; i++; continue;
      }
      if (ch === ';') { parts.push({ text: cur, nextOp: ';' }); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push({ text: cur, nextOp: null });
    return parts.filter((p) => p.text.trim());
  }


  extractMsg(args) {
    const out = []; let msg = null;
    for (let i = 0; i < args.length; i++) {
      if ((args[i] === '-m' || args[i] === '--message') && i + 1 < args.length) msg = args[++i];
      else out.push(args[i]);
    }
    return { args: out, msg };
  }


  async confirm(q) {
    const a = await this.ask(paint(C.yellow, `${q} (y/N) `));
    return a !== null && /^y(es)?$/i.test(String(a).trim());
  }


  async execute(line) {
    const trimmed = String(line).trim();
    if (!trimmed) return;
    this.closePager();              /* a new command ends any active pager */
    this._abortRequested = false;   /* a fresh command starts with a clean slate */
    this.history.push(trimmed);
    const parts = this.splitChain(trimmed);
    let lastOk = true;
    for (let i = 0; i < parts.length; i++) {
      if (this._abortRequested) break;   /* Ctrl+X stops the rest of the chain */
      const part = parts[i];
      if (i > 0) {
        const op = parts[i - 1].nextOp;
        if (op === '&&' && !lastOk) {
          this.warn(`Skipped because previous command failed: ${part.text.trim()}`);
          continue;
        }
      }
      lastOk = await this.executeSingle(part.text);
    }
  }


  async executeSingle(text) {
    const t0 = performance.now();
    this.busyStart(text.trim());
    let ok = true;
    const errBefore = this._errCount;
    const prevFresh = this.github.forceFresh;
    try {
      let argv = this.tokenize(text);
      const expanded = [];
      for (const t of argv) {
        const m = /^(>>?)(.*)$/.exec(t);
        if (m) { expanded.push(m[1]); if (m[2]) expanded.push(m[2]); }
        else expanded.push(t);
      }
      argv = expanded;
      /* -f / --fresh / --refresh forces no-store for this command's API calls
         (and also refreshes the local directory listing cache in ls/info). */
      this.github.forceFresh = argv.slice(1).some((a) => /^(-f|--fresh|--refresh)$/i.test(a));
      const cmd = this.commands.get(argv[0]);
      if (!cmd) {
        /* A bare file name, path, or ls index is shorthand for `info`. */
        const spec = argv[0] || '';
        const looksLikeFile = /^\d+$/.test(spec) || spec.includes('/') || spec.includes('.');
        if (argv.length === 1 && !spec.startsWith('-') && looksLikeFile &&
            await this.cmdInfo(argv, true)) {
          /* handled */
        } else {
          this.err(`command not found: ${spec}  (type "help")`);
        }
      } else await cmd.run(argv.slice(1));
      if (this._errCount > errBefore) ok = false;
    } catch (e) {
      ok = false;
      if (!(e instanceof CancelError)) {
        this.err(e instanceof ApiError ? e.message : (e && e.message) || String(e));
      }
    } finally {
      this.github.forceFresh = prevFresh;
      this.busyEnd(ok, performance.now() - t0);
    }
    return ok;
  }


  buildCommands() {
    const m = new Map();
    const add = (name, usage, desc, fn) => m.set(name, { usage, desc, run: fn.bind(this) });

    add('help',    'help',                     'Show every command with descriptions', this.cmdHelp);
    add('?',       '?',                        'Alias for help',                       this.cmdHelp);
    add('clear',   'clear',                    'Clear the terminal screen',            this.cmdClear);
    add('cls',     'cls',                      'Alias for clear',                      this.cmdClear);
    add('history', 'history',                  'Show command history',                 this.cmdHistory);
    add('exit',    'exit | quit',              'Log out and exit',                     this.cmdExit);
    add('quit',    'exit | quit',              'Log out and exit',                     this.cmdExit);
    add('commit',  'commit -m "msg"',          'Queue a message for the next mutation', this.cmdCommit);
    add('sleep',   'sleep <sec>',              'Wait N seconds (shows the await animation)', this.cmdSleep);
    add('demo',    'demo',                     'Run a short sequential demo',          this.cmdDemo);
    add('prefs',   'prefs [list|set|reset|export|theme <id>]', 'Open / change terminal preferences', this.cmdPrefs);
    add('pref',    'pref ...',                 'Alias for prefs',                      this.cmdPrefs);
    add('settings','settings',                 'Alias for prefs',                      this.cmdPrefs);

    add('repos',   'repos [--all]',            'List your repositories',               this.cmdRepos);
    add('select',  'select <repo|owner/repo>', 'Set the active repository',            this.cmdSelect);
    add('branch',  'branch [name]',            'Show or switch the active branch',     this.cmdBranch);
    add('open',    'open [path]',              'Open the repo/path on GitHub in a tab', this.cmdOpen);
    add('repo',    'repo <sub> [args]',        'info|create|delete|fork|star|unstar|watch|unwatch|branches|tags|releases|collaborators|issues|pulls|commits|contributors|languages|topics|license', this.cmdRepo);
    add('commits', 'commits',                  'List recent commits in the active repo', this.cmdCommits);
    add('log',     'log',                      'Alias for commits',                     this.cmdCommits);

    add('pwd',     'pwd',                      'Print current path',                   this.cmdPwd);
    add('cd',      'cd <path>',                'Change directory (cd .. ~ /)',         this.cmdCd);
    add('autolog', 'autolog [on|off|status]', 'Toggle auto-list after cd',            this.cmdAutolog);
    add('autols',  'autolog [on|off|status]', 'Alias for autolog',                    this.cmdAutolog);
    add('..',      '..',                       'Alias for cd ..',                      this.cmdCdUp);
    add('...',     '...',                      'Alias for cd ../..',                   this.cmdCdUp2);
    add('tree',    'tree',                     'Recursive tree of current path',       this.cmdTree);

    add('ls',      'ls [-l] [path]',           'List files/folders',                   this.cmdLs);
    add('ll',      'll [path]',                'Long listing (size, sha, type)',       this.cmdLl);
    add('lt',      'lt',                       'Tree view of current folder',          this.cmdLt);
    add('mkdir',   'mkdir <name>',             'Create a folder (via .gitkeep)',       this.cmdMkdir);
    add('touch',   'touch <file>',             'Create an empty file',                 this.cmdTouch);
    add('cat',     'cat <file>',               'Print file contents',                  this.cmdCat);
    add('show',    'show <file|index>',        'Preview a file inline (text, image, PDF, media)', this.cmdShow);
    add('view',    'show <file|index>',        'Alias for show',                       this.cmdShow);
    add('preview', 'show <file|index>',        'Alias for show',                       this.cmdShow);
    add('info',    'info <file|index>',        'Show file metadata (no content fetch)', this.cmdInfo);
    add('echo',    'echo "text" > file',       'Write text to a file (>> to append)',  this.cmdEcho);
    add('put',      'put [-r] [-j N] [path]',  'Upload local file(s)/folder (-r), N at a time', this.cmdPut);
    add('upload',   'put [-r] [path]',         'Alias for put',                            this.cmdPut);
    add('putdir',   'putdir [path]',           'Upload a folder recursively',              this.cmdPutDir);
    add('download', 'download <file> [as <name>]', 'Save a repo file to your computer',      this.cmdDownload);
    add('get',      'download <file> [as <name>]', 'Alias for download',                    this.cmdDownload);
    add('editor',  'editor [file]',            'Open a nano-like editor (new file if omitted)', this.cmdEditor);
    add('nano',    'editor [file]',            'Alias for editor',                     this.cmdEditor);
    add('rm',      'rm [-r] <path>',           'Delete file or directory tree',        this.cmdRm);
    add('cp',      'cp [-r] <src> <dst>',      'Copy file or directory tree',          this.cmdCp);
    add('mv',      'mv <src> <dst>',           'Move (copy + delete, one commit)',     this.cmdMv);
    add('rename',  'rename <old> <new>',       'Rename within current folder',         this.cmdMv);
    add('head',    'head [-n N] <file>',       'First N lines of a file (default 10)', this.cmdHead);
    add('tail',    'tail [-n N] <file>',       'Last N lines of a file (default 10)',  this.cmdTail);
    add('wc',      'wc <file>',                'Line / word / character count',        this.cmdWc);
    add('find',    'find <pattern>',           'Search filenames via tree API',        this.cmdFind);
    add('grep',    'grep [-n] [-i] <pat> <file>', 'Search inside file contents',       this.cmdGrep);
    add('stat',    'stat <path>',              'File metadata (sha, size, url)',       this.cmdStat);
    add('chmod',   'chmod <path>',             'Show permissions (info only)',         this.cmdChmod);

    add('issues',  'issues',                   'List issues',                          this.cmdIssues);
    add('issue',   'issue <create|close|reopen|comment|label|assign> [args]', 'Issue operations', this.cmdIssue);
    add('pulls',   'pulls',                    'List pull requests',                   this.cmdPulls);
    add('pr',      'pr <create|merge|close|review|comment> [args]', 'PR operations', this.cmdPr);

    add('workflows', 'workflows',              'List Actions workflows',               this.cmdWorkflows);
    add('workflow',  'workflow run <id> [ref]','Dispatch a workflow run',              this.cmdWorkflow);
    add('runs',      'runs',                   'List workflow runs',                   this.cmdRuns);
    add('run',       'run logs <run_id>',      'Show a run log link',                  this.cmdRun);

    add('gists',   'gists',                    'List your gists',                      this.cmdGists);
    add('gist',    'gist <create|delete> [args]', 'Gist operations',                   this.cmdGist);

    add('user',       'user',                  'Show authenticated user',              this.cmdUser);
    add('followers',  'followers',             'List your followers',                  this.cmdFollowers);
    add('following',  'following',             'List who you follow',                  this.cmdFollowing);
    add('follow',     'follow <user>',         'Follow a user',                        this.cmdFollow);
    add('unfollow',   'unfollow <user>',       'Unfollow a user',                      this.cmdUnfollow);
    add('starred',    'starred',               'List your starred repos',              this.cmdStarred);
    add('star',       'star <owner/repo>',     'Star a repository',                    this.cmdStar);
    add('unstar',     'unstar <owner/repo>',   'Unstar a repository',                  this.cmdUnstar);

    add('orgs',  'orgs',                       'List your organisations',              this.cmdOrgs);
    add('org',   'org <members|repos> <org>',  'Organisation details',                 this.cmdOrg);
    add('teams', 'teams <org>',                'List teams in an org',                 this.cmdTeams);
    add('team',  'team members <org> <slug>',  'List team members',                    this.cmdTeam);

    add('notifications', 'notifications',      'List unread notifications',            this.cmdNotifications);
    add('mark-read',     'mark-read',          'Mark all notifications as read',       this.cmdMarkRead);
    add('search',        'search <repos|code|issues|users> <query>', 'GitHub search API', this.cmdSearch);

    add('releases', 'releases',                'List releases',                        this.cmdReleases);
    add('release',  'release <create|delete> [args]', 'Release operations',            this.cmdRelease);
    add('hooks',    'hooks',                   'List repo webhooks',                   this.cmdHooks);
    add('hook',     'hook <create|delete> [args]', 'Webhook operations',               this.cmdHook);
    add('keys',     'keys',                    'List deploy keys',                     this.cmdKeys);
    add('key',      'key delete <id>',         'Delete a deploy key',                  this.cmdKey);
    add('secrets',  'secrets',                 'List Actions secrets (names only)',    this.cmdSecrets);
    add('pages',    'pages [build]',           'GitHub Pages info / trigger build',    this.cmdPages);
    add('traffic',  'traffic',                 'Repository traffic',                   this.cmdTraffic);
    add('rate',       'rate | rate_limit',       'Show API rate limits in a table',      this.cmdRate);
    add('rate_limit', 'rate | rate_limit',       'Alias for rate',                       this.cmdRate);
    add('ratelimit',  'rate | rate_limit',       'Alias for rate',                       this.cmdRate);

    add('gql', 'gql "<query>" [variables-json]', 'GraphQL v4 passthrough',             this.cmdGql);

    return m;
  }


  async cmdHelp() {
    /* Aliases are stored as separate commands but share their target's usage
       string. Group by usage so each command appears only once, listing its
       aliases alongside it instead of repeating identical rows. */
    const byUsage = new Map();
    for (const [name, c] of this.commands.entries()) {
      let row = byUsage.get(c.usage);
      if (!row) {
        row = { usage: c.usage, desc: c.desc, names: [] };
        byUsage.set(c.usage, row);
      }
      row.names.push({ name, alias: /^Alias for /i.test(c.desc) });
      if (!/^Alias for /i.test(c.desc)) row.desc = c.desc;
    }
    const rows = [...byUsage.values()]
      .map((r) => {
        const primary = r.names.find((n) => !n.alias);
        return {
          usage: r.usage,
          desc: r.desc,
          aliases: primary ? r.names.filter((n) => n.alias).map((n) => n.name) : []
        };
      })
      .sort((a, b) => a.usage.localeCompare(b.usage));
    this.out(paint(C.bold, '\n  QCli — command reference\n'));
    const w = Math.max(...rows.map((r) => r.usage.length));
    for (const r of rows) {
      const extra = r.aliases.length
        ? paint(C.gray, `  [aliases: ${r.aliases.join(', ')}]`) : '';
      this.out(`  ${paint(C.cyan, r.usage.padEnd(w))}  ${paint(C.gray, r.desc)}${extra}`);
    }
    this.out(paint(C.gray, '\n  TAB completes commands & paths · ↑/↓ history · PageUp/PageDown scroll · Ctrl+L clear · Ctrl+C cancel.\n'));
    this.out(paint(C.gray, '  ⚙ or `prefs` opens Preferences: themes, fonts, sizes and terminal options.\n'));
    this.out(paint(C.gray, '  Chain with && (stop on failure) or ; (always continue), e.g. sleep 1 && pwd && ls.\n'));
    this.out(paint(C.gray, '  Mutating commands prompt for a commit message (or use -m "msg" / `commit -m "msg"`).\n'));
  }


  async cmdClear() {
    if (this.outEl) this.outEl.innerHTML = '';
    for (const url of this._objectUrls || []) URL.revokeObjectURL(url);
    this._objectUrls = [];
    this._groupEl = null;
  }


  async cmdHistory() {
    if (!this.history.length) return this.info('(no history)');
    this.history.forEach((h, i) => this.out(`${String(i + 1).padStart(4)}  ${h}`));
  }


  async cmdExit() { this.running = false; this.token = null; this.github.setCredentials(this.username, null); this._queue = []; }


  async cmdCommit(args) {
    const { args: a, msg } = this.extractMsg(args);
    const m = msg || a.join(' ').trim();
    if (!m) return this.err('Usage: commit -m "message"');
    this.pendingMessage = m;
    this.ok(`Next commit will use: "${m}"`);
  }


  async cmdSleep(args) {
    const sec = parseFloat(args[0]);
    if (!Number.isFinite(sec) || sec < 0) return this.err('Usage: sleep <seconds>');
    const total = Math.min(sec, 30) * 1000;
    let waited = 0;
    while (waited < total) {
      this.abortIfRequested();
      const step = Math.min(100, total - waited);
      await new Promise((r) => setTimeout(r, step));
      waited += step;
    }
  }


  async cmdDemo() {
    this.info('Demo: each step waits for the previous one, showing a live timer.');
    await this.execute('sleep 0.6 && pwd && sleep 0.4 && ls && sleep 0.3 && history');
  }


  async cmdPrefs(args) {
    const sub = args[0];
    if (!sub) {
      this.openPrefs();
      this.info('Preferences opened — change a control or use: prefs list / prefs set <key> <value>.');
      return;
    }
    if (sub === 'list') {
      this.out(paint(C.bold, '\n  Themes\n'));
      for (const [id, t] of Object.entries(THEMES)) {
        this.out(`  ${paint(C.cyan, id.padEnd(14))}${t.name}${id === this.prefs.theme ? paint(C.green, '  ← current') : ''}`);
      }
      this.out(paint(C.bold, '\n  Fonts\n'));
      for (const id of Object.keys(FONTS)) this.out(`  ${paint(C.cyan, id.padEnd(14))}${FONTS[id]}`);
      this.out(paint(C.bold, '\n  Current preferences\n'));
      this.kv(Object.fromEntries(Object.entries(this.prefs).map(([k, v]) => [k, String(v)])));
      return;
    }
    if (sub === 'reset') {
      this.prefs = { ...DEFAULT_PREFS };
      this.applyPrefs(); this.syncPrefsUI(); this.clearUrlHash();
      this.ok('Preferences reset to defaults.'); return;
    }
    if (sub === 'export') { this.outRaw(JSON.stringify(this.prefs)); return; }
    if (sub === 'import') {
      try {
        const p = JSON.parse(args.slice(1).join(' '));
        this.prefs = { ...DEFAULT_PREFS, ...p };
        if (!THEMES[this.prefs.theme]) this.prefs.theme = DEFAULT_PREFS.theme;
        this.applyPrefs(); this.syncPrefsUI();
        if (this.prefs.syncUrl) this.syncUrl(); else this.clearUrlHash();
        this.ok('Preferences imported.');
      } catch (e) { this.err('Invalid preferences JSON'); }
      return;
    }
    if (sub === 'theme') {
      if (!args[1]) return this.err('Usage: prefs theme <id>  (see: prefs list)');
      if (this.setPref('theme', args[1])) this.ok(`Theme: ${THEMES[args[1]].name}`);
      return;
    }
    if (sub === 'set') {
      const key = args[1], value = args.slice(2).join(' ');
      if (!key || !value) return this.err('Usage: prefs set <key> <value>');
      if (this.setPref(key, value)) this.ok(`${key} = ${this.prefs[key]}`);
      return;
    }
    this.err('Usage: prefs [list|set <key> <value>|reset|export|import <json>|theme <id>]');
  }


  async cmdRepos(args) {
    const all = args.includes('--all') || args.includes('-a');
    const ep = all
      ? '/user/repos?affiliation=owner,collaborator,organization_member&visibility=all&sort=updated'
      : '/user/repos?sort=updated';
    const data = await this.github.paginate(ep, { max: 10 });
    this.table(data, [
      { key: 'full_name', label: 'REPOSITORY', fmt: (r) => (r.private ? '🔒 ' : '   ') + r.full_name },
      { key: 'language', label: 'LANG', fmt: (r) => r.language || '-' },
      { key: 'stargazers_count', label: '★' },
      { key: 'forks_count', label: 'FORKS' },
      { key: 'default_branch', label: 'BRANCH' },
      { key: 'updated_at', label: 'UPDATED', fmt: (r) => (r.updated_at || '').slice(0, 10) }
    ]);
  }


  async cmdSelect(args) {
    const name = args[0];
    if (!name) return this.err('Usage: select <repo|owner/repo>');
    const full = name.includes('/') ? name : `${this.username}/${name}`;
    const r = await this.github.request('GET', `/repos/${full}`);
    this.repo = { owner: r.owner.login, name: r.name, branch: r.default_branch, data: r };
    this.cwd = [];
    this.ok(`Selected ${r.full_name}  (branch: ${r.default_branch})`);
    this.info(`Working path: ${this.github.pwd()}`);
    this.updateStatus();
    this.syncUrl();

    /* A path supplied in the startup URL is applied once a repo is selected. */
    if (this._pendingPath) {
      const p = this._pendingPath;
      this._pendingPath = null;
      await this.cmdCd([p]);
    }
  }


  async cmdBranch(args) {
    this.github.needRepo();
    const name = args[0];
    if (!name) { this.info(`Current branch: ${this.repo.branch}`); return; }
    await this.github.request('GET', `${this.github.rp()}/git/ref/heads/${name}`);
    this.repo.branch = name;
    this.cwd = [];
    this.ok(`Switched to branch ${name}`);
    this.info(`Working path: ${this.github.pwd()}`);
    this.updateStatus();
    this.syncUrl();
  }


  async cmdOpen(args) {
    const target = args[0];
    if (!this.repo) {
      if (!target) return this.err('No repository selected. Use: select <repo>');
      window.open(`https://github.com/${target}`, '_blank', 'noopener');
      this.ok(`Opened https://github.com/${target}`);
      return;
    }
    let url = `https://github.com/${this.repo.owner}/${this.repo.name}`;
    if (target) {
      const p = await this.resolvePath(target);
      const data = p ? await this.github.getContent(p) : null;
      const ref = encodeURIComponent(this.repo.branch);
      url += data && !Array.isArray(data)
        ? `/blob/${ref}/${this.github.enc(p)}`
        : `/tree/${ref}/${this.github.enc(p)}`;
    }
    window.open(url, '_blank', 'noopener');
    this.ok(`Opened ${url}`);
  }


  /* `log` / `commits`: fetch once, then page through the list 10 at a time. */
  async showCommitLog() {
    this.github.needRepo();
    const d = await this.github.paginate(`${this.github.rp()}/commits`);
    if (!d || !d.length) { this.info('No commits.'); return; }
    const cols = [
      { key: 'sha', label: 'SHA', fmt: (c) => String(c.sha).slice(0, 8) },
      { key: 'message', label: 'MESSAGE', fmt: (c) => String(c.commit.message).split('\n')[0].slice(0, 60) },
      { key: 'author', label: 'AUTHOR', fmt: (c) => c.author ? c.author.login : c.commit.author.name },
      { key: 'date', label: 'DATE', fmt: (c) => String(c.commit.author.date).slice(0, 10) }
    ];
    /* Compute widths from every row once so columns line up on every page. */
    const widths = this.tableWidths(d, cols);
    this.info(`${d.length} commits — showing 10 at a time.`);
    this.showPager({
      total: d.length, size: 10, label: 'commits',
      render: (from, to) => this.table(d.slice(from, to), cols, { widths })
    });
  }


  async cmdCommits() { return this.showCommitLog(); }


  async cmdRepo(args) {
    const sub = args[0], rest = args.slice(1), r = this.repo;
    switch (sub) {
      case 'info': {
        this.github.needRepo();
        const d = await this.github.request('GET', this.github.rp());
        this.kv({ 'Full name': d.full_name, 'Private': d.private, 'Description': d.description || '-',
          'Default branch': d.default_branch, 'Stars': d.stargazers_count, 'Forks': d.forks_count,
          'Watchers': d.subscribers_count, 'Open issues': d.open_issues_count, 'Language': d.language || '-',
          'License': d.license ? d.license.spdx_id : 'none', 'Created': d.created_at,
          'Updated': d.updated_at, 'URL': d.html_url });
        return;
      }
      case 'create': {
        const name = rest.find((a) => !a.startsWith('-'));
        if (!name) return this.err('Usage: repo create <name> [--private] [--description "..."]');
        const di = rest.indexOf('--description');
        const body = { name, private: rest.includes('--private') };
        if (di !== -1 && rest[di + 1]) body.description = rest[di + 1];
        const d = await this.github.request('POST', '/user/repos', body);
        this.ok(`Created ${d.full_name} → ${d.html_url}`);
        return;
      }
      case 'delete': {
        const name = rest[0];
        if (!name) return this.err('Usage: repo delete <name>');
        const full = name.includes('/') ? name : `${this.username}/${name}`;
        if (!(await this.confirm(`Delete repository ${full}? This cannot be undone.`))) return this.info('Aborted.');
        await this.github.request('DELETE', `/repos/${full}`);
        this.ok(`Deleted ${full}`);
        if (this.repo && `${this.repo.owner}/${this.repo.name}` === full) {
          this.repo = null; this.cwd = []; this.updateStatus(); this.syncUrl();
        }
        return;
      }
      case 'fork': {
        const full = rest[0] || (r ? `${r.owner}/${r.name}` : null);
        if (!full) return this.err('Usage: repo fork <owner/repo>');
        const d = await this.github.request('POST', `/repos/${full}/forks`);
        this.ok(`Forked → ${d.full_name}`);
        return;
      }
      case 'star': {
        const full = rest[0] || (r ? `${r.owner}/${r.name}` : null);
        if (!full) return this.err('Usage: repo star <owner/repo>');
        await this.github.request('PUT', `/user/starred/${full}`, {});
        this.ok(`Starred ${full}`);
        return;
      }
      case 'unstar': {
        const full = rest[0] || (r ? `${r.owner}/${r.name}` : null);
        if (!full) return this.err('Usage: repo unstar <owner/repo>');
        await this.github.request('DELETE', `/user/starred/${full}`);
        this.ok(`Unstarred ${full}`);
        return;
      }
      case 'watch': {
        this.github.needRepo();
        await this.github.request('PUT', `${this.github.rp()}/subscription`, { subscribed: true });
        this.ok('Watching repository.'); return;
      }
      case 'unwatch': {
        this.github.needRepo();
        await this.github.request('DELETE', `${this.github.rp()}/subscription`);
        this.ok('Unwatched repository.'); return;
      }
      case 'branches': {
        this.github.needRepo();
        const d = await this.github.paginate(`${this.github.rp()}/branches`);
        this.table(d, [
          { key: 'name', label: 'BRANCH' },
          { key: 'sha', label: 'SHA', fmt: (b) => (b.commit && b.commit.sha || '').slice(0, 8) },
          { key: 'protected', label: 'PROTECTED', fmt: (b) => (b.protected ? 'yes' : '') }
        ]);
        return;
      }
      case 'tags': {
        this.github.needRepo();
        const d = await this.github.paginate(`${this.github.rp()}/tags`);
        this.table(d, [
          { key: 'name', label: 'TAG' },
          { key: 'sha', label: 'SHA', fmt: (t) => t.commit.sha.slice(0, 8) }
        ]);
        return;
      }
      case 'releases': return this.cmdReleases();
      case 'collaborators': {
        this.github.needRepo();
        const d = await this.github.paginate(`${this.github.rp()}/collaborators`);
        this.table(d, [
          { key: 'login', label: 'USER' }, { key: 'type', label: 'TYPE' },
          { key: 'site_admin', label: 'ADMIN', fmt: (u) => (u.site_admin ? 'yes' : '') }
        ]);
        return;
      }
      case 'issues': {
        this.github.needRepo();
        const d = await this.github.paginate(`${this.github.rp()}/issues?state=all`);
        this.table(d.filter((i) => !i.pull_request), [
          { key: 'number', label: '#' }, { key: 'state', label: 'STATE' },
          { key: 'title', label: 'TITLE', fmt: (i) => i.title.slice(0, 60) },
          { key: 'user', label: 'BY', fmt: (i) => i.user.login }
        ]);
        return;
      }
      case 'pulls': return this.cmdPulls();
      case 'commits': return this.showCommitLog();
      case 'contributors': {
        this.github.needRepo();
        const d = await this.github.paginate(`${this.github.rp()}/contributors`);
        this.table(d, [{ key: 'login', label: 'USER' }, { key: 'contributions', label: 'COMMITS' }]);
        return;
      }
      case 'languages': {
        this.github.needRepo();
        const d = await this.github.request('GET', `${this.github.rp()}/languages`);
        const total = Object.values(d).reduce((a, b) => a + b, 0) || 1;
        this.table(Object.entries(d).map(([k, v]) => ({ lang: k, bytes: v })), [
          { key: 'lang', label: 'LANGUAGE' }, { key: 'bytes', label: 'BYTES' },
          { key: 'lang', label: '%', fmt: (x) => ((x.bytes / total) * 100).toFixed(1) + '%' }
        ]);
        return;
      }
      case 'topics': {
        this.github.needRepo();
        if (rest.length) {
          const d = await this.github.request('PUT', `${this.github.rp()}/topics`, { names: rest });
          this.ok('Topics: ' + (d.names || []).join(', '));
        } else {
          const d = await this.github.request('GET', `${this.github.rp()}/topics`);
          this.info('Topics: ' + ((d.names || []).join(', ') || '(none)'));
        }
        return;
      }
      case 'license': {
        this.github.needRepo();
        try {
          const d = await this.github.request('GET', `${this.github.rp()}/license`);
          this.kv({ License: d.license.name, SPDX: d.license.spdx_id, File: d.name, URL: d.html_url });
        } catch (e) {
          if (e.status === 404) this.warn('No license file detected.'); else throw e;
        }
        return;
      }
      default:
        this.err('repo subcommands: info|create|delete|fork|star|unstar|watch|unwatch|' +
          'branches|tags|releases|collaborators|issues|pulls|commits|contributors|languages|topics|license');
    }
  }


  async cmdPwd() { this.out(this.github.pwd()); }


  async cmdAutolog(args) {
    const a = (args || [])[0];
    if (a === undefined) {
      this.setPref('autolog', !this.prefs.autolog);
    } else if (/^(on|true|yes|1)$/i.test(a)) {
      this.setPref('autolog', true);
    } else if (/^(off|false|no|0)$/i.test(a)) {
      this.setPref('autolog', false);
    } else if (/^status$/i.test(a)) {
      this.info(`Auto-list after cd is ${this.prefs.autolog ? 'on' : 'off'}.`);
      return;
    } else {
      return this.err('Usage: autolog [on|off|status]');
    }
    this.ok(`Auto-list after cd ${this.prefs.autolog ? 'enabled' : 'disabled'}.`);
  }


  async finishCd() {
    this.updateStatus();
    this.syncUrl();
    if (this.prefs.autolog) await this.cmdLs([]);
  }


  async cmdCd(args) {
    if (!this.repo) return this.err('No repository selected. Use: select <repo>');
    const target = args[0];
    if (target === undefined || target === '~' || target === '/' || target === '') {
      this.cwd = []; await this.finishCd(); return;
    }
    if (await this.ensureValidCwd()) return;  /* cwd was removed; re-run cd if needed */
    let segs;
    try { segs = await this.resolveNumericPath(target); }
    catch (e) { return this.err(e.message); }
    const p = segs.join('/');
    if (p) {
      const data = await this.github.getContent(p);
      if (!data) return this.err(`cd: no such directory: ${target}`);
      if (!Array.isArray(data)) return this.err(`cd: not a directory: ${target}`);
    }
    this.cwd = segs;
    await this.finishCd();
  }


  async cmdCdUp() { return this.cmdCd(['..']); }


  async cmdCdUp2() { return this.cmdCd(['../..']); }


  async cmdTree() {
    this.github.needRepo();
    const prefix = this.cwd.join('/');
    const tree = await this.branchTree();
    const entries = tree
      .filter((e) => (prefix ? e.path.startsWith(prefix + '/') : true))
      .sort((a, b) => a.path.localeCompare(b.path));
    if (!entries.length) return this.info('(empty)');
    this.out(paint(C.blue, this.github.pwd()));
    for (const e of entries) {
      const rel = prefix ? e.path.slice(prefix.length + 1) : e.path;
      const depth = rel.split('/').length - 1;
      const name = rel.split('/').pop();
      this.out('  '.repeat(depth) + (e.type === 'tree' ? paint(C.blue, name + '/') : name));
    }
  }


  dirCacheKey(pathStr) {
    const a = this.github.active || {};
    return [a.owner, a.name, a.branch, pathStr || ''].join('|');
  }


  /* Sorted directory entries, shared by ls, numeric cd, and info.
     The full API objects (download_url, sha, size, …) are cached per folder. */
  async listEntries(pathStr, opts = {}) {
    const key = this.dirCacheKey(pathStr);
    if (!opts.refresh && this._dirCache.has(key)) return this._dirCache.get(key);
    const data = await this.github.getContent(pathStr || '');
    if (!data) { this._dirCache.delete(key); return null; }
    const rows = Array.isArray(data) ? data.slice() : [data];
    rows.sort((a, b) => {
      const d = (b.type === 'dir') - (a.type === 'dir');
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
    this._dirCache.set(key, rows);
    return rows;
  }


  /* Resolve paths like "1", "1/3/4" or "docs/2" against numbered ls listings.
     Numeric segments are 1-based indices into that directory's listing. */
  async resolveNumericPath(target) {
    await this.ensureValidCwd();
    const parts = String(target).split('/').filter(Boolean);
    const resolved = [];
    for (const part of parts) {
      let name = part;
      if (/^\d+$/.test(part)) {
        const dir = this.github.resolve(resolved.join('/')).join('/');
        const entries = await this.listEntries(dir);
        if (!entries) throw new Error(`cd: no such directory: ${dir || '/'}`);
        const literal = entries.find((e) => e.name === part);
        const idx = Number(part) - 1;
        const hit = idx >= 0 && idx < entries.length ? entries[idx] : literal;
        if (!hit) {
          throw new Error(`cd: no such list item: ${part} (ls shows ${entries.length} item${entries.length === 1 ? '' : 's'})`);
        }
        name = hit.name;
      }
      resolved.push(name);
    }
    return this.github.resolve(resolved.join('/'));
  }


  async cmdLs(args) {
    this.github.needRepo();
    await this.ensureValidCwd();
    const long = args.includes('-l') || args.includes('-la') || args.includes('-al');
    const refresh = args.some((a) => /^(-f|--fresh|--refresh)$/i.test(a));
    const target = args.find((a) => !a.startsWith('-'));
    const segs = this.github.resolve(target);
    const rows = await this.listEntries(segs.join('/'), { refresh });
    if (!rows) return this.err(`ls: no such path: ${target || '.'}`);
    if (!long) {
      rows.forEach((e, i) => {
        const num = paint(C.yellow, String(i + 1).padStart(2));
        const label = e.type === 'dir' ? paint(C.blue, e.name + '/')
                    : e.type === 'symlink' ? paint(C.cyan, e.name + '@')
                    : e.name;
        this.out(`${num} - ${label}`);
      });
      this.info('Tip: cd <n> enters an item; cat <n> reads it; info <n> shows details; cd 1/3/4 goes deeper.');
      return;
    }
    this.table(rows.map((e, i) => ({ ...e, idx: String(i + 1) })), [
      { key: 'idx', label: '#', fmt: (e) => e.idx },
      { key: 'type', label: 'TYPE', fmt: (e) => e.type === 'dir' ? 'dir ' : e.type === 'symlink' ? 'link' : 'file' },
      { key: 'name', label: 'NAME', fmt: (e) => e.type === 'dir' ? e.name + '/' : e.name },
      { key: 'size', label: 'SIZE', fmt: (e) => String(e.size || 0) },
      { key: 'sha', label: 'SHA', fmt: (e) => (e.sha || '').slice(0, 8) }
    ]);
  }


  async cmdLl(args) { return this.cmdLs(['-l', ...args]); }


  fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(2)} KB`;
    return `${(n / 1048576).toFixed(2)} MB`;
  }


  /* Find a file by name, index ("2"), or path ("docs/2") using cached folder
     listings. Never downloads file contents. */
  async resolveEntry(spec, opts = {}) {
    await this.ensureValidCwd();
    const parts = String(spec).split('/').filter(Boolean);
    if (!parts.length) throw new Error('info: no such file');
    const dirs = String(spec).startsWith('/') ? [] : [...this.cwd];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parent = dirs.join('/');
      const entries = await this.listEntries(parent, opts);
      if (!entries) throw new Error(`info: no such path: ${parent || '/'}`);
      let hit = entries.find((e) => e.name === part) || null;
      if (!hit && /^\d+$/.test(part)) hit = entries[Number(part) - 1] || null;
      if (!hit) throw new Error(`info: no such file: ${part}`);
      if (i === parts.length - 1) {
        return { entry: hit, index: entries.indexOf(hit) + 1, dir: parent };
      }
      if (hit.type !== 'dir') throw new Error(`info: not a directory: ${part}`);
      dirs.push(hit.name);
    }
  }


  /* Resolve a user reference (name, path, or 1-based ls index) to a repo path.
     Falls back to literal path resolution for new files/destinations. */
  async resolvePath(spec) {
    const s = String(spec == null ? '' : spec);
    if (!s) return '';
    try {
      const found = await this.resolveEntry(s);
      return found.entry.path || [...found.dir.split('/').filter(Boolean), found.entry.name].join('/');
    } catch (_) {
      return this.github.resolve(s).join('/');
    }
  }


  async cmdInfo(args, quiet) {
    this.github.needRepo();
    const refresh = (args || []).some((a) => /^(-f|--fresh|--refresh)$/i.test(a));
    const spec = (args || []).filter((a) => !a.startsWith('-')).join(' ').trim();
    if (!spec) {
      if (!quiet) this.err('Usage: info <file|index|path>   e.g. info README.md, info 2');
      return false;
    }
    let found;
    try { found = await this.resolveEntry(spec, { refresh }); }
    catch (e) { if (!quiet) this.err((e && e.message) || String(e)); return false; }
    const e = found.entry;
    if (e.type === 'dir') {
      if (!quiet) this.err(`info: ${e.name} is a directory — use ls ${e.name}`);
      return false;
    }
    this.table([
      { prop: '#',            value: String(found.index) },
      { prop: 'NAME',         value: e.name || '' },
      { prop: 'PATH',         value: e.path || [...found.dir.split('/').filter(Boolean), e.name].join('/') },
      { prop: 'TYPE',         value: e.type || 'file' },
      { prop: 'SIZE',         value: this.fmtSize(e.size) },
      { prop: 'SHA',          value: e.sha || '' },
      { prop: 'DOWNLOAD URL', value: e.download_url || e.html_url || '' },
      { prop: 'HTML URL',     value: e.html_url || '' },
      { prop: 'GIT URL',      value: e.git_url || '' },
      { prop: 'ENCODING',     value: e.encoding || '' }
    ], [
      { key: 'prop',  label: 'PROPERTY' },
      { key: 'value', label: 'VALUE' }
    ], { highlight: (r) => r.prop === 'DOWNLOAD URL' });
    return true;
  }


  async cmdLt() {
    this.github.needRepo();
    const prefix = this.cwd.join('/');
    const baseDepth = this.cwd.length;
    const tree = await this.branchTree();
    const entries = tree
      .filter((e) => (prefix ? e.path.startsWith(prefix + '/') : true))
      .filter((e) => e.path.split('/').length <= baseDepth + 3)
      .sort((a, b) => a.path.localeCompare(b.path));
    if (!entries.length) return this.info('(empty)');
    this.out(paint(C.blue, this.github.pwd()));
    for (const e of entries) {
      const rel = prefix ? e.path.slice(prefix.length + 1) : e.path;
      const depth = rel.split('/').length - 1;
      const name = rel.split('/').pop();
      const branch = depth > 0 ? paint(C.gray, '│  '.repeat(depth - 1) + '├─ ') : '';
      this.out(branch + (e.type === 'tree' ? paint(C.blue, name + '/') : name));
    }
  }


  async cmdMkdir(args) {
    this.github.needRepo();
    const { args: a, msg } = this.extractMsg(args);
    const name = a[0];
    if (!name) return this.err('Usage: mkdir <name>');
    const segs = this.github.resolve(name);
    if (!segs.length) return this.err('mkdir: invalid path');
    const file = [...segs, '.gitkeep'].join('/');
    const message = msg || await this.promptCommit(`Create directory ${segs.join('/')}`);
    if (message === null) return this.info('Aborted.');
    await this.commit([{ path: file, content: '' }], message);
  }


  async cmdTouch(args) {
    this.github.needRepo();
    const { args: a, msg } = this.extractMsg(args);
    const name = a[0];
    if (!name) return this.err('Usage: touch <file|index>');
    const p = await this.resolvePath(name);
    if (!p) return this.err('touch: invalid path');
    const exists = await this.github.getContent(p);
    if (exists && !Array.isArray(exists)) return this.info(`${p} already exists.`);
    const message = msg || await this.promptCommit(`Create ${p}`);
    if (message === null) return this.info('Aborted.');
    await this.commit([{ path: p, content: '' }], message);
  }


  async cmdCat(args) {
    this.github.needRepo();
    const name = args[0];
    if (!name) return this.err('Usage: cat <file> [or an ls index]');
    const f = await this.github.readFile(await this.resolvePath(name));
    this.outRaw(f.content, { newline: false });
    if (!f.content.endsWith('\n')) this.out('', { newline: true });
  }


  /* ── inline file viewer: show <file|index> ── */
  showKind(name) {
    const lower = String(name).toLowerCase();
    const ext = lower.includes('.') ? lower.split('.').pop() : '';
    if (SHOW_MIME[ext]) {
      const mime = SHOW_MIME[ext];
      const type = mime.startsWith('image/') ? 'image'
                 : mime.startsWith('video/') ? 'video'
                 : mime.startsWith('audio/') ? 'audio' : 'pdf';
      return { type, mime };
    }
    if (SHOW_TEXT.has(ext) || !ext) return { type: 'text', mime: 'text/plain' };
    return { type: 'auto', mime: 'application/octet-stream' };
  }


  async showBase64(meta) {
    /* Contents API omits (or empties) `content` above ~1 MB — fetch the raw blob. */
    if (typeof meta.content === 'string' && meta.content.length) {
      return meta.content.replace(/\s+/g, '');
    }
    const blob = await this.github.request('GET', `${this.github.rp()}/git/blobs/${meta.sha}`);
    return String(blob.content || '').replace(/\s+/g, '');
  }


  /* Detect binary formats from their magic bytes so images still preview even
     when the extension is unusual, uppercase, or missing. */
  sniffMime(bytes) {
    const b = bytes;
    if (!b || b.length < 4) return null;
    const s = (o, n) => String.fromCharCode.apply(null, b.subarray(o, o + n));
    const head4 = s(0, 4);
    if (head4 === '\x89PNG') return { type: 'image', mime: 'image/png' };
    if (head4 === '\xff\xd8\xff\xdb' || s(0, 3) === '\xff\xd8\xff') return { type: 'image', mime: 'image/jpeg' };
    if (head4 === 'GIF8') return { type: 'image', mime: 'image/gif' };
    if (head4 === 'RIFF') {
      const f = s(8, 4);
      if (f === 'WEBP') return { type: 'image', mime: 'image/webp' };
      if (f === 'WAVE') return { type: 'audio', mime: 'audio/wav' };
    }
    if (s(0, 2) === 'BM' && s(6, 2) === '\x00\x00') return { type: 'image', mime: 'image/bmp' };
    if (head4 === '%PDF') return { type: 'pdf', mime: 'application/pdf' };
    if (head4 === '\x00\x00\x01\x00') return { type: 'image', mime: 'image/x-icon' };
    if (b.length >= 12 && s(4, 4) === 'ftyp') {
      const brand = s(8, 4);
      if (/^(avif|avis)$/.test(brand)) return { type: 'image', mime: 'image/avif' };
      if (/^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand)) {
        return { type: 'image', mime: 'image/heic' };
      }
      return { type: 'video', mime: 'video/mp4' };
    }
    if (head4 === '\x1a\x45\xdf\xa3') return { type: 'video', mime: 'video/webm' };
    if (head4 === 'OggS') return { type: 'audio', mime: 'audio/ogg' };
    if (head4 === 'fLaC') return { type: 'audio', mime: 'audio/flac' };
    if (head4 === 'ID3') return { type: 'audio', mime: 'audio/mpeg' };
    /* SVG has no magic bytes — look for an <svg> root in the header. */
    const txt = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 2048)));
    if (/<svg[\s>]/i.test(txt)) return { type: 'image', mime: 'image/svg+xml' };
    return null;
  }


  showBlobUrl(bytes, mime) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
    this._objectUrls.push(url);
    return url;
  }


  showCaption(name, meta, mime) {
    const bits = [escapeHtml(name)];
    if (meta.size != null) bits.push(this.fmtSize(meta.size));
    if (mime) bits.push(escapeHtml(mime));
    return `<div class="term-view-cap">${bits.join(' · ')}</div>`;
  }


  async cmdShow(args) {
    this.github.needRepo();
    const spec = (args || []).filter((a) => !a.startsWith('-')).join(' ').trim();
    if (!spec) return this.err('Usage: show <file|index>   e.g. show README.md, show 2');

    const path = await this.resolvePath(spec);
    const meta = await this.github.getContent(path);
    if (!meta) return this.err(`show: no such file: ${spec}`);
    if (Array.isArray(meta)) return this.err(`show: ${spec} is a directory — use ls ${spec} or cd ${spec}`);

    const name = meta.name || path.split('/').pop() || 'file';
    const kind = this.showKind(name);
    let b64;
    try { b64 = await this.showBase64(meta); }
    catch (e) { return this.err(`show: could not read ${name}: ${(e && e.message) || e}`); }

    const bytes = window.base64ToBytes(b64);
    const sniffed = this.sniffMime(bytes);
    let type = sniffed ? sniffed.type : kind.type;
    let mime = sniffed ? sniffed.mime : kind.mime;

    if (!sniffed && (type === 'text' || type === 'auto')) {
      const text = window.base64ToUtf8(b64);
      if (text.indexOf('\0') === -1 || type === 'text') {
        this.outRaw(text, { newline: false });
        if (!text.endsWith('\n')) this.out('', { newline: true });
        this.scroll(true);
        return;
      }
      type = 'binary';   /* unknown extension but clearly binary bytes */
    }

    if (type === 'binary') {
      this.outHtml(
        `<div class="term-view term-view--binary">` + this.showCaption(name, meta, '') +
        `<div class="term-view-note">Binary file — no inline preview. ` +
        `Use <span class="term-view-code">download ${escapeHtml(spec)}</span> to save it locally.</div>` +
        `</div>`
      );
      this.scroll(true);
      return;
    }

    const url = this.showBlobUrl(bytes, mime);
    let body = '';
    if (type === 'image') {
      body = `<img class="term-view-img" src="${escapeAttr(url)}" alt="${escapeAttr(name)}">`;
    } else if (type === 'pdf') {
      body = `<iframe class="term-view-pdf" src="${escapeAttr(url)}" title="${escapeAttr(name)}"></iframe>` +
             `<div class="term-view-note"><a href="${escapeAttr(url)}" target="_blank" rel="noopener">Open PDF in a new tab ↗</a></div>`;
    } else if (type === 'video') {
      body = `<video class="term-view-media" src="${escapeAttr(url)}" controls></video>`;
    } else if (type === 'audio') {
      body = `<audio class="term-view-media" src="${escapeAttr(url)}" controls></audio>`;
    }
    this.outHtml(`<div class="term-view">` + this.showCaption(name, meta, mime) + body + `</div>`);

    /* If the browser cannot render the blob (odd codec, CSP, …), leave a useful
       link instead of a silently broken image. */
    const scope = this._groupEl || this.outEl;
    const imgs = scope.querySelectorAll('.term-view-img');
    const img = imgs[imgs.length - 1];
    if (img) img.addEventListener('error', () => {
      const view = img.closest('.term-view');
      if (!view) return;
      const raw = meta.download_url;
      view.innerHTML = this.showCaption(name, meta, '') +
        `<div class="term-view-note">Preview could not be rendered.` +
        (raw ? ` <a href="${escapeAttr(raw)}" target="_blank" rel="noopener">Open original ↗</a>` : '') +
        ` Use <span class="term-view-code">download ${escapeHtml(spec)}</span> to save it locally.</div>`;
    });

    const views = scope.querySelectorAll('.term-view');
    this.scrollToPreview(views[views.length - 1]);
  }


  async cmdEcho(args) {
    this.github.needRepo();
    const gtIdx = args.findIndex((t) => t === '>' || t === '>>');
    if (gtIdx === -1) { this.out(args.join(' ')); return; }
    const append = args[gtIdx] === '>>';
    const text = args.slice(0, gtIdx).join(' ');
    const file = args[gtIdx + 1];
    if (!file) return this.err('Usage: echo "text" > file');
    const p = await this.resolvePath(file);
    let content = text + '\n';
    if (append) {
      try {
        const cur = await this.github.readFile(p);
        content = cur.content + (cur.content.endsWith('\n') || !cur.content ? '' : '\n') + text + '\n';
      } catch (_) {}
    }
    const message = await this.promptCommit(`${append ? 'Append to' : 'Write'} ${p}`);
    if (message === null) return this.info('Aborted.');
    await this.commit([{ path: p, content }], message);
  }


  async cmdRm(args) {
    this.github.needRepo();
    const recursive = args.some((a) => /^-r/i.test(a));
    const { args: rest, msg } = this.extractMsg(args.filter((a) => !a.startsWith('-')));
    const target = rest[0];
    if (!target) return this.err('Usage: rm [-r] <path|index>');
    const p = await this.resolvePath(target);
    const segs = p.split('/').filter(Boolean);
    if (!p) return this.err('rm: refusing to remove the repository root');
    const data = await this.github.getContent(p);
    if (!data) return this.err(`rm: no such file or directory: ${target}`);
    if (Array.isArray(data)) {
      if (!recursive) return this.err('rm: is a directory (use -r)');
      const blobs = await this.github.blobsUnder(p);
      if (!blobs.length) { this.warn('Directory contains no blobs — GitHub cannot store empty directories.'); return; }
      const message = msg || await this.promptCommit(`Remove directory ${p}`);
      if (message === null) return this.info('Aborted.');
      const changes = blobs.map((b) => ({ path: b.path, content: null }));
      this.info(`Removing ${changes.length} file(s) in a single commit…`);
      await this.commit(changes, message);
      const cur = this.cwd.join('/');
      if (cur === p || cur.startsWith(p + '/')) {
        this.cwd = segs.slice(0, -1); this.updateStatus(); this.syncUrl();
      }
      return;
    }
    const message = msg || await this.promptCommit(`Delete ${p}`);
    if (message === null) return this.info('Aborted.');
    await this.commit([{ path: p, content: null }], message);
  }


  async cmdCp(args) {
    this.github.needRepo();
    const recursive = args.some((a) => /^-r/i.test(a));
    const { args: rest, msg } = this.extractMsg(args.filter((a) => !a.startsWith('-')));
    const [src, dst] = rest;
    if (!src || !dst) return this.err('Usage: cp [-r] <src|index> <dst|index>');
    const srcPath = await this.resolvePath(src);
    const dstPath = await this.resolvePath(dst);
    const srcSegs = srcPath.split('/').filter(Boolean);
    const srcData = await this.github.getContent(srcPath);
    if (!srcData) return this.err(`cp: no such file or directory: ${src}`);
    const changes = [];
    if (Array.isArray(srcData)) {
      if (!recursive) return this.err('cp: source is a directory (use -r)');
      const blobs = await this.github.blobsUnder(srcPath);
      if (!blobs.length) return this.warn('Source directory has no files to copy.');
      for (const b of blobs) {
        const rel = b.path.slice(srcPath.length + 1);
        changes.push({ path: `${dstPath}/${rel}`, sha: b.sha });
      }
    } else {
      const dstData = await this.github.getContent(dstPath).catch(() => null);
      const finalPath = Array.isArray(dstData) ? `${dstPath}/${srcSegs[srcSegs.length - 1]}` : dstPath;
      changes.push({ path: finalPath, sha: srcData.sha });
    }
    const message = msg || await this.promptCommit(`Copy ${srcPath} → ${dstPath}`);
    if (message === null) return this.info('Aborted.');
    await this.commit(changes, message);
  }


  async cmdMv(args) {
    this.github.needRepo();
    const { args: rest, msg } = this.extractMsg(args);
    const [src, dst] = rest;
    if (!src || !dst) return this.err('Usage: mv <src|index> <dst|index>');
    const srcPath = await this.resolvePath(src);
    const dstPath = await this.resolvePath(dst);
    const srcSegs = srcPath.split('/').filter(Boolean);
    const srcData = await this.github.getContent(srcPath);
    if (!srcData) return this.err(`mv: no such path: ${src}`);
    const changes = [];
    if (Array.isArray(srcData)) {
      const blobs = await this.github.blobsUnder(srcPath);
      if (!blobs.length) return this.warn('Source directory is empty on GitHub.');
      for (const b of blobs) {
        const rel = b.path.slice(srcPath.length + 1);
        changes.push({ path: `${dstPath}/${rel}`, sha: b.sha });
        changes.push({ path: b.path, content: null });
      }
    } else {
      const dstData = await this.github.getContent(dstPath).catch(() => null);
      const finalPath = Array.isArray(dstData) ? `${dstPath}/${srcSegs[srcSegs.length - 1]}` : dstPath;
      changes.push({ path: finalPath, sha: srcData.sha });
      changes.push({ path: srcPath, content: null });
    }
    const message = msg || await this.promptCommit(`Move ${srcPath} → ${dstPath}`);
    if (message === null) return this.info('Aborted.');
    await this.commit(changes, message);
  }


  async cmdHead(args) {
    this.github.needRepo();
    let n = 10, file;
    const ni = args.indexOf('-n');
    if (ni !== -1) { n = parseInt(args[ni + 1], 10) || 10; file = args[ni + 2]; }
    else file = args[0];
    if (!file) return this.err('Usage: head [-n N] <file|index>');
    const f = await this.github.readFile(await this.resolvePath(file));
    this.outRaw(f.content.split('\n').slice(0, n).join('\n'));
  }


  async cmdTail(args) {
    this.github.needRepo();
    let n = 10, file;
    const ni = args.indexOf('-n');
    if (ni !== -1) { n = parseInt(args[ni + 1], 10) || 10; file = args[ni + 2]; }
    else file = args[0];
    if (!file) return this.err('Usage: tail [-n N] <file|index>');
    const f = await this.github.readFile(await this.resolvePath(file));
    const lines = f.content.split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    this.outRaw(lines.slice(-n).join('\n'));
  }


  async cmdWc(args) {
    this.github.needRepo();
    const file = args[0];
    if (!file) return this.err('Usage: wc <file|index>');
    const f = await this.github.readFile(await this.resolvePath(file));
    const lines = f.content === '' ? 0 : f.content.split('\n').length - (f.content.endsWith('\n') ? 1 : 0);
    const words = f.content.split(/\s+/).filter(Boolean).length;
    this.out(`${lines}\t${words}\t${f.content.length}\t${file}`);
  }


  async cmdFind(args) {
    this.github.needRepo();
    const pattern = args[0];
    if (!pattern) return this.err('Usage: find <pattern>');
    const tree = await this.branchTree();
    const prefix = this.cwd.join('/');
    let re;
    try { re = new RegExp(pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i'); }
    catch (_) { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
    const hits = tree
      .filter((e) => (prefix ? e.path.startsWith(prefix + '/') : true))
      .filter((e) => re.test(e.path.split('/').pop()) || e.path.includes(pattern))
      .slice(0, 200);
    if (!hits.length) return this.info('(no matches)');
    for (const h of hits) this.out(h.type === 'tree' ? paint(C.blue, './' + h.path + '/') : './' + h.path);
  }


  async cmdGrep(args) {
    this.github.needRepo();
    const flags = args.filter((a) => a.startsWith('-'));
    const rest = args.filter((a) => !a.startsWith('-'));
    const [pattern, file] = rest;
    if (!pattern || !file) return this.err('Usage: grep [-n] [-i] <pattern> <file|index>');
    const f = await this.github.readFile(await this.resolvePath(file));
    let re;
    try { re = new RegExp(pattern, flags.includes('-i') ? 'i' : ''); }
    catch (_) { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.includes('-i') ? 'i' : ''); }
    let found = 0;
    f.content.split('\n').forEach((ln, i) => {
      if (re.test(ln)) {
        found++;
        if (flags.includes('-n')) this.out(`${paint(C.green, String(i + 1))}${paint(C.gray, ':')}${ln}`);
        else this.out(ln);
      }
    });
    if (!found) this.info('(no matches)');
  }


  async cmdStat(args) { return this.cmdInfo(args); }


  async cmdChmod(args) {
    this.github.needRepo();
    const name = args[0];
    if (!name) return this.err('Usage: chmod <path|index>');
    const p = await this.resolvePath(name);
    const d = await this.github.getContent(p);
    if (!d) return this.err(`chmod: no such path: ${name}`);
    if (Array.isArray(d)) this.kv({ Path: p, Type: 'directory', Mode: '040000 (git tree)', Note: 'GitHub has no per-directory permissions model.' });
    else this.kv({ Path: p, Type: 'file', Mode: '100644 (regular file) — GitHub supports only 100644 / 100755', Note: 'Use git update-index --chmod=+x for 100755.' });
  }


  async cmdIssues() {
    this.github.needRepo();
    const d = await this.github.paginate(`${this.github.rp()}/issues?state=all`);
    this.table(d.filter((i) => !i.pull_request), [
      { key: 'number', label: '#' }, { key: 'state', label: 'STATE' },
      { key: 'title', label: 'TITLE', fmt: (i) => i.title.slice(0, 60) },
      { key: 'user', label: 'BY', fmt: (i) => i.user.login }
    ]);
  }


  async cmdIssue(args) {
    this.github.needRepo();
    const sub = args[0], rest = args.slice(1);
    switch (sub) {
      case 'create': {
        const title = rest.join(' ') || '(untitled)';
        const d = await this.github.request('POST', `${this.github.rp()}/issues`, { title, body: '' });
        this.ok(`Created issue #${d.number}: ${d.html_url}`); return;
      }
      case 'close': {
        const n = parseInt(rest[0], 10);
        if (!n) return this.err('Usage: issue close <number>');
        await this.github.request('PATCH', `${this.github.rp()}/issues/${n}`, { state: 'closed' });
        this.ok(`Closed issue #${n}`); return;
      }
      case 'reopen': {
        const n = parseInt(rest[0], 10);
        if (!n) return this.err('Usage: issue reopen <number>');
        await this.github.request('PATCH', `${this.github.rp()}/issues/${n}`, { state: 'open' });
        this.ok(`Reopened issue #${n}`); return;
      }
      case 'comment': {
        const n = parseInt(rest[0], 10), body = rest.slice(1).join(' ');
        if (!n || !body) return this.err('Usage: issue comment <number> <body>');
        const d = await this.github.request('POST', `${this.github.rp()}/issues/${n}/comments`, { body });
        this.ok(`Commented: ${d.html_url}`); return;
      }
      case 'label': {
        const n = parseInt(rest[0], 10), labels = rest.slice(1);
        if (!n || !labels.length) return this.err('Usage: issue label <number> <label...>');
        await this.github.request('POST', `${this.github.rp()}/issues/${n}/labels`, { labels });
        this.ok(`Labels added to #${n}`); return;
      }
      case 'assign': {
        const n = parseInt(rest[0], 10), assignees = rest.slice(1);
        if (!n || !assignees.length) return this.err('Usage: issue assign <number> <user...>');
        await this.github.request('POST', `${this.github.rp()}/issues/${n}/assignees`, { assignees });
        this.ok(`Assigned to #${n}`); return;
      }
      default: this.err('Usage: issue <create|close|reopen|comment|label|assign>');
    }
  }


  async cmdPulls() {
    this.github.needRepo();
    const d = await this.github.paginate(`${this.github.rp()}/pulls?state=all`);
    this.table(d, [
      { key: 'number', label: '#' }, { key: 'state', label: 'STATE' },
      { key: 'title', label: 'TITLE', fmt: (p) => p.title.slice(0, 60) },
      { key: 'head', label: 'HEAD', fmt: (p) => p.head.ref.slice(0, 20) },
      { key: 'base', label: 'BASE', fmt: (p) => p.base.ref.slice(0, 20) }
    ]);
  }


  async cmdPr(args) {
    this.github.needRepo();
    const sub = args[0], rest = args.slice(1);
    switch (sub) {
      case 'create': {
        const title = rest.join(' ') || '(untitled)';
        const d = await this.github.request('POST', `${this.github.rp()}/pulls`, { title, head: this.repo.branch, base: this.repo.branch, body: '' });
        this.ok(`Created PR #${d.number}: ${d.html_url}`); return;
      }
      case 'merge': {
        const n = parseInt(rest[0], 10);
        if (!n) return this.err('Usage: pr merge <number>');
        const d = await this.github.request('PUT', `${this.github.rp()}/pulls/${n}/merge`, {});
        this.ok(`Merged PR #${n}: ${d.message || 'ok'}`); return;
      }
      case 'close': {
        const n = parseInt(rest[0], 10);
        if (!n) return this.err('Usage: pr close <number>');
        await this.github.request('PATCH', `${this.github.rp()}/pulls/${n}`, { state: 'closed' });
        this.ok(`Closed PR #${n}`); return;
      }
      case 'review': {
        const n = parseInt(rest[0], 10), body = rest.slice(1).join(' ') || 'LGTM';
        if (!n) return this.err('Usage: pr review <number> [body]');
        await this.github.request('POST', `${this.github.rp()}/pulls/${n}/reviews`, { event: 'APPROVE', body });
        this.ok(`Approved PR #${n}`); return;
      }
      case 'comment': {
        const n = parseInt(rest[0], 10), body = rest.slice(1).join(' ');
        if (!n || !body) return this.err('Usage: pr comment <number> <body>');
        const d = await this.github.request('POST', `${this.github.rp()}/issues/${n}/comments`, { body });
        this.ok(`Commented: ${d.html_url}`); return;
      }
      default: this.err('Usage: pr <create|merge|close|review|comment>');
    }
  }


  async cmdWorkflows() {
    this.github.needRepo();
    const d = await this.github.request('GET', `${this.github.rp()}/actions/workflows`);
    this.table(d.workflows || [], [
      { key: 'id', label: 'ID' }, { key: 'name', label: 'NAME' },
      { key: 'state', label: 'STATE' }, { key: 'path', label: 'PATH', fmt: (w) => w.path.slice(-50) }
    ]);
  }


  async cmdWorkflow(args) {
    this.github.needRepo();
    if (args[0] !== 'run') return this.err('Usage: workflow run <id> [ref]');
    const id = args[1], ref = args[2] || this.repo.branch;
    if (!id) return this.err('Usage: workflow run <id> [ref]');
    await this.github.request('POST', `${this.github.rp()}/actions/workflows/${id}/dispatches`, { ref });
    this.ok(`Dispatched workflow ${id} on ${ref}`);
  }


  async cmdRuns() {
    this.github.needRepo();
    const d = await this.github.request('GET', `${this.github.rp()}/actions/runs?per_page=20`);
    this.table(d.workflow_runs || [], [
      { key: 'id', label: 'RUN' }, { key: 'name', label: 'NAME', fmt: (r) => r.name.slice(0, 40) },
      { key: 'status', label: 'STATUS' }, { key: 'conclusion', label: 'RESULT', fmt: (r) => r.conclusion || '-' },
      { key: 'head_branch', label: 'BRANCH' }
    ]);
  }


  async cmdRun(args) {
    this.github.needRepo();
    if (args[0] !== 'logs') return this.err('Usage: run logs <run_id>');
    const id = args[1];
    if (!id) return this.err('Usage: run logs <run_id>');
    this.info(`Open logs in browser: https://github.com/${this.repo.owner}/${this.repo.name}/actions/runs/${id}`);
  }


  async cmdGists() {
    const d = await this.github.paginate('/gists');
    this.table(d, [
      { key: 'id', label: 'ID', fmt: (g) => g.id.slice(0, 8) },
      { key: 'description', label: 'DESCRIPTION', fmt: (g) => (g.description || '(none)').slice(0, 50) },
      { key: 'public', label: 'PUBLIC', fmt: (g) => (g.public ? 'yes' : 'no') },
      { key: 'files', label: 'FILES', fmt: (g) => Object.keys(g.files || {}).length }
    ]);
  }


  async cmdGist(args) {
    const sub = args[0], rest = args.slice(1);
    switch (sub) {
      case 'create': {
        const filename = rest[0], content = rest.slice(1).join(' ');
        if (!filename) return this.err('Usage: gist create <filename> [content]');
        const d = await this.github.request('POST', '/gists', {
          description: 'Created via QCli', public: false,
          files: { [filename]: { content: content || '' } }
        });
        this.ok(`Created gist: ${d.html_url}`); return;
      }
      case 'delete': {
        const id = rest[0];
        if (!id) return this.err('Usage: gist delete <id>');
        await this.github.request('DELETE', `/gists/${id}`);
        this.ok(`Deleted gist ${id}`); return;
      }
      default: this.err('Usage: gist <create|delete>');
    }
  }


  async cmdUser() {
    if (!this.user) this.user = await this.github.request('GET', '/user');
    const u = this.user;
    this.kv({
      Login: u.login, Name: u.name || '-', Email: u.email || '-',
      Company: u.company || '-', Location: u.location || '-',
      PublicRepos: u.public_repos, Followers: u.followers, Following: u.following,
      Created: u.created_at
    });
  }


  async cmdFollowers() {
    const d = await this.github.paginate('/user/followers');
    this.table(d, [{ key: 'login', label: 'USER' }, { key: 'type', label: 'TYPE' }]);
  }


  async cmdFollowing() {
    const d = await this.github.paginate('/user/following');
    this.table(d, [{ key: 'login', label: 'USER' }, { key: 'type', label: 'TYPE' }]);
  }


  async cmdFollow(args) {
    const u = args[0];
    if (!u) return this.err('Usage: follow <user>');
    await this.github.request('PUT', `/user/following/${u}`, {});
    this.ok(`Followed ${u}`);
  }


  async cmdUnfollow(args) {
    const u = args[0];
    if (!u) return this.err('Usage: unfollow <user>');
    await this.github.request('DELETE', `/user/following/${u}`);
    this.ok(`Unfollowed ${u}`);
  }


  async cmdStarred() {
    const d = await this.github.paginate('/user/starred');
    this.table(d, [
      { key: 'full_name', label: 'REPO' },
      { key: 'language', label: 'LANG', fmt: (r) => r.language || '-' },
      { key: 'stargazers_count', label: '★' }
    ]);
  }


  async cmdStar(args) {
    const r = args[0];
    if (!r) return this.err('Usage: star <owner/repo>');
    await this.github.request('PUT', `/user/starred/${r}`, {});
    this.ok(`Starred ${r}`);
  }


  async cmdUnstar(args) {
    const r = args[0];
    if (!r) return this.err('Usage: unstar <owner/repo>');
    await this.github.request('DELETE', `/user/starred/${r}`);
    this.ok(`Unstarred ${r}`);
  }


  async cmdOrgs() {
    const d = await this.github.paginate('/user/orgs');
    this.table(d, [
      { key: 'login', label: 'ORG' },
      { key: 'description', label: 'DESCRIPTION', fmt: (o) => (o.description || '').slice(0, 50) }
    ]);
  }


  async cmdOrg(args) {
    const sub = args[0], org = args[1];
    if (!sub || !org) return this.err('Usage: org <members|repos> <org>');
    if (sub === 'members') {
      const d = await this.github.paginate(`/orgs/${org}/members`);
      this.table(d, [{ key: 'login', label: 'USER' }, { key: 'type', label: 'TYPE' }]);
    } else if (sub === 'repos') {
      const d = await this.github.paginate(`/orgs/${org}/repos`);
      this.table(d, [
        { key: 'full_name', label: 'REPO' },
        { key: 'language', label: 'LANG', fmt: (r) => r.language || '-' },
        { key: 'stargazers_count', label: '★' }
      ]);
    } else this.err('Usage: org <members|repos> <org>');
  }


  async cmdTeams(args) {
    const org = args[0];
    if (!org) return this.err('Usage: teams <org>');
    const d = await this.github.paginate(`/orgs/${org}/teams`);
    this.table(d, [
      { key: 'name', label: 'NAME' }, { key: 'slug', label: 'SLUG' }, { key: 'privacy', label: 'PRIVACY' }
    ]);
  }


  async cmdTeam(args) {
    const sub = args[0], org = args[1], slug = args[2];
    if (sub !== 'members' || !org || !slug) return this.err('Usage: team members <org> <slug>');
    const d = await this.github.paginate(`/orgs/${org}/teams/${slug}/members`);
    this.table(d, [{ key: 'login', label: 'USER' }, { key: 'type', label: 'TYPE' }]);
  }


  async cmdNotifications() {
    const d = await this.github.paginate('/notifications');
    this.table(d, [
      { key: 'id', label: 'ID', fmt: (n) => n.id.slice(0, 8) },
      { key: 'reason', label: 'REASON' },
      { key: 'subject', label: 'TITLE', fmt: (n) => (n.subject.title || '').slice(0, 60) },
      { key: 'unread', label: 'UNREAD', fmt: (n) => (n.unread ? 'yes' : 'no') }
    ]);
  }


  async cmdMarkRead() {
    await this.github.request('PUT', '/notifications', { last_read_at: new Date().toISOString() });
    this.ok('Notifications marked as read.');
  }


  async cmdSearch(args) {
    const type = args[0], query = args.slice(1).join(' ');
    if (!type || !query) return this.err('Usage: search <repos|code|issues|users> <query>');
    const endpoints = { repos: '/search/repositories', code: '/search/code', issues: '/search/issues', users: '/search/users' };
    const ep = endpoints[type];
    if (!ep) return this.err(`Unknown search type: ${type}`);
    const d = await this.github.request('GET', `${ep}?q=${encodeURIComponent(query)}&per_page=30`);
    this.info(`Found ${d.total_count} result(s)`);
    const items = d.items || [];
    if (type === 'repos') this.table(items, [
      { key: 'full_name', label: 'REPO' },
      { key: 'stargazers_count', label: '★' },
      { key: 'language', label: 'LANG', fmt: (r) => r.language || '-' }
    ]);
    else if (type === 'users') this.table(items, [{ key: 'login', label: 'USER' }, { key: 'type', label: 'TYPE' }]);
    else if (type === 'issues') this.table(items, [
      { key: 'number', label: '#' },
      { key: 'title', label: 'TITLE', fmt: (i) => i.title.slice(0, 60) },
      { key: 'state', label: 'STATE' }
    ]);
    else this.table(items, [
      { key: 'name', label: 'FILE' },
      { key: 'path', label: 'PATH', fmt: (i) => i.path.slice(0, 60) },
      { key: 'repository', label: 'REPO', fmt: (i) => i.repository ? i.repository.full_name : '-' }
    ]);
  }


  async cmdReleases() {
    this.github.needRepo();
    const d = await this.github.paginate(`${this.github.rp()}/releases`);
    this.table(d, [
      { key: 'tag_name', label: 'TAG' },
      { key: 'name', label: 'NAME', fmt: (r) => (r.name || '').slice(0, 40) },
      { key: 'prerelease', label: 'PRE', fmt: (r) => (r.prerelease ? 'yes' : '') },
      { key: 'published_at', label: 'PUBLISHED', fmt: (r) => (r.published_at || '').slice(0, 10) }
    ]);
  }


  async cmdRelease(args) {
    this.github.needRepo();
    const sub = args[0], rest = args.slice(1);
    if (sub === 'create') {
      const tag = rest[0], name = rest[1] || tag;
      if (!tag) return this.err('Usage: release create <tag> [name]');
      const d = await this.github.request('POST', `${this.github.rp()}/releases`, { tag_name: tag, name, draft: false, prerelease: false });
      this.ok(`Created release: ${d.html_url}`);
    } else if (sub === 'delete') {
      const id = rest[0];
      if (!id) return this.err('Usage: release delete <id>');
      await this.github.request('DELETE', `${this.github.rp()}/releases/${id}`);
      this.ok(`Deleted release ${id}`);
    } else this.err('Usage: release <create|delete>');
  }


  async cmdHooks() {
    this.github.needRepo();
    const d = await this.github.request('GET', `${this.github.rp()}/hooks`);
    this.table(d, [
      { key: 'id', label: 'ID' },
      { key: 'config', label: 'URL', fmt: (h) => (h.config.url || '').slice(0, 50) },
      { key: 'active', label: 'ACTIVE', fmt: (h) => (h.active ? 'yes' : '') }
    ]);
  }


  async cmdHook(args) {
    this.github.needRepo();
    const sub = args[0], rest = args.slice(1);
    if (sub === 'create') {
      const url = rest[0];
      if (!url) return this.err('Usage: hook create <url>');
      const d = await this.github.request('POST', `${this.github.rp()}/hooks`,
        { name: 'web', active: true, events: ['push'], config: { url, content_type: 'json' } });
      this.ok(`Created hook ${d.id}`);
    } else if (sub === 'delete') {
      const id = rest[0];
      if (!id) return this.err('Usage: hook delete <id>');
      await this.github.request('DELETE', `${this.github.rp()}/hooks/${id}`);
      this.ok(`Deleted hook ${id}`);
    } else this.err('Usage: hook <create|delete>');
  }


  async cmdKeys() {
    this.github.needRepo();
    const d = await this.github.request('GET', `${this.github.rp()}/keys`);
    this.table(d, [
      { key: 'id', label: 'ID' }, { key: 'title', label: 'TITLE' },
      { key: 'read_only', label: 'RO', fmt: (k) => (k.read_only ? 'yes' : '') }
    ]);
  }


  async cmdKey(args) {
    this.github.needRepo();
    if (args[0] !== 'delete' || !args[1]) return this.err('Usage: key delete <id>');
    await this.github.request('DELETE', `${this.github.rp()}/keys/${args[1]}`);
    this.ok(`Deleted deploy key ${args[1]}`);
  }


  async cmdSecrets() {
    this.github.needRepo();
    const d = await this.github.request('GET', `${this.github.rp()}/actions/secrets`);
    this.table(d.secrets || [], [
      { key: 'name', label: 'NAME' },
      { key: 'created_at', label: 'CREATED', fmt: (s) => (s.created_at || '').slice(0, 10) }
    ]);
    this.info('Values are never readable — write-only secrets.');
  }


  async cmdPages(args) {
    this.github.needRepo();
    if (args[0] === 'build') {
      await this.github.request('POST', `${this.github.rp()}/pages/builds`);
      this.ok('Triggered Pages build.'); return;
    }
    try {
      const d = await this.github.request('GET', `${this.github.rp()}/pages`);
      this.kv({
        URL: d.html_url, Status: d.status, CNAME: d.cname || '-',
        'Custom 404': d.custom_404 || '-',
        Source: d.source ? `${d.source.branch} /${d.source.path}` : '-'
      });
    } catch (e) {
      if (e.status === 404) this.warn('Pages is not enabled for this repository.'); else throw e;
    }
  }


  async cmdTraffic() {
    this.github.needRepo();
    const views = await this.github.request('GET', `${this.github.rp()}/traffic/views`);
    const clones = await this.github.request('GET', `${this.github.rp()}/traffic/clones`);
    this.kv({
      'Total views (14d)': `${views.count} (${views.uniques} unique)`,
      'Total clones (14d)': `${clones.count} (${clones.uniques} unique)`
    });
  }


  async cmdRate() {
    const d = await this.github.request('GET', '/rate_limit');
    const resources = d.resources || {};
    const now = Math.floor(Date.now() / 1000);
    const rows = Object.keys(resources).sort().map((name) => {
      const r = resources[name] || {};
      const limit = r.limit ?? 0;
      const remaining = r.remaining ?? 0;
      const used = r.used ?? (limit - remaining);
      const secs = Math.max(0, (r.reset || 0) - now);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      return {
        resource: name,
        limit: String(limit),
        remaining: String(remaining),
        used: String(used),
        resetIn: secs ? `${h}h ${m}m` : '—'
      };
    });
    this.out(paint(C.bold, '\n  GitHub API rate limits\n'));
    this.table(rows, [
      { label: 'RESOURCE', key: 'resource' },
      { label: 'LIMIT', key: 'limit' },
      { label: 'REMAINING', key: 'remaining' },
      { label: 'USED', key: 'used' },
      { label: 'RESET IN', key: 'resetIn' }
    ], { highlight: (r) => r.resource === 'core' });
    const core = resources.core;
    if (core) {
      this.info(`Core: ${core.remaining}/${core.limit} remaining · resets ${new Date(core.reset * 1000).toISOString()}`);
    }
  }


  async cmdGql(args) {
    const query = args[0];
    if (!query) return this.err('Usage: gql "<query>" [variables-json]');
    let variables = null;
    if (args[1]) {
      try { variables = JSON.parse(args[1]); }
      catch (_) { return this.err('Invalid JSON variables'); }
    }
    const d = await this.github.request('POST', 'https://api.github.com/graphql', { query, variables });
    this.outRaw(JSON.stringify(d, null, 2));
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  Exports + autostart
 * ══════════════════════════════════════════════════════════════════════════ */
window.QCli = QCli;
window.ApiError = ApiError;

if (typeof window !== 'undefined' && !window.__QCLI__) {
  window.__QCLI__ = new QCli({ container: document.getElementById('app') });
  window.__QCLI__.start();
}
