/* ═══════════════════════════════════════════════════════════════════
   Motor de treino · v2.0
   Uma página de app só precisa definir window.APP antes de carregar este arquivo:

   window.APP = {
     id: 'nv',                          // prefixo do localStorage (único por app)
     titulo: 'Treino N&V',              // nome no topo
     versao: 'v1.2',                    // versão visível no header
     pagina: 'treino_natalie_vlad.html',// arquivo da página (escopo do service worker)
     plano: 'planos/natalie-vlad.json', // plano de treino (formato em planos/)
     gsUrl: 'https://script.google.com/macros/s/.../exec'  // vazio = só salva no celular
   };

   O visual (cores, fontes, cantos) é definido na própria página, sobrescrevendo
   as variáveis CSS de app/engine.css.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const APP = window.APP || {};
const GS_URL = APP.gsUrl || '';
const VERSION = APP.versao || '';
const P = (APP.id || 'app') + '_';

/* ════════════════════ UTILITÁRIOS ════════════════════ */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const dm = s => { const d = parseYmd(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
const dayIdx = d => (d.getDay() + 6) % 7; // 0 = segunda
const mondayOf = s => { const d = parseYmd(s); d.setDate(d.getDate() - dayIdx(d)); return ymd(d); };
const fmtNum = (n, dec = 1) => Number(n).toFixed(dec).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ',');
const vel = v => Number(v).toFixed(1).replace('.', ',');
const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
const num = v => parseFloat(String(v).replace(',', '.')) || 0;
const uid = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_LONGO = { Seg: 'Segunda', Ter: 'Terça', Qua: 'Quarta', Qui: 'Quinta', Sex: 'Sexta', 'Sáb': 'Sábado', Dom: 'Domingo' };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600); }

/* ════════════════════ ESTRUTURA DA PÁGINA ════════════════════ */
function mountSkeleton() {
  document.body.insertAdjacentHTML('afterbegin', `
<div class="top"><div class="wrap">
  <div class="bar">
    <div class="logo"><span class="mark"></span><span id="ttl"></span> <span class="ver" id="ver"></span></div>
    <div class="sync" id="sync"><i></i><span>…</span></div>
  </div>
  <div class="people" id="people"></div>
  <div class="tabs" id="tabs">
    <button data-v="hoje">Hoje</button><button data-v="semana">Semana</button><button data-v="hist">Histórico</button><button data-v="cfg">Ajustes</button>
  </div>
</div></div>
<div class="wrap"><main id="main"><div class="boot">Carregando treinos…</div></main><footer id="foot"></footer></div>
<div class="rest" id="rest">
  <div class="rt" id="restT">0:00</div>
  <div class="sp"><div class="rl" id="restL">Descanso</div><div class="bar2"><div id="restB"></div></div></div>
  <button data-rest="15">+15s</button><button data-rest="skip">Pular</button>
</div>
<div class="gt" id="gt">
  <div class="gtop"><span class="gname" id="gtName"></span><span id="gtStep"></span></div>
  <div class="phase-n" id="gtPhase"></div>
  <div class="big" id="gtBig"></div>
  <div class="next" id="gtNext"></div>
  <div class="prog"><div id="gtProg"></div></div>
  <div class="ptx"><span id="gtEl"></span><span id="gtTot"></span></div>
  <div class="ctl"><button id="gtPrev">⏮ Voltar</button><button class="main" id="gtPause">Pausar</button><button id="gtNextB">Pular ⏭</button></div>
  <button class="btn cta full" id="gtEnd" style="margin-top:10px">Encerrar</button>
</div>
<div class="modal" id="modal"><div class="sheet" id="sheet"></div></div>
<div class="toast" id="toast"></div>`);
  $('#ttl').textContent = APP.titulo || 'Treino';
  $('#ver').textContent = VERSION;
  $('#foot').textContent = `${APP.titulo || 'Treino'} · ${VERSION}`;
}

