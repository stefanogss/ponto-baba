/**
 * Acesso à planilha. Todas as células são gravadas como TEXTO (formato "@") e lidas com getDisplayValues(),
 * para que o conteúdo usado no hash seja exatamente o que fica guardado.
 *
 * Abas append-only (nunca alteradas): Eventos, Log, Config, Ferias, Abonos, BancoHoras, Fechamentos.
 * Abas de cadastro com alteração no lugar (sempre com valor anterior e novo no Log): Dispositivos, Feriados.
 */
var ABAS = {
  Eventos: ['id', 'ts_servidor', 'data', 'hora', 'tipo', 'origem', 'ref_id', 'ator', 'operador', 'dispositivo', 'ip',
    'hora_aparelho', 'hora_recebimento', 'justificativa', 'alertas', 'dados'],
  Log: ['id', 'timestamp_servidor', 'ator', 'nome_operador', 'dispositivo', 'ip', 'acao', 'entidade', 'id_entidade',
    'valor_anterior', 'valor_novo', 'justificativa', 'hash_anterior', 'hash'],
  Dispositivos: ['id', 'token_hash', 'apelido', 'exige_rede_casa', 'ativo', 'cadastrado_em', 'cadastrado_por', 'revogado_em', 'revogado_por'],
  Config: ['chave', 'valor', 'vigencia_desde', 'alterado_em', 'alterado_por'],
  Feriados: ['id', 'data', 'descricao', 'abrangencia', 'ativo', 'facultativo', 'origem'],
  Ferias: ['id', 'tipo', 'ref_id', 'aquisitivo_inicio', 'inicio', 'dias', 'comunicado_em', 'registrado_em', 'operador', 'obs'],
  Abonos: ['id', 'tipo', 'ref_id', 'data', 'integral', 'hora_ini', 'hora_fim', 'minutos', 'motivo', 'anexo_url', 'anexo_hash', 'registrado_em', 'operador'],
  BancoHoras: ['id', 'data', 'tipo', 'minutos', 'lote_id', 'vencimento', 'mes_ref', 'versao', 'obs', 'registrado_em', 'operador'],
  Fechamentos: ['id', 'mes', 'versao', 'tipo', 'data', 'arquivo_id', 'arquivo_url', 'hash_pdf', 'dispositivo', 'operador', 'justificativa', 'resumo']
};

var CACHE_ = {};

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, v); }

function planilha_() {
  if (CACHE_._ss) return CACHE_._ss;
  var id = prop_('PLANILHA_ID');
  CACHE_._ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return CACHE_._ss;
}

function aba_(nome) {
  var sh = planilha_().getSheetByName(nome);
  if (!sh) throw erro_('A aba "' + nome + '" não existe. Rode a função setup() no Apps Script.');
  return sh;
}

/** Lê a aba inteira como lista de objetos (texto). Guarda em cache durante a requisição. */
function ler_(nome) {
  if (CACHE_[nome]) return CACHE_[nome];
  var sh = aba_(nome), cols = ABAS[nome], n = sh.getLastRow(), out = [];
  if (n > 1) {
    var v = sh.getRange(2, 1, n - 1, cols.length).getDisplayValues();
    for (var i = 0; i < v.length; i++) {
      var o = { _linha: i + 2 };
      for (var j = 0; j < cols.length; j++) o[cols[j]] = v[i][j];
      out.push(o);
    }
  }
  CACHE_[nome] = out;
  return out;
}

/** Evita que um texto iniciado por "=", "+" ou "@" seja interpretado como fórmula. */
function limpa_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') v = JSON.stringify(v);
  v = String(v);
  return /^[=+@]/.test(v) ? '’' + v : v;
}

/** Acrescenta uma linha ao final da aba. Devolve o objeto como gravado (texto). */
function anexar_(nome, obj) {
  var sh = aba_(nome), cols = ABAS[nome];
  var linha = cols.map(function (c) { return limpa_(obj[c]); });
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, cols.length).setNumberFormat('@').setValues([linha]);
  var o = { _linha: r };
  cols.forEach(function (c, i) { o[c] = linha[i]; });
  if (CACHE_[nome]) CACHE_[nome].push(o);
  return o;
}

/** Altera campos de uma linha (somente Dispositivos e Feriados). */
function atualizar_(nome, registro, patch) {
  var sh = aba_(nome), cols = ABAS[nome];
  Object.keys(patch).forEach(function (k) {
    var j = cols.indexOf(k);
    if (j < 0) return;
    sh.getRange(registro._linha, j + 1).setNumberFormat('@').setValue(limpa_(patch[k]));
    registro[k] = limpa_(patch[k]);
  });
}

function novoId_(prefixo) {
  return prefixo + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase();
}

/** Hora oficial: a do servidor, no fuso America/Sao_Paulo. */
function agora_() {
  var d = new Date();
  return {
    ms: d.getTime(),
    data: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'),
    hora: Utilities.formatDate(d, TZ, 'HH:mm:ss'),
    iso: Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ss")
  };
}

function json_(s, padrao) { try { return s ? JSON.parse(s) : padrao; } catch (e) { return padrao; } }

/* ---------------------------------------------------------------- arquivos no Drive */

function pasta_(sub) {
  var id = prop_('PASTA_' + sub);
  if (!id) throw erro_('Pasta do Drive não configurada. Rode setup().');
  return DriveApp.getFolderById(id);
}

function hexBytes_(bytes) {
  return bytes.map(function (x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}

function hashBlob_(blob) {
  return hexBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, blob.getBytes()));
}

/** Salva um arquivo (base64) na subpasta e devolve {id, url, hash}. Acesso restrito ao dono da conta. */
function salvarArquivo_(sub, nome, mime, base64) {
  if (!base64) return null;
  var bytes = Utilities.base64Decode(String(base64).replace(/^data:[^,]*,/, ''));
  if (bytes.length > 15 * 1024 * 1024) throw erro_('Arquivo grande demais (máximo 15 MB).');
  var blob = Utilities.newBlob(bytes, mime || 'application/octet-stream', nome || 'arquivo');
  return salvarBlob_(sub, blob);
}

function salvarBlob_(sub, blob) {
  var f = pasta_(sub).createFile(blob);
  return { id: f.getId(), url: f.getUrl(), hash: hashBlob_(blob) };
}
