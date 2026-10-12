// app.js - Só desenha o que o back-end decidiu. Nenhuma regra de risco aqui:
// o estado de cada faixa e o nível vêm de /api/v1/status-geral.
(() => {
  const API = 'https://joinville-alerta-v2.onrender.com/api/v1/status-geral';
  const CHAVE_SALVO = 'ja2_ultimo_estado';
  const TIMEOUT_API_MS = 60000; // o Render gratuito hiberna; a primeira resposta é lenta

  // Ordem = prioridade de desenho de um trecho que está em mais de uma faixa ativa
  // (pior primeiro). Espelha o backend (config.NIVEL_DA_FAIXA); o front não decide nível.
  const FAIXAS = [
    { id: 'mare_2_5', rotulo: 'Maré de 2,5 m', arq: 'data/geojson/mare_cachoeira_2_5m.geojson', cor: '#e8590c' },
    { id: 'mare_1_6', rotulo: 'Maré de 1,6 m', arq: 'data/geojson/mare_cachoeira_1_6m.geojson', cor: '#e03131' },
    { id: 'pluvial_vila_nova', rotulo: 'Chuva — Vila Nova', arq: 'data/geojson/inundacao_vila_nova.geojson', cor: '#1971c2' },
    { id: 'pluvial_itaum', rotulo: 'Chuva — Itaum', arq: 'data/geojson/inundacao_itaum.geojson', cor: '#0ca678' },
  ];
  const RUAS_ARQ = 'data/ruas_risco.geojson';
  const COR_INATIVA = '#94a3b8';
  const COR_INDISPONIVEL = '#64748b';
  // Vila Nova: decisão de 08/10/2026 (cenário Atual, 25 anos). Ver CLAUDE.md.
  const filtroDe = (id) => (id === 'pluvial_vila_nova' ? (f) => f.properties.status_1 === 'Atual' && f.properties.tempretor === '25 anos' : undefined);

  const ROTULO_NIVEL = { atencao: 'atenção', indisponivel: 'indisponível' }; // provisório (CLAUDE.md: nomes dos níveis em aberto)

  const $ = (id) => document.getElementById(id);
  const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // --- estado vindo da API -------------------------------------------------------
  let estado = { dados: null, origem: 'nenhum' }; // origem: rede | salvo | nenhum

  function lerSalvo() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_SALVO));
    } catch {
      return null;
    }
  }
  function salvar(dados) {
    try {
      localStorage.setItem(CHAVE_SALVO, JSON.stringify(dados));
    } catch {
      /* sem armazenamento: só não guarda */
    }
  }

  async function buscarEstado() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_API_MS);
    try {
      const res = await fetch(API, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const dados = json?.data ?? json;
      if (dados == null || typeof dados !== 'object') throw new Error('Resposta sem dados');
      salvar(dados);
      return { dados, origem: 'rede' };
    } catch (e) {
      console.warn('API indisponível, usando último estado salvo:', e);
      const salvo = lerSalvo();
      return salvo ? { dados: salvo, origem: 'salvo' } : { dados: null, origem: 'nenhum' };
    } finally {
      clearTimeout(t);
    }
  }

  // Dado ausente nunca vira "normal": faixa sem estado = indisponível.
  function estadoFaixa(id) {
    const e = estado.dados?.status === 'indisponivel' ? null : estado.dados?.faixas?.[id];
    return e === 'ativa' || e === 'inativa' ? e : 'indisponivel';
  }
  function idadeMin() {
    const t = Date.parse(estado.dados?.gerado_em);
    return Number.isNaN(t) ? null : (Date.now() - t) / 60000;
  }
  function dadoAntigo() {
    const idade = idadeMin();
    const validade = Number(estado.dados?.validade_min);
    return idade != null && validade > 0 && idade > validade;
  }
  const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // --- painel de texto -----------------------------------------------------------
  function renderPainel() {
    const d = estado.dados;
    const nivel = d && d.status !== 'indisponivel' ? semAcento(d.nivel || 'indisponivel') : 'indisponivel';

    const badge = $('ai-risk-badge');
    badge.textContent = nivel === 'indisponivel' ? 'DADOS INDISPONÍVEIS' : `NÍVEL ${(ROTULO_NIVEL[nivel] || nivel).toUpperCase()}`;
    badge.className = `badge-risk nivel-${nivel}`;
    $('ai-card').className = `ai-card nivel-${nivel}`;

    const texto = d?.texto;
    if (nivel === 'indisponivel') {
      $('ai-title').textContent = 'Dados indisponíveis';
      $('ai-message').textContent = 'Não foi possível obter o estado atual. Isso não significa que não há risco de alagar.';
    } else {
      $('ai-title').textContent = texto?.titulo ?? 'Veja o mapa abaixo';
      $('ai-message').textContent = texto?.mensagem ?? 'Áreas fora das manchas também podem alagar.';
    }

    const ok = d && d.status !== 'indisponivel';
    const chuva = Number(d?.chuva_24h_mm);
    const mare = Number(d?.mare_efetiva_m);
    $('m-rain').textContent = ok && d.chuva_24h_mm != null && !Number.isNaN(chuva) ? `${chuva.toFixed(1)} mm` : '—';
    $('m-tide').textContent = ok && d.mare_efetiva_m != null && !Number.isNaN(mare) ? `${mare.toFixed(2)} m` : '—';
    $('m-tide-label').textContent = d?.mare_origem === 'medida' ? 'Maré (medida)' : 'Maré (estimativa)';

    // Horário sempre visível
    $('last-update').textContent = d?.gerado_em
      ? `Joinville - SC • calculado em ${quando(d.gerado_em)}${estado.origem === 'salvo' ? ' (último estado salvo)' : ''}`
      : 'Joinville - SC • sem dados do servidor';

    const avisos = [];
    if (!d) avisos.push('Sem dados atuais: não foi possível falar com o servidor e não há estado salvo.');
    else if (d.status === 'indisponivel') avisos.push('O servidor não tem dado válido agora. As faixas aparecem como indisponíveis.');
    if (d && estado.origem === 'salvo') avisos.push('Sem conexão com o servidor: mostrando o último estado salvo.');
    if (d && dadoAntigo()) {
      avisos.push(`Dado antigo: calculado há ${Math.round(idadeMin())} min (validade ${d.validade_min} min). O risco pode ter mudado.`);
    }
    const aviso = $('aviso-estado');
    aviso.hidden = avisos.length === 0;
    aviso.textContent = avisos.join(' ');
  }

  // --- mapa ------------------------------------------------------------------------
  const map = L.map('map', { preferCanvas: true }).setView([-26.3045, -48.8456], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  map.attributionControl.addAttribution(
    'Manchas: PDDU Joinville (2011) · Ruas: © colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL)'
  );
  map.createPane('manchas').style.zIndex = 400;
  map.createPane('ruas').style.zIndex = 450;
  const rendManchas = L.canvas({ pane: 'manchas' });
  const rendRuas = L.canvas({ pane: 'ruas', tolerance: 8 });

  const dados = {}; // id -> FeatureCollection
  const manchas = {}; // id -> L.GeoJSON
  let ruas = null;
  let ruasLayer = null;
  let ponto = null;

  // 4 estados: ativa (cor da faixa) · inativa (neutra) · indisponível (tracejado) · dado antigo (esmaecido)
  function estiloFaixa(id, cor, rua) {
    const e = estadoFaixa(id);
    const esmaecer = dadoAntigo() ? 0.55 : 1;
    if (e === 'ativa') return { color: cor, weight: rua ? 4 : 1, opacity: esmaecer, fillColor: cor, fillOpacity: 0.35 * esmaecer };
    if (e === 'inativa') return { color: COR_INATIVA, weight: rua ? 2 : 1, opacity: 0.6, fillColor: COR_INATIVA, fillOpacity: 0.08 };
    return { color: COR_INDISPONIVEL, weight: rua ? 2 : 1, opacity: 0.7, dashArray: '4 6', fillColor: COR_INDISPONIVEL, fillOpacity: 0.05 };
  }
  function estiloRua(f) {
    const fx = f.properties.faixas;
    const ativa = FAIXAS.find((x) => fx.includes(x.id) && estadoFaixa(x.id) === 'ativa');
    if (ativa) return estiloFaixa(ativa.id, ativa.cor, true);
    const indisp = FAIXAS.find((x) => fx.includes(x.id) && estadoFaixa(x.id) === 'indisponivel');
    if (indisp) return estiloFaixa(indisp.id, indisp.cor, true);
    return estiloFaixa(fx[0], COR_INATIVA, true);
  }

  function atualizarMapa() {
    for (const f of FAIXAS) manchas[f.id]?.setStyle(estiloFaixa(f.id, f.cor, false));
    ruasLayer?.setStyle(estiloRua);
  }

  function desenharDados() {
    for (const f of FAIXAS) {
      manchas[f.id] = L.geoJSON(dados[f.id], {
        filter: filtroDe(f.id),
        renderer: rendManchas,
        interactive: false,
        style: estiloFaixa(f.id, f.cor, false),
      }).addTo(map);
    }
    ruasLayer = L.geoJSON(ruas, {
      renderer: rendRuas,
      style: estiloRua,
      onEachFeature: (feat, camada) => {
        const p = feat.properties;
        const div = document.createElement('div');
        const nome = document.createElement('strong');
        nome.textContent = p.nome || '(sem nome no OSM)';
        const det = document.createElement('div');
        det.textContent = FAIXAS.filter((x) => p.faixas.includes(x.id))
          .map((x) => `${x.rotulo}: ${estadoFaixa(x.id)}`)
          .join(' · ');
        div.append(nome, det);
        camada.bindPopup(div);
      },
    }).addTo(map);
    map.fitBounds(manchas.mare_2_5.getBounds(), { padding: [20, 20] });
  }

  function renderLegenda() {
    $('legenda-faixas').replaceChildren(
      ...FAIXAS.map((f) => {
        const li = document.createElement('li');
        const cor = document.createElement('span');
        cor.className = 'cor';
        cor.style.background = f.cor;
        li.append(cor, `${f.rotulo} — ${estadoFaixa(f.id)}`);
        return li;
      })
    );
  }

  // --- localização (ponto-em-polígono sobre as manchas) -----------------------------
  function avaliarPonto(latlng, precisao) {
    const dentro = FAIXAS.filter((f) => PIP.pontoNaColecao(dados[f.id], latlng.lng, latlng.lat, filtroDe(f.id)));
    const caixa = $('resultado');
    caixa.replaceChildren();
    const p = document.createElement('p');
    const lista = document.createElement('ul');
    if (dentro.length) {
      const ativas = dentro.filter((f) => estadoFaixa(f.id) === 'ativa');
      p.textContent = ativas.length
        ? 'Você está numa mancha com faixa ativa agora: há risco de alagar aqui.'
        : 'Você está dentro de uma mancha de risco, mas nenhuma faixa dela está ativa agora (ou o estado está indisponível). O risco de alagar muda com maré e chuva.';
      for (const f of dentro) {
        const li = document.createElement('li');
        li.textContent = `${f.rotulo}: ${estadoFaixa(f.id)}`;
        lista.append(li);
      }
    } else {
      p.textContent = 'Você está fora das manchas mapeadas. Isso não significa que não haja risco de alagar.';
    }
    const nota = document.createElement('small');
    nota.textContent = `Precisão do GPS: ±${Math.round(precisao)} m. Perto da borda de uma mancha o resultado é incerto.`;
    caixa.append(p, lista, nota);
    caixa.hidden = false;
  }

  function usarGps() {
    const btn = $('btn-location');
    const caixa = $('resultado');
    const aviso = (txt) => {
      caixa.replaceChildren(txt);
      caixa.hidden = false;
    };
    if (!navigator.geolocation) return aviso('Este navegador não oferece geolocalização.');
    if (!ruas) return aviso('O mapa ainda não carregou os dados de risco. Tente de novo em instantes.');
    btn.disabled = true;
    btn.textContent = '⌛ Obtendo localização...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.disabled = false;
        btn.textContent = '📍 Usar minha localização';
        const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
        if (ponto) map.removeLayer(ponto);
        ponto = L.marker(ll).addTo(map);
        map.setView(ll, 16);
        avaliarPonto(ll, pos.coords.accuracy);
      },
      () => {
        btn.disabled = false;
        btn.textContent = '📍 Usar minha localização';
        aviso('Não foi possível obter sua localização. Verifique a permissão de GPS no navegador.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }
  $('btn-location').addEventListener('click', usarGps);

  // --- início --------------------------------------------------------------------------
  function renderTudo() {
    renderPainel();
    renderLegenda();
    atualizarMapa();
  }

  async function carregarGeo(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }

  (async () => {
    // Cache primeiro: mostra o último estado salvo já, depois atualiza pela rede.
    const salvo = lerSalvo();
    if (salvo) estado = { dados: salvo, origem: 'salvo' };
    renderPainel();
    renderLegenda();

    try {
      const geo = await Promise.all([...FAIXAS.map((f) => carregarGeo(f.arq)), carregarGeo(RUAS_ARQ)]);
      FAIXAS.forEach((f, i) => (dados[f.id] = geo[i]));
      ruas = geo[FAIXAS.length];
      desenharDados();
    } catch (e) {
      console.warn('Falha ao carregar os dados do mapa:', e);
      $('aviso-mapa').hidden = false;
    }

    estado = await buscarEstado();
    renderTudo();
    setInterval(async () => {
      estado = await buscarEstado();
      renderTudo();
    }, 5 * 60 * 1000);
  })();
})();
