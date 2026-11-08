/**
 * Ações do aparelho da empregada. Não há senha: só aparelhos cadastrados (token) registram ponto.
 * O horário oficial de cada marcação online é o do servidor.
 */

var MOTIVOS_EMPREGADA = {
  ESQUECI: 'Esqueci de marcar',
  ERRADO: 'Marquei errado',
  SEM_INTERNET: 'Estava sem internet',
  OUTRO: 'Outro motivo'
};

function dispositivo_(token) {
  if (!token) throw erro_('Aparelho não autorizado.', 'NAO_AUTORIZADO');
  var h = sha256Hex_(token);
  var d = ler_('Dispositivos').filter(function (x) { return x.token_hash === h && x.ativo === 'SIM'; })[0];
  if (!d) throw erro_('Aparelho não autorizado.', 'NAO_AUTORIZADO');
  return d;
}

function ctxEmpregada_(d, ip) { return { ator: 'EMPREGADA', operador: '', dispositivo: d.apelido, ip: ip || '' }; }

function listaIps_() { return lista_(cfg_().ips_autorizados); }

/** Restrição de rede (item 3.3). Registra a recusa no Log antes de recusar. */
function verificarRede_(d, ip, ctx, tipo) {
  if (d.exige_rede_casa !== 'SIM') return;
  if (ip && listaIps_().indexOf(ip) >= 0) return;
  log_(ctx, 'MARCACAO_RECUSADA_REDE', 'Eventos', '', null, { tipo: tipo, ip: ip || '(não obtido)' }, 'IP fora da lista autorizada');
  throw erro_('Conecte o celular no Wi-Fi da casa.', 'REDE');
}

function eventosDoDia_(data) {
  return ler_('Eventos').filter(function (e) { return e.data === data; });
}

/** Grava um evento (append-only) e o registro correspondente no Log. */
function novoEvento_(ctx, acaoLog, c) {
  var ev = {
    id: novoId_('E'), ts_servidor: agora_().iso, data: c.data, hora: c.hora || '', tipo: c.tipo, origem: c.origem,
    ref_id: c.ref_id || '', ator: ctx.ator, operador: ctx.operador || '', dispositivo: ctx.dispositivo || '', ip: ctx.ip || '',
    hora_aparelho: c.hora_aparelho || '', hora_recebimento: c.hora_recebimento || '', justificativa: c.justificativa || '',
    alertas: (c.alertas || []).join('; '), dados: c.dados ? JSON.stringify(c.dados) : ''
  };
  var gravado = anexar_('Eventos', ev);
  log_(ctx, acaoLog, 'Eventos', ev.id, c.anterior || null, semLinha_(gravado), ev.justificativa);
  return gravado;
}

function marcasParaTela_(cons) {
  return cons.validos.map(function (e) {
    return { id: e.id, tipo: e.tipo, hora: String(e.hora).slice(0, 5), correcao: /^CORRECAO/.test(e.origem), offline: e.origem === 'OFFLINE' };
  });
}

function estadoEmpregada_(r) {
  var d = dispositivo_(r.token), agora = agora_();
  var cons = Calculo.consolidarDia(eventosDoDia_(agora.data));
  var pend = cienciaPendente_();
  return {
    autorizado: true, apelido: d.apelido, exigeRede: d.exige_rede_casa === 'SIM',
    data: agora.data, hora: agora.hora,
    marcas: marcasParaTela_(cons), naoUsufruido: cons.naoUsufruido,
    proxima: Calculo.proximaMarcacao(cons),
    ciencia: pend ? { mes: pend.mes, versao: pend.versao } : null
  };
}

function alertasIntervalo_(ini, fim, p) {
  var al = [], dur = Calculo.hm(fim) - Calculo.hm(ini);
  if (Calculo.hm(ini) < Calculo.hm(p.faixa_ini) || Calculo.hm(fim) > Calculo.hm(p.faixa_fim)) al.push('Intervalo fora da faixa');
  if (dur < p.intervalo_min) al.push('Intervalo inferior a ' + p.intervalo_min + ' min');
  if (dur > p.intervalo_max) al.push('Intervalo superior a 2 horas');
  return al;
}

function validaHora_(h) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || ''))) throw erro_('Horário inválido.');
  return h + ':00';
}

