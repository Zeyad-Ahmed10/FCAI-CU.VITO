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

/* ===== مشغل الفيديو (شكل YouTube/Plyr مع ترجمة مخصوصة) ===== */
function parseSubs(t) {
  t = t.replace(/\r/g, '').replace(/^\uFEFF/, ''); const out = [];
  const T = (h, m, s, ms) => (+h || 0) * 3600 + +m * 60 + +s + +String(ms).padEnd(3, '0') / 1000;
  t.split(/\n{2,}/).forEach((blk) => {
    const l = blk.split('\n'), i = l.findIndex((x) => x.includes('-->')); if (i < 0) return;
    const m = l[i].match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/); if (!m) return;
    out.push({ s: T(m[1], m[2], m[3], m[4]), e: T(m[5], m[6], m[7], m[8]), t: l.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim() });
  });
  return out;
}
async function fetchText(url) { // UTF-8 أو windows-1256 (عربي قديم)
  const buf = await (await fetch(url)).arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1256').decode(buf); }
}
Object.assign(ICON, {
  back: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/><text x="12" y="16.3" font-size="7.5" font-weight="700" text-anchor="middle">5</text></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="12" y="16.3" font-size="7.5" font-weight="700" text-anchor="middle">5</text></svg>',
  cc: '<svg viewBox="0 0 24 24"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm4.5 9.5c1 0 1.7-.4 2.1-1l-1-.7c-.2.3-.6.5-1 .5-.8 0-1.3-.6-1.3-1.5s.5-1.5 1.3-1.5c.4 0 .7.2 1 .5l1-.7c-.4-.6-1.100-1-2.100-1-1.600 0-2.700 1.100-2.700 2.700s1.100 2.700 2.700 2.700zm7 0c1 0 1.700-.4 2.100-1l-1-.7c-.2.3-.6.5-1 .5-.8 0-1.300-.6-1.300-1.500s.5-1.500 1.300-1.500c.4 0 .7.2 1 .5l1-.7c-.4-.6-1.100-1-2.100-1-1.600 0-2.700 1.100-2.700 2.700s1.100 2.700 2.700 2.700z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M12 8.500a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7zm8.200 4.600l1.700 1.300-2 3.500-2-.8a7.500 7.500 0 0 1-1.800 1l-.3 2.100h-4l-.3-2.100a7.500 7.500 0 0 1-1.800-1l-2 .8-2-3.500 1.700-1.300a7.600 7.600 0 0 1 0-2.200L2.100 9.600l2-3.500 2 .8a7.500 7.500 0 0 1 1.800-1l.3-2.100h4l.3 2.100a7.500 7.500 0 0 1 1.800 1l2-.8 2 3.500-1.700 1.300c.1.700.1 1.500 0 2.200z" fill-rule="evenodd" opacity=".95"/></svg>',
  pip: '<svg viewBox="0 0 24 24"><path d="M3 5h18v14H3zm2 2v10h14V7zm7 4h6v4h-6z" fill-rule="evenodd"/></svg>',
});
function mountPlayer(box, f, opts = {}) {
  const src = opts.src || f.url, fail = opts.onfail || (() => box.insertAdjacentHTML('beforeend', `<div class="err">This browser can't play this video format. MP4 (H.264) and WebM work everywhere; convert other formats to MP4.</div>`));
  box.innerHTML = `<div class="player" tabindex="0"><video preload="metadata" playsinline></video><div class="subs" dir="auto"></div><div class="osd"></div>
  <div class="menu" hidden><div class="mh"><b>Settings</b><button data-a="mclose" aria-label="Close">✕</button></div>
   <div class="mr"><span>Speed</span><div class="chips">${[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => `<button data-rate="${r}" class="${r === 1 ? 'on' : ''}">${r}x</button>`).join('')}</div></div>
   <div class="mr"><span>Zoom</span><div class="chips"><button data-z="-1">−</button><b class="zv">100%</b><button data-z="1">+</button></div></div>
   <div class="mr msub" hidden><span>Subtitles</span><div class="chips"><button data-s="onoff" class="on">On</button><button data-s="-1">A−</button><button data-s="1">A+</button></div></div></div>
  <div class="ctrl"><div class="seekrow"><span class="tl">0:00</span><input class="seek" type="range" min="0" max="1000" value="0" step="0.1" aria-label="Seek"><span class="tr">0:00</span></div>
  <div class="bar2"><button data-a="play" aria-label="Play">${ICON.play}</button><button data-a="back" aria-label="Back 5 seconds">${ICON.back}</button><button data-a="fwd" aria-label="Forward 5 seconds">${ICON.fwd}</button>
  <div class="volw"><button data-a="mute" aria-label="Mute">${ICON.vol}</button><input class="vol" type="range" min="0" max="100" value="100" aria-label="Volume"></div><span class="sp"></span>
  <button data-a="cc" class="cc" aria-label="Subtitles" hidden>${ICON.cc}</button><button data-a="set" aria-label="Settings">${ICON.gear}</button>
  <button data-a="pip" aria-label="Picture in picture" ${document.pictureInPictureEnabled ? '' : 'hidden'}>${ICON.pip}</button><button data-a="fs" aria-label="Fullscreen">${ICON.fs}</button></div></div></div>`;
  const P = box.querySelector('.player'), v = P.querySelector('video'), $ = (s) => P.querySelector(s);
  const seek = $('.seek'), vol = $('.vol'), osd = $('.osd'), cc = $('.cc'), subsEl = $('.subs'), menu = $('.menu');
  const playB = $('[data-a=play]'), muteB = $('[data-a=mute]');
  let hover = false, idle, osdT, cues = [], zoom = 1, raf, shown = '', loaded = false;
  let subsOn = localStorage.getItem('subs') !== 'off', subSz = +localStorage.getItem('subsz') || 1;
  v.src = src;
  const to = setTimeout(() => { if (!loaded && opts.timeout) { fail(); } }, opts.timeout || 0);

  const say = (t) => { osd.textContent = t; osd.classList.add('on'); clearTimeout(osdT); osdT = setTimeout(() => osd.classList.remove('on'), 900); };
  const toggle = () => (v.paused ? v.play() : v.pause());
  const skip = (d) => { v.currentTime = Math.min(Math.max(0, v.currentTime + d), v.duration || 1e9); say((d > 0 ? '+' : '') + d + 's'); };
  const setVol = (x) => { v.muted = false; v.volume = Math.min(1, Math.max(0, x)); say('Volume ' + Math.round(v.volume * 100) + '%'); };
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fs = () => { if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else if (P.requestFullscreen) P.requestFullscreen(); else if (P.webkitRequestFullscreen) P.webkitRequestFullscreen(); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); };
  const sizeSubs = () => (subsEl.style.fontSize = Math.max(15, P.clientHeight * 0.052 * subSz) + 'px');
  const showSub = () => {
    const t = v.currentTime, c = subsOn ? cues.find((q) => t >= q.s && t < q.e) : null, txt = c ? c.t : '';
    if (txt !== shown) { shown = txt; subsEl.textContent = txt; }
  };
  const refreshSubUI = () => { cc.classList.toggle('off', !subsOn); $('[data-s=onoff]').textContent = subsOn ? 'On' : 'Off'; $('[data-s=onoff]').classList.toggle('on', subsOn); showSub(); };
  const toggleSubs = () => { if (!cues.length) return; subsOn = !subsOn; localStorage.setItem('subs', subsOn ? 'on' : 'off'); refreshSubUI(); say(subsOn ? 'Subtitles on' : 'Subtitles off'); };
  const setZoom = (d) => { zoom = Math.min(3, Math.max(1, zoom + d * 0.25)); v.style.transform = `scale(${zoom})`; $('.zv').textContent = Math.round(zoom * 100) + '%'; };
  const tick = () => { showSub(); if (document.body.contains(P) && !v.paused) raf = requestAnimationFrame(tick); };

  v.onplay = () => { playB.innerHTML = ICON.pause; cancelAnimationFrame(raf); tick(); };
  v.onpause = () => { playB.innerHTML = ICON.play; P.classList.remove('idle'); showSub(); };
  const upd = () => { const p = v.duration ? (v.currentTime / v.duration) * 100 : 0; if (!seek.matches(':active')) seek.value = p * 10; seek.style.setProperty('--p', p + '%'); $('.tl').textContent = fmt(v.currentTime); $('.tr').textContent = fmt(v.duration); };
  v.ontimeupdate = upd; v.onloadedmetadata = () => { loaded = true; clearTimeout(to); upd(); };
  v.onvolumechange = () => { vol.value = v.muted ? 0 : v.volume * 100; vol.style.setProperty('--p', vol.value + '%'); muteB.innerHTML = v.muted || v.volume === 0 ? ICON.mute : ICON.vol; };
  v.onerror = () => { clearTimeout(to); fail(); };
  seek.oninput = () => { if (v.duration) v.currentTime = (seek.value / 1000) * v.duration; seek.style.setProperty('--p', seek.value / 10 + '%'); };
  vol.oninput = () => { v.muted = false; v.volume = vol.value / 100; };
  P.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => ({ play: toggle, back: () => skip(-5), fwd: () => skip(5), mute: () => (v.muted = !v.muted), cc: toggleSubs, fs,
    set: () => (menu.hidden = !menu.hidden), mclose: () => (menu.hidden = true),
    pip: () => (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {}) }[b.dataset.a])()));
  menu.addEventListener('click', (e) => {
    const r = e.target.closest('[data-rate]'), z = e.target.closest('[data-z]'), s = e.target.closest('[data-s]');
    if (r) { v.playbackRate = +r.dataset.rate; menu.querySelectorAll('[data-rate]').forEach((b) => b.classList.toggle('on', b === r)); }
    if (z) setZoom(+z.dataset.z);
    if (s) { if (s.dataset.s === 'onoff') toggleSubs(); else { subSz = Math.min(2.2, Math.max(0.6, subSz + 0.15 * s.dataset.s)); localStorage.setItem('subsz', subSz); sizeSubs(); } }
  });
  v.onclick = () => { if (!menu.hidden) { menu.hidden = true; return; } P.focus({ preventScroll: true }); toggle(); };
  v.ondblclick = fs;
  new ResizeObserver(sizeSubs).observe(P); sizeSubs();

  // عجلة الماوس للصوت في وضع الفول سكرين بس
  P.addEventListener('wheel', (e) => { if (fsEl() !== P) return; e.preventDefault(); setVol(v.volume + (e.deltaY < 0 ? 0.05 : -0.05)); }, { passive: false });
  // الكيبورد
  P.onmouseenter = () => (hover = true); P.onmouseleave = () => (hover = false);
  const onKey = (e) => {
    if (!document.body.contains(P)) return document.removeEventListener('keydown', onKey);
    if (/TEXTAREA/.test(e.target.tagName) || e.target.type === 'text' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!(hover || fsEl() === P || P.contains(document.activeElement))) return;
    const map = { ' ': toggle, k: toggle, ArrowRight: () => skip(5), ArrowLeft: () => skip(-5), ArrowUp: () => setVol(v.volume + 0.05), ArrowDown: () => setVol(v.volume - 0.05), m: () => (v.muted = !v.muted), f: fs, c: toggleSubs };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  };
  document.addEventListener('keydown', onKey);
  P.onmousemove = () => { P.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => { if (!v.paused && menu.hidden) P.classList.add('idle'); }, 2500); };

  // الترجمة بتتركب تلقائي من ملف .srt/.vtt ولها زرار إيقاف
  if (f.subtitle) fetchText(f.subtitle).then((t) => { cues = parseSubs(t); if (cues.length) { cc.hidden = false; $('.msub').hidden = false; refreshSubUI(); } }).catch(() => {});
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
  else if (k === 'drive') {
    const m = (f.url || '').match(/\/d\/([\w-]+)/) || (f.url || '').match(/[?&]id=([\w-]+)/);
    const frame = () => { b.innerHTML = `<div class="dframe"><iframe class="frame ${f.video ? '' : 'tall'}" src="${esc(drivePrev(f.url))}" allow="autoplay; fullscreen" allowfullscreen></iframe><div class="dmask"></div></div>`; };
    // فيديو درايف: بنجرب المشغل الجديد، ولو درايف رفض بنرجع لمشغل درايف تلقائي
    if (f.video && m) mountPlayer(b, f, { src: `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t`, onfail: frame, timeout: 12000 });
    else frame();
  }
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