/* ════════════════════ PLANO ════════════════════ */
let PESSOAS = [];
const pessoa = id => PESSOAS.find(p => p.id === id);
const treinoById = id => { for (const p of PESSOAS) { const t = p.treinos.find(t => t.id === id); if (t) return t; } return null; };
async function loadPlano() {
  try {
    const r = await fetch(APP.plano + (APP.plano.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(); lsSet(P + 'plano', j); return j;
  } catch (e) {
    return lsGet(P + 'plano', null); // offline: última cópia salva
  }
}

/* ════════════════════ ESTADO ════════════════════ */
const LS = { logs: P + 'logs', pend: P + 'pending', del: P + 'deleted', who: P + 'who', fase: P + 'fase', fc: P + 'fc', sess: P + 'sess', gt: P + 'gt' };
let logs = lsGet(LS.logs, []);
let pending = lsGet(LS.pend, []);      // registros a enviar (grava/edita)
let pendingDel = lsGet(LS.del, []);    // ids a apagar
let sess = lsGet(LS.sess, {});         // treinos em andamento (séries marcadas)
const ui = { who: lsGet(LS.who, null), view: 'hoje', open: null, openFromHoje: false, info: {} };
function fase(p) { return (lsGet(LS.fase, {})[p || ui.who]) || 1; }
function setFase(p, f) { const o = lsGet(LS.fase, {}); o[p] = f; lsSet(LS.fase, o); }
function persist() { lsSet(LS.logs, logs); lsSet(LS.pend, pending); lsSet(LS.del, pendingDel); }

/* chave de deduplicação: mesma pessoa + treino + data */
const keyOf = l => l.pessoa + '|' + l.treinoId + '|' + l.data;
function norm(l) {
  let det = l.detalhes;
  if (typeof det === 'string') { try { det = JSON.parse(det); } catch (e) { det = {}; } }
  return {
    id: String(l.id), data: String(l.data).slice(0, 10), pessoa: String(l.pessoa), treinoId: String(l.treinoId),
    treinoNome: String(l.treinoNome || ''), fase: Number(l.fase) || 1, detalhes: det || {},
    rpe: l.rpe === '' || l.rpe == null ? null : Number(l.rpe), obs: String(l.obs || ''), criadoEm: String(l.criadoEm || '')
  };
}
function dedupe(list) {
  const m = new Map();
  for (const l of list) { const k = keyOf(l), o = m.get(k); if (!o || String(l.criadoEm) >= String(o.criadoEm)) m.set(k, l); }
  return [...m.values()];
}
/* ÚNICA função de leitura dos registros */
function getLogs(p) {
  return dedupe(logs).filter(l => !p || l.pessoa === p)
    .sort((a, b) => (b.data + b.criadoEm).localeCompare(a.data + a.criadoEm));
}

/* ════════════════════ SINCRONIZAÇÃO (Apps Script) ════════════════════
   Tudo é salvo primeiro no localStorage; o envio para a planilha roda em
   segundo plano e é refeito quando a internet voltar. */
let syncing = false;
function setSync(state, txt) { const s = $('#sync'); s.className = 'sync ' + state; s.querySelector('span').textContent = txt; }
async function api(body) {
  const r = await fetch(GS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!j.ok) throw new Error(j.error || 'erro'); return j;
}
async function sync() {
  if (!GS_URL) { setSync('', 'salvo no celular'); return; }
  if (syncing) return; syncing = true;
  setSync('busy', 'sincronizando…');
  try {
    for (const l of [...pending]) { await api({ action: 'save', log: l }); pending = pending.filter(x => x.id !== l.id); persist(); }
    for (const id of [...pendingDel]) { await api({ action: 'delete', id }); pendingDel = pendingDel.filter(x => x !== id); persist(); }
    const r = await fetch(GS_URL + '?action=list&t=' + Date.now());
    const j = await r.json(); if (!j.ok) throw new Error(j.error || 'erro');
    const server = j.logs.map(norm);
    const ids = new Set(server.map(l => l.id));
    logs = dedupe(server.concat(pending.filter(l => !ids.has(l.id)).map(norm)).filter(l => !pendingDel.includes(l.id)));
    persist(); setSync('ok', 'sincronizado');
    const ae = document.activeElement;
    if (PESSOAS.length && !$('#modal').classList.contains('on') && !(ae && /INPUT|TEXTAREA/.test(ae.tagName))) render();
  } catch (e) {
    persist(); setSync('err', 'offline · salvo aqui');
  } finally { syncing = false; }
}
function saveLog(l) {
  l = norm(l);
  const same = logs.find(x => keyOf(x) === keyOf(l) && x.id !== l.id);
  if (same) l.id = same.id; // dedup: substitui o registro do mesmo dia
  logs = logs.filter(x => x.id !== l.id && keyOf(x) !== keyOf(l));
  logs.push(l);
  pending = pending.filter(x => x.id !== l.id); pending.push(l);
  persist(); sync();
}
function deleteLog(id) {
  logs = logs.filter(l => l.id !== id); pending = pending.filter(l => l.id !== id);
  if (GS_URL && !pendingDel.includes(id)) pendingDel.push(id); // apagar um id inexistente no servidor é inofensivo
  persist(); sync();
}

/* ════════════════════ PLANO (com ajustes da fase) ════════════════════ */
const registro = e => e.registro || 'carga';
function exercisesOf(t, f) {
  return t.exercicios.map(e => {
    const x = { ...e };
    if (f === 2 && e.fase2) Object.assign(x, e.fase2);
    return x;
  });
}
function cardioBlocks(t, f) { return JSON.parse(JSON.stringify(f === 2 && t.fase2_blocos ? t.fase2_blocos : t.blocos)); }
function blockText(b) {
  if (b.repeticoes) return `${b.fase}: ${b.min} min — ${b.obs || ''}`;
  return `${b.fase}: ${b.min} min a ${vel(b.vel_kmh)} km/h, inclinação ${b.incl_pct}%` + (b.obs ? ` — ${b.obs.replace(/\.+$/, '')}` : '') + '.';
}
const rpeTxt = r => r ? `esforço ${r} de 10` : '';
function cardioSteps(t, f) {
  const steps = [];
  for (const b of cardioBlocks(t, f)) {
    if (b.repeticoes) {
      for (let i = 1; i <= b.repeticoes; i++) {
        steps.push({ fase: `Trote ${i}/${b.repeticoes}`, sec: b.trabalho.seg, vel: b.trabalho.vel_kmh, incl: b.trabalho.incl_pct, rpe: b.trabalho.rpe, obs: b.obs });
        steps.push({ fase: `Caminhada ${i}/${b.repeticoes}`, sec: b.recuperacao.seg, vel: b.recuperacao.vel_kmh, incl: b.recuperacao.incl_pct, rpe: b.recuperacao.rpe });
      }
    } else steps.push({ fase: b.fase, sec: b.min * 60, vel: b.vel_kmh, incl: b.incl_pct, rpe: b.rpe, obs: b.obs });
  }
  return steps;
}
function tiroSteps(e) {
  const iv = e.intervalos || { forte_s: 20, leve_s: 40 }, n = e.sets, s = [];
  for (let i = 1; i <= n; i++) {
    s.push({ fase: `Tiro ${i}/${n}`, sec: iv.forte_s, label: 'FORTE', rpe: '8–9', obs: 'Forte, quase sem conseguir falar.' });
    s.push({ fase: `Leve ${i}/${n}`, sec: iv.leve_s, label: 'Leve', rpe: '2–3', obs: 'Bem leve, recupere o fôlego.' });
  }
  return s;
}
const kmOf = steps => steps.reduce((a, s) => a + (s.vel ? s.vel * (s.done != null ? s.done : s.sec) / 3600 : 0), 0);

/* sugestão de carga (progressão dupla) a partir do último treino */
function repRange(reps) {
  const m = String(reps).match(/(\d+)\s*[–-]\s*(\d+)/);
  if (m) return [+m[1], +m[2]];
  const n = String(reps).match(/\d+/); return n ? [+n[0], +n[0]] : null;
}
function sugestao(e, last) {
  if (!last || registro(e) !== 'carga') return '';
  const rr = repRange(e.reps); if (!rr) return '';
  const s = last.series.filter(x => num(x.carga) > 0 && num(x.reps) > 0);
  if (!s.length) return '';
  const carga = Math.max(...s.map(x => num(x.carga)));
  const top = s.filter(x => num(x.carga) === carga);
  const bateu = top.length >= e.sets && top.every(x => num(x.reps) >= rr[1]);
  if (bateu) {
    const inc = e.incremento || 'o menor aumento possível';
    const m = String(inc).match(/^([\d.,]+)\s*kg/);
    const alvo = m && !/[–-]/.test(inc) ? ` → <b>${fmtNum(carga + num(m[1]))} kg</b>` : '';
    return `💡 Hoje: suba <b>${esc(inc)}</b>${alvo} e volte para ${rr[0]} reps. Você fez ${rr[1]}+ em todas as séries.`;
  }
  const min = Math.min(...top.map(x => num(x.reps)));
  return `💡 Hoje: mantenha <b>${fmtNum(carga)} kg</b> e tente ${min < rr[1] ? '+1 repetição por série' : 'completar todas as séries'} (meta: ${e.sets}×${rr[1]}).`;
}

/* ════════════════════ SESSÃO (séries marcadas) ════════════════════ */
const sessKey = tid => ui.who + '|' + tid + '|' + today();
function getSess(tid) { const k = sessKey(tid); if (!sess[k]) sess[k] = { ex: {} }; return sess[k]; }
function saveSess() {
  const t = today(); for (const k of Object.keys(sess)) if (!k.endsWith(t)) delete sess[k];
  lsSet(LS.sess, sess);
}
function exState(tid, ex) {
  const s = getSess(tid);
  if (!s.ex[ex.id]) s.ex[ex.id] = { sets: [], como: '' };
  const st = s.ex[ex.id];
  while (st.sets.length < ex.sets) st.sets.push({ c: '', r: '', d: false });
  return st;
}
function lastFor(exId) {
  for (const l of getLogs(ui.who)) {
    if (l.data === today()) continue;
    const e = (l.detalhes.exercicios || []).find(x => x.id === exId);
    if (e && e.series && e.series.some(s => s.feito)) return { data: l.data, series: e.series.filter(s => s.feito) };
  }
  return null;
}
function doneThisWeek(p) {
  const mon = mondayOf(today()), set = new Set();
  getLogs(p).forEach(l => { if (mondayOf(l.data) === mon) set.add(l.treinoId); });
  return set;
}
/* modo rotação: próximo treino na ordem A → B → C → D */
function proximoTreino(p) {
  const ts = p.treinos.filter(t => !t.opcional);
  const last = getLogs(p.id).find(l => ts.some(t => t.id === l.treinoId) && l.data !== today());
  if (!last) return ts[0];
  return ts[(ts.findIndex(t => t.id === last.treinoId) + 1) % ts.length];
}

/* ════════════════════ RENDER ════════════════════ */
function render() {
  const p = pessoa(ui.who);
  document.documentElement.style.setProperty('--p', p.cor || 'var(--hi)');
  document.querySelectorAll('#people button').forEach(b => b.classList.toggle('on', b.dataset.p === ui.who));
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === ui.view));
  const m = $('#main');
  if (ui.view === 'hoje') m.innerHTML = viewHoje();
  else if (ui.view === 'semana') m.innerHTML = ui.open ? phaseBar() + viewTreino(treinoById(ui.open), true) : viewSemana();
  else if (ui.view === 'hist') { m.innerHTML = viewHist(); drawChart(); }
  else m.innerHTML = viewCfg();
}