/** Saída sem intervalo registrado: grava o que a empregada respondeu (item 5.2). */
function gravarRespostaIntervalo_(ctx, data, intervalo, entradaMin, limiteMin, origemBase) {
  if (!intervalo) throw erro_('Responda se fez intervalo.', 'PERGUNTA_INTERVALO');
  if (intervalo.fez) {
    var ini = validaHora_(intervalo.inicio), fim = validaHora_(intervalo.fim);
    var mi = Calculo.hm(ini), mf = Calculo.hm(fim);
    if (mf <= mi) throw erro_('O fim do intervalo deve ser depois do início.');
    if (mi < entradaMin || mf > limiteMin) throw erro_('O intervalo deve ficar entre a entrada e a saída.');
    var al = ['Correção pela empregada'].concat(alertasIntervalo_(ini, fim, params_()));
    if (origemBase === 'OFFLINE') al.push('Informado sem internet');
    novoEvento_(ctx, 'CORRECAO_EMPREGADA', { data: data, hora: ini, tipo: 'INICIO_INTERVALO', origem: 'CORRECAO_EMPREGADA', justificativa: 'Intervalo informado na saída', alertas: al });
    novoEvento_(ctx, 'CORRECAO_EMPREGADA', { data: data, hora: fim, tipo: 'FIM_INTERVALO', origem: 'CORRECAO_EMPREGADA', justificativa: 'Intervalo informado na saída', alertas: al });
  } else {
    novoEvento_(ctx, 'INTERVALO_NAO_USUFRUIDO', { data: data, hora: Calculo.fmtHora(limiteMin) + ':00', tipo: 'INTERVALO_NAO_USUFRUIDO',
      origem: origemBase === 'OFFLINE' ? 'OFFLINE' : 'ONLINE', justificativa: 'Confirmado pela empregada na saída', alertas: ['Intervalo não usufruído'] });
  }
}

function marcar_(r) {
  var d = dispositivo_(r.token), ctx = ctxEmpregada_(d, r.ip), agora = agora_();
  verificarRede_(d, r.ip, ctx, r.tipo);
  var evs = eventosDoDia_(agora.data), cons = Calculo.consolidarDia(evs), prox = Calculo.proximaMarcacao(cons);
  if (!prox) throw erro_('Todas as marcações de hoje já foram feitas.', 'COMPLETO', estadoEmpregada_(r));
  var permitidas = [prox];
  if (prox === 'INICIO_INTERVALO') permitidas.push('SAIDA');
  if (permitidas.indexOf(r.tipo) < 0) throw erro_('A tela estava desatualizada. Tente de novo.', 'SEQUENCIA', estadoEmpregada_(r));
  var ultimo = cons.validos[cons.validos.length - 1];
  if (ultimo && ultimo.ts_servidor && (agora.ms - new Date(ultimo.ts_servidor + '-03:00').getTime()) < 60000 && ultimo.origem === 'ONLINE')
    throw erro_('Marcação já feita há menos de 1 minuto.', 'DUPLO', estadoEmpregada_(r));

  if (r.tipo === 'SAIDA' && prox === 'INICIO_INTERVALO')
    gravarRespostaIntervalo_(ctx, agora.data, r.intervalo, cons.marcas.ENTRADA, Calculo.hm(agora.hora), 'ONLINE');

  var al = [];
  if (r.tipo === 'FIM_INTERVALO' && cons.marcas.INICIO_INTERVALO !== undefined)
    al = alertasIntervalo_(Calculo.fmtHora(cons.marcas.INICIO_INTERVALO), agora.hora.slice(0, 5), params_());
  if (Calculo.diaSemana(agora.data) === 0 || Calculo.diaSemana(agora.data) === 6 || feriadoEm_(agora.data)) al.push('Escala extraordinária');
  var ev = novoEvento_(ctx, 'MARCACAO', { data: agora.data, hora: agora.hora, tipo: r.tipo, origem: 'ONLINE', alertas: al });
  return { marcacao: { id: ev.id, tipo: ev.tipo, hora: ev.hora.slice(0, 5) }, estado: estadoEmpregada_(r) };
}

function feriadoEm_(data) {
  return ler_('Feriados').some(function (f) { return f.data === data && f.ativo === 'SIM'; });
}

