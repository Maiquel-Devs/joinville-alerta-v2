import sys
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cache_store
from mistral_client import PROIBIDAS, texto_deterministico
from risk_engine import avaliar_faixas, faixas_ativas, nivel_global
from scheduler import montar_resultado
from sources import TZ, escolher_mare, somar_chuva

A, I, X = "ativa", "inativa", "indisponivel"

# (maré m acima do NMM, chuva 24h mm, mare_1_6, mare_2_5, pluvial, nível)
TABELA = [
    (0.50, 0.0, I, I, I, "normal"),
    (1.30, 25.0, I, I, I, "normal"),        # caso que a v1 contradizia
    (1.59, 0.0, I, I, I, "normal"),         # logo abaixo de 1,6
    (1.60, 0.0, A, I, I, "atencao"),        # limite de 1,6
    (2.52, 0.0, A, I, I, "atencao"),        # logo abaixo de 2,53
    (2.53, 0.0, A, A, I, "alto"),           # limite de 2,5
    (0.50, 29.9, I, I, I, "normal"),
    (0.50, 30.0, I, I, A, "atencao"),       # limite pluvial
    (1.70, 40.0, A, I, A, "atencao"),       # maré + chuva
    (2.60, 40.0, A, A, A, "alto"),          # pior faixa ativa vence
    (None, 0.0, X, X, I, "indisponivel"),   # sem maré: nunca "normal"
    (0.50, None, I, I, X, "indisponivel"),  # sem chuva: nunca "normal"
    (None, None, X, X, X, "indisponivel"),
    (1.70, None, A, I, X, "atencao"),       # ativa vale mesmo com dado faltando
]


@pytest.mark.parametrize("mare,chuva,m16,m25,pluv,nivel", TABELA)
def test_tabela_de_risco(mare, chuva, m16, m25, pluv, nivel):
    f = avaliar_faixas(mare, chuva)
    assert (f["mare_1_6"], f["mare_2_5"], f["pluvial_vila_nova"], f["pluvial_itaum"]) == (m16, m25, pluv, pluv)
    assert nivel_global(f) == nivel


# --- maré (CIRAM) -----------------------------------------------------------

def _linha(rotulo, obs, prev, nmm="103.1"):
    f = lambda v: {"v": v, "f": None}
    return {"c": [f(rotulo), f(obs), f("  156.00"), f("    0.00"), f(prev), f("null"), f(nmm)]}


REF = datetime(2026, 10, 8, 14, 20, tzinfo=TZ)


def test_mare_medida_usa_nmm_da_propria_linha():
    payload = {"rows": [_linha("08/10 14:15", "  187.80", "null")]}
    r = escolher_mare(payload, REF)
    assert r["mare_efetiva_m"] == 0.85  # (187,8 - 103,1) / 100
    assert r["mare_origem"] == "medida"


def test_mare_na_regua_nao_e_gatilho():
    # 160 cm na régua é só 0,57 m acima do NMM: não ativa mare_1_6
    r = escolher_mare({"rows": [_linha("08/10 14:15", "160.00", "null")]}, REF)
    assert r["mare_efetiva_m"] == 0.57
    assert avaliar_faixas(r["mare_efetiva_m"], 0.0)["mare_1_6"] == I


def test_mare_sem_medida_recente_cai_para_previsao_rotulada():
    payload = {"rows": [_linha("08/10 11:00", "187.80", "null"), _linha("08/10 14:00", "null", "170.00")]}
    r = escolher_mare(payload, REF)
    assert r["mare_origem"] == "estimativa"
    assert r["mare_efetiva_m"] == 0.67


def test_mare_sem_dado_valido_e_none():
    payload = {"rows": [_linha("08/10 08:00", "187.80", "null"), _linha("08/10 14:15", "null", "null")]}
    assert escolher_mare(payload, REF) is None


def test_mare_virada_de_ano():
    ref = datetime(2026, 12, 31, 23, 50, tzinfo=TZ)
    r = escolher_mare({"rows": [_linha("31/12 23:45", "200.00", "null")]}, ref)
    assert r["mare_efetiva_m"] == 0.97


# --- chuva (Open-Meteo) -----------------------------------------------------

def _horas(n):
    return [f"2026-10-{1 + i // 24:02d}T{i % 24:02d}:00" for i in range(n)]


def test_chuva_janela_ignora_horas_futuras():
    horas = _horas(72)
    chuva = [1.0] * 72
    chuva[60] = 50.0  # hora futura em relação à atual (índice 49)
    r = somar_chuva(horas, chuva, horas[49])
    assert r == {"chuva_24h_mm": 24.0, "chuva_48h_mm": 48.0}


def test_chuva_lacuna_nao_vira_zero():
    horas = _horas(72)
    chuva = [1.0] * 72
    chuva[40] = None
    r = somar_chuva(horas, chuva, horas[49])
    assert r["chuva_24h_mm"] is None and r["chuva_48h_mm"] is None


# --- resultado, cache e texto -------------------------------------------------

def test_cache_vazio_responde_indisponivel(monkeypatch):
    monkeypatch.setattr(cache_store, "_ultimo", None)
    s = cache_store.status_geral()
    assert s["status"] == "indisponivel" and s["nivel"] == "indisponivel" and s["texto"] is None


def test_resultado_sem_nenhum_dado_e_indisponivel():
    r = montar_resultado(None, {"chuva_24h_mm": None, "chuva_48h_mm": None}, REF)
    assert r["status"] == "indisponivel" and r["nivel"] == "indisponivel"


def test_resultado_contrato():
    mare = {"mare_efetiva_m": 1.7, "mare_origem": "medida", "mare_referencia_em": "x"}
    r = montar_resultado(mare, {"chuva_24h_mm": 5.0, "chuva_48h_mm": 9.0}, REF)
    assert r["status"] == "ok" and r["nivel"] == "atencao"
    assert {"gerado_em", "validade_min", "mare_efetiva_m", "chuva_24h_mm", "faixas", "nivel", "texto"} <= r.keys()


@pytest.mark.parametrize("mare,chuva", [(0.5, 0.0), (None, None), (1.7, 40.0), (2.6, None)])
def test_texto_deterministico_respeita_linguagem(mare, chuva):
    f = avaliar_faixas(mare, chuva)
    t = texto_deterministico(nivel_global(f), faixas_ativas(f))
    junto = f"{t['titulo']} {t['mensagem']}".lower()
    assert not any(p in junto for p in PROIBIDAS)
    assert "199" in junto


def test_texto_normal_e_neutro():
    t = texto_deterministico("normal", ())
    assert "fora das manchas também podem alagar" in t["mensagem"]
