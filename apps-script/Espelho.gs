/**
 * Apuração (estado calculado a partir dos eventos), telas do painel e relatórios.
 */

function apurar_(de, ate, p) {
  p = p || params_();
  var evs = ler_('Eventos'), porDia = {}, folgas = {}, comp = {};
  evs.forEach(function (e) { if (e.data >= de && e.data <= ate && e.tipo !== 'FOLGA') (porDia[e.data] = porDia[e.data] || []).push(e); });
  folgasValidas_().forEach(function (f) {
    if (f.revertida) return;
    (folgas[f.data] = folgas[f.data] || []).push(f);
    if (f.compensa_data) comp[f.compensa_data] = f;
  });
  var feriados = mapaFeriados_(), ferias = diasDeFerias_(), abonos = abonosPorDia_(), hoje = agora_().data, out = [];
  for (var d = de; d <= ate; d = Calculo.addDias(d, 1)) {
    var lista = porDia[d] || [], cons = Calculo.consolidarDia(lista), fl = folgas[d] || [];
    var folgaMin = 0, semDeb = 0;
    fl.forEach(function (f) { folgaMin += f.minutos; if (f.compensa_data) semDeb += f.minutos; });
    var ab = abonos[d];
    var ap = Calculo.apurarDia(p, { data: d, cons: cons, feriado: feriados[d] || null, ferias: !!ferias[d], folgaMin: folgaMin,
      folgaSemDebitoMin: semDeb, abonoMin: ab ? ab.minutos : 0, abonoIntegral: ab ? ab.integral : false, dsrCompensado: !!comp[d],
      encerrado: d < hoje, futuro: d > hoje });
    out.push({ data: d, ap: ap, cons: cons, eventos: lista, folgas: fl, abono: ab || null, feriado: feriados[d] || null, ferias: !!ferias[d] });
  }
  return out;
}

function diaParaCliente_(x) {
  var marcas = {};
  x.cons.validos.forEach(function (e) {
    if (marcas[e.tipo]) return;
    marcas[e.tipo] = { id: e.id, hora: String(e.hora).slice(0, 5), origem: e.origem, operador: e.operador, offline: e.origem === 'OFFLINE',
      correcao: /^CORRECAO/.test(e.origem), justificativa: e.justificativa };
  });
  var a = x.ap;
  return { data: x.data, dow: Calculo.DIAS_SEMANA[Calculo.diaSemana(x.data)], marcas: marcas, naoUsufruido: x.cons.naoUsufruido,
    status: a.status, tipoDia: a.tipoDia, escala: a.escalaExtraordinaria, esperado: a.esperado, trabalhado: a.trabalhado, intervalo: a.intervalo,
    saldo: a.saldo, extra: a.extra, debito: a.debito, dsrFeriado: a.dsrFeriado, dsrCompensado: a.dsrCompensado, suprimido: a.suprimido,
    folga: a.folga, abonado: a.abonado, tolerancia: a.tolerancia, alertas: a.alertas, inconsistencias: a.inconsistencias,
    feriado: x.feriado ? x.feriado.descricao : '', ferias: x.ferias, abono: x.abono ? x.abono.itens.map(function (i) { return i.motivo; }).join('; ') : '',
    folgaObs: x.folgas.map(function (f) { return f.obs; }).join('; '),
    correcoes: x.cons.corrigidas, offline: x.cons.offline };
}

/* ---------------------------------------------------------------- telas */

function adminHoje_() {
  var hoje = agora_().data, x = apurar_(hoje, hoje)[0];
  var recusas = ler_('Log').filter(function (l) { return l.acao === 'MARCACAO_RECUSADA_REDE' && l.timestamp_servidor.slice(0, 10) === hoje; });
  return { dia: diaParaCliente_(x), proxima: Calculo.proximaMarcacao(x.cons), eventos: x.eventos.map(semLinha_),
    recusasRede: recusas.map(semLinha_), ips: listaIps_() };
}

function inicioApuracao_() {
  var c = cfg_(), prim = c.primeiro_mes_sistema || c.admissao.slice(0, 7);
  return prim + '-01' > c.admissao ? prim + '-01' : c.admissao;
}

