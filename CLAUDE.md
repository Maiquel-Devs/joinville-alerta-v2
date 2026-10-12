# CLAUDE.md — Joinville Alerta v2

Projeto acadêmico e comunitário (Univille). Fonte do planejamento: documento "Joinville Alerta v2 — Arquitetura e Planejamento" (06/10/2026). Este arquivo resume o que vale para todo o trabalho; o passo a passo está em `task.md`.

## O que o projeto é

Mapa de **risco de alagamento por rua** em Joinville/SC, gratuito e funcional offline. Mostra ao cidadão onde a água pode subir com a maré e a chuva atuais.

- **Dentro do escopo:** risco por trecho de rua, derivado das manchas oficiais do PDDU; localização por GPS; texto de alerta gerado por IA a partir de um nível já calculado; custo de infraestrutura R$ 0,00.
- **Fora do escopo (futuro):** alagamento *confirmado*. O sistema não observa nada na rua; ele **infere** risco a partir de maré e chuva.

## Regra de linguagem (vale para interface, README e textos da IA)

- Dizer **"risco de alagar"**.
- Nunca "rua alagada" / "alagado".
- Nunca "sem risco" nem "cidade segura" para áreas fora das manchas: fora da mancha **não** significa seguro.
- Dado indisponível **nunca** aparece como "normal".

## Regra de UX (inviolável, decidida em 12/10/2026)

**Interface orientada a lista viva ordenada por prioridade (Pior Primeiro) + busca rápida. O mapa interativo em tela cheia está removido da tela principal; foi apagado da interface e do cache inicial.** Motivo: sob tempestade, polígonos e zoom pesam na leitura; a tela precisa ser lida em menos de 2 s.

Ordenação dinâmica da lista (o front só ordena, não decide risco):
1. No topo, em cartão de destaque (vermelho/laranja) com as ruas afetadas, ficam os bairros/áreas com ao menos um trecho em faixa `ativa` segundo `/api/v1/status-geral`. Entre eles, vem primeiro quem tem a faixa de pior nível, na mesma ordem do motor do back-end.
2. Depois, os que só têm faixa `indisponivel` (cartão neutro com aviso; nunca "normal").
3. Por fim, os demais em ordem alfabética, com estado neutro: **"Nenhuma faixa ativa agora"**. Não usar "sem risco": fora de faixa ativa ou de mancha continua podendo alagar.
4. Busca por rua/bairro e botão de GPS (ponto-em-polígono com `pip.js`) respondem em texto claro: dentro de qual mancha, qual faixa está ativa agora, mais "Fora das manchas também pode alagar" e "Este app não substitui a Defesa Civil (199)".

## Princípios (empate → vence a opção que apaga mais código)

1. **Custo zero.** GitHub Pages (PWA e dados estáticos), Render gratuito (API), camada gratuita do Mistral. Nada pago.
2. **Uma fonte de verdade.** O back-end é o único lugar que decide o nível de risco. O front só desenha.
3. **Offline-first.** Tudo no front falha com graça: mostra o último estado e o horário dele.
4. **Apagar antes de adicionar.** Questionar o requisito, apagar, simplificar; só depois acelerar e automatizar.
5. **Sem precisão inventada.** Estimativa não aparece como medida.

## O que NÃO fazer

- Nada pago (infra, APIs, tiles, serviços).
- Nenhuma regra de risco no front (nem por bairro, nem por cota).
- Nenhum "normal" quando não há dado válido: o estado é `indisponivel`.
- Nenhuma chave de API no navegador. Chaves só no back-end.
- A IA não reclassifica o nível; só escreve texto de um resultado já decidido.
- Não tratar a maré sintética atual como medida. Ela é estimativa e deve ser rotulada como tal (ou substituída, conforme a Etapa 0).
- Não rodar o pipeline de ruas em tempo de execução; ele é offline, no computador do autor.
- Não colocar no caminho servido ao app os arquivos brutos do PDDU nem GeoJSON com mais de 5 casas decimais ou atributos sem uso.
- Não importar biblioteca geoespacial no front só para ponto-em-polígono.
- Não copiar código do repositório joinville_meteo (sem licença declarada). Dados dele só com atribuição e depois de conferir os termos (ver Doc 2).