function phaseBar() {
  const f = fase();
  return `<div class="phase"><span class="muted" style="font-size:13px">Fase</span>
    <div class="seg"><button data-f="1" class="${f === 1 ? 'on' : ''}">Fase 1</button><button data-f="2" class="${f === 2 ? 'on' : ''}">Fase 2</button></div>
    <span class="muted" style="font-size:12px">${f === 1 ? 'adaptação' : 'progressão'}</span></div>`;
}

function viewHoje() {
  const p = pessoa(ui.who);
  let h = phaseBar();
  if (ui.open && ui.openFromHoje) return h + viewTreino(treinoById(ui.open), true);
  if (p.modo === 'rotacao') {
    const hoje = getLogs(p.id).find(l => l.data === today());
    const t = hoje ? treinoById(hoje.treinoId) : proximoTreino(p);
    const extra = p.treinos.find(x => x.opcional);
    return h + `<div class="card note">▶ ${hoje ? 'Treino de hoje' : 'Próximo da sequência'}: <b>${esc(t.nome)}</b>. Quer outro${extra ? ' ou o ' + esc(extra.nome.split('·')[0].trim()) + ' (opcional)' : ''}? Escolha na aba Semana.</div>` + viewTreino(t, false);
  }
  const dia = DIAS[dayIdx(new Date())], item = p.semana.find(s => s.dia === dia);
  if (!item || item.treino === 'descanso') {
    const feitos = doneThisWeek(ui.who);
    h += `<h2>${DIAS_LONGO[dia]} · Descanso</h2><div class="sub">${esc(item && item.obs ? item.obs : 'Dia de recuperar. Beba água e durma bem.')}</div>
      <div class="card"><div class="label">Quer treinar mesmo assim?</div><div class="note">Escolha um treino da semana:</div>
      ${p.treinos.map(t => `<button class="day" data-pick="${t.id}"><span class="sp"><b>${esc(t.nome)}</b><br><span class="sub">${esc(t.foco)}</span></span><span class="tick ${feitos.has(t.id) ? 'ok' : ''}">${feitos.has(t.id) ? '✓' : ''}</span></button>`).join('')}</div>`;
    return h;
  }
  return h + viewTreino(treinoById(item.treino), false, item);
}

function viewTreino(t, back, item) {
  const f = fase(), p = pessoa(ui.who);
  const feito = getLogs(ui.who).find(l => l.treinoId === t.id && l.data === today());
  let h = '';
  if (back) h += `<button class="btn sm" data-back style="margin-top:14px">← Voltar</button>`;
  h += `<h2>${esc(t.nome)}</h2><div class="sub">${esc(t.foco)} · ~${t.duracao_est_min} min</div>
    <div class="exmeta" style="margin-top:8px">${item && item.opcional ? '<span class="pill w">Opcional</span>' : ''}<span class="pill p">Fase ${f}</span>${feito ? '<span class="pill w">✓ Feito hoje</span>' : ''}</div>`;
  h += t.tipo === 'cardio' ? cardioView(t, f) : strengthView(t, f);
  h += `<details class="rules card"><summary>📋 Regras do plano e dicas de evolução (toque para ver)</summary><ul class="clean" style="margin-top:8px">${p.regras.map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>`;
  return h;
}

