#!/usr/bin/env python3
"""Controle de qualidade e resumo dos dados do joinville_meteo (Trilha Doc 2).

OFFLINE, no computador do autor. Lê a pasta `joinville_meteo_dados/` (que fica fora
do git, CC BY 4.0, ver ATRIBUICAO.md) e grava SÓ resultados derivados em
`data/derivados/`. Não usa `origem_seprot/` (sem licença própria nos arquivos).

Não ajusta modelo de maré: os critérios de aceite da D2.C ainda não foram fixados.
Faz apenas QC do nível horário, cobertura e estatísticas descritivas.

Uso:  python -I scripts/analise_mare_qc.py [pasta_dos_dados]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "joinville_meteo_dados" / "joinville_meteo_dados"
SAIDA = RAIZ / "data" / "derivados"
ESTACOES = {
    "iateclube": "Iate Clube (estuário)",
    "flotflux": "Flotflux (Cachoeira Central)",
    "aguasdejoi": "Águas de Joinville (Bucarein)",
}

# Limites do QC do nível horário (metros, na régua de cada estação; zero da régua não documentado)
NIVEL_MIN, NIVEL_MAX = -3.0, 4.0  # corta valores absurdos (−49 e 1.045 m no arquivo bruto)
LIMITE_PICO_M = 0.6  # desvio máximo de uma hora em relação à média das duas vizinhas (a curvatura natural da maré fica perto de 0,3 m)
HORAS_TRAVADO = 6  # mesmo valor por 6 h seguidas ou mais = sensor travado (a maré real nunca fica parada)
LIMITE_CHUVA_DIA_MM = 500.0  # mesmo teto do DATA_README
LIMIAR_PLUVIAL_MM = 30.0  # config.LIMIAR_PLUVIAL_24H_MM do back-end (só para contar dias)


def carregar_horaria(cod: str) -> pd.DataFrame:
    df = pd.read_csv(ENTRADA / "series_horaria" / f"{cod}.csv.gz", parse_dates=["date"])
    return df.set_index("date").sort_index()


def qc_nivel(nivel: pd.Series) -> tuple[pd.Series, dict]:
    """Devolve o nível com o inválido como NaN (nunca zero) e a contagem por motivo."""
    x = nivel.copy()
    n0 = int(x.notna().sum())
    fora = (x < NIVEL_MIN) | (x > NIVEL_MAX)
    x[fora] = np.nan
    # sensor travado: sequência longa do mesmo valor (o Iate Clube fica em 2,5 m por milhares de horas)
    serie = x.dropna()
    grupo = (serie != serie.shift()).cumsum()
    travado = serie.groupby(grupo).transform("size") >= HORAS_TRAVADO
    travado = travado.reindex(x.index, fill_value=False)
    x[travado] = np.nan
    # zero exato isolado = sentinela provável: vizinhos longe de zero
    viz = pd.concat([x.shift(1), x.shift(-1)], axis=1).abs().min(axis=1)
    zero = (nivel == 0) & ~fora & (viz.isna() | (viz > 0.3))
    x[zero] = np.nan
    # Pico: hora que foge da média das vizinhas. Duas passadas, porque o vizinho de um pico
    # grande também parece anômalo na primeira. Com vizinha ausente, a hora não é testada.
    pico = pd.Series(False, index=x.index)
    for _ in range(2):
        desvio = (x - (x.shift(1) + x.shift(-1)) / 2).abs()
        novo = desvio > LIMITE_PICO_M
        # em um par de picos vizinhos, remove só o pior de cada trio
        novo &= desvio >= pd.concat([desvio.shift(1), desvio.shift(-1)], axis=1).max(axis=1).fillna(0)
        pico |= novo
        x[novo] = np.nan
    return x, {
        "com_nivel_bruto": n0,
        "fora_da_faixa": int(fora.sum()),
        "sensor_travado": int(travado.sum()),
        "zero_isolado": int(zero.sum()),
        "pico": int(pico.sum()),
        "com_nivel_apos_qc": int(x.notna().sum()),
    }


def resumo_estacao(cod: str) -> dict:
    h = carregar_horaria(cod)
    nivel, qc = qc_nivel(h["level"])
    v = nivel.dropna()
    cobertura = {
        int(a): {"horas_com_nivel": int(g.notna().sum()), "horas_registradas": int(len(g))}
        for a, g in nivel.groupby(nivel.index.year)
    }
    med = float(v.median())
    # amplitude do dia, só em dias com >= 20 horas válidas
    dia = nivel.groupby(nivel.index.date)
    amp = (dia.max() - dia.min())[dia.count() >= 20]
    max_ano = nivel.groupby(nivel.index.year).max().dropna()
    return {
        "nome": ESTACOES[cod],
        "primeiro_nivel": str(v.index.min()),
        "ultimo_nivel": str(v.index.max()),
        "qc": qc,
        "mediana_m": round(med, 3),
        "media_m": round(float(v.mean()), 3),
        "percentis_m": {f"p{p}": round(float(v.quantile(p / 100)), 3) for p in (1, 5, 50, 95, 99, 99.9)},
        "amplitude_diaria_m": {"mediana": round(float(amp.median()), 3), "p95": round(float(amp.quantile(0.95)), 3)},
        "maximo_por_ano_m": {int(a): round(float(m), 3) for a, m in max_ano.items()},
        # Hipótese, NÃO resultado: a mediana como aproximação do nível médio do mar.
        "pct_acima_da_mediana_m": {f"p{p}": round(float(v.quantile(p / 100)) - med, 3) for p in (95, 99, 99.9)},
        "cobertura_por_ano": cobertura,
    }


def resumo_chuva(cod: str) -> dict:
    d = pd.read_csv(ENTRADA / "series_diaria" / f"{cod}.csv", parse_dates=["date"]).set_index("date")
    p = d["prec"]
    invalidos = int(((p < 0) | (p > LIMITE_CHUVA_DIA_MM)).sum())
    v = p.where((p >= 0) & (p <= LIMITE_CHUVA_DIA_MM)).dropna()
    return {
        "dias_validos": int(len(v)),
        "dias_invalidos_removidos": invalidos,
        "p99_mm_dia": round(float(v.quantile(0.99)), 1),
        "maximo_mm_dia": round(float(v.max()), 1),
        f"dias_ge_{int(LIMIAR_PLUVIAL_MM)}mm_por_ano": {
            int(a): int(n) for a, n in (v >= LIMIAR_PLUVIAL_MM).groupby(v.index.year).sum().items()
        },
        "aviso": "Chuva diária (dia civil), não janela móvel de 24 h; serve de ordem de grandeza para o limiar pluvial.",
    }


def relatorio(res: dict) -> str:
    L = [
        "# Resumo do controle de qualidade — joinville_meteo (derivado)",
        "",
        "Gerado por `scripts/analise_mare_qc.py`. **Resultados derivados**; os dados brutos não estão no repositório.",
        "",
        "**Fonte:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). "
        "Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. Licença CC BY 4.0. Termos da SEPROT ainda sem confirmação formal.",
        "",
        "**Achado:** o nível do Iate Clube fica **travado em 2,5 m** por milhares de horas (2022, 2023 e 2025). "
        "Os anos 2022–2023, que o plano previa como teste do ajuste, perdem boa parte da cobertura. Ver a tabela por ano.",
        "",
        "**Cuidados:** o zero da régua de cada estação não está documentado e é diferente do referencial do PDDU. "
        "Os números abaixo estão na régua de cada estação e **não** são comparáveis com os gatilhos de 1,6 m e 2,5 m. "
        "Nada aqui foi ajustado a um modelo de maré (critérios da D2.C ainda não fixados).",
        "",
        f"**QC do nível:** descarta fora de [{NIVEL_MIN}; {NIVEL_MAX}] m, sensor travado (mesmo valor por {HORAS_TRAVADO} h ou mais), zero exato isolado e picos (hora que foge em mais de {LIMITE_PICO_M} m da média das duas vizinhas, em duas passadas). O inválido vira ausente, nunca zero.",
        "",
        "## Nível por estação",
        "",
        "| Estação | Primeiro | Último | Horas após QC | Fora da faixa | Travado | Zeros | Picos | Mediana (m) | p99 − mediana (m) | Amplitude diária mediana (m) |",
        "|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|",
    ]
    for r in res["nivel"].values():
        q = r["qc"]
        L.append(
            f"| {r['nome']} | {r['primeiro_nivel'][:10]} | {r['ultimo_nivel'][:10]} | {q['com_nivel_apos_qc']:,} | "
            f"{q['fora_da_faixa']} | {q['sensor_travado']} | {q['zero_isolado']} | {q['pico']} | {r['mediana_m']} | "
            f"{r['pct_acima_da_mediana_m']['p99']} | {r['amplitude_diaria_m']['mediana']} |"
        )
    L += ["", "## Cobertura de nível por ano (horas com nível / horas registradas, após QC)", ""]
    anos = sorted({a for r in res["nivel"].values() for a in r["cobertura_por_ano"]})
    L += [
        "| Ano | " + " | ".join(r["nome"] for r in res["nivel"].values()) + " |",
        "|---|" + "--:|" * len(res["nivel"]),
    ]
    for a in anos:
        cel = []
        for r in res["nivel"].values():
            c = r["cobertura_por_ano"].get(a)
            cel.append(f"{c['horas_com_nivel']:,} / {c['horas_registradas']:,}" if c else "—")
        L.append(f"| {a} | " + " | ".join(cel) + " |")
    L += ["", "## Chuva diária (ordem de grandeza para o limiar pluvial)", ""]
    for c, r in res["chuva"].items():
        L.append(
            f"- **{ESTACOES[c]}:** {r['dias_validos']:,} dias válidos; p99 = {r['p99_mm_dia']} mm/dia; "
            f"máximo = {r['maximo_mm_dia']} mm/dia; {r['dias_invalidos_removidos']} dias removidos no QC."
        )
    L += ["", "_" + next(iter(res["chuva"].values()))["aviso"] + "_", ""]
    return "\n".join(L)


def main():
    if not ENTRADA.exists():
        sys.exit(f"Pasta de dados não encontrada: {ENTRADA}")
    res = {"nivel": {c: resumo_estacao(c) for c in ESTACOES}, "chuva": {c: resumo_chuva(c) for c in ESTACOES}}
    SAIDA.mkdir(parents=True, exist_ok=True)
    texto = relatorio(res)
    (SAIDA / "mare_resumo.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    (SAIDA / "mare_qc_relatorio.md").write_text(texto, encoding="utf-8")
    print(f"Gravado: {SAIDA}")


if __name__ == "__main__":
    main()
