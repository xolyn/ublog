const DOCS_REDIRECT_DEFAULT =
  'https://github.com/zhoulingyu/ublog-cf/blob/main/design.md#api';

const DEFAULT_MENU = Object.freeze({
  首页: '/',
  写作: '/new',
  搜索: '/search',
  标签: '/tags',
  管理: '/admin',
});

const DEFAULT_MENU_JSON = JSON.stringify(DEFAULT_MENU);
function defaultMenu() {return { ...DEFAULT_MENU };}

/** 与 reference/styles.css 一致（内联，因 Worker 无静态 styles.css 路径） */
const UBLOG_CSS = `
@import url('https://static.zlybox.eu.org/sample/style.css');
:root{--nav-height: 3rem;}
nav {display: flex;align-items: center;height: var(--nav-height);padding: 0 1rem;box-sizing: border-box;position: fixed;top:0;left:0;width:100dvw;gap: .5rem;background: #f8f8f8;}
nav h2 {margin: 0;font-size: 1.1rem;font-weight: 600;}
nav img {height: 70%;}
nav select {margin-left: auto;font-size:large;}
main{margin-top: calc(var(--nav-height) + 1rem);padding: 0 1rem 2rem;max-width: 48rem;margin-left: auto;margin-right: auto;}
main::before{content: attr(id);font-weight: bold;display: block;font-size: xx-large;width:100%;}
.post-row {display: flex;justify-content: space-between;align-items: baseline;gap: 1rem;padding: 0.35rem 0;border-bottom: 1px solid #eee;}
.post-row a { flex-shrink: 0; }
.post-row time, .post-row .post-meta { color: #666; font-size: 0.9rem; white-space: nowrap; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
.tag-cloud a {padding: 0.2rem 0.6rem;background: #eee;border-radius: 4px;text-decoration: none;color: inherit;}
.tag-cloud a:hover { background: #ddd; }
article .content { margin-top: 0.75rem; }
label { display: block; margin-top: 0.75rem; font-weight: 600; }
textarea, input[type="text"], input[type="password"], input[type="number"] {width: 100%;resize: vertical;box-sizing: border-box;}
textarea { min-height: 8rem; font-family: ui-monospace, monospace; font-size: 0.9rem; }
button { margin-top: 0.5rem; margin-right: 0.5rem; padding: 0.4rem 0.9rem; cursor: pointer; }
`;

function buildMenuOptions(menuObj) {
  const m = menuObj && typeof menuObj === 'object' && Object.keys(menuObj).length ? menuObj : defaultMenu();
  return Object.entries(m)
    .map(([name, href]) => `<option value="${escapeHtml(href)}">${escapeHtml(name)}</option>`)
    .join('\n    ');
}