/** Recebe a fila offline do aparelho (item 5.4). Cada item tem id_local para não duplicar. */
function sincronizarOffline_(r) {
  var d = dispositivo_(r.token), ctx = ctxEmpregada_(d, r.ip), agora = agora_();
  var ja = {};
  ler_('Eventos').forEach(function (e) { if (e.dados && e.dados.indexOf('id_local') >= 0) { var x = json_(e.dados, {}); if (x.id_local) ja[x.id_local] = e.id; } });
  var fechados = estadoFechamentos_();
  var resultados = (r.itens || []).map(function (item) {
    try {
      if (ja[item.id_local]) return { id_local: item.id_local, status: 'DUPLICADO' };
      if (Calculo.SEQ.indexOf(item.tipo) < 0) throw erro_('Tipo inválido.');
      var m = Calculo.montarMarcacaoOffline({ tipo: item.tipo, hora_aparelho: item.hora_aparelho, relogio_envio_ms: r.relogio_envio_ms }, agora);
      var f = fechados[m.data.slice(0, 7)];
      if (f && f.status === 'FECHADO') m.alertas.push('Recebida após o fechamento do mês');
      if (item.tipo === 'SAIDA' && item.intervalo) {
        var cons = Calculo.consolidarDia(eventosDoDia_(m.data));
        if (cons.marcas.INICIO_INTERVALO === undefined && !cons.naoUsufruido)
          gravarRespostaIntervalo_(ctx, m.data, item.intervalo, cons.marcas.ENTRADA === undefined ? 0 : cons.marcas.ENTRADA, Calculo.hm(m.hora), 'OFFLINE');
      }
      var ev = novoEvento_(ctx, 'MARCACAO_OFFLINE', { data: m.data, hora: m.hora, tipo: m.tipo, origem: 'OFFLINE', hora_aparelho: m.hora_aparelho,
        hora_recebimento: m.hora_recebimento, alertas: m.alertas, dados: { id_local: item.id_local } });
      ja[item.id_local] = ev.id;
      return { id_local: item.id_local, status: 'OK', id: ev.id };
    } catch (e) {
      return { id_local: item.id_local, status: 'ERRO', erro: e.message };
    }
  });
  return { resultados: resultados, estado: estadoEmpregada_(r) };
}

/** Correção no mesmo dia pela empregada (item 5.3). Nada é apagado. */
function corrigirHoje_(r) {
  var d = dispositivo_(r.token), ctx = ctxEmpregada_(d, r.ip), agora = agora_();
  var rotulo = MOTIVOS_EMPREGADA[r.motivo];
  if (!rotulo) throw erro_('Escolha o motivo.');
  var just = rotulo + (r.texto ? ': ' + String(r.texto).slice(0, 500) : '');
  var dados = {};
  if (r.audio && r.audio.base64) {
    var arq = salvarArquivo_('Audios', 'audio_' + agora.iso.replace(/:/g, '') + '.webm', r.audio.mime || 'audio/webm', r.audio.base64);
    dados.audio_url = arq.url; dados.audio_hash = arq.hash;
    just += ' [áudio anexado]';
  }
  var cons = Calculo.consolidarDia(eventosDoDia_(agora.data));
  if (r.operacao === 'INCLUIR') {
    if (Calculo.SEQ.indexOf(r.tipo) < 0) throw erro_('Escolha a marcação.');
    var h = validaHora_(r.hora);
    if (h > agora.hora) throw erro_('O horário não pode ser depois de agora.');
    novoEvento_(ctx, 'CORRECAO_EMPREGADA', { data: agora.data, hora: h, tipo: r.tipo, origem: 'CORRECAO_EMPREGADA', justificativa: just,
      alertas: ['Correção pela empregada'], dados: dados });
  } else if (r.operacao === 'ANULAR') {
    var alvo = cons.validos.filter(function (e) { return e.id === r.ref_id; })[0];
    if (!alvo) throw erro_('Marcação não encontrada entre as de hoje.');
    dados.status = 'anulada pela empregada';
    novoEvento_(ctx, 'ANULACAO', { data: agora.data, hora: agora.hora, tipo: 'ANULACAO', origem: 'CORRECAO_EMPREGADA', ref_id: alvo.id,
      justificativa: just, alertas: ['Correção pela empregada'], dados: dados, anterior: semLinha_(alvo) });
  } else throw erro_('Operação inválida.');
  return { estado: estadoEmpregada_(r) };
}
