// Página de teste 3.0: só desenha e consulta; nenhuma regra de risco aqui.
(() => {
  const $ = (id) => document.getElementById(id);
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const MANCHAS = [
    { id: 'mare_1_6', rotulo: 'Maré de 1,6 m', arq: '../data/geojson/mare_cachoeira_1_6m.geojson', cor: '#e03131' },
    { id: 'mare_2_5', rotulo: 'Maré de 2,5 m', arq: '../data/geojson/mare_cachoeira_2_5m.geojson', cor: '#f08c00' },
    { id: 'pluvial_vila_nova', rotulo: 'Chuva — Vila Nova', arq: '../data/geojson/inundacao_vila_nova.geojson', cor: '#1971c2' },
    { id: 'pluvial_itaum', rotulo: 'Chuva — Itaum (coincide com a maré de 2,5 m)', arq: '../data/geojson/inundacao_itaum.geojson', cor: '#0ca678' },
  ];
  const RUAS_ARQ = '../data/ruas_risco.geojson';
  const ROTULO = Object.fromEntries(MANCHAS.map((m) => [m.id, m.rotulo]));
  const COR_RUA = { mare_1_6: '#c2255c', mare_2_5: '#7048e8', pluvial_vila_nova: '#1864ab', pluvial_itaum: '#087f5b' };
  const PRIORIDADE = ['mare_1_6', 'mare_2_5', 'pluvial_vila_nova', 'pluvial_itaum'];
  const AMOSTRAS = ['Rua Urussanga', 'Rua Inácio Bastos', 'Rua Minas Gerais'];

  // --- mapa --------------------------------------------------------------------
  const map = L.map('map', { preferCanvas: true }).setView([-26.3045, -48.8456], 13);
  map.attributionControl.addAttribution(
    'Manchas: PDDU Joinville (2011) · Ruas: © colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL)'
  );
  const base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  });
  map.createPane('manchas').style.zIndex = 400;
  map.createPane('ruas').style.zIndex = 450;
  map.createPane('destaque').style.zIndex = 480;
  const rendManchas = L.canvas({ pane: 'manchas' });
  const rendRuas = L.canvas({ pane: 'ruas', tolerance: 8 });
  const rendDestaque = L.canvas({ pane: 'destaque' });

  const dados = {}; // id -> FeatureCollection
  const camadas = {}; // id -> L.GeoJSON
  const metricas = [];
  let ruas = null;
  let ruasLayer = null;
  let ponto = null; // {marcador, circulo}
  const destaque = L.layerGroup().addTo(map);

  // --- carga com medição --------------------------------------------------------
  async function gzipKB(texto) {
    try {
      const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
      return ((await new Response(fluxo).blob()).size / 1024).toFixed(0);
    } catch {
      return '—';
    }
  }
  async function carregar(rotulo, url) {
    const t0 = performance.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const texto = await res.text();
    const json = JSON.parse(texto);
    const ms = Math.round(performance.now() - t0);
    metricas.push({ rotulo, kb: (new Blob([texto]).size / 1024).toFixed(0), gz: await gzipKB(texto), ms });
    return json;
  }
  function mostrarMetricas() {
    $('metricas').querySelector('tbody').innerHTML = metricas
      .map((m) => `<tr><td>${m.rotulo}</td><td>${m.kb}</td><td>${m.gz}</td><td>${m.ms}</td></tr>`)
      .join('');
    const tot = metricas.reduce((a, m) => a + (Number(m.gz) || 0), 0);
    $('metricas-extra').textContent = `Total comprimido ≈ ${tot} KB (orçamento do plano: ~1 MB). Vila Nova aparece inteiro (8 polígonos); só o cenário escolhido é desenhado.`;
  }

  // --- manchas --------------------------------------------------------------------
  const filtroVila = (f) => f.properties.status_1 === $('vn-status').value && f.properties.tempretor === $('vn-tr').value;
  const filtroDe = (id) => (id === 'pluvial_vila_nova' ? filtroVila : undefined);

  function desenhar(m) {
    const ligada = camadas[m.id] ? map.hasLayer(camadas[m.id]) : $('ck-' + m.id).checked;
    if (camadas[m.id]) map.removeLayer(camadas[m.id]);
    camadas[m.id] = L.geoJSON(dados[m.id], {
      filter: filtroDe(m.id),
      renderer: rendManchas,
      interactive: false, // o toque no mapa serve para testar o ponto
      style: { color: m.cor, weight: 1, fillColor: m.cor, fillOpacity: 0.3 },
    });
    if (ligada) camadas[m.id].addTo(map);
  }

  function montarControles() {
    $('lista-camadas').innerHTML = MANCHAS.map(
      (m) => `<label><input type="checkbox" id="ck-${m.id}" checked /><span class="cor" style="background:${m.cor}"></span>${m.rotulo}</label>`
    ).join('');
    for (const m of MANCHAS) $('ck-' + m.id).addEventListener('change', (e) => (e.target.checked ? camadas[m.id].addTo(map) : map.removeLayer(camadas[m.id])));
    $('ck-ruas').addEventListener('change', (e) => ruasLayer && (e.target.checked ? ruasLayer.addTo(map) : map.removeLayer(ruasLayer)));
    $('ck-base').addEventListener('change', (e) => (e.target.checked ? base.addTo(map).bringToBack() : map.removeLayer(base)));
    for (const id of ['vn-status', 'vn-tr'])
      $(id).addEventListener('change', () => {
        desenhar(MANCHAS[2]);
        if (ponto) avaliar(ponto.marcador.getLatLng());
      });
    $('amostras').innerHTML = AMOSTRAS.map((n) => `<button data-rua="${n}">${n}</button>`).join('');
    $('amostras').addEventListener('click', (e) => e.target.dataset.rua && ruaAmostra(e.target.dataset.rua));
    $('btn-gps').addEventListener('click', usarGps);
    $('btn-limpar').addEventListener('click', limparPonto);
  }

  // --- ruas -----------------------------------------------------------------------
  const faixaPrincipal = (f) => PRIORIDADE.find((x) => f.properties.faixas.includes(x));
  function desenharRuas() {
    ruasLayer = L.geoJSON(ruas, {
      renderer: rendRuas,
      style: (f) => ({ color: COR_RUA[faixaPrincipal(f)], weight: 3, opacity: 0.9 }),
      onEachFeature: (f, camada) => {
        const p = f.properties;
        camada.bindPopup(
          `<strong>${p.nome || '(sem nome no OSM)'}</strong><br>${p.faixas.map((x) => ROTULO[x]).join(' + ')}<br>${p.m} m neste trecho · OSM way ${p.osm}`
        );
      },
    });
    if ($('ck-ruas').checked) ruasLayer.addTo(map);
    const km = ruas.features.reduce((a, f) => a + f.properties.m, 0) / 1000;
    $('ruas-info').textContent = `${ruas.features.length} trechos, ${km.toFixed(0)} km`;
  }

  function ruaAmostra(nome) {
    destaque.clearLayers();
    const achados = ruas.features.filter((f) => norm(f.properties.nome) === norm(nome));
    const info = $('amostra-info');
    if (!achados.length) {
      info.innerHTML = `<span class="aviso">${nome}: nenhum trecho nas manchas.</span> A rua existe no OSM, mas fica a mais de 1,5 km das manchas usadas. Fora da mancha não significa seguro.`;
      return;
    }
    const camada = L.geoJSON(achados, { renderer: rendDestaque, style: { color: '#ffd43b', weight: 8, opacity: 0.9 }, interactive: false }).addTo(destaque);
    L.geoJSON(achados, { renderer: rendDestaque, style: { color: '#212529', weight: 3 }, interactive: false }).addTo(destaque);
    map.fitBounds(camada.getBounds(), { maxZoom: 17, padding: [30, 30] });
    const faixas = [...new Set(achados.flatMap((f) => f.properties.faixas))];
    const metros = achados.reduce((a, f) => a + f.properties.m, 0);
    info.textContent = `${nome}: ${achados.length} trecho(s), ${metros} m em risco; ${faixas.map((x) => ROTULO[x]).join(' + ')}.`;
  }

  // --- ponto-em-polígono -----------------------------------------------------------
  function avaliar(latlng) {
    const t0 = performance.now();
    const dentro = MANCHAS.filter((m) => PIP.pontoNaColecao(dados[m.id], latlng.lng, latlng.lat, filtroDe(m.id)));
    const ms = (performance.now() - t0).toFixed(2);
    const caixa = $('resultado');
    caixa.className = '';
    const coord = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    if (dentro.length) {
      caixa.innerHTML = `<strong>Dentro de ${dentro.length} mancha(s) — risco de alagar quando a faixa estiver ativa:</strong><ul>${dentro
        .map((m) => `<li>${m.rotulo}</li>`)
        .join('')}</ul><div class="nota">${coord} · consulta em ${ms} ms</div>`;
    } else {
      caixa.innerHTML = `<strong>Fora de todas as manchas.</strong> Isso <span class="aviso">não significa</span> que não haja risco de alagar.<div class="nota">${coord} · consulta em ${ms} ms</div>`;
    }
  }
  function definirPonto(latlng, precisao) {
    limparPonto(true);
    ponto = { marcador: L.marker(latlng).addTo(map), circulo: precisao ? L.circle(latlng, { radius: precisao, weight: 1, interactive: false }).addTo(map) : null };
    avaliar(latlng);
  }
  function limparPonto(manter) {
    if (ponto) {
      map.removeLayer(ponto.marcador);
      if (ponto.circulo) map.removeLayer(ponto.circulo);
      ponto = null;
    }
    if (manter !== true) {
      $('resultado').className = 'vazio';
      $('resultado').textContent = 'Nenhum ponto escolhido.';
    }
  }
  function usarGps() {
    if (!navigator.geolocation) return ($('resultado').textContent = 'Este navegador não oferece geolocalização.');
    $('resultado').textContent = 'Obtendo localização…';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const ll = L.latLng(p.coords.latitude, p.coords.longitude);
        definirPonto(ll, p.coords.accuracy);
        map.setView(ll, 16);
        $('resultado').insertAdjacentHTML('beforeend', `<div class="nota">Precisão do GPS: ±${Math.round(p.coords.accuracy)} m. Perto da borda de uma mancha o resultado é incerto.</div>`);
      },
      (e) => {
        $('resultado').className = '';
        $('resultado').textContent = `Sem localização (${e.message}). Toque no mapa para testar um ponto.`;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }
  map.on('click', (e) => definirPonto(e.latlng, 0));

  // --- início -----------------------------------------------------------------------
  if (window.innerWidth <= 640) $('painel').removeAttribute('open'); // celular: mapa livre, painel recolhido
  montarControles();
  (async () => {
    try {
      for (const m of MANCHAS) dados[m.id] = await carregar(m.arq.split('/').pop(), m.arq);
      MANCHAS.forEach(desenhar);
      map.fitBounds(camadas.mare_2_5.getBounds(), { padding: [20, 20] });
      ruas = await carregar('ruas_risco.geojson', RUAS_ARQ);
      desenharRuas();
      mostrarMetricas();
    } catch (e) {
      $('ruas-info').textContent = 'erro';
      $('metricas-extra').textContent = `Falha ao carregar: ${e.message}. Abra por um servidor (python -m http.server), não por file://.`;
    }
  })();
})();