function pendencias_() {
  var hoje = agora_().data, ontem = Calculo.addDias(hoje, -1);
  var de = inicioApuracao_(), limite30 = Calculo.addDias(hoje, -30);
  if (Calculo.difDias(de, hoje) > 400) de = Calculo.addDias(hoje, -400);
  var dias = de <= ontem ? apurar_(de, ontem) : [];
  var fech = estadoFechamentos_();
  var abertos = function (d) { var f = fech[d.slice(0, 7)]; return !(f && f.status === 'FECHADO'); };
  var p = {
    inconsistentes: [], offline: [], correcoes: [], intervalos: [], recusasRede: [], banco: [], ferias: [], comprovantes: [], mesesAFechar: []
  };
  dias.forEach(function (x) {
    var c = diaParaCliente_(x);
    if (x.ap.status === 'INCONSISTENTE' && abertos(x.data)) p.inconsistentes.push({ data: x.data, motivos: x.ap.inconsistencias });
    if (x.data >= limite30) {
      x.eventos.forEach(function (e) {
        if (e.origem === 'OFFLINE') p.offline.push({ data: e.data, tipo: e.tipo, hora: e.hora, alertas: e.alertas, recebido: e.hora_recebimento });
        if (e.origem === 'CORRECAO_EMPREGADA') p.correcoes.push({ data: e.data, tipo: e.tipo, hora: e.hora, justificativa: e.justificativa, ref_id: e.ref_id });
      });
      var al = c.alertas.filter(function (a) { return /Intervalo/.test(a); });
      if (al.length || c.suprimido) p.intervalos.push({ data: x.data, alertas: al, suprimido: c.suprimido, intervalo: c.intervalo });
    }
  });
  ler_('Log').forEach(function (l) {
    if (l.timestamp_servidor.slice(0, 10) < limite30) return;
    if (l.acao === 'MARCACAO_RECUSADA_REDE') p.recusasRede.push({ quando: l.timestamp_servidor, dispositivo: l.dispositivo, ip: json_(l.valor_novo, {}).ip });
    if (l.acao === 'COMPROVANTE_FALHA') p.comprovantes.push({ quando: l.timestamp_servidor, detalhe: l.justificativa });
  });
  p.banco = Calculo.alertasBanco(Calculo.estadoBanco(bancoValidos_()), hoje);
  ferias_().periodos.forEach(function (per) { per.alertas.forEach(function (a) { p.ferias.push({ periodo: per.n, texto: a }); }); });
  for (var m = de.slice(0, 7); m < hoje.slice(0, 7); m = Calculo.mesSeguinte(m)) {
    var f = fech[m]; if (!(f && f.status === 'FECHADO')) p.mesesAFechar.push(m);
  }
  return { pendencias: p };
}

function espelho_(r) {
  var mes = String(r.mes || agora_().data.slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(mes)) throw erro_('Mês inválido.');
  var dias = apurar_(mes + '-01', Calculo.fimDoMes(mes));
  var tot = Calculo.totalizar(dias.map(function (x) { return x.ap; }));
  var f = estadoFechamentos_()[mes];
  var banco = f && f.status === 'FECHADO' && f.atual && f.atual.resumo ? json_(f.atual.resumo, null) : projecaoBanco_(mes, tot);
  return { mes: mes, dias: dias.map(diaParaCliente_), totais: tot, fechamento: resumoFechamento_(f), banco: banco };
}

function projecaoBanco_(mes, tot) {
  var p = params_();
  var res = Calculo.fecharBanco(Calculo.estadoBanco(bancoValidos_()), tot.saldoLiquido, mes, { limite: p.limite_pagar_mes_min, validadeMeses: p.banco_validade_meses });
  return { projecao: true, a_pagar_mes: res.aPagarMes, a_pagar_vencidos: res.aPagarVencidos, a_pagar_total: res.aPagarTotal,
    saldo_banco_final: res.saldoFinal, lancamentos: res.lancamentos, saldo_liquido: tot.saldoLiquido, dsr_feriado: tot.dsrFeriado, suprimido: tot.suprimido };
}

function diaDetalhe_(r) {
  var data = dataValida_(r.data), x = apurar_(data, data)[0];
  var todos = ler_('Eventos').filter(function (e) { return e.data === data; });
  var anul = {};
  todos.forEach(function (e) { if (e.tipo === 'ANULACAO') anul[e.ref_id] = e; });
  var eventos = todos.map(function (e) {
    var o = semLinha_(e);
    if (anul[e.id]) o.anulado_por = (anul[e.id].origem === 'CORRECAO_EMPREGADA' ? 'empregada' : anul[e.id].operador) + ' — ' + anul[e.id].justificativa;
    return o;
  });
  var ids = {}; todos.forEach(function (e) { ids[e.id] = true; });
  var logs = ler_('Log').filter(function (l) { return ids[l.id_entidade]; }).map(function (l) { var o = semLinha_(l); return o; });
  return { dia: diaParaCliente_(x), eventos: eventos, log: logs, abonos: x.abono ? x.abono.itens : [], folgas: x.folgas };
}

