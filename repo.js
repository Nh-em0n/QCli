/**
 * repo.js — GitHub repository / API layer.
 * Pure data + state handling: no DOM, no terminal rendering.
 * Plain classic script: load this file before app.js in index.html.
 */

class ApiError extends Error {
  constructor(status, payload) {
    const msg = payload && payload.message ? payload.message : JSON.stringify(payload);
    super(`HTTP ${status}: ${msg}`);
    this.status = status;
    this.payload = payload;
  }
}

/* ── Base64 / UTF-8 (browser-safe, no Buffer) ── */
const _enc = new TextEncoder();
const _dec = new TextDecoder();

function utf8ToBase64(str) {
  const bytes = _enc.encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function bytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64ToUtf8(b64) {
  return _dec.decode(base64ToBytes(b64));
}

class GitHubRepo {
  constructor(opts = {}) {
    this.apiBase   = 'https://api.github.com';
    this.username  = opts.username || null;
    this.token     = opts.token    || null;
    this.user      = null;
    this.active    = null;   // selected repository descriptor
    this.cwd       = [];     // path inside the selected repository
    this._lastLink = null;
    this.lastTreeTruncated = false;
    /* GitHub commits advance a branch ref, so truly parallel PUTs collide with
       HTTP 409. Single-file commits are funneled through this promise chain. */
    this._commitChain = Promise.resolve();
    /* Normal loads use the browser cache for speed. Commands given -f / --fresh
       flip this for their own API calls so GitHub is queried fresh. */
    this.forceFresh = false;
  }

  setCredentials(username, token) {
    this.username = username;
    this.token = token;
  }


  async request(method, endpoint, body = null, opts = {}) {
    const url = endpoint.startsWith('http') ? endpoint : this.apiBase + endpoint;
    const headers = {
      'Accept': opts.accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (body != null) headers['Content-Type'] = 'application/json';

    const init = {
      method, headers,
      body: body == null ? null : JSON.stringify(body)
    };
    /* Default: let the browser store/reuse responses so repeated loads are
       fast. `-f` / --fresh switches this call (and its paginated follow-ups)
       to no-store for up-to-the-second data. */
    const cacheMode = (this.forceFresh || opts.fresh) ? 'no-store' : 'store';
    let res;
    try {
      res = await fetch(url, { ...init, cache: cacheMode });
    } catch (e) {
      /* `store` is Chromium-only; fall back to normal caching elsewhere. */
      if (cacheMode !== 'store' || !/cache|store/i.test(String(e && e.message))) {
        throw new Error(`Network error: ${e.message}`);
      }
      try { res = await fetch(url, { ...init, cache: 'default' }); }
      catch (e2) { throw new Error(`Network error: ${e2.message}`); }
    }

    this._lastLink = res.headers.get('link');
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (res.ok) return data;
    throw new ApiError(res.status, data);
  }


  linkNext(link) {
    if (!link) return null;
    const m = /<([^>]+)>;\s*rel="next"/.exec(link);
    return m ? m[1] : null;
  }


  async paginate(endpoint, opts = {}) {
    const max = opts.max || 10;
    let url = endpoint + (endpoint.includes('?') ? '&' : '?') + 'per_page=100';
    const all = [];
    for (let i = 0; i < max && url; i++) {
      const data = await this.request('GET', url);
      if (!Array.isArray(data)) return data;
      all.push(...data);
      url = this.linkNext(this._lastLink);
    }
    return all;
  }


  graphql(query, variables) {
    return this.request('POST', 'https://api.github.com/graphql', { query, variables });
  }


  pwd() {
    if (!this.active) return `/${this.username || ''}`;
    const base = `/${this.active.owner}/${this.active.name}`;
    return this.cwd.length ? `${base}/${this.cwd.join('/')}` : base;
  }


  resolve(p) {
    if (p === undefined || p === null || p === '' || p === '.' || p === '~') {
      return p === '~' ? [] : [...this.cwd];
    }
    const segs = p.startsWith('/') ? p.split('/').filter(Boolean) : [...this.cwd, ...p.split('/')];
    const out = [];
    for (const s of segs) {
      if (s === '.' || s === '') continue;
      if (s === '..') out.pop();
      else out.push(s);
    }
    return out;
  }


  enc(p) { return String(p || '').split('/').map(encodeURIComponent).join('/'); }


  /* Raw-file URL for a repo-relative path (GitHub's contents API returns the
     same shape in `download_url`; this is a fallback when it is omitted). */
  rawUrl(p) {
    if (!this.active) return null;
    const segs = String(p || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const base = `https://raw.githubusercontent.com/${this.active.owner}/${this.active.name}/${this.active.branch}`;
    return segs ? `${base}/${segs}` : base;
  }


  needRepo() {
    if (!this.active) throw new Error('No repository selected. Use: select <repo>');
    return this.active;
  }


  rp() { return `/repos/${this.active.owner}/${this.active.name}`; }


  async getContent(p, opts = {}) {
    const { owner, name, branch } = this.active;
    const ep = `/repos/${owner}/${name}/contents/${this.enc(p)}?ref=${encodeURIComponent(branch)}`;
    try { return await this.request('GET', ep, null, opts); }
    catch (e) { if (e.status === 404) return null; throw e; }
  }


  async readFile(p) {
    const data = await this.getContent(p);
    if (!data) throw new Error(`No such file: ${p}`);
    if (Array.isArray(data)) throw new Error(`${p} is a directory`);
    let content = '';
    if (data.encoding === 'base64' && data.content) {
      content = base64ToUtf8(data.content);
    } else if (data.size > 0) {
      const blob = await this.request('GET', `${this.rp()}/git/blobs/${data.sha}`);
      content = base64ToUtf8(blob.content || '');
    }
    return { content, sha: data.sha, size: data.size, meta: data };
  }


  async branchTree() {
    const { owner, name, branch } = this.needRepo();
    const data = await this.request('GET', `/repos/${owner}/${name}/git/trees/${branch}?recursive=1`);
    this.lastTreeTruncated = !!data.truncated;
    return data.tree || [];
  }


  async blobsUnder(prefix) {
    const tree = await this.branchTree();
    const pre = prefix ? prefix + '/' : '';
    return tree.filter((e) => e.type === 'blob' && e.path.startsWith(pre));
  }


  /* Run a single-file commit exclusively: no two commits can be in flight on
     the same branch at once, which removes the 409 ref-conflict storms seen
     with large parallel uploads. */
  serialized(fn) {
    const run = this._commitChain.then(fn, fn);
    this._commitChain = run.catch(() => {});
    return run;
  }


  async commit(changes, message) {
    this.needRepo();
    changes = (changes || []).filter(Boolean);
    if (!changes.length) return { empty: true };
    const { owner, name, branch } = this.active;
    const base = `/repos/${owner}/${name}`;

    if (changes.length === 1 && !changes[0].sha) {
      return this.serialized(async () => {
        let putResult = null;   /* contents API response for the saved file */
        const ch = changes[0];
        const ep = `${base}/contents/${this.enc(ch.path)}`;
        if (ch.content === null) {
          /* A cached SHA would be stale after another write and cause 409. */
          const existing = await this.getContent(ch.path, { fresh: true });
          if (!existing || Array.isArray(existing)) throw new Error(`Not a file: ${ch.path}`);
          await this.request('DELETE', ep, { message, sha: existing.sha, branch });
        } else {
          const existing = await this.getContent(ch.path, { fresh: true });
          /* GitHub's contents API rejects `content: ""` with HTTP 422
             ("content is not valid Base64"), so empty files are stored as a
             single newline. Git still tracks the path, which is all that
             mkdir/touch need. */
          const text = (ch.content === '' && !ch.base64) ? '\n' : ch.content;
          const body = { message, branch, content: ch.base64 || utf8ToBase64(text) };
          if (existing && !Array.isArray(existing)) body.sha = existing.sha;
          const saved = await this.request('PUT', ep, body);
          putResult = saved && saved.content ? saved.content : null;
        }
        return {
          empty: false, mode: 'single', changes, message,
          downloadUrl: putResult && putResult.download_url,
          text: `Committed to ${owner}/${name}@${branch}: "${message}"`
        };
      });
    }

    const ref  = await this.request('GET', `${base}/git/ref/heads/${branch}`, null, { fresh: true });
    const head = await this.request('GET', `${base}/git/commits/${ref.object.sha}`, null, { fresh: true });
    const tree = changes.map((ch) => {
      if (ch.content === null) return { path: ch.path, mode: '100644', type: 'blob', sha: null };
      if (ch.sha) return { path: ch.path, mode: ch.mode || '100644', type: 'blob', sha: ch.sha };
      const text = (ch.content === '' && !ch.base64) ? '\n' : ch.content;
      return { path: ch.path, mode: '100644', type: 'blob', content: ch.base64 || text };
    });
    const newTree = await this.request('POST', `${base}/git/trees`, { base_tree: head.tree.sha, tree });
    const newCommit = await this.request('POST', `${base}/git/commits`, { message, tree: newTree.sha, parents: [ref.object.sha] });
    await this.request('PATCH', `${base}/git/refs/heads/${branch}`, { sha: newCommit.sha, force: false });

    return {
      empty: false, mode: 'atomic', changes, message,
      text: `Atomic commit of ${changes.length} change(s) → ${owner}/${name}@${branch}`,
      commitSha: newCommit.sha, commit: newCommit
    };
  }

}

/* Expose the repo layer to the UI script loaded after this file. */
window.GitHubRepo = GitHubRepo;
window.ApiError = ApiError;
window.utf8ToBase64 = utf8ToBase64;
window.base64ToUtf8 = base64ToUtf8;
window.base64ToBytes = base64ToBytes;
window.bytesToBase64 = bytesToBase64;
