# task.md — Joinville Alerta v2

Uma tarefa por critério de "pronto". Marque `[x]` ao concluir. **A Etapa 0 bloqueia todas as outras.** Princípios e regras em `CLAUDE.md`.

Legenda: 🔒 bloqueado por outra tarefa · ⚖️ decisão sua · 🧪 precisa de teste.

---

## Etapa 0 — Validar as fontes (sem código) ✅ concluída (informado em 08/10/2026)

Termina em **uma página de decisões**. Má calibração da maré invalida todo o resto.

- [x] 0.1 ⚖️ **Fonte da maré.** Comparar candidatas (Open-Meteo Marine da v1; tábua da Marinha; sintético atual) com a tábua real e eventos históricos conhecidos. Recomendação: validar a Open-Meteo Marine; abandonar o sintético para o risco.
- [x] 0.2 ⚖️ **Referencial vertical.** Conferir no texto original da cartilha do PDDU (hoje "a confirmar") qual é o zero e se a fonte escolhida usa o mesmo. Se não, documentar o desvio.
- [x] 0.3 ⚖️ **Significado de 1,6 m.** Resolver a contradição: cartilha (ocorrência média a cada dois anos, a confirmar) × doc da v1 ("sizígia comum").
- [x] 0.4 **Tabela polígono → cenário** completa:

  | Camada (v1) | Polígonos | Atributos | Cenário |
  |---|---|---|---|
  | mare_cachoeira_1_6m | 1 | só id | Maré de 1,6 m |
  | mare_cachoeira_2_5m | 1 | só id | Maré de 2,5 m |
  | inundacao_vila_nova | 8 | tempo de retorno e status | **a confirmar:** o que "Futuro" representa (ao menos um com "25 anos" e "Futuro") |
  | inundacao_itaum | 1 | só id | sem cenário informado — **a definir** |

- [x] 0.5 ⚖️ **Limiar pluvial.** Herdar da v1 (adaptado da Defesa Civil de SC) ou recalibrar. Recomendação: herdar e revisar depois de eventos reais.
- [x] 0.6 **Fechar a página de decisões**.
- [ ] 0.7 **Copiar cada decisão para "Decisões tomadas" no `CLAUDE.md`** (os valores ainda não foram registrados; inclui o cenário de Vila Nova e de Itaum da tabela 0.4).

**Pronto quando:** uma página fixar fonte de maré, referencial vertical, significado de 1,6 m, tabela polígono → cenário e limiar pluvial.
**Se a maré real não casar com os cenários do PDDU:** decidir, com dados em mão, entre desvio documentado ou rever os gatilhos.

> Trilha de apoio: a calibração com o Iate Clube (Doc 2) alimenta 0.1 e 0.2. Ver "Trilha Doc 2" no fim.

---

## Etapa 1 — Motor de risco único no back-end ✅ concluída (informado em 08/10/2026)

Depois desta etapa existe **uma só regra de risco**, no back-end; a IA só escreve texto.

- [x] 1.1 Scheduler (15 min) coleta chuva 24 h e 48 h e vento na Open-Meteo.
- [x] 1.2 Obter a maré pela fonte da 0.1 e calcular a maré efetiva (rotulada como estimativa se não for medida).
- [x] 1.3 Avaliar cada faixa de gatilho: `mare_1_6`, `mare_2_5`, pluviais. Cada uma `ativa` / `inativa` / `indisponivel`.
- [x] 1.4 Nível global = pior faixa ativa. ⚖️ Definir os nomes dos níveis.
- [x] 1.5 Cache em RAM com `gerado_em`; sem dado válido → `indisponivel`, nunca "normal". Último resultado válido segue disponível com a idade dele.
- [x] 1.6 IA recebe faixas ativas + nível; não reclassifica. Texto neutro para nível normal (sem "cidade segura"). Só chama o Mistral quando o conjunto de faixas ativas muda. Falhou → texto determinístico.
- [x] 1.7 🧪 **Tabela de testes** (maré, chuva, faixas esperadas), incluindo o caso que hoje contradiz (maré 1,30 m com 25 mm de chuva) e os limites de 1,6 m e 2,5 m.
- [x] 1.8 Implementar o contrato da API (`/api/v1/status-geral`) e validar os campos propostos.

