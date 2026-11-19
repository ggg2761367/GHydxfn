'use strict';
/**
 * 博客管理后台（本地）
 * - 只监听 127.0.0.1，不对外网开放
 * - 网页里改站点信息 / 头像 / 文章，保存即 commit + push 到 main
 * - 内置本地实时预览与一键发布
 *
 * 启动：node tools/blog-admin/server.js
 * 测试：BLOG_ADMIN_ROOT=临时目录 node tools/blog-admin/server.js
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = process.env.BLOG_ADMIN_ROOT
  ? path.resolve(process.env.BLOG_ADMIN_ROOT)
  : path.resolve(__dirname, '..', '..');
const IS_WIN = process.platform === 'win32';
const CONFIG = path.join(ROOT, '_config.yml');
const THEME = path.join(ROOT, '_config.butterfly.yml');
const POSTS = path.join(ROOT, 'source', '_posts');
const UPLOADS = path.join(ROOT, 'source', 'img', 'uploads');
const BIN = path.join(ROOT, 'node_modules', '.bin');
const HEXO = path.join(BIN, IS_WIN ? 'hexo.cmd' : 'hexo');
const BS = path.join(BIN, IS_WIN ? 'browser-sync.cmd' : 'browser-sync');
const PORT = Number(process.env.BLOG_ADMIN_PORT || 7788);
const HOST = '127.0.0.1';
const UI = path.join(__dirname, 'ui.html');

/* ---------------- 子进程 ---------------- */
function run(bin, args, opts = {}) {
  return new Promise(resolve => {
    const child = spawn(bin, args, {
      cwd: ROOT,
      shell: IS_WIN && /\.(cmd|bat)$/i.test(bin),
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      ...opts
    });
    let out = '';
    const collect = d => { out += d.toString(); };
    if (child.stdout) child.stdout.on('data', collect);
    if (child.stderr) child.stderr.on('data', collect);
    child.on('error', e => resolve({ code: -1, out: out + '\n' + e.message }));
    child.on('close', code => resolve({ code, out }));
  });
}

function killTree(pid) {
  if (!pid) return;
  spawn(IS_WIN ? 'taskkill' : 'kill', IS_WIN ? ['/PID', String(pid), '/T', '/F'] : ['-9', String(pid)], {
    windowsHide: true, stdio: 'ignore'
  });
}

