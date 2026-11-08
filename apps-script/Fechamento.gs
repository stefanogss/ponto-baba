/**
 * Fechamento mensal (item 11): apuração do banco, PDF do espelho com hash, ciência, reabertura com nova versão.
 */

function estadoFechamentos_() {
  var m = {};
  ler_('Fechamentos').forEach(function (r) {
    var x = m[r.mes] = m[r.mes] || { mes: r.mes, versao: 0, status: 'ABERTO', ciencias: {}, assinaturas: [], versoes: [], externo: false, atual: null };
    if (r.tipo === 'FECHAMENTO') { x.versao = +r.versao; x.status = 'FECHADO'; x.atual = r; x.versoes.push(r); }
    else if (r.tipo === 'FECHAMENTO_EXTERNO') { x.status = 'FECHADO'; x.externo = true; x.atual = r; }
    else if (r.tipo === 'REABERTURA') { x.status = 'REABERTO'; x.reaberturas = (x.reaberturas || []).concat([r]); }
    else if (r.tipo === 'CIENCIA') x.ciencias[r.versao] = r;
    else if (r.tipo === 'ASSINATURA') x.assinaturas.push(r);
  });
  return m;
}

function exigirMesAberto_(data) {
  var f = estadoFechamentos_()[String(data).slice(0, 7)];
  if (f && f.status === 'FECHADO') throw erro_('O mês ' + String(data).slice(0, 7) + ' está fechado. Reabra o mês (com justificativa) para alterar.', 'MES_FECHADO');
}

function resumoFechamento_(f) {
  if (!f) return { status: 'ABERTO' };
  return { mes: f.mes, status: f.status, versao: f.versao, externo: f.externo,
    pdf: f.atual && f.atual.arquivo_url ? f.atual.arquivo_url : '', hash: f.atual ? f.atual.hash_pdf : '',
    fechadoEm: f.atual ? f.atual.data : '', fechadoPor: f.atual ? f.atual.operador : '',
    ciencia: f.ciencias[f.versao] ? { em: f.ciencias[f.versao].data, dispositivo: f.ciencias[f.versao].dispositivo } : null,
    versoes: f.versoes.map(function (v) { return { versao: v.versao, data: v.data, pdf: v.arquivo_url, hash: v.hash_pdf, ciencia: f.ciencias[v.versao] ? f.ciencias[v.versao].data : '' }; }),
    assinaturas: f.assinaturas.map(function (a) { return { versao: a.versao, data: a.data, url: a.arquivo_url, hash: a.hash_pdf }; }),
    reaberturas: (f.reaberturas || []).map(function (a) { return { data: a.data, operador: a.operador, justificativa: a.justificativa }; }) };
}

function fechamentos_() {
  var est = estadoFechamentos_(), hoje = agora_().data, out = [];
  for (var m = inicioApuracao_().slice(0, 7); m <= hoje.slice(0, 7); m = Calculo.mesSeguinte(m)) {
    var r = resumoFechamento_(est[m]); r.mes = m; r.podeFechar = hoje >= Calculo.mesSeguinte(m) + '-01'; out.push(r);
  }
  Object.keys(est).forEach(function (m) { if (!out.some(function (o) { return o.mes === m; })) { var r = resumoFechamento_(est[m]); r.mes = m; out.unshift(r); } });
  return { meses: out.reverse() };
}

