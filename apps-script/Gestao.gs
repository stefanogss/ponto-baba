/**
 * Lançamentos do administrador: correção de marcação, folga compensatória, abono e férias.
 * Tudo por novos registros; o original nunca é apagado. Justificativa obrigatória.
 */

function exigirJustificativa_(j) {
  if (String(j || '').trim().length < 5) throw erro_('A justificativa é obrigatória (mínimo 5 caracteres).');
  return String(j).trim();
}

function dataValida_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) throw erro_('Data inválida.');
  return d;
}

function resumoDia_(data) {
  var x = apurar_(data, data)[0];
  return diaParaCliente_(x);
}

/* ---------------------------------------------------------------- correção de marcação (tela 4) */

function corrigirAdmin_(r, ctx) {
  var data = dataValida_(r.data), just = exigirJustificativa_(r.justificativa);
  exigirMesAberto_(data);
  if (data > agora_().data) throw erro_('Não é possível corrigir dia futuro.');
  var antes = resumoDia_(data);
  var evs = eventosDoDia_(data), cons = Calculo.consolidarDia(evs);
  var alvo = r.ref_id ? evs.filter(function (e) { return e.id === r.ref_id; })[0] : null;
  var tipos = Calculo.SEQ.concat(['INTERVALO_NAO_USUFRUIDO']);
  if (r.operacao === 'ANULAR' || r.operacao === 'AJUSTAR') {
    if (!alvo) throw erro_('Escolha a marcação a anular ou ajustar.');
    if (evs.some(function (e) { return e.tipo === 'ANULACAO' && e.ref_id === alvo.id; })) throw erro_('Esta marcação já está anulada.');
    novoEvento_(ctx, 'ANULACAO', { data: data, hora: '', tipo: 'ANULACAO', origem: 'CORRECAO_ADMIN', ref_id: alvo.id, justificativa: just,
      alertas: ['Correção pelo administrador'], anterior: semLinha_(alvo), dados: { operacao: r.operacao } });
  }
  if (r.operacao === 'INCLUIR' || r.operacao === 'AJUSTAR') {
    var tipo = r.operacao === 'AJUSTAR' ? (r.tipo || alvo.tipo) : r.tipo;
    if (tipos.indexOf(tipo) < 0) throw erro_('Escolha o tipo da marcação.');
    var hora = tipo === 'INTERVALO_NAO_USUFRUIDO' ? (r.hora ? validaHora_(r.hora) : '00:00:00') : validaHora_(r.hora);
    novoEvento_(ctx, 'CORRECAO_ADMIN', { data: data, hora: hora, tipo: tipo, origem: 'CORRECAO_ADMIN', ref_id: alvo ? alvo.id : '',
      justificativa: just, alertas: ['Correção pelo administrador'], anterior: alvo ? semLinha_(alvo) : null });
  }
  if (['INCLUIR', 'ANULAR', 'AJUSTAR'].indexOf(r.operacao) < 0) throw erro_('Operação inválida.');
  CACHE_ = {};
  return { antes: antes, depois: resumoDia_(data) };
}

/* ---------------------------------------------------------------- folga compensatória (item 7.6) */

function folgasValidas_() {
  var evs = ler_('Eventos'), anul = {};
  evs.forEach(function (e) { if (e.tipo === 'ANULACAO') anul[e.ref_id] = e; });
  return evs.filter(function (e) { return e.tipo === 'FOLGA'; }).map(function (e) {
    var d = json_(e.dados, {});
    return { id: e.id, data: e.data, minutos: +d.minutos || 0, compensa_data: d.compensa_data || '', obs: e.justificativa, operador: e.operador,
      ts: e.ts_servidor, revertida: !!anul[e.id], reversao: anul[e.id] ? anul[e.id].justificativa : '' };
  });
}

function folgas_() { return { folgas: folgasValidas_() }; }

function folgaLancar_(r, ctx) {
  var data = dataValida_(r.data), obs = exigirJustificativa_(r.obs);
  exigirMesAberto_(data);
  var p = params_();
  var min = r.integral ? p.jornada_min : Math.round(+r.minutos);
  if (!(min > 0 && min <= p.jornada_min)) throw erro_('Informe as horas da folga (até a jornada diária).');
  if (r.compensa_data) {
    dataValida_(r.compensa_data);
    var dw = Calculo.diaSemana(r.compensa_data);
    if (dw !== 0 && !feriadoEm_(r.compensa_data)) throw erro_('A data compensada deve ser domingo ou feriado.');
  }
  var ev = novoEvento_(ctx, 'FOLGA_LANCADA', { data: data, hora: '', tipo: 'FOLGA', origem: 'ADMIN', justificativa: obs,
    dados: { minutos: min, integral: !!r.integral, compensa_data: r.compensa_data || '' } });
  return { folga: ev, folgas: folgasValidas_() };
}