**Pronto quando:** a tabela de testes passa; a mensagem nunca contradiz as faixas; o endpoint responde `indisponivel` com cache vazio; o contrato está implementado.
**Risco:** sem dados históricos, o limiar pluvial pode precisar de ajuste após eventos reais.

---

## Etapa 2 — Pipeline offline: ruas × manchas 🔄 em andamento

Já existe: as 4 manchas simplificadas em `data/geojson/` (WGS84, 5 casas decimais, ~345 KB comprimidas no total, geometrias válidas). Os arquivos de maré e de Itaum eram inválidos no bruto (auto-interseções); a versão atual foi corrigida.

Script rodado no seu computador, nunca em tempo de execução.

- [x] 2.1a Reprojetar para WGS84 e simplificar as 4 manchas → `data/geojson/*.geojson` (gerados em 08/10/2026 com um script de uso único e salvos pelo autor em `data/geojson/`).
- [ ] 2.1b **Versionar o script** que gera `data/geojson/` a partir dos brutos (reprojeção SIRGAS 2000 UTM 22S → WGS84, simplificação ~2 m, 5 casas decimais, só os atributos usados, validação de geometria). Hoje a geração foi feita por script de uso único, fora do repo. Os brutos ficam fora da pasta servida ao app (ex.: `data/raw/`).
- [x] 2.2 Baixar ruas do OpenStreetMap (Overpass) só para a área das manchas. (`scripts/process_geojson.py baixar`: 6.592 vias em `data/raw/`, fora do git; 08/10/2026)
- [x] 2.3 Cruzar (entrada: `data/geojson/`; Vila Nova só entra depois que o cenário de `Atual`/`Futuro` e dos tempos de retorno estiver registrado, tarefa 0.7): trecho na mancha 1,6 m → faixa `mare_1_6`; só na 2,5 m → `mare_2_5`; nas pluviais → faixa pluvial correspondente; fora de todas → não entra no arquivo. (`process_geojson.py cruzar` com Vila Nova `Atual` + `25 anos` → `data/ruas_risco.geojson`; cada trecho traz `faixas` (lista), pois um trecho pode estar em mais de uma mancha, ex.: `mare_2_5` + `pluvial_itaum`.)
- [x] 2.4 ⚖️ Trecho parcialmente dentro: recomendação dividir na borda; definir tamanho mínimo do pedaço. **Validado visualmente em 12/10/2026 (3.0):** dividido na borda e com mínimo provisório de 10 m (`TAMANHO_MIN_PEDACO_M`); 179 pedaços menores foram descartados.
- [x] 2.5 ⚖️ Fixar a meta de tamanho dos **arquivos de ruas** (comprimidos, somados às 345 KB das manchas, cabendo no cache do Service Worker). Simplificar e reduzir precisão das ruas com as mesmas regras das manchas. Linha de base: manchas brutas ≈ 11,6 MB → 345 KB comprimidas. **Medido:** ruas = 0,22 MB sem compressão (~30 KB comprimidas), simplificação de 1 m e 5 casas decimais; manchas + ruas ≈ 375 KB comprimidas, dentro do orçamento de ~1 MB da 3.2.
- [ ] 2.6 Versionar o script das ruas e o arquivo gerado no repo (junto com o da tarefa 2.1b). **Falta o commit** de `scripts/` e `data/ruas_risco.geojson`; a 2.1b segue aberta, pois o script das ruas consome `data/geojson/` e não o regenera dos brutos.
- [x] 2.7 Conferir a olho no mapa uma amostra (Rua Minas Gerais, Rua Urussanga, Rua Inácio Bastos). **Conferido a olho em 12/10/2026 (3.0).** Resultado numérico: Urussanga e Inácio Bastos têm trechos; Minas Gerais não tem nenhum (ver "Decisões tomadas" no `CLAUDE.md`).

