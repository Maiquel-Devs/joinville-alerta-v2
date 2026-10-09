# backend/scheduler.py
import httpx

import cache_store
from config import VALIDADE_MIN
from mistral_client import gerar_texto
from risk_engine import INDISPONIVEL, avaliar_faixas, faixas_ativas, nivel_global
from sources import agora, buscar_chuva, buscar_mare


def montar_resultado(mare: dict | None, chuva: dict, quando) -> dict:
    """Une dados coletados e regra de risco no contrato de /api/v1/status-geral."""
    mare_m = mare["mare_efetiva_m"] if mare else None
    chuva_24h = chuva["chuva_24h_mm"]
    faixas = avaliar_faixas(mare_m, chuva_24h)
    return {
        "status": "indisponivel" if all(v == INDISPONIVEL for v in faixas.values()) else "ok",
        "gerado_em": quando.isoformat(timespec="seconds"),
        "validade_min": VALIDADE_MIN,
        "mare_efetiva_m": mare_m,
        "mare_origem": mare["mare_origem"] if mare else None,
        "chuva_24h_mm": chuva_24h,
        "faixas": faixas,
        "nivel": nivel_global(faixas),
        "texto": None,
    }


async def update_telemetry_job() -> None:
    print("[CRON]: coletando chuva (Open-Meteo) e maré (CIRAM)...")
    quando = agora()
    async with httpx.AsyncClient(timeout=15.0) as client:
        chuva = await buscar_chuva(client)
        mare = await buscar_mare(client, quando)

    resultado = montar_resultado(mare, chuva, quando)
    if resultado["status"] == "indisponivel":
        # Mantém o último resultado válido; o front mostra a idade dele.
        print("[CRON]: sem dado válido; cache anterior preservado.")
        return

    chave = (resultado["nivel"], faixas_ativas(resultado["faixas"]))
    texto = cache_store.obter_texto(chave)
    if texto is None:
        texto = await gerar_texto(*chave)
        cache_store.guardar_texto(chave, texto)
    resultado["texto"] = texto

    cache_store.guardar(resultado)
    print(f"[CRON]: nível {resultado['nivel']} | maré {resultado['mare_efetiva_m']} m "
          f"({resultado['mare_origem']}) | chuva 24h {resultado['chuva_24h_mm']} mm")