function folgaReverter_(r, ctx) {
  var just = exigirJustificativa_(r.justificativa);
  var f = folgasValidas_().filter(function (x) { return x.id === r.id && !x.revertida; })[0];
  if (!f) throw erro_('Folga não encontrada ou já revertida.');
  exigirMesAberto_(f.data);
  novoEvento_(ctx, 'FOLGA_REVERTIDA', { data: f.data, hora: '', tipo: 'ANULACAO', origem: 'ADMIN', ref_id: f.id, justificativa: just, anterior: f });
  CACHE_ = {};
  return { folgas: folgasValidas_() };
}

/* ---------------------------------------------------------------- abonos (item 9) */

function abonosValidos_() {
  var rows = ler_('Abonos'), rev = {};
  rows.forEach(function (a) { if (a.tipo === 'REVERSAO') rev[a.ref_id] = a; });
  return rows.filter(function (a) { return a.tipo === 'ABONO'; }).map(function (a) {
    var o = semLinha_(a); o.minutos = +a.minutos; o.revertido = !!rev[a.id]; o.reversao = rev[a.id] ? rev[a.id].motivo : ''; return o;
  });
}

function abonosPorDia_() {
  var m = {};
  abonosValidos_().forEach(function (a) {
    if (a.revertido) return;
    var x = m[a.data] = m[a.data] || { minutos: 0, integral: false, itens: [] };
    x.minutos += a.minutos; if (a.integral === 'SIM') x.integral = true; x.itens.push(a);
  });
  return m;
}

function abonos_() { return { abonos: abonosValidos_() }; }

function abonoLancar_(r, ctx) {
  var data = dataValida_(r.data), motivo = exigirJustificativa_(r.motivo);
  exigirMesAberto_(data);
  var p = params_(), min;
  if (r.integral) min = p.jornada_min;
  else {
    var hi = Calculo.hm(validaHora_(r.hora_ini)), hf = Calculo.hm(validaHora_(r.hora_fim));
    if (hf <= hi) throw erro_('O fim deve ser depois do início.');
    min = hf - hi;
  }
  var anexo = null;
  if (r.anexo && r.anexo.base64) anexo = salvarArquivo_('Atestados', 'abono_' + data + '_' + (r.anexo.nome || 'anexo'), r.anexo.mime, r.anexo.base64);
  var row = { id: novoId_('A'), tipo: 'ABONO', data: data, integral: r.integral ? 'SIM' : 'NAO', hora_ini: r.integral ? '' : r.hora_ini,
    hora_fim: r.integral ? '' : r.hora_fim, minutos: min, motivo: motivo, anexo_url: anexo ? anexo.url : '', anexo_hash: anexo ? anexo.hash : '',
    registrado_em: agora_().iso, operador: ctx.operador };
  anexar_('Abonos', row);
  log_(ctx, 'ABONO_LANCADO', 'Abonos', row.id, null, row, motivo);
  return { abonos: abonosValidos_() };
}

function abonoReverter_(r, ctx) {
  var just = exigirJustificativa_(r.justificativa);
  var a = abonosValidos_().filter(function (x) { return x.id === r.id && !x.revertido; })[0];
  if (!a) throw erro_('Abono não encontrado ou já revertido.');
  exigirMesAberto_(a.data);
  var row = { id: novoId_('A'), tipo: 'REVERSAO', ref_id: a.id, data: a.data, minutos: a.minutos, motivo: just, registrado_em: agora_().iso, operador: ctx.operador };
  anexar_('Abonos', row);
  log_(ctx, 'ABONO_REVERTIDO', 'Abonos', a.id, a, row, just);
  CACHE_ = {};
  return { abonos: abonosValidos_() };
}

/* ---------------------------------------------------------------- férias (item 8) */

function partesFerias_() {
  var rows = ler_('Ferias'), canc = {};
  rows.forEach(function (f) { if (f.tipo === 'CANCELAMENTO') canc[f.ref_id] = f; });
  return rows.filter(function (f) { return f.tipo === 'GOZO'; }).map(function (f) {
    var o = semLinha_(f); o.dias = +f.dias; o.fim = Calculo.addDias(f.inicio, +f.dias - 1);
    o.cancelada = !!canc[f.id]; o.cancelamento = canc[f.id] ? canc[f.id].obs : ''; return o;
  });
}

function diasDeFerias_() {
  var m = {};
  partesFerias_().forEach(function (f) {
    if (f.cancelada) return;
    for (var i = 0; i < f.dias; i++) m[Calculo.addDias(f.inicio, i)] = f.id;
  });
  return m;
}