function pageShell({ title, global: g, mainId, bodyHtml, extraHead = '', addComment = false }) {
  const favicon = g.favicon
    ? `<link rel="icon" href="${escapeHtml(g.favicon)}">`
    : '';
  const menuOpts = buildMenuOptions(g.menu);
  const comment = addComment ? (g.comment || '') : '';
  const footerExtra = g.footer || '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(g.about || '')}">
<meta name="keywords" content="${escapeHtml(g.seo || '')}">
${favicon}
<style>
${UBLOG_CSS}
</style>
${g.header || ''}
${extraHead}
</head>
<body>
<nav>
  <h2 title="${g.about}"><a href="/" style="text-decoration:none;color:inherit;">${escapeHtml(g.title)}</a></h2>
  <select name="menu" id="ublog-nav-menu" onchange="if(this.value) window.location.href = this.value;">
    <option value="" selected disabled>菜单</option>
    ${menuOpts}
  </select>
</nav>
<main id="${escapeHtml(mainId)}">
${bodyHtml}
</main>
${comment}
<footer>
${footerExtra}
</footer>
<script>
(function(){
  function normPath(u){
    var p = (u || '/').replace(/\\.html?$/i,'');
    if(!p || p === '/') return '/';
    if(p === '/index') return '/';
    return p;
  }
  var sel = document.getElementById('ublog-nav-menu');
  if(!sel) return;
  var path = normPath(location.pathname);
  for(var i=0;i<sel.options.length;i++){
    var v = sel.options[i].value;
    if(!v) continue;
    try {
      var p = normPath(new URL(v, location.origin).pathname);
      if(p === path){ sel.selectedIndex = i; break; }
    } catch(e){}
  }
})();
</script>
</body>
</html>`;
}

// ---------- 工具 ----------

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 嵌入 HTML 的 <script> 内时，避免 comment 等字段里的 </script> 截断标签 */
function jsonForInlineHtml(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...init.headers,
    },
  });
}

function textResponse(html, init = {}) {
  return new Response(html, {
    ...init,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...corsHeaders(),
      ...init.headers,
    },
  });
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-max-age': '86400',
  };
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseBasicAuth(request) {
  const h = request.headers.get('authorization');
  if (!h || !h.toLowerCase().startsWith('basic ')) return null;
  try {
    const raw = atob(h.slice(6).trim());
    const i = raw.indexOf(':');
    if (i < 0) return null;
    return { user: raw.slice(0, i), pass: raw.slice(i + 1) };
  } catch {
    return null;
  }
}

function verifyBearer(request, env) {
  if (!env.API_TOKEN) return false;
  const h = request.headers.get('authorization');
  if (!h || !h.toLowerCase().startsWith('bearer ')) return false;
  const token = h.slice(7).trim();
  return token === env.API_TOKEN;
}

function verifyAdmin(request, env) {
  if (verifyBearer(request, env)) return true;
  const b = parseBasicAuth(request);
  if (!b) return false;
  return b.user === env.USERNAME && b.pass === env.PASSWORD;
}

function requireWriteAuth(request, env) {
  if (env.API_TOKEN) {
    if (verifyBearer(request, env)) return true;
    if (verifyAdmin(request, env)) return true;
    return false;
  }
  return verifyAdmin(request, env);
}

async function readJsonBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizePath(pathname) {
  let p = pathname;
  if (p.endsWith('/') && p.length > 1) p = p.slice(0, -1);
  if (p.endsWith('.html')) p = p.slice(0, -5);
  return p || '/';
}

/** 与 schema.sql 保持一致；空库首次请求时自动建表 */
/**
 * DDL 保持极简：不在 SQL 字面量里塞 HTML / 单引号，
 * 默认内容通过下面参数化的 INSERT OR IGNORE 注入，避免 SQLite 字符串转义问题。
 */
const DDL_CONFIG = `CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT NOT NULL DEFAULT '',
  about TEXT DEFAULT '',
  seo TEXT DEFAULT '',
  header TEXT DEFAULT '',
  comment TEXT DEFAULT '',
  footer TEXT DEFAULT '',
  favicon TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  menu TEXT DEFAULT '',
  page404 TEXT DEFAULT '',
  extra TEXT DEFAULT ''
)`;

const DDL_POSTS = `CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL,
  modified TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  tags TEXT DEFAULT '',
  comments INTEGER NOT NULL DEFAULT 1,
  hash TEXT DEFAULT '',
  extra TEXT DEFAULT '{}'
)`;

const DEFAULT_CONFIG = {
  title: 'uBlog',
  about: 'uBlog is a simple, extreme lightweight yet elegant blog system built with Cloudflare Worker and D1.',
  seo: 'uBlog, Cloudflare Worker, D1',
  header: '',
  comment: '',
  footer:'',
  favicon: 'https://zhoulingyu.net/seologo.png',
  logo: 'https://zhoulingyu.net/seologo.png',
  menu: DEFAULT_MENU_JSON,
  page404: '<b>404</b>',
  extra: '{}',
};

async function ensureDbSchema(env) {
  if (!env.DB) {
    throw new Error('D1 binding missing: set [[d1_databases]] binding = "DB" in wrangler.toml');
  }
  if (globalThis.__ublog_d1_schema_ok) return;
  await env.DB.batch([env.DB.prepare(DDL_CONFIG), env.DB.prepare(DDL_POSTS)]);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO config
      (id, title, about, seo, header, comment, footer, favicon, logo, menu, page404, extra)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      DEFAULT_CONFIG.title,
      DEFAULT_CONFIG.about,
      DEFAULT_CONFIG.seo,
      DEFAULT_CONFIG.header,
      DEFAULT_CONFIG.comment,
      DEFAULT_CONFIG.footer,
      DEFAULT_CONFIG.favicon,
      DEFAULT_CONFIG.logo,
      DEFAULT_CONFIG.menu,
      DEFAULT_CONFIG.page404,
      DEFAULT_CONFIG.extra,
    )
    .run();
  globalThis.__ublog_d1_schema_ok = true;
}

// ---------- GLOBAL（config 单行） ----------

async function loadGlobal(env) {
  const row = await env.DB.prepare(
    'SELECT title, about, seo, header, comment, footer, favicon, logo, menu, page404, extra FROM config WHERE id = 1',
  ).first();
  if (!row) {
    return {
      title: 'uBlog',
      about: 'uBlog is a simple and elegant blog system built with Cloudflare Worker and D1.',
      seo: 'uBlog, Cloudflare Worker, D1',
      header: '',
      comment: '',
      footer: '',
      favicon: '',
      logo: '',
      menu: defaultMenu(),
      page404: '<b>404</b>',
      extra: {},
    };
  }
  const g = { ...row };
  g.menu = parseJsonField(row.menu, defaultMenu());
  g.extra = parseJsonField(row.extra, {});
  delete g.page404;
  g.html404 = row.page404 ?? '<b>404</b>';
  return g;
}

function parseJsonField(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function globalToConfigJson(global) {
  return {
    title: global.title,
    about: global.about,
    seo: global.seo,
    header: global.header,
    comment: global.comment,
    footer: global.footer,
    favicon: global.favicon,
    logo: global.logo,
    menu: global.menu,
    404: global.html404,
    extra:
      typeof global.extra === 'object' && global.extra !== null
        ? global.extra
        : parseJsonField(global.extra, {}),
  };
}

// ---------- API 函数 ----------

async function apiDocs(request, env) {
  const url = env.DOCS_URL || DOCS_REDIRECT_DEFAULT;
  return Response.redirect(url, 302);
}

async function apiGetPosts(url, env) {
  const sp = url.searchParams;
  const kw = sp.get('kw')?.trim() || '';
  const tag = sp.get('tag')?.trim() || '';
  const sort = (sp.get('sort') || 'modified').toLowerCase();
  const order = (sp.get('order') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);

  const conds = ['status = 0'];
  const binds = [];
  if (kw) {
    conds.push("(title || '\n' || content) LIKE ?");
    binds.push(`%${kw}%`);
  }
  if (tag) {
    conds.push('tags LIKE ?');
    binds.push(`%${tag}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  let orderSql = 'ORDER BY modified DESC';
  if (sort === 'modified') orderSql = `ORDER BY modified ${order}`;
  else if (sort === 'created') orderSql = `ORDER BY created ${order}`;
  else if (sort === 'random') orderSql = 'ORDER BY RANDOM()';

  const sql = `SELECT id, title, author, created, modified, tags FROM posts ${where} ${orderSql} LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(results || []);
}

async function apiGetPost(url, env, request) {
  const sp = url.searchParams;
  const id = sp.get('id');
  if (!id) {
    return jsonResponse({ error: 'missing id' }, { status: 400 });
  }
  const key = sp.get('key') || '';

  const row = await env.DB.prepare(
    'SELECT id, title, author, content, created, modified, tags, comments, hash, extra, status FROM posts WHERE id = ?',
  )
    .bind(id)
    .first();

  if (!row || row.status === 2) {
    return jsonResponse({ error: 'not found' }, { status: 404 });
  }

  const isAdmin = verifyAdmin(request, env);
  if (row.status === 1 && !isAdmin) {
    return jsonResponse({ error: 'not found' }, { status: 404 });
  }

  const locked = !!(row.hash && String(row.hash).length > 0);
  if (locked) {
    if (!key) {
      return jsonResponse({ error: 'locked', code: 'LOCKED' }, { status: 403 });
    }
    const h = await sha256Hex(key);
    if (h !== row.hash) {
      return jsonResponse({ error: 'wrong password', code: 'WRONG_PASSWORD' }, { status: 403 });
    }
  }

  let extraOut = row.extra;
  try {
    if (typeof extraOut === 'string' && extraOut) JSON.parse(extraOut);
  } catch {
    extraOut = '{}';
  }

  return jsonResponse({
    id: row.id,
    title: row.title,
    author: row.author,
    content: row.content,
    created: row.created,
    modified: row.modified,
    tags: row.tags,
    comments: !!row.comments,
    extra: extraOut,
  });
}

async function apiPostPost(request, env) {
  if (!requireWriteAuth(request, env)) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await readJsonBody(request);
  if (!body.title || !body.author || !body.content) {
    return jsonResponse({ error: 'title, author, content required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const created = body.created || now;
  const modified = now;
  const status = Number.isInteger(body.status) ? body.status : 0;
  const tags = body.tags != null ? String(body.tags) : '';
  const comments = body.comments === false || body.comments === 0 ? 0 : 1;
  let hash = '';
  if (body.key) hash = await sha256Hex(String(body.key));
  const extra =
    typeof body.extra === 'object' && body.extra !== null
      ? JSON.stringify(body.extra)
      : body.extra != null
        ? String(body.extra)
        : '{}';

  let newId;
  if (body.id != null && body.id !== '') {
    const id = parseInt(body.id, 10);
    if (Number.isNaN(id)) {
      return jsonResponse({ error: 'invalid id' }, { status: 400 });
    }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO posts (id, title, author, content, created, modified, status, tags, comments, hash, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, body.title, body.author, body.content, created, modified, status, tags, comments, hash, extra)
      .run();
    const ex = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(id).first();
    if (!ex) {
      return jsonResponse({ error: 'insert ignored or failed' }, { status: 409 });
    }
    newId = id;
  } else {
    const r = await env.DB.prepare(
      `INSERT INTO posts (title, author, content, created, modified, status, tags, comments, hash, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(body.title, body.author, body.content, created, modified, status, tags, comments, hash, extra)
      .run();
    newId = r.meta?.last_row_id;
  }

  return jsonResponse({ ok: true, id: newId });
}