function fechar_(r, ctx) {
  var mes = String(r.mes || ''), agora = agora_();
  if (!/^\d{4}-\d{2}$/.test(mes)) throw erro_('Mês inválido.');
  if (agora.data < Calculo.mesSeguinte(mes) + '-01') throw erro_('O fechamento só pode ser feito a partir do 1º dia do mês seguinte.');
  var est = estadoFechamentos_();
  if (est[mes] && est[mes].status === 'FECHADO') throw erro_('Este mês já está fechado.');
  var prim = inicioApuracao_().slice(0, 7);
  if (mes < prim) throw erro_('Mês anterior ao início do sistema. Use a carga inicial.');
  var ant = Calculo.mesAnterior(mes);
  if (ant >= prim && !(est[ant] && est[ant].status === 'FECHADO')) throw erro_('Feche antes o mês ' + ant + '.');

  var fim = Calculo.fimDoMes(mes), c = cfg_(fim), p = params_(c);
  var dias = apurar_(mes + '-01', fim, p);
  var inc = dias.filter(function (x) { return x.ap.status === 'INCONSISTENTE'; });
  if (inc.length) throw erro_('Há dias inconsistentes a resolver: ' + inc.map(function (x) { return Calculo.fmtData(x.data); }).join(', '), 'INCONSISTENTE', inc.map(function (x) { return x.data; }));
  var tot = Calculo.totalizar(dias.map(function (x) { return x.ap; }));
  var versao = ((est[mes] && est[mes].versao) || 0) + 1;
  var banco = Calculo.estadoBanco(bancoValidos_());
  var res = Calculo.fecharBanco(banco, tot.saldoLiquido, mes, { limite: p.limite_pagar_mes_min, validadeMeses: p.banco_validade_meses,
    loteId: 'L' + mes.replace('-', '') + 'V' + versao });

  res.lancamentos.forEach(function (l) {
    var row = { id: l.id || novoId_('B'), data: fim, tipo: l.tipo, minutos: l.minutos, lote_id: l.lote_id || '', vencimento: l.vencimento || '',
      mes_ref: mes, versao: versao, obs: l.obs || '', registrado_em: agora.iso, operador: ctx.operador };
    anexar_('BancoHoras', row);
    log_(ctx, l.tipo === 'VENCIMENTO' ? 'BANCO_CREDITO_VENCIDO' : 'BANCO_LANCAMENTO', 'BancoHoras', row.id, null, row, 'Fechamento ' + mes + ' v' + versao);
  });

  var resumo = { mes: mes, versao: versao, dias_trabalhados: tot.diasTrabalhados, extra: tot.extra, debito: tot.debito, folgas: tot.folgaBanco,
    saldo_liquido: tot.saldoLiquido, a_pagar_mes: res.aPagarMes, a_pagar_vencidos: res.aPagarVencidos, a_pagar_total: res.aPagarTotal,
    dsr_feriado: tot.dsrFeriado, dsr_compensado: tot.dsrCompensado, suprimido: tot.suprimido, faltas: tot.faltas, horas_falta: tot.horasFalta,
    ferias_dias: tot.diasFerias, abonado: tot.abonado, saldo_banco_anterior: banco.saldo, saldo_banco_final: res.saldoFinal, lancamentos: res.lancamentos };

  var html = htmlEspelho_(mes, versao, dias, resumo, c, ctx);
  var blob = Utilities.newBlob(html, 'text/html', 'espelho.html').getAs('application/pdf').setName('Espelho_' + mes + '_v' + versao + '.pdf');
  var arq = salvarBlob_('Fechamentos', blob);
  var row = { id: novoId_('F'), mes: mes, versao: versao, tipo: 'FECHAMENTO', data: agora.iso, arquivo_id: arq.id, arquivo_url: arq.url, hash_pdf: arq.hash,
    dispositivo: ctx.dispositivo, operador: ctx.operador, justificativa: r.justificativa || '', resumo: JSON.stringify(resumo) };
  anexar_('Fechamentos', row);
  log_(ctx, 'FECHAMENTO', 'Fechamentos', row.id, null, { mes: mes, versao: versao, hash_pdf: arq.hash, arquivo: arq.url, resumo: resumo }, r.justificativa || '');
  log_(ctx, 'PDF_GERADO', 'Fechamentos', row.id, null, { arquivo: arq.url, hash_pdf: arq.hash }, '');

  var envio = enviarEmailFechamento_(mes, versao, blob, arq.hash, resumo, c);
  return { fechamento: resumoFechamento_(estadoFechamentos_()[mes]), resumo: resumo, envio: envio };
}

function reabrir_(r, ctx) {
  var just = exigirJustificativa_(r.justificativa), mes = String(r.mes || '');
  var est = estadoFechamentos_(), f = est[mes];
  if (!f || f.status !== 'FECHADO') throw erro_('Este mês não está fechado.');
  if (f.externo) throw erro_('Mês fechado fora do sistema não pode ser reaberto aqui.');
  var posterior = Object.keys(est).filter(function (m) { return m > mes && est[m].status === 'FECHADO' && !est[m].externo; });
  if (posterior.length) throw erro_('Reabra antes os meses posteriores: ' + posterior.sort().reverse().join(', '));
  var agora = agora_();
  anexar_('Fechamentos', { id: novoId_('F'), mes: mes, versao: f.versao, tipo: 'REABERTURA', data: agora.iso, dispositivo: ctx.dispositivo, operador: ctx.operador, justificativa: just });
  var est2 = { id: novoId_('B'), data: Calculo.fimDoMes(mes), tipo: 'ESTORNO_MES', minutos: 0, mes_ref: mes, versao: f.versao,
    obs: 'Reabertura: lançamentos da versão ' + f.versao + ' deixam de valer', registrado_em: agora.iso, operador: ctx.operador };
  anexar_('BancoHoras', est2);
  log_(ctx, 'REABERTURA', 'Fechamentos', mes, { status: 'FECHADO', versao: f.versao }, { status: 'REABERTO' }, just);
  return { fechamento: resumoFechamento_(estadoFechamentos_()[mes]) };
}

