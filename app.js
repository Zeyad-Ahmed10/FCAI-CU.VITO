let DATA = { courses: [] }, cur = null;
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const getDone = () => new Set(JSON.parse(localStorage.getItem('done') || '[]'));
const setDone = (s) => localStorage.setItem('done', JSON.stringify([...s]));

function drive(u) { const m = u.match(/\/d\/([\w-]+)/) || u.match(/[?&]id=([\w-]+)/); return m ? `https://drive.google.com/file/d/${m[1]}/preview` : u; }
function yt(u) { const m = u.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/); return m ? `https://www.youtube.com/embed/${m[1]}` : u; }

function viewer(m) {
  if (!m) return '<div class="empty">Pick a material from the list to start.</div>';
  const t = esc(m.title), u = esc(m.url || '');
  const body = {
    pdf: `<iframe class="frame tall" src="${u}" title="${t}"></iframe>`,
    video: `<video class="frame" src="${u}" controls></video>`,
    image: `<img class="img" src="${u}" alt="${t}">`,
    drive: `<iframe class="frame tall" src="${esc(drive(m.url || ''))}" allow="autoplay; fullscreen" allowfullscreen></iframe>`,
    youtube: `<iframe class="frame" src="${esc(yt(m.url || ''))}" allowfullscreen></iframe>`,
    link: `<a class="btn" href="${u}" target="_blank" rel="noreferrer">Open link</a>`,
    note: `<pre class="note">${esc(m.note)}</pre>`,
  }[m.type] || '';
  return `<div class="viewer"><h2>${t}</h2>${body}</div>`;
}

function home() {
  const cs = DATA.courses || [];
  app.innerHTML = `<section class="hero"><h1><span class="typing"><span class="r">FCAI</span>-<span class="b">CU</span> Computer Science</span></h1>
    <p>Pick a course to open its lectures, labs and videos.</p></section>` +
    (cs.length ? `<div class="grid">${cs.map((c) => {
      const n = c.sections.reduce((a, s) => a + s.materials.length, 0);
      return `<a class="card" href="#/course/${esc(c.id)}"><h3>${esc(c.title)}</h3><p>${esc(c.description) || 'Course materials'}</p><p style="margin-top:12px">${n} materials</p></a>`;
    }).join('')}</div>` : '<div class="empty">No courses yet.</div>');
}

function course(id) {
  const c = (DATA.courses || []).find((x) => x.id === id);
  if (!c) return (location.hash = '#/');
  const all = c.sections.flatMap((s) => s.materials);
  if (!cur || !all.find((m) => m.id === cur.id)) cur = all[0] || null;
  const done = getDone();
  const pct = all.length ? Math.round((all.filter((m) => done.has(m.id)).length / all.length) * 100) : 0;
  app.innerHTML = `<a class="back" href="#/">&larr; All courses</a><h1 style="font-size:34px;margin-bottom:18px">${esc(c.title)}</h1>
  <div class="course"><aside class="side"><div class="bar"><i style="width:${pct}%"></i></div><small style="color:var(--gray)">${pct}% complete</small>
  ${c.sections.map((s) => `<h4>${esc(s.title)}</h4>` + s.materials.map((m) => `
    <div class="item ${cur && cur.id === m.id ? 'on' : ''}" data-open="${m.id}">
      <button class="tick ${done.has(m.id) ? 'done' : ''}" data-tick="${m.id}" aria-label="Mark as done">${done.has(m.id) ? '✓' : ''}</button>
      <span class="t">${esc(m.title)}</span><span class="tag">${m.type}</span></div>`).join('')).join('')}
  ${all.length ? '' : '<p class="empty" style="margin-top:12px">No materials yet.</p>'}</aside>
  <div id="v">${viewer(cur)}</div></div>`;
  app.querySelectorAll('[data-open]').forEach((el) => el.onclick = () => { cur = all.find((m) => m.id === el.dataset.open); course(id); });
  app.querySelectorAll('[data-tick]').forEach((el) => el.onclick = (e) => {
    e.stopPropagation(); const d = getDone(), k = el.dataset.tick; d.has(k) ? d.delete(k) : d.add(k); setDone(d); course(id);
  });
}

function route() {
  const m = location.hash.match(/^#\/course\/(.+)$/);
  m ? course(decodeURIComponent(m[1])) : home();
  window.scrollTo(0, 0);
}
(async () => {
  try { DATA = await (await fetch('content.json?' + Date.now())).json(); } catch (e) {}
  route(); addEventListener('hashchange', route);
})();
