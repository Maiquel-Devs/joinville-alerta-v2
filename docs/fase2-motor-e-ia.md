# Fase 2: Motor de risco e agente de IA

> A versão inicial desta fase ficava no navegador (`/src/services`, maré sintética). Foi **removida** na Etapa 4. O motor hoje é único e fica no back-end.

## Motor (`backend/`)

| Arquivo | Função |
| :--- | :--- |
| `sources.py` | Chuva de 24 h e 48 h (Open-Meteo, com retentativa) e maré (marégrafo CIRAM/Epagri; previsão MohidSC como estimativa). Sem dado válido devolve `None`. |
| `risk_engine.py` | Avalia as faixas `mare_1_6`, `mare_2_5`, `pluvial_vila_nova` e `pluvial_itaum` como `ativa`, `inativa` ou `indisponivel`, e calcula o nível global (pior faixa ativa). |
| `config.py` | Gatilhos e constantes, todos provisórios (dependem das decisões da Etapa 0). |
| `mistral_client.py` | Escreve o texto do alerta a partir de um nível já calculado; texto fixo de reserva se a IA falhar. |
| `tests/test_motor.py` | Tabela de testes do motor, incluindo "sem dado nunca é normal". |

## Regras
- A IA não reclassifica o nível e só é chamada quando o conjunto de faixas ativas muda.
- Dado ausente vira `indisponivel`, nunca "normal".
- A maré é rotulada como medida ou estimativa (`mare_origem`).
