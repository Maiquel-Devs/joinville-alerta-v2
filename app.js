// app.js - Integração com a API FastAPI, Risco Dinâmico por Bairro e Geolocalização GPS

let allBairros = [];
let currentMare = 0;
let currentChuva = 0;
let dadosDisponiveis = false;

// Coordenadas centrais aproximadas dos bairros em Joinville para cálculo geográfico de proximidade
const COORDENADAS_BAIRROS = {
  "Bucarein": { lat: -26.3150, lon: -48.8420 },
  "Centro": { lat: -26.3045, lon: -48.8456 },
  "Boa Vista": { lat: -26.2980, lon: -48.8280 },
  "Fátima": { lat: -26.3300, lon: -48.8320 },
  "Guanabara": { lat: -26.3210, lon: -48.8290 },
  "Comasa": { lat: -26.2850, lon: -48.8150 },
  "Aventureiro": { lat: -26.2580, lon: -48.8120 },
  "Vila Nova": { lat: -26.2880, lon: -48.9050 },
  "Anita Garibaldi": { lat: -26.3180, lon: -48.8550 },
  "Jardim Sofia": { lat: -26.2420, lon: -48.8350 }
};

// Fórmula de Haversine para calcular distância real em quilômetros
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Contingência: todas as chaves do contrato /api/v1/status-geral.
// status "indisponivel" => nunca é exibido como "normal".
const DADOS_CONTINGENCIA = {
  status: "indisponivel",
  gerado_em: null,
  validade_min: 0,
  mare_efetiva_m: 0.0,
  chuva_24h_mm: 0.0,
  faixas: {},
  nivel: "INDISPONÍVEL",
  texto: {
    titulo: "Dados indisponíveis",
    mensagem: "Não foi possível obter o estado atual. Isso não significa que não há risco de alagar. Em emergência, ligue 199 (Defesa Civil)."
  }
};

async function initApp() {
  const updateEl = document.getElementById("last-update");
  if (updateEl) updateEl.textContent = "Sincronizando com o servidor de Joinville...";

  let data = DADOS_CONTINGENCIA;
  let online = false;

  try {
    // 1. Consome o endpoint da API Python (In-Memory Cache < 5ms)
    const response = await fetch("https://joinville-alerta-v2.onrender.com/api/v1/status-geral");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response?.json();
    const payload = result?.data ?? result;
    if (payload == null || typeof payload !== "object") throw new Error("Resposta sem dados");
    data = { ...DADOS_CONTINGENCIA, ...payload };
    online = data.status !== "indisponivel";
  } catch (err) {
    console.warn("Falha ao conectar na API Python (usando modo contingência):", err);
    data = DADOS_CONTINGENCIA;
  }

  // Guarda as métricas globais para o cálculo dinâmico nos cartões dos bairros
  currentChuva = Number(data?.chuva_24h_mm) || 0;
  currentMare = Number(data?.mare_efetiva_m ?? data?.mare_babitonga_m) || 0;
  dadosDisponiveis = online;

  // 2. Atualiza o Header com o timestamp do servidor
  if (updateEl) {
    const quando = data?.gerado_em ?? data?.timestamp;
    updateEl.textContent = online && quando
      ? `Joinville - SC • ${quando}`
      : "Joinville - SC • sem conexão com o servidor";
  }

  // 3. Atualiza Card do Agente Mistral AI e aplica classe CSS
  const badgeEl = document.getElementById("ai-risk-badge");
  if (badgeEl) {
    const rawNivel = data?.nivel || "INDISPONÍVEL";
    const cssClass = String(rawNivel)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .trim();

    badgeEl.textContent = `NÍVEL ${rawNivel}`;
    badgeEl.className = `badge-risk ${cssClass}`;
  }

  const texto = data?.texto ?? data?.alerta_mistral_ai;
  const titleEl = document.getElementById("ai-title");
  if (titleEl) titleEl.textContent = texto?.titulo ?? DADOS_CONTINGENCIA.texto.titulo;

  const msgEl = document.getElementById("ai-message");
  if (msgEl) msgEl.textContent = texto?.mensagem ?? texto?.mensagem_humana ?? DADOS_CONTINGENCIA.texto.mensagem;

  // 4. Atualiza Métricas Globais na Tela ("—" quando indisponível)
  const rainEl = document.getElementById("m-rain");
  if (rainEl) rainEl.textContent = online ? `${currentChuva.toFixed(1)} mm` : "—";

  const tideEl = document.getElementById("m-tide");
  if (tideEl) tideEl.textContent = online ? `${currentMare.toFixed(2)} m` : "—";

  // 5. Carrega a lista de bairros local e renderiza dinamicamente
  try {
    const res = await fetch("mock-data.json");
    const data = await res.json();
    allBairros = data.bairros;
    renderBairros(allBairros);
  } catch (e) {
    console.warn("Erro ao carregar lista de bairros:", e);
  }
}

