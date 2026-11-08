/**
 * Ponto Eletrônico Doméstico — backend em Google Apps Script.
 *
 * Arquivos do projeto:
 *   Code.gs          roteamento das requisições (este arquivo)
 *   Calculo.gs       regras de cálculo (cópia idêntica de calculo.js do repositório)
 *   Dados.gs         leitura e gravação nas abas da planilha
 *   Auditoria.gs     Log com cadeia de hash e verificação de integridade
 *   Config.gs        parâmetros (aba Config) com vigência
 *   Ponto.gs         ações do aparelho da empregada
 *   Admin.gs         login, sessão, configurações, dispositivos, rede, feriados, histórico, carga inicial
 *   Gestao.gs        correções, folgas, abonos, férias
 *   Espelho.gs       apuração, espelho, pendências, banco, valores, relatórios
 *   Fechamento.gs    fechamento mensal, PDF, ciência, reabertura
 *   Comprovantes.gs  comprovantes diários, alertas, adaptadores de envio, gatilhos
 *   Setup.gs         criação das abas, pasta no Drive, senha inicial
 */
var TZ = 'America/Sao_Paulo';

function doGet() {
  return ContentService.createTextOutput('Ponto Doméstico: serviço ativo.');
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return resposta_({ ok: false, erro: 'Requisição inválida.' }); }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (x) { return resposta_({ ok: false, erro: 'Servidor ocupado. Tente de novo.', codigo: 'OCUPADO' }); }
  try {
    var rotas = rotas_();
    var fn = rotas[req.acao];
    if (!fn) throw erro_('Ação desconhecida.');
    var r = fn(req) || {};
    r.ok = true;
    r.servidor = agora_().iso;
    return resposta_(r);
  } catch (err) {
    if (!err.codigo) console.error(err && err.stack ? err.stack : err);
    return resposta_({ ok: false, erro: err.message || String(err), codigo: err.codigo || null, dados: err.dados || null });
  } finally {
    CACHE_ = {};
    lock.releaseLock();
  }
}

function resposta_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function erro_(mensagem, codigo, dados) {
  var e = new Error(mensagem);
  e.codigo = codigo || 'ERRO';
  e.dados = dados || null;
  return e;
}

/** Envolve uma ação de administrador: exige sessão válida e entrega o contexto de auditoria. */
function adm_(fn) {
  return function (r) { var s = sessao_(r); return fn(r, ctxAdmin_(r, s)); };
}

function rotas_() {
  return {
    // ----- aparelho da empregada (autenticação pelo token do dispositivo)
    estado: estadoEmpregada_,
    marcar: marcar_,
    sincronizar: sincronizarOffline_,
    corrigirHoje: corrigirHoje_,
    resumoMes: resumoMesEmpregada_,
    ciencia: registrarCiencia_,

    // ----- login
    adminNomes: adminNomes_,
    login: login_,
    logout: adm_(logout_),

    // ----- painel
    adminHoje: adm_(adminHoje_),
    pendencias: adm_(pendencias_),
    espelho: adm_(espelho_),
    diaDetalhe: adm_(diaDetalhe_),
    corrigir: adm_(corrigirAdmin_),
    banco: adm_(banco_),
    folgas: adm_(folgas_),
    folgaLancar: adm_(folgaLancar_),
    folgaReverter: adm_(folgaReverter_),
    abonos: adm_(abonos_),
    abonoLancar: adm_(abonoLancar_),
    abonoReverter: adm_(abonoReverter_),
    ferias: adm_(ferias_),
    feriasLancar: adm_(feriasLancar_),
    feriasCancelar: adm_(feriasCancelar_),
    valores: adm_(valores_),
    fechamentos: adm_(fechamentos_),
    fechar: adm_(fechar_),
    reabrir: adm_(reabrir_),
    anexarAssinatura: adm_(anexarAssinatura_),
    relatorio: adm_(relatorio_),
    log: adm_(listarLog_),
    verificarIntegridade: adm_(verificarIntegridade_),
    configLer: adm_(configLer_),
    configSalvar: adm_(configSalvar_),
    feriadoSalvar: adm_(feriadoSalvar_),
    feriadosCarregarNacionais: adm_(feriadosCarregarNacionais_),
    redeAutorizarAtual: adm_(redeAutorizarAtual_),
    redeRemover: adm_(redeRemover_),
    dispositivos: adm_(dispositivos_),
    dispositivoCadastrar: adm_(dispositivoCadastrar_),
    dispositivoRevogar: adm_(dispositivoRevogar_),
    trocarSenha: adm_(trocarSenha_),
    instalarGatilhos: adm_(instalarGatilhosAdmin_),
    testarComprovante: adm_(testarComprovante_),
    cargaInicial: adm_(cargaInicial_)
  };
}
