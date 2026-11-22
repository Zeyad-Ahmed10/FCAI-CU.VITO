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

/* ===== الصفحات ===== */
function crumbs(id, last) {
  const parts = chain(id).map((n) => `<a href="#/f/${n.id}">${esc(n.title)}</a>`);
  return `<nav class="crumbs"><a href="#/">Home</a>${parts.map((p) => ' / ' + p).join('')}${last ? ' / <span>' + esc(last) + '</span>' : ''}</nav>`;
}
function toggleDone(id, again) { const d = getDone(); d.has(id) ? d.delete(id) : d.add(id); setDone(d); again(); }
function fileRows(list) {
  const d = getDone();
  return list.map((f) => `<div class="frow" data-go="${f.id}"><button class="tick ${d.has(f.id) ? 'done' : ''}" data-tick="${f.id}" aria-label="Mark as done">${d.has(f.id) ? '✓' : ''}</button><span class="t">${esc(f.title)}</span><span class="tag">${f.kind}</span></div>`).join('');
}
function wireRows(again) {
  app.querySelectorAll('[data-go]').forEach((r) => (r.onclick = () => (location.hash = '#/v/' + r.dataset.go)));
  app.querySelectorAll('[data-tick]').forEach((t) => (t.onclick = (e) => { e.stopPropagation(); toggleDone(t.dataset.tick, again); }));
}

function folderView(id) {
  const n = byId[id]; if (!n) return (location.hash = '#/');
  const kids = n.children, folders = kids.filter((c) => c.type === 'folder'), fl = kids.filter((c) => c.type === 'file'), d = getDone();
  const head = id === 'root'
    ? `<section class="hero"><h1><span class="typing"><span class="r">FCAI</span>-<span class="b">CU</span> Computer Science</span></h1><p>Pick a folder to open lectures, labs and videos.</p></section>`
    : crumbs(id) + `<h1 class="ptitle">${esc(n.title)}</h1>`;
  app.innerHTML = head +
    (folders.length ? `<div class="grid">${folders.map((c) => { const all = filesIn(c), dn = all.filter((x) => d.has(x.id)).length;
      return `<a class="card" href="#/f/${c.id}"><span class="fico">${ICON.folder}</span><h3>${esc(c.title)}</h3><p>${all.length} files${all.length ? ' · ' + dn + ' done' : ''}</p></a>`; }).join('')}</div>` : '') +
    (fl.length ? `<div class="flist">${fileRows(fl)}</div>` : '') +
    (!kids.length ? '<div class="empty">Nothing here yet.</div>' : '');
  wireRows(() => folderView(id));
}

function fileView(id) {
  const f = byId[id]; if (!f || f.type !== 'file') return (location.hash = '#/');
  const pid = parentOf[id], sibs = byId[pid].children.filter((c) => c.type === 'file'), i = sibs.findIndex((x) => x.id === id), d = getDone();
  const pct = sibs.length ? Math.round((sibs.filter((x) => d.has(x.id)).length / sibs.length) * 100) : 0;
  app.innerHTML = crumbs(id, f.title) + `<div class="course"><aside class="side"><div class="bar"><i style="width:${pct}%"></i></div><small class="muted">${pct}% complete</small>
    ${pid !== 'root' ? `<h4><a href="#/f/${pid}">&larr; ${esc(byId[pid].title)}</a></h4>` : ''}
    <div class="flist mini">${fileRows(sibs).replace(`data-go="${id}"`, `data-go="${id}" data-on="1"`)}</div></aside>
    <div><div id="host"></div><div class="pn">${sibs[i - 1] ? `<a class="btn ghost sm" href="#/v/${sibs[i - 1].id}">&larr; Previous</a>` : '<span></span>'}${sibs[i + 1] ? `<a class="btn ghost sm" href="#/v/${sibs[i + 1].id}">Next &rarr;</a>` : ''}</div></div></div>`;
  app.querySelectorAll('[data-on]').forEach((r) => r.classList.add('on'));
  wireRows(() => fileView(id));
  mountViewer(document.getElementById('host'), f);
}

function route() {
  const h = location.hash; let m;
  if ((m = h.match(/^#\/v\/(.+)$/))) fileView(decodeURIComponent(m[1]));
  else if ((m = h.match(/^#\/f\/(.+)$/))) folderView(decodeURIComponent(m[1]));
  else folderView('root');
  window.scrollTo(0, 0);
}
(async () => {
  try { DATA = migrate(await (await fetch('content.json?' + Date.now())).json()); } catch (e) {}
  byId = { root: { id: 'root', type: 'folder', title: '', children: DATA.nodes } }; parentOf = {};
  indexTree(DATA.nodes, 'root');
  route(); addEventListener('hashchange', route);
})();