function strengthView(t, f) {
  const exs = exercisesOf(t, f);
  let h = t.aquecimento ? `<div class="card note">🔥 <b>Antes:</b> ${esc(t.aquecimento)} + 1 série leve do 1º exercício.</div>` : '';
  exs.forEach((e, i) => {
    const st = exState(t.id, e), nd = st.sets.slice(0, e.sets).filter(s => s.d).length, all = nd >= e.sets;
    const reg = registro(e);
    const last = reg === 'carga' ? lastFor(e.id) : null;
    const comoAlt = st.como ? e.alt.find(a => a.name === st.como) : null;
    const open = ui.info[e.id];
    h += `<div class="ex ${all ? 'done' : ''}">
      <div class="exh"><div class="exn">${i + 1}</div><div class="sp"><div class="exname">${esc(e.name)}</div>
        ${comoAlt ? `<div class="alt-on">Fazendo: ${esc(comoAlt.name)}</div>` : ''}
        <div class="exmeta"><span class="pill">${esc(e.muscle)}</span><span class="pill">${reg === 'min' ? esc(e.reps) : e.sets + ' × ' + esc(e.reps)}</span>${e.rest ? `<span class="pill">descanso ${e.rest}s</span>` : ''}</div></div>
        <span class="cnt">${nd}/${e.sets}</span></div>`;
    if (last) h += `<div class="last">Última vez (${dm(last.data)}): ${last.series.map(s => `${esc(s.carga || '–')}kg×${esc(s.reps || '–')}`).join(' · ')}</div>`;
    const sg = sugestao(e, last); if (sg) h += `<div class="tip">${sg}</div>`;
    if (reg === 'tiros') h += `<div class="sets"><button class="btn w full" data-tiros="${t.id}|${e.id}">▶ Começar tiros guiados (${e.sets}x)</button></div>`;
    h += `<div class="sets">`;
    if (reg === 'carga') h += `<div class="hdr"><span>Série</span><span>Peso (kg)</span><span>Repetições</span><span>Feito</span></div>`;
    else if (reg !== 'tiros') h += `<div class="hdr nl"><span>Série</span><span>${reg === 'seg' ? 'Segundos' : reg === 'min' ? 'Minutos' : 'Repetições'}</span><span>Feito</span></div>`;
    for (let s = 0; s < e.sets; s++) {
      const v = st.sets[s], ph = last && last.series[s] ? last.series[s] : null, ck = `<button class="chk" data-set="${t.id}|${e.id}|${s}">${v.d ? '✓' : ''}</button>`;
      if (reg === 'tiros') {
        const iv = e.intervalos || { forte_s: 20, leve_s: 40 };
        h += `<div class="set nl ${v.d ? 'ok' : ''}"><span class="sn">Tiro ${s + 1}</span><span class="note">${iv.forte_s}s forte + ${iv.leve_s}s leve</span>${ck}</div>`;
      } else if (reg !== 'carga') {
        h += `<div class="set nl ${v.d ? 'ok' : ''}"><span class="sn">${reg === 'min' ? 'Tempo' : 'Série ' + (s + 1)}</span><input inputmode="numeric" placeholder="${esc(e.reps)}" value="${esc(v.r)}" data-in="${t.id}|${e.id}|${s}|r">${ck}</div>`;
      } else {
        h += `<div class="set ${v.d ? 'ok' : ''}"><span class="sn">Série ${s + 1}</span><input inputmode="decimal" placeholder="${ph ? esc(ph.carga) : 'kg'}" value="${esc(v.c)}" data-in="${t.id}|${e.id}|${s}|c"><input inputmode="numeric" placeholder="${ph ? esc(ph.reps) : esc(e.reps)}" value="${esc(v.r)}" data-in="${t.id}|${e.id}|${s}|r">${ck}</div>`;
      }
    }
    h += `</div><button class="more" data-info="${e.id}">${open ? '▲ Esconder' : '▼ Como fazer · Como evoluir · Alternativas'}</button>`;
    if (open) h += `<div class="info">
      <div class="blk"><div class="label">Como fazer</div>${esc(e.exec)}</div>
      <div class="blk"><div class="label">Como evoluir</div>${esc(e.progress)}${e.incremento ? `<br><span class="muted">Aumento padrão: ${esc(e.incremento)}</span>` : ''}</div>
      <div class="blk"><div class="label">Não tem o aparelho? Faça assim:</div>
        ${e.alt.map(a => `<div class="alt"><b>${esc(a.name)}</b><p>${esc(a.exec)}</p><button class="btn sm ${st.como === a.name ? 'w' : ''}" data-como="${t.id}|${e.id}|${esc(a.name)}">${st.como === a.name ? '✓ Fazendo esta' : 'Vou fazer esta'}</button></div>`).join('')}
        ${st.como ? `<button class="btn sm" style="margin-top:6px" data-como="${t.id}|${e.id}|">Voltar ao exercício original</button>` : ''}
      </div></div>`;
    h += `</div>`;
  });
  h += `<button class="btn cta full" style="margin-top:16px" data-finish="${t.id}">🏁 Finalizar treino</button>`;
  return h;
}

function cardioView(t, f) {
  const bl = cardioBlocks(t, f), steps = cardioSteps(t, f);
  const tot = steps.reduce((a, s) => a + s.sec, 0), km = kmOf(steps);
  const p = pessoa(ui.who), fc = p.fc_opcional ? lsGet(LS.fc, {})[ui.who] : '';
  let h = `<div class="card"><div class="label">Como vai ser</div><div class="note">${bl.map(b => esc(blockText(b))).join('<br>')}</div>
    <div class="exmeta" style="margin-top:10px"><span class="pill">${Math.round(tot / 60)} min</span><span class="pill">~${fmtNum(km, 1)} km</span>${fc ? `<span class="pill">❤ limite ${esc(fc)} bpm</span>` : ''}</div></div>`;
  h += `<div class="card"><div class="label">Blocos</div><div class="blocks">${bl.map(b => b.repeticoes
    ? `<div class="bk"><div><div class="t">${esc(b.fase)}</div><div class="d">${b.repeticoes}x · trote ${b.trabalho.seg / 60} min a ${vel(b.trabalho.vel_kmh)} km/h + caminhada ${b.recuperacao.seg / 60} min a ${vel(b.recuperacao.vel_kmh)} km/h</div></div><div class="num">${b.min} min</div><div class="num">${b.trabalho.incl_pct}%</div></div>`
    : `<div class="bk"><div><div class="t">${esc(b.fase)}</div><div class="d">${esc(rpeTxt(b.rpe))}</div></div><div class="num">${b.min} min · ${vel(b.vel_kmh)} km/h</div><div class="num">${b.incl_pct}%</div></div>`).join('')}</div></div>`;
  h += `<button class="btn w full" style="margin-top:14px;padding:16px;font-size:17px" data-go="${t.id}">▶ Começar timer da esteira</button>`;
  h += `<div class="card"><div class="label">Como evoluir</div><div class="note">${esc(t.progress)}</div></div>`;
  h += `<div class="card"><div class="label">Não quer ou não pode fazer esse hoje? Faça assim:</div>${t.alt.map(a => `<div class="alt"><b>${esc(a.name)}</b><p>${esc(a.exec)}</p><button class="btn sm" data-altdone="${t.id}|${esc(a.name)}">Fiz esta — registrar</button></div>`).join('')}</div>`;
  h += `<button class="btn cta full" style="margin-top:14px" data-finish="${t.id}">🏁 Finalizar / registrar sem timer</button>`;
  return h;
}

