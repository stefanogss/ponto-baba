/* Tela de ponto da empregada: um botão grande, cores, ícones, áudio, modo offline. */

var ICONES = {
  ENTRADA: '<svg viewBox="0 0 64 64"><rect x="32" y="6" width="24" height="52" rx="2"/><circle cx="49" cy="33" r="2.5" class="f"/><path d="M4 32h22M16 21l11 11-11 11"/></svg>',
  INICIO_INTERVALO: '<svg viewBox="0 0 64 64"><circle cx="34" cy="34" r="17"/><circle cx="34" cy="34" r="9"/><path d="M9 8v14a4 4 0 0 0 4 4v30M5 8v12M13 8v12M58 8c-5 3-6 10-6 18h6v30"/></svg>',
  FIM_INTERVALO: '<svg viewBox="0 0 64 64"><path d="M13 23A22 22 0 1 1 10 36"/><path d="M5 12l8 11 11-6"/><path d="M33 20v14l9 6"/></svg>',
  SAIDA: '<svg viewBox="0 0 64 64"><path d="M4 30L24 12l20 18"/><path d="M10 25v31h28V40"/><path d="M34 48h26M51 39l9 9-9 9"/></svg>',
  SEM_INTERVALO: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="9"/><path d="M8 8l48 48" class="risco"/></svg>',
  LAPIS: '<svg viewBox="0 0 64 64"><path d="M44 8l12 12-34 34H10V42z"/><path d="M37 15l12 12"/></svg>',
  NUVEM_RISCADA: '<svg viewBox="0 0 64 64"><path d="M18 48h30a10 10 0 0 0 2-20 15 15 0 0 0-29-4 12 12 0 0 0-3 24z"/><path d="M8 8l48 48" class="risco"/></svg>',
  CHECK: '<svg viewBox="0 0 64 64"><path d="M10 34l15 15 29-32"/></svg>',
  MAIS: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26"/><path d="M32 18v28M18 32h28"/></svg>',
  XIS: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26"/><path d="M22 22l20 20M42 22L22 42"/></svg>',
  INTERROGACAO: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26"/><path d="M24 25a8 8 0 1 1 11 7c-2 1-3 3-3 5v3"/><circle cx="32" cy="47" r="2.5" class="f"/></svg>',
  BALAO: '<svg viewBox="0 0 64 64"><path d="M8 12h48v32H28L16 54V44H8z"/><path d="M18 24h28M18 33h18"/></svg>',
  MICROFONE: '<svg viewBox="0 0 64 64"><rect x="24" y="6" width="16" height="30" rx="8"/><path d="M14 30a18 18 0 0 0 36 0M32 48v10M22 58h20"/></svg>',
  SOM: '<svg viewBox="0 0 64 64"><path d="M8 24h12l14-12v40L20 40H8z"/><path d="M44 22a14 14 0 0 1 0 20M50 14a24 24 0 0 1 0 36"/></svg>',
  VOLTAR: '<svg viewBox="0 0 64 64"><path d="M28 14L10 32l18 18M12 32h42"/></svg>',
  WIFI: '<svg viewBox="0 0 64 64"><path d="M6 24a38 38 0 0 1 52 0M14 33a26 26 0 0 1 36 0M22 42a14 14 0 0 1 20 0"/><circle cx="32" cy="51" r="3" class="f"/></svg>',
  CALENDARIO: '<svg viewBox="0 0 64 64"><rect x="8" y="12" width="48" height="44" rx="4"/><path d="M8 24h48M20 6v12M44 6v12"/><path d="M18 34h6M30 34h6M42 34h4M18 44h6M30 44h6"/></svg>',
  RELOGIO: '<svg viewBox="0 0 64 64"><circle cx="32" cy="34" r="24"/><path d="M32 20v14l10 6"/></svg>',
  BANCO: '<svg viewBox="0 0 64 64"><path d="M6 24L32 8l26 16zM10 28v20M22 28v20M42 28v20M54 28v20M6 54h52"/></svg>',
  SOL: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="11"/><path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6"/></svg>'
};

