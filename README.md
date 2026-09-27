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
* Processar telemetria em tempo real (chuva 24h/48h, maré, saturação do solo e vetor de vento) e traduzir dados técnicos brutos em orientações claras em linguagem humana utilizando IA Generativa.
* Garantir isolamento absoluto de credenciais e operação contínua 24/7 com custo zero de hospedagem.

---

## 📦 O Que o Sistema Entrega

* **Telemetria Urbana Multi-Variável:** Monitoramento contínuo da chuva acumulada (24h/48h), índice de saturação da bacia, velocidade/direção do vento e elevação hidrometeorológica da maré.
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

* **Open-Meteo API:** Coleta de telemetria pluviométrica em tempo real (chuva 24h e histórico de 48h com `past_days=2`) e dinâmica dos ventos (`wind_speed_10m` e `wind_direction_10m`) para as coordenadas de Joinville.
* **Modelo Hidrometeorológico Híbrido da Babitonga:** Algoritmo calibrado que une o componente astronômico M2 ($12.42\text{h}$) à sobre-elevação meteorológica por represamento de Vento Sul/Sudeste ($135^\circ$ a $225^\circ$).
* **Agente Mistral AI (`mistral-small-latest`):** Processamento de Linguagem Natural (NLP) responsável por interpretar a combinação de chuva, maré e nível de risco, gerando sínteses explicativas para a população.

---

## ⚙️ Como Foi Feito (Decisões de Engenharia)

* **Índice Antecedente de Chuva (Saturação do Solo):** O sistema analisa o volume de precipitação das **48 horas anteriores** para modelar a capacidade de absorção do solo. Chuvas recentes acumuladas aplicam um **Multiplicador de Saturação ($1.20\times$ a $1.35\times$)** na equação de risco, prevendo enxurradas com maior precisão física.
* **Modelo Hidrometeorológico Híbrido (Maré + Vento Sul):** O `scheduler.py` calcula o nível real da água somando a onda astronômica M2 à sobre-elevação meteorológica provocada por ventos do quadrante **Sul e Sudeste ($135^\circ$ a $225^\circ$)**, que dificultam o escoamento do Rio Cachoeira.
* **In-Memory Cache Store:** Dados salvos na memória RAM do servidor para garantir respostas em sub-5ms sem sobrecarregar serviços externos.
* **Background Worker Autônomo:** O `APScheduler` pré-calcula a matriz de risco em segundo plano a cada 15 minutos sem que o usuário aguarde processamento.
* **Isolamento Total de Segredos:** Variáveis de ambiente como a `MISTRAL_API_KEY` totalmente isoladas no servidor.

---

## ⚠️ Limitações Conhecidas do MVP

* **Altimetria Agregada por Bairro:** Na versão atual (v2), a cota topográfica de altitude (ex: 1.2m, 1.5m) é um atributo associado à zona/bairro.
* **Microrelevo:** No mundo real, uma rua extensa pode cruzar variações de cota ao longo do seu trajeto.
* **Visão v3 (Roadmap Futuro):** Ingestão de arquivos GeoJSON e Shapefiles do SIMGeo Joinville para obter a cota altimétrica georreferenciada individualmente por trecho de logradouro.

---

## 👥 Créditos & Desenvolvimento

Desenvolvido pela **Equipe do Projeto de Vivências** do curso de Engenharia de Software da **UNIVILLE** (Universidade da Região de Joinville).

Projeto focado em inovação tecnológica, gestão de riscos urbanos e aplicação prática de engenharia de software para a comunidade de Joinville/SC.