function viewSemana() {
  const p = pessoa(ui.who), feitos = doneThisWeek(ui.who);
  if (p.modo === 'rotacao') {
    const nx = proximoTreino(p), all = getLogs(p.id);
    let h = phaseBar() + `<h2>Treinos de ${esc(p.nome)}</h2><div class="sub">${esc(p.frequencia)} · ${esc(p.duracao_min)} min · ${feitos.size} feito(s) esta semana</div>`;
    p.treinos.forEach(t => {
      const last = all.find(l => l.treinoId === t.id);
      h += `<button class="day ${t.id === nx.id ? 'today' : ''}" data-pick="${t.id}"><span class="sp"><b>${esc(t.nome)}</b> ${t.id === nx.id ? '<span class="nx">PRÓXIMO</span>' : ''}${t.opcional ? '<span class="pill">opcional · fora da sequência</span>' : ''}<br>
        <span class="sub">${esc(t.foco)} · ~${t.duracao_est_min} min${last ? ' · último: ' + dm(last.data) : ''}</span></span>
        <span class="tick ${feitos.has(t.id) ? 'ok' : ''}">${feitos.has(t.id) ? '✓' : ''}</span></button>`;
    });
    return h;
  }
  const hj = dayIdx(new Date());
  const fixos = p.semana.filter(s => s.treino !== 'descanso' && !s.opcional).length;
  const nFixos = p.semana.filter(s => s.treino !== 'descanso' && !s.opcional && feitos.has(s.treino)).length;
  let h = phaseBar() + `<h2>Semana de ${esc(p.nome)}</h2><div class="sub">${esc(p.frequencia)} · ${esc(p.duracao_min)} min · ${nFixos} de ${fixos} feitos esta semana</div>`;
  p.semana.forEach((s, i) => {
    const t = s.treino !== 'descanso' ? treinoById(s.treino) : null, ok = t && feitos.has(t.id);
    h += `<button class="day ${i === hj ? 'today' : ''} ${t ? '' : 'rest'}" ${t ? `data-pick="${t.id}"` : ''}>
      <span class="dn">${s.dia}</span><span class="sp"><b>${t ? esc(t.nome) : 'Descanso'}</b>${s.opcional ? ' <span class="pill">opcional</span>' : ''}<br>
      <span class="sub">${t ? esc(t.foco) + ' · ~' + t.duracao_est_min + ' min' : esc(s.obs || '')}</span></span>
      ${t ? `<span class="tick ${ok ? 'ok' : ''}">${ok ? '✓' : ''}</span>` : ''}</button>`;
  });
  return h;
}

function summary(l) {
  const d = l.detalhes || {};
  if (d.tipo === 'cardio') return `${fmtNum(d.minutos || 0, 0)} min · ~${fmtNum(d.km || 0, 1)} km` + (d.alternativa ? ` · ${esc(d.alternativa)}` : '');
  const n = (d.exercicios || []).reduce((a, e) => a + (e.series || []).filter(s => s.feito).length, 0);
  return `${n} séries · volume ${fmtNum(d.volume || 0, 0)} kg`;
}
const temForca = p => p.treinos.some(t => t.tipo !== 'cardio');
function viewHist() {
  const p = pessoa(ui.who), all = getLogs(ui.who), pend = new Set(pending.map(l => l.id));
  let h = `<h2>Histórico</h2><div class="sub">${all.length} treino(s) registrado(s)</div>`;
  if (!all.length) return h + `<div class="empty">Nenhum treino ainda.<br>Finalize um treino para aparecer aqui.</div>`;
  h += `<div class="card"><div class="label">${temForca(p) ? 'Volume por treino (kg levantados)' : 'Minutos e km por semana'}</div><div class="chartbox"><canvas id="chart"></canvas></div></div>`;
  const weeks = {};
  all.forEach(l => { const w = mondayOf(l.data); (weeks[w] = weeks[w] || []).push(l); });
  Object.keys(weeks).sort().reverse().forEach(w => {
    const L = weeks[w];
    const extra = !temForca(p) ? ' · ' + fmtNum(L.reduce((a, l) => a + (l.detalhes.minutos || 0), 0), 0) + ' min' : '';
    h += `<div class="wk"><div class="wkh"><span>Semana de ${dm(w)}</span><span>${L.length} treino(s)${extra}</span></div>`;
    L.forEach(l => {
      const t = treinoById(l.treinoId);
      h += `<div class="log"><div class="sp"><div class="lt">${esc(t ? t.nome : l.treinoNome)}${pend.has(l.id) ? '<span class="pend">a enviar</span>' : ''}</div>
        <div class="ld">${DIAS[dayIdx(parseYmd(l.data))]} ${dm(l.data)} · Fase ${l.fase} · ${summary(l)}${l.rpe != null ? ' · esforço ' + l.rpe + '/10' : ''}</div>
        ${l.obs ? `<div class="ld">“${esc(l.obs)}”</div>` : ''}</div>
        <div class="act"><button data-edit="${l.id}" aria-label="Editar">✎</button><button data-del="${l.id}" aria-label="Apagar">🗑</button></div></div>`;
    });
    h += `</div>`;
  });
  return h;
}
let chart;
function drawChart() {
  const cv = $('#chart'); if (chart) { chart.destroy(); chart = null; }
  if (!cv || typeof Chart === 'undefined') return;
  const cs = getComputedStyle(document.documentElement), V = k => cs.getPropertyValue(k).trim();
  Chart.defaults.color = V('--dim'); Chart.defaults.borderColor = V('--c2');
  if (V('--font-n')) Chart.defaults.font.family = V('--font-n');
  const p = pessoa(ui.who), all = getLogs(ui.who).slice().reverse();
  const legend = { legend: { labels: { boxWidth: 10, font: { size: 11 } } } };
  if (temForca(p)) {
    const forca = all.filter(l => l.detalhes.tipo !== 'cardio');
    const labels = [...new Set(forca.map(l => l.data))];
    const tons = [V('--txt'), V('--p'), V('--dim'), V('--dim2'), V('--hi')], dashes = [[], [], [6, 4], [2, 3], [8, 3, 2, 3]];
    const tr = p.treinos.filter(t => t.tipo !== 'cardio');
    chart = new Chart(cv, { type: 'line', data: { labels: labels.map(dm), datasets: tr.map((t, i) => ({
      label: t.nome, borderColor: tons[i % 5], backgroundColor: tons[i % 5], borderDash: dashes[i % 5], spanGaps: true, tension: .25, pointRadius: 4,
      data: labels.map(d => { const l = forca.find(x => x.data === d && x.treinoId === t.id); return l ? Math.round(l.detalhes.volume || 0) : null; })
    })) }, options: { responsive: true, maintainAspectRatio: false, plugins: legend, scales: { y: { beginAtZero: true } } } });
  } else {
    const weeks = {};
    all.forEach(l => { const w = mondayOf(l.data); weeks[w] = weeks[w] || { min: 0, km: 0 }; weeks[w].min += l.detalhes.minutos || 0; weeks[w].km += l.detalhes.km || 0; });
    const ks = Object.keys(weeks).sort();
    chart = new Chart(cv, { data: { labels: ks.map(dm), datasets: [
      { type: 'bar', label: 'Minutos', data: ks.map(k => Math.round(weeks[k].min)), backgroundColor: V('--p'), yAxisID: 'y', borderRadius: 6 },
      { type: 'line', label: 'km (estimado)', data: ks.map(k => +weeks[k].km.toFixed(1)), borderColor: V('--txt'), backgroundColor: V('--txt'), yAxisID: 'y1', tension: .25 }
    ] }, options: { responsive: true, maintainAspectRatio: false, plugins: legend,
      scales: { y: { beginAtZero: true, position: 'left', title: { display: true, text: 'min' } }, y1: { beginAtZero: true, position: 'right', grid: { display: false }, title: { display: true, text: 'km' } } } } });
  }
}

