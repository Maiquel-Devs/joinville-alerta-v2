#!/usr/bin/env python3
"""Pipeline OFFLINE: acrescenta a altitude aproximada de cada trecho em data/ruas_risco.geojson.

Fonte: curvas de nível 1x1 m (área urbana, 2007) e pontos cotados 1:1000 da Prefeitura de Joinville
(Base Cartográfica 2007/2010, SIGMeo/SIMGeo), em `shp_altimetria/Altimetria/`.
A pasta fica FORA do git (2,3 GB). Cita-se a fonte no README.

Método: triangulação (TIN, interpolação linear) sobre os vértices das curvas e os pontos
cotados que caem na área das ruas; amostra a cada ~10 m ao longo de cada trecho.
Grava `cota_minima`, `cota_media` e `cota_maxima` em metros, arredondadas a 0,5 m
(a equidistância das curvas é 1 m, então decimais finos seriam precisão inventada).

ATENÇÃO: o referencial vertical das curvas NÃO está documentado na pasta (Altimetria.txt
não diz). Não compare estas cotas com a altura da maré nem com os gatilhos do PDDU sem antes
confirmar que é o mesmo zero (tarefa 0.2).

Roda DEPOIS de `process_geojson.py cruzar` (que regenera o arquivo sem cotas). Idempotente.

Uso:  python -I scripts/cotas_ruas.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import shapefile  # pyshp
from pyproj import Transformer
from scipy.interpolate import LinearNDInterpolator

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "shp_altimetria" / "Altimetria"
RUAS = RAIZ / "data" / "ruas_risco.geojson"
PASSO_M = 10.0  # amostra ao longo do trecho
MARGEM_M = 300.0  # margem da caixa das ruas ao filtrar curvas e pontos
ARREDONDA_M = 0.5

# SIRGAS 2000 geográfico -> UTM 22S (o mesmo CRS dos shapefiles)
para_utm = Transformer.from_crs("EPSG:4674", "EPSG:31982", always_xy=True)


def vertices_curvas(caixa):
    """Vértices (x, y, z) das curvas de nível 1x1 m (área urbana) dentro da caixa.

    Mantém um vértice a cada ~8 m ao longo de cada curva, para a triangulação caber na memória.
    """
    r = shapefile.Reader(str(PASTA / "curvas_nivel_1x1"), encoding="latin-1")
    xmin, ymin, xmax, ymax = caixa
    xs, ys, zs = [], [], []
    for sh, rec in zip(r.iterShapes(), r.iterRecords()):
        if not sh.points:
            continue
        b = sh.bbox
        if b[2] < xmin or b[0] > xmax or b[3] < ymin or b[1] > ymax:
            continue
        z = float(rec["ELEVATION"])
        ux = uy = None
        for x, y in sh.points:
            if not (xmin <= x <= xmax and ymin <= y <= ymax):
                continue
            if ux is None or (x - ux) ** 2 + (y - uy) ** 2 >= 64.0:
                xs.append(x), ys.append(y), zs.append(z)
                ux, uy = x, y
    return np.column_stack([xs, ys, zs])


def pontos_cotados(caixa):
    r = shapefile.Reader(str(PASTA / "ponto_cotado_1000"), encoding="latin-1")
    xmin, ymin, xmax, ymax = caixa
    out = []
    for i in range(len(r)):
        try:
            sh = r.shape(i)
        except Exception:
            continue
        if not sh.points:
            continue
        x, y = sh.points[0]
        if xmin <= x <= xmax and ymin <= y <= ymax:
            out.append((x, y, float(r.record(i)["elevation"])))
    return np.array(out).reshape(-1, 3)


def amostras(coords_utm):
    """Pontos a cada ~PASSO_M ao longo de uma polilinha em UTM (inclui as pontas)."""
    pts = []
    for (x0, y0), (x1, y1) in zip(coords_utm[:-1], coords_utm[1:]):
        d = float(np.hypot(x1 - x0, y1 - y0))
        n = max(1, int(round(d / PASSO_M)))
        for i in range(n):
            t = i / n
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    pts.append(tuple(coords_utm[-1]))
    return np.array(pts)


def linhas(geom):
    return geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]


def main():
    if not PASTA.exists():
        sys.exit(f"Pasta de altimetria não encontrada: {PASTA}")
    dados = json.loads(RUAS.read_text(encoding="utf-8"))
    feats = dados["features"]

    todas = []
    for f in feats:
        for l in linhas(f["geometry"]):
            todas.extend(l)
    xy = np.array([para_utm.transform(lon, lat) for lon, lat in todas])
    caixa = (xy[:, 0].min() - MARGEM_M, xy[:, 1].min() - MARGEM_M, xy[:, 0].max() + MARGEM_M, xy[:, 1].max() + MARGEM_M)
    print("caixa UTM das ruas:", [round(c) for c in caixa])

    cur = vertices_curvas(caixa)
    pc = pontos_cotados(caixa)
    print(f"vértices de curvas: {len(cur):,} | pontos cotados: {len(pc):,}")
    base = np.vstack([cur, pc])
    base = np.unique(base.round(2), axis=0)
    # um z por (x, y): média se houver repetição
    chave = {}
    for x, y, z in base:
        chave.setdefault((x, y), []).append(z)
    pts = np.array([(x, y) for x, y in chave])
    zs = np.array([np.mean(v) for v in chave.values()])
    tin = LinearNDInterpolator(pts, zs)

    sem = 0
    todas_z = []
    for f in feats:
        z = []
        for l in linhas(f["geometry"]):
            u = np.array([para_utm.transform(lon, lat) for lon, lat in l])
            a = amostras(u)
            v = tin(a[:, 0], a[:, 1])
            z.extend(v[~np.isnan(v)])
        p = f["properties"]
        for k in ("cota_minima", "cota_media", "cota_maxima"):
            p.pop(k, None)
        if not z:
            sem += 1
            continue
        arr = lambda v: round(round(float(v) / ARREDONDA_M) * ARREDONDA_M, 1)
        p["cota_minima"], p["cota_media"], p["cota_maxima"] = arr(min(z)), arr(np.mean(z)), arr(max(z))
        todas_z.append(np.mean(z))

    RUAS.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    z = np.array(todas_z)
    print(f"trechos: {len(feats)} | com cota: {len(z)} | sem cota (fora das curvas): {sem}")
    print(f"cota média por trecho: min {z.min():.1f}, mediana {np.median(z):.1f}, p95 {np.percentile(z, 95):.1f}, máx {z.max():.1f} m")


if __name__ == "__main__":
    main()