function anexarAssinatura_(r, ctx) {
  var f = estadoFechamentos_()[r.mes];
  if (!f || f.status !== 'FECHADO' || f.externo) throw erro_('Mês não fechado pelo sistema.');
  if (!r.arquivo || !r.arquivo.base64) throw erro_('Escolha o arquivo digitalizado.');
  var arq = salvarArquivo_('Assinaturas', 'Assinado_' + r.mes + '_v' + f.versao + '_' + (r.arquivo.nome || 'digitalizacao'), r.arquivo.mime, r.arquivo.base64);
  var row = { id: novoId_('F'), mes: r.mes, versao: f.versao, tipo: 'ASSINATURA', data: agora_().iso, arquivo_id: arq.id, arquivo_url: arq.url, hash_pdf: arq.hash,
    dispositivo: ctx.dispositivo, operador: ctx.operador, justificativa: r.obs || 'Folha assinada em papel' };
  anexar_('Fechamentos', row);
  log_(ctx, 'ASSINATURA_ANEXADA', 'Fechamentos', row.id, null, row, row.justificativa);
  return { fechamento: resumoFechamento_(estadoFechamentos_()[r.mes]) };
}

/* ---------------------------------------------------------------- ciência da empregada */

function cienciaPendente_() {
  var est = estadoFechamentos_(), meses = Object.keys(est).sort().reverse();
  for (var i = 0; i < meses.length; i++) {
    var f = est[meses[i]];
    if (f.status === 'FECHADO' && !f.externo) {
      if (f.ciencias[f.versao]) return null;
      return { mes: f.mes, versao: f.versao, hash_pdf: f.atual.hash_pdf, resumo: json_(f.atual.resumo, {}) };
    }
  }
  return null;
}

function resumoMesEmpregada_(r) {
  dispositivo_(r.token);
  var p = cienciaPendente_();
  if (!p) return { resumo: null };
  var s = p.resumo;
  return { resumo: { mes: p.mes, versao: p.versao, dias_trabalhados: s.dias_trabalhados, horas_extras: s.a_pagar_total,
    dsr_feriado: s.dsr_feriado, saldo_banco: s.saldo_banco_final, faltas: s.faltas } };
}

function registrarCiencia_(r) {
  var d = dispositivo_(r.token), ctx = ctxEmpregada_(d, r.ip), p = cienciaPendente_();
  if (!p || p.mes !== r.mes || +p.versao !== +r.versao) throw erro_('Não há resumo pendente de ciência.', 'SEM_PENDENCIA');
  var row = { id: novoId_('F'), mes: p.mes, versao: p.versao, tipo: 'CIENCIA', data: agora_().iso, hash_pdf: p.hash_pdf, dispositivo: d.apelido, operador: '',
    justificativa: 'Ciência digital: resumo exibido e lido em voz alta no aparelho' };
  anexar_('Fechamentos', row);
  log_(ctx, 'CIENCIA_REGISTRADA', 'Fechamentos', row.id, null, row, '');
  return { ok: true };
}

/* ---------------------------------------------------------------- PDF do espelho (sem valores em reais) */

