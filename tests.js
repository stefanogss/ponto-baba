/* Casos de teste das regras de cálculo (item 15 da especificação). Roda em tests.html. */
function executarTestes(C) {
  var resultados = [];
  function caso(nome, fn) {
    try { var r = fn(); resultados.push({ nome: nome, ok: r === true, detalhe: r === true ? '' : String(r) }); }
    catch (e) { resultados.push({ nome: nome, ok: false, detalhe: 'Erro: ' + e.message }); }
  }
  function igual(obtido, esperado, rotulo) {
    if (JSON.stringify(obtido) !== JSON.stringify(esperado))
      return (rotulo ? rotulo + ': ' : '') + 'esperado ' + JSON.stringify(esperado) + ', obtido ' + JSON.stringify(obtido);
    return true;
  }
  function todos() { for (var i = 0; i < arguments.length; i++) if (arguments[i] !== true) return arguments[i]; return true; }

  var P = C.params();
  var SEG = '2026-11-09', SAB = '2026-11-14', DOM = '2026-11-15';
  var seq = 0;
  function ev(tipo, hora, extra) { var e = { id: 'e' + (++seq), tipo: tipo, hora: hora, origem: 'ONLINE' }; for (var k in (extra || {})) e[k] = extra[k]; return e; }
  function dia(data, evs, ctx) {
    var c = { data: data, cons: C.consolidarDia(evs), feriado: null, ferias: false, encerrado: true, futuro: false };
    for (var k in (ctx || {})) c[k] = ctx[k];
    return C.apurarDia(P, c);
  }
  function quatro(e, ii, fi, s) { return [ev('ENTRADA', e), ev('INICIO_INTERVALO', ii), ev('FIM_INTERVALO', fi), ev('SAIDA', s)]; }

  caso('Dia normal 9:00 / 12:00 / 12:30 / 17:30 = 8h, sem crédito nem débito', function () {
    var r = dia(SEG, quatro('09:00', '12:00', '12:30', '17:30'));
    return todos(igual(r.trabalhado, 480, 'trabalhado'), igual(r.saldo, 0, 'saldo'), igual(r.extra + r.debito, 0));
  });
  caso('Entrada 9:04 e saída 17:34 (4 + 4 = 8 min): sem crédito nem débito', function () {
    var r = dia(SEG, quatro('09:04', '12:00', '12:30', '17:34'));
    return todos(igual(r.saldo, 0, 'saldo'), igual(r.tolerancia, true, 'tolerância'));
  });
  caso('Entrada 9:06 (variação acima de 5 min): débito integral de 6 min', function () {
    var r = dia(SEG, quatro('09:06', '12:00', '12:30', '17:30'));
    return todos(igual(r.debito, 6, 'débito'), igual(r.saldo, -6, 'saldo'));
  });
  caso('Entrada 8:55 e saída 17:36 (5 + 6 = 11 min): crédito integral de 11 min', function () {
    var r = dia(SEG, quatro('08:55', '12:00', '12:30', '17:36'));
    return todos(igual(r.extra, 11, 'crédito'), igual(r.saldo, 11, 'saldo'));
  });
  caso('Entrada 8:55 e saída 17:35 (5 + 5 = 10 min): dentro da tolerância', function () {
    var r = dia(SEG, quatro('08:55', '12:00', '12:30', '17:35'));
    return igual(r.saldo, 0, 'saldo');
  });
  caso('Saída sem intervalo, confirmando "Não fiz intervalo": 30 min de intervalo suprimido', function () {
    var r = dia(SEG, [ev('ENTRADA', '09:00'), ev('INTERVALO_NAO_USUFRUIDO', '17:30'), ev('SAIDA', '17:30')]);
    return todos(igual(r.suprimido, 30, 'suprimido'), igual(r.saldo, 0, 'banco (sem duplicidade)'), igual(r.trabalhado, 510, 'trabalhado real'));
  });
  caso('Intervalo de 20 min: 10 min suprimidos (fora do banco)', function () {
    var r = dia(SEG, quatro('09:00', '12:00', '12:20', '17:30'));
    return todos(igual(r.suprimido, 10, 'suprimido'), igual(r.saldo, 0, 'banco'),
      igual(r.alertas.indexOf('Intervalo inferior a 30 min') >= 0, true, 'alerta'));
  });
  caso('Intervalo de 20 min com parâmetro intervalo_suprimido_tambem_no_banco = sim: +10 no banco', function () {
    var p2 = C.params({ intervalo_suprimido_tambem_no_banco: true });
    var r = C.apurarDia(p2, { data: SEG, cons: C.consolidarDia(quatro('09:00', '12:00', '12:20', '17:30')), encerrado: true });
    return todos(igual(r.suprimido, 10), igual(r.saldo, 10));
  });
  caso('Intervalo fora da faixa (10:30–11:00) e superior a 2h geram alertas', function () {
    var a = dia(SEG, quatro('09:00', '10:30', '11:00', '17:30'));
    var b = dia(SEG, quatro('09:00', '11:30', '13:45', '17:30'));
    return todos(igual(a.alertas.indexOf('Intervalo fora da faixa') >= 0, true, 'faixa'),
      igual(b.alertas.indexOf('Intervalo superior a 2 horas') >= 0, true, '2h'));
  });
  caso('Sábado trabalhado 4h: 4h extras 50% (entram na regra das 40h)', function () {
    var r = dia(SAB, [ev('ENTRADA', '08:00'), ev('SAIDA', '12:00')]);
    return todos(igual(r.extra, 240, 'extra'), igual(r.dsrFeriado, 0, 'dsr'), igual(r.escalaExtraordinaria, true, 'escala'),
      igual(C.totalizar([r]).saldoLiquido, 240, 'saldo do mês'));
  });
  caso('Domingo trabalhado 4h: 4h em DSR/feriado, fora do banco', function () {
    var r = dia(DOM, [ev('ENTRADA', '08:00'), ev('SAIDA', '12:00')]);
    return todos(igual(r.dsrFeriado, 240, 'dsr'), igual(r.extra, 0, 'extra'), igual(C.totalizar([r]).saldoLiquido, 0, 'saldo do mês'));
  });
  caso('Feriado em dia útil sem trabalho: sem expectativa, sem falta', function () {
    var r = dia('2026-11-20', [], { feriado: { descricao: 'Consciência Negra' } });
    return todos(igual(r.status, 'FERIADO'), igual(r.debito, 0));
  });
  caso('Falta integral sem abono: débito de 8h', function () {
    return igual(dia(SEG, []).debito, 480);
  });
  caso('Falta com abono integral: sem débito', function () {
    var r = dia(SEG, [], { abonoIntegral: true });
    return todos(igual(r.status, 'ABONADO'), igual(r.debito, 0));
  });
  caso('Folga compensatória integral: não gera falta e debita 8h do banco', function () {
    var r = dia(SEG, [], { folgaMin: 480 });
    return todos(igual(r.status, 'FOLGA'), igual(r.debito, 0), igual(C.totalizar([r]).saldoLiquido, -480));
  });
  caso('Dia anterior sem saída: inconsistente', function () {
    return igual(dia(SEG, [ev('ENTRADA', '09:00')]).status, 'INCONSISTENTE');
  });
  caso('Marcação anulada não conta; a nova vale', function () {
    var e1 = ev('ENTRADA', '10:00');
    var evs = [e1, { id: 'an1', tipo: 'ANULACAO', ref_id: e1.id }, ev('ENTRADA', '09:00', { origem: 'CORRECAO_EMPREGADA' }),
      ev('INICIO_INTERVALO', '12:00'), ev('FIM_INTERVALO', '12:30'), ev('SAIDA', '17:30')];
    var r = dia(SEG, evs);
    return todos(igual(r.saldo, 0), igual(r.alertas.indexOf('Correção registrada') >= 0, true));
  });
  caso('Sequência: próxima marcação esperada', function () {
    var c0 = C.consolidarDia([]), c1 = C.consolidarDia([ev('ENTRADA', '09:00')]);
    var c2 = C.consolidarDia([ev('ENTRADA', '09:00'), ev('INICIO_INTERVALO', '12:00')]);
    var c3 = C.consolidarDia([ev('ENTRADA', '09:00'), ev('INTERVALO_NAO_USUFRUIDO', '17:00')]);
    return todos(igual(C.proximaMarcacao(c0), 'ENTRADA'), igual(C.proximaMarcacao(c1), 'INICIO_INTERVALO'),
      igual(C.proximaMarcacao(c2), 'FIM_INTERVALO'), igual(C.proximaMarcacao(c3), 'SAIDA'));
  });

  var estadoVazio = C.estadoBanco([]);
  caso('Mês com 45h extras líquidas: 40h a pagar e 5h para o banco, vencendo em 12 meses', function () {
    var r = C.fecharBanco(estadoVazio, 45 * 60, '2026-10', { loteId: 'L1' });
    var cred = r.lancamentos.filter(function (l) { return l.tipo === 'CREDITO'; })[0];
    return todos(igual(r.aPagarMes, 2400, 'a pagar'), igual(cred && cred.minutos, 300, 'crédito'),
      igual(cred && cred.vencimento, '2027-10-31', 'vencimento'), igual(r.saldoFinal, 300, 'saldo'));
  });
  caso('Mês com saldo líquido de -3h e banco com 5h: banco passa a 2h', function () {
    var est = C.estadoBanco([{ id: 'L0', tipo: 'CREDITO', data: '2026-08-31', minutos: 300, vencimento: '2027-08-31' }]);
    var r = C.fecharBanco(est, -180, '2026-10');
    var depois = C.estadoBanco([{ id: 'L0', tipo: 'CREDITO', data: '2026-08-31', minutos: 300, vencimento: '2027-08-31' }].concat(r.lancamentos));
    return todos(igual(r.saldoFinal, 120, 'saldo'), igual(depois.saldo, 120, 'saldo recalculado'), igual(r.aPagarTotal, 0));
  });
  caso('Saldo negativo consome primeiro os créditos mais antigos', function () {
    var est = C.estadoBanco([
      { id: 'NOVO', tipo: 'CREDITO', data: '2026-09-30', minutos: 120, vencimento: '2027-09-30' },
      { id: 'ANTIGO', tipo: 'CARGA', data: '2026-01-31', minutos: 120, vencimento: '2027-01-31' }]);
    var r = C.fecharBanco(est, -150, '2026-10');
    return todos(igual(r.lancamentos[0].lote_id, 'ANTIGO'), igual(r.lancamentos[0].minutos, 120), igual(r.lancamentos[1].minutos, 30));
  });
  caso('Saldo negativo sem crédito: fica saldo negativo no banco', function () {
    var r = C.fecharBanco(estadoVazio, -90, '2026-10');
    return todos(igual(r.lancamentos[0].tipo, 'DEBITO'), igual(r.saldoFinal, -90));
  });
  caso('Crédito vencido: convertido em "a pagar" no mês do vencimento', function () {
    var est = C.estadoBanco([{ id: 'L0', tipo: 'CREDITO', data: '2025-10-31', minutos: 200, vencimento: '2026-10-31' }]);
    var r = C.fecharBanco(est, 0, '2026-10');
    return todos(igual(r.aPagarVencidos, 200), igual(r.lancamentos[0].tipo, 'VENCIMENTO'), igual(r.saldoFinal, 0));
  });
  caso('Alerta de crédito a 30 dias do vencimento', function () {
    var est = C.estadoBanco([{ id: 'L0', tipo: 'CREDITO', data: '2025-12-31', minutos: 60, vencimento: '2026-12-08' }]);
    return igual(C.alertasBanco(est, '2026-11-08')[0].dias, 30);
  });

  caso('Férias 14 + 16 dias: aceito', function () { return igual(C.validarFerias([{ dias: 14 }, { dias: 16 }]).ok, true); });
  caso('Férias 10 + 20 dias: aceito pela regra legal (um período com 14 dias ou mais)', function () {
    return igual(C.validarFerias([{ dias: 10 }, { dias: 20 }]).ok, true);
  });
  caso('Férias 10 + 20 dias: recusado com o parâmetro ferias_fracao_minima = 14', function () {
    return igual(C.validarFerias([{ dias: 10 }, { dias: 20 }], { fracaoMinima: 14 }).ok, false);
  });
  caso('Férias em três períodos (10 + 10 + 10): recusado', function () {
    return igual(C.validarFerias([{ dias: 10 }, { dias: 10 }, { dias: 10 }]).ok, false);
  });
  caso('Férias 13 + 13 dias: recusado (nenhum com 14 dias e soma diferente de 30)', function () {
    return igual(C.validarFerias([{ dias: 13 }, { dias: 13 }]).ok, false);
  });
  caso('Períodos aquisitivos a partir de 04/06/2025', function () {
    var p = C.periodosAquisitivos('2025-06-04', '2026-11-08');
    return todos(igual(p.length, 2), igual(p[0].fim, '2026-06-03'), igual(p[0].concessivoFim, '2027-06-03'), igual(p[1].inicio, '2026-06-04'));
  });
  caso('Férias iniciando sexta antes de domingo: alerta do art. 134, § 3º', function () {
    var al = C.alertasFerias({ inicio: '2026-12-04', dias: 30, comunicado_em: '2026-10-01' }, null, {});
    return igual(al.some(function (a) { return /134/.test(a); }), true);
  });

  caso('Marcação offline: gravada com horário do aparelho e alertas', function () {
    var srv = { iso: '2026-11-09T09:30:00', ms: Date.UTC(2026, 10, 9, 12, 30) };
    var m = C.montarMarcacaoOffline({ tipo: 'ENTRADA', hora_aparelho: '2026-11-09T09:01:12', relogio_envio_ms: srv.ms - 15 * 60000 }, srv);
    return todos(igual(m.origem, 'OFFLINE'), igual(m.hora, '09:01:12'), igual(m.data, '2026-11-09'), igual(m.hora_recebimento, srv.iso),
      igual(m.alertas, ['Horário do aparelho', 'Rede não verificada', 'Relógio do aparelho divergente']));
  });

  caso('Feriados móveis de 2026 (Páscoa 05/04)', function () {
    var f = C.feriadosNacionais(2026).map(function (x) { return x.data; });
    return todos(igual(C.pascoa(2026), '2026-04-05'), igual(f.indexOf('2026-04-03') >= 0, true, 'Sexta-feira Santa'),
      igual(f.indexOf('2026-06-04') >= 0, true, 'Corpus Christi'), igual(f.indexOf('2026-02-16') >= 0, true, 'Carnaval'));
  });

  caso('SHA-256 confere com vetores conhecidos', function () {
    return todos(igual(C.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'),
      igual(C.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
      igual(C.sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'));
  });
  caso('Verificação de integridade detecta alteração manual de uma linha do Log', function () {
    var regs = [], ant = C.GENESIS;
    for (var i = 1; i <= 5; i++) {
      var r = { id: 'L' + i, timestamp_servidor: '2026-11-09T09:0' + i + ':00', ator: 'EMPREGADA', nome_operador: '', dispositivo: 'Tablet da casa',
        ip: '200.1.2.3', acao: 'MARCACAO', entidade: 'Eventos', id_entidade: 'E' + i, valor_anterior: '', valor_novo: '{"hora":"09:0' + i + '"}',
        justificativa: '', hash_anterior: ant };
      r.hash = C.hashLog(r); ant = r.hash; regs.push(r);
    }
    var ok = C.verificarCadeia(regs);
    var adulterado = regs.map(function (r) { var o = {}; for (var k in r) o[k] = r[k]; return o; });
    adulterado[2].valor_novo = '{"hora":"08:00"}';
    var v = C.verificarCadeia(adulterado);
    var removido = regs.slice(0, 1).concat(regs.slice(2));
    var v2 = C.verificarCadeia(removido);
    return todos(igual(ok.ok, true, 'cadeia íntegra'), igual(v.ok, false), igual(v.id, 'L3', 'primeiro adulterado'),
      igual(v2.id, 'L3', 'remoção detectada'));
  });

  return resultados;
}
if (typeof module !== 'undefined' && module.exports) module.exports = executarTestes;
