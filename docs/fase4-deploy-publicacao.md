# 📑 Documentação - Fase 4: Deploy, CI/CD e Publicação

## 🎯 Objetivo da Fase
Disponibilizar o 'joinville-alerta-v2' em ambiente de produção com hospedagem do Front-End no GitHub Pages e implantação da API FastAPI em nuvem, garantindo infraestrutura de custo zero e zero exposição de credenciais.

---

## 🏗️ Arquitetura de Produção

| Camada | Tecnologia | Plataforma de Hospedagem | URL / Endpoint |
| :--- | :--- | :--- | :--- |
| **Front-End** | HTML5, CSS3, JS (ES Modules) | GitHub Pages | `https://<usuario>.github.io/joinville-alerta-v2/` |
| **Back-End** | Python 3.11+, FastAPI, Uvicorn | Render / Cloud Server | `https://<sua-api>.onrender.com/api/v1/status-geral` |

---

## 🔒 Proteção de Segredos em Produção
- A variável `MISTRAL_API_KEY` é injetada diretamente no ambiente da nuvem (*Environment Variables*).
- O arquivo `.env` permanece estritamente local e ignorado pelo `.gitignore`.
- O repositório no GitHub permanece $100\%$ público e auditável.