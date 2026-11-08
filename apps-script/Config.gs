/**
 * Parâmetros (aba Config). A aba é append-only: cada alteração acrescenta uma linha, e o valor vigente é a
 * última linha da chave. Para salário-base, vale-alimentação e divisor vale a linha com a maior
 * "vigencia_desde" que não seja posterior à data de referência — assim, alterações não recalculam meses passados.
 * Senhas e chaves de API NÃO ficam aqui: ficam em Script Properties.
 */
var CONFIG_PADRAO = {
  admissao: '2025-06-04',
  dias_trabalho: '1,2,3,4,5',
  entrada: '09:00',
  saida: '17:30',
  intervalo_min: '30',
  faixa_ini: '11:00',
  faixa_fim: '14:00',
  jornada_min: '480',
  jornada_semanal_min: '2400',
  tol_marcacao: '5',
  tol_diaria: '10',
  salario_base: '2321.00',
  vale_alimentacao: '600.00',
  divisor: '200',
  municipio: 'Florianópolis/SC',
  intervalo_suprimido_tambem_no_banco: 'nao',
  reflexo_dsr: 'nao',
  limite_pagar_mes_min: '2400',
  banco_validade_meses: '12',
  ferias_fracao_minima: '0',
  ips_autorizados: '',
  admins: 'Administrador 1,Administrador 2',
  email_empregada: '',
  emails_admins: '',
  hora_comprovante: '20',
  canal_comprovante: 'email',
  telefone_empregada: '',
  telefones_admins: '',
  empregador_nome: '',
  empregador_cpf: '',
  empregada_nome: '',
  empregada_cpf: '',
  primeiro_mes_sistema: ''
};

var CONFIG_COM_VIGENCIA = ['salario_base', 'vale_alimentacao', 'divisor'];

var CONFIG_ROTULOS = {
  admissao: 'Data de admissão', dias_trabalho: 'Dias de trabalho (0=dom … 6=sáb)', entrada: 'Entrada', saida: 'Saída',
  intervalo_min: 'Intervalo contratual (min)', faixa_ini: 'Faixa do intervalo: início', faixa_fim: 'Faixa do intervalo: fim',
  jornada_min: 'Jornada diária (min)', jornada_semanal_min: 'Jornada semanal (min)', tol_marcacao: 'Tolerância por marcação (min)',
  tol_diaria: 'Tolerância diária (min)', salario_base: 'Salário-base (R$)', vale_alimentacao: 'Vale-alimentação (R$)',
  divisor: 'Divisor do salário-hora', municipio: 'Município para feriados',
  intervalo_suprimido_tambem_no_banco: 'Intervalo suprimido também no banco (sim/nao)', reflexo_dsr: 'Exibir reflexo das HE no DSR (sim/nao)',
  limite_pagar_mes_min: 'Horas a pagar no mês antes do banco (min)', banco_validade_meses: 'Validade do crédito no banco (meses)',
  ferias_fracao_minima: 'Férias: mínimo de dias de CADA período (0 = só a regra legal)', ips_autorizados: 'IPs autorizados (rede da casa)',
  admins: 'Nomes dos administradores (separados por vírgula)', email_empregada: 'E-mail da empregada',
  emails_admins: 'E-mails dos administradores (vírgula)', hora_comprovante: 'Hora do comprovante diário (0–23)',
  canal_comprovante: 'Canal do comprovante (email, callmebot, whatsapp_cloud; vírgula)', telefone_empregada: 'WhatsApp da empregada (opcional)',
  telefones_admins: 'WhatsApp dos administradores (opcional)', empregador_nome: 'Nome do empregador', empregador_cpf: 'CPF do empregador',
  empregada_nome: 'Nome da empregada', empregada_cpf: 'CPF da empregada', primeiro_mes_sistema: 'Primeiro mês apurado pelo sistema (AAAA-MM)'
};

function cfg_(dataRef) {
  dataRef = dataRef || agora_().data;
  var out = {}, vig = {}, k;
  for (k in CONFIG_PADRAO) out[k] = CONFIG_PADRAO[k];
  ler_('Config').forEach(function (r) {
    if (CONFIG_COM_VIGENCIA.indexOf(r.chave) >= 0) {
      var v = r.vigencia_desde || '0000-00-00';
      if (v > dataRef) return;
      if (vig[r.chave] !== undefined && v < vig[r.chave]) return;
      vig[r.chave] = v;
    }
    out[r.chave] = r.valor;
  });
  return out;
}

