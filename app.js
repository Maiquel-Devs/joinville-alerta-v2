// app.js - Lista viva "pior primeiro". Só ordena e mostra o que o back-end decidiu:
// o estado de cada faixa e o nível vêm de /api/v1/status-geral. Nenhuma regra de risco aqui.
(() => {
  const API = 'https://joinville-alerta-v2.onrender.com/api/v1/status-geral';
  const CHAVE_SALVO = 'ja2_ultimo_estado';
  const TIMEOUT_API_MS = 60000; // o Render gratuito hiberna; a primeira resposta é lenta
  const LIMITE_RUAS = 60; // ruas desenhadas por cartão antes de "mostrar mais"

  // Ordem = prioridade de exibição entre faixas ativas (pior primeiro). Espelha o backend
  // (config.NIVEL_DA_FAIXA); o front não decide nível. Cada faixa é um grupo da lista.
  const FAIXAS = [
    { id: 'mare_2_5', rotulo: 'Maré de 2,5 m', mancha: 'data/geojson/mare_cachoeira_2_5m.geojson' },
    { id: 'mare_1_6', rotulo: 'Maré de 1,6 m', mancha: 'data/geojson/mare_cachoeira_1_6m.geojson' },
    { id: 'pluvial_vila_nova', rotulo: 'Chuva — Vila Nova', mancha: 'data/geojson/inundacao_vila_nova.geojson' },
    { id: 'pluvial_itaum', rotulo: 'Chuva — Itaum', mancha: 'data/geojson/inundacao_itaum.geojson' },
  ];
  const RUAS_ARQ = 'data/ruas_risco.geojson';
  // Vila Nova: decisão de 08/10/2026 (cenário Atual, 25 anos). Ver CLAUDE.md.
  const filtroDe = (id) => (id === 'pluvial_vila_nova' ? (f) => f.properties.status_1 === 'Atual' && f.properties.tempretor === '25 anos' : undefined);

  const ROTULO_NIVEL = { atencao: 'atenção', indisponivel: 'indisponível' }; // provisório (CLAUDE.md: nomes dos níveis em aberto)
  const TEXTO_ESTADO = {
    ativa: 'Faixa ativa agora: risco de alagar',
    inativa: 'Nenhuma faixa ativa agora',
    indisponivel: 'Sem dado válido: estado indisponível',
  };
  const ORDEM_ESTADO = { ativa: 0, indisponivel: 1, inativa: 2 };

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

  // --- painel do nível ------------------------------------------------------------
  function renderPainel() {
    const d = estado.dados;
    const ok = d && d.status !== 'indisponivel';
    const nivel = ok ? semAcento(d.nivel || 'indisponivel') : 'indisponivel';

    const badge = $('ai-risk-badge');
    badge.textContent = nivel === 'indisponivel' ? 'DADOS INDISPONÍVEIS' : `NÍVEL ${(ROTULO_NIVEL[nivel] || nivel).toUpperCase()}`;
    badge.className = `badge-risk nivel-${nivel}`;
    $('ai-card').className = `ai-card nivel-${nivel}`;

    const texto = d?.texto;
    if (nivel === 'indisponivel') {
      $('ai-title').textContent = 'Dados indisponíveis';
      $('ai-message').textContent = 'Não foi possível obter o estado atual. Isso não significa que não há risco de alagar.';
    } else {
      $('ai-title').textContent = texto?.titulo ?? 'Veja a lista abaixo';
      $('ai-message').textContent = texto?.mensagem ?? 'Áreas fora das manchas também podem alagar.';
    }

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

  // --- lista viva ----------------------------------------------------------------------
  const ruasPorFaixa = {}; // id -> [{nome, chave, m}] em ordem alfabética
  let ruasCarregadas = false;
  let busca = '';
  const aberto = new Map(); // id -> escolha do usuário (aberto/fechado)
  const limite = new Map(); // id -> quantas ruas desenhar

  function indexarRuas(colecao) {
    const mapa = Object.fromEntries(FAIXAS.map((f) => [f.id, new Map()]));
    for (const feat of colecao.features) {
      const { nome, faixas, m } = feat.properties;
      if (!nome) continue;
      for (const id of faixas) mapa[id]?.set(nome, (mapa[id].get(nome) || 0) + m);
    }
    for (const f of FAIXAS) {
      ruasPorFaixa[f.id] = [...mapa[f.id]]
        .map(([nome, m]) => ({ nome, chave: semAcento(nome), m }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    ruasCarregadas = true;
  }

  function criarCartao(f, ruas, total) {
    const e = estadoFaixa(f.id);
    const li = document.createElement('li');
    li.className = `cartao ${e}${e === 'ativa' && dadoAntigo() ? ' antigo' : ''}`;

    const h = document.createElement('h3');
    h.textContent = f.rotulo;
    const est = document.createElement('p');
    est.className = 'estado';
    est.textContent = TEXTO_ESTADO[e];
    li.append(h, est);

    if (!ruasCarregadas) {
      const p = document.createElement('p');
      p.className = 'resumo';
      p.textContent = 'Carregando ruas...';
      li.append(p);
      return li;
    }

    const det = document.createElement('details');
    det.open = busca ? true : aberto.get(f.id) ?? e === 'ativa';
    const sum = document.createElement('summary');
    sum.textContent = busca ? `${ruas.length} de ${total} ruas` : `${total} ruas nesta mancha`;
    const ul = document.createElement('ul');
    ul.className = 'ruas';
    det.append(sum, ul);
    det.addEventListener('toggle', () => {
      if (!busca) aberto.set(f.id, det.open);
    });

    const ate = limite.get(f.id) || LIMITE_RUAS;
    for (const r of ruas.slice(0, ate)) {
      const item = document.createElement('li');
      item.textContent = r.nome;
      ul.append(item);
    }
    if (ruas.length > ate) {
      const mais = document.createElement('button');
      mais.type = 'button';
      mais.className = 'mais';
      mais.textContent = `Mostrar mais (${ruas.length - ate})`;
      mais.addEventListener('click', () => {
        limite.set(f.id, ate + 200);
        renderLista();
      });
      det.append(mais);
    }
    if (!ruas.length) {
      const vazio = document.createElement('p');
      vazio.className = 'resumo';
      vazio.textContent = 'Nenhuma rua encontrada nesta mancha.';
      det.append(vazio);
    }
    li.append(det);
    return li;
  }

  function renderLista() {
    const q = semAcento(busca.trim());
    // Pior primeiro: faixa ativa (pior nível antes), depois indisponível, depois o resto em ordem alfabética.
    const ordem = FAIXAS.map((f, i) => ({ f, i, e: estadoFaixa(f.id) })).sort((a, b) => {
      if (ORDEM_ESTADO[a.e] !== ORDEM_ESTADO[b.e]) return ORDEM_ESTADO[a.e] - ORDEM_ESTADO[b.e];
      return a.e === 'ativa' || a.e === 'indisponivel' ? a.i - b.i : a.f.rotulo.localeCompare(b.f.rotulo, 'pt-BR');
    });

    const cartoes = [];
    for (const { f } of ordem) {
      const todas = ruasPorFaixa[f.id] || [];
      const casaRotulo = q && semAcento(f.rotulo).includes(q);
      const ruas = !q || casaRotulo ? todas : todas.filter((r) => r.chave.includes(q));
      if (q && !casaRotulo && !ruas.length) continue;
      cartoes.push(criarCartao(f, ruas, todas.length));
    }
    $('lista').replaceChildren(...cartoes);
    $('sem-resultado').hidden = cartoes.length > 0;
  }

  // --- localização (ponto-em-polígono sobre as manchas) -------------------------------
  const manchas = {}; // id -> FeatureCollection
  let promessaManchas = null;
  const carregarJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  };
  function carregarManchas() {
    promessaManchas ??= Promise.all(FAIXAS.map((f) => carregarJson(f.mancha))).then((r) => {
      FAIXAS.forEach((f, i) => (manchas[f.id] = r[i]));
    });
    return promessaManchas;
  }

  function mostrarResultado(dentro, precisao) {
    const caixa = $('resultado');
    const p = document.createElement('p');
    const lista = document.createElement('ul');
    if (dentro.length) {
      const ativas = dentro.filter((f) => estadoFaixa(f.id) === 'ativa');
      p.textContent = ativas.length
        ? 'Você está numa mancha com faixa ativa agora: há risco de alagar aqui.'
        : 'Você está dentro de uma mancha de risco, mas nenhuma faixa dela está ativa agora (ou o estado está indisponível). O risco de alagar muda com maré e chuva.';
      for (const f of dentro) {
        const li = document.createElement('li');
        li.textContent = `${f.rotulo}: ${TEXTO_ESTADO[estadoFaixa(f.id)]}`;
        lista.append(li);
      }
    } else {
      p.textContent = 'Você está fora das manchas mapeadas. Isso não significa que não haja risco de alagar.';
    }
    const nota = document.createElement('small');
    nota.textContent = `Precisão do GPS: ±${Math.round(precisao)} m. Perto da borda de uma mancha o resultado é incerto. Este app não substitui a Defesa Civil (199).`;
    caixa.replaceChildren(p, lista, nota);
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
    btn.disabled = true;
    btn.textContent = '⌛ Obtendo localização...';
    const volta = () => {
      btn.disabled = false;
      btn.textContent = '📍 Usar minha localização';
    };
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await carregarManchas();
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;
          const dentro = FAIXAS.filter((f) => PIP.pontoNaColecao(manchas[f.id], lng, lat, filtroDe(f.id)));
          mostrarResultado(dentro, accuracy);
        } catch (e) {
          console.warn('Falha ao carregar as manchas:', e);
          aviso('Não foi possível carregar as manchas para conferir sua posição. Tente de novo com conexão.');
        } finally {
          volta();
        }
      },
      () => {
        volta();
        aviso('Não foi possível obter sua localização. Verifique a permissão de GPS no navegador.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // --- início --------------------------------------------------------------------------
  function renderTudo() {
    renderPainel();
    renderLista();
  }

  $('btn-location').addEventListener('click', usarGps);
  $('busca').addEventListener('input', (e) => {
    busca = e.target.value;
    renderLista();
  });

  (async () => {
    // Cache primeiro: mostra já o último estado salvo, depois atualiza pela rede.
    const salvo = lerSalvo();
    if (salvo) estado = { dados: salvo, origem: 'salvo' };
    renderTudo();

    const ruasP = carregarJson(RUAS_ARQ)
      .then((c) => {
        indexarRuas(c);
        renderLista();
      })
      .catch((e) => {
        console.warn('Falha ao carregar as ruas:', e);
        $('aviso-ruas').hidden = false;
      });

    estado = await buscarEstado();
    renderTudo();
    await ruasP;
    carregarManchas().catch(() => {}); // aquece o cache para o GPS responder rápido

    setInterval(async () => {
      estado = await buscarEstado();
      renderTudo();
    }, 5 * 60 * 1000);
  })();
})();