function viewCfg() {
  const p = pessoa(ui.who), fc = lsGet(LS.fc, {})[ui.who] || '';
  let h = `<h2>Ajustes · ${esc(p.nome)}</h2>` + phaseBar() +
    `<div class="card note">A fase é escolhida manualmente. Passe para a <b>Fase 2</b> quando estiver cumprindo o que diz “Como evoluir” na maioria dos exercícios.</div>`;
  if (p.fc_opcional) h += `<div class="card"><div class="label">Limite de batimentos (opcional)</div>
    <div class="note">Se usar relógio ou cinta, coloque aqui o limite combinado. Ele aparece na tela do timer.</div>
    <div class="fld"><input id="fcIn" inputmode="numeric" placeholder="ex.: 150" value="${esc(fc)}"></div></div>`;
  h += `<div class="card"><div class="label">Regras do plano e dicas de evolução</div><ul class="clean">${p.regras.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
  h += `<div class="card"><div class="label">Sincronização</div>
    <div class="note">${GS_URL ? 'Os treinos são salvos no celular na hora e enviados para a planilha quando houver internet.' : 'Planilha ainda não conectada: os treinos ficam salvos neste celular.'}</div>
    <div class="note" style="margin-top:6px">${pending.length + pendingDel.length} alteração(ões) aguardando envio.</div>
    ${GS_URL ? '<button class="btn sm" style="margin-top:10px" data-syncnow>🔄 Sincronizar agora</button>' : ''}</div>`;
  if (STANDALONE) h += `<div class="card note">📲 App instalado na tela inicial ✓</div>`;
  else h += `<div class="card"><div class="label">Instalar como app</div>
    ${installEvt ? '<button class="btn w full" data-install>📲 Instalar app</button>' : ''}
    <div class="note" style="margin-top:${installEvt ? 10 : 0}px"><b>Android:</b> abra no Chrome → menu ⋮ → “Instalar app” (ou “Adicionar à tela inicial”).<br><b>iPhone:</b> abra no Safari → botão Compartilhar → “Adicionar à Tela de Início”.</div></div>`;
  return h;
}

/* ════════════════════ TIMER DE DESCANSO ════════════════════ */
const rest = { end: 0, total: 0, t: null, beeped: false };
function startRest(sec, label) {
  if (!sec) return;
  rest.end = Date.now() + sec * 1000; rest.total = sec; rest.beeped = false;
  $('#restL').textContent = label || 'Descanso';
  $('#rest').classList.add('on'); $('#rest').classList.remove('end');
  clearInterval(rest.t); rest.t = setInterval(tickRest, 250); tickRest();
}
function tickRest() {
  const left = (rest.end - Date.now()) / 1000;
  $('#restT').textContent = mmss(left);
  $('#restB').style.width = Math.max(0, Math.min(100, left / rest.total * 100)) + '%';
  if (left <= 0 && !rest.beeped) { rest.beeped = true; $('#rest').classList.add('end'); $('#restL').textContent = 'Bora, próxima série!'; alertEnd(); setTimeout(stopRest, 4000); }
}
function stopRest() { clearInterval(rest.t); $('#rest').classList.remove('on', 'end'); }

/* ════════════════════ SOM / VIBRAÇÃO / TELA LIGADA ════════════════════ */
let actx;
function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }
function beep(freq = 880, dur = .15, when = 0) {
  try { if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = freq; o.type = 'square';
    g.gain.setValueAtTime(.18, actx.currentTime + when); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + when + dur);
    o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + when); o.stop(actx.currentTime + when + dur + .02); } catch (e) {}
}
function alertEnd() { beep(880, .18, 0); beep(880, .18, .25); beep(1320, .35, .5); try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {} }
let wake = null;
async function keepAwake(on) {
  try { if (on && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    if (!on && wake) { await wake.release(); wake = null; } } catch (e) {}
}

/* ════════════════════ TIMER GUIADO (esteira / tiros) ════════════════════
   Baseado em horário (Date.now), então continua certo mesmo se a tela bloquear. */
let G = lsGet(LS.gt, null), gTick = null;
function gtSave() { lsSet(LS.gt, G); }
function flash() { $('#gt').classList.remove('flash'); void $('#gt').offsetWidth; $('#gt').classList.add('flash'); }
function gtStart(kind, tid, exId, steps, title) {
  unlockAudio();
  steps.forEach(s => s.done = 0);
  G = { kind, tid, exId, who: ui.who, title, steps, i: 0, end: Date.now() + steps[0].sec * 1000, paused: false, left: steps[0].sec, started: Date.now(), cd: -1 };
  gtSave(); gtOpen(); beep(660, .2);
}
function gtOpen() { $('#gt').classList.add('on'); keepAwake(true); clearInterval(gTick); gTick = setInterval(gtTick, 200); gtTick(); }
function gtLeft() { return G.paused ? G.left : (G.end - Date.now()) / 1000; }
function gtGo(i, fromTimer) {
  const cur = G.steps[G.i];
  cur.done = fromTimer ? cur.sec : Math.max(0, cur.sec - Math.max(0, gtLeft()));
  if (i >= G.steps.length) return gtFinish(true);
  if (i < 0) i = 0;
  G.i = i; G.left = G.steps[i].sec; G.end = Date.now() + G.left * 1000; G.cd = -1;
  flash(); alertEnd(); gtSave(); gtTick();
}
function gtTick() {
  if (!G) return;
  let left = gtLeft();
  while (!G.paused && left <= 0 && G.i < G.steps.length) { // tela bloqueada: avança os blocos que já passaram
    const over = -left; G.steps[G.i].done = G.steps[G.i].sec;
    if (G.i + 1 >= G.steps.length) return gtFinish(true);
    G.i++; G.end = Date.now() - over * 1000 + G.steps[G.i].sec * 1000; left = gtLeft();
    G.cd = -1; alertEnd(); flash(); gtSave();
  }
  const s = G.steps[G.i], nx = G.steps[G.i + 1];
  const sl = Math.ceil(left); if (sl <= 3 && sl >= 1 && G.cd !== sl && !G.paused) { G.cd = sl; beep(520, .1); }
  const tot = G.steps.reduce((a, x) => a + x.sec, 0), el = G.steps.slice(0, G.i).reduce((a, x) => a + x.sec, 0) + (s.sec - Math.max(0, left));
  const p = pessoa(G.who), fc = p && p.fc_opcional ? lsGet(LS.fc, {})[G.who] : '';
  $('#gtName').textContent = G.title; $('#gtStep').textContent = `Bloco ${G.i + 1} de ${G.steps.length}`;
  $('#gtPhase').textContent = s.fase;
  $('#gtBig').innerHTML = (s.vel != null
    ? `<div class="vel">${vel(s.vel)}<small>km/h</small></div><div class="inc">${s.incl}<small>% inclinação</small></div>`
    : `<div class="lbl">${esc(s.label)}</div>`) +
    `<div class="cd">${mmss(left)}</div><div class="rpe">${esc(rpeTxt(s.rpe))}</div>${s.obs ? `<div class="obs">${esc(s.obs)}</div>` : ''}${fc ? `<div class="hr">❤ limite ${esc(fc)} bpm</div>` : ''}`;
  $('#gtNext').innerHTML = nx ? `<span>Próximo: <b>${esc(nx.fase)}</b></span><span>${nx.vel != null ? vel(nx.vel) + ' km/h · ' + nx.incl + '%' : esc(nx.label)} · ${mmss(nx.sec)}</span>` : '<span>Último bloco 💪</span>';
  $('#gtProg').style.width = Math.min(100, el / tot * 100) + '%';
  $('#gtEl').textContent = mmss(el) + ' feitos'; $('#gtTot').textContent = 'faltam ' + mmss(tot - el);
  $('#gtPause').textContent = G.paused ? '▶ Continuar' : 'Pausar';
}
function gtFinish(complete) {
  clearInterval(gTick); keepAwake(false);
  const g = G; G = null; lsSet(LS.gt, null);
  $('#gt').classList.remove('on');
  if (!g) return;
  if (!complete) g.steps[g.i].done = Math.max(0, g.steps[g.i].sec - Math.max(0, g.paused ? g.left : (g.end - Date.now()) / 1000));
  if (complete) alertEnd();
  const secs = g.steps.reduce((a, s) => a + (s.done || 0), 0);
  ui.who = g.who; lsSet(LS.who, ui.who);
  if (g.kind === 'tiros') {
    const t = treinoById(g.tid), e = exercisesOf(t, fase()).find(x => x.id === g.exId), st = exState(t.id, e);
    const n = g.steps.filter(s => s.label === 'FORTE' && s.done >= s.sec - 1).length;
    st.sets.forEach((s, i) => { if (i < n) s.d = true; }); saveSess(); render();
    toast(complete ? 'Tiros concluídos! 🔥' : `${n} tiro(s) marcados.`);
  } else {
    openFinish(g.tid, { minutos: Math.round(secs / 60), km: +kmOf(g.steps).toFixed(2), concluido: complete });
  }
}

/* ════════════════════ FINALIZAR / EDITAR ════════════════════ */
let F = null;
function openFinish(tid, cardio, editId) {
  const t = treinoById(tid), ed = editId ? logs.find(l => l.id === editId) : null;
  const isC = t.tipo === 'cardio', base = ed ? ed.detalhes : {};
  F = { tid, editId, rpe: ed ? ed.rpe : null, cardio: isC, extra: cardio || {} };
  const min = ed ? base.minutos : cardio ? cardio.minutos : t.duracao_est_min;
  const km = ed ? base.km : cardio ? cardio.km : isC ? +kmOf(cardioSteps(t, fase())).toFixed(2) : 0;
  $('#sheet').innerHTML = `<h3>${ed ? 'Editar treino' : 'Finalizar treino'}</h3><div class="sub">${esc(t.nome)}${ed ? ' · ' + dm(ed.data) : ''}</div>
    ${!ed && !isC ? `<div class="note" style="margin-top:8px">${finishCount(t)}</div>` : ''}
    <div class="fld"><div class="label">Quão pesado foi o treino? (0 = nada, 10 = máximo)</div><div class="rpes">${[...Array(11)].map((_, i) => `<button data-rpe="${i}" class="${F.rpe === i ? 'on' : ''}">${i}</button>`).join('')}</div></div>
    ${isC ? `<div class="fld two"><div><div class="label">Minutos</div><input id="fMin" inputmode="numeric" value="${esc(min)}"></div><div><div class="label">km (aprox.)</div><input id="fKm" inputmode="decimal" value="${esc(fmtNum(km || 0, 2))}"></div></div>
      ${cardio && cardio.alternativa ? `<div class="note" style="margin-top:8px">Alternativa: <b>${esc(cardio.alternativa)}</b></div>` : ''}` : ''}
    <div class="fld"><div class="label">Observação (opcional)</div><textarea id="fObs" placeholder="Como se sentiu, o que mudou…">${esc(ed ? ed.obs : '')}</textarea></div>
    <div class="two" style="margin-top:16px"><button class="btn" data-cancel>Cancelar</button><button class="btn cta" data-save>${ed ? 'Salvar' : '✓ Salvar treino'}</button></div>`;
  $('#modal').classList.add('on');
}
function finishCount(t) {
  let d = 0, tot = 0;
  exercisesOf(t, fase()).forEach(e => { const st = exState(t.id, e); tot += e.sets; d += st.sets.slice(0, e.sets).filter(s => s.d).length; });
  return `${d} de ${tot} séries marcadas.` + (d < tot ? ' Tudo bem — salva o que foi feito.' : ' Treino completo! 💪');
}
function doSave() {
  const t = treinoById(F.tid), ed = F.editId ? logs.find(l => l.id === F.editId) : null;
  let det;
  if (ed) det = { ...ed.detalhes };
  else if (F.cardio) det = { tipo: 'cardio', blocos: cardioBlocks(t, fase()).map(b => ({ fase: b.fase, min: b.min, vel_kmh: b.vel_kmh, incl_pct: b.incl_pct, repeticoes: b.repeticoes })), concluido: !!F.extra.concluido, alternativa: F.extra.alternativa || '' };
  else {
    let vol = 0;
    det = { tipo: 'forca', exercicios: exercisesOf(t, fase()).map(e => {
      const st = exState(t.id, e);
      const series = st.sets.slice(0, e.sets).map(s => ({ carga: s.c, reps: s.r, feito: !!s.d }));
      if (registro(e) === 'carga') series.forEach(s => { if (s.feito) vol += num(s.carga) * num(s.reps); });
      return { id: e.id, name: e.name, feito_como: st.como || '', series };
    }) };
    det.volume = Math.round(vol);
  }
  if (F.cardio) { det.minutos = num($('#fMin').value); det.km = num($('#fKm').value); }
  saveLog({
    id: ed ? ed.id : uid(), data: ed ? ed.data : today(), pessoa: ed ? ed.pessoa : ui.who, treinoId: t.id, treinoNome: t.nome,
    fase: ed ? ed.fase : fase(), detalhes: det, rpe: F.rpe, obs: $('#fObs').value.trim(), criadoEm: new Date().toISOString()
  });
  $('#modal').classList.remove('on'); F = null; stopRest();
  toast(ed ? 'Alterações salvas ✓' : 'Treino salvo! 💪');
  if (!ed) { ui.view = 'hist'; ui.open = null; ui.openFromHoje = false; window.scrollTo(0, 0); }
  render();
}

/* ════════════════════ EVENTOS ════════════════════ */
function bindEvents() {
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.p) { if (d.p !== ui.who) stopRest(); ui.who = d.p; lsSet(LS.who, d.p); ui.open = null; ui.openFromHoje = false; ui.info = {}; render(); window.scrollTo(0, 0); return; }
    if (d.v) { ui.view = d.v; ui.open = null; ui.openFromHoje = false; render(); window.scrollTo(0, 0); return; }
    if (d.f) { setFase(ui.who, +d.f); render(); return; }
    if (d.pick) { ui.open = d.pick; ui.openFromHoje = ui.view === 'hoje'; render(); window.scrollTo(0, 0); return; }
    if ('back' in d) { ui.open = null; ui.openFromHoje = false; render(); return; }
    if (d.info) { ui.info[d.info] = !ui.info[d.info]; render(); return; }
    if (d.set) {
      unlockAudio();
      const [tid, exId, s] = d.set.split('|'), ex = exercisesOf(treinoById(tid), fase()).find(x => x.id === exId);
      const st = exState(tid, ex), v = st.sets[+s];
      v.d = !v.d; saveSess(); render();
      if (v.d) {
        const nd = st.sets.slice(0, ex.sets).filter(x => x.d).length;
        if (ex.rest) startRest(ex.rest, nd >= ex.sets ? `${ex.name} ✓ — descanse e vá para o próximo` : `Descanso · ${ex.name}`);
      }
      return;
    }
    if (d.como !== undefined) { const [tid, exId, ...n] = d.como.split('|'); exState(tid, exercisesOf(treinoById(tid), fase()).find(x => x.id === exId)).como = n.join('|'); saveSess(); render(); return; }
    if (d.tiros) { const [tid, exId] = d.tiros.split('|'), e2 = exercisesOf(treinoById(tid), fase()).find(x => x.id === exId); gtStart('tiros', tid, exId, tiroSteps(e2), e2.name); return; }
    if (d.go) { const t = treinoById(d.go); gtStart('cardio', t.id, null, cardioSteps(t, fase()), t.nome); return; }
    if (d.altdone) { const [tid, ...n] = d.altdone.split('|'); openFinish(tid, { minutos: treinoById(tid).duracao_est_min, km: 0, alternativa: n.join('|') }); return; }
    if (d.finish) { openFinish(d.finish); return; }
    if (d.rpe !== undefined) { F.rpe = +d.rpe; document.querySelectorAll('.rpes button').forEach(x => x.classList.toggle('on', +x.dataset.rpe === F.rpe)); return; }
    if ('cancel' in d) { $('#modal').classList.remove('on'); F = null; return; }
    if ('save' in d) { doSave(); return; }
    if (d.edit) { const l = logs.find(x => x.id === d.edit); if (l) openFinish(l.treinoId, null, l.id); return; }
    if (d.del) { if (confirm('Apagar este treino do histórico?')) { deleteLog(d.del); render(); toast('Treino apagado'); } return; }
    if ('syncnow' in d) { sync(); return; }
    if ('install' in d) { if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; render(); }); } return; }
    if (d.rest) { if (d.rest === 'skip') stopRest(); else { rest.end += 15000; rest.total += 15; rest.beeped = false; $('#rest').classList.remove('end'); } return; }
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.in) {
      const [tid, exId, s, k] = el.dataset.in.split('|'), ex = exercisesOf(treinoById(tid), fase()).find(x => x.id === exId);
      exState(tid, ex).sets[+s][k] = el.value; saveSess();
    }
    if (el.id === 'fcIn') { const o = lsGet(LS.fc, {}); o[ui.who] = el.value.replace(/\D/g, ''); lsSet(LS.fc, o); }
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') { $('#modal').classList.remove('on'); F = null; } });
  $('#gtPause').onclick = () => { unlockAudio(); if (G.paused) { G.paused = false; G.end = Date.now() + G.left * 1000; } else { G.left = gtLeft(); G.paused = true; } gtSave(); gtTick(); };
  $('#gtNextB').onclick = () => gtGo(G.i + 1, false);
  $('#gtPrev').onclick = () => { const o = G.i; gtGo(Math.max(0, o - 1), false); G.steps[o].done = 0; G.steps[G.i].done = 0; gtSave(); };
  $('#gtEnd').onclick = () => { if (confirm('Encerrar agora? O tempo feito até aqui será registrado.')) gtFinish(false); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (G) keepAwake(true); sync(); } });
  window.addEventListener('online', sync);
  setInterval(() => { if (pending.length || pendingDel.length) sync(); }, 60000);
}

/* ════════════════════ PWA (Android + iPhone) ════════════════════ */
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (ui.view === 'cfg' && PESSOAS.length) render(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('App instalado! 📲'); });
function registerSW() {
  if (!('serviceWorker' in navigator) || !APP.pagina) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('sw.js', { scope: './' + APP.pagina }).catch(() => {});
}

/* ════════════════════ INÍCIO ════════════════════ */
async function init() {
  mountSkeleton();
  registerSW();
  const plano = await loadPlano();
  if (!plano || !plano.pessoas || !plano.pessoas.length) { $('#main').innerHTML = '<div class="boot">Não foi possível carregar os treinos.<br>Abra com internet uma vez.</div>'; return; }
  PESSOAS = plano.pessoas;
  if (!pessoa(ui.who)) ui.who = PESSOAS[0].id;
  if (PESSOAS.length > 1) $('#people').innerHTML = PESSOAS.map(p => `<button data-p="${esc(p.id)}"><i style="background:${esc(p.cor || 'var(--hi)')}"></i>${esc(p.nome)}</button>`).join('');
  else $('#people').style.display = 'none';
  bindEvents();
  logs = dedupe(logs.map(norm)); persist(); saveSess();
  render();
  if (G && pessoa(G.who)) { ui.who = G.who; render(); gtOpen(); }
  sync();
}
/* exposto para testes / depuração */
window.TreinoApp = { getLogs, sync, state: () => ({ logs, pending, pendingDel, syncing, ui, G }), gtTick: () => gtTick(), setG: f => { f(G); } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
