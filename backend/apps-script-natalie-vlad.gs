/**
 * Treino Natalie & Vlad — backend (Google Apps Script)
 *
 * Planilha: "Treino Natalie & Vlad", aba "logs".
 * Colunas: id | data | pessoa | treinoId | treinoNome | fase | detalhes | rpe | obs | criadoEm
 *
 * GET  ?action=list                       -> {"ok":true,"logs":[...]}
 * POST {"action":"save","log":{...}}      -> grava ou substitui (pelo id; senão pessoa+treinoId+data)
 * POST {"action":"edit","log":{...}}      -> igual ao save (replace pelo id)
 * POST {"action":"delete","id":"..."}     -> apaga a linha com esse id
 *
 * O app manda o POST com Content-Type text/plain (evita o preflight de CORS).
 *
 * Instalação: cole este arquivo em script.google.com, rode setup() uma vez
 * e implante como App da Web (executar como: eu · acesso: qualquer pessoa).
 * Para atualizar: Implantar → Gerenciar implantações → lápis → Nova versão
 * (nunca "Nova implantação", que muda a URL).
 */

var NOME_PLANILHA = 'Treino Natalie & Vlad';
var NOME_ABA = 'logs';
var CABECALHOS = ['id', 'data', 'pessoa', 'treinoId', 'treinoNome', 'fase', 'detalhes', 'rpe', 'obs', 'criadoEm'];
var COL = {}; CABECALHOS.forEach(function (h, i) { COL[h] = i; });

/** Rode uma vez pelo editor: cria a planilha e a aba com os cabeçalhos, se não existirem. */
function setup() {
  var ss = abrirPlanilha_(true);
  var aba = ss.getSheetByName(NOME_ABA);
  if (!aba) aba = ss.insertSheet(NOME_ABA);
  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, CABECALHOS.length).setValues([CABECALHOS]).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  // id e data como TEXTO, para o Sheets não converter
  aba.getRange('A:B').setNumberFormat('@');
  // remove a aba padrão vazia criada junto com a planilha
  ss.getSheets().forEach(function (s) {
    if (s.getName() !== NOME_ABA && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  Logger.log('Planilha pronta: ' + ss.getUrl());
  return ss.getUrl();
}

function abrirPlanilha_(criar) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* apagada: recria abaixo */ }
  }
  var ativa = null;
  try { ativa = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (ativa) { props.setProperty('SHEET_ID', ativa.getId()); return ativa; }
  if (!criar) throw new Error('Planilha não configurada: rode setup() no editor.');
  var nova = SpreadsheetApp.create(NOME_PLANILHA);
  props.setProperty('SHEET_ID', nova.getId());
  return nova;
}

function aba_() {
  var ss = abrirPlanilha_(false);
  var aba = ss.getSheetByName(NOME_ABA);
  if (!aba) { setup(); aba = ss.getSheetByName(NOME_ABA); }
  return aba;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Converte qualquer valor de data para 'yyyy-MM-dd' usando new Date(valor). */
function dataTexto_(v) {
  if (v === '' || v === null || v === undefined) return '';
  var s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // já está no formato certo
  var d = new Date(v);
  if (isNaN(d.getTime())) return s;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function linhaParaLog_(r) {
  var det = r[COL.detalhes];
  try { det = det ? JSON.parse(det) : {}; } catch (e) { det = {}; }
  var criado = r[COL.criadoEm];
  if (criado !== '' && criado !== null) {
    var dc = new Date(criado);
    criado = isNaN(dc.getTime()) ? String(criado) : dc.toISOString();
  }
  return {
    id: String(r[COL.id]),
    data: dataTexto_(r[COL.data]),
    pessoa: String(r[COL.pessoa]),
    treinoId: String(r[COL.treinoId]),
    treinoNome: String(r[COL.treinoNome]),
    fase: Number(r[COL.fase]) || 1,
    detalhes: det,
    rpe: r[COL.rpe] === '' ? null : Number(r[COL.rpe]),
    obs: String(r[COL.obs] || ''),
    criadoEm: String(criado || '')
  };
}

function logParaLinha_(l) {
  return [
    String(l.id),
    String(l.data || '').slice(0, 10),
    String(l.pessoa || ''),
    String(l.treinoId || ''),
    String(l.treinoNome || ''),
    Number(l.fase) || 1,
    typeof l.detalhes === 'string' ? l.detalhes : JSON.stringify(l.detalhes || {}),
    l.rpe === null || l.rpe === undefined || l.rpe === '' ? '' : Number(l.rpe),
    String(l.obs || ''),
    String(l.criadoEm || new Date().toISOString())
  ];
}

function lerLinhas_(aba) {
  var n = aba.getLastRow() - 1;
  if (n < 1) return [];
  return aba.getRange(2, 1, n, CABECALHOS.length).getValues();
}

function doGet(e) {
  try {
    var linhas = lerLinhas_(aba_());
    var logs = linhas.filter(function (r) { return r[COL.id] !== ''; }).map(linhaParaLog_);
    return json_({ ok: true, logs: logs });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var acao = body.action || 'save';
    var aba = aba_();
    var linhas = lerLinhas_(aba);

    if (acao === 'save' || acao === 'add' || acao === 'edit') {
      var l = body.log;
      if (!l || !l.id) throw new Error('log sem id');
      var linha = logParaLinha_(l);
      var idx = -1;
      for (var i = 0; i < linhas.length; i++) {
        if (String(linhas[i][COL.id]) === linha[COL.id]) { idx = i; break; }
      }
      if (idx < 0) { // deduplicar: mesma pessoa + treino + data
        for (var j = 0; j < linhas.length; j++) {
          if (String(linhas[j][COL.pessoa]) === linha[COL.pessoa] &&
              String(linhas[j][COL.treinoId]) === linha[COL.treinoId] &&
              dataTexto_(linhas[j][COL.data]) === linha[COL.data]) { idx = j; break; }
        }
      }
      var linhaPlanilha = idx < 0 ? aba.getLastRow() + 1 : idx + 2;
      aba.getRange(linhaPlanilha, 1, 1, 2).setNumberFormat('@');
      aba.getRange(linhaPlanilha, 1, 1, CABECALHOS.length).setValues([linha]);
      return json_({ ok: true, id: linha[COL.id], replaced: idx >= 0 });
    }

    if (acao === 'delete') {
      var id = String(body.id || '');
      var apagadas = 0;
      for (var k = linhas.length - 1; k >= 0; k--) {
        if (String(linhas[k][COL.id]) === id) { aba.deleteRow(k + 2); apagadas++; }
      }
      return json_({ ok: true, deleted: apagadas });
    }

    throw new Error('ação desconhecida: ' + acao);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
