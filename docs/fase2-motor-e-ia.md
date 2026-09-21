# 📑 Documentação - Fase 2: Motor de Coleta & Agente de IA (Mistral AI)

## 🎯 Objetivo da Fase
Implementar os serviços autônomos em JavaScript para capturar dados pluviométricos reais de Joinville (Open-Meteo), calcular a carga hídrica considerando a maré e estruturar o conector com a Mistral AI.

---

## 🛠️ Arquitetura dos Serviços (`/src/services`)

| Serviço | Função | Fonte / Algoritmo |
| :--- | :--- | :--- |
| `weatherService.js` | Coleta de chuva acumulada (24h) e previsão (6h). | API Pública Open-Meteo (Lat: -26.3045, Lon: -48.8456). |
| `riskEngine.js` | Cálculo da oscilação da maré astronômica e nível de risco. | Equação Harmônica M2 + Cota topográfica. |
| `mistralAgent.js` | Integração com a LLM para síntese do alerta humanizado. | API Mistral AI (`mistral-small-latest`). |

---

## 🧪 Validação
- **Consumo Real:** O site lê e exibe a chuva real de Joinville direto da API pública sem necessidade de chaves pagas.
- **Resiliência:** Mecanismo de contingência ativo no `mistralAgent.js` caso a API da IA falhe ou atinja o limite de requisições.

---
*Próximo Passo:* **Fase 3 - Back-End Python & In-Memory Cache (Proteção Anti-Pico)**.