function renderBairros(bairros) {
  const container = document.getElementById("bairros-container");
  if (!container) return;
  
  container.innerHTML = "";

  if (bairros.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 20px; color: #94a3b8;">Nenhuma rua ou bairro encontrado.</div>`;
    return;
  }

  bairros.forEach(b => {
    // 🧠 LÓGICA DINÂMICA DE RISCO (Primeiros Princípios)
    let riscoDinamico = "NORMAL";
    let statusDinamico = "Normal - Sem risco no momento";

    if (!dadosDisponiveis) {
      riscoDinamico = "INDISPONIVEL";
      statusDinamico = "Indisponível - sem dados atuais (também pode alagar fora das manchas)";
    } else if (currentMare >= b.cota_m && currentChuva >= 20) {
      riscoDinamico = "CRITICO";
      statusDinamico = "Crítico - Alagamento Impraticável nas Vias";
    } else if (currentMare >= b.cota_m) {
      riscoDinamico = "ATENCAO";
      statusDinamico = "Atenção - Transbordamento de Galerias / Represamento";
    } else if (currentChuva >= 30) {
      riscoDinamico = "ATENCAO";
      statusDinamico = "Atenção - Acúmulo Pluvial nas Enxurradas";
    }

    const card = document.createElement("div");
    // Injeta a classe em maiúsculas para acionar o border-left correto do style.css
    card.className = `bairro-card ${riscoDinamico}`;

    const ruasHtml = b.ruas_afetadas.map(rua => `<li>${rua}</li>`).join("");

    card.innerHTML = `
      <div class="bairro-title">
        <span>📍 ${b.nome} (Cota: ${b.cota_m}m)</span>
        <span style="font-size: 0.8rem; opacity: 0.9;">${statusDinamico}</span>
      </div>
      <ul class="ruas-list">
        ${ruasHtml}
      </ul>
    `;

    container.appendChild(card);
  });
}

// Filtro de busca rápida de ruas e bairros
const searchInput = document.getElementById("street-search");
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
      renderBairros(allBairros);
      return;
    }

    const filtered = allBairros.filter(b => {
      const matchBairro = b.nome.toLowerCase().includes(query);
      const matchRua = b.ruas_afetadas.some(r => r.toLowerCase().includes(query));
      return matchBairro || matchRua;
    });

    renderBairros(filtered);
  });
}

// Lógica de Geolocalização por GPS
const btnLocation = document.getElementById("btn-location");
if (btnLocation) {
  btnLocation.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocalização não é suportada pelo seu navegador.");
      return;
    }

    btnLocation.textContent = "⌛ Obtendo localização...";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;

        let bairroMaisProximo = null;
        let menorDistancia = Infinity;

        // Itera sobre as coordenadas dos bairros conhecidos
        for (const [bairro, coords] of Object.entries(COORDENADAS_BAIRROS)) {
          const dist = calcularDistanciaKm(userLat, userLon, coords.lat, coords.lon);
          if (dist < menorDistancia) {
            menorDistancia = dist;
            bairroMaisProximo = bairro;
          }
        }

        if (bairroMaisProximo) {
          btnLocation.textContent = `📍 Próximo a: ${bairroMaisProximo} (${menorDistancia.toFixed(1)} km)`;
          
          // Aplica o filtro automaticamente para o bairro identificado
          if (searchInput) {
            searchInput.value = bairroMaisProximo;
            searchInput.dispatchEvent(new Event("input"));
          }
        } else {
          btnLocation.textContent = "📍 Usar minha localização";
          alert("Não foi possível identificar um bairro mapeado próximo.");
        }
      },
      (error) => {
        btnLocation.textContent = "📍 Usar minha localização";
        alert("Não foi possível obter sua localização. Verifique as permissões de GPS no navegador.");
      }
    );
  });
}

initApp();