/*
 * Ponto Eletrônico Doméstico — regras de cálculo (funções puras, sem acesso a dados).
 *
 * Este MESMO arquivo é usado em dois lugares:
 *   - no navegador (index.html e tests.html), como calculo.js;
 *   - no Google Apps Script, como Calculo.gs (cópia idêntica; ver README, "Atualizar o Calculo.gs").
 *
 * Convenções:
 *   - Datas são texto "AAAA-MM-DD" e horas "HH:MM" ou "HH:MM:SS", já no fuso America/Sao_Paulo.
 *   - Durações são números inteiros de MINUTOS. Positivo = crédito; negativo = débito.
 *   - Fundamento: LC n. 150/2015 (arts. 2º, 12, 13, 16 e 17); CLT, arts. 58, § 1º, e 71, § 4º
 *     (aplicação subsidiária, art. 19 da LC n. 150/2015); Súmula 366 do TST.
 */
var Calculo = (function () {
  'use strict';
  var C = {};

  C.SEQ = ['ENTRADA', 'INICIO_INTERVALO', 'FIM_INTERVALO', 'SAIDA'];
  C.NOMES = {
    ENTRADA: 'Entrada', INICIO_INTERVALO: 'Início do intervalo', FIM_INTERVALO: 'Fim do intervalo',
    SAIDA: 'Saída', INTERVALO_NAO_USUFRUIDO: 'Intervalo não usufruído', ANULACAO: 'Anulação', FOLGA: 'Folga compensatória'
  };

  C.PARAMS_PADRAO = {
    entrada: '09:00', saida: '17:30', intervalo_min: 30, faixa_ini: '11:00', faixa_fim: '14:00',
    intervalo_max: 120, jornada_min: 480, tol_marcacao: 5, tol_diaria: 10, dias_trabalho: [1, 2, 3, 4, 5],
    intervalo_suprimido_tambem_no_banco: false,
    intervalo_exigido_acima_de_min: 360, // intervalo de 30 min só é exigido em jornada bruta acima de 6h
    limite_pagar_mes_min: 2400,         // 40 horas (art. 2º, § 5º, I, da LC n. 150/2015)
    banco_validade_meses: 12            // art. 2º, § 5º, II, da LC n. 150/2015
  };

  C.params = function (p) {
    var o = {}, k;
    for (k in C.PARAMS_PADRAO) o[k] = C.PARAMS_PADRAO[k];
    if (p) for (k in p) if (p[k] !== undefined && p[k] !== null && p[k] !== '') o[k] = p[k];
    return o;
  };

  /* ------------------------------------------------------------------ horas e datas */

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  C.pad = pad;

  C.hm = function (s) {
    if (s === null || s === undefined || s === '') return null;
    var p = String(s).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  };
  C.fmtHora = function (min) {
    if (min === null || min === undefined) return '';
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  };
  C.fmtDur = function (min, comSinal) {
    min = Math.round(min || 0);
    var s = min < 0 ? '-' : (comSinal && min > 0 ? '+' : '');
    var a = Math.abs(min);
    return s + Math.floor(a / 60) + 'h' + pad(a % 60);
  };
  C.fmtData = function (iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };

  function dUTC(iso) { var p = String(iso).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function isoUTC(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

  C.diaSemana = function (iso) { return dUTC(iso).getUTCDay(); }; // 0 = domingo
  C.DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  C.addDias = function (iso, n) { var d = dUTC(iso); d.setUTCDate(d.getUTCDate() + n); return isoUTC(d); };
  C.difDias = function (a, b) { return Math.round((dUTC(b) - dUTC(a)) / 86400000); };
  C.addMeses = function (iso, n) {
    var p = String(iso).split('-'), y = +p[0], m = +p[1] - 1 + n, d = +p[2];
    var y2 = y + Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var ult = new Date(Date.UTC(y2, m + 1, 0)).getUTCDate();
    return y2 + '-' + pad(m + 1) + '-' + pad(Math.min(d, ult));
  };
  C.fimDoMes = function (mesRef) { var p = mesRef.split('-'); return isoUTC(new Date(Date.UTC(+p[0], +p[1], 0))); };
  C.mesSeguinte = function (mesRef) { return C.addMeses(mesRef + '-01', 1).slice(0, 7); };
  C.mesAnterior = function (mesRef) { return C.addMeses(mesRef + '-01', -1).slice(0, 7); };
  C.diasDoMes = function (mesRef) {
    var out = [], d = mesRef + '-01', fim = C.fimDoMes(mesRef);
    while (d <= fim) { out.push(d); d = C.addDias(d, 1); }
    return out;
  };

  /* ------------------------------------------------------------------ feriados nacionais */

  C.pascoa = function (y) { // algoritmo de Meeus/Jones/Butcher
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return y + '-' + pad(mes) + '-' + pad(dia);
  };

  /** Feriados nacionais do ano. Carnaval e Corpus Christi vêm marcados como facultativos. */
  C.feriadosNacionais = function (ano) {
    var p = C.pascoa(ano);
    var fixos = [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'],
      ['09-07', 'Independência do Brasil'], ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'],
      ['11-15', 'Proclamação da República'], ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'], ['12-25', 'Natal']];
    var out = fixos.map(function (f) { return { data: ano + '-' + f[0], descricao: f[1], abrangencia: 'nacional', facultativo: false }; });
    out.push({ data: C.addDias(p, -2), descricao: 'Sexta-feira Santa', abrangencia: 'nacional', facultativo: false });
    out.push({ data: C.addDias(p, -48), descricao: 'Carnaval (segunda-feira) — ponto facultativo', abrangencia: 'nacional', facultativo: true });
    out.push({ data: C.addDias(p, -47), descricao: 'Carnaval (terça-feira) — ponto facultativo', abrangencia: 'nacional', facultativo: true });
    out.push({ data: C.addDias(p, 60), descricao: 'Corpus Christi — ponto facultativo', abrangencia: 'nacional', facultativo: true });
    out.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    return out;
  };

  /* ------------------------------------------------------------------ consolidação do dia */

  /**
   * Recebe TODOS os eventos de um dia (inclusive anulados e anulações) e devolve as marcações válidas.
   * Evento: {id, tipo, hora, origem, ref_id, ...}. Uma ANULACAO invalida o evento cujo id está em ref_id.
   */
  C.consolidarDia = function (eventos) {
    var anulados = {}, marcas = {}, ids = {}, validos = [], inc = [], naoUsufruido = false, corr = 0, off = 0;
    (eventos || []).forEach(function (e) { if (e.tipo === 'ANULACAO' && e.ref_id) anulados[e.ref_id] = e; });
    (eventos || []).forEach(function (e) {
      if (anulados[e.id] || e.tipo === 'ANULACAO') return;
      if (e.tipo === 'INTERVALO_NAO_USUFRUIDO') { naoUsufruido = true; if (/^CORRECAO/.test(e.origem || '')) corr++; return; }
      if (C.SEQ.indexOf(e.tipo) < 0) return;
      validos.push(e);
      if (/^CORRECAO/.test(e.origem || '')) corr++;
      if (e.origem === 'OFFLINE') off++;
      if (marcas[e.tipo] !== undefined) inc.push('Marcação repetida: ' + C.NOMES[e.tipo]);
      else { marcas[e.tipo] = C.hm(e.hora); ids[e.tipo] = e.id; }
    });
    validos.sort(function (a, b) { return String(a.hora) < String(b.hora) ? -1 : 1; });
    var E = marcas.ENTRADA, II = marcas.INICIO_INTERVALO, FI = marcas.FIM_INTERVALO, S = marcas.SAIDA;
    var tem = function (x) { return x !== undefined; };
    if (tem(S) && !tem(E)) inc.push('Saída sem entrada');
    if ((tem(II) || tem(FI)) && !tem(E)) inc.push('Intervalo sem entrada');
    if (tem(E) && tem(S) && S <= E) inc.push('Saída antes da entrada');
    if (tem(FI) && !tem(II)) inc.push('Fim do intervalo sem início');
    if (tem(II) && !tem(FI) && tem(S)) inc.push('Intervalo sem fim');
    if (tem(II) && tem(FI) && FI < II) inc.push('Fim do intervalo antes do início');
    if (tem(E) && tem(II) && II < E) inc.push('Intervalo antes da entrada');
    if (tem(S) && tem(FI) && FI > S) inc.push('Intervalo depois da saída');
    if (naoUsufruido && (tem(II) || tem(FI))) inc.push('Intervalo registrado e também declarado não usufruído');
    return { marcas: marcas, ids: ids, validos: validos, naoUsufruido: naoUsufruido, inconsistencias: inc, corrigidas: corr, offline: off };
  };

  /** Próxima marcação esperada. null = dia completo. */
  C.proximaMarcacao = function (cons) {
    var m = cons.marcas;
    if (m.ENTRADA === undefined) return 'ENTRADA';
    if (m.SAIDA !== undefined) return null;
    if (cons.naoUsufruido) return 'SAIDA';
    if (m.INICIO_INTERVALO === undefined) return 'INICIO_INTERVALO';
    if (m.FIM_INTERVALO === undefined) return 'FIM_INTERVALO';
    return 'SAIDA';
  };

  /* ------------------------------------------------------------------ apuração diária */

  /**
   * ctx: {data, cons, feriado (obj|null), ferias (bool), folgaMin, folgaSemDebitoMin, abonoMin, abonoIntegral,
   *       dsrCompensado (bool), encerrado (bool: o dia já terminou), futuro (bool)}
   */
  C.apurarDia = function (p, ctx) {
    p = C.params(p);
    var data = ctx.data, dow = C.diaSemana(data), cons = ctx.cons || C.consolidarDia([]);
    var diaContratual = p.dias_trabalho.indexOf(dow) >= 0;
    var tipoDia = ctx.feriado ? 'FERIADO' : (dow === 0 ? 'DOMINGO' : (diaContratual ? 'UTIL' : (dow === 6 ? 'SABADO' : 'NAO_UTIL')));
    var r = {
      data: data, tipoDia: tipoDia, esperado: 0, trabalhado: 0, saldo: 0, extra: 0, debito: 0, dsrFeriado: 0, dsrCompensado: 0,
      suprimido: 0, folga: 0, folgaBanco: 0, abonado: 0, intervalo: null, status: '', alertas: [], tolerancia: false,
      escalaExtraordinaria: false, inconsistencias: cons.inconsistencias.slice()
    };
    var esperadoBase = (tipoDia === 'UTIL' && !ctx.ferias) ? p.jornada_min : 0;
    var folga = Math.min(ctx.folgaMin || 0, esperadoBase);
    r.folga = folga;
    r.folgaBanco = Math.max(0, folga - Math.min(ctx.folgaSemDebitoMin || 0, folga));
    r.esperado = esperadoBase - folga;
    var abono = ctx.abonoIntegral ? r.esperado : Math.min(ctx.abonoMin || 0, r.esperado);

    var m = cons.marcas, temMarc = cons.validos.length > 0;
    if (cons.naoUsufruido) r.alertas.push('Intervalo não usufruído (confirmado)');
    if (cons.corrigidas) r.alertas.push('Correção registrada');
    if (cons.offline) r.alertas.push('Marcação offline (horário do aparelho)');

    if (cons.inconsistencias.length || (temMarc && (m.ENTRADA === undefined || m.SAIDA === undefined))) {
      if (!ctx.encerrado && !cons.inconsistencias.length) { r.status = 'EM_ANDAMENTO'; return r; }
      if (!cons.inconsistencias.length) r.inconsistencias.push('Dia sem saída registrada');
      r.status = 'INCONSISTENTE';
      return r;
    }

    if (!temMarc) {
      if (ctx.ferias) r.status = 'FERIAS';
      else if (ctx.feriado) r.status = 'FERIADO';
      else if (esperadoBase === 0) r.status = 'DESCANSO';
      else if (folga >= esperadoBase) r.status = 'FOLGA';
      else if (r.esperado > 0 && abono >= r.esperado) { r.status = 'ABONADO'; r.abonado = r.esperado; }
      else if (ctx.futuro || !ctx.encerrado) r.status = ctx.futuro ? 'FUTURO' : 'EM_ANDAMENTO';
      else { r.status = 'FALTA'; r.abonado = abono; r.debito = r.esperado - abono; r.saldo = -r.debito; }
      return r;
    }

    // --- dia com marcações completas
    r.escalaExtraordinaria = tipoDia !== 'UTIL' || !!ctx.ferias;
    var E = m.ENTRADA, S = m.SAIDA, II = m.INICIO_INTERVALO, FI = m.FIM_INTERVALO;
    var bruto = S - E;
    var temIntervalo = II !== undefined && FI !== undefined;
    var dur = (!cons.naoUsufruido && temIntervalo) ? FI - II : 0;
    r.intervalo = dur;
    var exige = bruto > p.intervalo_exigido_acima_de_min;
    if (!temIntervalo && !cons.naoUsufruido && exige) r.alertas.push('Intervalo não registrado');
    if (exige && dur < p.intervalo_min) {
      r.suprimido = p.intervalo_min - dur; // art. 71, § 4º, da CLT
      if (dur > 0) r.alertas.push('Intervalo inferior a ' + p.intervalo_min + ' min');
    }
    if (temIntervalo) {
      if (II < C.hm(p.faixa_ini) || FI > C.hm(p.faixa_fim)) r.alertas.push('Intervalo fora da faixa');
      if (dur > p.intervalo_max) r.alertas.push('Intervalo superior a 2 horas');
    }
    var intervaloBanco = (exige && !p.intervalo_suprimido_tambem_no_banco) ? Math.max(dur, p.intervalo_min) : dur;
    r.trabalhado = bruto - dur;
    var trabBanco = bruto - intervaloBanco;
    r.status = 'NORMAL';

    if (tipoDia === 'FERIADO' || tipoDia === 'DOMINGO') {
      if (ctx.dsrCompensado) r.dsrCompensado = trabBanco; else r.dsrFeriado = trabBanco;
      r.alertas.push('Escala extraordinária');
      return r;
    }
    if (tipoDia !== 'UTIL' || ctx.ferias) {
      r.extra = trabBanco; r.saldo = trabBanco;
      r.alertas.push('Escala extraordinária');
      return r;
    }

    var saldo = trabBanco - r.esperado;
    if (folga === 0 && abono === 0) {
      // Tolerância (art. 58, § 1º, CLT; Súmula 366 TST): até 5 min por marcação e 10 min no dia.
      var vE = E - C.hm(p.entrada), vS = S - C.hm(p.saida), vI = exige ? intervaloBanco - p.intervalo_min : 0;
      var vs = [vE, vS, vI].map(Math.abs);
      var soma = vs[0] + vs[1] + vs[2];
      if (vs[0] <= p.tol_marcacao && vs[1] <= p.tol_marcacao && vs[2] <= p.tol_marcacao && soma <= p.tol_diaria) {
        r.tolerancia = true; saldo = 0;
      }
    } else if (saldo < 0 && abono > 0) {
      var usado = Math.min(abono, -saldo);
      r.abonado = usado; saldo += usado;
    }
    r.saldo = saldo;
    if (saldo > 0) r.extra = saldo; else r.debito = -saldo;
    return r;
  };

  /** Totais de um conjunto de dias apurados. */
  C.totalizar = function (dias) {
    var t = { extra: 0, debito: 0, folga: 0, folgaBanco: 0, dsrFeriado: 0, dsrCompensado: 0, suprimido: 0, abonado: 0,
      trabalhado: 0, diasTrabalhados: 0, faltas: 0, horasFalta: 0, inconsistentes: 0, diasFerias: 0, saldoLiquido: 0 };
    dias.forEach(function (d) {
      t.extra += d.extra; t.debito += d.debito; t.folga += d.folga; t.folgaBanco += d.folgaBanco;
      t.dsrFeriado += d.dsrFeriado; t.dsrCompensado += d.dsrCompensado; t.suprimido += d.suprimido;
      t.abonado += d.abonado; t.trabalhado += d.trabalhado;
      if (d.trabalhado > 0) t.diasTrabalhados++;
      if (d.status === 'FALTA') { t.faltas++; t.horasFalta += d.debito; }
      if (d.status === 'INCONSISTENTE') t.inconsistentes++;
      if (d.status === 'FERIAS') t.diasFerias++;
    });
    t.saldoLiquido = t.extra - t.debito - t.folgaBanco; // item 7.5.1
    return t;
  };

  /* ------------------------------------------------------------------ banco de horas */

  /**
   * Estado do banco a partir dos lançamentos válidos (em ordem de gravação).
   * Tipos: CREDITO/CARGA (cria lote: id, data, minutos, vencimento), CONSUMO e VENCIMENTO (lote_id, minutos),
   *        DEBITO (aumenta saldo negativo), QUITACAO (reduz saldo negativo).
   */
  C.estadoBanco = function (lancamentos) {
    var lotes = {}, ordem = [], negativo = 0;
    (lancamentos || []).forEach(function (l) {
      var min = +l.minutos || 0;
      if (l.tipo === 'CREDITO' || l.tipo === 'CARGA') {
        lotes[l.id] = { id: l.id, origem: l.data, vencimento: l.vencimento, minutos: min, restante: min };
        ordem.push(l.id);
      } else if ((l.tipo === 'CONSUMO' || l.tipo === 'VENCIMENTO') && lotes[l.lote_id]) {
        lotes[l.lote_id].restante -= min;
      } else if (l.tipo === 'DEBITO' || l.tipo === 'CARGA_DEBITO') negativo += min;
      else if (l.tipo === 'QUITACAO') negativo -= min;
    });
    var lista = ordem.map(function (id) { return lotes[id]; });
    var ativos = lista.filter(function (x) { return x.restante > 0; })
      .sort(function (a, b) { return a.origem < b.origem ? -1 : (a.origem > b.origem ? 1 : 0); });
    var creditos = ativos.reduce(function (s, x) { return s + x.restante; }, 0);
    return { lotes: lista, ativos: ativos, creditos: creditos, negativo: negativo, saldo: creditos - negativo };
  };

  /**
   * Apuração mensal do banco (item 7.5). Devolve os lançamentos a gravar e os valores "a pagar".
   * opts: {limite (min), validadeMeses, loteId}
   */
  C.fecharBanco = function (estado, saldoLiquido, mesRef, opts) {
    opts = opts || {};
    var limite = opts.limite === undefined ? 2400 : opts.limite;
    var validade = opts.validadeMeses || 12;
    var fim = C.fimDoMes(mesRef), lanc = [], aPagarMes = 0, aPagarVencidos = 0, variacao = 0;
    var ativos = estado.ativos.map(function (l) { return { id: l.id, origem: l.origem, vencimento: l.vencimento, restante: l.restante }; });

    if (saldoLiquido < 0) {
      var falta = -saldoLiquido;
      for (var i = 0; i < ativos.length && falta > 0; i++) { // mais antigos primeiro
        var c = Math.min(ativos[i].restante, falta);
        if (c > 0) { lanc.push({ tipo: 'CONSUMO', lote_id: ativos[i].id, minutos: c, obs: 'Saldo negativo do mês' }); ativos[i].restante -= c; falta -= c; }
      }
      if (falta > 0) lanc.push({ tipo: 'DEBITO', minutos: falta, obs: 'Saldo negativo sem crédito para abater' });
      variacao = saldoLiquido;
    } else if (saldoLiquido > 0) {
      var resto = saldoLiquido;
      if (estado.negativo > 0) {
        var q = Math.min(resto, estado.negativo);
        lanc.push({ tipo: 'QUITACAO', minutos: q, obs: 'Compensação de saldo negativo anterior' });
        resto -= q; variacao += q;
      }
      aPagarMes = Math.min(resto, limite);
      var exc = resto - aPagarMes;
      if (exc > 0) {
        lanc.push({ tipo: 'CREDITO', id: opts.loteId || ('L' + mesRef), minutos: exc, vencimento: C.addMeses(fim, validade), obs: 'Excedente de ' + C.fmtDur(limite) + ' no mês' });
        variacao += exc;
      }
    }
    ativos.forEach(function (l) { // créditos vencidos viram "a pagar" no mês do vencimento (item 7.5.5)
      if (l.restante > 0 && l.vencimento && l.vencimento <= fim) {
        lanc.push({ tipo: 'VENCIMENTO', lote_id: l.id, minutos: l.restante, obs: 'Crédito vencido convertido em a pagar' });
        aPagarVencidos += l.restante; variacao -= l.restante;
      }
    });
    return { aPagarMes: aPagarMes, aPagarVencidos: aPagarVencidos, aPagarTotal: aPagarMes + aPagarVencidos,
      lancamentos: lanc, saldoFinal: estado.saldo + variacao };
  };

  /** Alertas de vencimento (60 e 30 dias). */
  C.alertasBanco = function (estado, hoje) {
    var out = [];
    estado.ativos.forEach(function (l) {
      var dias = C.difDias(hoje, l.vencimento);
      if (dias <= 60) out.push({ lote: l.id, vencimento: l.vencimento, restante: l.restante, dias: dias,
        texto: C.fmtDur(l.restante) + ' de crédito vence em ' + C.fmtData(l.vencimento) + ' (' + dias + ' dias)' });
    });
    return out;
  };

  /* ------------------------------------------------------------------ férias (art. 17 da LC n. 150/2015) */

  C.periodosAquisitivos = function (admissao, ate) {
    var out = [], ini = admissao, n = 1;
    while (ini <= ate) {
      out.push({ n: n, inicio: ini, fim: C.addDias(C.addMeses(ini, 12), -1), concessivoFim: C.addDias(C.addMeses(ini, 24), -1) });
      ini = C.addMeses(admissao, 12 * n); n++;
    }
    return out;
  };

  /**
   * Valida o conjunto de períodos de gozo de UM período aquisitivo.
   * Regra legal: até dois períodos, um deles com no mínimo 14 dias corridos; total de 30 dias.
   * opts.fracaoMinima: mínimo opcional para CADA período (parâmetro ferias_fracao_minima; 0 = só a regra legal).
   */
  C.validarFerias = function (partes, opts) {
    opts = opts || {};
    var dias = partes.map(function (x) { return +x.dias; });
    var total = dias.reduce(function (s, d) { return s + d; }, 0);
    var minimo = +opts.fracaoMinima || 0;
    if (dias.some(function (d) { return !(d >= 1) || Math.floor(d) !== d; })) return { ok: false, erro: 'Número de dias inválido.' };
    if (dias.length > 2) return { ok: false, erro: 'As férias podem ser divididas em no máximo dois períodos.' };
    if (total > 30) return { ok: false, erro: 'O total ultrapassa 30 dias.' };
    if (dias.length === 2) {
      if (Math.max(dias[0], dias[1]) < 14) return { ok: false, erro: 'Um dos períodos deve ter no mínimo 14 dias corridos.' };
      if (total !== 30) return { ok: false, erro: 'Divididas em dois períodos, as férias devem somar 30 dias.' };
      if (minimo && Math.min(dias[0], dias[1]) < minimo) return { ok: false, erro: 'Cada período deve ter no mínimo ' + minimo + ' dias (parâmetro configurado).' };
    }
    if (dias.length === 1 && dias[0] < 30) {
      var resto = 30 - dias[0];
      if (minimo && Math.min(dias[0], resto) < minimo) return { ok: false, erro: 'Com este período, o restante não poderá respeitar o mínimo de ' + minimo + ' dias.' };
    }
    return { ok: true, total: total, saldo: 30 - total };
  };

  /** Avisos não bloqueantes de um período de gozo. feriados: {data: true}. */
  C.alertasFerias = function (parte, periodo, feriados) {
    var al = [];
    feriados = feriados || {};
    if (!parte.comunicado_em || C.difDias(parte.comunicado_em, parte.inicio) < 30)
      al.push('Comunicação à empregada com menos de 30 dias de antecedência (art. 135 da CLT).');
    for (var k = 1; k <= 2; k++) {
      var d = C.addDias(parte.inicio, k);
      if (C.diaSemana(d) === 0 || feriados[d]) { al.push('Início nos dois dias que antecedem feriado ou DSR (art. 134, § 3º, da CLT).'); break; }
    }
    al.push('Lembrete: pagar as férias até ' + C.fmtData(C.addDias(parte.inicio, -2)) + ' (art. 145 da CLT).');
    var fim = C.addDias(parte.inicio, +parte.dias - 1);
    if (periodo && fim > periodo.concessivoFim) al.push('Termina após o fim do período concessivo: pagamento em dobro (art. 137 da CLT).');
    if (periodo && parte.inicio <= periodo.fim) al.push('Início antes de completado o período aquisitivo.');
    return al;
  };

  /* ------------------------------------------------------------------ marcação offline */

  /** item: {tipo, hora_aparelho:'AAAA-MM-DDTHH:MM:SS', relogio_envio_ms}; servidor: {iso, ms}. */
  C.montarMarcacaoOffline = function (item, servidor) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(String(item.hora_aparelho || ''))) throw new Error('Horário do aparelho inválido.');
    var alertas = ['Horário do aparelho', 'Rede não verificada'];
    if (item.relogio_envio_ms !== undefined && item.relogio_envio_ms !== null &&
      Math.abs(+item.relogio_envio_ms - servidor.ms) > 10 * 60000) alertas.push('Relógio do aparelho divergente');
    if (String(item.hora_aparelho) > String(servidor.iso)) alertas.push('Horário do aparelho no futuro');
    var h = String(item.hora_aparelho).slice(11);
    if (h.length === 5) h += ':00';
    return { data: String(item.hora_aparelho).slice(0, 10), hora: h, tipo: item.tipo, origem: 'OFFLINE',
      hora_aparelho: item.hora_aparelho, hora_recebimento: servidor.iso, alertas: alertas };
  };

  /* ------------------------------------------------------------------ trilha de auditoria */

  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

  /** SHA-256 de um texto (UTF-8), em hexadecimal. Implementação pura, síncrona. */
  C.sha256 = function (texto) {
    var s = unescape(encodeURIComponent(String(texto))), n = s.length, i, j, w = [];
    for (i = 0; i < n; i++) w[i >> 2] |= (s.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
    w[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
    var total = ((n + 8) >> 6) * 16 + 16;
    for (i = 0; i < total; i++) w[i] = w[i] | 0;
    w[total - 1] = n * 8;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Array(64);
    for (j = 0; j < total; j += 16) {
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        if (i < 16) W[i] = w[j + i];
        else {
          var x = W[i - 15], y = W[i - 2];
          var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
          var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
          W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
        }
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  };

  C.LOG_CAMPOS = ['id', 'timestamp_servidor', 'ator', 'nome_operador', 'dispositivo', 'ip', 'acao', 'entidade',
    'id_entidade', 'valor_anterior', 'valor_novo', 'justificativa', 'hash_anterior'];
  C.GENESIS = 'GENESIS';

  /** Conteúdo canônico: array JSON dos campos, na ordem fixa, todos como texto. */
  C.canonLog = function (r) {
    return JSON.stringify(C.LOG_CAMPOS.map(function (k) { return r[k] === undefined || r[k] === null ? '' : String(r[k]); }));
  };
  /** hash = SHA-256(hash_anterior + conteúdo canônico). */
  C.hashLog = function (r, fn) { return (fn || C.sha256)(String(r.hash_anterior || '') + C.canonLog(r)); };

  /** Recalcula a cadeia inteira. Aponta o primeiro registro adulterado, removido, inserido ou fora de ordem. */
  C.verificarCadeia = function (regs, fn) {
    var ant = C.GENESIS;
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      if (String(r.hash_anterior) !== ant)
        return { ok: false, total: regs.length, indice: i, id: r.id, motivo: 'Elo quebrado: o hash anterior não confere (registro removido, inserido ou reordenado antes deste).' };
      if (C.hashLog(r, fn) !== String(r.hash))
        return { ok: false, total: regs.length, indice: i, id: r.id, motivo: 'Conteúdo do registro alterado depois de gravado.' };
      ant = String(r.hash);
    }
    return { ok: true, total: regs.length };
  };

  return C;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Calculo;
