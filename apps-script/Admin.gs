/**
 * Administradores: senha única (hash SHA-256 com salt em Script Properties) + autodeclaração do nome.
 * Sessão: token temporário no CacheService, renovado a cada uso, expira após 30 min sem uso.
 */
var SESSAO_SEGUNDOS = 1800;

function adminNomes_() { return { nomes: lista_(cfg_().admins) }; }

function apelidoDe_(token) {
  if (!token) return '';
  try { return dispositivo_(token).apelido; } catch (e) { return ''; }
}

function hashSenha_(senha) { return sha256Hex_(prop_('SENHA_SALT') + String(senha || '')); }

function login_(r) {
  var ctx = { ator: 'ADMIN', operador: String(r.nome || ''), dispositivo: apelidoDe_(r.token_dispositivo) || 'Navegador', ip: r.ip || '' };
  var bloq = json_(prop_('LOGIN_BLOQ'), { n: 0, ate: 0 });
  if (bloq.ate > Date.now()) {
    log_(ctx, 'LOGIN_RECUSADO_BLOQUEIO', 'Sessao', '', null, { ate: new Date(bloq.ate).toISOString() }, '');
    throw erro_('Acesso bloqueado por 15 minutos após 5 tentativas erradas.', 'BLOQUEADO');
  }
  if (lista_(cfg_().admins).indexOf(ctx.operador) < 0) throw erro_('Escolha o seu nome na lista.');
  if (!prop_('SENHA_HASH')) throw erro_('Senha ainda não definida. Rode setup() no Apps Script.');
  if (hashSenha_(r.senha) !== prop_('SENHA_HASH')) {
    bloq.n = (bloq.n || 0) + 1;
    var bloqueou = bloq.n >= 5;
    if (bloqueou) { bloq.ate = Date.now() + 15 * 60000; bloq.n = 0; }
    setProp_('LOGIN_BLOQ', JSON.stringify(bloq));
    log_(ctx, 'LOGIN_FALHA', 'Sessao', '', null, { tentativa: bloqueou ? 5 : bloq.n }, '');
    if (bloqueou) log_(ctx, 'LOGIN_BLOQUEIO', 'Sessao', '', null, { minutos: 15 }, '5 tentativas erradas');
    throw erro_(bloqueou ? 'Senha incorreta. Acesso bloqueado por 15 minutos.' : 'Senha incorreta.', 'SENHA');
  }
  setProp_('LOGIN_BLOQ', JSON.stringify({ n: 0, ate: 0 }));
  var tok = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('S_' + tok, JSON.stringify({ nome: ctx.operador }), SESSAO_SEGUNDOS);
  log_(ctx, 'LOGIN', 'Sessao', '', null, { nome: ctx.operador }, 'Nome autodeclarado na entrada');
  return { sessao: tok, nome: ctx.operador };
}

function sessao_(r) {
  var c = CacheService.getScriptCache(), k = 'S_' + (r.sessao || '');
  var s = r.sessao ? c.get(k) : null;
  if (!s) throw erro_('Sessão expirada. Entre de novo.', 'SESSAO');
  c.put(k, s, SESSAO_SEGUNDOS);
  return JSON.parse(s);
}

function ctxAdmin_(r, s) {
  return { ator: 'ADMIN', operador: s.nome, dispositivo: apelidoDe_(r.token_dispositivo) || 'Navegador sem cadastro', ip: r.ip || '' };
}

function logout_(r, ctx) {
  CacheService.getScriptCache().remove('S_' + r.sessao);
  log_(ctx, 'LOGOUT', 'Sessao', '', null, null, '');
  return {};
}

function trocarSenha_(r, ctx) {
  if (hashSenha_(r.atual) !== prop_('SENHA_HASH')) throw erro_('Senha atual incorreta.');
  if (String(r.nova || '').length < 8) throw erro_('A nova senha deve ter pelo menos 8 caracteres.');
  var salt = Utilities.getUuid();
  setProp_('SENHA_SALT', salt);
  setProp_('SENHA_HASH', sha256Hex_(salt + r.nova));
  log_(ctx, 'SENHA_ALTERADA', 'Sessao', '', null, null, 'Senha não registrada');
  return {};
}

/* ---------------------------------------------------------------- dispositivos */

