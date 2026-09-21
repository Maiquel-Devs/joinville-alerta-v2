// app.js - joinville-alerta-v2 (Integrado com a Fase 2)
import { fetchWeatherData } from './src/services/weatherService.js';
import { calculateTideLevel, evaluateRisk } from './src/services/riskEngine.js';
import { generateMistralAlert } from './src/services/mistralAgent.js';

let allBairros = [];

async function initApp() {
  const updateEl = document.getElementById("last-update");
  if (updateEl) updateEl.textContent = "Sincronizando telemetria de Joinville...";

  // 1. Busca dados da Open-Meteo em tempo real
  const weather = await fetchWeatherData();
  
  // 2. Calcula a maré aproximada no Rio Cachoeira / Babitonga
  const tideLevel = calculateTideLevel();

  // 3. Avalia o nível de risco
  const risk = evaluateRisk(weather.rain24h, weather.forecast6h, tideLevel);

  // 4. Obtém diagnóstico (via Mistral AI ou resposta de contingência)
  // Nota: Deixe sem chave por enquanto para usar o modo contingência sem custos
  const mistralResponse = await generateMistralAlert(risk, null);

  // 5. Atualiza o Header
  if (updateEl) {
    updateEl.textContent = `Joinville - SC • ${weather.timestamp}`;
  }

  // 6. Atualiza Card da IA (Mistral)
  const badgeEl = document.getElementById("ai-risk-badge");
  if (badgeEl) {
    badgeEl.textContent = `NÍVEL ${risk.nivel}`;
    badgeEl.className = `badge-risk ${risk.nivel}`;
  }

  const titleEl = document.getElementById("ai-title");
  if (titleEl) titleEl.textContent = mistralResponse.titulo;

  const msgEl = document.getElementById("ai-message");
  if (msgEl) msgEl.textContent = mistralResponse.mensagem_humana;

  // 7. Atualiza Métricas na Tela
  const rainEl = document.getElementById("m-rain");
  if (rainEl) rainEl.textContent = `${weather.rain24h.toFixed(1)} mm`;

  const tideEl = document.getElementById("m-tide");
  if (tideEl) tideEl.textContent = `${tideLevel.toFixed(2)} m`;

  // 8. Carrega bairros (usando a lista do mock-data como base)
  try {
    const res = await fetch("mock-data.json");
    const data = await res.json();
    allBairros = data.bairros;
    renderBairros(allBairros);
  } catch (e) {
    console.warn("Erro ao carregar lista de bairros local:", e);
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
    const card = document.createElement("div");
    card.className = `bairro-card ${b.risco}`;

    const ruasHtml = b.ruas_afetadas.map(rua => `<li>${rua}</li>`).join("");

    card.innerHTML = `
      <div class="bairro-title">
        <span>📍 ${b.nome} (Cota: ${b.cota_m}m)</span>
        <span style="font-size: 0.8rem; opacity: 0.9;">${b.status}</span>
      </div>
      <ul class="ruas-list">
        ${ruasHtml}
      </ul>
    `;

    container.appendChild(card);
  });
}

// Filtro de busca de ruas e bairros
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

// Inicializa a aplicação
initApp();