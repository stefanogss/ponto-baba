/**
 * Comprovantes diários e alertas (item 12).
 * Interface única enviarComprovante(destinatario, conteudo) com adaptadores trocáveis.
 * Adaptador ativo: e-mail. CallMeBot e WhatsApp Cloud API ficam previstos e desativados:
 * para ativá-los, inclua o nome em "canal_comprovante" no painel e grave as chaves em Script Properties
 * (CALLMEBOT_APIKEY; WHATSAPP_TOKEN e WHATSAPP_PHONE_ID). Nunca grave chaves na planilha.
 */

var ADAPTADORES = {
  email: function (dest, c) {
    if (!dest.email) throw new Error('Sem e-mail cadastrado');
    MailApp.sendEmail({ to: dest.email, subject: c.assunto, body: c.texto, htmlBody: c.html, attachments: c.anexos || [], name: 'Ponto Doméstico' });
  },
  callmebot: function (dest, c) { // gratuito, não oficial
    var key = prop_('CALLMEBOT_APIKEY');
    if (!key || !dest.telefone) throw new Error('CallMeBot não configurado');
    UrlFetchApp.fetch('https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(dest.telefone) + '&text=' + encodeURIComponent(c.texto) + '&apikey=' + encodeURIComponent(key));
  },
  whatsapp_cloud: function (dest, c) { // oficial da Meta, pago por mensagem
    var tok = prop_('WHATSAPP_TOKEN'), pid = prop_('WHATSAPP_PHONE_ID');
    if (!tok || !pid || !dest.telefone) throw new Error('WhatsApp Cloud API não configurada');
    UrlFetchApp.fetch('https://graph.facebook.com/v19.0/' + pid + '/messages', { method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + tok },
      payload: JSON.stringify({ messaging_product: 'whatsapp', to: dest.telefone, type: 'text', text: { body: c.texto } }) });
  }
};

/** Envia por todos os canais configurados. Devolve [{canal, ok, erro}]. */
function enviarComprovante(destinatario, conteudo) {
  var canais = lista_(cfg_().canal_comprovante);
  if (!canais.length) canais = ['email'];
  if (conteudo.anexos && conteudo.anexos.length) canais = canais.filter(function (c) { return c === 'email'; }).concat(canais.indexOf('email') < 0 ? ['email'] : []);
  return canais.map(function (canal) {
    try {
      if (!ADAPTADORES[canal]) throw new Error('Canal desconhecido');
      ADAPTADORES[canal](destinatario, conteudo);
      return { canal: canal, ok: true };
    } catch (e) { return { canal: canal, ok: false, erro: e.message }; }
  });
}

function destinatarios_(c) {
  var out = [];
  var tels = lista_(c.telefones_admins);
  if (c.email_empregada || c.telefone_empregada) out.push({ papel: 'empregada', email: c.email_empregada, telefone: c.telefone_empregada });
  lista_(c.emails_admins).forEach(function (e, i) { out.push({ papel: 'administrador', email: e, telefone: tels[i] || '' }); });
  return out;
}

/* ---------------------------------------------------------------- comprovante diário */

var CORES = { ENTRADA: '#0a7a32', INICIO_INTERVALO: '#d35400', FIM_INTERVALO: '#1f5fbf', SAIDA: '#b3261e', INTERVALO_NAO_USUFRUIDO: '#555' };
var SIMBOLOS = { ENTRADA: '➜🚪', INICIO_INTERVALO: '🍽', FIM_INTERVALO: '⏰', SAIDA: '🏠➜', INTERVALO_NAO_USUFRUIDO: '🚫🍽' };