function listaDispositivos_() {
  return ler_('Dispositivos').map(function (d) { var o = semLinha_(d); delete o.token_hash; return o; });
}

function dispositivos_() { return { dispositivos: listaDispositivos_() }; }

function dispositivoCadastrar_(r, ctx) {
  var apelido = String(r.apelido || '').trim();
  if (!apelido) throw erro_('Dê um apelido ao aparelho (ex.: "Tablet da casa").');
  if (ler_('Dispositivos').some(function (d) { return d.apelido === apelido && d.ativo === 'SIM'; })) throw erro_('Já existe aparelho ativo com esse apelido.');
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var d = { id: novoId_('D'), token_hash: sha256Hex_(token), apelido: apelido, exige_rede_casa: r.exige_rede ? 'SIM' : 'NAO', ativo: 'SIM',
    cadastrado_em: agora_().iso, cadastrado_por: ctx.operador };
  anexar_('Dispositivos', d);
  var semToken = semLinha_(d); delete semToken.token_hash;
  log_(ctx, 'DISPOSITIVO_CADASTRADO', 'Dispositivos', d.id, null, semToken, '');
  return { token: token, dispositivo: semToken };
}

function dispositivoRevogar_(r, ctx) {
  var d = ler_('Dispositivos').filter(function (x) { return x.id === r.id; })[0];
  if (!d || d.ativo !== 'SIM') throw erro_('Aparelho não encontrado ou já revogado.');
  var antes = { ativo: d.ativo };
  atualizar_('Dispositivos', d, { ativo: 'NAO', revogado_em: agora_().iso, revogado_por: ctx.operador });
  log_(ctx, 'DISPOSITIVO_REVOGADO', 'Dispositivos', d.id, antes, { ativo: 'NAO', apelido: d.apelido }, r.justificativa || '');
  return dispositivos_();
}

/* ---------------------------------------------------------------- rede da casa */

function redeAutorizarAtual_(r, ctx) {
  var ip = String(r.ip || '').trim();
  if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) throw erro_('Não foi possível obter o IP desta conexão. Verifique a internet.');
  var ips = listaIps_();
  if (ips.indexOf(ip) >= 0) return { ips: ips, mensagem: 'Esta rede já estava autorizada.' };
  ips.push(ip);
  definirConfig_(ctx, 'ips_autorizados', ips.join(','), '', 'Autorizar a rede atual');
  log_(ctx, 'REDE_AUTORIZADA', 'Config', 'ips_autorizados', null, { ip: ip }, '');
  return { ips: ips, mensagem: 'Rede autorizada: ' + ip };
}

function redeRemover_(r, ctx) {
  var ips = listaIps_().filter(function (x) { return x !== r.ipRemover; });
  definirConfig_(ctx, 'ips_autorizados', ips.join(','), '', 'Remoção de IP autorizado: ' + r.ipRemover);
  return { ips: ips };
}

/* ---------------------------------------------------------------- feriados */

function feriadoSalvar_(r, ctx) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data || '') && !r.id) throw erro_('Informe a data.');
  var abr = ['nacional', 'estadual', 'municipal'];
  if (r.id) {
    var f = ler_('Feriados').filter(function (x) { return x.id === r.id; })[0];
    if (!f) throw erro_('Feriado não encontrado.');
    var antes = semLinha_(f);
    var patch = {};
    ['data', 'descricao', 'abrangencia', 'ativo'].forEach(function (k) { if (r[k] !== undefined) patch[k] = r[k]; });
    if (r.excluir) patch.ativo = 'EXCLUIDO';
    exigirMesAberto_(f.data); if (patch.data) exigirMesAberto_(patch.data);
    atualizar_('Feriados', f, patch);
    log_(ctx, r.excluir ? 'FERIADO_EXCLUIDO' : 'FERIADO_ALTERADO', 'Feriados', f.id, antes, semLinha_(f), r.justificativa || '');
  } else {
    if (!String(r.descricao || '').trim()) throw erro_('Informe a descrição.');
    if (abr.indexOf(r.abrangencia) < 0) throw erro_('Abrangência inválida.');
    exigirMesAberto_(r.data);
    var novo = { id: novoId_('H'), data: r.data, descricao: r.descricao, abrangencia: r.abrangencia, ativo: 'SIM', facultativo: 'NAO', origem: 'ADMIN' };
    anexar_('Feriados', novo);
    log_(ctx, 'FERIADO_INCLUIDO', 'Feriados', novo.id, null, novo, r.justificativa || '');
  }
  return { feriados: ler_('Feriados').map(semLinha_) };
}

