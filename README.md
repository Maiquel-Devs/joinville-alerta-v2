# joinville-alerta-v2

Lista de **risco de alagar por rua** em Joinville/SC, gratuita e que funciona offline. Mostra ao cidadão em quais ruas a água pode subir com a maré e a chuva de agora, ordenadas do pior para o melhor.

Projeto acadêmico e comunitário do curso de Engenharia de Software da UNIVILLE. Custo de infraestrutura: R$ 0,00.

> **O que este app não é.** Ele **infere** risco a partir de maré e chuva; não observa nada na rua e não confirma alagamento. **Fora das áreas mapeadas pelo PDDU também pode alagar.** Em emergência, ligue **199 (Defesa Civil)**. Este app não substitui a Defesa Civil.

## Como funciona

```
Open-Meteo (chuva) ─┐
CIRAM/Epagri (maré) ┴─► Back-end (FastAPI, Render) ──► /api/v1/status-geral ──┐
                         decide o estado de cada faixa                          ▼
PDDU × OpenStreetMap ──► pipeline offline ──► data/*.geojson ──► Front (PWA, GitHub Pages)
                         (computador do autor)                    lista viva "pior primeiro"
```

- **Back-end (`backend/`):** a cada 15 minutos coleta a chuva acumulada em 24 h e a maré, e avalia quatro **faixas de gatilho**: `mare_1_6`, `mare_2_5`, `pluvial_vila_nova` e `pluvial_itaum`. Cada faixa fica `ativa`, `inativa` ou `indisponivel`. O nível global é a pior faixa ativa. O resultado fica em cache na memória, com o horário (`gerado_em`). **É o único lugar que decide o risco.**
- **Texto de alerta:** a IA (Mistral) só escreve a mensagem a partir de um nível já calculado. Não reclassifica nada. Se ela falhar, o texto vem de uma regra fixa. A chave fica só no servidor.
- **Pipeline offline (`scripts/process_geojson.py`):** cruza as manchas do PDDU (SIRGAS 2000 / UTM 22S, convertidas para WGS84) com as ruas do OpenStreetMap e grava `data/ruas_risco.geojson`, em que cada trecho carrega as faixas em que está. Roda no computador do autor, nunca em produção.
- **Front (`index.html`, `app.js`, `style.css`, `sw.js`):** PWA estático. Monta a lista com o estado das faixas vindo da API e com o GeoJSON de ruas. Só ordena e desenha; não calcula risco. O botão de localização testa o ponto do GPS contra as manchas (`pip.js`, sem biblioteca geoespacial). Não há mapa na interface.
- **Offline:** o Service Worker responde do cache e atualiza em segundo plano. Sem rede, o app mostra o último estado salvo com o horário dele e avisa quando o dado passou da validade (30 min).

## Estados e linguagem

Cada faixa aparece como **ativa** (risco de alagar agora), **inativa** ("Nenhuma faixa ativa agora"), **indisponível** (sem dado válido) ou com **dado antigo**. Dado ausente nunca vira "normal", e "nenhuma faixa ativa" não significa "sem risco".

## Fontes de dados e licenças

| Dado | Fonte | Observação |
|---|---|---|
| Manchas de alagamento | PDDU de Joinville (cartilha de 2011) | Só cenários modelados; não reflete obras recentes |
| Ruas | © colaboradores do [OpenStreetMap](https://www.openstreetmap.org/copyright), licença ODbL | Via Overpass |
| Chuva | [Open-Meteo](https://open-meteo.com) | Uso não comercial; o limite diário de requisições já foi atingido no Render |
| Maré | Marégrafo CIRAM/Epagri (medida) e previsão MohidSC (estimativa) | O rótulo do front diz se é medida ou estimativa. Uso em produção ainda depende de autorização |

## Limites conhecidos

- **Modelo oficial × estimativa:** as manchas são o modelo oficial do PDDU. A maré e a chuva usadas para ativar cada faixa são medições ou estimativas externas, e os gatilhos (1,6 m, 2,5 m, 30 mm em 24 h) ainda são provisórios e precisam ser revisados com eventos reais.
- **Referencial vertical:** o zero da régua do marégrafo pode diferir do referencial do PDDU. Isso ainda precisa ser confirmado.
- **Itaum:** a mancha coincide com a de maré de 2,5 m e pode representar maré, não chuva. A confirmação depende da fonte original.
- **Fora das manchas:** falhas de drenagem e chuva local continuam possíveis em qualquer rua.
- **Cota por rua:** não há. A granularidade é o trecho dentro de uma mancha.
- **Render gratuito:** hiberna, e a primeira resposta pode demorar. O app mostra o cache enquanto espera.

## Como rodar

**Back-end**

```bash
cd backend
pip install -r requirements.txt
# opcional: MISTRAL_API_KEY no arquivo .env (sem ele, vale o texto fixo)
uvicorn main:app --reload
pip install -r requirements-dev.txt && python -m pytest tests   # tabela de testes do motor
```

**Front:** sirva a pasta raiz por HTTP (por exemplo, `python -m http.server`) e abra `index.html`. O Service Worker exige HTTPS ou localhost. A URL da API fica no topo do `app.js`.

**Regerar `data/ruas_risco.geojson`** (computador do autor; precisa de `scripts/requirements.txt`, dos shapefiles do PDDU em `data/raw/pddu/` e de internet para o Overpass):

```bash
pip install -r scripts/requirements.txt
python scripts/process_geojson.py inspecionar   # campos e CRS dos shapefiles
python scripts/process_geojson.py baixar        # ruas do OpenStreetMap
python scripts/process_geojson.py cruzar --filtro inundacao_vila_nova:status_1=Atual --filtro "inundacao_vila_nova:tempretor=25 anos"
```

Os arquivos de `data/geojson/` (as quatro manchas já simplificadas, WGS84, 5 casas decimais) foram gerados por um script de uso único que ainda não está versionado. Os arquivos brutos do PDDU não vão para o repositório nem para a pasta servida.

## Estrutura

```
backend/   API, motor de risco, coleta, cache e testes
data/      manchas simplificadas e ruas por faixa (servidos ao app)
scripts/   pipeline offline
docs/      notas das fases do projeto
teste/     páginas de auditoria (Leaflet só aqui)
```

Planejamento e decisões: `CLAUDE.md` e `task.md`.

## Créditos

Equipe do Projeto de Vivências, Engenharia de Software, UNIVILLE.