function conteudoDiario_(data) {
  var evs = eventosDoDia_(data), cons = Calculo.consolidarDia(evs);
  var ids = {}; evs.forEach(function (e) { ids[e.id] = true; });
  var ultimoLog = null;
  ler_('Log').forEach(function (l) { if (ids[l.id_entidade]) ultimoLog = l; });
  var linhas = cons.validos.map(function (e) {
    var notas = [];
    if (/^CORRECAO/.test(e.origem)) notas.push('corrigida');
    if (e.origem === 'OFFLINE') notas.push('sem internet');
    return { tipo: e.tipo, hora: String(e.hora).slice(0, 5), notas: notas.join(', ') };
  });
  if (cons.naoUsufruido) linhas.push({ tipo: 'INTERVALO_NAO_USUFRUIDO', hora: '', notas: 'confirmado pela empregada' });
  var anulacoes = evs.filter(function (e) { return e.tipo === 'ANULACAO'; }).length;
  var fd = Calculo.fmtData(data);
  var assunto = 'Ponto de ' + fd;
  var texto = assunto + '\n\n' + (linhas.length ? linhas.map(function (l) { return (Calculo.NOMES[l.tipo]) + ': ' + l.hora + (l.notas ? ' (' + l.notas + ')' : ''); }).join('\n') : 'Nenhuma marcação neste dia.') +
    (anulacoes ? '\n\nMarcações anuladas no dia: ' + anulacoes : '') +
    '\n\nCódigo de verificação: ' + (ultimoLog ? ultimoLog.hash : '—');
  var html = '<div style="font-family:Arial,sans-serif;max-width:520px">' +
    '<h2 style="font-size:26px;margin:0 0 12px">Ponto de ' + fd + '</h2>' +
    (linhas.length ? linhas.map(function (l) {
      return '<div style="border-left:10px solid ' + CORES[l.tipo] + ';padding:8px 12px;margin:8px 0;background:#f6f6f6">' +
        '<span style="font-size:28px">' + SIMBOLOS[l.tipo] + '</span> <span style="font-size:20px">' + Calculo.NOMES[l.tipo] + '</span><br>' +
        '<span style="font-size:40px;font-weight:bold;color:' + CORES[l.tipo] + '">' + l.hora + '</span>' +
        (l.notas ? '<div style="font-size:16px;color:#444">(' + l.notas + ')</div>' : '') + '</div>';
    }).join('') : '<p style="font-size:22px">Nenhuma marcação neste dia.</p>') +
    (anulacoes ? '<p style="font-size:16px">Marcações anuladas no dia: ' + anulacoes + '</p>' : '') +
    '<p style="font-size:12px;color:#555;margin-top:20px">Código de verificação (hash do último registro do dia na trilha de auditoria):<br><code>' +
    (ultimoLog ? ultimoLog.hash : '—') + '</code></p></div>';
  return { assunto: assunto, texto: texto, html: html, hash: ultimoLog ? ultimoLog.hash : '' };
}

/** Envia o comprovante do dia; registra cada envio no Log; agenda nova tentativa em 30 min se falhar. */
function enviarComprovantesDoDia_(data) {
  var c = cfg_(), cont = conteudoDiario_(data), falhas = 0, resultados = [];
  destinatarios_(c).forEach(function (d) {
    enviarComprovante(d, cont).forEach(function (res) {
      resultados.push({ papel: d.papel, email: d.email, canal: res.canal, ok: res.ok, erro: res.erro || '' });
      if (res.ok) log_(CTX_SISTEMA, 'COMPROVANTE_ENVIADO', 'Comprovante', data, null, { para: d.papel, email: d.email, canal: res.canal, hash: cont.hash }, '');
      else { falhas++; log_(CTX_SISTEMA, 'COMPROVANTE_FALHA', 'Comprovante', data, null, { para: d.papel, email: d.email, canal: res.canal }, res.erro); }
    });
  });
  if (!destinatarios_(c).length) { falhas++; log_(CTX_SISTEMA, 'COMPROVANTE_FALHA', 'Comprovante', data, null, null, 'Nenhum destinatário cadastrado'); }
  return { falhas: falhas, resultados: resultados };
}

/** Gatilho diário (instalado por instalarGatilhos_). */
function comprovanteDiario() {
  comLock_(function () {
    var data = agora_().data;
    var r = enviarComprovantesDoDia_(data);
    if (r.falhas) agendarNovaTentativa_(data);
  });
}

function comprovanteNovaTentativa() {
  comLock_(function () {
    apagarGatilhos_('comprovanteNovaTentativa');
    var data = prop_('COMPROVANTE_PENDENTE');
    if (!data) return;
    PropertiesService.getScriptProperties().deleteProperty('COMPROVANTE_PENDENTE');
    var r = enviarComprovantesDoDia_(data);
    if (r.falhas && !prop_('COMPROVANTE_RETENTOU_' + data)) { setProp_('COMPROVANTE_RETENTOU_' + data, '1'); agendarNovaTentativa_(data); }
  });
}

function agendarNovaTentativa_(data) {
  setProp_('COMPROVANTE_PENDENTE', data);
  ScriptApp.newTrigger('comprovanteNovaTentativa').timeBased().after(30 * 60 * 1000).create();
}

function testarComprovante_(r, ctx) {
  var data = r.data || agora_().data;
  var res = enviarComprovantesDoDia_(data);
  log_(ctx, 'COMPROVANTE_TESTE', 'Comprovante', data, null, res, 'Envio manual pelo painel');
  return res;
}

