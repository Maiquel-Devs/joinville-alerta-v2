# backend/cache_store.py

# Estrutura na memória RAM para resposta instantânea
LATEST_ALERT_CACHE = {
    "status": "NORMAL",
    "data": None,
    "last_updated": None
}

def update_cache(data: dict):
    global LATEST_ALERT_CACHE
    LATEST_ALERT_CACHE["data"] = data
    LATEST_ALERT_CACHE["status"] = data.get("nivel", "NORMAL")
    LATEST_ALERT_CACHE["last_updated"] = data.get("timestamp")

def get_cached_alert():
    return LATEST_ALERT_CACHE