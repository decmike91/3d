// Onglet Aide, à la manière d'un fichier .chm : sommaire en arbre, index, recherche plein texte,
// navigation précédent/suivant, impression. Aide contextuelle : boutons « ? » des étapes et touche F1.
import { TOPICS, CONTEXT } from './content.js';

const $ = (s) => document.querySelector(s);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

// Ordre de lecture (parcours en profondeur) et numérotation 1, 1.1…
const children = (id) => TOPICS.filter((t) => t.parent === id);
const ORDER = [];
const NUM = {};
(function walk(parent, prefix) {
  children(parent).forEach((t, i) => {
    NUM[t.id] = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
    ORDER.push(t);
    walk(t.id, NUM[t.id]);
  });
})(null, '');
const byId = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
const plain = Object.fromEntries(TOPICS.map((t) => [t.id, norm(t.title + ' ' + t.keywords.join(' ') + ' ' + textOf(t.html))]));

export function initHelp({ showTab, currentTab }) {
  let current = null;
  let history = [];
  let pane = 'toc';
  let highlight = null;
  const open = new Set(TOPICS.filter((t) => !t.parent).map((t) => t.id).slice(0, 1));
  try { JSON.parse(localStorage.getItem('svg2print.help.open') || '[]').forEach((i) => open.add(i)); } catch { /* */ }
  const saveOpen = () => { try { localStorage.setItem('svg2print.help.open', JSON.stringify([...open])); } catch { /* */ } };

  // ---------- Sommaire ----------
  function renderToc() {
    const ul = document.createElement('ul');
    ul.className = 'htree';
    const build = (parent, into) => {
      for (const t of children(parent)) {
        const kids = children(t.id);
        const li = document.createElement('li');
        const row = document.createElement('a');
        row.href = `#${t.id}`;
        row.dataset.topic = t.id;
        row.className = 'hnode' + (t.id === current ? ' on' : '');
        const icon = kids.length ? (open.has(t.id) ? '📖' : '📕') : '📄';
        row.innerHTML = `${kids.length ? `<span class="tw" data-toggle="${t.id}">${open.has(t.id) ? '▾' : '▸'}</span>` : '<span class="tw"></span>'}<span class="ic">${icon}</span><span>${esc(t.title)}</span>`;
        li.append(row);
        if (kids.length && open.has(t.id)) {
          const sub = document.createElement('ul');
          build(t.id, sub);
          li.append(sub);
        }
        into.append(li);
      }
    };
    build(null, ul);
    const box = $('#hToc');
    box.innerHTML = '';
    box.append(ul);
  }

  // ---------- Index ----------
  const INDEX = (() => {
    const m = new Map();
    for (const t of TOPICS) for (const k of [t.title, ...t.keywords]) {
      const key = k.trim();
      const nk = norm(key);
      if (!m.has(nk)) m.set(nk, { label: key, topics: new Set() });
      m.get(nk).topics.add(t.id);
    }
    return [...m.values()].sort((a, b) => norm(a.label).localeCompare(norm(b.label), 'fr'));
  })();
  function renderIndex() {
    const q = norm($('#hIndexQ').value.trim());
    const list = $('#hIndexList');
    list.innerHTML = '';
    let first = null;
    for (const e of INDEX) {
      if (q && !norm(e.label).startsWith(q) && !norm(e.label).includes(' ' + q)) continue;
      const li = document.createElement('li');
      if (e.topics.size === 1) {
        const id = [...e.topics][0];
        li.innerHTML = `<a href="#${id}" data-topic="${id}">${esc(e.label)}</a>`;
      } else {
        li.innerHTML = `<span>${esc(e.label)}</span><ul>${[...e.topics].map((id) => `<li><a href="#${id}" data-topic="${id}">${esc(byId[id].title)}</a></li>`).join('')}</ul>`;
      }
      list.append(li);
      if (!first) first = li;
    }
    if (!first) list.innerHTML = '<li class="hnone">Aucune entrée.</li>';
  }

  // ---------- Recherche ----------
  function renderSearch() {
    const raw = $('#hSearchQ').value.trim();
    const words = norm(raw).split(/\s+/).filter((w) => w.length > 1);
    const list = $('#hSearchList');
    list.innerHTML = '';
    if (!words.length) { list.innerHTML = '<li class="hnone">Saisissez un ou plusieurs mots.</li>'; return; }
    const res = [];
    for (const t of ORDER) {
      const txt = plain[t.id];
      if (!words.every((w) => txt.includes(w))) continue;
      let score = 0;
      for (const w of words) {
        score += txt.split(w).length - 1;
        if (norm(t.title).includes(w)) score += 20;
        if (t.keywords.some((k) => norm(k).includes(w))) score += 8;
      }
      res.push({ t, score });
    }
    res.sort((a, b) => b.score - a.score);
    if (!res.length) { list.innerHTML = '<li class="hnone">Aucun sujet trouvé.</li>'; return; }
    for (const { t } of res) {
      const li = document.createElement('li');
      li.innerHTML = `<a href="#${t.id}" data-topic="${t.id}" data-hl="1"><b>${esc(t.title)}</b><small>${NUM[t.id]} · ${esc(parentPath(t).map((p) => p.title).join(' › ') || 'Accueil')}</small></a>`;
      list.append(li);
    }
  }

  const parentPath = (t) => { const p = []; let c = t.parent && byId[t.parent]; while (c) { p.unshift(c); c = c.parent && byId[c.parent]; } return p; };

  // ---------- Affichage d'un sujet ----------
  function show(id, opts = {}) {
    const t = byId[id] || ORDER[0];
    if (current && current !== t.id && !opts.back) history.push(current);
    current = t.id;
    for (const p of parentPath(t)) open.add(p.id);
    if (children(t.id).length) open.add(t.id);
    saveOpen();
    const i = ORDER.indexOf(t);
    const crumbs = parentPath(t).map((p) => `<a href="#${p.id}" data-topic="${p.id}">${esc(p.title)}</a>`).join(' › ');
    const kids = children(t.id);
    let html = `<div class="hcrumbs">${crumbs || 'Aide de SVG2Print'}</div><h1><span class="hnum">${NUM[t.id]}</span>${esc(t.title)}</h1>${t.html}`;
    if (kids.length) html += `<div class="hkids"><h4>Dans ce chapitre</h4><ul>${kids.map((k) => `<li><a href="#${k.id}" data-topic="${k.id}">${NUM[k.id]} ${esc(k.title)}</a></li>`).join('')}</ul></div>`;
    const prev = ORDER[i - 1], next = ORDER[i + 1];
    html += `<nav class="hpager">${prev ? `<a href="#${prev.id}" data-topic="${prev.id}">‹ ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="#${next.id}" data-topic="${next.id}">${esc(next.title)} ›</a>` : '<span></span>'}</nav>`;
    const body = $('#hBody');
    body.innerHTML = html;
    if (highlight) mark(body, highlight);
    body.scrollTop = 0;
    $('#hPrev').disabled = !prev;
    $('#hNext').disabled = !next;
    $('#hBack').disabled = !history.length;
    renderToc();
    try { localStorage.setItem('svg2print.help.topic', t.id); } catch { /* */ }
    if (window.innerWidth < 760 && !opts.keepPane) $('#helpView').classList.remove('nav-open');
  }

  // Surlignage des mots recherchés dans la page
  function mark(root, words) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const txt = n.nodeValue;
      const nt = norm(txt);
      const hits = [];
      for (const w of words) { let k = nt.indexOf(w); while (k >= 0) { hits.push([k, k + w.length]); k = nt.indexOf(w, k + w.length); } }
      if (!hits.length) continue;
      hits.sort((a, b) => a[0] - b[0]);
      const frag = document.createDocumentFragment();
      let pos = 0;
      for (const [a, b] of hits) {
        if (a < pos) continue;
        frag.append(txt.slice(pos, a));
        const m = document.createElement('mark');
        m.textContent = txt.slice(a, b);
        frag.append(m);
        pos = b;
      }
      frag.append(txt.slice(pos));
      n.parentNode.replaceChild(frag, n);
    }
  }

  function setPane(p) {
    pane = p;
    for (const b of document.querySelectorAll('#hPanes button')) b.classList.toggle('on', b.dataset.pane === p);
    $('#hToc').hidden = p !== 'toc';
    $('#hIndex').hidden = p !== 'index';
    $('#hSearch').hidden = p !== 'search';
    if (p === 'index') { renderIndex(); setTimeout(() => $('#hIndexQ').focus(), 30); }
    if (p === 'search') { renderSearch(); setTimeout(() => $('#hSearchQ').focus(), 30); }
  }

  // ---------- Évènements ----------
  $('#helpView').addEventListener('click', (e) => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      e.preventDefault();
      const id = tg.dataset.toggle;
      if (open.has(id)) open.delete(id); else open.add(id);
      saveOpen(); renderToc();
      return;
    }
    const a = e.target.closest('a[data-topic]');
    if (a) {
      e.preventDefault();
      highlight = a.dataset.hl ? norm($('#hSearchQ').value.trim()).split(/\s+/).filter((w) => w.length > 1) : null;
      show(a.dataset.topic);
    }
  });
  $('#hPanes').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setPane(b.dataset.pane); });
  $('#hIndexQ').addEventListener('input', renderIndex);
  $('#hSearchQ').addEventListener('input', renderSearch);
  $('#hSearchQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const a = $('#hSearchList a'); if (a) a.click(); } });
  $('#hIndexQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const a = $('#hIndexList a'); if (a) a.click(); } });
  $('#hPrev').addEventListener('click', () => { const i = ORDER.findIndex((t) => t.id === current); if (i > 0) { highlight = null; show(ORDER[i - 1].id); } });
  $('#hNext').addEventListener('click', () => { const i = ORDER.findIndex((t) => t.id === current); if (i < ORDER.length - 1) { highlight = null; show(ORDER[i + 1].id); } });
  $('#hBack').addEventListener('click', () => { const id = history.pop(); if (id) { highlight = null; show(id, { back: true }); } });
  $('#hHome').addEventListener('click', () => { highlight = null; show(ORDER[0].id); });
  $('#hNav').addEventListener('click', () => {
    const v = $('#helpView');
    if (window.innerWidth < 760) v.classList.toggle('nav-open'); else v.classList.toggle('nav-hidden');
  });
  $('#hPrint').addEventListener('click', () => {
    document.body.classList.add('printing-help');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-help'), 500);
  });

  // Boutons « ? » sur chaque étape (aide contextuelle)
  const addHelpButtons = (sel, prefix) => {
    document.querySelectorAll(`${sel} .step h2`).forEach((h, i) => {
      const id = CONTEXT[`${prefix}-${i + 1}`];
      if (!id) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qhelp';
      b.title = 'Aide sur cette étape';
      b.textContent = '?';
      b.addEventListener('click', () => openTopic(id));
      h.append(b);
    });
  };
  addHelpButtons('#printView', 'svg');
  addHelpButtons('#modelView', 'm3');
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F1') { e.preventDefault(); openTopic(CONTEXT[currentTab()] || null); }
  });

  function openTopic(id) {
    showTab('help');
    highlight = null;
    show(id || current || ORDER[0].id);
  }

  let started = false;
  return {
    show() {
      if (!started) {
        started = true;
        setPane('toc');
        let last = null;
        try { last = localStorage.getItem('svg2print.help.topic'); } catch { /* */ }
        show(byId[last] ? last : ORDER[0].id, { keepPane: true });
      }
    },
    openTopic,
  };
}

// Pour le PDF : ordre, numéros et sujets
export const HELP_ORDER = ORDER;
export const HELP_NUM = NUM;
