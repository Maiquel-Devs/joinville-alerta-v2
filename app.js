// app.js - joinville-alerta-v2

let allBairros = [];

async function loadData() {
  try {
    const res = await fetch("mock-data.json");
    const data = await res.json();

    // 1. Atualiza Header
    document.getElementById("last-update").textContent = `Joinville - SC • ${data.ultima_atualizacao}`;

    // 2. Atualiza Card da IA (Mistral)
    const ai = data.alerta_mistral_ai;
    document.getElementById("ai-risk-badge").textContent = `NÍVEL ${ai.nivel}`;
    document.getElementById("ai-title").textContent = ai.titulo;
    document.getElementById("ai-message").textContent = ai.mensagem_humana;

    // 3. Atualiza Métricas
    document.getElementById("m-rain").textContent = `${data.telemetria.chuva_24h_mm.toFixed(1)} mm`;
    document.getElementById("m-tide").textContent = `${data.telemetria.mare_babitonga_m.toFixed(2)} m`;

    // 4. Renderiza Bairros
    allBairros = data.bairros;
    renderBairros(allBairros);

  } catch (err) {
    console.error("Erro ao carregar dados:", err);
  }
}

function renderBairros(bairros) {
  const container = document.getElementById("bairros-container");
  container.innerHTML = "";

  if (bairros.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 20px; color: #94a3b8;">Nenhuma rua ou bairro encontrado para essa busca.</div>`;
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

// Filtro de busca de ruas e bairros em tempo real
document.getElementById("street-search").addEventListener("input", (e) => {
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

// Inicializa a aplicação
loadData();