function esc_(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function htmlEspelho_(mes, versao, dias, s, c, ctx) {
  var h = Calculo.fmtDur, fd = Calculo.fmtData;
  var notas = [], linhas = dias.map(function (x) {
    var d = diaParaCliente_(x), m = d.marcas;
    var cel = function (t) {
      if (!m[t]) return '';
      var mk = '';
      if (m[t].correcao) { notas.push(fd(d.data) + ' — ' + Calculo.NOMES[t] + ' ' + m[t].hora + ': corrigida por ' + (m[t].origem === 'CORRECAO_EMPREGADA' ? 'empregada' : m[t].operador) + ' (' + m[t].justificativa + ')'); mk = '*'; }
      if (m[t].offline) mk += '°';
      return m[t].hora + mk;
    };
    x.eventos.forEach(function (e) {
      if (e.tipo === 'ANULACAO') notas.push(fd(d.data) + ' — marcação anulada por ' + (e.origem === 'CORRECAO_EMPREGADA' ? 'empregada' : e.operador) + ' (' + e.justificativa + ')');
    });
    var obs = [d.feriado, d.ferias ? 'Férias' : '', d.abono ? 'Abono: ' + d.abono : '', d.folga ? 'Folga compensatória ' + h(d.folga) : '',
      d.naoUsufruido ? 'Intervalo não usufruído' : '', d.escala ? 'Escala extraordinária' : '', d.status === 'FALTA' ? 'Falta' : ''].filter(String).join('; ');
    return '<tr><td>' + fd(d.data) + '</td><td>' + d.dow + '</td><td>' + cel('ENTRADA') + '</td><td>' + cel('INICIO_INTERVALO') + '</td><td>' + cel('FIM_INTERVALO') +
      '</td><td>' + cel('SAIDA') + '</td><td>' + (d.intervalo === null ? '' : h(d.intervalo)) + '</td><td>' + (d.trabalhado ? h(d.trabalhado) : '') +
      '</td><td>' + (d.saldo ? h(d.saldo, true) : '') + '</td><td>' + (d.dsrFeriado ? h(d.dsrFeriado) : '') + '</td><td>' + (d.suprimido ? h(d.suprimido) : '') +
      '</td><td class="o">' + esc_(obs) + '</td></tr>';
  }).join('');
  var mov = (s.lancamentos || []).map(function (l) { return '<li>' + esc_(l.tipo) + ': ' + h(l.minutos) + (l.vencimento ? ' (vence em ' + fd(l.vencimento) + ')' : '') + ' — ' + esc_(l.obs || '') + '</li>'; }).join('') || '<li>Sem movimentação.</li>';
  return '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;font-size:9pt;color:#000}h1{font-size:14pt;margin:0 0 4px}table{border-collapse:collapse;width:100%}' +
    'td,th{border:1px solid #777;padding:2px 3px;text-align:center}td.o{text-align:left;font-size:8pt}th{background:#eee}.box{border:1px solid #777;padding:6px;margin:6px 0}' +
    '.ass{display:inline-block;width:45%;margin-top:40px;border-top:1px solid #000;text-align:center;padding-top:3px}</style></head><body>' +
    '<h1>Espelho de ponto — ' + mes.slice(5) + '/' + mes.slice(0, 4) + (versao > 1 ? ' (versão ' + versao + ')' : '') + '</h1>' +
    '<div class="box"><b>Empregador:</b> ' + esc_(c.empregador_nome) + ' — CPF ' + esc_(c.empregador_cpf) + '<br><b>Empregada:</b> ' + esc_(c.empregada_nome) +
    ' — CPF ' + esc_(c.empregada_cpf) + '<br><b>Jornada contratual:</b> ' + c.entrada + ' às ' + c.saida + ', intervalo de ' + c.intervalo_min +
    ' min (art. 13 da LC n. 150/2015, aditivo contratual), segunda a sexta. Admissão: ' + fd(c.admissao) + '.</div>' +
    '<table><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Início int.</th><th>Fim int.</th><th>Saída</th><th>Intervalo</th><th>Trabalhado</th><th>Saldo</th><th>DSR/fer.</th><th>Int. supr.</th><th>Observações</th></tr>' +
    linhas + '</table><p>* marcação corrigida; ° marcação feita sem internet (horário do aparelho).</p>' +
    (notas.length ? '<div class="box"><b>Correções e anulações</b><br>' + notas.map(esc_).join('<br>') + '</div>' : '') +
    '<div class="box"><b>Totais do mês</b><br>Dias trabalhados: ' + s.dias_trabalhados + ' · Horas extras do mês (créditos): ' + h(s.extra) + ' · Débitos: ' + h(s.debito) +
    ' · Folgas compensatórias: ' + h(s.folgas) + ' · Saldo líquido: ' + h(s.saldo_liquido, true) +
    '<br><b>Horas extras a pagar (50%): ' + h(s.a_pagar_total) + '</b> (do mês: ' + h(s.a_pagar_mes) + '; créditos vencidos: ' + h(s.a_pagar_vencidos) + ')' +
    '<br>Trabalho em domingo/feriado (dobro): ' + h(s.dsr_feriado) + (s.dsr_compensado ? ' · compensado com folga: ' + h(s.dsr_compensado) : '') +
    ' · Intervalo suprimido (art. 71, § 4º, CLT): ' + h(s.suprimido) + ' · Faltas não abonadas: ' + s.faltas + ' (' + h(s.horas_falta) + ') · Abonos: ' + h(s.abonado) +
    ' · Dias de férias: ' + s.ferias_dias + '</div>' +
    '<div class="box"><b>Banco de horas</b> (art. 2º, §§ 4º e 5º, LC n. 150/2015) — saldo anterior: ' + h(s.saldo_banco_anterior, true) + ' · saldo final: ' + h(s.saldo_banco_final, true) + '<ul>' + mov + '</ul></div>' +
    '<p>Declaro que o espelho acima foi lido para mim e que estou ciente das marcações e totais.</p>' +
    '<span class="ass">Empregada: ' + esc_(c.empregada_nome) + '<br>Data: ____/____/______</span> &nbsp; <span class="ass">Empregador: ' + esc_(c.empregador_nome) + '</span>' +
    '<p style="font-size:7pt;margin-top:20px">Gerado pelo sistema em ' + agora_().iso.replace('T', ' ') + ' por ' + esc_(ctx.operador) +
    '. O hash SHA-256 deste arquivo fica registrado na aba Fechamentos e no Log de auditoria.</p></body></html>';
}