var Empregada = (function () {
  'use strict';
  var COR = { ENTRADA: '#0a7a32', INICIO_INTERVALO: '#c25400', FIM_INTERVALO: '#1f5fbf', SAIDA: '#b3261e' };
  var ROTULO = { ENTRADA: 'Entrada', INICIO_INTERVALO: 'Início do intervalo', FIM_INTERVALO: 'Fim do intervalo', SAIDA: 'Saída' };
  var FALA = { ENTRADA: 'Entrada registrada', INICIO_INTERVALO: 'Início do intervalo registrado', FIM_INTERVALO: 'Fim do intervalo registrado', SAIDA: 'Saída registrada' };
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var BLOQUEIO_MS = 60000;

  var st = { token: '', estado: null, fila: [], enviando: false, overlay: false, iniciado: false };
  var app = function () { return document.getElementById('app'); };

  /* ---------------------------------------------------------------- voz e som */

  var UN = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze',
    'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  var DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta'];
  function extenso(n, fem) {
    if (n < 20) { if (fem && n === 1) return 'uma'; if (fem && n === 2) return 'duas'; return UN[n]; }
    if (n < 60) return DEZ[Math.floor(n / 10)] + (n % 10 ? ' e ' + extenso(n % 10, fem) : '');
    return String(n);
  }
  function horaFalada(hhmm) {
    var h = +hhmm.slice(0, 2), m = +hhmm.slice(3, 5);
    var th = h === 0 ? 'zero hora' : (h === 1 ? 'uma hora' : extenso(h, true) + ' horas');
    return th + (m ? ' e ' + extenso(m, false) + (m === 1 ? ' minuto' : ' minutos') : '');
  }
  function duracaoFalada(min) {
    min = Math.round(min || 0);
    var neg = min < 0, a = Math.abs(min), h = Math.floor(a / 60), m = a % 60, p = [];
    if (h) p.push(h === 1 ? 'uma hora' : (h < 60 ? extenso(h, true) : h) + ' horas');
    if (m) p.push(extenso(m, false) + (m === 1 ? ' minuto' : ' minutos'));
    if (!p.length) return 'zero';
    return (neg ? 'menos ' : '') + p.join(' e ');
  }
  function falar(texto) {
    try {
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(texto);
      u.lang = (window.PONTO_CONFIG && PONTO_CONFIG.VOZ) || 'pt-BR';
      var v = speechSynthesis.getVoices().filter(function (x) { return /pt[-_]BR/i.test(x.lang); })[0];
      if (v) u.voice = v;
      u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  var audioCtx = null;
  /** Sons próprios, sintetizados: dois tons subindo (sucesso) ou um tom grave (aviso). */
  function som(tipo) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var notas = tipo === 'ok' ? [660, 880] : (tipo === 'offline' ? [660, 520] : [220]);
      notas.forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.18;
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.start(t); o.stop(t + 0.32);
      });
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- estado */

  function lerCache() { try { return JSON.parse(localStorage.getItem('ponto_estado') || 'null'); } catch (e) { return null; } }
  function salvarCache() { try { localStorage.setItem('ponto_estado', JSON.stringify(st.estado)); } catch (e) {} }
  function bloqueadoAte() { try { return +localStorage.getItem('ponto_bloqueio') || 0; } catch (e) { return 0; } }
  function bloquear() { try { localStorage.setItem('ponto_bloqueio', String(Date.now() + BLOQUEIO_MS)); } catch (e) {} }
  function desbloquear() { try { localStorage.removeItem('ponto_bloqueio'); } catch (e) {} }

  /** Estado do dia combinando o último retorno do servidor com a fila offline. */
  function estadoAtual() {
    var hoje = agoraSP().slice(0, 10);
    var base = st.estado && st.estado.data === hoje ? st.estado : { data: hoje, marcas: [], naoUsufruido: false };
    var marcas = (base.marcas || []).slice(), nao = !!base.naoUsufruido;
    st.fila.filter(function (i) { return i.hora_aparelho.slice(0, 10) === hoje; }).forEach(function (i) {
      if (i.intervalo && i.intervalo.fez) {
        marcas.push({ tipo: 'INICIO_INTERVALO', hora: i.intervalo.inicio, offline: true, pendente: true });
        marcas.push({ tipo: 'FIM_INTERVALO', hora: i.intervalo.fim, offline: true, pendente: true });
      }
      if (i.intervalo && !i.intervalo.fez) nao = true;
      marcas.push({ tipo: i.tipo, hora: i.hora_aparelho.slice(11, 16), offline: true, pendente: true });
    });
    var evs = marcas.map(function (m, k) { return { id: 'x' + k, tipo: m.tipo, hora: m.hora, origem: m.offline ? 'OFFLINE' : 'ONLINE' }; });
    if (nao) evs.push({ id: 'nu', tipo: 'INTERVALO_NAO_USUFRUIDO', hora: '00:00' });
    var cons = Calculo.consolidarDia(evs);
    marcas.sort(function (a, b) { return a.hora < b.hora ? -1 : 1; });
    return { data: hoje, marcas: marcas, proxima: Calculo.proximaMarcacao(cons), ciencia: st.estado ? st.estado.ciencia : null };
  }

  /* ---------------------------------------------------------------- telas */

  function telaNaoAutorizado(msg) {
    app().innerHTML = '<div class="emp"><div class="nao-autorizado">' + ICONES.XIS + '<h1>Aparelho não autorizado</h1>' +
      (msg ? '<p>' + msg + '</p>' : '') + '</div><div class="rodape"><a href="#/admin" class="link-admin">Administração</a></div></div>';
  }

  function render() {
    if (st.overlay) return;
    var s = estadoAtual(), prox = s.proxima, ate = bloqueadoAte(), bloqueado = ate > Date.now();
    var h = '<div class="emp">';
    h += '<div class="topo"><span class="relogio" id="relogio">' + agoraSP().slice(11, 16) + '</span>' +
      (st.fila.length ? '<span class="nuvem" title="Marcações guardadas no aparelho, aguardando internet">' + ICONES.NUVEM_RISCADA + '<b>' + st.fila.length + '</b></span>' : '') + '</div>';
    if (s.ciencia) h += '<button class="btn-mes" id="btnMes">' + ICONES.CALENDARIO + '<span>Ver meu mês</span></button>';
    if (prox) {
      h += '<button class="botao-principal' + (bloqueado ? ' inativo' : '') + '" id="btnMarcar" style="background:' + COR[prox] + '"' + (bloqueado ? ' disabled' : '') + '>' +
        ICONES[prox] + '<span>' + ROTULO[prox] + '</span>' + (bloqueado ? '<small id="espera">Aguarde ' + Math.ceil((ate - Date.now()) / 1000) + ' s</small>' : '') + '</button>';
      if (prox === 'INICIO_INTERVALO')
        h += '<button class="botao-saida" id="btnSaida" style="background:' + COR.SAIDA + '"' + (bloqueado ? ' disabled' : '') + '>' + ICONES.SAIDA + '<span>Saída</span></button>';
    } else {
      h += '<div class="dia-fim">' + ICONES.CHECK + '<span>Dia completo</span></div>';
    }
    h += '<div class="rodape-marcas">' + s.marcas.map(function (m) {
      return '<span class="marca" style="color:' + COR[m.tipo] + '">' + ICONES[m.tipo] + '<b>' + m.hora + '</b>' + (m.pendente ? ICONES.NUVEM_RISCADA : '') + '</span>';
    }).join('') + '</div>';
    h += '<div class="rodape"><button class="corrigir" id="btnCorrigir">' + ICONES.LAPIS + 'Corrigir hoje</button><a href="#/admin" class="link-admin">Administração</a></div></div>';
    app().innerHTML = h;
    var b = document.getElementById('btnMarcar');
    if (b) b.onclick = function () { marcar(prox); };
    var bs = document.getElementById('btnSaida');
    if (bs) bs.onclick = function () { perguntaIntervalo(); };
    document.getElementById('btnCorrigir').onclick = corrigirHoje;
    var bm = document.getElementById('btnMes');
    if (bm) bm.onclick = verMeuMes;
  }

  function overlay(html, cor) {
    st.overlay = true;
    var d = document.createElement('div');
    d.className = 'tela-cheia'; d.style.background = cor || '#fff';
    if (!cor) d.classList.add('clara');
    d.innerHTML = html;
    document.body.appendChild(d);
    return d;
  }
  function fecharOverlay(d) { if (d && d.parentNode) d.parentNode.removeChild(d); st.overlay = !!document.querySelector('.tela-cheia'); render(); }
  function fecharTodos() { Array.prototype.forEach.call(document.querySelectorAll('.tela-cheia'), function (x) { x.parentNode.removeChild(x); }); st.overlay = false; render(); }

  function confirmar(tipo, hora, offline) {
    var d = overlay('<div class="confirma">' + ICONES.CHECK + '<div class="hora-gigante">' + hora + '</div><div class="conf-rotulo">' + ROTULO[tipo] + '</div>' +
      (offline ? '<div class="conf-off">' + ICONES.NUVEM_RISCADA + '</div>' : '') + '</div>', COR[tipo]);
    som(offline ? 'offline' : 'ok');
    falar(FALA[tipo] + '. ' + horaFalada(hora) + '.' + (offline ? ' Sem internet: a marcação ficou guardada no aparelho e será enviada quando a internet voltar.' : ''));
    setTimeout(function () { fecharOverlay(d); }, 3000);
  }

  function aviso(icone, texto, cor, fala) {
    var d = overlay('<div class="confirma">' + (ICONES[icone] || '') + '<div class="aviso-texto">' + texto + '</div>' +
      '<button class="btn-ok">' + ICONES.CHECK + '</button></div>', cor || '#444');
    som('erro'); falar(fala || texto);
    d.querySelector('.btn-ok').onclick = function () { fecharOverlay(d); };
    setTimeout(function () { fecharOverlay(d); }, 8000);
  }

  /* ---------------------------------------------------------------- marcação */

  async function marcar(tipo, intervalo) {
    if (bloqueadoAte() > Date.now()) return;
    bloquear();
    var horaAparelho = agoraSP();
    if (!navigator.onLine) return marcarOffline(tipo, intervalo, horaAparelho);
    try {
      var ip = await API.ip(true);
      var r = await API.chamar('marcar', { token: st.token, tipo: tipo, ip: ip, intervalo: intervalo || null });
      st.estado = r.estado; salvarCache();
      confirmar(r.marcacao.tipo, r.marcacao.hora, false);
    } catch (e) {
      if (e.codigo === 'OFFLINE') return marcarOffline(tipo, intervalo, horaAparelho);
      desbloquear();
      if (e.dados && e.dados.data) { st.estado = e.dados; salvarCache(); }
      if (e.codigo === 'REDE') return aviso('WIFI', 'Conecte o celular no Wi-Fi da casa', '#b3261e');
      if (e.codigo === 'NAO_AUTORIZADO') return telaNaoAutorizado();
      if (e.codigo === 'DUPLO') return aviso('CHECK', 'Marcação já feita', '#444');
      if (e.codigo === 'SEQUENCIA' || e.codigo === 'COMPLETO') return aviso('RELOGIO', 'Tente de novo', '#444', 'A tela foi atualizada. Tente de novo.');
      aviso('XIS', 'Não deu certo. Tente de novo.', '#444');
    } finally { render(); }
  }

  async function marcarOffline(tipo, intervalo, horaAparelho) {
    var item = { id_local: uuid(), tipo: tipo, hora_aparelho: horaAparelho, intervalo: intervalo || null, tentativas: 0 };
    await Local.filaAdd(item);
    st.fila = await Local.filaListar();
    confirmar(tipo, horaAparelho.slice(11, 16), true);
  }

  async function sincronizar() {
    if (st.enviando || !st.token) return;
    st.fila = await Local.filaListar();
    if (!st.fila.length || !navigator.onLine) { render(); return; }
    st.enviando = true;
    try {
      var itens = st.fila.slice().sort(function (a, b) { return a.hora_aparelho < b.hora_aparelho ? -1 : 1; });
      var r = await API.chamar('sincronizar', { token: st.token, ip: await API.ip(), itens: itens, relogio_envio_ms: Date.now() });
      var enviados = 0;
      for (var i = 0; i < r.resultados.length; i++) {
        var x = r.resultados[i], item = itens.filter(function (it) { return it.id_local === x.id_local; })[0];
        if (x.status === 'OK' || x.status === 'DUPLICADO') { await Local.filaRemover(x.id_local); if (x.status === 'OK') enviados++; }
        else if (item) { item.tentativas = (item.tentativas || 0) + 1; if (item.tentativas >= 10) await Local.filaRemover(item.id_local); else await Local.filaAdd(item); }
      }
      st.estado = r.estado; salvarCache();
      st.fila = await Local.filaListar();
      if (enviados && !st.overlay) { som('ok'); falar(enviados === 1 ? 'Marcação enviada.' : 'Marcações enviadas.'); }
    } catch (e) {
      if (e.codigo === 'NAO_AUTORIZADO') { st.enviando = false; return telaNaoAutorizado(); }
    }
    st.enviando = false;
    render();
  }

  async function atualizar() {
    try {
      var r = await API.chamar('estado', { token: st.token });
      st.estado = r; salvarCache();
      render();
    } catch (e) {
      if (e.codigo === 'NAO_AUTORIZADO') return telaNaoAutorizado();
      if (e.codigo === 'CONFIG') return telaNaoAutorizado(e.message);
      render();
    }
  }

  /* ---------------------------------------------------------------- saída sem intervalo */

  function perguntaIntervalo() {
    var d = overlay('<div class="pergunta"><h2>Você fez intervalo hoje?</h2>' +
      '<button class="opcao" id="fiz" style="background:' + COR.INICIO_INTERVALO + '">' + ICONES.INICIO_INTERVALO + '<span>Fiz intervalo</span></button>' +
      '<button class="opcao" id="naoFiz" style="background:#555">' + ICONES.SEM_INTERVALO + '<span>Não fiz intervalo</span></button>' +
      '<button class="voltar" id="voltar">' + ICONES.VOLTAR + '</button></div>');
    falar('Você fez intervalo hoje?');
    d.querySelector('#voltar').onclick = function () { fecharOverlay(d); };
    d.querySelector('#naoFiz').onclick = function () { fecharTodos(); marcar('SAIDA', { fez: false }); };
    d.querySelector('#fiz').onclick = function () {
      seletorHoras('Horário do intervalo', [{ rotulo: 'Começou', icone: 'INICIO_INTERVALO', valor: '12:00' }, { rotulo: 'Terminou', icone: 'FIM_INTERVALO', valor: '12:30' }],
        function (v) { fecharTodos(); marcar('SAIDA', { fez: true, inicio: v[0], fim: v[1] }); });
      falar('Mostre a hora em que começou e terminou o intervalo. Depois toque no botão verde.');
    };
  }

  /** Seletor de horário com rodas grandes (setas para cima e para baixo). */
  function seletorHoras(titulo, campos, ok) {
    var html = '<div class="pergunta"><h2>' + titulo + '</h2><div class="rodas">' + campos.map(function (c, i) {
      return '<div class="roda-campo"><div class="roda-rotulo" style="color:' + (COR[c.icone] || '#111') + '">' + (ICONES[c.icone] || '') + c.rotulo + '</div>' +
        '<div class="roda"><div class="col"><button data-i="' + i + '" data-p="h" data-d="1">▲</button><b id="h' + i + '">' + c.valor.slice(0, 2) +
        '</b><button data-i="' + i + '" data-p="h" data-d="-1">▼</button></div><span class="dois-pontos">:</span>' +
        '<div class="col"><button data-i="' + i + '" data-p="m" data-d="5">▲</button><b id="m' + i + '">' + c.valor.slice(3, 5) +
        '</b><button data-i="' + i + '" data-p="m" data-d="-5">▼</button></div></div></div>';
    }).join('') + '</div><button class="opcao confirmar" id="okHoras" style="background:' + COR.ENTRADA + '">' + ICONES.CHECK + '</button>' +
      '<button class="voltar" id="voltarH">' + ICONES.VOLTAR + '</button></div>';
    var d = overlay(html);
    var vals = campos.map(function (c) { return [+c.valor.slice(0, 2), +c.valor.slice(3, 5)]; });
    Array.prototype.forEach.call(d.querySelectorAll('.roda button'), function (b) {
      b.onclick = function () {
        var i = +b.dataset.i, dd = +b.dataset.d;
        if (b.dataset.p === 'h') vals[i][0] = (vals[i][0] + dd + 24) % 24;
        else vals[i][1] = (vals[i][1] + dd + 60) % 60;
        d.querySelector('#h' + i).textContent = Calculo.pad(vals[i][0]);
        d.querySelector('#m' + i).textContent = Calculo.pad(vals[i][1]);
      };
    });
    d.querySelector('#voltarH').onclick = function () { fecharOverlay(d); };
    d.querySelector('#okHoras').onclick = function () {
      ok(vals.map(function (v) { return Calculo.pad(v[0]) + ':' + Calculo.pad(v[1]); }));
    };
  }

  /* ---------------------------------------------------------------- corrigir hoje */

  function corrigirHoje() {
    if (!navigator.onLine) return aviso('NUVEM_RISCADA', 'Sem internet. Corrija quando a internet voltar.', '#444');
    var d = overlay('<div class="pergunta"><h2>Corrigir hoje</h2>' +
      '<button class="opcao" id="incluir" style="background:#0a7a32">' + ICONES.MAIS + '<span>Incluir marcação</span></button>' +
      '<button class="opcao" id="anular" style="background:#b3261e">' + ICONES.XIS + '<span>Cancelar marcação errada</span></button>' +
      '<button class="voltar" id="voltarC">' + ICONES.VOLTAR + '</button></div>');
    falar('Corrigir hoje. Botão verde: incluir uma marcação. Botão vermelho: cancelar uma marcação errada.');
    d.querySelector('#voltarC').onclick = function () { fecharOverlay(d); };
    d.querySelector('#incluir').onclick = escolherTipo;
    d.querySelector('#anular').onclick = escolherAnular;
  }

  function escolherTipo() {
    var d = overlay('<div class="pergunta"><h2>Qual marcação?</h2><div class="grade">' + Calculo.SEQ.map(function (t) {
      return '<button class="opcao media" data-t="' + t + '" style="background:' + COR[t] + '">' + ICONES[t] + '<span>' + ROTULO[t] + '</span></button>';
    }).join('') + '</div><button class="voltar">' + ICONES.VOLTAR + '</button></div>');
    falar('Qual marcação você esqueceu?');
    d.querySelector('.voltar').onclick = function () { fecharOverlay(d); };
    Array.prototype.forEach.call(d.querySelectorAll('[data-t]'), function (b) {
      b.onclick = function () {
        var t = b.dataset.t;
        falar(ROTULO[t] + '. Mostre o horário e toque no botão verde.');
        seletorHoras(ROTULO[t], [{ rotulo: ROTULO[t], icone: t, valor: agoraSP().slice(11, 14) + '00' }], function (v) {
          escolherMotivo({ operacao: 'INCLUIR', tipo: t, hora: v[0] });
        });
      };
    });
  }

  function escolherAnular() {
    var marcas = estadoAtual().marcas.filter(function (m) { return m.id; });
    if (!marcas.length) return aviso('XIS', 'Não há marcação para cancelar.', '#444');
    var d = overlay('<div class="pergunta"><h2>Qual está errada?</h2><div class="grade">' + marcas.map(function (m) {
      return '<button class="opcao media" data-id="' + m.id + '" style="background:' + COR[m.tipo] + '">' + ICONES[m.tipo] + '<span>' + m.hora + '</span></button>';
    }).join('') + '</div><button class="voltar">' + ICONES.VOLTAR + '</button></div>');
    falar('Toque na marcação que está errada.');
    d.querySelector('.voltar').onclick = function () { fecharOverlay(d); };
    Array.prototype.forEach.call(d.querySelectorAll('[data-id]'), function (b) {
      b.onclick = function () { escolherMotivo({ operacao: 'ANULAR', ref_id: b.dataset.id }); };
    });
  }

  var MOTIVOS = [
    { id: 'ESQUECI', texto: 'Esqueci de marcar', icone: 'INTERROGACAO', cor: '#6a3fb5' },
    { id: 'ERRADO', texto: 'Marquei errado', icone: 'XIS', cor: '#b3261e' },
    { id: 'SEM_INTERNET', texto: 'Estava sem internet', icone: 'NUVEM_RISCADA', cor: '#1f5fbf' },
    { id: 'OUTRO', texto: 'Outro motivo', icone: 'BALAO', cor: '#555' }
  ];

  function escolherMotivo(pedido) {
    var d = overlay('<div class="pergunta"><h2>Por quê?</h2><div class="grade">' + MOTIVOS.map(function (m) {
      return '<button class="opcao media" data-m="' + m.id + '" style="background:' + m.cor + '">' + ICONES[m.icone] + '<span>' + m.texto + '</span></button>';
    }).join('') + '</div><button class="voltar">' + ICONES.VOLTAR + '</button></div>');
    falar('Por quê? ' + MOTIVOS.map(function (m) { return m.texto; }).join('. ') + '.');
    d.querySelector('.voltar').onclick = function () { fecharOverlay(d); };
    Array.prototype.forEach.call(d.querySelectorAll('[data-m]'), function (b) {
      b.onclick = function () {
        pedido.motivo = b.dataset.m;
        if (pedido.motivo === 'OUTRO') return outroMotivo(pedido);
        enviarCorrecao(pedido);
      };
    });
  }

  function outroMotivo(pedido) {
    var d = overlay('<div class="pergunta"><h2>Outro motivo</h2><textarea id="txt" rows="3" placeholder="Escreva, se quiser"></textarea>' +
      '<button class="opcao media" id="gravar" style="background:#b3261e">' + ICONES.MICROFONE + '<span>Gravar áudio</span></button>' +
      '<button class="opcao confirmar" id="enviar" style="background:#0a7a32">' + ICONES.CHECK + '</button><button class="voltar">' + ICONES.VOLTAR + '</button></div>');
    falar('Se quiser, escreva ou grave um áudio curto explicando. Depois toque no botão verde.');
    d.querySelector('.voltar').onclick = function () { fecharOverlay(d); };
    var gravador = null, partes = [], audio = null;
    d.querySelector('#gravar').onclick = async function () {
      var b = this;
      if (gravador && gravador.state === 'recording') { gravador.stop(); return; }
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        partes = []; gravador = new MediaRecorder(stream);
        gravador.ondataavailable = function (e) { partes.push(e.data); };
        gravador.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          var blob = new Blob(partes, { type: gravador.mimeType || 'audio/webm' });
          var fr = new FileReader();
          fr.onload = function () { audio = { mime: blob.type, base64: String(fr.result).split(',')[1] }; b.querySelector('span').textContent = 'Áudio gravado ✓'; };
          fr.readAsDataURL(blob);
        };
        gravador.start();
        b.querySelector('span').textContent = 'Gravando… toque para parar';
        setTimeout(function () { if (gravador.state === 'recording') gravador.stop(); }, 30000);
      } catch (e) { aviso('MICROFONE', 'Não foi possível gravar.', '#444'); }
    };
    d.querySelector('#enviar').onclick = function () {
      pedido.texto = d.querySelector('#txt').value;
      if (gravador && gravador.state === 'recording') { gravador.stop(); setTimeout(function () { pedido.audio = audio; enviarCorrecao(pedido); }, 800); return; }
      pedido.audio = audio; enviarCorrecao(pedido);
    };
  }

  async function enviarCorrecao(pedido) {
    try {
      pedido.token = st.token; pedido.ip = await API.ip();
      var r = await API.chamar('corrigirHoje', pedido);
      st.estado = r.estado; salvarCache();
      fecharTodos();
      var d = overlay('<div class="confirma">' + ICONES.CHECK + '<div class="aviso-texto">Correção registrada</div></div>', '#0a7a32');
      som('ok'); falar('Correção registrada.');
      setTimeout(function () { fecharOverlay(d); }, 3000);
    } catch (e) {
      fecharTodos();
      aviso('XIS', e.codigo === 'OFFLINE' ? 'Sem internet. Tente mais tarde.' : e.message, '#444');
    }
  }

  /* ---------------------------------------------------------------- ciência do fechamento */

  async function verMeuMes() {
    var r;
    try { r = await API.chamar('resumoMes', { token: st.token }); } catch (e) { return aviso('XIS', 'Sem internet. Tente mais tarde.', '#444'); }
    if (!r.resumo) { await atualizar(); return; }
    var s = r.resumo, nomeMes = MESES[+s.mes.slice(5) - 1];
    var fala = 'Resumo de ' + nomeMes + '. Você trabalhou ' + s.dias_trabalhados + (s.dias_trabalhados === 1 ? ' dia' : ' dias') +
      '. Horas extras a receber: ' + duracaoFalada(s.horas_extras) + '.' + (s.dsr_feriado ? ' Trabalho em domingo ou feriado: ' + duracaoFalada(s.dsr_feriado) + '.' : '') +
      ' Saldo do banco de horas: ' + duracaoFalada(s.saldo_banco) + '.';
    var linha = function (ic, cor, valor, rotulo) { return '<div class="resumo-linha" style="color:' + cor + '">' + ICONES[ic] + '<b>' + valor + '</b><span>' + rotulo + '</span></div>'; };
    var d = overlay('<div class="pergunta"><h2>' + nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1) + ' de ' + s.mes.slice(0, 4) + '</h2>' +
      linha('CALENDARIO', '#111', s.dias_trabalhados, 'dias') + linha('RELOGIO', '#c25400', Calculo.fmtDur(s.horas_extras), 'horas extras') +
      (s.dsr_feriado ? linha('SOL', '#6a3fb5', Calculo.fmtDur(s.dsr_feriado), 'domingo/feriado') : '') +
      linha('BANCO', '#1f5fbf', Calculo.fmtDur(s.saldo_banco, false), 'banco de horas') +
      '<button class="opcao media" id="ouvir" style="background:#555">' + ICONES.SOM + '<span>Ouvir de novo</span></button>' +
      '<button class="opcao" id="ciente" style="background:#0a7a32">' + ICONES.CHECK + '<span>Estou ciente</span></button>' +
      '<button class="voltar">' + ICONES.VOLTAR + '</button></div>');
    falar(fala + ' Se estiver de acordo, toque no botão verde: Estou ciente.');
    d.querySelector('.voltar').onclick = function () { fecharOverlay(d); };
    d.querySelector('#ouvir').onclick = function () { falar(fala); };
    d.querySelector('#ciente').onclick = async function () {
      try {
        await API.chamar('ciencia', { token: st.token, ip: await API.ip(), mes: s.mes, versao: s.versao });
        if (st.estado) st.estado.ciencia = null; salvarCache();
        fecharTodos();
        var c = overlay('<div class="confirma">' + ICONES.CHECK + '<div class="aviso-texto">Ciência registrada</div></div>', '#0a7a32');
        som('ok'); falar('Ciência registrada.');
        setTimeout(function () { fecharOverlay(c); atualizar(); }, 3000);
      } catch (e) { fecharTodos(); aviso('XIS', 'Não deu certo. Tente de novo.', '#444'); }
    };
  }

  /* ---------------------------------------------------------------- início */

  function tique() {
    if (document.body.className !== 'empregada') return;
    var r = document.getElementById('relogio');
    if (r) r.textContent = agoraSP().slice(11, 16);
    var e = document.getElementById('espera'), ate = bloqueadoAte();
    if (e) { if (ate > Date.now()) e.textContent = 'Aguarde ' + Math.ceil((ate - Date.now()) / 1000) + ' s'; else render(); }
    if (st.estado && st.estado.data !== agoraSP().slice(0, 10) && !st.overlay) { st.estado = null; render(); atualizar(); }
  }

  async function iniciar() {
    document.body.className = 'empregada';
    st.token = await Local.restaurarToken();
    if (!st.token) return telaNaoAutorizado();
    st.estado = lerCache();
    st.fila = await Local.filaListar();
    render();
    await atualizar();
    sincronizar();
    if (!st.iniciado) {
      st.iniciado = true;
      setInterval(tique, 1000);
      setInterval(sincronizar, 60000);
      setInterval(function () { if (document.body.className === 'empregada' && !st.overlay && navigator.onLine) atualizar(); }, 5 * 60000);
      window.addEventListener('online', sincronizar);
      window.addEventListener('offline', render);
      if (window.speechSynthesis) speechSynthesis.onvoiceschanged = function () {};
    }
  }

  return { iniciar: iniciar, falar: falar };
})();