/* ---------------------------------------------------------------- banco de horas (tela 5) */

function bancoValidos_() {
  var rows = ler_('BancoHoras'), est = {};
  rows.forEach(function (b) { if (b.tipo === 'ESTORNO_MES') est[b.mes_ref + '#' + b.versao] = true; });
  return rows.filter(function (b) { return b.tipo !== 'ESTORNO_MES' && !(b.mes_ref && est[b.mes_ref + '#' + b.versao]); })
    .map(function (b) { var o = semLinha_(b); o.minutos = +b.minutos; return o; });
}

function banco_() {
  var hoje = agora_().data, validos = bancoValidos_(), estado = Calculo.estadoBanco(validos);
  var est = {};
  ler_('BancoHoras').forEach(function (b) { if (b.tipo === 'ESTORNO_MES') est[b.mes_ref + '#' + b.versao] = true; });
  var extrato = ler_('BancoHoras').map(function (b) { var o = semLinha_(b); o.estornado = !!(b.mes_ref && est[b.mes_ref + '#' + b.versao]) && b.tipo !== 'ESTORNO_MES'; return o; });
  var mes = hoje.slice(0, 7);
  var tot = Calculo.totalizar(apurar_(mes + '-01', hoje).map(function (x) { return x.ap; }));
  return { estado: estado, extrato: extrato, alertas: Calculo.alertasBanco(estado, hoje), mesAtual: { mes: mes, saldoLiquidoAteHoje: tot.saldoLiquido, totais: tot } };
}

/* ---------------------------------------------------------------- valores estimados (tela 9, item 7.8) */

function valores_(r) {
  var mes = String(r.mes || agora_().data.slice(0, 7));
  var fim = Calculo.fimDoMes(mes), c = cfg_(fim);
  var f = estadoFechamentos_()[mes];
  var dias = apurar_(mes + '-01', fim), tot = Calculo.totalizar(dias.map(function (x) { return x.ap; }));
  var b = f && f.status === 'FECHADO' && f.atual && f.atual.resumo ? json_(f.atual.resumo, null) : projecaoBanco_(mes, tot);
  var sh = +c.salario_base / +c.divisor;
  var horas = function (min) { return (+min || 0) / 60; };
  var he = horas(b.a_pagar_total) * sh * 1.5;
  var dsr = horas(b.dsr_feriado !== undefined ? b.dsr_feriado : tot.dsrFeriado) * sh * 2;
  var sup = horas(b.suprimido !== undefined ? b.suprimido : tot.suprimido) * sh * 1.5;
  var reflexo = null;
  if (sim_(c.reflexo_dsr)) {
    var fer = mapaFeriados_(), uteis = 0, descansos = 0;
    Calculo.diasDoMes(mes).forEach(function (d) { if (Calculo.diaSemana(d) === 0 || fer[d]) descansos++; else uteis++; });
    reflexo = uteis ? he / uteis * descansos : 0;
  }
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  return {
    mes: mes, projecao: !!b.projecao, aviso: 'Valores estimados. O cálculo oficial é do contador.',
    salarioBase: +c.salario_base, valeAlimentacao: +c.vale_alimentacao, divisor: +c.divisor, salarioHora: r2(sh),
    minutos: { aPagar: b.a_pagar_total, aPagarMes: b.a_pagar_mes, aPagarVencidos: b.a_pagar_vencidos, dsrFeriado: b.dsr_feriado !== undefined ? b.dsr_feriado : tot.dsrFeriado, suprimido: b.suprimido !== undefined ? b.suprimido : tot.suprimido },
    valores: { horasExtras: r2(he), dsrFeriado: r2(dsr), intervaloSuprimido: r2(sup), reflexoDsr: reflexo === null ? null : r2(reflexo) },
    custoEstimado: r2(+c.salario_base + +c.vale_alimentacao + he + dsr + sup + (reflexo || 0)),
    nota: 'Intervalo suprimido (art. 71, § 4º, CLT) exibido separado das horas extras: conferir com a contabilidade. O vale-alimentação não entra na base das horas extras.'
  };
}