function carregarFeriadosNacionais_(ano, ctx) {
  var existentes = {};
  ler_('Feriados').forEach(function (f) { existentes[f.data + '|' + f.descricao] = true; });
  var n = 0;
  Calculo.feriadosNacionais(ano).forEach(function (f) {
    if (existentes[f.data + '|' + f.descricao]) return;
    var novo = { id: novoId_('H'), data: f.data, descricao: f.descricao, abrangencia: 'nacional',
      ativo: f.facultativo ? 'NAO' : 'SIM', facultativo: f.facultativo ? 'SIM' : 'NAO', origem: 'SISTEMA' };
    anexar_('Feriados', novo); n++;
  });
  if (n) log_(ctx, 'FERIADOS_NACIONAIS_CARREGADOS', 'Feriados', String(ano), null, { ano: ano, quantidade: n }, 'Facultativos (Carnaval e Corpus Christi) ficam inativos até o administrador ativar');
  return n;
}

function feriadosCarregarNacionais_(r, ctx) {
  var ano = +r.ano;
  if (!(ano >= 2025 && ano <= 2100)) throw erro_('Ano inválido.');
  var n = carregarFeriadosNacionais_(ano, ctx);
  return { incluidos: n, feriados: ler_('Feriados').map(semLinha_) };
}

/* ---------------------------------------------------------------- carga inicial */

/**
 * r.banco: [{origem:'AAAA-MM-DD', minutos: (positivo = crédito; negativo = débito), vencimento?}]
 * r.ferias: [{aquisitivo_inicio, inicio, dias}]
 * r.meses: ['AAAA-MM', ...] meses já fechados fora do sistema
 * r.primeiro_mes_sistema: 'AAAA-MM'
 */
function cargaInicial_(r, ctx) {
  var agora = agora_(), c = cfg_(), n = 0;
  var J = 'Carga inicial' + (r.justificativa ? ': ' + r.justificativa : '');
  if (r.primeiro_mes_sistema) definirConfig_(ctx, 'primeiro_mes_sistema', r.primeiro_mes_sistema, '', J);
  (r.banco || []).forEach(function (b) {
    var min = Math.round(+b.minutos);
    if (!min || !/^\d{4}-\d{2}-\d{2}$/.test(b.origem || '')) throw erro_('Lançamento do banco inválido.');
    var row = min > 0
      ? { id: novoId_('B'), data: b.origem, tipo: 'CARGA', minutos: min, vencimento: b.vencimento || Calculo.addMeses(b.origem, +c.banco_validade_meses), obs: J }
      : { id: novoId_('B'), data: b.origem, tipo: 'CARGA_DEBITO', minutos: -min, obs: J };
    row.registrado_em = agora.iso; row.operador = ctx.operador;
    anexar_('BancoHoras', row);
    log_(ctx, 'CARGA_INICIAL', 'BancoHoras', row.id, null, row, J); n++;
  });
  (r.ferias || []).forEach(function (f) {
    var row = { id: novoId_('V'), tipo: 'GOZO', aquisitivo_inicio: f.aquisitivo_inicio, inicio: f.inicio, dias: +f.dias, comunicado_em: f.comunicado_em || '',
      registrado_em: agora.iso, operador: ctx.operador, obs: J };
    anexar_('Ferias', row);
    log_(ctx, 'CARGA_INICIAL', 'Ferias', row.id, null, row, J); n++;
  });
  (r.meses || []).forEach(function (m) {
    if (!/^\d{4}-\d{2}$/.test(m)) throw erro_('Mês inválido: ' + m);
    var row = { id: novoId_('F'), mes: m, versao: 0, tipo: 'FECHAMENTO_EXTERNO', data: agora.iso, dispositivo: ctx.dispositivo, operador: ctx.operador, justificativa: J };
    anexar_('Fechamentos', row);
    log_(ctx, 'CARGA_INICIAL', 'Fechamentos', row.id, null, row, J); n++;
  });
  return { registros: n };
}
