# backend/risk_engine.py
# Única regra de risco do sistema. Função pura: sem rede, sem relógio.
from config import (
    FAIXAS,
    LIMIAR_PLUVIAL_24H_MM,
    MARE_1_6_M,
    MARE_2_5_M,
    NIVEIS,
    NIVEL_DA_FAIXA,
)

ATIVA = "ativa"
INATIVA = "inativa"
INDISPONIVEL = "indisponivel"


def _acima(valor: float | None, limiar: float) -> str:
    if valor is None:
        return INDISPONIVEL
    return ATIVA if valor >= limiar else INATIVA


def avaliar_faixas(mare_efetiva_m: float | None, chuva_24h_mm: float | None) -> dict[str, str]:
    # As duas faixas pluviais usam o mesmo limiar até a Etapa 0 separá-las.
    pluvial = _acima(chuva_24h_mm, LIMIAR_PLUVIAL_24H_MM)
    return {
        "mare_1_6": _acima(mare_efetiva_m, MARE_1_6_M),
        "mare_2_5": _acima(mare_efetiva_m, MARE_2_5_M),
        "pluvial_vila_nova": pluvial,
        "pluvial_itaum": pluvial,
    }


def nivel_global(faixas: dict[str, str]) -> str:
    """Pior faixa ativa. Sem faixa ativa, "normal" só se TODAS têm dado."""
    ativas = [NIVEIS.index(NIVEL_DA_FAIXA[f]) for f in FAIXAS if faixas[f] == ATIVA]
    if ativas:
        return NIVEIS[max(ativas)]
    if any(faixas[f] == INDISPONIVEL for f in FAIXAS):
        return INDISPONIVEL
    return "normal"


def faixas_ativas(faixas: dict[str, str]) -> tuple[str, ...]:
    return tuple(f for f in FAIXAS if faixas[f] == ATIVA)
