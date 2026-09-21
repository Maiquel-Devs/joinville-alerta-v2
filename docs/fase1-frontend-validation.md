# 📑 Documentação - Fase 1: Front-End Responsivo & Validação de UX

## 🎯 Objetivo da Fase
Construir e validar a interface visual *mobile-first* do **`joinville-alerta-v2`**, focando na velocidade de carregamento, clareza de leitura sob emergência e acessibilidade para o cidadão sem exigir downloads ou logins.

---

## 🛠️ Decisões de Arquitetura (First Principles)
- **Zero Frameworks JS:** Implementado em JavaScript ES6+ Vanilla para evitar dependências pesadas e garantir execuções rápidas.
- **Estilização Enxuta:** Uso de `style.css` próprio (~2 KB) em vez de frameworks pesados como o Bootstrap, garantindo carregamento instantâneo em redes 3G.
- **Mapeamento Simplificado:** Substituição de mapas interativos e polígonos GeoJSON pesados por uma lista estática e pesquisável de vias e bairros de cota baixa (Bucarein, Centro, Anita Garibaldi, Vila Nova).

---

## 📂 Ficheiros Entregues

| Ficheiro | Função |
| :--- | :--- |
| `index.html` | Interface PWA leve com foco na visualização mobile. |
| `style.css` | Folha de estilos minimalista com variáveis CSS para níveis de risco. |
| `app.js` | Renderização dinâmica do DOM e motor de busca instantânea de ruas. |
| `mock-data.json` | Estrutura de dados que simula a resposta do Mistral AI e telemetria de crise. |

---

## 🧪 Resultados da Validação
1. **Tempo de Resposta:** Carregamento em < 100ms em ambiente local.
2. **UX de Emergência:** Card principal do Agente Mistral AI no topo, destacando ações imediatas (ex: *"Retire veículos de subsolos"*).
3. **Filtro de Ruas:** Pesquisa em tempo real funcionando perfeitamente para vias críticas como a *Avenida Coronel Procópio Gomes* e *Rua Minas Gerais*.

---
*Próximo Passo:* **Fase 2 - Motor de Coleta & Agente de IA (Mistral AI)**.