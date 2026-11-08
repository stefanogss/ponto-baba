/* Service worker: guarda a interface para abrir sem internet. As chamadas ao Apps Script nunca passam pelo cache. */
var VERSAO = 'ponto-v1';
var ARQUIVOS = ['./', 'index.html', 'styles.css', 'config.js', 'calculo.js', 'api.js', 'app.js', 'admin.js', 'manifest.json', 'icons/icone.svg', 'icons/icone-mascara.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // API e ipify: sempre rede
  // rede primeiro (para receber atualizações), cache se estiver sem internet
  e.respondWith(fetch(e.request).then(function (r) {
    var copia = r.clone();
    caches.open(VERSAO).then(function (c) { c.put(e.request, copia); });
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
  }));
});
