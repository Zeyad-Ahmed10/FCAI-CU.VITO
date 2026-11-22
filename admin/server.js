// أداة الإدارة المحلية: بتشتغل على جهازك بس. لا تحتاج تثبيت أي حاجة غير Node.js
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), CF = path.join(ROOT, 'content.json'), FD = path.join(ROOT, 'files');
const PORT = 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const read = () => { try { return JSON.parse(fs.readFileSync(CF, 'utf8')); } catch { return { courses: [] }; } };
const localFiles = (d) => { const s = new Set(); (d.courses || []).forEach((c) => c.sections.forEach((x) => x.materials.forEach((m) => { if (m.url && m.url.startsWith('files/')) s.add(m.url); }))); return s; };
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });

fs.mkdirSync(FD, { recursive: true });
http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/admin' || p === '/admin/') { res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(fs.readFileSync(path.join(__dirname, 'admin.html'))); }
  if (p === '/api/content' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': MIME['.json'] }); return res.end(JSON.stringify(read())); }
  if (p === '/api/content' && req.method === 'POST') {
    const next = JSON.parse(await body(req)), old = localFiles(read()), keep = localFiles(next);
    fs.writeFileSync(CF, JSON.stringify(next, null, 2));
    old.forEach((f) => { if (!keep.has(f)) fs.rm(path.join(ROOT, f), { force: true }, () => {}); }); // يمسح الملفات اللي اتشالت
    return res.end('ok');
  }
  if (p === '/api/upload' && req.method === 'POST') {
    const raw = decodeURIComponent(req.headers['x-filename'] || 'file');
    const name = Date.now() + '-' + path.basename(raw).replace(/[^\w.\-\u0600-\u06FF]+/g, '_');
    const out = fs.createWriteStream(path.join(FD, name));
    req.pipe(out);
    out.on('finish', () => { res.writeHead(200, { 'Content-Type': MIME['.json'] }); res.end(JSON.stringify({ url: 'files/' + name })); });
    return;
  }
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  const size = fs.statSync(file).size, type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', r = req.headers.range;
  if (r) {
    const m = /bytes=(\d*)-(\d*)/.exec(r); const s = m[1] ? +m[1] : 0, e = m[2] ? +m[2] : size - 1;
    res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': type });
    fs.createReadStream(file, { start: s, end: e }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': size, 'Content-Type': type, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  }
}).listen(PORT, () => console.log(`\nالموقع:  http://localhost:${PORT}\nالإدارة: http://localhost:${PORT}/admin\n(اقفل النافذة دي لما تخلص)`));
