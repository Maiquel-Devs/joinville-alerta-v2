import httpx
import math
from datetime import datetime
from zoneinfo import ZoneInfo
from cache_store import update_cache
from mistral_client import generate_ai_summary

def calculate_tide(wind_speed: float = 0.0, wind_direction: int = 0) -> float:
    """
    Calcula a maré real combinando a onda astronômica M2 com
    a sobre-elevação meteorológica causada pelo Vento Sul/Sudeste na Baía de Babitonga.
    """
    epoch_hours = datetime.now().timestamp() / 3600
    
    # 1. Componente Astronômico (Ciclo M2 de 12.42h)
    mare_astronomica = 0.55 * math.cos((2 * math.pi * epoch_hours) / 12.42)
    
    # 2. Componente Meteorológico (Efeito Represamento por Vento Sul: 135° a 225°)
    sobreelevacao_vento = 0.0
    is_vento_sul = 135 <= wind_direction <= 225
    
    if is_vento_sul:
        if wind_speed >= 35.0:
            sobreelevacao_vento = 0.40  # Vento forte / Ciclone (+40cm)
        elif wind_speed >= 20.0:
            sobreelevacao_vento = 0.25  # Vento moderado (+25cm)
        elif wind_speed >= 10.0:
            sobreelevacao_vento = 0.10  # Vento fraco (+10cm)

    # 3. Nível Médio de Referência (1.15m) + Astronômica + Vento
    mare_final = 1.15 + mare_astronomica + sobreelevacao_vento
    
    return round(max(0.4, mare_final), 2)

async def update_telemetry_job():
    print("[CRON]: Buscando telemetria de chuva, vento e maré em Joinville...")
    # URL atualizada com os parâmetros de vento (velocidade e direção)
    url = (
        "https://api.open-meteo.com/v1/forecast"
        "?latitude=-26.3045&longitude=-48.8456"
        "&current=precipitation,wind_speed_10m,wind_direction_10m"
        "&hourly=precipitation"
        "&past_days=1&forecast_days=1"
        "&timezone=America%2FSao_Paulo"
    )
    
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(url)
            data = res.json()
            
            # 1. Leitura da Chuva acumulada (24h)
            rain_24h = sum(data.get("hourly", {}).get("precipitation", [])[:24])
            
            # 2. Telemetria do Vento Atual
            current = data.get("current", {})
            wind_speed = current.get("wind_speed_10m", 0.0)      # em km/h
            wind_direction = current.get("wind_direction_10m", 0) # em graus (0-360)
            
            # 3. Cálculo da Maré ajustada pelo Vento Real
            tide_m = calculate_tide(wind_speed, wind_direction)
            
            # 4. Equação de Risco
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

            # 5. Resumo da Inteligência Artificial
            ai_summary = await generate_ai_summary(nivel, rain_24h, tide_m)
            
            # 6. Horário local de Joinville/Brasília (UTC-3)
            horario_joinville = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%H:%M")
            
            payload = {
                "nivel": nivel,
                "chuva_24h_mm": round(rain_24h, 1),
                "mare_babitonga_m": tide_m,
                "alerta_mistral_ai": ai_summary,
                "timestamp": horario_joinville
            }
            
            update_cache(payload)
            print(f"[CRON]: In-Memory Cache atualizado! Maré: {tide_m}m | Vento: {wind_speed}km/h ({wind_direction}°)")
    except Exception as e:
        print(f"[ERRO CRON]: {e}")