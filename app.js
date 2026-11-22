/* ===== بيانات وشجرة ===== */
let DATA = { nodes: [] }, byId = {}, parentOf = {};
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const getDone = () => new Set(JSON.parse(localStorage.getItem('done') || '[]'));
const setDone = (s) => localStorage.setItem('done', JSON.stringify([...s]));
const abs = (u) => new URL(u, location.href).href;

function migrate(d) { // يحوّل الشكل القديم (courses/sections/materials) للشجرة الجديدة
  if (d.nodes) return d;
  const f = (m) => ({ id: m.id, type: 'file', title: m.title, kind: m.type, url: m.url, note: m.note });
  return { nodes: (d.courses || []).map((c) => ({ id: c.id, type: 'folder', title: c.title, children: c.sections.map((s) => ({ id: s.id, type: 'folder', title: s.title, children: s.materials.map(f) })) })) };
}
function indexTree(nodes, parent) { nodes.forEach((n) => { byId[n.id] = n; parentOf[n.id] = parent; if (n.children) indexTree(n.children, n.id); }); }
const filesIn = (n) => (n.children || []).flatMap((c) => (c.type === 'file' ? [c] : filesIn(c)));
const chain = (id) => { const o = []; for (let p = parentOf[id]; p && p !== 'root'; p = parentOf[p]) o.unshift(byId[p]); return o; };

/* ===== أدوات ===== */
const ICON = {
  folder: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>', pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9zM15 8.5a4.5 4.5 0 0 1 0 7z"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9z"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  fs: '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z"/></svg>',
};
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, (u) => { const m = u.match(/[.,;:!?)\]]+$/); const t = m ? m[0] : ''; const c = t ? u.slice(0, -t.length) : u; return `<a href="${c}" target="_blank" rel="noopener noreferrer">${c}</a>${t}`; });
function copyText(t, btn) {
  const ok = () => { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = o), 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(ok, () => fallback()); else fallback();
  function fallback() { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); ok(); }
}
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function openUrl(f) {
  if (f.kind === 'drive') { const m = (f.url || '').match(/\/d\/([\w-]+)/); return m ? `https://drive.google.com/file/d/${m[1]}/view` : f.url; }
  return f.kind === 'youtube' ? f.url : abs(f.url || '');
}
const drivePrev = (u) => { const m = u.match(/\/d\/([\w-]+)/) || u.match(/[?&]id=([\w-]+)/); return m ? `https://drive.google.com/file/d/${m[1]}/preview` : u; };
const ytEmbed = (u) => { const m = u.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/); return m ? `https://www.youtube.com/embed/${m[1]}` : u; };

