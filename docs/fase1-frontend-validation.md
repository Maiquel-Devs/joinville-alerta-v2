# Fase 1: Front-end e validação de UX

## Objetivo
Interface *mobile-first*, lida em menos de 2 s sob emergência, sem login e sem instalar nada.

## Decisões
- JavaScript puro, sem framework; `style.css` próprio.
- **12/10/2026:** a primeira versão (mapa em tela cheia) foi substituída por uma **lista viva "pior primeiro" + busca + GPS**. O mapa foi removido da interface e do cache inicial; o Leaflet ficou só em `teste/camadas.html`, para auditoria.
- O front só ordena e desenha. O risco é decidido pelo back-end (ver `fase3-backend-cache.md`).

## Arquivos

| Arquivo | Função |
| :--- | :--- |
| `index.html` | Estrutura da tela: cartão de nível, indicadores, busca, lista e rodapé com avisos. |
| `style.css` | Estilos e cores dos estados (ativa, inativa, indisponível, dado antigo). |
| `app.js` | Busca o estado na API, monta os cartões por faixa, busca por rua e botão de GPS. |
| `pip.js` | Ponto-em-polígono para o GPS, sem biblioteca geoespacial. |
| `sw.js` | Service Worker: cache primeiro e atualização em segundo plano. |

O antigo `mock-data.json` e a regra de risco por bairro foram removidos na Etapa 4.

## Validação
- Estado ativo simulado em 16/10/2026: o cartão de nível e a ordem "pior primeiro" funcionaram.
- Estado indisponível exibido com estilo tracejado, sem virar "normal".
- Medição de desempenho no celular real (tarefa 3.6): os tempos ainda não foram registrados.
