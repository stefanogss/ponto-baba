/* Painel do administrador (rota #/admin). Valores em reais aparecem só aqui. */
var Admin = (function () {
  'use strict';
  var TELAS = [['hoje', 'Hoje'], ['pendencias', 'Pendências'], ['espelho', 'Espelho mensal'], ['corrigir', 'Corrigir marcação'],
    ['banco', 'Banco de horas'], ['folgas', 'Folgas'], ['ferias', 'Férias'], ['abonos', 'Abonos'], ['valores', 'Valores estimados'],
    ['fechamento', 'Fechamento'], ['relatorios', 'Relatórios'], ['log', 'Histórico/Log'], ['config', 'Configurações'], ['carga', 'Carga inicial']];
  var STATUS = { NORMAL: 'Normal', INCONSISTENTE: 'Inconsistente', EM_ANDAMENTO: 'Em andamento', FALTA: 'Falta', FERIAS: 'Férias', FOLGA: 'Folga',
    FERIADO: 'Feriado', ABONADO: 'Abonado', DESCANSO: 'Descanso', FUTURO: '' };
  var NOMES = Calculo.NOMES, fd = Calculo.fmtData, dur = Calculo.fmtDur;
  var A = { sessao: '', nome: '', ultimoUso: Date.now(), timer: null };
  try { A.sessao = sessionStorage.getItem('adm_sessao') || ''; A.nome = sessionStorage.getItem('adm_nome') || ''; } catch (e) {}

  /* ---------------------------------------------------------------- utilitários */

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }
  function mesAtual() { return agoraSP().slice(0, 7); }
  function hoje() { return agoraSP().slice(0, 10); }
  function sinal(min) { return '<span class="num ' + (min > 0 ? 'pos' : (min < 0 ? 'neg' : '')) + '">' + (min ? dur(min, true) : '—') + '</span>'; }
  function d0(min) { return min ? dur(min) : ''; }
  function reais(v) { return v === null || v === undefined ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function hmParaMin(s) { var m = /^(-)?(\d{1,3}):([0-5]\d)$/.exec(String(s).trim()); if (!m) return null; var v = +m[2] * 60 + +m[3]; return m[1] ? -v : v; }
  function dadosForm(f) {
    var o = {};
    $$('input,select,textarea', f).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type !== 'file') o[el.name] = el.value;
    });
    return o;
  }
  function lerArquivo(input) {
    return new Promise(function (ok) {
      var f = input && input.files && input.files[0];
      if (!f) return ok(null);
      var r = new FileReader();
      r.onload = function () { ok({ nome: f.name, mime: f.type || 'application/octet-stream', base64: String(r.result).split(',')[1] }); };
      r.readAsDataURL(f);
    });
  }
  function aviso(c, texto, tipo) {
    var d = document.createElement('div'); d.className = 'aviso ' + (tipo || ''); d.innerHTML = texto;
    c.insertBefore(d, c.firstChild);
    if (tipo !== 'erro') setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 10000);
  }
  function tabela(cols, linhas, cls) {
    return '<table class="' + (cls || '') + '"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (linhas.length ? linhas.join('') : '<tr><td colspan="' + cols.length + '" class="muted">Nada a mostrar.</td></tr>') + '</tbody></table>';
  }
  function tr(cels, attr) { return '<tr ' + (attr || '') + '>' + cels.map(function (c) { return '<td>' + (c === undefined ? '' : c) + '</td>'; }).join('') + '</tr>'; }
  function tags(lista, cls) { return (lista || []).filter(String).map(function (a) { return '<span class="tag ' + (cls || 'alerta') + '">' + esc(a) + '</span>'; }).join(''); }
  function baixarCSV(nome, cols, linhas) {
    var q = function (v) { v = String(v === null || v === undefined ? '' : v).replace(/<[^>]*>/g, ''); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var txt = '﻿' + [cols].concat(linhas).map(function (l) { return l.map(q).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = nome + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }
  function pedirJustificativa(pergunta) {
    var j = prompt((pergunta || 'Justificativa') + ' (obrigatória):');
    if (j === null) return null;
    if (j.trim().length < 5) { alert('A justificativa precisa ter pelo menos 5 caracteres.'); return null; }
    return j.trim();
  }

  async function chamar(acao, dados) {
    A.ultimoUso = Date.now();
    var ip = await API.ip();
    try {
      return await API.chamar(acao, Object.assign({ sessao: A.sessao, token_dispositivo: Local.token(), ip: ip }, dados || {}));
    } catch (e) {
      if (e.codigo === 'SESSAO') { sair(true); }
      throw e;
    }
  }

  /** Executa uma ação de botão mostrando erro no cartão. */
  function acao(c, fn) {
    return async function (ev) {
      if (ev) ev.preventDefault();
      var b = ev && ev.currentTarget; if (b && b.tagName === 'BUTTON') b.disabled = true;
      try { await fn(ev); } catch (e) { aviso(c, esc(e.message), 'erro'); } finally { if (b && b.tagName === 'BUTTON') b.disabled = false; }
    };
  }

  /* ---------------------------------------------------------------- login e casca */

  async function telaLogin(msg) {
    var app = $('#app');
    app.innerHTML = '<div class="adm"><div class="cartao login"><h2>Administração</h2>' + (msg ? '<div class="aviso">' + esc(msg) + '</div>' : '') +
      '<form id="fLogin" class="form" style="flex-direction:column;align-items:stretch">' +
      '<label>Quem está entrando?<select name="nome" required id="selNome"><option value="">Carregando…</option></select></label>' +
      '<div class="explica">A senha é a mesma para os dois administradores. <b>O nome escolhido aqui fica registrado em todas as alterações que você fizer</b> — é ele que identifica, no histórico, quem fez cada coisa. Escolha o seu próprio nome.</div>' +
      '<label>Senha<input type="password" name="senha" required autocomplete="current-password"></label>' +
      '<button class="btn" type="submit">Entrar</button><a href="#/" class="muted">← Voltar à tela de ponto</a></form></div></div>';
    try {
      var r = await API.chamar('adminNomes', {});
      $('#selNome').innerHTML = '<option value="">Escolha seu nome</option>' + r.nomes.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    } catch (e) { $('#selNome').innerHTML = '<option value="">' + esc(e.message) + '</option>'; }
    $('#fLogin').onsubmit = async function (ev) {
      ev.preventDefault();
      var d = dadosForm(ev.target);
      try {
        var r = await API.chamar('login', { nome: d.nome, senha: d.senha, ip: await API.ip(), token_dispositivo: Local.token() });
        A.sessao = r.sessao; A.nome = r.nome;
        try { sessionStorage.setItem('adm_sessao', A.sessao); sessionStorage.setItem('adm_nome', A.nome); } catch (e) {}
        iniciar();
      } catch (e) { telaLogin(e.message); }
    };
  }

  function sair(expirou) {
    if (A.sessao && !expirou) API.chamar('logout', { sessao: A.sessao }).catch(function () {});
    A.sessao = ''; A.nome = '';
    try { sessionStorage.removeItem('adm_sessao'); sessionStorage.removeItem('adm_nome'); } catch (e) {}
    if (/^#\/admin/.test(location.hash)) telaLogin(expirou ? 'Sessão encerrada por inatividade (30 minutos). Entre de novo.' : '');
  }

  function telaAtual() { var m = /^#\/admin\/?([a-z]*)/.exec(location.hash); return (m && m[1]) || 'hoje'; }

  function iniciar() {
    document.body.className = 'admin';
    if (!A.sessao) return telaLogin();
    var t = telaAtual();
    if (!$('#conteudo')) {
      $('#app').innerHTML = '<div class="adm"><header><h1>Painel do administrador</h1><div>Você entrou como <b>' + esc(A.nome) + '</b> · ' +
        '<a href="#/">Tela de ponto</a> · <button class="btn sec peq" id="btnSair">Sair</button></div></header>' +
        '<nav id="nav">' + TELAS.map(function (x) { return '<button data-t="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</nav><div id="conteudo"></div></div>';
      $('#btnSair').onclick = function () { sair(false); };
      $$('#nav button').forEach(function (b) { b.onclick = function () { location.hash = '#/admin/' + b.dataset.t; }; });
      document.addEventListener('click', function () { A.ultimoUso = Date.now(); });
      document.addEventListener('keydown', function () { A.ultimoUso = Date.now(); });
      if (!A.timer) A.timer = setInterval(function () { if (A.sessao && Date.now() - A.ultimoUso > 30 * 60000) sair(true); }, 30000);
    }
    $$('#nav button').forEach(function (b) { b.classList.toggle('ativo', b.dataset.t === t); });
    var c = $('#conteudo');
    c.innerHTML = '<div class="cartao">Carregando…</div>';
    var fn = TELA[t] || TELA.hoje;
    Promise.resolve(fn(c)).catch(function (e) { c.innerHTML = '<div class="cartao"><div class="aviso erro">' + esc(e.message) + '</div></div>'; });
  }

  /* ---------------------------------------------------------------- tela: dia (modal e correção) */

  function celMarca(m) {
    if (!m) return '';
    return esc(m.hora) + (m.correcao ? ' <span class="tag corr" title="' + esc(m.justificativa) + '">corr.</span>' : '') + (m.offline ? ' <span class="tag off">offline</span>' : '');
  }

  function linhaDia(d) {
    var cls = d.status === 'INCONSISTENTE' ? 'inc' : (d.tipoDia !== 'UTIL' ? 'fds' : '');
    var obs = [d.feriado, d.ferias ? 'Férias' : '', d.abono ? 'Abono: ' + d.abono : '', d.folga ? 'Folga ' + dur(d.folga) : '', d.tolerancia ? 'tolerância' : ''].filter(String);
    return '<tr class="clicavel ' + cls + '" data-dia="' + d.data + '">' + [fd(d.data), d.dow, celMarca(d.marcas.ENTRADA), celMarca(d.marcas.INICIO_INTERVALO),
      celMarca(d.marcas.FIM_INTERVALO), celMarca(d.marcas.SAIDA), d.naoUsufruido ? 'não usufruído' : (d.intervalo === null ? '' : dur(d.intervalo)),
      '<span class="num">' + d0(d.trabalhado) + '</span>', sinal(d.saldo), '<span class="num">' + d0(d.dsrFeriado) + '</span>', '<span class="num">' + d0(d.suprimido) + '</span>',
      esc(STATUS[d.status] || d.status), tags(obs, '') + tags(d.alertas) + tags(d.inconsistencias, 'erro')].map(function (x) { return '<td>' + x + '</td>'; }).join('') + '</tr>';
  }
  var COLS_DIA = ['Data', 'Dia', 'Entrada', 'Início int.', 'Fim int.', 'Saída', 'Intervalo', 'Trabalhado', 'Saldo', 'DSR/fer.', 'Int. supr.', 'Situação', 'Observações / alertas'];

  function ligarDias(raiz, aoMudar) { $$('tr[data-dia]', raiz).forEach(function (t) { t.onclick = function () { modalDia(t.dataset.dia, aoMudar); }; }); }

  async function modalDia(data, aoMudar) {
    var fundo = document.createElement('div'); fundo.className = 'modal-fundo';
    fundo.innerHTML = '<div class="modal"><div style="display:flex;justify-content:space-between"><h2>' + fd(data) + '</h2><button class="btn sec peq" id="fechaModal">Fechar</button></div><div id="corpoModal">Carregando…</div></div>';
    document.body.appendChild(fundo);
    var fechar = function () { fundo.remove(); if (aoMudar) aoMudar(); };
    $('#fechaModal', fundo).onclick = fechar;
    fundo.onclick = function (e) { if (e.target === fundo) fechar(); };
    var corpo = $('#corpoModal', fundo);
    try { await renderDetalhe(corpo, data); } catch (e) { corpo.innerHTML = '<div class="aviso erro">' + esc(e.message) + '</div>'; }
  }

  async function renderDetalhe(c, data) {
    var r = await chamar('diaDetalhe', { data: data }), d = r.dia;
    var h = tabela(COLS_DIA, [linhaDia(d)]);
    h += '<h3>Histórico completo de eventos do dia</h3>' + tabela(['Registrado em', 'Evento', 'Horário', 'Origem', 'Quem', 'Aparelho / IP', 'Justificativa', 'Alertas', 'Situação'],
      r.eventos.map(function (e) {
        return tr([esc(e.ts_servidor.replace('T', ' ')), esc(NOMES[e.tipo] || e.tipo) + (e.ref_id ? '<br><span class="muted">ref. ' + esc(e.ref_id) + '</span>' : ''),
          esc(String(e.hora).slice(0, 8)) + (e.hora_aparelho ? '<br><span class="muted">aparelho: ' + esc(e.hora_aparelho) + '<br>recebida: ' + esc(e.hora_recebimento) + '</span>' : ''),
          esc(e.origem), esc(e.ator === 'ADMIN' ? e.operador : (e.ator === 'EMPREGADA' ? 'Empregada' : e.ator)), esc(e.dispositivo) + '<br><span class="muted">' + esc(e.ip) + '</span>',
          esc(e.justificativa), tags(String(e.alertas || '').split('; ')), e.anulado_por ? '<span class="tag erro">anulada: ' + esc(e.anulado_por) + '</span>' : '<span class="muted">' + esc(e.id) + '</span>']);
      }));
    if (r.abonos.length) h += '<h3>Abonos</h3>' + r.abonos.map(function (a) { return '<div>' + dur(a.minutos) + ' — ' + esc(a.motivo) + ' (' + esc(a.operador) + ')' + (a.anexo_url ? ' · <a target="_blank" rel="noopener" href="' + esc(a.anexo_url) + '">anexo</a>' : '') + '</div>'; }).join('');
    if (r.folgas.length) h += '<h3>Folgas compensatórias</h3>' + r.folgas.map(function (f) { return '<div>' + dur(f.minutos) + ' — ' + esc(f.obs) + (f.compensa_data ? ' (compensa ' + fd(f.compensa_data) + ')' : '') + '</div>'; }).join('');
    h += '<h3>Trilha de auditoria</h3>' + tabela(['Quando', 'Ação', 'Quem', 'Hash'], r.log.map(function (l) {
      return tr([esc(l.timestamp_servidor.replace('T', ' ')), esc(l.acao), esc(l.ator + (l.nome_operador ? ' — ' + l.nome_operador : '')), '<span class="hash">' + esc(l.hash) + '</span>']);
    }));
    h += '<h3>Corrigir este dia</h3><div id="areaCorr"></div>';
    c.innerHTML = h;
    formCorrecao($('#areaCorr', c), data, d, function () { renderDetalhe(c, data); });
  }

  function formCorrecao(c, data, dia, depois) {
    var marcas = Object.keys(dia.marcas).map(function (t) { return dia.marcas[t]; });
    var opcoes = Object.keys(dia.marcas).map(function (t) { return '<option value="' + dia.marcas[t].id + '">' + NOMES[t] + ' ' + dia.marcas[t].hora + '</option>'; }).join('');
    c.innerHTML = '<form class="form" id="fCorr"><label>Operação<select name="operacao"><option value="INCLUIR">Incluir marcação</option>' +
      (marcas.length ? '<option value="AJUSTAR">Ajustar horário</option><option value="ANULAR">Anular marcação</option>' : '') + '</select></label>' +
      '<label>Marcação existente<select name="ref_id"><option value="">—</option>' + opcoes + '</select></label>' +
      '<label>Tipo<select name="tipo"><option value="">—</option>' + Calculo.SEQ.concat(['INTERVALO_NAO_USUFRUIDO']).map(function (t) { return '<option value="' + t + '">' + NOMES[t] + '</option>'; }).join('') + '</select></label>' +
      '<label>Horário<input type="time" name="hora"></label>' +
      '<label class="largo">Justificativa (obrigatória)<input name="justificativa" required minlength="5"></label>' +
      '<button class="btn" type="submit">Gravar correção</button></form><div id="antesDepois"></div>' +
      '<p class="muted">Nada é apagado: anular cria um evento de anulação; ajustar anula a marcação original e inclui a nova. Tudo fica no histórico com o seu nome.</p>';
    $('#fCorr', c).onsubmit = acao(c, async function (ev) {
      var d = dadosForm(ev.target); d.data = data;
      if (d.operacao !== 'INCLUIR' && !d.ref_id) throw new Error('Escolha a marcação existente.');
      if (d.operacao === 'INCLUIR' && !d.tipo) throw new Error('Escolha o tipo.');
      var r = await chamar('corrigir', d);
      $('#antesDepois', c).innerHTML = '<h3>Antes</h3>' + tabela(COLS_DIA, [linhaDia(r.antes)]) + '<h3>Depois</h3>' + tabela(COLS_DIA, [linhaDia(r.depois)]);
      aviso(c, 'Correção gravada.', 'ok');
      if (depois) setTimeout(depois, 2500);
    });
  }

  /* ---------------------------------------------------------------- telas */

  var TELA = {};

  TELA.hoje = async function (c) {
    var r = await chamar('adminHoje'), d = r.dia;
    var h = '<div class="cartao"><h2>Hoje — ' + fd(d.data) + ' (' + d.dow + ')</h2><div class="grade-kpi">' +
      '<div class="kpi"><b>' + esc(r.proxima ? NOMES[r.proxima] : 'Dia completo') + '</b><span>próxima marcação esperada</span></div>' +
      '<div class="kpi"><b>' + esc(STATUS[d.status] || d.status || '—') + '</b><span>situação</span></div>' +
      '<div class="kpi"><b>' + (d.trabalhado ? dur(d.trabalhado) : '—') + '</b><span>trabalhado (dia completo)</span></div>' +
      '<div class="kpi"><b>' + (r.ips.length ? r.ips.length + ' IP(s)' : 'nenhuma') + '</b><span>redes autorizadas</span></div></div>' +
      tabela(COLS_DIA, [linhaDia(d)]) + '</div>';
    h += '<div class="cartao"><h2>Eventos de hoje</h2>' + tabela(['Hora', 'Evento', 'Origem', 'Aparelho', 'Justificativa', 'Alertas'], r.eventos.map(function (e) {
      return tr([esc(String(e.hora).slice(0, 5)), esc(NOMES[e.tipo] || e.tipo), esc(e.origem), esc(e.dispositivo), esc(e.justificativa), tags(String(e.alertas || '').split('; '))]);
    })) + '</div>';
    if (r.recusasRede.length) h += '<div class="cartao"><h2>Marcações recusadas por rede hoje</h2><div class="aviso">Se a recusa foi porque o provedor trocou o IP da casa, use o botão abaixo <b>estando conectado ao Wi-Fi da casa</b>.</div>' +
      tabela(['Quando', 'Aparelho', 'IP informado'], r.recusasRede.map(function (l) { return tr([esc(l.timestamp_servidor.slice(11, 16)), esc(l.dispositivo), esc(JSON.parse(l.valor_novo || '{}').ip)]); })) +
      '<p><button class="btn" id="autRede">Autorizar a rede atual</button></p></div>';
    c.innerHTML = h;
    ligarDias(c, function () { TELA.hoje(c); });
    var b = $('#autRede', c);
    if (b) b.onclick = acao(c, async function () { var x = await chamar('redeAutorizarAtual', { ip: await API.ip(true) }); aviso(c, esc(x.mensagem), 'ok'); });
  };

  TELA.pendencias = async function (c) {
    var p = (await chamar('pendencias')).pendencias;
    var bloco = function (titulo, itens, fn, vazio) {
      return '<div class="cartao"><h2>' + titulo + ' <span class="tag">' + itens.length + '</span></h2>' + (itens.length ? '<table><tbody>' + itens.map(fn).join('') + '</tbody></table>' : '<span class="muted">' + (vazio || 'Nada pendente.') + '</span>') + '</div>';
    };
    var dia = function (data, resto) { return '<tr class="clicavel" data-dia="' + data + '"><td>' + fd(data) + '</td><td>' + resto + '</td></tr>'; };
    c.innerHTML =
      bloco('Dias inconsistentes (impedem o fechamento)', p.inconsistentes, function (x) { return dia(x.data, tags(x.motivos, 'erro')); }) +
      bloco('Meses a fechar', p.mesesAFechar, function (m) { return '<tr><td>' + esc(m) + '</td><td><a href="#/admin/fechamento">ir ao fechamento</a></td></tr>'; }) +
      bloco('Correções da empregada (30 dias)', p.correcoes, function (x) { return dia(x.data, esc(NOMES[x.tipo] || x.tipo) + ' ' + esc(String(x.hora).slice(0, 5)) + ' — ' + esc(x.justificativa)); }) +
      bloco('Marcações offline (30 dias)', p.offline, function (x) { return dia(x.data, esc(NOMES[x.tipo]) + ' ' + esc(String(x.hora).slice(0, 5)) + ' ' + tags(String(x.alertas).split('; '))); }) +
      bloco('Intervalos fora da faixa ou suprimidos (30 dias)', p.intervalos, function (x) { return dia(x.data, tags(x.alertas) + (x.suprimido ? ' suprimido: ' + dur(x.suprimido) : '')); }) +
      bloco('Marcações recusadas por rede (30 dias)', p.recusasRede, function (x) { return '<tr><td>' + esc(x.quando.replace('T', ' ')) + '</td><td>' + esc(x.dispositivo) + ' — IP ' + esc(x.ip) + '</td></tr>'; }) +
      bloco('Créditos do banco perto do vencimento', p.banco, function (x) { return '<tr><td>' + fd(x.vencimento) + '</td><td>' + esc(x.texto) + '</td></tr>'; }) +
      bloco('Férias: período concessivo', p.ferias, function (x) { return '<tr><td>' + x.periodo + 'º período</td><td>' + esc(x.texto) + '</td></tr>'; }) +
      bloco('Falhas no envio de comprovantes (30 dias)', p.comprovantes, function (x) { return '<tr><td>' + esc(x.quando.replace('T', ' ')) + '</td><td>' + esc(x.detalhe) + '</td></tr>'; });
    ligarDias(c, function () { TELA.pendencias(c); });
  };

  TELA.espelho = async function (c, mes) {
    mes = mes || (c.dataset.mes || mesAtual());
    c.dataset.mes = mes;
    var r = await chamar('espelho', { mes: mes }), t = r.totais, b = r.banco || {}, f = r.fechamento || {};
    var h = '<div class="cartao"><div class="form nao-imprimir"><label>Mês<input type="month" id="mesEsp" value="' + mes + '"></label>' +
      '<button class="btn sec" id="csvEsp">Exportar CSV</button><button class="btn sec" id="printEsp">Imprimir / PDF</button></div>' +
      '<h2>Espelho de ' + mes.slice(5) + '/' + mes.slice(0, 4) + ' — ' + (f.status === 'FECHADO' ? 'fechado (versão ' + f.versao + ')' : (f.status === 'REABERTO' ? 'reaberto' : 'aberto')) + '</h2>' +
      tabela(COLS_DIA, r.dias.map(linhaDia)) + '<p class="muted">Clique num dia para ver o histórico completo e corrigir.</p></div>';
    h += '<div class="cartao"><h2>Totais do mês</h2><div class="grade-kpi">' + [
      [t.diasTrabalhados, 'dias trabalhados'], [dur(t.extra), 'créditos (HE dias úteis e sábados)'], [dur(t.debito), 'débitos (atrasos, saídas, faltas)'],
      [dur(t.folgaBanco), 'folgas compensatórias'], [dur(t.saldoLiquido, true), 'saldo líquido do mês'], [dur(b.a_pagar_total), 'HE a pagar' + (b.projecao ? ' (projeção)' : '')],
      [dur(t.dsrFeriado), 'trabalho em DSR/feriado (dobro)'], [dur(t.suprimido), 'intervalo suprimido (art. 71, § 4º)'], [t.faltas, 'faltas não abonadas'],
      [dur(b.saldo_banco_final, true), 'saldo do banco após o mês' + (b.projecao ? ' (projeção)' : '')], [t.inconsistentes, 'dias inconsistentes']
    ].map(function (k) { return '<div class="kpi"><b>' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join('') + '</div>' +
      '<p class="muted">Intervalo suprimido e horas extras aparecem separados: conferir com a contabilidade.</p></div>';
    c.innerHTML = h;
    $('#mesEsp', c).onchange = function () { TELA.espelho(c, this.value); };
    $('#printEsp', c).onclick = function () { window.print(); };
    $('#csvEsp', c).onclick = acao(c, async function () {
      var rel = await chamar('relatorio', { tipo: 'espelho', de: mes + '-01', ate: Calculo.fimDoMes(mes) });
      baixarCSV('espelho_' + mes, rel.colunas, rel.linhas);
    });
    ligarDias(c, function () { TELA.espelho(c, mes); });
  };

  TELA.corrigir = async function (c) {
    c.innerHTML = '<div class="cartao"><h2>Corrigir marcação</h2><div class="form"><label>Dia<input type="date" id="diaCorr" max="' + hoje() + '"></label>' +
      '<button class="btn" id="abrirCorr">Abrir</button></div><div id="detCorr" style="margin-top:12px"></div></div>';
    $('#abrirCorr', c).onclick = acao(c, async function () {
      var d = $('#diaCorr', c).value; if (!d) throw new Error('Escolha o dia.');
      await renderDetalhe($('#detCorr', c), d);
    });
  };

  TELA.banco = async function (c) {
    var r = await chamar('banco'), e = r.estado;
    c.innerHTML = '<div class="cartao"><h2>Banco de horas</h2><div class="grade-kpi">' +
      '<div class="kpi"><b>' + dur(e.saldo, true) + '</b><span>saldo atual (meses fechados)</span></div>' +
      '<div class="kpi"><b>' + dur(e.creditos) + '</b><span>créditos a compensar</span></div>' +
      '<div class="kpi"><b>' + dur(e.negativo) + '</b><span>saldo negativo</span></div>' +
      '<div class="kpi"><b>' + dur(r.mesAtual.saldoLiquidoAteHoje, true) + '</b><span>saldo líquido de ' + r.mesAtual.mes + ' até hoje</span></div></div>' +
      (r.alertas.length ? r.alertas.map(function (a) { return '<div class="aviso">' + esc(a.texto) + '</div>'; }).join('') : '') +
      '<h3>Créditos a compensar (consumidos do mais antigo para o mais novo)</h3>' + tabela(['Origem', 'Lote', 'Horas originais', 'Restante', 'Vencimento'],
        e.ativos.map(function (l) { return tr([fd(l.origem), esc(l.id), dur(l.minutos), dur(l.restante), fd(l.vencimento)]); })) +
      '<h3>Extrato</h3><div class="form nao-imprimir"><button class="btn sec" id="csvBanco">Exportar CSV</button></div>' +
      tabela(['Data', 'Tipo', 'Horas', 'Lote', 'Vencimento', 'Mês ref.', 'Versão', 'Observação', 'Por'], r.extrato.map(function (b) {
        return tr([fd(b.data), esc(b.tipo) + (b.estornado ? ' <span class="tag erro">estornado (reabertura)</span>' : ''), dur(+b.minutos), esc(b.lote_id), fd(b.vencimento), esc(b.mes_ref), esc(b.versao), esc(b.obs), esc(b.operador)]);
      })) + '<p class="muted">Regra: no fechamento, até 40h do saldo positivo do mês vão para pagamento; o excedente entra no banco com validade de 12 meses. Saldo negativo consome os créditos mais antigos. Crédito vencido é convertido em "a pagar" no fechamento do mês do vencimento.</p></div>';
    $('#csvBanco', c).onclick = function () {
      baixarCSV('banco_de_horas', ['Data', 'Tipo', 'Minutos', 'Lote', 'Vencimento', 'Mês ref.', 'Versão', 'Obs', 'Estornado'],
        r.extrato.map(function (b) { return [b.data, b.tipo, b.minutos, b.lote_id, b.vencimento, b.mes_ref, b.versao, b.obs, b.estornado ? 'sim' : '']; }));
    };
  };

  TELA.folgas = async function (c) {
    var r = await chamar('folgas');
    c.innerHTML = '<div class="cartao"><h2>Lançar folga compensatória</h2><form class="form" id="fFolga">' +
      '<label>Data da folga<input type="date" name="data" required></label><label><span><input type="checkbox" name="integral" checked> Dia inteiro</span></label>' +
      '<label>Horas (se parcial, HH:MM)<input name="horas" placeholder="02:00"></label>' +
      '<label>Compensa domingo/feriado trabalhado em (opcional)<input type="date" name="compensa_data"></label>' +
      '<label class="largo">Observação (obrigatória)<input name="obs" required minlength="5"></label><button class="btn">Lançar</button></form>' +
      '<p class="muted">A folga debita o banco de horas (ou compensa dentro do mês). Se indicar o domingo/feriado compensado, essas horas deixam de ser pagas em dobro e a folga não debita o banco.</p></div>' +
      '<div class="cartao"><h2>Folgas lançadas</h2>' + tabela(['Data', 'Horas', 'Compensa', 'Observação', 'Por', 'Situação', ''], r.folgas.slice().reverse().map(function (f) {
        return tr([fd(f.data), dur(f.minutos), fd(f.compensa_data), esc(f.obs), esc(f.operador), f.revertida ? '<span class="tag erro">revertida: ' + esc(f.reversao) + '</span>' : 'válida',
          f.revertida ? '' : '<button class="btn sec peq" data-rev="' + f.id + '">Reverter</button>']);
      })) + '</div>';
    $('#fFolga', c).onsubmit = acao(c, async function (ev) {
      var d = dadosForm(ev.target);
      if (!d.integral) { d.minutos = hmParaMin(d.horas); if (!(d.minutos > 0)) throw new Error('Informe as horas no formato HH:MM.'); }
      await chamar('folgaLancar', d); TELA.folgas(c);
    });
    $$('[data-rev]', c).forEach(function (b) {
      b.onclick = acao(c, async function () { var j = pedirJustificativa('Motivo da reversão'); if (!j) return; await chamar('folgaReverter', { id: b.dataset.rev, justificativa: j }); TELA.folgas(c); });
    });
  };

  TELA.ferias = async function (c, alertasNovos) {
    var r = await chamar('ferias');
    var h = (alertasNovos && alertasNovos.length ? '<div class="cartao"><h2>Férias marcadas — avisos</h2>' + alertasNovos.map(function (a) { return '<div class="aviso">' + esc(a) + '</div>'; }).join('') + '</div>' : '');
    h += r.periodos.slice().reverse().map(function (p) {
      return '<div class="cartao"><h2>' + p.n + 'º período aquisitivo: ' + fd(p.inicio) + ' a ' + fd(p.fim) + '</h2>' +
        '<div class="grade-kpi"><div class="kpi"><b>' + p.saldo + '</b><span>dias a marcar</span></div><div class="kpi"><b>' + p.diasGozados + '</b><span>dias gozados</span></div>' +
        '<div class="kpi"><b>' + fd(p.concessivoFim) + '</b><span>fim do período concessivo</span></div><div class="kpi"><b>' + (p.completo ? 'completo' : 'em aquisição') + '</b><span>situação</span></div></div>' +
        p.alertas.map(function (a) { return '<div class="aviso">' + esc(a) + '</div>'; }).join('') +
        tabela(['Início', 'Fim', 'Dias', 'Comunicada em', 'Situação', 'Avisos', ''], p.partes.map(function (f) {
          return tr([fd(f.inicio), fd(f.fim), f.dias, fd(f.comunicado_em), esc(f.situacao), tags(f.alertas), '<button class="btn sec peq" data-canc="' + f.id + '">Cancelar</button>']);
        })) + '</div>';
    }).join('');
    h += '<div class="cartao"><h2>Marcar férias</h2><form class="form" id="fFerias"><label>Período aquisitivo<select name="aquisitivo_inicio">' +
      r.periodos.map(function (p) { return '<option value="' + p.inicio + '">' + p.n + 'º — ' + fd(p.inicio) + ' a ' + fd(p.fim) + ' (saldo ' + p.saldo + ')</option>'; }).join('') + '</select></label>' +
      '<label>Início<input type="date" name="inicio" required></label><label>Dias corridos<input type="number" name="dias" min="1" max="30" required></label>' +
      '<label>Comunicada à empregada em<input type="date" name="comunicado_em"></label><label class="largo">Observação<input name="obs"></label><button class="btn">Marcar</button></form>' +
      '<p class="muted">Até dois períodos, um deles com no mínimo 14 dias corridos (art. 17, § 2º, LC n. 150/2015). Sem abono pecuniário. Os avisos (comunicação com 30 dias, início antes de feriado/DSR, pagamento até 2 dias antes) não impedem o lançamento.</p></div>';
    if (r.canceladas.length) h += '<div class="cartao"><h2>Períodos cancelados</h2>' + tabela(['Início', 'Dias', 'Motivo'], r.canceladas.map(function (f) { return tr([fd(f.inicio), f.dias, esc(f.cancelamento)]); })) + '</div>';
    c.innerHTML = h;
    $('#fFerias', c).onsubmit = acao(c, async function (ev) { var x = await chamar('feriasLancar', dadosForm(ev.target)); TELA.ferias(c, x.alertas); });
    $$('[data-canc]', c).forEach(function (b) {
      b.onclick = acao(c, async function () { var j = pedirJustificativa('Motivo do cancelamento'); if (!j) return; await chamar('feriasCancelar', { id: b.dataset.canc, justificativa: j }); TELA.ferias(c); });
    });
  };

  TELA.abonos = async function (c) {
    var r = await chamar('abonos');
    c.innerHTML = '<div class="cartao"><h2>Lançar abono</h2><form class="form" id="fAbono"><label>Data<input type="date" name="data" required></label>' +
      '<label><span><input type="checkbox" name="integral" checked> Dia inteiro</span></label><label>De<input type="time" name="hora_ini"></label><label>Até<input type="time" name="hora_fim"></label>' +
      '<label class="largo">Motivo (obrigatório)<input name="motivo" required minlength="5"></label><label>Anexo (foto ou PDF, opcional)<input type="file" id="anexoAbono" accept="image/*,application/pdf"></label>' +
      '<button class="btn">Lançar</button></form><p class="muted">Horas abonadas contam como trabalhadas (não geram débito). O anexo vai para uma pasta restrita do Drive; o link e o hash ficam no registro.</p></div>' +
      '<div class="cartao"><h2>Abonos lançados</h2>' + tabela(['Data', 'Período', 'Horas', 'Motivo', 'Anexo', 'Por', 'Situação', ''], r.abonos.slice().reverse().map(function (a) {
        return tr([fd(a.data), a.integral === 'SIM' ? 'dia inteiro' : esc(a.hora_ini + '–' + a.hora_fim), dur(a.minutos), esc(a.motivo),
          a.anexo_url ? '<a target="_blank" rel="noopener" href="' + esc(a.anexo_url) + '">abrir</a><br><span class="hash">' + esc(a.anexo_hash.slice(0, 16)) + '…</span>' : '',
          esc(a.operador), a.revertido ? '<span class="tag erro">revertido: ' + esc(a.reversao) + '</span>' : 'válido', a.revertido ? '' : '<button class="btn sec peq" data-rev="' + a.id + '">Reverter</button>']);
      })) + '</div>';
    $('#fAbono', c).onsubmit = acao(c, async function (ev) {
      var d = dadosForm(ev.target); d.anexo = await lerArquivo($('#anexoAbono', c));
      await chamar('abonoLancar', d); TELA.abonos(c);
    });
    $$('[data-rev]', c).forEach(function (b) {
      b.onclick = acao(c, async function () { var j = pedirJustificativa('Motivo da reversão'); if (!j) return; await chamar('abonoReverter', { id: b.dataset.rev, justificativa: j }); TELA.abonos(c); });
    });
  };

  TELA.valores = async function (c, mes) {
    mes = mes || mesAtual();
    var r = await chamar('valores', { mes: mes }), v = r.valores, m = r.minutos;
    c.innerHTML = '<div class="cartao"><div class="form"><label>Mês<input type="month" id="mesVal" value="' + mes + '"></label></div>' +
      '<div class="aviso"><b>' + esc(r.aviso) + '</b>' + (r.projecao ? ' Mês ainda aberto: os números são projeção.' : '') + '</div>' +
      tabela(['Item', 'Horas', 'Valor estimado'], [
        tr(['Salário-base', '', reais(r.salarioBase)]), tr(['Vale-alimentação (fora da base das HE)', '', reais(r.valeAlimentacao)]),
        tr(['Salário-hora (salário ÷ ' + r.divisor + ')', '', reais(r.salarioHora)]),
        tr(['Horas extras a pagar × 1,5 (do mês ' + dur(m.aPagarMes) + ' + vencidas ' + dur(m.aPagarVencidos) + ')', dur(m.aPagar), reais(v.horasExtras)]),
        tr(['Trabalho em DSR/feriado × 2', dur(m.dsrFeriado), reais(v.dsrFeriado)]),
        tr(['Intervalo suprimido × 1,5 (indenizatório; conferir com a contabilidade)', dur(m.suprimido), reais(v.intervaloSuprimido)]),
        tr(['Reflexo das HE no DSR (estimativa opcional)', '', v.reflexoDsr === null ? 'desligado nas configurações' : reais(v.reflexoDsr)]),
        tr(['<b>Custo mensal estimado</b>', '', '<b>' + reais(r.custoEstimado) + '</b>'])
      ]) + '<p class="muted">' + esc(r.nota) + ' Salário-base, vale e divisor usam o valor vigente no último dia do mês.</p></div>';
    $('#mesVal', c).onchange = function () { TELA.valores(c, this.value); };
  };

  TELA.fechamento = async function (c) {
    var r = await chamar('fechamentos');
    c.innerHTML = '<div class="cartao"><h2>Fechamento mensal</h2><p class="muted">O fechamento só é possível a partir do 1º dia do mês seguinte e sem dias inconsistentes. Gera o PDF do espelho (sem valores em reais), grava o hash, lança o banco de horas e envia o PDF por e-mail. Mês fechado fica bloqueado; para alterar, reabra com justificativa (gera nova versão e nova ciência).</p>' +
      tabela(['Mês', 'Situação', 'PDF / hash', 'Ciência digital', 'Folha assinada', 'Ações'], r.meses.map(function (m) {
        var st = m.externo ? 'fechado fora do sistema' : (m.status === 'FECHADO' ? 'fechado v' + m.versao + '<br><span class="muted">' + esc(m.fechadoPor) + ' ' + esc(String(m.fechadoEm).replace('T', ' ')) + '</span>' : (m.status === 'REABERTO' ? 'reaberto' : 'aberto'));
        var pdfs = (m.versoes || []).map(function (v) { return '<a target="_blank" rel="noopener" href="' + esc(v.pdf) + '">v' + v.versao + '</a> <span class="hash" title="' + esc(v.hash) + '">' + esc(String(v.hash).slice(0, 12)) + '…</span>'; }).join('<br>');
        var acoes = '';
        if (m.status !== 'FECHADO' && m.podeFechar) acoes += '<button class="btn peq" data-fechar="' + m.mes + '">Fechar</button> ';
        if (m.status === 'FECHADO' && !m.externo) acoes += '<button class="btn sec peq" data-reabrir="' + m.mes + '">Reabrir</button> <label class="btn sec peq">Anexar folha assinada<input type="file" data-ass="' + m.mes + '" accept="image/*,application/pdf" hidden></label>';
        return tr([esc(m.mes), st + ((m.reaberturas || []).length ? '<br>' + m.reaberturas.map(function (x) { return '<span class="tag">reaberto por ' + esc(x.operador) + ': ' + esc(x.justificativa) + '</span>'; }).join('') : ''),
          pdfs, m.ciencia ? esc(m.ciencia.em.replace('T', ' ')) + '<br><span class="muted">' + esc(m.ciencia.dispositivo) + '</span>' : (m.status === 'FECHADO' && !m.externo ? '<span class="tag alerta">pendente</span>' : ''),
          (m.assinaturas || []).map(function (a) { return '<a target="_blank" rel="noopener" href="' + esc(a.url) + '">v' + a.versao + '</a>'; }).join(' '), acoes]);
      })) + '</div>';
    $$('[data-fechar]', c).forEach(function (b) {
      b.onclick = acao(c, async function () {
        if (!confirm('Fechar o mês ' + b.dataset.fechar + '? O mês ficará bloqueado para alterações.')) return;
        try { var x = await chamar('fechar', { mes: b.dataset.fechar }); aviso(c, 'Mês fechado. PDF gerado (hash ' + esc(x.fechamento.hash) + ').', 'ok'); }
        catch (e) { if (e.codigo === 'INCONSISTENTE') { aviso(c, esc(e.message) + ' — veja em Pendências.', 'erro'); return; } throw e; }
        TELA.fechamento(c);
      });
    });
    $$('[data-reabrir]', c).forEach(function (b) {
      b.onclick = acao(c, async function () { var j = pedirJustificativa('Motivo da reabertura de ' + b.dataset.reabrir); if (!j) return; await chamar('reabrir', { mes: b.dataset.reabrir, justificativa: j }); TELA.fechamento(c); });
    });
    $$('[data-ass]', c).forEach(function (inp) {
      inp.onchange = acao(c, async function () { var arq = await lerArquivo(inp); if (!arq) return; await chamar('anexarAssinatura', { mes: inp.dataset.ass, arquivo: arq }); TELA.fechamento(c); });
    });
  };

  TELA.relatorios = async function (c) {
    var ini = mesAtual() + '-01';
    c.innerHTML = '<div class="cartao"><h2>Relatórios</h2><form class="form nao-imprimir" id="fRel"><label>Relatório<select name="tipo">' +
      [['espelho', 'Espelho de ponto'], ['banco', 'Extrato do banco de horas'], ['extras', 'Horas extras e DSR/feriado por mês'], ['ausencias', 'Ausências (faltas, abonos, folgas, férias)'],
        ['correcoes', 'Correções (empregada e administrador)'], ['offline', 'Marcações offline e recusadas por rede'], ['ferias', 'Situação de férias'], ['contador', 'Resumo para o contador']]
        .map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join('') + '</select></label>' +
      '<label>De<input type="date" name="de" value="' + ini + '"></label><label>Até<input type="date" name="ate" value="' + hoje() + '"></label>' +
      '<label><span><input type="checkbox" name="comValores"> Com valores (só HE por mês)</span></label><button class="btn">Gerar</button></form><div id="saidaRel"></div></div>';
    $('#fRel', c).onsubmit = acao(c, async function (ev) {
      var d = dadosForm(ev.target), r = await chamar('relatorio', d);
      $('#saidaRel', c).innerHTML = '<h2 style="margin-top:14px">' + esc(r.titulo) + '</h2><p class="muted">Período: ' + fd(r.periodo.de) + ' a ' + fd(r.periodo.ate) + (r.legenda ? ' · ' + esc(r.legenda) : '') + '</p>' +
        '<div class="form nao-imprimir"><button class="btn sec" id="csvRel">Exportar CSV</button><button class="btn sec" id="pdfRel">Imprimir / salvar PDF</button></div>' +
        tabela(r.colunas.map(esc), r.linhas.map(function (l) { return tr(l.map(esc)); }));
      $('#csvRel', c).onclick = function () { baixarCSV(d.tipo + '_' + r.periodo.de + '_' + r.periodo.ate, r.colunas, r.linhas); };
      $('#pdfRel', c).onclick = function () { window.print(); };
    });
  };

  TELA.log = async function (c, filtros) {
    filtros = filtros || { de: Calculo.addDias(hoje(), -30), ate: hoje(), ator: '', filtroAcao: '', texto: '' };
    var r = await chamar('log', filtros);
    c.innerHTML = '<div class="cartao"><h2>Histórico / Log de auditoria</h2><form class="form" id="fLog"><label>De<input type="date" name="de" value="' + esc(filtros.de) + '"></label>' +
      '<label>Até<input type="date" name="ate" value="' + esc(filtros.ate) + '"></label><label>Ator<select name="ator">' + ['', 'EMPREGADA', 'ADMIN', 'SISTEMA'].map(function (a) { return '<option' + (a === filtros.ator ? ' selected' : '') + ' value="' + a + '">' + (a || 'todos') + '</option>'; }).join('') + '</select></label>' +
      '<label>Ação contém<input name="filtroAcao" value="' + esc(filtros.filtroAcao) + '" placeholder="ex.: CORRECAO"></label><label>Texto<input name="texto" value="' + esc(filtros.texto) + '"></label>' +
      '<button class="btn">Filtrar</button><button class="btn sec" type="button" id="csvLog">Exportar CSV</button><button class="btn perigo" type="button" id="verif">Verificar integridade</button></form>' +
      '<div id="resVerif"></div><p class="muted">' + r.total + ' registro(s) no filtro; exibindo os mais recentes primeiro.</p>' +
      tabela(['Quando', 'Ator', 'Operador', 'Aparelho / IP', 'Ação', 'Entidade', 'Antes → depois', 'Justificativa', 'Hash'], r.registros.map(function (l) {
        return tr([esc(l.timestamp_servidor.replace('T', ' ')), esc(l.ator), esc(l.nome_operador), esc(l.dispositivo) + '<br><span class="muted">' + esc(l.ip) + '</span>', esc(l.acao),
          esc(l.entidade) + '<br><span class="muted">' + esc(l.id_entidade) + '</span>', '<span class="hash">' + esc(l.valor_anterior).slice(0, 200) + (l.valor_anterior ? ' → ' : '') + esc(l.valor_novo).slice(0, 300) + '</span>',
          esc(l.justificativa), '<span class="hash" title="anterior: ' + esc(l.hash_anterior) + '">' + esc(l.hash.slice(0, 16)) + '…</span>']);
      })) + '</div>';
    $('#fLog', c).onsubmit = acao(c, async function (ev) { await TELA.log(c, dadosForm(ev.target)); });
    $('#csvLog', c).onclick = function () { baixarCSV('log_auditoria', Object.keys(r.registros[0] || { id: '' }), r.registros.slice().reverse().map(function (l) { return Object.keys(l).map(function (k) { return l[k]; }); })); };
    $('#verif', c).onclick = acao(c, async function () {
      var x = (await chamar('verificarIntegridade')).resultado;
      $('#resVerif', c).innerHTML = x.ok ? '<div class="aviso ok">Cadeia íntegra: ' + x.total + ' registros conferidos. Nenhuma alteração detectada.</div>'
        : '<div class="aviso erro"><b>Problema na cadeia de auditoria.</b> Primeiro registro com problema: <code>' + esc(x.id) + '</code> (linha ' + x.linha + ' da aba Log). ' + esc(x.motivo) + '<br>Compare com o histórico de versões da planilha (Arquivo ▸ Histórico de versões).</div>';
    });
  };

  TELA.config = async function (c) {
    var r = await chamar('configLer'), cfg = r.config, ipAtual = await API.ip(true), tokenLocal = Local.token();
    var campos = Object.keys(r.rotulos).filter(function (k) { return k !== 'ips_autorizados'; }).map(function (k) {
      var vig = r.comVigencia.indexOf(k) >= 0;
      return '<label>' + esc(r.rotulos[k]) + '<input data-chave="' + k + '" value="' + esc(cfg[k]) + '" data-orig="' + esc(cfg[k]) + '">' +
        (vig ? '<span class="muted">vigência a partir de <input type="date" data-vig="' + k + '" value="' + hoje() + '"></span>' : '') + '</label>';
    }).join('');
    var ips = String(cfg.ips_autorizados || '').split(',').filter(String);
    c.innerHTML =
      '<div class="cartao"><h2>Parâmetros</h2><div class="form" id="fParams">' + campos + '<label class="largo">Justificativa da alteração<input id="justParams"></label>' +
      '<button class="btn" id="salvarParams">Salvar alterações</button></div><p class="muted">Cada alteração fica registrada com valor anterior e novo. Salário-base, vale e divisor valem a partir da data de vigência e não recalculam meses anteriores.</p></div>' +

      '<div class="cartao"><h2>Rede da casa (IPs autorizados)</h2><p>IP desta conexão agora: <code>' + esc(ipAtual || 'não obtido') + '</code></p>' +
      tabela(['IP', ''], ips.map(function (ip) { return tr([esc(ip), '<button class="btn sec peq" data-rmip="' + esc(ip) + '">Remover</button>']); })) +
      '<p><button class="btn" id="autRede2">Autorizar a rede atual</button> <span class="muted">Use estando conectado ao Wi-Fi da casa. Provedores trocam o IP de tempos em tempos.</span></p></div>' +

      '<div class="cartao"><h2>Aparelhos</h2>' + (tokenLocal ? '<div class="aviso ok">Este aparelho já está cadastrado (há um token salvo nele).</div>' : '') +
      tabela(['Apelido', 'Exige Wi-Fi da casa', 'Situação', 'Cadastrado', 'Revogado', ''], r.dispositivos.map(function (d) {
        return tr([esc(d.apelido), d.exige_rede_casa === 'SIM' ? 'sim' : 'não', d.ativo === 'SIM' ? 'ativo' : 'revogado', esc(d.cadastrado_em.replace('T', ' ')) + ' ' + esc(d.cadastrado_por),
          esc(String(d.revogado_em || '').replace('T', ' ')) + ' ' + esc(d.revogado_por || ''), d.ativo === 'SIM' ? '<button class="btn perigo peq" data-rev="' + d.id + '">Revogar</button>' : '']);
      })) + '<h3>Cadastrar este aparelho</h3><form class="form" id="fDisp"><label>Apelido<input name="apelido" required placeholder="Tablet da casa / Celular da babá"></label>' +
      '<label><span><input type="checkbox" name="exige_rede" checked> Exigir Wi-Fi da casa (celular: sim; tablet que não sai de casa: não)</span></label><button class="btn">Cadastrar este aparelho</button></form></div>' +

      '<div class="cartao"><h2>Feriados</h2><form class="form" id="fFer"><label>Data<input type="date" name="data" required></label><label class="largo">Descrição<input name="descricao" required></label>' +
      '<label>Abrangência<select name="abrangencia"><option>municipal</option><option>estadual</option><option>nacional</option></select></label><button class="btn">Incluir</button></form>' +
      '<form class="form" id="fNac" style="margin-top:8px"><label>Carregar feriados nacionais do ano<input type="number" name="ano" value="' + (+hoje().slice(0, 4) + 1) + '"></label><button class="btn sec">Carregar</button></form>' +
      '<p class="muted">Os feriados estaduais de SC e municipais de Florianópolis devem ser cadastrados aqui (o sistema não os presume). Carnaval e Corpus Christi vêm como ponto facultativo, inativos: ative-os se forem folga.</p>' +
      tabela(['Data', 'Descrição', 'Abrangência', 'Situação', ''], r.feriados.filter(function (f) { return f.ativo !== 'EXCLUIDO'; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; })
        .filter(function (f) { return f.data >= Calculo.addDias(hoje(), -400); }).map(function (f) {
          return tr([fd(f.data), esc(f.descricao), esc(f.abrangencia), f.ativo === 'SIM' ? 'ativo' : 'inativo' + (f.facultativo === 'SIM' ? ' (facultativo)' : ''),
            '<button class="btn sec peq" data-fer="' + f.id + '" data-at="' + (f.ativo === 'SIM' ? 'NAO' : 'SIM') + '">' + (f.ativo === 'SIM' ? 'Desativar' : 'Ativar') + '</button> <button class="btn perigo peq" data-ferx="' + f.id + '">Excluir</button>']);
        })) + '</div>' +

      '<div class="cartao"><h2>Comprovantes e gatilhos</h2><p>E-mails dos destinatários ficam nos parâmetros acima. Comprovante diário às ' + esc(cfg.hora_comprovante) + 'h.</p>' +
      '<button class="btn sec" id="gatilhos">Reinstalar gatilhos</button> <button class="btn sec" id="testeComp">Enviar comprovante de hoje agora</button></div>' +

      '<div class="cartao"><h2>Trocar senha</h2><form class="form" id="fSenha"><label>Senha atual<input type="password" name="atual" required></label>' +
      '<label>Nova senha (mín. 8)<input type="password" name="nova" required minlength="8"></label><label>Repita<input type="password" name="nova2" required></label><button class="btn">Trocar</button></form>' +
      '<p class="muted">A troca é registrada no log, sem a senha. A senha vale para os dois administradores: avise o outro.</p></div>';

    $('#salvarParams', c).onclick = acao(c, async function () {
      var alt = $$('[data-chave]', c).filter(function (i) { return i.value !== i.dataset.orig; }).map(function (i) {
        var v = $('[data-vig="' + i.dataset.chave + '"]', c);
        return { chave: i.dataset.chave, valor: i.value, vigencia_desde: v ? v.value : '' };
      });
      if (!alt.length) throw new Error('Nenhum parâmetro alterado.');
      await chamar('configSalvar', { alteracoes: alt, justificativa: $('#justParams', c).value });
      await TELA.config(c); aviso(c, 'Parâmetros salvos (' + alt.length + ').', 'ok');
    });
    $('#autRede2', c).onclick = acao(c, async function () { var x = await chamar('redeAutorizarAtual', { ip: await API.ip(true) }); await TELA.config(c); aviso(c, esc(x.mensagem), 'ok'); });
    $$('[data-rmip]', c).forEach(function (b) { b.onclick = acao(c, async function () { if (!confirm('Remover o IP ' + b.dataset.rmip + '?')) return; await chamar('redeRemover', { ipRemover: b.dataset.rmip }); TELA.config(c); }); });
    $$('[data-rev]', c).forEach(function (b) { b.onclick = acao(c, async function () { var j = pedirJustificativa('Motivo da revogação'); if (!j) return; await chamar('dispositivoRevogar', { id: b.dataset.rev, justificativa: j }); TELA.config(c); }); });
    $('#fDisp', c).onsubmit = acao(c, async function (ev) {
      if (tokenLocal && !confirm('Este aparelho já tem um cadastro. Substituir pelo novo?')) return;
      var x = await chamar('dispositivoCadastrar', dadosForm(ev.target));
      await Local.salvarToken(x.token);
      await TELA.config(c); aviso(c, 'Aparelho "' + esc(x.dispositivo.apelido) + '" cadastrado. A tela de ponto já funciona neste aparelho.', 'ok');
    });
    $('#fFer', c).onsubmit = acao(c, async function (ev) { await chamar('feriadoSalvar', dadosForm(ev.target)); TELA.config(c); });
    $('#fNac', c).onsubmit = acao(c, async function (ev) { var x = await chamar('feriadosCarregarNacionais', dadosForm(ev.target)); await TELA.config(c); aviso(c, x.incluidos + ' feriado(s) incluído(s).', 'ok'); });
    $$('[data-fer]', c).forEach(function (b) { b.onclick = acao(c, async function () { await chamar('feriadoSalvar', { id: b.dataset.fer, ativo: b.dataset.at }); TELA.config(c); }); });
    $$('[data-ferx]', c).forEach(function (b) { b.onclick = acao(c, async function () { var j = pedirJustificativa('Motivo da exclusão'); if (!j) return; await chamar('feriadoSalvar', { id: b.dataset.ferx, excluir: true, justificativa: j }); TELA.config(c); }); });
    $('#gatilhos', c).onclick = acao(c, async function () { var x = await chamar('instalarGatilhos'); aviso(c, 'Gatilhos instalados: comprovante às ' + esc(x.comprovante) + ', alertas às ' + esc(x.alertas) + '.', 'ok'); });
    $('#testeComp', c).onclick = acao(c, async function () {
      var x = await chamar('testarComprovante', {});
      aviso(c, x.resultados.map(function (r) { return esc(r.papel + ' ' + (r.email || '') + ': ' + (r.ok ? 'enviado' : 'falhou (' + r.erro + ')')); }).join('<br>') || 'Nenhum destinatário cadastrado.', x.falhas ? 'erro' : 'ok');
    });
    $('#fSenha', c).onsubmit = acao(c, async function (ev) {
      var d = dadosForm(ev.target); if (d.nova !== d.nova2) throw new Error('As senhas novas não conferem.');
      await chamar('trocarSenha', d); ev.target.reset(); aviso(c, 'Senha trocada.', 'ok');
    });
  };

  TELA.carga = async function (c) {
    c.innerHTML = '<div class="cartao"><h2>Carga inicial (usar uma vez)</h2><div class="aviso">Tudo o que for lançado aqui fica no log como "carga inicial". Confira antes de gravar.</div>' +
      '<form id="fCarga" class="form" style="flex-direction:column;align-items:stretch">' +
      '<label>Primeiro mês apurado pelo sistema (AAAA-MM)<input name="primeiro_mes_sistema" placeholder="' + mesAtual() + '"></label>' +
      '<label>Saldo do banco de horas — uma linha por crédito: <code>data de origem;HH:MM</code> (débito: <code>data;-HH:MM</code>)<textarea name="banco" rows="4" placeholder="2026-08-31;05:30"></textarea></label>' +
      '<label>Férias já gozadas — uma linha por período: <code>início do período aquisitivo;início do gozo;dias</code><textarea name="ferias" rows="3" placeholder="2025-06-04;2026-07-01;15"></textarea></label>' +
      '<label>Meses já fechados fora do sistema (separados por vírgula)<input name="meses" placeholder="2025-06, 2025-07"></label>' +
      '<label>Observação<input name="justificativa"></label><button class="btn">Gravar carga inicial</button></form></div>';
    $('#fCarga', c).onsubmit = acao(c, async function (ev) {
      var d = dadosForm(ev.target);
      var banco = d.banco.split('\n').map(function (l) { return l.trim(); }).filter(String).map(function (l) {
        var p = l.split(';'), m = hmParaMin(p[1] || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(p[0]) || m === null) throw new Error('Linha do banco inválida: ' + l); return { origem: p[0], minutos: m };
      });
      var ferias = d.ferias.split('\n').map(function (l) { return l.trim(); }).filter(String).map(function (l) {
        var p = l.split(';'); if (p.length !== 3) throw new Error('Linha de férias inválida: ' + l); return { aquisitivo_inicio: p[0].trim(), inicio: p[1].trim(), dias: +p[2] };
      });
      var meses = d.meses.split(',').map(function (m) { return m.trim(); }).filter(String);
      if (!confirm('Gravar ' + banco.length + ' lançamento(s) de banco, ' + ferias.length + ' de férias e ' + meses.length + ' mês(es) fechado(s)?')) return;
      var x = await chamar('cargaInicial', { primeiro_mes_sistema: d.primeiro_mes_sistema, banco: banco, ferias: ferias, meses: meses, justificativa: d.justificativa });
      aviso(c, x.registros + ' registro(s) gravado(s).', 'ok'); ev.target.reset();
    });
  };

  return { iniciar: iniciar };
})();