/* ---------------------------------------------------------------- relatórios (tela 11, item 13) */

function relatorio_(r) {
  var tipo = r.tipo, hoje = agora_().data;
  var de = r.de || inicioApuracao_(), ate = r.ate || hoje;
  dataValida_(de); dataValida_(ate);
  var h = Calculo.fmtDur, fd = Calculo.fmtData;
  var cols, linhas = [], titulo;
  if (tipo === 'espelho') {
    titulo = 'Espelho de ponto';
    cols = ['Data', 'Dia', 'Entrada', 'Início int.', 'Fim int.', 'Saída', 'Intervalo', 'Trabalhado', 'Saldo', 'Extra', 'Débito', 'DSR/feriado', 'Int. suprimido', 'Situação', 'Observações'];
    apurar_(de, ate).forEach(function (x) {
      var c = diaParaCliente_(x), m = c.marcas, hm = function (t) { return m[t] ? m[t].hora + (m[t].correcao ? '*' : '') + (m[t].offline ? '°' : '') : ''; };
      linhas.push([fd(c.data), c.dow, hm('ENTRADA'), hm('INICIO_INTERVALO'), hm('FIM_INTERVALO'), hm('SAIDA'), c.intervalo === null ? '' : h(c.intervalo),
        h(c.trabalhado), h(c.saldo, true), h(c.extra), h(c.debito), h(c.dsrFeriado), h(c.suprimido), c.status,
        [c.feriado, c.ferias ? 'Férias' : '', c.abono ? 'Abono: ' + c.abono : '', c.folga ? 'Folga ' + h(c.folga) : ''].concat(c.alertas, c.inconsistencias).filter(String).join('; ')]);
    });
  } else if (tipo === 'banco') {
    titulo = 'Extrato do banco de horas';
    cols = ['Data', 'Tipo', 'Horas', 'Lote', 'Vencimento', 'Mês de referência', 'Versão', 'Observação', 'Estornado'];
    banco_().extrato.filter(function (b) { return b.data >= de && b.data <= ate; }).forEach(function (b) {
      linhas.push([fd(b.data), b.tipo, h(+b.minutos), b.lote_id, fd(b.vencimento), b.mes_ref, b.versao, b.obs, b.estornado ? 'sim' : '']);
    });
  } else if (tipo === 'extras' || tipo === 'contador') {
    titulo = tipo === 'extras' ? 'Horas extras e trabalho em DSR/feriado por mês' : 'Resumo para o contador';
    cols = tipo === 'extras' ? ['Mês', 'Situação', 'HE a pagar no mês', 'Créditos vencidos a pagar', 'Total HE 50%', 'DSR/feriado (dobro)', 'Saldo do banco']
      : ['Mês', 'Situação', 'Horas extras a pagar (50%)', 'Horas em domingo/feriado (dobro)', 'Intervalo suprimido (art. 71, § 4º)', 'Faltas não abonadas (dias)', 'Faltas não abonadas (horas)', 'Férias gozadas (dias)'];
    var fech = estadoFechamentos_();
    for (var m = de.slice(0, 7); m <= ate.slice(0, 7); m = Calculo.mesSeguinte(m)) {
      var f = fech[m], res = null, situ = 'aberto (projeção)';
      var dias = apurar_(m + '-01', Calculo.fimDoMes(m)), tot = Calculo.totalizar(dias.map(function (x) { return x.ap; }));
      if (f && f.status === 'FECHADO' && f.atual && f.atual.resumo) { res = json_(f.atual.resumo, null); situ = 'fechado v' + f.versao; }
      else if (f && f.externo) situ = 'fechado fora do sistema';
      if (!res) res = projecaoBanco_(m, tot);
      if (tipo === 'extras') linhas.push([m, situ, h(res.a_pagar_mes), h(res.a_pagar_vencidos), h(res.a_pagar_total), h(res.dsr_feriado), h(res.saldo_banco_final, true)]);
      else linhas.push([m, situ, h(res.a_pagar_total), h(res.dsr_feriado), h(res.suprimido), res.faltas !== undefined ? res.faltas : tot.faltas,
        h(res.horas_falta !== undefined ? res.horas_falta : tot.horasFalta), res.ferias_dias !== undefined ? res.ferias_dias : tot.diasFerias]);
    }
    if (r.comValores && tipo === 'extras') {
      cols.push('Estimativa HE (R$)', 'Estimativa DSR/feriado (R$)');
      linhas.forEach(function (l) { var v = valores_({ mes: l[0] }); l.push(v.valores.horasExtras.toFixed(2), v.valores.dsrFeriado.toFixed(2)); });
    }
  } else if (tipo === 'ausencias') {
    titulo = 'Ausências: faltas, abonos, folgas e férias';
    cols = ['Data', 'Tipo', 'Horas', 'Motivo / observação'];
    apurar_(de, ate).forEach(function (x) {
      var a = x.ap;
      if (a.status === 'FALTA') linhas.push([fd(x.data), 'Falta não abonada', h(a.debito), '']);
      if (x.abono) x.abono.itens.forEach(function (i) { linhas.push([fd(x.data), 'Abono', h(i.minutos), i.motivo + (i.anexo_url ? ' (anexo)' : '')]); });
      x.folgas.forEach(function (f) { linhas.push([fd(x.data), 'Folga compensatória', h(f.minutos), f.obs]); });
      if (x.ferias) linhas.push([fd(x.data), 'Férias', '', '']);
    });
  } else if (tipo === 'correcoes') {
    titulo = 'Correções da empregada e do administrador';
    cols = ['Data do ponto', 'Registrado em', 'Quem', 'Operação', 'Marcação', 'Horário', 'Justificativa'];
    ler_('Eventos').filter(function (e) { return e.data >= de && e.data <= ate && (/^CORRECAO/.test(e.origem) || (e.tipo === 'ANULACAO' && e.origem !== 'ADMIN')); })
      .forEach(function (e) {
        linhas.push([fd(e.data), e.ts_servidor.replace('T', ' '), e.origem === 'CORRECAO_EMPREGADA' ? 'Empregada (' + e.dispositivo + ')' : 'Admin: ' + e.operador,
          e.tipo === 'ANULACAO' ? 'Anulação' : 'Inclusão', e.tipo === 'ANULACAO' ? 'ref. ' + e.ref_id : Calculo.NOMES[e.tipo] || e.tipo, String(e.hora).slice(0, 5), e.justificativa]);
      });
  } else if (tipo === 'offline') {
    titulo = 'Marcações offline e recusadas por rede';
    cols = ['Quando', 'Situação', 'Marcação', 'Dispositivo', 'Detalhe'];
    ler_('Eventos').filter(function (e) { return e.origem === 'OFFLINE' && e.data >= de && e.data <= ate; }).forEach(function (e) {
      linhas.push([fd(e.data) + ' ' + String(e.hora).slice(0, 5), 'Offline', Calculo.NOMES[e.tipo] || e.tipo, e.dispositivo, 'Recebida ' + e.hora_recebimento.replace('T', ' ') + '; ' + e.alertas]);
    });
    ler_('Log').filter(function (l) { return l.acao === 'MARCACAO_RECUSADA_REDE' && l.timestamp_servidor.slice(0, 10) >= de && l.timestamp_servidor.slice(0, 10) <= ate; }).forEach(function (l) {
      var v = json_(l.valor_novo, {});
      linhas.push([l.timestamp_servidor.replace('T', ' '), 'Recusada (rede)', Calculo.NOMES[v.tipo] || v.tipo || '', l.dispositivo, 'IP ' + v.ip]);
    });
  } else if (tipo === 'ferias') {
    titulo = 'Situação de férias';
    cols = ['Período aquisitivo', 'Concessivo até', 'Dias marcados', 'Dias gozados', 'Saldo', 'Períodos de gozo', 'Avisos'];
    ferias_().periodos.forEach(function (p) {
      linhas.push([fd(p.inicio) + ' a ' + fd(p.fim), fd(p.concessivoFim), p.diasMarcados, p.diasGozados, p.saldo,
        p.partes.map(function (f) { return fd(f.inicio) + ' (' + f.dias + ' dias, ' + f.situacao.toLowerCase() + ')'; }).join('; '), p.alertas.join(' ')]);
    });
  } else throw erro_('Relatório desconhecido.');
  return { titulo: titulo, periodo: { de: de, ate: ate }, colunas: cols, linhas: linhas,
    legenda: tipo === 'espelho' ? '* correção; ° marcação offline (horário do aparelho)' : '' };
}