function sim_(v) { return /^s/i.test(String(v || '')); }

function params_(c) {
  c = c || cfg_();
  return Calculo.params({
    entrada: c.entrada, saida: c.saida, intervalo_min: +c.intervalo_min, faixa_ini: c.faixa_ini, faixa_fim: c.faixa_fim,
    jornada_min: +c.jornada_min, tol_marcacao: +c.tol_marcacao, tol_diaria: +c.tol_diaria,
    dias_trabalho: String(c.dias_trabalho).split(',').map(function (x) { return +x; }),
    intervalo_suprimido_tambem_no_banco: sim_(c.intervalo_suprimido_tambem_no_banco),
    limite_pagar_mes_min: +c.limite_pagar_mes_min, banco_validade_meses: +c.banco_validade_meses
  });
}

function lista_(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(String); }

function validarValorConfig_(chave, valor) {
  var v = String(valor).trim();
  var hora = /^([01]\d|2[0-3]):[0-5]\d$/, data = /^\d{4}-\d{2}-\d{2}$/, num = /^\d+(\.\d+)?$/;
  if (['entrada', 'saida', 'faixa_ini', 'faixa_fim'].indexOf(chave) >= 0 && !hora.test(v)) throw erro_('Use o formato HH:MM.');
  if (chave === 'admissao' && !data.test(v)) throw erro_('Use o formato AAAA-MM-DD.');
  if (chave === 'primeiro_mes_sistema' && v && !/^\d{4}-\d{2}$/.test(v)) throw erro_('Use o formato AAAA-MM.');
  if (['intervalo_min', 'jornada_min', 'jornada_semanal_min', 'tol_marcacao', 'tol_diaria', 'salario_base', 'vale_alimentacao',
    'divisor', 'limite_pagar_mes_min', 'banco_validade_meses', 'ferias_fracao_minima', 'hora_comprovante'].indexOf(chave) >= 0 && !num.test(v))
    throw erro_('Informe um número (use ponto para decimais).');
  if (chave === 'hora_comprovante' && +v > 23) throw erro_('Hora entre 0 e 23.');
  if (chave === 'dias_trabalho' && !/^[0-6](,[0-6])*$/.test(v)) throw erro_('Use números de 0 a 6 separados por vírgula.');
  if (/^emails?_/.test(chave) && v) lista_(v).forEach(function (e) { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw erro_('E-mail inválido: ' + e); });
  return v;
}

function definirConfig_(ctx, chave, valor, vigencia, justificativa) {
  if (!(chave in CONFIG_PADRAO)) throw erro_('Parâmetro desconhecido: ' + chave);
  var v = validarValorConfig_(chave, valor);
  var com = CONFIG_COM_VIGENCIA.indexOf(chave) >= 0;
  if (com && !/^\d{4}-\d{2}-\d{2}$/.test(vigencia || '')) throw erro_('Informe a data de início da vigência.');
  var anterior = cfg_(com ? vigencia : null)[chave];
  if (anterior === v && !com) return;
  var linha = { chave: chave, valor: v, vigencia_desde: com ? vigencia : '', alterado_em: agora_().iso, alterado_por: ctx.operador || ctx.ator };
  anexar_('Config', linha);
  log_(ctx, 'CONFIG_ALTERADA', 'Config', chave, { valor: anterior }, { valor: v, vigencia_desde: linha.vigencia_desde }, justificativa || '');
}

function configLer_() {
  var c = cfg_(), historico = {};
  ler_('Config').forEach(function (r) { (historico[r.chave] = historico[r.chave] || []).push({ valor: r.valor, vigencia_desde: r.vigencia_desde, alterado_em: r.alterado_em, alterado_por: r.alterado_por }); });
  return { config: c, rotulos: CONFIG_ROTULOS, comVigencia: CONFIG_COM_VIGENCIA, historico: historico,
    feriados: ler_('Feriados').map(semLinha_), dispositivos: listaDispositivos_() };
}

function configSalvar_(r, ctx) {
  var alteracoes = r.alteracoes || [];
  var mudouHora = false;
  alteracoes.forEach(function (a) {
    definirConfig_(ctx, a.chave, a.valor, a.vigencia_desde, r.justificativa);
    if (a.chave === 'hora_comprovante') mudouHora = true;
  });
  if (mudouHora) instalarGatilhos_();
  return configLer_();
}

function semLinha_(o) { var x = {}; for (var k in o) if (k !== '_linha') x[k] = o[k]; return x; }