/* ===== مشغل الفيديو ===== */
function mountPlayer(box, f) {
  box.innerHTML = `<div class="player" tabindex="0"><video preload="metadata" playsinline></video><div class="osd"></div>
  <div class="ctrl"><input class="seek" type="range" min="0" max="1000" value="0" aria-label="Seek">
  <div class="bar2"><button data-a="play" aria-label="Play">${ICON.play}</button><button data-a="back" aria-label="Back 5 seconds">-5</button><button data-a="fwd" aria-label="Forward 5 seconds">+5</button>
  <button data-a="mute" aria-label="Mute">${ICON.vol}</button><input class="vol" type="range" min="0" max="100" value="100" aria-label="Volume">
  <span class="time">0:00 / 0:00</span><span class="sp"></span>
  <select class="rate" aria-label="Speed">${[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => `<option value="${r}" ${r === 1 ? 'selected' : ''}>${r}x</option>`).join('')}</select>
  <button data-a="cc" class="cc" hidden>CC</button><button data-a="fs" aria-label="Fullscreen">${ICON.fs}</button></div></div></div>`;
  const P = box.querySelector('.player'), v = P.querySelector('video'), $ = (s) => P.querySelector(s);
  const seek = $('.seek'), vol = $('.vol'), osd = $('.osd'), cc = $('.cc'), playB = $('[data-a=play]'), muteB = $('[data-a=mute]');
  v.src = f.url;
  let hover = false, idle, osdT;
  const say = (t) => { osd.textContent = t; osd.classList.add('on'); clearTimeout(osdT); osdT = setTimeout(() => osd.classList.remove('on'), 900); };
  const toggle = () => (v.paused ? v.play() : v.pause());
  const skip = (d) => { v.currentTime = Math.min(Math.max(0, v.currentTime + d), v.duration || 1e9); say((d > 0 ? '+' : '') + d + 's'); };
  const setVol = (x) => { v.muted = false; v.volume = Math.min(1, Math.max(0, x)); say('Volume ' + Math.round(v.volume * 100) + '%'); };
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fs = () => { if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else if (P.requestFullscreen) P.requestFullscreen(); else if (P.webkitRequestFullscreen) P.webkitRequestFullscreen(); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); };
  const subsOn = () => localStorage.getItem('subs') !== 'off';
  const toggleSubs = () => { const t = v.textTracks[0]; if (!t) return; const on = t.mode !== 'showing'; t.mode = on ? 'showing' : 'disabled'; localStorage.setItem('subs', on ? 'on' : 'off'); cc.classList.toggle('off', !on); say(on ? 'Subtitles on' : 'Subtitles off'); };

  v.onplay = v.onpause = () => (playB.innerHTML = v.paused ? ICON.play : ICON.pause);
  v.ontimeupdate = v.onloadedmetadata = () => { if (!seek.matches(':active')) seek.value = v.duration ? (v.currentTime / v.duration) * 1000 : 0; $('.time').textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration); };
  v.onvolumechange = () => { vol.value = v.muted ? 0 : v.volume * 100; muteB.innerHTML = v.muted || v.volume === 0 ? ICON.mute : ICON.vol; };
  v.onerror = () => { box.insertAdjacentHTML('beforeend', `<div class="err">This browser can't play this video format. MP4 (H.264) and WebM work everywhere; convert other formats to MP4.</div>`); };
  seek.oninput = () => { if (v.duration) v.currentTime = (seek.value / 1000) * v.duration; };
  vol.oninput = () => { v.muted = false; v.volume = vol.value / 100; };
  $('.rate').onchange = (e) => { v.playbackRate = +e.target.value; };
  P.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => ({ play: toggle, back: () => skip(-5), fwd: () => skip(5), mute: () => (v.muted = !v.muted), cc: toggleSubs, fs }[b.dataset.a])()));
  v.onclick = () => { P.focus({ preventScroll: true }); toggle(); };
  v.ondblclick = fs;

  // عجلة الماوس للصوت في وضع الفول سكرين بس
  P.addEventListener('wheel', (e) => { if (fsEl() !== P) return; e.preventDefault(); setVol(v.volume + (e.deltaY < 0 ? 0.05 : -0.05)); }, { passive: false });
  // الكيبورد
  P.onmouseenter = () => (hover = true); P.onmouseleave = () => (hover = false);
  const onKey = (e) => {
    if (!document.body.contains(P)) return document.removeEventListener('keydown', onKey);
    if (/TEXTAREA/.test(e.target.tagName) || e.target.type === 'text' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!(hover || fsEl() === P || P.contains(document.activeElement))) return;
    const k = e.key, map = { ' ': toggle, k: toggle, ArrowRight: () => skip(5), ArrowLeft: () => skip(-5), ArrowUp: () => setVol(v.volume + 0.05), ArrowDown: () => setVol(v.volume - 0.05), m: () => (v.muted = !v.muted), f: fs, c: toggleSubs };
    if (map[k]) { e.preventDefault(); map[k](); }
  };
  document.addEventListener('keydown', onKey);
  // إخفاء الأزرار لما الماوس يقف
  P.onmousemove = () => { P.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => { if (!v.paused) P.classList.add('idle'); }, 2500); };

  // الترجمة: SRT أو VTT، بتتركب تلقائي ولها زرار إيقاف
  if (f.subtitle) fetch(f.subtitle).then((r) => r.text()).then((t) => {
    if (!/^\s*WEBVTT/.test(t)) t = 'WEBVTT\n\n' + t.replace(/\r/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    const tr = document.createElement('track'); tr.kind = 'subtitles'; tr.label = 'Subtitles'; tr.src = URL.createObjectURL(new Blob([t], { type: 'text/vtt' }));
    v.appendChild(tr); tr.track.mode = subsOn() ? 'showing' : 'disabled';
    cc.hidden = false; cc.classList.toggle('off', !subsOn());
  }).catch(() => {});
}