function enviarEmailFechamento_(mes, versao, blob, hash, s, c) {
  var h = Calculo.fmtDur, assunto = 'Espelho de ponto ' + mes.slice(5) + '/' + mes.slice(0, 4) + (versao > 1 ? ' (versão ' + versao + ')' : '');
  var texto = assunto + '\n\nDias trabalhados: ' + s.dias_trabalhados + '\nHoras extras a pagar: ' + h(s.a_pagar_total) +
    '\nDomingo/feriado: ' + h(s.dsr_feriado) + '\nSaldo do banco de horas: ' + h(s.saldo_banco_final, true) +
    '\n\nO espelho completo está anexado em PDF.\nHash SHA-256 do PDF: ' + hash;
  var html = '<div style="font-family:Arial,sans-serif;font-size:18px"><h2>' + assunto + '</h2><p>📅 Dias trabalhados: <b>' + s.dias_trabalhados +
    '</b></p><p>⏱ Horas extras a pagar: <b>' + h(s.a_pagar_total) + '</b></p><p>☀ Domingo/feriado: <b>' + h(s.dsr_feriado) +
    '</b></p><p>🏦 Saldo do banco de horas: <b>' + h(s.saldo_banco_final, true) + '</b></p><p>O espelho completo está anexado em PDF.</p>' +
    '<p style="font-size:12px;color:#555">Hash SHA-256 do PDF: <code>' + hash + '</code></p></div>';
  var out = [];
  destinatarios_(c).forEach(function (d) {
    enviarComprovante(d, { assunto: assunto, texto: texto, html: html, anexos: [blob] }).forEach(function (res) {
      out.push({ papel: d.papel, ok: res.ok, erro: res.erro || '' });
      log_(CTX_SISTEMA, res.ok ? 'FECHAMENTO_ENVIADO' : 'COMPROVANTE_FALHA', 'Fechamentos', mes, null, { para: d.papel, email: d.email, versao: versao, hash_pdf: hash }, res.erro || '');
    });
  });
  return out;
}

/* ---------------------------------------------------------------- alertas diários (banco e férias) */

function alertasDiarios() {
  comLock_(function () {
    var hoje = agora_().data, msgs = [];
    Calculo.alertasBanco(Calculo.estadoBanco(bancoValidos_()), hoje).forEach(function (a) {
      if (a.dias === 60 || a.dias === 30) msgs.push('Banco de horas: ' + a.texto + '.');
    });
    var fer = ferias_();
    fer.periodos.forEach(function (p) {
      var faltam = Calculo.difDias(hoje, p.concessivoFim);
      if (p.saldo > 0 && p.completo && (faltam === 90 || faltam === 60 || faltam === 30))
        msgs.push('Férias: faltam ' + faltam + ' dias para o fim do período concessivo do ' + p.n + 'º período aquisitivo e há ' + p.saldo + ' dias sem marcar.');
      p.partes.forEach(function (f) {
        var ate = Calculo.difDias(hoje, f.inicio);
        if (ate === 30) msgs.push('Férias começam em 30 dias (' + Calculo.fmtData(f.inicio) + '): comunicar a empregada por escrito (art. 135 da CLT).');
        if (ate === 4) msgs.push('Férias começam em ' + Calculo.fmtData(f.inicio) + ': o pagamento deve ser feito até ' + Calculo.fmtData(Calculo.addDias(f.inicio, -2)) + ' (art. 145 da CLT).');
      });
    });
    if (!msgs.length) return;
    var c = cfg_();
    lista_(c.emails_admins).forEach(function (e) {
      var res = enviarComprovante({ email: e }, { assunto: 'Ponto doméstico: alertas de ' + Calculo.fmtData(hoje), texto: msgs.join('\n'),
        html: '<div style="font-family:Arial;font-size:16px">' + msgs.map(esc_).join('<br><br>') + '</div>' });
      log_(CTX_SISTEMA, 'ALERTA_ENVIADO', 'Alertas', hoje, null, { para: e, mensagens: msgs, resultado: res }, '');
    });
  });
}

/* ---------------------------------------------------------------- gatilhos */

function comLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { fn(); } finally { CACHE_ = {}; lock.releaseLock(); }
}

function apagarGatilhos_(nome) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === nome) ScriptApp.deleteTrigger(t); });
}

function instalarGatilhos_() {
  apagarGatilhos_('comprovanteDiario');
  apagarGatilhos_('alertasDiarios');
  var hora = +cfg_().hora_comprovante || 20;
  ScriptApp.newTrigger('comprovanteDiario').timeBased().atHour(hora).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('alertasDiarios').timeBased().atHour(8).everyDays(1).inTimezone(TZ).create();
  return { comprovante: hora + 'h', alertas: '8h' };
}

function instalarGatilhosAdmin_(r, ctx) {
  var g = instalarGatilhos_();
  log_(ctx, 'GATILHOS_INSTALADOS', 'Gatilhos', '', null, g, '');
  return g;
}