## Arquitetura-alvo

- **Back-end (FastAPI no Render):** scheduler a cada 15 min coleta chuva (24 h e 48 h) e vento na Open-Meteo, obtém a maré pela fonte definida na Etapa 0, calcula a maré efetiva e avalia as **faixas de gatilho**: `mare_1_6`, `mare_2_5` e as pluviais (Vila Nova, Itaum). Cada faixa fica `ativa`, `inativa` ou `indisponivel`. O nível global é a **pior faixa ativa**. Cache em RAM guarda o resultado com `gerado_em`.
- **IA (Mistral):** recebe faixas ativas e nível já calculado. Só é chamada quando o conjunto de faixas ativas muda; senão reaproveita o texto anterior. Se falhar, texto determinístico de reserva. Para o nível normal, texto neutro (nenhuma faixa ativa agora; áreas fora das manchas também podem alagar).
- **Pipeline offline (computador do autor):** shapefiles do PDDU (SIRGAS 2000, UTM 22S → WGS84) × ruas do OpenStreetMap (Overpass) → GeoJSON estático em que cada trecho carrega sua faixa de gatilho. Script e arquivo gerado versionados no repo.
- **Front (PWA no GitHub Pages):** lista viva ordenada "pior primeiro" (ver Regra de UX), montada com o estado das faixas decidido pelo back-end e o GeoJSON estático de ruas. Service Worker responde cache primeiro e atualiza em segundo plano. GPS testado contra as manchas. Bairro é rótulo de agrupamento; seu estado é derivado das faixas dos seus trechos, sem regra própria por bairro ou cota. Sem mapa na interface (decisão de 12/10/2026); Leaflet só em `teste/camadas.html`.

### Contrato da API — `/api/v1/status-geral` (proposto, a validar na Etapa 1)

| Campo | Conteúdo | Observação |
|---|---|---|
| `status` | `ok` ou `indisponivel` | `indisponivel` quando não há dado válido; nunca vira "normal" |
| `gerado_em` | horário em que o resultado foi calculado | o front mostra sempre |
| `validade_min` | minutos até o dado ser considerado antigo | sugestão: 30 (o dobro do ciclo) |
| `mare_efetiva_m` | maré usada no cálculo | rotulada como estimativa quando não for medida |
| `chuva_24h_mm` | chuva acumulada nas últimas 24 h | Open-Meteo |
| `faixas` | estado de cada faixa: ativa, inativa ou indisponível | `mare_1_6`, `mare_2_5`, pluviais |
| `nivel` | resumo da pior faixa ativa | nomes dos níveis a definir |
| `texto` | título e mensagem para o cidadão | do Mistral, ou texto de reserva |

## Estados visíveis no front

Faixa ativa (cor da faixa) · faixa inativa (neutra) · indisponível · dado antigo (com horário e aviso quando passa da validade).

A tela traz sempre: legenda, atribuição do OpenStreetMap (ODbL) e do PDDU, aviso de que áreas fora das manchas também podem alagar, contato da Defesa Civil (199) e aviso de que o app não substitui a Defesa Civil.

## Ordem de trabalho e situação

Etapa 0 (validar fontes, sem código) é **pré-requisito de tudo**. Depois: 1 motor único no back-end → 2 pipeline ruas × manchas → 3 front → 4 limpeza e README. Critérios de "pronto" e tarefas estão em `task.md`.