function mapaFeriados_() {
  var m = {};
  ler_('Feriados').forEach(function (f) { if (f.ativo === 'SIM') m[f.data] = f; });
  return m;
}

function ferias_() {
  var c = cfg_(), hoje = agora_().data, partes = partesFerias_(), fer = mapaFeriados_();
  var periodos = Calculo.periodosAquisitivos(c.admissao, hoje).map(function (p) {
    var ps = partes.filter(function (f) { return f.aquisitivo_inicio === p.inicio && !f.cancelada; });
    var usados = ps.reduce(function (s, f) { return s + f.dias; }, 0);
    var gozados = ps.filter(function (f) { return f.fim < hoje; }).reduce(function (s, f) { return s + f.dias; }, 0);
    var alertas = [];
    var faltam = Calculo.difDias(hoje, p.concessivoFim);
    if (usados < 30 && p.fim < hoje) {
      if (faltam < 0) alertas.push('Período concessivo vencido sem férias integralmente marcadas (art. 137 da CLT: pagamento em dobro).');
      else if (faltam <= 90) alertas.push('Faltam ' + faltam + ' dias para o fim do período concessivo e há ' + (30 - usados) + ' dias de férias sem marcar.');
    }
    return { n: p.n, inicio: p.inicio, fim: p.fim, concessivoFim: p.concessivoFim, completo: p.fim < hoje, diasMarcados: usados,
      diasGozados: gozados, saldo: 30 - usados, alertas: alertas,
      partes: ps.map(function (f) { f.alertas = Calculo.alertasFerias(f, p, fer); f.situacao = f.fim < hoje ? 'GOZADA' : (f.inicio <= hoje ? 'EM GOZO' : 'PROGRAMADA'); return f; }) };
  });
  return { periodos: periodos, canceladas: partes.filter(function (f) { return f.cancelada; }) };
}

function feriasLancar_(r, ctx) {
  var c = cfg_(), inicio = dataValida_(r.inicio), dias = Math.round(+r.dias);
  var periodos = Calculo.periodosAquisitivos(c.admissao, Calculo.addDias(agora_().data, 400));
  var per = periodos.filter(function (p) { return p.inicio === r.aquisitivo_inicio; })[0];
  if (!per) throw erro_('Escolha o período aquisitivo.');
  var partes = partesFerias_().filter(function (f) { return !f.cancelada; });
  var doPeriodo = partes.filter(function (f) { return f.aquisitivo_inicio === per.inicio; });
  var v = Calculo.validarFerias(doPeriodo.concat([{ dias: dias }]), { fracaoMinima: +c.ferias_fracao_minima });
  if (!v.ok) throw erro_(v.erro, 'FERIAS_INVALIDAS');
  var fim = Calculo.addDias(inicio, dias - 1);
  partes.forEach(function (f) { if (!(fim < f.inicio || inicio > f.fim)) throw erro_('Coincide com outras férias já marcadas (' + Calculo.fmtData(f.inicio) + ').'); });
  for (var d = inicio; d <= fim; d = Calculo.addDias(d, 31)) exigirMesAberto_(d);
  exigirMesAberto_(fim);
  var row = { id: novoId_('V'), tipo: 'GOZO', aquisitivo_inicio: per.inicio, inicio: inicio, dias: dias, comunicado_em: r.comunicado_em || '',
    registrado_em: agora_().iso, operador: ctx.operador, obs: r.obs || '' };
  anexar_('Ferias', row);
  var alertas = Calculo.alertasFerias(row, per, mapaFeriados_());
  log_(ctx, 'FERIAS_MARCADAS', 'Ferias', row.id, null, { registro: row, avisos: alertas }, r.obs || '');
  return { alertas: alertas, ferias: ferias_() };
}

function feriasCancelar_(r, ctx) {
  var just = exigirJustificativa_(r.justificativa);
  var f = partesFerias_().filter(function (x) { return x.id === r.id && !x.cancelada; })[0];
  if (!f) throw erro_('Período não encontrado ou já cancelado.');
  exigirMesAberto_(f.inicio); exigirMesAberto_(f.fim);
  var row = { id: novoId_('V'), tipo: 'CANCELAMENTO', ref_id: f.id, aquisitivo_inicio: f.aquisitivo_inicio, inicio: f.inicio, dias: f.dias,
    registrado_em: agora_().iso, operador: ctx.operador, obs: just };
  anexar_('Ferias', row);
  log_(ctx, 'FERIAS_CANCELADAS', 'Ferias', f.id, f, row, just);
  CACHE_ = {};
  return { ferias: ferias_() };
}
