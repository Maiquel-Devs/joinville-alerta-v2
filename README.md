# 🌊 joinville-alerta-v2

> **Plataforma autônoma e de latência zero para prevenção de alagamentos estuarinos e pluviais em Joinville/SC.**  
> *Engenharia orientada a Primeiros Princípios: tempo de resposta < 5ms, inteligência artificial contextual e custo de infraestrutura R$ 0,00.*

---

## ⚠️ O Problema

Joinville possui um histórico crítico de alagamentos causados pela combinação de enxurradas pluviais e pelo represamento estuarino no Rio Cachoeira (maré alta na Baía da Babitonga). 

A primeira versão de aplicações do gênero apresentava gargalos claros de engenharia:
* **Latência e Gargalos de Rede:** Consultas feitas diretamente no navegador do usuário a APIs externas tornavam a aplicação lenta e vulnerável a limites de requisição (*rate limits*).
* **Alertas Rígidos:** Mensagens baseadas unicamente em regras de `if/else` que não explicavam o impacto real para o morador de cada região.
* **Insegurança:** Risco de vazamento de chaves de API e segredos diretamente no código JavaScript do cliente.

---

## 🎯 Objetivo

O **`joinville-alerta-v2`** foi desenvolvido para resolver esses gargalos através de um ecossistema autônomo, desacoplado e resiliente:
* Entregar um painel com tempo de resposta instantâneo (**< 5ms**) operando sobre cache em memória RAM.
* Processar telemetria em tempo real (chuva, maré e vetor de vento) e traduzir dados técnicos brutos em orientações claras em linguagem humana utilizando IA Generativa.
* Garantir isolamento absoluto de credenciais e operação contínua 24/7 com custo zero de hospedagem.

---

## 📦 O Que o Sistema Entrega

* **Telemetria Urbana em Tempo Real:** Monitoramento contínuo da chuva acumulada nas últimas 24 horas, velocidade/direção do vento e elevação hidrometeorológica da maré no estuário de Joinville.
* **Alerta Humanizado por IA:** Diagnóstico dinâmico gerado pelo agente inteligente interpretando a gravidade da situação.
* **Matriz de Risco Topográfica:** Classificação de áreas críticas e vias públicas com base nas cotas de altitude (em metros) em relação ao nível do mar.
* **Filtro Dinâmico:** Busca em tempo real por ruas e bairros afetados diretamente na interface.
* **Arquitetura Desacoplada (Decoupled Architecture):** Front-End estático e Back-End em Python completamente separados e integrados via REST API.

---

## 🛠️ Tecnologias & Stack

* **Back-End:** Python 3.11+, FastAPI, Uvicorn.
* **Front-End:** HTML5 Semântico, CSS3 Moderno, JavaScript ES Modules (Fetch API, Async/Await).
* **Hospedagem & Infraestrutura:** 
  * **Render:** Hospedagem da API Python (Web Service Containerized).
  * **GitHub Pages:** Hospedagem estática e distribuída do Front-End.

---

## 📚 Bibliotecas Utilizadas

* **`fastapi`**: Framework web assíncrono de altíssima performance para construção da REST API.
* **`uvicorn`**: Servidor ASGI leve para execução do FastAPI.
* **`apscheduler`**: Agendador de tarefas em segundo plano (*background worker*) que atualiza os dados automaticamente a cada 15 minutos sem travar requisições do usuário.
* **`httpx`**: Cliente HTTP assíncrono utilizado para consumir serviços externos de telemetria meteorológica.
* **`pydantic`**: Validação estrita de dados e garantia da estrutura dos payloads JSON.
* **`python-dotenv`**: Gerenciamento e isolamento de variáveis de ambiente em desenvolvimento local.

---

## 🌐 APIs Externas & Agente Inteligente

* **Open-Meteo API:** Coleta de telemetria pluviométrica em tempo real (chuva acumulada em 24h) e dinâmica dos ventos (`wind_speed_10m` e `wind_direction_10m`) utilizando as coordenadas geográficas exatas do município de Joinville.
* **Modelo Hidrometeorológico Híbrido da Babitonga:** Algoritmo calibrado que une o componente astronômico do ciclo de maré M2 ($12.42\text{h}$) à sobre-elevação meteorológica causada pelo represamento do Vento Sul/Sudeste.
* **Agente Mistral AI (`mistral-small-latest`):** Processamento de Linguagem Natural (NLP) responsável por interpretar a combinação de chuva, maré e nível de risco, gerando sínteses explicativas para a população.

---

## ⚙️ Como Foi Feito (Decisões de Engenharia)

* **Modelo Hidrometeorológico Híbrido (Maré + Vento Sul):** O sistema não utiliza apenas simulação puramente teórica da maré. O `scheduler.py` calcula o nível real da água somando a onda astronômica M2 à sobre-elevação meteorológica provocada por ventos do quadrante **Sul e Sudeste ($135^\circ$ a $225^\circ$)**, que represam a Baía de Babitonga e dificultam o escoamento do Rio Cachoeira.
* **In-Memory Cache Store:** Eliminou-se a necessidade de banco de dados para armazenar telemetria volátil. Os dados processados ficam salvos na memória RAM do servidor, garantindo respostas em < 5ms.
* **Background Worker Autônomo:** A requisição do usuário **nunca aguarda** a consulta a APIs externas ou à IA. O `APScheduler` pré-calcula a matriz de risco em segundo plano a cada 15 minutos.
* **Isolamento Total de Segredos:** A chave `MISTRAL_API_KEY` fica armazenada estritamente nas variáveis de ambiente do servidor na nuvem, sem qualquer exposição no código do cliente ou no repositório.

---

## ⚠️ Limitações Conhecidas do MVP

* **Altimetria Agregada por Bairro:** Na versão atual (v2), a cota topográfica de altitude (ex: 1.2m, 1.5m) é um atributo associado à zona/bairro. As ruas são cadastradas como uma lista descritiva de vias críticas vinculadas àquela cota.
* **Microrelevo:** No mundo real, uma rua extensa pode cruzar variações de cota ao longo do seu trajeto.
* **Visão v3 (Roadmap Futuro):** Ingestão de arquivos GeoJSON e Shapefiles do SIMGeo Joinville para obter a cota altimétrica georreferenciada individualmente por trecho de logradouro.

---

## 👥 Créditos & Desenvolvimento

Desenvolvido pela **Equipe do Projeto de Vivências** do curso de Engenharia de Software da **UNIVILLE** (Universidade da Região de Joinville).

Projeto focado em inovação tecnológica, gestão de riscos urbanos e aplicação prática de engenharia de software para a comunidade de Joinville/SC.