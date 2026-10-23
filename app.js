// app.js - Lista viva "pior primeiro". Só ordena e mostra o que o back-end decidiu:
// o estado de cada faixa e o nível vêm de /api/v1/status-geral. Nenhuma regra de risco aqui.
(() => {
  const API = 'https://joinville-alerta-v2.onrender.com/api/v1/status-geral';
  const CHAVE_SALVO = 'ja2_ultimo_estado';
  const TIMEOUT_API_MS = 45000; // por tentativa; o Render gratuito hiberna e a primeira resposta é lenta
  const TENTATIVAS_API = 2; // a 2ª pega o servidor já acordado
  const LIMITE_RUAS = 10; // ruas desenhadas por cartão antes de "mostrar todas"

  // Ordem = prioridade de exibição entre faixas ativas (pior primeiro). Espelha o backend
  // (config.NIVEL_DA_FAIXA); o front não decide nível. Cada faixa é um grupo da lista.
  const FAIXAS = [
    { id: 'mare_2_5', rotulo: 'Maré — Calha Baixa do Cachoeira e Estuário (2,5m)', mancha: 'data/geojson/mare_cachoeira_2_5m.geojson' },
    { id: 'mare_1_6', rotulo: 'Maré — Bacia do Cachoeira / Cotas Intermediárias (1,6m)', mancha: 'data/geojson/mare_cachoeira_1_6m.geojson' },
    { id: 'pluvial_vila_nova', rotulo: 'Chuva — Vila Nova', mancha: 'data/geojson/inundacao_vila_nova.geojson' },
    { id: 'pluvial_itaum', rotulo: 'Chuva — Itaum', mancha: 'data/geojson/inundacao_itaum.geojson' },
  ];
  const RUAS_ARQ = 'data/ruas_risco.geojson';
  // Vila Nova: decisão de 08/10/2026 (cenário Atual, 25 anos). Ver CLAUDE.md.
  const filtroDe = (id) => (id === 'pluvial_vila_nova' ? (f) => f.properties.status_1 === 'Atual' && f.properties.tempretor === '25 anos' : undefined);

  // Rótulo curto do estado da faixa em cada rua (o front só repete o que o back-end decidiu).
  const TAG_RUA_ATIVA = '🔴 Faixa ativa';
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

  // Uma tentativa na API; lança erro se falhar, estourar o tempo ou vier sem objeto.
  async function pedirApi(n) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_API_MS);
    const ini = performance.now();
    try {
      console.log(`[API] tentativa ${n}/${TENTATIVAS_API}: GET ${API}`);
      const res = await fetch(API, { signal: ctrl.signal });
      console.log(`[API] HTTP ${res.status} em ${Math.round(performance.now() - ini)} ms`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      console.log('[API] resposta do back-end:', json);
      const dados = json?.data ?? json;
      if (dados == null || typeof dados !== 'object') throw new Error('Resposta sem dados');
      return dados;
    } finally {
      clearTimeout(t);
    }
  }

  // TODO: REMOVER MOCK DE TESTE (bloco até o fim de buscarEstado e a linha "estado.simulado" nos avisos)
  // Simulação visual de faixa ativa. Só liga com ?simular=<faixa> na URL (ex.: ?simular=mare_2_5
  // ou ?simular=pluvial_itaum); sem o parâmetro o app usa a API normalmente. Não grava nada salvo.
  async function buscarEstado() {
    const id = new URLSearchParams(location.search).get('simular');
    if (!FAIXAS.some((f) => f.id === id)) return buscarEstadoReal();
    // Não espera a API (que pode levar até ~90 s no Render): simula na hora, sem rede.
    const base = lerSalvo() ?? {};
    console.warn(`[MOCK] simulando faixa ativa: ${id}`);
    return {
      origem: 'rede',
      simulado: true,
      dados: {
        ...base,
        status: 'ok',
        gerado_em: new Date().toISOString(),
        validade_min: 30,
        faixas: { mare_1_6: 'inativa', mare_2_5: 'inativa', pluvial_vila_nova: 'inativa', pluvial_itaum: 'inativa', [id]: 'ativa' },
        nivel: id === 'mare_2_5' ? 'alto' : 'atencao',
        texto: { titulo: 'SIMULAÇÃO DE TESTE', mensagem: 'Estado simulado só para testar a tela. Não é um alerta real.' },
      },
    };
  }

  async function buscarEstadoReal() {
    for (let n = 1; n <= TENTATIVAS_API; n++) {
      try {
        const dados = await pedirApi(n);
        salvar(dados);
        return { dados, origem: 'rede' };
      } catch (e) {
        console.error(`[API] tentativa ${n}/${TENTATIVAS_API} falhou:`, e);
        if (n < TENTATIVAS_API) await new Promise((r) => setTimeout(r, 3000));
      }
    }
    console.error('[API] todas as tentativas falharam; usando último estado salvo, se houver.');
    const salvo = lerSalvo();
    return salvo ? { dados: salvo, origem: 'salvo' } : { dados: null, origem: 'nenhum' };
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
      $('ai-message').textContent = texto?.mensagem ?? 'Áreas fora das regiões mapeadas também podem alagar.';
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
    if (estado.simulado) avisos.push('SIMULAÇÃO DE TESTE: este estado não é real.'); // TODO: REMOVER MOCK DE TESTE
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
  let ruasFalhou = false;
  let busca = '';
  const aberto = new Map(); // id -> escolha do usuário (aberto/fechado)
  const expandidas = new Set(); // ids de faixa em que o usuário pediu a lista completa

  const ruasIdx = new Map(); // nome -> { nome, chave, faixas:Set, pts:[[lng,lat]] }

  function indexarRuas(colecao) {
    const mapa = Object.fromEntries(FAIXAS.map((f) => [f.id, new Map()]));
    for (const feat of colecao.features) {
      const { nome, faixas, m } = feat.properties;
      if (!nome) continue;
      const g = feat.geometry;
      const linhas = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
      const rua = ruasIdx.get(nome) ?? { nome, chave: semAcento(nome), faixas: new Set(), pts: [] };
      for (const id of faixas) rua.faixas.add(id);
      for (const l of linhas) rua.pts.push(...l);
      ruasIdx.set(nome, rua);
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
      p.textContent = ruasFalhou ? 'Lista de ruas indisponível agora. O estado desta faixa continua valendo.' : 'Carregando ruas...';
      li.append(p);
      return li;
    }

    const det = document.createElement('details');
    det.open = busca ? true : aberto.get(f.id) ?? e === 'ativa';
    const sum = document.createElement('summary');
    const parcial = !busca && !expandidas.has(f.id) && ruas.length > LIMITE_RUAS;
    sum.textContent = busca
      ? `${ruas.length} de ${total} ruas`
      : parcial
        ? `${LIMITE_RUAS} ruas com maior trecho dentro da área mapeada (de ${total})`
        : `${total} ruas nesta área, das de maior trecho para as de menor`;
    const ul = document.createElement('ul');
    ul.className = 'ruas';
    det.append(sum, ul);
    det.addEventListener('toggle', () => {
      if (!busca) aberto.set(f.id, det.open);
    });

    // Com busca ativa o resultado já é curto e filtrado: mostra tudo.
    const ate = busca || expandidas.has(f.id) ? ruas.length : LIMITE_RUAS;
    // Sem busca: ordena pelo comprimento do trecho dentro da área mapeada (único dado por rua; não é severidade).
    const ordenadas = busca ? ruas : [...ruas].sort((a, b) => b.m - a.m);
    for (const r of ordenadas.slice(0, ate)) {
      const item = document.createElement('li');
      const nome = document.createElement('span');
      nome.className = 'nome-rua';
      nome.textContent = r.nome;
      item.append(nome);
      if (e === 'ativa') {
        // Só a faixa ativa marca a rua; o estado das demais já está no cabeçalho do cartão.
        const tag = document.createElement('span');
        tag.className = 'tag ativa';
        tag.textContent = TAG_RUA_ATIVA;
        item.append(tag);
      }
      ul.append(item);
    }
    if (ruas.length > ate) {
      const mais = document.createElement('button');
      mais.type = 'button';
      mais.className = 'mais';
      mais.textContent = `Mostrar todas as ${ruas.length} ruas desta área`;
      mais.addEventListener('click', () => {
        expandidas.add(f.id);
        renderLista();
      });
      det.append(mais);
    }
    if (!ruas.length) {
      const vazio = document.createElement('p');
      vazio.className = 'resumo';
      vazio.textContent = 'Nenhuma rua encontrada nesta área.';
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

  // --- diagnóstico por endereço + entorno (~300 m) ---------------------------------------
  // Só usa o que o projeto sabe: ruas dentro das áreas mapeadas e o estado das faixas vindo do
  // back-end. Não há cota nem severidade por rua, então não existe "segura", "atenção" nem rota.
  const RAIO_ENTORNO_M = 300;
  const MAX_ENTORNO = 4;
  const distM = (a, b) => {
    const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180) * 111320;
    const dy = (b[1] - a[1]) * 110540;
    return Math.hypot(dx, dy);
  };
  const amostrar = (pts) => (pts.length > 400 ? pts.filter((_, i) => i % Math.ceil(pts.length / 400) === 0) : pts);
  const distMin = (A, B) => {
    let m = Infinity;
    for (const a of A) for (const b of B) m = Math.min(m, distM(a, b));
    return m;
  };
  function estadoDaRua(r) {
    const es = [...r.faixas].map(estadoFaixa);
    return es.includes('ativa') ? 'ativa' : es.includes('indisponivel') ? 'indisponivel' : 'inativa';
  }
  const ICONE_RUA = { ativa: '🔴', inativa: '⚪', indisponivel: '⚪' };
  const TEXTO_RUA = { ativa: 'faixa ativa agora', inativa: 'nenhuma faixa ativa agora', indisponivel: 'estado indisponível' };

  function vizinhas(pts, excluir) {
    const ref = amostrar(pts);
    const out = [];
    for (const r of ruasIdx.values()) {
      if (r.nome === excluir) continue;
      const d = distMin(ref, amostrar(r.pts));
      if (d <= RAIO_ENTORNO_M) out.push({ r, d });
    }
    // Faixa ativa primeiro, depois a mais próxima
    out.sort((a, b) => (estadoDaRua(b.r) === 'ativa') - (estadoDaRua(a.r) === 'ativa') || a.d - b.d);
    return out.slice(0, MAX_ENTORNO);
  }

  function blocoEntorno(pts, excluir) {
    const viz = vizinhas(pts, excluir);
    const sec = document.createElement('div');
    sec.className = 'entorno';
    const h = document.createElement('h4');
    h.textContent = `🧭 Ruas mapeadas ao redor (até ~${RAIO_ENTORNO_M} m)`;
    sec.append(h);
    if (!viz.length) {
      const p = document.createElement('p');
      p.className = 'resumo';
      p.textContent = 'Nenhuma outra rua das áreas mapeadas neste raio. Isso não significa que não haja risco de alagar.';
      sec.append(p);
      return sec;
    }
    const ul = document.createElement('ul');
    for (const { r, d } of viz) {
      const e = estadoDaRua(r);
      const li = document.createElement('li');
      li.textContent = `${ICONE_RUA[e]} ${r.nome} (a ~${Math.max(10, Math.round(d / 10) * 10)} m): ${TEXTO_RUA[e]}`;
      ul.append(li);
    }
    const nota = document.createElement('small');
    nota.textContent = 'Só aparecem ruas dentro das áreas mapeadas pelo PDDU. As demais não foram avaliadas.';
    sec.append(ul, nota);
    return sec;
  }

  function rodapeEmergencia() {
    const p = document.createElement('p');
    p.className = 'emergencia';
    p.innerHTML = '📞 <strong>Defesa Civil 199</strong> | <strong>Bombeiros 193</strong>. Fora das áreas mapeadas também pode alagar. Este app não substitui a Defesa Civil.';
    return p;
  }

  function achar(q) {
    const n = semAcento(q.trim());
    if (n.length < 3) return [];
    const pontos = (r) => (r.chave === n ? 0 : r.chave.startsWith(n) ? 1 : 2);
    return [...ruasIdx.values()]
      .filter((r) => r.chave.includes(n))
      .sort((a, b) => pontos(a) - pontos(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  function mostrarDiagnostico(texto) {
    const caixa = $('resultado');
    if (texto.trim().length < 3) {
      caixa.hidden = true;
      return;
    }
    const achadas = achar(texto);
    const card = document.createElement('div');
    card.className = 'diagnostico';
    if (!ruasCarregadas) {
      card.textContent = ruasFalhou ? 'Lista de ruas indisponível agora.' : 'Carregando ruas...';
    } else if (!achadas.length) {
      const p = document.createElement('p');
      p.textContent = 'Não encontrei essa rua nas áreas mapeadas pelo PDDU. Isso não significa que não haja risco de alagar: fora das áreas mapeadas também pode alagar.';
      card.append(p, rodapeEmergencia());
    } else {
      const r = achadas[0];
      const e = estadoDaRua(r);
      const h = document.createElement('h3');
      h.textContent = `🏠 Diagnóstico para: ${r.nome}`;
      const sit = document.createElement('p');
      sit.className = `situacao ${e}`;
      const ativas = FAIXAS.filter((f) => r.faixas.has(f.id) && estadoFaixa(f.id) === 'ativa');
      sit.textContent =
        e === 'ativa'
          ? `🔴 Situação: FAIXA ATIVA AGORA (${ativas.map((f) => f.rotulo).join('; ')})`
          : e === 'indisponivel'
            ? '⚪ Situação: estado indisponível. Isso não significa que não haja risco de alagar.'
            : '⚪ Situação: nenhuma faixa ativa agora para esta via';
      const sig = document.createElement('p');
      sig.textContent =
        e === 'ativa'
          ? 'Esta via tem trechos dentro da área mapeada e há risco de alagar agora. Se você mora em andar térreo, tem comércio ao nível da rua ou garagem em subsolo, previna-se e acompanhe a Defesa Civil (199).'
          : 'Esta via tem trechos dentro de área mapeada pelo PDDU, mas nenhuma faixa dela está ativa agora. O risco de alagar muda com a maré e a chuva.';
      card.append(h, sit, sig, blocoEntorno(r.pts, r.nome));
      if (achadas.length > 1) {
        const outras = document.createElement('small');
        outras.textContent = `Outras ruas com esse nome: ${achadas.slice(1, 6).map((x) => x.nome).join('; ')}${achadas.length > 6 ? '…' : ''}`;
        card.append(outras);
      }
      card.append(rodapeEmergencia());
    }
    caixa.replaceChildren(card);
    caixa.hidden = false;
  }

  function mostrarResultado(dentro, precisao, pos) {
    const caixa = $('resultado');
    const p = document.createElement('p');
    const lista = document.createElement('ul');
    if (dentro.length) {
      const ativas = dentro.filter((f) => estadoFaixa(f.id) === 'ativa');
      p.textContent = ativas.length
        ? 'Você está numa área mapeada com faixa ativa agora: há risco de alagar aqui.'
        : 'Você está dentro de uma região mapeada de risco, mas nenhuma faixa dela está ativa agora (ou o estado está indisponível). O risco de alagar muda com maré e chuva.';
      for (const f of dentro) {
        const li = document.createElement('li');
        li.textContent = `${f.rotulo}: ${TEXTO_ESTADO[estadoFaixa(f.id)]}`;
        lista.append(li);
      }
    } else {
      p.textContent = 'Você está fora das áreas mapeadas. Isso não significa que não haja risco de alagar.';
    }
    const nota = document.createElement('small');
    nota.textContent = `Precisão do GPS: ±${Math.round(precisao)} m. Perto da borda de uma área mapeada o resultado é incerto. Este app não substitui a Defesa Civil (199).`;
    caixa.replaceChildren(p, lista, ...(pos ? [blocoEntorno([pos], null)] : []), nota, rodapeEmergencia());
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
          mostrarResultado(dentro, accuracy, [lng, lat]);
        } catch (e) {
          console.warn('Falha ao carregar as manchas:', e);
          aviso('Não foi possível carregar as áreas mapeadas para conferir sua posição. Tente de novo com conexão.');
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
    mostrarDiagnostico(busca);
  });

  (async () => {
    // Cache primeiro: mostra já o último estado salvo, depois atualiza pela rede.
    const salvo = lerSalvo();
    if (salvo) estado = { dados: salvo, origem: 'salvo' };
    renderTudo();

    // Ruas: até 3 tentativas (cache do Service Worker primeiro); só avisa se todas falharem.
    const carregarRuas = async () => {
      for (let i = 0; i < 3 && !ruasCarregadas; i++) {
        try {
          indexarRuas(await carregarJson(RUAS_ARQ));
          ruasFalhou = false;
          $('aviso-ruas').hidden = true;
        } catch (e) {
          console.warn(`Falha ao carregar as ruas (tentativa ${i + 1}/3):`, e);
          if (i < 2) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
      if (!ruasCarregadas) {
        ruasFalhou = true;
        $('aviso-ruas').hidden = false;
      }
      renderLista();
    };
    const ruasP = carregarRuas();
    window.addEventListener('online', () => {
      if (!ruasCarregadas) carregarRuas();
    });

    estado = await buscarEstado();
    renderTudo();
    await ruasP;
    if (busca) mostrarDiagnostico(busca);
    carregarManchas().catch(() => {}); // aquece o cache para o GPS responder rápido

    setInterval(async () => {
      estado = await buscarEstado();
      renderTudo();
    }, 5 * 60 * 1000);
  })();
})();