async function apiPutPost(request, env) {
  if (!requireWriteAuth(request, env)) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await readJsonBody(request);
  const id = body.id != null ? parseInt(body.id, 10) : NaN;
  if (Number.isNaN(id)) {
    return jsonResponse({ error: 'id required' }, { status: 400 });
  }

  const existing = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!existing) {
    return jsonResponse({ error: 'not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const title = body.title != null ? body.title : existing.title;
  const author = body.author != null ? body.author : existing.author;
  const content = body.content != null ? body.content : existing.content;
  const created = body.created != null ? body.created : existing.created;
  const modified = now;
  const status = body.status != null ? body.status : existing.status;
  const tags = body.tags != null ? String(body.tags) : existing.tags;
  const comments =
    body.comments != null ? (body.comments === false || body.comments === 0 ? 0 : 1) : existing.comments;

  let hash = existing.hash || '';
  if (Object.prototype.hasOwnProperty.call(body, 'key')) {
    if (body.key === '' || body.key == null) hash = '';
    else hash = await sha256Hex(String(body.key));
  }

  const extra =
    body.extra != null
      ? typeof body.extra === 'object'
        ? JSON.stringify(body.extra)
        : String(body.extra)
      : existing.extra;

  await env.DB.prepare(
    `UPDATE posts SET title=?, author=?, content=?, created=?, modified=?, status=?, tags=?, comments=?, hash=?, extra=? WHERE id=?`,
  )
    .bind(title, author, content, created, modified, status, tags, comments, hash, extra, id)
    .run();

  return jsonResponse({ ok: true, id });
}

async function apiDeletePost(request, env) {
  if (!requireWriteAuth(request, env)) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await readJsonBody(request);
  const id = body.id != null ? parseInt(body.id, 10) : NaN;
  if (Number.isNaN(id)) {
    return jsonResponse({ error: 'id required' }, { status: 400 });
  }
  await env.DB.prepare('UPDATE posts SET status = 2, modified = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run();
  return jsonResponse({ ok: true });
}

async function apiGetTags(url, env) {
  const kw = url.searchParams.get('kw')?.trim() || '';
  const sql = kw
    ? 'SELECT tags FROM posts WHERE status = 0 AND tags LIKE ?'
    : 'SELECT tags FROM posts WHERE status = 0';
  const stmt = kw ? env.DB.prepare(sql).bind(`%${kw}%`) : env.DB.prepare(sql);
  const { results } = await stmt.all();
  const set = new Set();
  for (const r of results || []) {
    if (!r.tags) continue;
    for (const t of String(r.tags).split(',')) {
      const x = t.trim();
      if (x) set.add(x);
    }
  }
  return jsonResponse([...set].sort());
}

async function apiGetConfig(env) {
  const g = await loadGlobal(env);
  return jsonResponse(globalToConfigJson(g));
}

async function apiPutConfig(request, env) {
  if (!requireWriteAuth(request, env)) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await readJsonBody(request);
  const cur = await loadGlobal(env);
  const merged = {
    title: body.title != null ? body.title : cur.title,
    about: body.about != null ? body.about : cur.about,
    seo: body.seo != null ? body.seo : cur.seo,
    header: body.header != null ? body.header : cur.header,
    comment: body.comment != null ? body.comment : cur.comment,
    footer: body.footer != null ? body.footer : cur.footer,
    favicon: body.favicon != null ? body.favicon : cur.favicon,
    logo: body.logo != null ? body.logo : cur.logo,
    menu:
      body.menu != null
        ? typeof body.menu === 'string'
          ? body.menu
          : JSON.stringify(body.menu)
        : JSON.stringify(cur.menu),
    page404:
      body['404'] != null
        ? body['404']
        : body.page404 != null
          ? body.page404
          : cur.html404,
    extra:
      body.extra != null
        ? typeof body.extra === 'object'
          ? JSON.stringify(body.extra)
          : String(body.extra)
        : typeof cur.extra === 'object'
          ? JSON.stringify(cur.extra)
          : String(cur.extra || '{}'),
  };

  await env.DB.prepare(
    `UPDATE config SET title=?, about=?, seo=?, header=?, comment=?, footer=?, favicon=?, logo=?, menu=?, page404=?, extra=? WHERE id = 1`,
  )
    .bind(
      merged.title,
      merged.about,
      merged.seo,
      merged.header,
      merged.comment,
      merged.footer,
      merged.favicon,
      merged.logo,
      merged.menu,
      merged.page404,
      merged.extra,
    )
    .run();

  return jsonResponse({ ok: true });
}

// ---------- HTML 页面 ----------

async function pageIndex(url, env) {
  const g = await loadGlobal(env);
  const sp = url.searchParams;
  const sort = sp.get('sort') || 'modified';
  const order = sp.get('order') || 'desc';
  const limit = sp.get('limit') || '20';
  const offset = sp.get('offset') || '0';

  const extraHead = '';
  const bodyHtml = `
<div style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;margin-bottom:0.75rem;">
  <label style="margin:0;display:flex;align-items:center;gap:0.35rem;font-weight:600;">
    排序字段
    <select id="sortField" style="font-weight:normal;">
      <option value="modified"${sort === 'modified' ? ' selected' : ''}>更新日期</option>
      <option value="created"${sort === 'created' ? ' selected' : ''}>发布日期</option>
      <option value="random"${sort === 'random' ? ' selected' : ''}>随机</option>
    </select>
  </label>
  <label style="margin:0;display:flex;align-items:center;gap:0.35rem;font-weight:600;">
    顺序
    <select id="sortOrder" style="font-weight:normal;">
      <option value="desc"${order === 'desc' ? ' selected' : ''}>从新到旧</option>
      <option value="asc"${order === 'asc' ? ' selected' : ''}>从旧到新</option>
    </select>
  </label>
</div>
<ul id="list" style="list-style:none;padding:0;margin:0;"></ul>
<div style="display:flex;gap:1rem;margin-top:1rem;align-items:center;flex-wrap:wrap;">
  <button type="button" id="prev">&larr;</button>
  <span id="pageinfo" style="color:#666;font-size:0.9rem;"></span>
  <button type="button" id="next">&rarr;</button>
</div>
<script>
  (function(){
    var sort = ${JSON.stringify(sort)};
    var order = ${JSON.stringify(order)};
    var limit = ${JSON.stringify(Number(limit) || 20)};
    var offset = ${JSON.stringify(Number(offset) || 0)};
    function syncOrderDisabled(){
      var rnd = document.getElementById('sortField').value === 'random';
      document.getElementById('sortOrder').disabled = rnd;
    }
    function pushUrl(){
      var q = new URLSearchParams({ sort: sort, order: order, limit: String(limit), offset: String(offset) });
      history.replaceState(null, '', '/' + (q.toString() ? '?' + q : ''));
    }
    function load(){
      sort = document.getElementById('sortField').value;
      order = document.getElementById('sortOrder').value;
      syncOrderDisabled();
      var q = new URLSearchParams({ sort: sort, order: order, limit: String(limit), offset: String(offset) });
      fetch('/api/posts?' + q.toString()).then(function(r){ return r.json(); }).then(function(posts){
        var ul = document.getElementById('list');
        ul.innerHTML = '';
        var timeKey = sort === 'created' ? 'created' : 'modified';
        posts.forEach(function(p){
          var li = document.createElement('li');
          li.className = 'post-row';
          var rawT = sort === 'random' ? (p.modified || p.created || '') : (p[timeKey] || p.modified || p.created || '');
          var t = rawT.indexOf('T') >= 0 ? rawT.split('T')[0] : (rawT.slice(0, 10) || rawT);
          li.innerHTML = '<a href="/post?id=' + encodeURIComponent(p.id) + '">' + (p.title || '') + '</a>' +
            '<time datetime="' + rawT + '">' + t + '</time>';
          ul.appendChild(li);
        });
        document.getElementById('pageinfo').textContent = '第 ' + (Math.floor(offset/limit)+1) + ' 页';
        pushUrl();
      });
    }
    document.getElementById('sortField').onchange = function(){ offset = 0; load(); };
    document.getElementById('sortOrder').onchange = function(){ offset = 0; load(); };
    document.getElementById('prev').onclick = function(){ offset = Math.max(0, offset - limit); load(); };
    document.getElementById('next').onclick = function(){ offset = offset + limit; load(); };
    syncOrderDisabled();
    load();
  })();
</script>`;
  return textResponse(pageShell({ title: g.title, global: g, mainId: '文章', bodyHtml, extraHead }));
}

async function pagePost(url, env) {
  const g = await loadGlobal(env);
  const id = url.searchParams.get('id');
  if (!id) {
    return textResponse(
      pageShell({
        title: '404',
        global: g,
        mainId: '404',
        bodyHtml: g.html404 || '<b>404</b>',
      }),
      { status: 404 },
    );
  }
  const extraHead = `<script src="https://fastly.jsdelivr.net/npm/marked/marked.min.js"></script>`;
  const bodyHtml = `
  <article>
    <h1 id="title" style="font-size:1.5rem;margin:0 0 0.5rem;"></h1>
    <p style="color:#666;font-size:0.9rem;margin:0 0 0.5rem;" id="meta"></p>
    <div class="tag-cloud" id="post-tags" style="margin:0 0 1rem;"></div>
    <hr><div class="content" id="content"></div><hr>
  </article>
  <script>
    (function(){
      var id = ${JSON.stringify(id)};
      function fmtIso(iso){
        if(!iso) return '';
        try {
          var d = new Date(iso);
          if(isNaN(d.getTime())) return String(iso).replace('T',' ').replace(/Z$/,'');
          var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
          var h=String(d.getHours()).padStart(2,'0'), min=String(d.getMinutes()).padStart(2,'0');
          return y+'-'+m+'-'+day+' '+h+':'+min;
        } catch(e){ return String(iso).replace('T',' ').replace(/Z$/,''); }
      }
      function renderTags(tagsStr){
        var el = document.getElementById('post-tags');
        el.innerHTML = '';
        if(!tagsStr) return;
        String(tagsStr).split(',').map(function(t){ return t.trim(); }).filter(Boolean).forEach(function(t){
          var a = document.createElement('a');
          a.href = '/search?tag=' + encodeURIComponent(t);
          a.textContent = t;
          el.appendChild(a);
        });
      }
      function fetchPost(key){
        var u = '/api/post?id=' + encodeURIComponent(id);
        if(key) u += '&key=' + encodeURIComponent(key);
        return fetch(u).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, status: r.status, j: j }; }); });
      }
      function render(data){
        document.getElementById('title').textContent = data.title || '';
        document.getElementById('meta').textContent = (data.author||'') + ' · 创建于 ' + fmtIso(data.created) + ' · 更新于 ' + fmtIso(data.modified);
        renderTags(data.tags);
        document.getElementById('content').innerHTML = marked.parse(data.content || '');
      }
      function loop(){
        fetchPost(null).then(function(res){
          if(res.ok){ render(res.j); return; }
          if(res.j && res.j.code === 'LOCKED'){
            var k = prompt('文章已上锁，请输入密码：');
            if(k === null) return;
            fetchPost(k).then(function(r2){
              if(r2.ok) render(r2.j);
              else alert('密码错误或无法加载');
            });
            return;
          }
          document.getElementById('content').textContent = res.j.error || '加载失败';
        });
      }
      loop();
    })();
  </script>`;
  return textResponse(pageShell({ title: g.title, global: g, mainId: '', bodyHtml, extraHead, addComment: true })); // manually override: dont show "文章" before main content to avoid confusion 
}

async function pageSearch(url, env) {
  const g = await loadGlobal(env);
  const kw = url.searchParams.get('kw') || '';
  const tag = url.searchParams.get('tag') || '';
  const extraHead = '';
  const bodyHtml = `
<form id="searchForm" style="width:100%; display: flex; gap:0.5rem; align-items: center;" action="/search" method="get">
  <input type="text" name="kw" id="kw" value="${escapeHtml(kw)}" placeholder="搜索文章..." style="flex:1;">
  <input type="hidden" name="tag" id="tagHidden" value="${escapeHtml(tag)}">
  <button type="submit">搜索</button>
</form>
<p id="resultLine" style="margin:1rem 0 0.5rem;color:#666;"></p>
<ul id="list" style="list-style:none;padding:0;margin:0;"></ul>
<script>
  (function(){
    var kw = ${JSON.stringify(kw)};
    var tag = ${JSON.stringify(tag)};
    function run(){
      var q = new URLSearchParams();
      var k = document.getElementById('kw').value.trim();
      var t = (document.getElementById('tagHidden') && document.getElementById('tagHidden').value) || tag;
      if(k) q.set('kw', k);
      if(t) q.set('tag', t);
      fetch('/api/posts?' + q.toString()).then(function(r){ return r.json(); }).then(function(posts){
        var label = k || t || '（全部）';
        document.getElementById('resultLine').textContent = '\\u201c' + label + '\\u201d 搜索到 ' + posts.length + ' 条结果：';
        var ul = document.getElementById('list');
        ul.innerHTML = '';
        posts.forEach(function(p){
          var li = document.createElement('li');
          li.className = 'post-row';
          li.innerHTML = '<a href="/post?id=' + encodeURIComponent(p.id) + '">' + (p.title||'') + '</a>' +
            '<time datetime="' + (p.created||'') + '">' + (p.created||'') + '</time>';
          ul.appendChild(li);
        });
      });
    }
    if(document.getElementById('searchForm')){
      document.getElementById('searchForm').addEventListener('submit', function(e){
        e.preventDefault();
        var k = document.getElementById('kw').value.trim();
        var t = tag;
        var qs = new URLSearchParams();
        if(k) qs.set('kw', k);
        if(t) qs.set('tag', t);
        history.replaceState(null,'','/search' + (qs.toString() ? '?' + qs : ''));
        run();
      });
    }
    run();
  })();
</script>`;
  return textResponse(pageShell({ title: '搜索 — ' + g.title, global: g, mainId: '搜索', bodyHtml, extraHead }));
}

async function pageTags(url, env) {
  const g = await loadGlobal(env);
  const bodyHtml = `
  <div class="tag-cloud" id="tags"></div>
  <script>
    fetch('/api/tags').then(function(r){ return r.json(); }).then(function(tags){
      var el = document.getElementById('tags');
      tags.forEach(function(t){
        var a = document.createElement('a');
        a.href = '/search?tag=' + encodeURIComponent(t);
        a.textContent = t;
        el.appendChild(a);
      });
    });
  </script>`;
  return textResponse(pageShell({ title: '标签 — ' + g.title, global: g, mainId: '标签', bodyHtml }));
}

async function pageAdmin(request, env) {
  if (!verifyAdmin(request, env)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="admin"', ...corsHeaders() },
    });
  }
  const g = await loadGlobal(env);
  const cfg = globalToConfigJson(g);
  const bodyHtml = `
  <p style="color:#666;margin:0 0 1rem;">修改后点保存。数据删除请用 API 或 D1。</p>
  <label>标题</label><input type="text" id="title"  oninput="dirty=true;"/>
  <label>关于</label><textarea id="about" oninput="dirty=true;"></textarea>
  <label>SEO 关键词</label><input type="text" id="seo"  oninput="dirty=true;"/>
  <label>Header HTML</label><textarea id="header" oninput="dirty=true;"></textarea>
  <label>Comment HTML <p style='color:gray; font-size:small'>了解如何集成<a href="https://valine.js.org/quickstart.html">Valine</a></p></label>
  <textarea id="comment" oninput="dirty=true;"></textarea>
  <label>Footer HTML</label><textarea id="footer" oninput="dirty=true;"></textarea>
  <label>Favicon URL</label><input type="text" id="favicon"  oninput="dirty=true;"/>
  <label>Logo URL</label><input type="text" id="logo"  oninput="dirty=true;"/>
  <label>Menu (JSON)</label><textarea id="menu" oninput="dirty=true;"></textarea>
  <label>404页</label><textarea id="page404" oninput="dirty=true;"></textarea>
  <label>额外字段 (JSON)</label><textarea id="extra" oninput="dirty=true;"></textarea>
  <p style='color:gray;'>若更改未见效，可能需要<a href='https://developers.cloudflare.com/cache/how-to/purge-cache/'>清除Cloudflare对应域名的cache</a></p>
  <button type="button" id="save">保存</button>
  <button type="button" id="reload" onclick="location.reload();">重新加载</button>
  <script type="application/json" id="ublog-admin-cfg">${jsonForInlineHtml(cfg)}</script>
  <script> window.addEventListener("beforeunload", (e) => {if(dirty){e.preventDefault();e.returnValue = "";}});</script>
  <script>
  var dirty = false;
    (function(){
      var cfg = JSON.parse(document.getElementById('ublog-admin-cfg').textContent);
      function fill(){
        document.getElementById('title').value = cfg.title||'';
        document.getElementById('about').value = cfg.about||'';
        document.getElementById('seo').value = cfg.seo||'';
        document.getElementById('header').value = cfg.header||'';
        document.getElementById('comment').value = cfg.comment||'';
        document.getElementById('footer').value = cfg.footer||'';
        document.getElementById('favicon').value = cfg.favicon||'';
        document.getElementById('logo').value = cfg.logo||'';
        document.getElementById('menu').value = JSON.stringify(cfg.menu||{}, null, 2);
        document.getElementById('page404').value = cfg['404']||'';
        document.getElementById('extra').value = typeof cfg.extra === 'object' ? JSON.stringify(cfg.extra||{}, null, 2) : String(cfg.extra||'');
      }
      fill();
      function authHeader(){
        var u = prompt('管理员用户名（将用于 Basic 授权头）:');
        var p = prompt('密码:');
        if(u===null||p===null) return null;
        return 'Basic ' + btoa(u + ':' + p);
      }
      document.getElementById('save').onclick = function(){
        var h = authHeader();
        if(!h) return;
        var body = {
          title: document.getElementById('title').value,
          about: document.getElementById('about').value,
          seo: document.getElementById('seo').value,
          header: document.getElementById('header').value,
          comment: document.getElementById('comment').value,
          footer: document.getElementById('footer').value,
          favicon: document.getElementById('favicon').value,
          logo: document.getElementById('logo').value,
          menu: JSON.parse(document.getElementById('menu').value || '{}'),
          '404': document.getElementById('page404').value,
          extra: JSON.parse(document.getElementById('extra').value || '{}')
        };
        fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': h }, body: JSON.stringify(body) })
          .then(function(r){ return r.json(); }).then(function(j){ if(j.ok){let dirty=false;} alert(JSON.stringify(j)); });
      };
    })();
  </script>`;
  return textResponse(pageShell({ title: '管理 — ' + g.title, global: g, mainId: '管理', bodyHtml }));
}

function editorExtraHead() {
  return `
<link rel="stylesheet" href="https://fastly.jsdelivr.net/npm/easymde/dist/easymde.min.css"/>
<script src="https://fastly.jsdelivr.net/npm/easymde/dist/easymde.min.js"></script>`;
}

/** @param {'new'|'edit'} kind @param {string|null} postId edit 时必有 */
function buildEditorBodyHtml(kind, postId) {
  const saveLabel = kind === 'new' ? '发布' : '保存';
  const isNewJs = JSON.stringify(kind === 'new');
  const urlIdJs = postId == null ? 'null' : JSON.stringify(String(postId));
  return `
  <label>标题</label><input type="text" id="title" />
  <label>作者</label><input type="text" id="author" />
  <label>正文 (Markdown)</label><textarea id="content"></textarea>
  <label>标签（逗号分隔）</label><input type="text" id="tags" />
  <label><input type="checkbox" id="allowComments" checked /> 允许评论</label>
  <label><input type="checkbox" id="changeKey" /> 修改访问密码</label>
  <input type="password" id="postKey" placeholder="新密码，留空则取消上锁" disabled />
  <label>状态（0 公开 / 1 草稿）</label><input type="number" id="status" value="0" min="0" max="1" />
  <button type="button" id="save">${saveLabel}</button>
  <script>
    (function(){
      var isNewPage = ${isNewJs};
      var urlId = ${urlIdJs};
      var easymde = new EasyMDE({
        element: document.getElementById('content'),
        spellChecker: false,
        status: false,
      });
      function md(){ return easymde.value(); }
      var editingId = urlId ? String(urlId) : null;
      document.getElementById('changeKey').onchange = function(){
        document.getElementById('postKey').disabled = !this.checked;
      };
      function authHeader(){
        var u = prompt('管理员用户名:');
        var p = prompt('密码:');
        if(u===null||p===null) return null;
        return 'Basic ' + btoa(u + ':' + p);
      }
      function goNewArticle(msg){
        if(msg) alert(msg);
        location.replace('/new');
      }
      function load(){
        if(isNewPage || !urlId){ editingId = null; return; }
        function fp(k, authHdr){
          var u = '/api/post?id=' + encodeURIComponent(urlId);
          if(k) u += '&key=' + encodeURIComponent(k);
          var h = {};
          if(authHdr) h['Authorization'] = authHdr;
          return fetch(u, Object.keys(h).length ? { headers: h } : {}).then(function(r){
            return r.json().then(function(j){ return { ok: r.ok, status: r.status, j: j }; });
          });
        }
        function fill(data){
          document.getElementById('title').value = data.title||'';
          document.getElementById('author').value = data.author||'';
          easymde.value(data.content || '');
          document.getElementById('tags').value = data.tags||'';
          document.getElementById('allowComments').checked = !!data.comments;
          editingId = data.id != null ? String(data.id) : editingId;
        }
        fp(null, null).then(function(res){
          if(res.ok){ fill(res.j); return; }
          if(res.j && res.j.code === 'LOCKED'){
            var k = prompt('文章已上锁，请输入密码：');
            if(k===null) return;
            fp(k, null).then(function(r2){
              if(!r2.ok){ alert('密码错误'); return; }
              fill(r2.j);
            });
            return;
          }
          if(res.status === 404){
            var u = prompt('若该文为草稿，请输入管理员用户名；若文章不存在请点击取消。');
            if(u===null){ goNewArticle('文章不存在。已转到新建页。'); return; }
            var p = prompt('密码：');
            if(p===null){ goNewArticle('已转到新建页。'); return; }
            var auth = 'Basic ' + btoa(u + ':' + p);
            fp(null, auth).then(function(r3){
              if(r3.ok){ fill(r3.j); return; }
              goNewArticle('文章不存在或无权访问。已转到新建页。');
            });
            return;
          }
          goNewArticle('无法加载文章。已转到新建页。');
        });
      }
      if(!isNewPage){ load(); }
      document.getElementById('save').onclick = function(){
        var h = authHeader();
        if(!h) return;
        var payload = {
          title: document.getElementById('title').value.trim(),
          author: document.getElementById('author').value.trim(),
          content: md(),
          tags: document.getElementById('tags').value,
          comments: document.getElementById('allowComments').checked,
          status: parseInt(document.getElementById('status').value, 10) || 0
        };
        if(document.getElementById('changeKey').checked){
          payload.key = document.getElementById('postKey').value;
        }
        var method, apiUrl;
        if(isNewPage){
          method = 'POST';
          apiUrl = '/api/post';
        } else {
          method = 'PUT';
          apiUrl = '/api/post';
          payload.id = editingId;
        }
        fetch(apiUrl, { method: method, headers: { 'Content-Type': 'application/json', 'Authorization': h }, body: JSON.stringify(payload) })
          .then(function(r){ return r.json(); }).then(function(j){
            alert(JSON.stringify(j));
            if(j.id) location.href = '/edit?id=' + encodeURIComponent(j.id);
          });
      };
    })();
  </script>`;
}

async function editorPageResponse(env, kind, postId) {
  const g = await loadGlobal(env);
  const bodyHtml = buildEditorBodyHtml(kind, postId);
  return textResponse(
    pageShell({
      title: (kind === 'new' ? '写作' : '编辑') + ' — ' + g.title,
      global: g,
      mainId: kind === 'new' ? '写作' : '编辑',
      bodyHtml,
      extraHead: editorExtraHead(),
    }),
  );
}

/** /new：禁止任何 query，有则重定向到纯净 /new */
async function pageNew(request, url, env) {
  if (!verifyAdmin(request, env)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="editor"', ...corsHeaders() },
    });
  }
  if ([...url.searchParams.keys()].length > 0) {
    return Response.redirect(new URL('/new', url.origin).toString(), 302);
  }
  return editorPageResponse(env, 'new', null);
}

