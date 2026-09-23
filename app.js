// app.js - Integração com a API FastAPI e Risco Dinâmico por Bairro

let allBairros = [];
let currentMare = 0;
let currentChuva = 0;

async function initApp() {
  const updateEl = document.getElementById("last-update");
  if (updateEl) updateEl.textContent = "Sincronizando com o servidor de Joinville...";

  try {
    // 1. Consome o endpoint da API Python (In-Memory Cache < 5ms)
    const response = await fetch("https://joinville-alerta-v2.onrender.com/api/v1/status-geral");
    const result = await response.json();
    const data = result.data;

    // Guarda as métricas globais para o cálculo dinâmico nos cartões dos bairros
    currentChuva = data.chuva_24h_mm || 0;
    currentMare = data.mare_babitonga_m || 0;

    // 2. Atualiza o Header com o timestamp do servidor
    if (updateEl) {
      updateEl.textContent = `Joinville - SC • ${data.timestamp}`;
    }

    // 3. Atualiza Card do Agente Mistral AI e aplica classe CSS
    const badgeEl = document.getElementById("ai-risk-badge");
    if (badgeEl) {
      const rawNivel = data.nivel || "NORMAL";
      const cssClass = rawNivel
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();

      badgeEl.textContent = `NÍVEL ${rawNivel}`;
      badgeEl.className = `badge-risk ${cssClass}`;
    }

    const titleEl = document.getElementById("ai-title");
    if (titleEl) titleEl.textContent = data.alerta_mistral_ai.titulo;

    const msgEl = document.getElementById("ai-message");
    if (msgEl) msgEl.textContent = data.alerta_mistral_ai.mensagem_humana;

    // 4. Atualiza Métricas Globais na Tela
    const rainEl = document.getElementById("m-rain");
    if (rainEl) rainEl.textContent = `${currentChuva.toFixed(1)} mm`;

    const tideEl = document.getElementById("m-tide");
    if (tideEl) tideEl.textContent = `${currentMare.toFixed(2)} m`;

  } catch (err) {
    console.warn("Falha ao conectar na API Python (usando modo contingência):", err);
  }

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

    if (currentMare >= b.cota_m && currentChuva >= 20) {
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

initApp();