- [x] 2.8 ⚖️ **Rótulo de bairro/área por trecho** (para a lista viva da 3.1). **Decidido em 12/10/2026: opção (B), agrupar por faixa/área** (Maré de 1,6 m, Maré de 2,5 m, Chuva — Vila Nova, Chuva — Itaum), sem dataset de bairros. Nenhum campo novo em `data/ruas_risco.geojson`. Qualquer campo novo em `data/ruas_risco.geojson` precisa ser usado pelo app e caber no orçamento.

**Pronto quando:** cada trecho tem faixa; a amostra foi conferida; o script reproduz o arquivo a partir dos dados brutos.
**Riscos:** nomes faltando no OSM; licença ODbL exige atribuição visível no mapa e no README; manchas de 2011 não refletem obras recentes.

---

## Etapa 3 — Front-end: lista viva, busca e GPS (Etapa 1 pronta)

**Reestruturada em 12/10/2026 (decisão de UX; ver "Regra de UX" no `CLAUDE.md`):** a tela principal é uma lista viva de bairros/ruas ordenada "pior primeiro", com busca e GPS. O mapa em tela cheia sai da tela principal. O PWA só ordena e mostra o que o back-end decidiu; nenhuma regra de risco própria.

Já feito e reaproveitado: leitura de `/api/v1/status-geral` com último estado salvo e aviso de dado antigo, `pip.js`, GPS, textos fixos e Service Worker (3.3). A primeira versão com mapa em tela cheia foi validada em 12/10/2026 e vira base do painel secundário, se ele ficar.

- [x] 3.0 🧪 Teste das manchas no Leaflet, com ponto-em-polígono (`teste/camadas.html`). Concluída e validada em 12/10/2026 (~382 KB). Ponto-em-polígono conferido contra o shapely (12.000 pontos, 0 divergências). Serviu de base para 2.4 e 2.7.
- [ ] 3.1 **Lista Viva de Bairros e Ruas, "Pior Primeiro".** Cartões ordenados por estado: (1) faixa ativa, pior nível primeiro, em destaque (vermelho/laranja) com as ruas afetadas; (2) só indisponível, cartão neutro com aviso; (3) demais em ordem alfabética, "Nenhuma faixa ativa agora". Mantém os 4 estados (ativa, inativa, indisponível, dado antigo com horário e aviso). Reordena quando chega um novo estado da API. Depende da decisão da 2.8 (rótulo de bairro/área). Nunca "sem risco" nem "normal" sem dado válido.
- [ ] 3.2 ⚖️ **Busca e cartão do GPS.** Campo de busca por rua/bairro (sem acento, resultado a cada tecla). Botão "Usar minha localização": ponto-em-polígono (`pip.js`) contra as manchas; cartão em texto dizendo se está dentro de alguma mancha, qual faixa está ativa agora e a precisão do GPS. Sempre com "Fora das manchas também pode alagar" e "Este app não substitui a Defesa Civil (199)". A lógica do GPS já existe no `app.js` atual; faltam a busca e o cartão novo.
- [ ] 3.3 Service Worker: cache primeiro, atualização em segundo plano; `pip.js` e `data/**/*.geojson` no cache, versionado por `VERSAO`. Escrito em 12/10/2026; **falta testar em modo avião** e ajustar a lista de arquivos conforme a 3.4 (Leaflet sob demanda ou removido).
- [ ] 3.4 ⚖️ **Mapa removido da interface principal e do cache inicial (decidido em 12/10/2026: apagar de vez).** Implementado: `index.html` sem Leaflet, `sw.js` v4 sem `vendor/leaflet/`. `teste/camadas.html` e `vendor/leaflet/` ficam no repo só para auditoria (decidir na Etapa 4 se `vendor/` sai). Antes: **Remover/recolher o mapa Leaflet principal.** Recomendado: painel recolhido "Ver mapa detalhado", com Leaflet e GeoJSON de ruas carregados só ao abrir (o peso inicial cai para a lista, o `pip.js` e as manchas). Alternativa mais enxuta e mais fiel a "apagar antes de adicionar": apagar o mapa e o Leaflet do app. Substitui a antiga decisão de mapa base offline: tiles só online no painel secundário, ou nenhum.
- [ ] 3.5 **Revisar os textos fixos** para a nova tela: "risco de alagar", "Fora das manchas também pode alagar", Defesa Civil (199), "o app não substitui a Defesa Civil", atribuição OSM (ODbL) e PDDU, legenda das cores da lista e "Nenhuma faixa ativa agora" no lugar de "sem risco".
- [ ] 3.6 🧪 **Desempenho no celular real:** resposta em menos de 0,5 s com cache, leitura sem zoom, lista fluida. Medir de verdade. Se pesar, reduzir antes de trocar de biblioteca.

