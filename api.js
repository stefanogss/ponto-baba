/* Comunicação com o Apps Script, armazenamento local (IndexedDB) e utilitários de hora. */

/** Agora no fuso de São Paulo, como "AAAA-MM-DDTHH:MM:SS" (usado só para marcações offline e exibição). */
function agoraSP() {
  var f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  return f.format(new Date()).replace(' ', 'T');
}

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16); crypto.getRandomValues(b);
  return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
}

var API = (function () {
  var ipCache = { v: '', t: 0 };
  function cfg() { return window.PONTO_CONFIG || {}; }
  function erro(msg, codigo, dados) { var e = new Error(msg); e.codigo = codigo; e.dados = dados; return e; }

  /** POST com Content-Type text/plain: requisição "simples", sem preflight CORS. */
  async function chamar(acao, dados) {
    var url = cfg().API_URL;
    if (!url || /SEU_ID/.test(url)) throw erro('Falta configurar a URL do Web App em config.js.', 'CONFIG');
    var corpo = JSON.stringify(Object.assign({}, dados || {}, { acao: acao }));
    var resp, j;
    try {
      resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corpo, redirect: 'follow', cache: 'no-store' });
    } catch (e) { throw erro('Sem conexão com o servidor.', 'OFFLINE'); }
    try { j = await resp.json(); } catch (e) { throw erro('Resposta inválida do servidor.', 'RESPOSTA'); }
    if (!j.ok) throw erro(j.erro || 'Erro no servidor.', j.codigo, j.dados);
    return j;
  }

  /** IP público da conexão (para a verificação da rede da casa). Vazio se não for possível obter. */
  async function ip(forcar) {
    if (!forcar && ipCache.v && Date.now() - ipCache.t < 5 * 60000) return ipCache.v;
    try {
      var ctrl = new AbortController(); var t = setTimeout(function () { ctrl.abort(); }, 6000);
      var r = await fetch(cfg().IP_URL || 'https://api.ipify.org?format=json', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(t);
      var j = await r.json();
      ipCache = { v: j.ip || '', t: Date.now() };
      return ipCache.v;
    } catch (e) { return ''; }
  }

  return { chamar: chamar, ip: ip };
})();

var Local = (function () {
  var dbp = null;
  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, falha) {
      var req = indexedDB.open('ponto-domestico', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'id_local' });
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { falha(req.error); };
    });
    return dbp;
  }
  function tx(store, modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (ok, falha) {
        var t = db.transaction(store, modo), s = t.objectStore(store), r = fn(s);
        t.oncomplete = function () { ok(r && 'result' in r ? r.result : undefined); };
        t.onerror = function () { falha(t.error); };
      });
    });
  }
  var L = {
    get: function (k) { return tx('kv', 'readonly', function (s) { return s.get(k); }).catch(function () { return undefined; }); },
    set: function (k, v) { return tx('kv', 'readwrite', function (s) { s.put(v, k); }).catch(function () {}); },
    del: function (k) { return tx('kv', 'readwrite', function (s) { s.delete(k); }).catch(function () {}); },
    filaListar: function () { return tx('fila', 'readonly', function (s) { return s.getAll(); }).then(function (x) { return x || []; }).catch(function () { return []; }); },
    filaAdd: function (item) { return tx('fila', 'readwrite', function (s) { s.put(item); }); },
    filaRemover: function (id) { return tx('fila', 'readwrite', function (s) { s.delete(id); }); },

    token: function () { try { return localStorage.getItem('ponto_token') || ''; } catch (e) { return ''; } },
    /** O token fica no localStorage e, como cópia de segurança, no IndexedDB. */
    restaurarToken: async function () {
      var t = L.token();
      if (t) { L.set('token', t); return t; }
      t = await L.get('token');
      if (t) { try { localStorage.setItem('ponto_token', t); } catch (e) {} }
      return t || '';
    },
    salvarToken: async function (t) { try { localStorage.setItem('ponto_token', t); } catch (e) {} await L.set('token', t); },
    limparToken: async function () { try { localStorage.removeItem('ponto_token'); } catch (e) {} await L.del('token'); }
  };
  return L;
})();
