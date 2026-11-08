/**
 * Trilha de auditoria (aba Log): cada registro guarda o hash do anterior.
 * hash = SHA-256(hash_anterior + conteúdo canônico do registro)  — ver Calculo.canonLog.
 */

function sha256Hex_(texto) {
  return hexBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texto), Utilities.Charset.UTF_8));
}

/**
 * Grava um registro no Log. Deve ser chamado dentro do lock (doPost ou gatilhos já o obtêm).
 * ctx: {ator: 'EMPREGADA'|'ADMIN'|'SISTEMA', operador, dispositivo, ip}
 */
function log_(ctx, acao, entidade, idEntidade, anterior, novo, justificativa) {
  var sh = aba_('Log');
  var n = sh.getLastRow();
  var hashAnt = n > 1 ? sh.getRange(n, ABAS.Log.indexOf('hash') + 1).getDisplayValue() : Calculo.GENESIS;
  var reg = {
    id: novoId_('L'),
    timestamp_servidor: agora_().iso,
    ator: ctx.ator,
    nome_operador: ctx.operador || '',
    dispositivo: ctx.dispositivo || '',
    ip: ctx.ip || '',
    acao: acao,
    entidade: entidade || '',
    id_entidade: idEntidade || '',
    valor_anterior: anterior === null || anterior === undefined ? '' : JSON.stringify(anterior),
    valor_novo: novo === null || novo === undefined ? '' : JSON.stringify(novo),
    justificativa: justificativa || '',
    hash_anterior: hashAnt
  };
  // o hash é calculado sobre o texto exatamente como será gravado
  Calculo.LOG_CAMPOS.forEach(function (k) { reg[k] = limpa_(reg[k]); });
  reg.hash = Calculo.hashLog(reg, sha256Hex_);
  anexar_('Log', reg);
  return reg;
}

var CTX_SISTEMA = { ator: 'SISTEMA', operador: '', dispositivo: 'Apps Script', ip: '' };

function verificarIntegridade_(r, ctx) {
  var regs = ler_('Log').slice();
  var res = Calculo.verificarCadeia(regs, sha256Hex_);
  if (!res.ok) res.linha = regs[res.indice]._linha;
  log_(ctx, 'VERIFICACAO_INTEGRIDADE', 'Log', '', null, res, '');
  return { resultado: res };
}

function listarLog_(r) {
  var regs = ler_('Log');
  var de = r.de || '0000', ate = (r.ate || '9999') + 'T99';
  var out = regs.filter(function (x) {
    if (x.timestamp_servidor < de || x.timestamp_servidor > ate) return false;
    if (r.ator && x.ator !== r.ator) return false;
    if (r.filtroAcao && x.acao.indexOf(String(r.filtroAcao).toUpperCase()) < 0) return false;
    if (r.texto && JSON.stringify(x).toLowerCase().indexOf(String(r.texto).toLowerCase()) < 0) return false;
    return true;
  });
  var total = out.length;
  out = out.slice(-(+r.limite || 3000)).reverse().map(function (x) { var o = {}; ABAS.Log.forEach(function (k) { o[k] = x[k]; }); return o; });
  return { registros: out, total: total };
}
