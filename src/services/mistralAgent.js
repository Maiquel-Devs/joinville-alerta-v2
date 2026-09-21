// src/services/mistralAgent.js

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

/**
 * Envia a telemetria para a Mistral AI e obtém o alerta humanizado
 */
export async function generateMistralAlert(riskData, apiKey) {
  if (!apiKey) {
    return {
      titulo: "Monitoramento Ativo em Joinville",
      mensagem_humana: `Chuva acumulada de ${riskData.rain24h.toFixed(1)}mm e maré em ${riskData.tideLevel.toFixed(2)}m. Situação atual em nível ${riskData.nivel}.`
    };
  }

  const systemPrompt = `Você é o Agente de Emergência do 'joinville-alerta-v2'.
Sua função é traduzir dados pluviométricos e de maré em orientações diretas ao cidadão de Joinville.
Regras estritas:
1. Responda em no máximo 3 frases concisas.
2. Seja direto: informe o Risco, a causa (chuva/maré no Rio Cachoeira) e uma ação imediata.
3. Responda estritamente em formato JSON com as chaves "titulo" e "mensagem_humana".`;

  const userPayload = {
    chuva_24h_mm: riskData.rain24h,
    mare_m: riskData.tideLevel,
    nivel_calculado: riskData.nivel
  };

  try {
    const response = await fetch(MISTRAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) throw new Error(`Erro API Mistral: ${response.status}`);

    const result = await response.json();
    const content = JSON.parse(result.choices[0].message.content);
    
    return {
      titulo: content.titulo || "Alerta Hidrológico Joinville",
      mensagem_humana: content.mensagem_humana || "Atenção para as condições de chuva e maré nas áreas baixas."
    };
  } catch (err) {
    console.warn("Retorno de contingência (Mistral indisponível):", err);
    return {
      titulo: `Alerta Nível ${riskData.nivel}`,
      mensagem_humana: `Maré no Rio Cachoeira em ${riskData.tideLevel.toFixed(2)}m com chuva acumulada de ${riskData.rain24h.toFixed(1)}mm. Atenção nas vias baixas do Bucarein e Centro.`
    };
  }
}