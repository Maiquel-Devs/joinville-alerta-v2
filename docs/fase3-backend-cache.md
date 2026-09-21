# 📑 Documentação - Fase 3: Back-End Python & In-Memory Cache

## 🎯 Objetivo da Fase
Construir uma API autônoma em FastAPI com agendamento automático (*cron* de 15 minutos) e armazenamento em memória RAM (*In-Memory Cache*), isolando a chave da Mistral AI e suportando picos massivos de acessos sem custos.

---

## 🛠️ Componentes do Back-End (`/backend`)

| Arquivo | Função |
| :--- | :--- |
| `cache_store.py` | Estrutura na memória RAM para entrega instantânea (< 5ms). |
| `mistral_client.py` | Cliente assíncrono para a Mistral AI com chave isolada em `.env`. |
| `scheduler.py` | Agendador autônomo (APScheduler) que atualiza a telemetria a cada 15 minutos. |
| `main.py` | Servidor FastAPI expondo a rota `/api/v1/status-geral` com suporte a CORS. |

---

## 🔒 Segurança
- Arquivo `.env` totalmente ignorado pelo Git via `.gitignore`.
- Exposição do modelo público `.env.example` para replicação de ambiente.