/* ===== عارض النصوص والكود ===== */
const LANG = { py: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', cs: 'csharp', h: 'c', hpp: 'cpp', sh: 'bash', yml: 'yaml', kt: 'kotlin', rs: 'rust', rb: 'ruby', md: 'markdown', html: 'xml' };
const CODEEXT = 'py js jsx ts tsx java c cpp h hpp cs go rs rb php swift kt sql sh bash html css json xml yml yaml r m lua pl dart scala'.split(' ');
function mountText(box, f) {
  box.innerHTML = '<div class="loading">Loading...</div>';
  fetch(f.url).then((r) => { if (!r.ok) throw 0; return r.text(); }).then((text) => {
    const ext = (f.url.split('?')[0].split('.').pop() || '').toLowerCase();
    const lines = text.split('\n').filter((l) => l.trim());
    const codey = lines.filter((l) => /[{};]|=>|^\s*(def|class|import|from|#include|public|private|function|const|let|var|if|for|while|return)\b/.test(l)).length;
    let code = CODEEXT.includes(ext) || (ext === 'txt' && lines.length && codey / lines.length > 0.35);
    const draw = () => {
      const out = box.querySelector('.tview');
      if (code) {
        const lang = LANG[ext] || ext; let html;
        if (window.hljs) html = (hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }) : hljs.highlightAuto(text)).value; else html = esc(text);
        out.innerHTML = `<pre class="code hljs"><code>${html}</code></pre>`;
      } else out.innerHTML = `<pre class="plain">${linkify(text)}</pre>`;
      box.querySelector('[data-mode]').textContent = code ? 'Show as text' : 'Show as code';
    };
    box.innerHTML = `<div class="tbar"><button class="btn ghost sm" data-copy>Copy all</button><button class="btn ghost sm" data-mode></button></div><div class="tview"></div>`;
    box.querySelector('[data-copy]').onclick = (e) => copyText(text, e.target);
    box.querySelector('[data-mode]').onclick = () => { code = !code; draw(); };
    draw();
  }).catch(() => { box.innerHTML = '<div class="err">Could not load this file here. Use "Open in new page".</div>'; });
}

/* ===== العارض العام ===== */
function mountViewer(host, f) {
  const k = f.kind, hasUrl = !!f.url;
  const acts = `<a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(openUrl(f))}">Open in new page</a>` +
    (hasUrl && !['drive', 'youtube', 'link', 'note'].includes(k) ? ` <a class="btn ghost sm" href="${esc(abs(f.url))}" download>Download</a>` : '');
  host.innerHTML = `<div class="viewer"><div class="vhead"><h2>${esc(f.title)}</h2><div class="acts">${k === 'note' ? '' : acts}</div></div><div class="vbody"></div></div>`;
  const b = host.querySelector('.vbody'), u = esc(f.url || '');
  if (k === 'video') mountPlayer(b, f);
  else if (k === 'text') mountText(b, f);
  else if (k === 'pdf') b.innerHTML = `<iframe class="frame tall" src="${u}" title="${esc(f.title)}"></iframe>`;
  else if (k === 'office') b.innerHTML = `<iframe class="frame tall" src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(abs(f.url))}"></iframe><p class="hint">The preview works once the site is online. Use "Open in new page" or Download otherwise.</p>`;
  else if (k === 'drive') b.innerHTML = `<iframe class="frame tall" src="${esc(drivePrev(f.url))}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  else if (k === 'youtube') b.innerHTML = `<iframe class="frame" src="${esc(ytEmbed(f.url))}" allowfullscreen></iframe>`;
  else if (k === 'image') b.innerHTML = `<img class="img" src="${u}" alt="${esc(f.title)}">`;
  else if (k === 'note') { b.innerHTML = `<div class="tbar"><button class="btn ghost sm">Copy all</button></div><pre class="plain">${linkify(f.note)}</pre>`; b.querySelector('button').onclick = (e) => copyText(f.note || '', e.target); }
  else b.innerHTML = `<p class="hint">This file type can't be previewed.</p><a class="btn" href="${u}" target="_blank" rel="noopener">Open / download</a>`;
}

/* ===== الصفحات (Hub layout) ===== */
const sideEl = document.getElementById('side'), bcEl = document.getElementById('bc'), qEl = document.getElementById('q'), mainEl = document.getElementById('main');
const CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
const EXTI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>';
const KB = { video: ['VID', '#1d4ed8'], pdf: ['PDF', '#d62828'], office: ['DOC', '#0b1f4d'], text: ['TXT', '#4b5563'], image: ['IMG', '#1d4ed8'], drive: ['DRV', '#4b5563'], youtube: ['YT', '#d62828'], link: ['URL', '#4b5563'], note: ['NOTE', '#0b1f4d'] };
const PAL = ['#d62828', '#1d4ed8', '#0b1f4d', '#4b5563'];
const pal = (s) => PAL[Math.abs([...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 4];
const badge = (k) => { const [t, c] = KB[k] || [String(k || 'file').slice(0, 4).toUpperCase(), '#4b5563']; return `<span class="fb" style="background:${c}">${t}</span>`; };
const avatar = (t) => `<span class="av" style="background:${pal(t)}">${esc((String(t)[0] || '?').toUpperCase())}</span>`;
const prog = (n) => { const a = filesIn(n), d = getDone(), k = a.filter((x) => d.has(x.id)).length; return { t: a.length, d: k, p: a.length ? Math.round((k / a.length) * 100) : 0 }; };
const allFolders = (ns) => ns.flatMap((n) => (n.type === 'folder' ? [n, ...allFolders(n.children || [])] : []));
const pgbar = (n) => { const p = prog(n); return p.t ? `<div class="pg"><i style="width:${p.p}%"></i></div><small>${p.d}/${p.t} files · ${p.p}%</small>` : ''; };
let curSel = 'root', curOpen = new Set(); const ex = {};

function renderSide(sel) {
  if (sel !== undefined) curSel = sel;
  curOpen = new Set([...chain(curSel).map((n) => n.id), curSel]);
  const tree = (ns, d) => ns.filter((n) => n.type === 'folder').map((n) => {
    const has = (n.children || []).some((c) => c.type === 'folder'), op = n.id in ex ? ex[n.id] : curOpen.has(n.id), p = prog(n);
    return `<div class="ti ${n.id === curSel ? 'on' : ''}" style="padding-left:${10 + d * 18}px" data-href="#/f/${n.id}"><span class="chev ${has ? '' : 'off'} ${op ? 'op' : ''}" data-tg="${n.id}">${CHEV}</span><span class="tl"><bdi>${esc(n.title)}</bdi></span>${p.t && p.d === p.t ? `<span class="ck">${CHECK}</span>` : ''}</div>` + (op && has ? tree(n.children, d + 1) : '');
  }).join('');
  sideEl.innerHTML = `<a class="brand" href="#/" dir="ltr"><span class="r">FCAI</span><span class="d">-</span><span class="b">CU</span></a><div class="ti ${curSel === 'root' ? 'on' : ''}" data-href="#/"><span class="chev off">${CHEV}</span><span class="tl">Home</span></div>` + tree(DATA.nodes, 0);
}
function renderCrumbs(id) {
  const n = id !== 'root' ? byId[id] : null;
  bcEl.innerHTML = '<a href="#/">Home</a>' + (n ? chain(id).map((p) => `<span class="sep">/</span><a href="#/f/${p.id}"><bdi>${esc(p.title)}</bdi></a>`).join('') + `<span class="sep">/</span><span class="cur"><bdi>${esc(n.title)}</bdi></span>` : '');
}
const toggleDone = (id) => { const d = getDone(); d.has(id) ? d.delete(id) : d.add(id); setDone(d); };
function rows(list, cur) {
  const d = getDone();
  return list.map((f) => `<div class="res ${f.id === cur ? 'cur' : ''}"><button class="tick ${d.has(f.id) ? 'done' : ''}" data-tick="${f.id}" aria-label="Mark as done">${d.has(f.id) ? '✓' : ''}</button>${badge(f.kind)}<div class="i" data-href="#/v/${f.id}"><b><bdi>${esc(f.title)}</bdi></b><br><small>${esc(f.kind)}</small></div>${f.kind === 'note' ? '' : `<a class="ib" title="Open in new tab" target="_blank" rel="noopener" href="${esc(openUrl(f))}">${EXTI}</a>`}</div>`).join('');
}

function folderView(id) {
  const n = byId[id]; if (!n) return (location.hash = '#/');
  const kids = n.children, folders = kids.filter((c) => c.type === 'folder'), fl = kids.filter((c) => c.type === 'file');
  let h = '';
  if (id === 'root') {
    const p = prog(n), last = localStorage.getItem('last'), lf = last && byId[last] && byId[last].type === 'file' ? byId[last] : null;
    h += `<h2 class="pt">Dashboard</h2><div class="stats"><div class="stat"><b>${allFolders(DATA.nodes).length}</b><span>Folders</span></div><div class="stat"><b>${p.t}</b><span>Files</span></div><div class="stat"><b>${p.d}</b><span>Completed</span></div><div class="stat"><b>${p.p}%</b><span>Overall progress</span><div class="pg"><i style="width:${p.p}%"></i></div></div></div>`;
    if (lf) h += `<a class="card cont" href="#/v/${lf.id}" style="margin-bottom:22px"><b>Continue where you left off</b><small><bdi>${esc([...chain(lf.id).map((x) => x.title), lf.title].join(' / '))}</bdi></small></a>`;
  } else h += `<h2 class="pt"><bdi>${esc(n.title)}</bdi></h2>`;
  if (folders.length) h += `<div class="grid">${folders.map((c) => `<a class="card" href="#/f/${c.id}"><div class="ch">${avatar(c.title)}<div><b><bdi>${esc(c.title)}</bdi></b><small>Folder · ${(c.children || []).length} items</small></div></div>${pgbar(c)}</a>`).join('')}</div>`;
  if (fl.length) h += `<div class="sec">Files (${fl.length})</div>` + rows(fl);
  if (!kids.length) h += '<div class="empty">Nothing here yet.</div>';
  app.innerHTML = h;
}

function fileView(id) {
  const f = byId[id]; if (!f || f.type !== 'file') return (location.hash = '#/');
  const pid = parentOf[id], sibs = byId[pid].children.filter((c) => c.type === 'file'), i = sibs.findIndex((x) => x.id === id), d = getDone(), pr = prog(byId[pid]), done = d.has(id), nx = sibs[i + 1], pv = sibs[i - 1];
  localStorage.setItem('last', id);
  app.innerHTML = `<div class="top"><h2 class="pt"><bdi>${esc(f.title)}</bdi></h2><span class="pill">${pr.p}% complete</span>
    <button class="hb" data-do="prev" ${pv ? '' : 'disabled'}>‹ Previous</button>
    ${done ? `<button class="hb" data-do="undo">Completed ✓ (undo)</button><button class="hb pri" data-do="next" ${nx ? '' : 'disabled'}>Next ›</button>` : `<button class="hb pri" data-do="next">${nx ? 'Complete and Continue ›' : 'Complete ✓'}</button>`}</div>
    <div id="host"></div><div class="sec">Files in this folder (${sibs.length})</div>${rows(sibs, id)}`;
  app.querySelectorAll('[data-do]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.do;
    if (a === 'prev') return (location.hash = '#/v/' + pv.id);
    if (a === 'undo') { const s = getDone(); s.delete(id); setDone(s); return route(true); }
    const s = getDone(); s.add(id); setDone(s);
    if (nx) location.hash = '#/v/' + nx.id; else route(true);
  }));
  mountViewer(document.getElementById('host'), f);
}

function search(q) {
  q = q.toLowerCase(); const out = [];
  (function w(ns, pth) { ns.forEach((n) => { if (n.title.toLowerCase().includes(q)) out.push([n, pth]); if (n.children) w(n.children, [...pth, n.title]); }); })(DATA.nodes, []);
  app.innerHTML = '<div class="sec">Search results</div>' + (out.length ? out.map(([n, p]) => n.type === 'file'
    ? `<div class="res">${badge(n.kind)}<div class="i" data-href="#/v/${n.id}"><b><bdi>${esc(n.title)}</bdi></b><br><small><bdi>${esc(p.join(' / '))}</bdi></small></div></div>`
    : `<div class="res">${avatar(n.title)}<div class="i" data-href="#/f/${n.id}"><b><bdi>${esc(n.title)}</bdi></b><br><small>Folder</small></div></div>`).join('') : '<div class="empty">No results</div>');
}

function route(keep) {
  const h = location.hash; let m, id = 'root', sel = 'root';
  if ((m = h.match(/^#\/v\/(.+)$/))) { id = decodeURIComponent(m[1]); if (!byId[id] || byId[id].type !== 'file') return (location.hash = '#/'); sel = parentOf[id]; }
  else if ((m = h.match(/^#\/f\/(.+)$/))) { id = sel = decodeURIComponent(m[1]); if (!byId[id]) return (location.hash = '#/'); }
  if (!keep) delete ex[sel];
  renderSide(sel); renderCrumbs(id); document.body.classList.remove('menu');
  if (m && m[0].startsWith('#/v/')) fileView(id); else folderView(id);
  if (!keep) mainEl.scrollTop = 0;
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tg]');
  if (t) { const id = t.dataset.tg; ex[id] = !(id in ex ? ex[id] : curOpen.has(id)); renderSide(); return; }
  const k = e.target.closest('[data-tick]');
  if (k) { toggleDone(k.dataset.tick); route(true); return; }
  const g = e.target.closest('[data-href]');
  if (g) { qEl.value = ''; const h = g.dataset.href; if (location.hash === h || (h === '#/' && !location.hash)) route(); else location.hash = h; }
  if (e.target.closest('#mn')) document.body.classList.toggle('menu');
  if (e.target.closest('#th')) { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light'; try { localStorage.theme = r.dataset.theme; } catch (x) {} }
});
qEl.oninput = () => { const q = qEl.value.trim(); q ? search(q) : route(true); };
(async () => {
  try { DATA = migrate(await (await fetch('content.json?' + Date.now())).json()); } catch (e) {}
  byId = { root: { id: 'root', type: 'folder', title: '', children: DATA.nodes } }; parentOf = {};
  indexTree(DATA.nodes, 'root');
  route(); addEventListener('hashchange', () => { qEl.value = ''; route(); });
})();
