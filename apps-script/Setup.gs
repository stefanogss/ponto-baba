/**
 * setup(): rode UMA vez pelo editor do Apps Script (Executar ▸ setup), com o script aberto a partir da planilha.
 * Cria as abas, protege-as, cria a pasta no Drive, carrega os feriados nacionais, gera a senha inicial
 * (mostrada no "Registro de execução") e instala os gatilhos. Pode ser rodado de novo sem perder dados.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abra o Apps Script a partir da planilha (Extensões ▸ Apps Script) e rode setup() de novo.');
  var P = PropertiesService.getScriptProperties();
  P.setProperty('PLANILHA_ID', ss.getId());
  ss.setSpreadsheetTimeZone(TZ);
  ss.setSpreadsheetLocale('pt_BR');

  Object.keys(ABAS).forEach(function (nome) {
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var cols = ABAS[nome];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#e8eef7');
      sh.setFrozenRows(1);
    }
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    var prots = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var prot = prots.length ? prots[0] : sh.protect();
    prot.setDescription('Somente o script grava nesta aba');
    prot.removeEditors(prot.getEditors());
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
  });
  ['Página1', 'Sheet1', 'Planilha1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  if (!P.getProperty('PASTA_RAIZ')) {
    var raiz = DriveApp.createFolder('Ponto Doméstico — arquivos');
    P.setProperty('PASTA_RAIZ', raiz.getId());
    ['Atestados', 'Fechamentos', 'Audios', 'Assinaturas'].forEach(function (s) { P.setProperty('PASTA_' + s, raiz.createFolder(s).getId()); });
  }

  var senhaGerada = null;
  if (!P.getProperty('SENHA_HASH')) {
    senhaGerada = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    var salt = Utilities.getUuid();
    P.setProperty('SENHA_SALT', salt);
    P.setProperty('SENHA_HASH', sha256Hex_(salt + senhaGerada));
  }

  CACHE_ = {};
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ctx = { ator: 'SISTEMA', operador: Session.getActiveUser().getEmail() || 'proprietário', dispositivo: 'Editor do Apps Script', ip: '' };
    var ano = +agora_().data.slice(0, 4);
    var feriados = 0;
    for (var a = 2025; a <= ano + 5; a++) feriados += carregarFeriadosNacionais_(a, ctx);
    if (!cfg_().primeiro_mes_sistema) definirConfig_(ctx, 'primeiro_mes_sistema', agora_().data.slice(0, 7), '', 'Definido no setup');
    log_(ctx, 'SETUP', 'Sistema', '', null, { abas: Object.keys(ABAS), feriados_incluidos: feriados, senha_inicial_gerada: !!senhaGerada }, '');
  } finally { lock.releaseLock(); CACHE_ = {}; }

  instalarGatilhos_();

  console.log('Setup concluído.');
  if (senhaGerada) console.log('SENHA INICIAL DOS ADMINISTRADORES: ' + senhaGerada + '  — anote e troque no painel (Configurações ▸ Trocar senha).');
  console.log('Próximo passo: Implantar ▸ Nova implantação ▸ App da Web (executar como: Eu; acesso: Qualquer pessoa).');
}

/** Utilitário de emergência: rode pelo editor se esquecerem a senha. Gera nova senha no Registro de execução. */
function redefinirSenha() {
  var nova = Utilities.getUuid().replace(/-/g, '').slice(0, 12), salt = Utilities.getUuid();
  setProp_('SENHA_SALT', salt);
  setProp_('SENHA_HASH', sha256Hex_(salt + nova));
  setProp_('LOGIN_BLOQ', JSON.stringify({ n: 0, ate: 0 }));
  comLock_(function () { log_({ ator: 'SISTEMA', operador: Session.getActiveUser().getEmail() || 'proprietário', dispositivo: 'Editor do Apps Script', ip: '' }, 'SENHA_REDEFINIDA', 'Sessao', '', null, null, 'Redefinição pelo editor do Apps Script'); });
  console.log('NOVA SENHA: ' + nova);
}

/** Verificação de integridade pelo editor (mesma função do painel). */
function verificarIntegridade() {
  comLock_(function () { console.log(JSON.stringify(verificarIntegridade_({}, CTX_SISTEMA).resultado)); });
}