| Etapa | Situação |
|---|---|
| 0 — Validar as fontes | Concluída (informado pelo autor em 08/10/2026). Falta registrar as decisões em "Decisões tomadas". |
| 1 — Motor único no back-end | Concluída (informado pelo autor em 08/10/2026). |
| 2 — Pipeline ruas × manchas | Em andamento: ruas baixadas e cruzadas (`scripts/process_geojson.py` → `data/ruas_risco.geojson`, ~30 KB comprimidos). Faltam: commit (2.6), script que gera `data/geojson/` dos brutos (2.1b), tamanho mínimo do pedaço (2.4) e conferência visual (2.7, feita na 3.0). |
| 3 — Front | Em andamento. A primeira versão (mapa em tela cheia, GPS, estados e Service Worker) foi validada em 12/10/2026 e será **refeita como lista viva** por decisão de UX do mesmo dia (ver Regra de UX). |
| 4 — Limpeza e README | Não iniciada. |

## Dados geográficos (`data/geojson/`)

O app só carrega arquivos **já simplificados**. Os brutos do PDDU (shapefiles e GeoJSON originais, 11,6 MB) não vão para a pasta que o app serve.

| Arquivo | Conteúdo | Atributos mantidos | Comprimido |
|---|---|---|---|
| `mare_cachoeira_1_6m.geojson` | mancha da maré de 1,6 m | `id` | ~135 KB |
| `mare_cachoeira_2_5m.geojson` | mancha da maré de 2,5 m | `id` | ~108 KB |
| `inundacao_vila_nova.geojson` | 8 polígonos: tempo de retorno (5, 10, 25, 50 anos) × `Atual`/`Futuro` | `tempretor`, `status_1` | ~53 KB |
| `inundacao_itaum.geojson` | mancha pluvial de Itaum | `id` | ~49 KB |

Regras:
- Extensão `.geojson`; WGS84; `FeatureCollection` de `MultiPolygon`.
- Coordenadas com no máximo **5 casas decimais** (~1 m); simplificação de ~2 m (tolerância 0,00002°).
- Só atributos que o app usa. Nenhum atributo novo sem uso no código.
- Geometrias **válidas**: os brutos de maré 1,6 m, maré 2,5 m e Itaum tinham auto-interseções; a versão atual está corrigida. Qualquer regeração deve passar por validação antes de entrar no repo.
- Orçamento: as 4 manchas somam ~345 KB comprimidas. Os arquivos de ruas da Etapa 2 devem caber, junto com elas, no cache do Service Worker do celular.
- Nada de reprojeção, conversão ou simplificação no navegador.
- Esses arquivos hoje foram gerados por um script de uso único que ainda **não está versionado** (tarefa 2.1 do `task.md`).

## Decisões em aberto (recomendação; nenhuma fechada)

As três decisões da Etapa 0 (fonte da maré, referencial vertical, limiar pluvial) já foram fechadas pelo autor; os valores vão para "Decisões tomadas" abaixo e saem desta tabela. Restam abertas as das Etapas 2 e 3 e a futura. Quando uma for decidida, mover para "Decisões tomadas".

| Decisão | Recomendação | Etapa |
|---|---|---|
| Fonte da maré | Validar Open-Meteo Marine contra a tábua da Marinha e eventos; abandonar o sintético para o risco | 0 |
| Referencial vertical | Decidir após comparar com dados reais (desvio documentado ou ajustar gatilhos) | 0 |
| Limiar pluvial | Herdar da v1 e revisar depois de eventos reais | 0 |
| Trecho parcial na mancha | Dividir na borda | 2 |
| Mapa base offline | Perdeu o sentido: o mapa sai da tela principal (Regra de UX). Se o painel secundário ficar, tiles só online | 3 |
| Localização do usuário | Ponto-em-polígono, se couber em ~1 MB comprimido; senão proximidade | 3 |
| Camada de ocorrência | Fora desta entrega | Futuro |

## Decisões tomadas

As Etapas 0 e 1 foram concluídas, mas **os valores decididos ainda não foram registrados aqui**. Preencher:

| Decisão | Valor decidido | Data |
|---|---|---|
| Fonte da maré | _a preencher_ | |
| Referencial vertical (e desvio, se houver) | _a preencher_ | |
| Significado de 1,6 m | _a preencher_ | |
| Cenário de Vila Nova (o que "Futuro" representa) | **Cenário `Atual`, tempo de retorno de 25 anos** (filtro `status_1=Atual`, `tempretor=25 anos`). "Futuro" não é "com obras": a mancha Futura é maior que a Atual (2,14 × 1,50 km² em 25 anos), parece cenário de maior ocupação; fica fora. | 08/10/2026 |
| Cenário de Itaum | **Mantida como `pluvial_itaum`.** Nota: a mancha coincide espacialmente com a de maré de 2,5 m (100% da área de Itaum, 3,97 km², está dentro dela; 35% dentro da de 1,6 m), então pode representar maré, não chuva. Significado a confirmar na fonte; se for maré, passar ao gatilho de maré. Os trechos nessa área saem com `mare_2_5` + `pluvial_itaum`. | 08/10/2026 |
| Limiar pluvial | _a preencher_ | |
| Trecho em mais de uma faixa (front) | Pintar pela **pior faixa ativa** no momento, como o nível global. Rótulos dos níveis: provisórios, vindos do campo `nivel` da API. | 12/10/2026 |
| Nomes dos níveis | _a preencher_ (provisório: rótulos vindos do campo `nivel` da API) | |
| Agrupamento da lista | **Por faixa/área** (Maré de 1,6 m, Maré de 2,5 m, Chuva — Vila Nova, Chuva — Itaum), sem bairro e sem dataset novo | 12/10/2026 |
| Mapa Leaflet | **Apagado da interface principal e do cache inicial.** `teste/camadas.html` fica só para auditoria | 12/10/2026 |
| Interface principal | **Lista viva "pior primeiro" + busca + GPS; mapa em tela cheia removido** (ver Regra de UX). | 12/10/2026 |

Decididas nesta fase:
- Exemplo real de "fora da mancha não significa seguro": a **Rua Minas Gerais** existe no OSM (vários trechos), mas fica a mais de 1,5 km de qualquer mancha usada (nenhum trecho dela entra em `data/ruas_risco.geojson`). Registrada em 08/10/2026; a tela deve manter o aviso de que áreas fora das manchas também podem alagar.
- Manchas servidas ao app: simplificadas, 5 casas decimais, extensão `.geojson`, pasta `data/geojson/` (ver "Dados geográficos").

## Riscos conhecidos

- Manchas cobrem só cenários modelados; falhas de drenagem e chuva local fora delas continuam possíveis.
- Cartilha do PDDU é de 2011; não reflete obras recentes.
- Render hiberna (primeira resposta lenta; o front mostra cache primeiro); Mistral tem cota.
- Se a maré real não casar com os cenários do PDDU, os gatilhos de 1,6 m e 2,5 m não podem ser usados direto.
- Dois pontos do documento de arquitetura estão marcados "a confirmar no texto original": referencial do PDDU e recorrência da maré de 1,6 m.

## Estado do código

Ponto de partida (antes das etapas): três motores de risco que se contradiziam (back-end global, front por bairro/cota, `src/services/riskEngine.js` morto); Mistral repetia `nivel_calculado` e era instruído a ser tranquilizador em NORMAL; maré era uma cossenoide sintética (média 1,15 m, amplitude 0,55 m, período 12,42 h).

Hoje: a Etapa 1 (motor único no back-end) foi feita pelo autor. O que ainda resta do ponto de partida no **front** (regra por bairro no `app.js`, `mock-data.json`, `src/services/`) é o que a Etapa 4 remove depois que a Etapa 3 estiver pronta. Conferir no repositório antes de apagar.

## Documentos relacionados

- Doc 1 — Arquitetura e Planejamento (base deste arquivo).
- Doc 2 — Dados do joinville_meteo e maré do Iate Clube (calibração da maré; trilha opcional que alimenta a decisão "fonte da maré").

## Como trabalhar neste repo

- Seguir `task.md` na ordem; uma tarefa por critério de "pronto".
- Antes de adicionar algo, perguntar se o requisito existe e se dá para apagar.
- Mudança de comportamento do risco exige caso novo na tabela de testes da Etapa 1.
- Atualizar a seção "Decisões tomadas" deste arquivo a cada decisão fechada.