**Pronto quando:** a lista aparece em modo avião com o último estado e o horário; quem tem faixa ativa fica no topo; busca e GPS respondem em texto claro; nenhum texto diz "alagado" nem "sem risco"; leitura fluida em celular intermediário.

---

## Etapa 4 — Limpeza e README honesto 🔒 (depende de 3)

- [ ] 4.1 Remover `mock-data.json` (bairros, cotas, telemetria de exemplo).
- [ ] 4.2 Remover a regra de risco por bairro do `app.js` e a lista de coordenadas de bairros como fonte de risco.
- [ ] 4.3 Remover `src/services/` (`riskEngine.js`, `mistralAgent.js`, `weatherService.js`) — o `index.html` não os carrega; o `mistralAgent.js` ainda aceita chave de API no navegador.
- [ ] 4.4 Remover a maré sintética, se a Etapa 0 escolheu outra fonte.
- [ ] 4.4b Conferir que nenhum arquivo bruto do PDDU nem GeoJSON antigo (`.json` com 15 casas decimais) ficou na pasta servida; apagar referências antigas a `data/geojson/*.json` no código e no Service Worker.
- [ ] 4.5 README com: arquitetura real, fontes e licenças (PDDU e OpenStreetMap), limites conhecidos, diferença entre modelo oficial e estimativa, e como regerar `data/geojson/` com o script.
- [ ] 4.6 Atualizar `docs/fase*.md` e o Handoff para refletir as Etapas 0 a 3.

**Pronto quando:** busca por regra de risco no front não encontra nada; não sobra dado de exemplo; o README descreve o sistema que de fato roda.

---

## Trilha Doc 2 — Maré do Iate Clube (opcional, alimenta a Etapa 0)

Detalhes e passos A–I no documento "Dados do joinville_meteo e maré do Iate Clube". Resumo, na ordem:

- [ ] D2.A Enviar o e-mail de permissão/perguntas à autora/LaCiA (via professor) e conferir os termos da fonte original (SEPROT).
- [ ] D2.B Preparar os dados (zip do Zenodo fora do git; inválido → NaN, nunca zero).
- [ ] D2.C Fixar os critérios de aceite **antes** do ajuste.
- [ ] D2.D 🧪 Ajuste harmônico da série do Iate Clube com treino/teste separados → constantes da maré.
- [ ] D2.E Transferência Iate Clube → Centro (defasagem, amplitude, resíduo de chuva).
- [ ] D2.F Resíduo de vento: calibrar com fonte de vento equivalente à de produção, ou remover o termo.
- [ ] D2.G Conferir gatilhos e cobertura com os desastres (só sanity-check).
- [ ] D2.H Módulo de maré no back-end (constantes + soma de cossenos, testes em datas medidas; sem dependências pesadas no Render).
- [ ] D2.I Documentar método e citar a fonte (DOI 10.5281/zenodo.21682712).

**Atenção:** o referencial vertical das estações (zero da régua) é diferente do referencial do PDDU. Isso é o maior risco aberto e liga D2 à tarefa 0.2.

---

## Depois da Etapa 4 (fora desta entrega)

Segunda camada, visualmente separada, de **alagamento confirmado** (relato do cidadão, pluviômetros do CEMADEN, boletins oficiais), para nunca misturar previsão com ocorrência. Cotas por trecho de rua, se a Prefeitura liberar, só refinam as faixas existentes.