/* ---------------- YAML 局部读写 ---------------- */
function unquote(v) {
  v = String(v || '').trim();
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    v = v.slice(1, -1).replace(/''/g, "'").replace(/\\"/g, '"');
  }
  return v;
}
function readTop(text, key) {
  const m = text.match(new RegExp('^' + key + ':[ \\t]*(.*)$', 'm'));
  return m ? unquote(m[1]) : '';
}
function quoteYaml(v) {
  v = String(v).replace(/\r?\n/g, ' ').trim();
  if (!v) return "''";
  if (/^[A-Za-z0-9一-龥 _\-.()（）!?，。]+$/.test(v) && !/^[-?:,\[\]{}#&*!|>'"%@`]/.test(v)) return v;
  return JSON.stringify(v);
}
function setTop(text, key, value) {
  const line = key + ': ' + quoteYaml(value);
  const re = new RegExp('^' + key + ':[ \\t]*.*$', 'm');
  if (re.test(text)) return text.replace(re, line);
  return text.replace(/\s*$/, '\n') + line + '\n';
}
function getAvatar(text) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex(l => /^avatar:\s*$/.test(l));
  if (i < 0) return '';
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() && !/^\s+\S/.test(lines[j])) break;
    const m = lines[j].match(/^\s+img:\s*(.*)$/);
    if (m) return unquote(m[1]);
  }
  return '';
}
function setAvatar(text, value) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex(l => /^avatar:\s*$/.test(l));
  if (i < 0) return text + '\navatar:\n  img: ' + value + '\n  effect: false\n';
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() && !/^\s+\S/.test(lines[j])) break;
    if (/^\s+img:\s*/.test(lines[j])) {
      lines[j] = lines[j].replace(/^(\s+)img:.*$/, '$1img: ' + value);
      return lines.join('\n');
    }
  }
  lines.splice(i + 1, 0, '  img: ' + value);
  return lines.join('\n');
}
function rootOf(cfg) {
  const r = readTop(cfg, 'root') || '/';
  return r.endsWith('/') ? r : r + '/';
}
function webUrl(root, p) {
  if (!p || /^(https?:)?\/\//.test(p) || p.startsWith('data:')) return p;
  return root + p.replace(/^\/+/, '');
}

/* ---------------- 文章 front-matter ---------------- */
function normalizeList(v) {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  return String(v || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
}
function parseBlocks(fm) {
  const blocks = [];
  let cur = null;
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (m) {
      cur = { key: m[1], lines: [line] };
      blocks.push(cur);
    } else if (cur) {
      cur.lines.push(line);
    } else if (line.trim()) {
      blocks.push({ key: '', lines: [line] });
    }
  }
  return blocks;
}
function scalarOf(blocks, key) {
  const b = blocks.find(x => x.key === key);
  if (!b) return '';
  return unquote(b.lines[0].replace(new RegExp('^' + key + ':[ \\t]*'), ''));
}
function listOf(blocks, key) {
  const b = blocks.find(x => x.key === key);
  if (!b) return [];
  const first = b.lines[0].replace(new RegExp('^' + key + ':[ \\t]*'), '').trim();
  if (first) {
    let v = first;
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
    return v.split(/[,，、]/).map(s => unquote(s.trim())).filter(Boolean);
  }
  return b.lines.slice(1)
    .map(l => (l.match(/^\s*-\s*(.*)$/) || [])[1])
    .filter(v => v !== undefined)
    .map(v => unquote(v.trim()).replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}
function splitFrontMatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(String(text || ''));
  if (!m) return { blocks: [], body: String(text || '') };
  return { blocks: parseBlocks(m[1]), body: String(text).slice(m[0].length) };
}
function serializePost(blocks, meta, body) {
  const known = new Set(['title', 'date', 'cover', 'categories', 'tags']);
  const out = [];
  const seen = new Set();
  for (const b of blocks) {
    if (!known.has(b.key)) {
      if (b.key) out.push(...b.lines);
      continue;
    }
    seen.add(b.key);
    if (b.key === 'title' && meta.title) out.push('title: ' + quoteYaml(meta.title));
    if (b.key === 'date' && meta.date) out.push('date: ' + String(meta.date).trim());
    if (b.key === 'cover' && meta.cover) out.push('cover: ' + String(meta.cover).trim());
    if (b.key === 'categories') {
      const l = normalizeList(meta.categories);
      if (l.length) out.push('categories: [' + l.map(quoteYaml).join(', ') + ']');
    }
    if (b.key === 'tags') {
      const l = normalizeList(meta.tags);
      if (l.length) out.push('tags: [' + l.map(quoteYaml).join(', ') + ']');
    }
  }
  if (!seen.has('title') && meta.title) out.push('title: ' + quoteYaml(meta.title));
  if (!seen.has('date') && meta.date) out.push('date: ' + String(meta.date).trim());
  if (!seen.has('cover') && meta.cover) out.push('cover: ' + String(meta.cover).trim());
  const cats = normalizeList(meta.categories);
  if (!seen.has('categories') && cats.length) out.push('categories: [' + cats.map(quoteYaml).join(', ') + ']');
  const tags = normalizeList(meta.tags);
  if (!seen.has('tags') && tags.length) out.push('tags: [' + tags.map(quoteYaml).join(', ') + ']');
  return '---\n' + out.join('\n') + '\n---\n\n' + String(body || '').replace(/^\s*\n+/, '');
}

/* ---------------- 站点信息 ---------------- */
async function readSite() {
  const [cfg, theme] = await Promise.all([
    fsp.readFile(CONFIG, 'utf8'),
    fsp.readFile(THEME, 'utf8')
  ]);
  const root = rootOf(cfg);
  const avatar = getAvatar(theme);
  return {
    title: readTop(cfg, 'title'),
    subtitle: readTop(cfg, 'subtitle'),
    author: readTop(cfg, 'author'),
    description: readTop(cfg, 'description'),
    root,
    avatar,
    avatarUrl: avatar ? (/^(https?:)?\/\//.test(avatar) ? avatar : '/preview' + avatar) : ''
  };
}

function servePreviewAsset(rel) {
  const clean = path.normalize('/' + String(rel || '')).replace(/^[/\\]+/, '');
  if (clean.split(/[\\/]+/).includes('..')) return null;
  for (const base of [path.join(ROOT, 'source'), path.join(ROOT, 'public')]) {
    const full = path.join(base, clean);
    if (full.startsWith(base + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript'
};

/* ---------------- Git ---------------- */
async function commitPush(message) {
  const add = await run('git', ['add', '-A']);
  if (add.code !== 0) return { ok: false, changed: false, log: 'git add 失败\n' + add.out };
  const diff = await run('git', ['diff', '--cached', '--quiet']);
  if (diff.code === 0) return { ok: true, changed: false, log: '没有需要提交的改动' };
  if (diff.code !== 1) return { ok: false, changed: false, log: 'git diff 失败\n' + diff.out };

  const commit = await run('git', ['commit', '-m', message]);
  if (commit.code !== 0) return { ok: false, changed: true, log: 'git commit 失败\n' + commit.out };
  const push = await run('git', ['push', 'origin', 'main']);
  return {
    ok: push.code === 0,
    changed: true,
    log: (commit.out + '\n' + push.out).trim()
  };
}

/* ---------------- 图片 ---------------- */
const MIME_EXT = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' };
async function saveImage(dataUrl, prefix) {
  const m = /^data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('不支持的图片格式（仅 png/jpg/webp/gif）');
  const ext = MIME_EXT[m[1].toLowerCase()];
  if (!ext) throw new Error('不支持的图片格式：' + m[1]);
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length) throw new Error('图片内容为空');
  if (buf.length > 5 * 1024 * 1024) throw new Error('图片超过 5MB');
  await fsp.mkdir(UPLOADS, { recursive: true });
  const name = Date.now() + '-' + crypto.randomBytes(3).toString('hex') + '.' + ext;
  await fsp.writeFile(path.join(UPLOADS, name), buf);
  return '/img/uploads/' + name;
}

/* ---------------- 预览 ---------------- */
const preview = { procs: [], running: false, url: '' };
function portFree(port) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function pickPort(start) {
  for (let p = start; p < start + 20; p++) {
    if (await portFree(p)) return p;
  }
  throw new Error('找不到可用的预览端口');
}
async function startPreview() {
  if (preview.running) return { ok: true, already: true, url: preview.url };
  const hexoPort = await pickPort(4000);
  const bsPort = await pickPort(hexoPort + 1);
  const p1 = spawn(HEXO, ['server', '-p', String(hexoPort)],
    { cwd: ROOT, shell: IS_WIN, windowsHide: true, stdio: 'ignore', env: process.env });
  const p2 = spawn(BS, ['start', '--proxy', 'http://localhost:' + hexoPort, '--startPath', '/GHydxfn/',
    '--files', 'source/**/*,themes/**/*,_config*.yml', '--port', String(bsPort), '--watch', '--no-notify', '--no-open'],
    { cwd: ROOT, shell: IS_WIN, windowsHide: true, stdio: 'ignore', env: process.env });
  preview.procs = [p1, p2];
  preview.running = true;
  preview.url = 'http://localhost:' + bsPort + '/GHydxfn/';
  return { ok: true, url: preview.url, hexoPort, bsPort };
}
function stopPreview() {
  preview.procs.forEach(p => { try { killTree(p.pid); } catch (_) {} });
  preview.procs = [];
  preview.running = false;
  preview.url = '';
  return { ok: true };
}

/* ---------------- 发布任务 ---------------- */
let job = { running: false, log: '', code: null };
async function publish() {
  if (job.running) return false;
  job = { running: true, log: '', code: null };
  const steps = [
    ['清理旧构建', ['clean']],
    ['生成网页', ['generate']],
    ['上传到 GitHub Pages', ['deploy']]
  ];
  for (const [name, args] of steps) {
    job.log += '\n>>> ' + name + '\n';
    const r = await run(HEXO, args);
    job.log += r.out + '\n';
    if (r.code !== 0) {
      job.log += '[失败] ' + name + '，退出码 ' + r.code;
      job.running = false;
      job.code = r.code;
      return true;
    }
  }
  job.log += '\n>>> 同步源码到 main\n';
  const c = await commitPush('后台发布 ' + new Date().toLocaleString('zh-CN'));
  job.log += c.log;
  job.running = false;
  job.code = c.ok ? 0 : 1;
  job.log += c.ok ? '\n[完成] 线上约 1-2 分钟后更新' : '\n[失败] 源码同步失败，但 Pages 可能已更新';
  return true;
}

/* ---------------- HTTP ---------------- */
function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}
function json(res, code, obj) { send(res, code, JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 12 * 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}
function safePost(file) {
  const base = path.basename(String(file || ''));
  if (!/\.md$/i.test(base)) throw new Error('只允许 .md 文件');
  const full = path.join(POSTS, base);
  if (!full.startsWith(POSTS + path.sep)) throw new Error('非法路径');
  return { base, full };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      return send(res, 200, await fsp.readFile(UI), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && p.startsWith('/preview/')) {
      const file = servePreviewAsset(decodeURIComponent(p.slice('/preview/'.length)));
      if (!file) return json(res, 404, { ok: false, error: '文件不存在' });
      return send(res, 200, await fsp.readFile(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    }
    if (req.method === 'GET' && p === '/api/site') return json(res, 200, await readSite());

    if (req.method === 'POST') {
      // 只接受同源页面发起的 JSON 请求，阻断第三方网页 CSRF
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
        return json(res, 403, { ok: false, error: '禁止跨站请求' });
      }
      const body = await readBody(req);

      if (p === '/api/site') {
        let cfg = await fsp.readFile(CONFIG, 'utf8');
        if (typeof body.title === 'string') cfg = setTop(cfg, 'title', body.title);
        if (typeof body.subtitle === 'string') cfg = setTop(cfg, 'subtitle', body.subtitle);
        if (typeof body.author === 'string') cfg = setTop(cfg, 'author', body.author);
        await fsp.writeFile(CONFIG, cfg);
        const r = await commitPush('后台更新站点信息 ' + new Date().toLocaleString('zh-CN'));
        return json(res, 200, { ok: r.ok, ...r, site: await readSite() });
      }

      if (p === '/api/avatar') {
        const webPath = await saveImage(body.dataUrl, 'avatar-');
        let theme = await fsp.readFile(THEME, 'utf8');
        theme = setAvatar(theme, webPath);
        await fsp.writeFile(THEME, theme);
        const r = await commitPush('后台更新头像');
        return json(res, 200, { ok: r.ok, ...r, avatarUrl: '/preview' + webPath });
      }

      if (p === '/api/upload') {
        const webPath = await saveImage(body.dataUrl, 'img-');
        const cfg = await fsp.readFile(CONFIG, 'utf8');
        return json(res, 200, {
          ok: true,
          path: webPath,
          url: webUrl(rootOf(cfg), webPath),
          markdown: '![](' + webPath + ')'
        });
      }

      if (p === '/api/post') {
        const { base, full } = safePost(body.file);
        const old = await fsp.readFile(full, 'utf8').catch(() => '');
        const { blocks } = splitFrontMatter(old);
        const content = serializePost(blocks, body.meta || {}, body.body || '');
        await fsp.mkdir(POSTS, { recursive: true });
        await fsp.writeFile(full, content, 'utf8');
        const r = await commitPush('后台保存文章 ' + base);
        return json(res, 200, { ok: r.ok, ...r });
      }

      if (p === '/api/post/new') {
        const title = String(body.title || '').trim();
        if (!title) throw new Error('请输入标题');
        const base = title.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) + '.md';
        const { full } = safePost(base);
        if (fs.existsSync(full)) throw new Error('同名文章已存在');
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        await fsp.mkdir(POSTS, { recursive: true });
        await fsp.writeFile(full, serializePost([], {
          title,
          date,
          cover: '',
          categories: normalizeList(body.categories),
          tags: normalizeList(body.tags)
        }, body.body || ''), 'utf8');
        const r = await commitPush('后台新建文章 ' + base);
        return json(res, 200, { ok: r.ok, ...r, file: base });
      }

      if (p === '/api/preview/start') return json(res, 200, await startPreview());
      if (p === '/api/preview/stop') return json(res, 200, stopPreview());
      if (p === '/api/publish') { publish(); return json(res, 200, { ok: true, started: true }); }

      if (p === '/api/fix-hosts') {
        const bat = path.join(__dirname, '..', 'legacy', '修复本机访问.bat');
        if (!fs.existsSync(bat)) throw new Error('缺少 tools/legacy/修复本机访问.bat');
        spawn('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath '${bat}' -Verb RunAs`], { windowsHide: true, stdio: 'ignore' });
        return json(res, 200, { ok: true, message: '已弹出管理员授权窗口，请点“是”' });
      }
    }

    if (req.method === 'GET' && p === '/api/posts') {
      await fsp.mkdir(POSTS, { recursive: true });
      const files = (await fsp.readdir(POSTS)).filter(f => /\.md$/i.test(f));
      const list = [];
      for (const f of files) {
        const text = await fsp.readFile(path.join(POSTS, f), 'utf8');
        const { blocks } = splitFrontMatter(text);
        list.push({
          file: f,
          title: scalarOf(blocks, 'title') || f,
          date: scalarOf(blocks, 'date'),
          categories: listOf(blocks, 'categories'),
          tags: listOf(blocks, 'tags')
        });
      }
      list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return json(res, 200, { ok: true, posts: list });
    }
    if (req.method === 'GET' && p === '/api/taxonomy') {
      await fsp.mkdir(POSTS, { recursive: true });
      const files = (await fsp.readdir(POSTS)).filter(f => /\.md$/i.test(f));
      const cats = new Set(), tags = new Set();
      for (const f of files) {
        const { blocks } = splitFrontMatter(await fsp.readFile(path.join(POSTS, f), 'utf8'));
        listOf(blocks, 'categories').forEach(x => cats.add(x));
        listOf(blocks, 'tags').forEach(x => tags.add(x));
      }
      return json(res, 200, { ok: true, categories: [...cats].sort(), tags: [...tags].sort() });
    }
    if (req.method === 'GET' && p === '/api/post') {
      const { full } = safePost(url.searchParams.get('file'));
      const { blocks, body } = splitFrontMatter(await fsp.readFile(full, 'utf8'));
      return json(res, 200, {
        ok: true,
        meta: {
          title: scalarOf(blocks, 'title'),
          date: scalarOf(blocks, 'date'),
          cover: scalarOf(blocks, 'cover'),
          categories: listOf(blocks, 'categories'),
          tags: listOf(blocks, 'tags')
        },
        body
      });
    }
    if (req.method === 'GET' && p === '/api/preview') {
      return json(res, 200, { ok: true, running: preview.running, url: preview.url });
    }
    if (req.method === 'GET' && p === '/api/job') return json(res, 200, job);

    return json(res, 404, { ok: false, error: 'Not Found' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  博客管理后台已启动：http://' + HOST + ':' + PORT + '/');
  console.log('  关闭本窗口即停止服务');
  console.log('');
});

process.on('SIGINT', () => { stopPreview(); process.exit(0); });
process.on('SIGTERM', () => { stopPreview(); process.exit(0); });
process.on('exit', () => { if (preview.running) stopPreview(); });