/** /edit：必须带 ?id= */
async function pageEdit(request, url, env) {
  if (!verifyAdmin(request, env)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="editor"', ...corsHeaders() },
    });
  }
  const rawId = url.searchParams.get('id');
  if (rawId == null || String(rawId).trim() === '') {
    const g = await loadGlobal(env);
    // redirect to /new
    return Response.redirect(new URL('/new', url.origin).toString(), 302);
  }
  return editorPageResponse(env, 'edit', String(rawId).trim());
}

async function page404(env) {
  const g = await loadGlobal(env);
  return textResponse(
    pageShell({ title: '404', global: g, mainId: '404', bodyHtml: g.html404 || '<b>404</b>' }),
    { status: 404 },
  );
}

/** 用错误 Basic 触发浏览器替换缓存凭证；不依赖 D1 */
function pageLogout() {
  const html = `浏览器对 basic auth的「退出」没有标准做法，<b>不保证</b>在所有浏览器上都能成功，若重新弹出登录框，即代表成功，按「取消」即可完成登出。<br>
<button type="button" id="go">尝试清除登录状态</button>
<script>
document.getElementById('go').onclick=function(){
  fetch('/purge',{
    cache:'no-store',
    headers:{'Authorization':'Basic '+btoa('__logout__:'+String(Math.random()).slice(2))}
  }).then(function(r){
    if(r.status===401){
    }else{
      alert('session not purged, please retry');
    }
  }).catch(function(){
    alert('session not purged, please retry');
  });
};
</script>`;
  return textResponse(html);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = normalizePath(url.pathname);
      const method = request.method;

      if (method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      if (path === '/purge' && method === 'GET') {
        return new Response(null, {
          status: 401,
          headers: {
            'www-authenticate': 'Basic realm="purge"',
            ...corsHeaders(),
          },
        });
      }
      if (path === '/logout' && method === 'GET') {
        return pageLogout();
      }

      await ensureDbSchema(env);

      if (path === '/api/docs' && method === 'GET') return apiDocs(request, env);
      if (path === '/api/posts' && method === 'GET') return apiGetPosts(url, env);
      if (path === '/api/tags' && method === 'GET') return apiGetTags(url, env);
      if (path === '/api/config' && method === 'GET') return apiGetConfig(env);
      if (path === '/api/config' && method === 'PUT') return apiPutConfig(request, env);

      if (path === '/api/post' && method === 'GET') return apiGetPost(url, env, request);
      if (path === '/api/post' && method === 'POST') return apiPostPost(request, env);
      if (path === '/api/post' && method === 'PUT') return apiPutPost(request, env);
      if (path === '/api/post' && method === 'DELETE') return apiDeletePost(request, env);

      if (path === '/post' && method === 'GET') return pagePost(url, env);

      if (path === '/' || path === '/index') return pageIndex(url, env);
      if (path === '/search') return pageSearch(url, env);
      if (path === '/tags') return pageTags(url, env);
      if (path === '/admin') return pageAdmin(request, env);
      if (path === '/new') return pageNew(request, url, env);
      if (path === '/edit') return pageEdit(request, url, env);
      if (path === '/404') return page404(env);

      return page404(env);
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, { status: 500 });
    }
  },
};
