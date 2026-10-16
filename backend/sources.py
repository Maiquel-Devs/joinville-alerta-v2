# backend/sources.py
# Coleta de dados externos. Cada função devolve None quando não há dado válido.
import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from config import (
    CIRAM_MARE_URL,
    LATITUDE,
    LONGITUDE,
    MARE_IDADE_MAX_MIN,
)

TZ = ZoneInfo("America/Sao_Paulo")
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def agora() -> datetime:
    return datetime.now(TZ)


# --- Chuva (Open-Meteo) -----------------------------------------------------

def somar_chuva(horas: list[str], precipitacao: list, hora_atual: str) -> dict[str, float | None]:
    """Soma as 24 h e as 48 h que terminam na hora atual (inclusive).

    `horas` e `hora_atual` no formato ISO local ("2026-10-08T19:00").
    Qualquer lacuna (None) na janela invalida a soma: nunca vira zero.
    """
    if hora_atual not in horas:
        return {"chuva_24h_mm": None, "chuva_48h_mm": None}
    fim = horas.index(hora_atual) + 1

    def janela(n: int) -> float | None:
        if fim < n:
            return None
        valores = precipitacao[fim - n : fim]
        if any(v is None for v in valores):
            return None
        return round(sum(valores), 1)

    return {"chuva_24h_mm": janela(24), "chuva_48h_mm": janela(48)}


async def buscar_chuva(client: httpx.AsyncClient, tentativas: int = 3) -> dict[str, float | None]:
    """Open-Meteo com retentativa (IPs compartilhados do Render às vezes levam 429/timeout).

    Esgotadas as tentativas devolve None: sem chuva válida a faixa pluvial fica
    `indisponivel`, nunca 0 mm.
    """
    vazio = {"chuva_24h_mm": None, "chuva_48h_mm": None}
    params = {
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "current": "precipitation",
        "hourly": "precipitation",
        "past_days": 2,
        "forecast_days": 1,
        "timezone": "America/Sao_Paulo",
    }
    for n in range(1, tentativas + 1):
        try:
            res = await client.get(OPEN_METEO_URL, params=params)
            res.raise_for_status()
            d = res.json()
            hora_atual = d["current"]["time"][:13] + ":00"
            return somar_chuva(d["hourly"]["time"], d["hourly"]["precipitation"], hora_atual)
        except Exception as e:
            corpo = getattr(getattr(e, "response", None), "text", "")[:200]
            print(f"[ERRO OPEN-METEO] tentativa {n}/{tentativas}: {type(e).__name__}: {e} {corpo}")
            if n < tentativas:
                await asyncio.sleep(2 * n)
    return vazio


# --- Maré (marégrafo CIRAM/Epagri, Joinville) --------------------------------

def _num(celula: str | None) -> float | None:
    if celula is None or celula.strip() in ("", "null"):
        return None
    return float(celula)


def _data(rotulo: str, ref: datetime) -> datetime:
    """"07/10 00:15" não traz ano: escolhe o ano que fica mais perto de `ref`."""
    dm, hm = rotulo.split(" ")
    dia, mes = (int(x) for x in dm.split("/"))
    hora, minuto = (int(x) for x in hm.split(":"))
    candidatas = [
        datetime(ano, mes, dia, hora, minuto, tzinfo=TZ)
        for ano in (ref.year - 1, ref.year, ref.year + 1)
    ]
    return min(candidatas, key=lambda dt: abs(dt - ref))


def escolher_mare(payload: dict, ref: datetime) -> dict | None:
    """Maré efetiva (m acima do NMM) a partir do JSON do CIRAM.

    Preferência: leitura medida recente. Sem ela, previsão MohidSC da hora
    mais próxima, marcada como estimativa. Sem nenhuma das duas: None.
    """
    limite = timedelta(minutes=MARE_IDADE_MAX_MIN)
    medida = previsao = None
    for linha in payload["rows"]:
        c = [x["v"] for x in linha["c"]]
        quando = _data(c[0], ref)
        obs, prev, nmm = _num(c[1]), _num(c[4]), _num(c[6])
        if nmm is None or abs(quando - ref) > limite:
            continue
        if obs is not None and quando <= ref + timedelta(minutes=5):
            if medida is None or quando > medida[0]:
                medida = (quando, obs, nmm)
        if prev is not None:
            if previsao is None or abs(quando - ref) < abs(previsao[0] - ref):
                previsao = (quando, prev, nmm)

    escolha, origem = (medida, "medida") if medida else (previsao, "estimativa")
    if escolha is None:
        return None
    quando, cm, nmm = escolha
    return {
        "mare_efetiva_m": round((cm - nmm) / 100, 2),
        "mare_origem": origem,
        "mare_referencia_em": quando.isoformat(timespec="minutes"),
    }


async def buscar_mare(client: httpx.AsyncClient, ref: datetime) -> dict | None:
    try:
        res = await client.get(CIRAM_MARE_URL)
        res.raise_for_status()
        return escolher_mare(res.json(), ref)
    except Exception as e:
        print(f"[ERRO CIRAM]: {e}")
        return None
