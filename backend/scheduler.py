import httpx
import math
from datetime import datetime
from zoneinfo import ZoneInfo
from cache_store import update_cache
from mistral_client import generate_ai_summary

def calculate_tide() -> float:
    # Simulação da maré astronômica contínua (Ciclo M2)
    epoch_hours = datetime.now().timestamp() / 3600
    oscillation = 0.55 * math.cos((2 * math.pi * epoch_hours) / 12.42)
    return round(max(0.4, 1.15 + oscillation), 2)

async def update_telemetry_job():
    print("[CRON]: Buscando telemetria de chuva e maré em Joinville...")
    url = "https://api.open-meteo.com/v1/forecast?latitude=-26.3045&longitude=-48.8456&current=precipitation&hourly=precipitation&past_days=1&forecast_days=1&timezone=America%2FSao_Paulo"
    
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(url)
            data = res.json()
            
            rain_24h = sum(data.get("hourly", {}).get("precipitation", [])[:24])
            tide_m = calculate_tide()
            
            # Equação de Risco
            rain_load = rain_24h
            tide_factor = 1.7 if tide_m >= 2.0 else (1.35 if tide_m >= 1.5 else 1.0)
            composite = rain_load * tide_factor
            
            nivel = "NORMAL"
            if composite >= 80 or (tide_m >= 2.10 and rain_load >= 30):
                nivel = "CRITICO"
            elif composite >= 50 or (tide_m >= 1.60 and rain_load >= 20):
                nivel = "ALTO"
            elif composite >= 30 or tide_m >= 1.50:
                nivel = "ATENCAO"

            ai_summary = await generate_ai_summary(nivel, rain_24h, tide_m)
            
            # Ajustado para pegar a hora local de Joinville/Brasília (UTC-3) independente de onde o servidor está hospedado
            horario_joinville = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%H:%M")
            
            payload = {
                "nivel": nivel,
                "chuva_24h_mm": round(rain_24h, 1),
                "mare_babitonga_m": tide_m,
                "alerta_mistral_ai": ai_summary,
                "timestamp": horario_joinville
            }
            
            update_cache(payload)
            print("[CRON]: In-Memory Cache atualizado com sucesso!")
    except Exception as e:
        print(f"[ERRO CRON]: {e}")