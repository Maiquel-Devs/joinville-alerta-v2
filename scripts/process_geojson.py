#!/usr/bin/env python3
"""Pipeline OFFLINE (roda no computador do autor, nunca em produção).

Cruza as manchas do PDDU (shapefiles, SIRGAS 2000 / UTM 22S) com as ruas do
OpenStreetMap (Overpass) e gera um GeoJSON estático em que cada trecho carrega
as faixas de gatilho em que está.

Etapas (rode na ordem):
  inspecionar  lista campos, CRS e valores dos shapefiles (resolve a tarefa 0.4)
  baixar       baixa as ruas na área das manchas e guarda o JSON bruto
  cruzar       gera data/ruas_risco.geojson e imprime o relatório de conferência

Exemplo:
  python scripts/process_geojson.py inspecionar
  python scripts/process_geojson.py baixar
  python scripts/process_geojson.py cruzar
"""
import argparse
import gzip
import json
import math
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

import shapefile  # pyshp
import shapely
from shapely.geometry import LineString, MultiLineString, shape
from shapely.ops import linemerge, transform, unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid

RAIZ = Path(__file__).resolve().parent.parent
PASTA_MANCHAS = RAIZ / "data" / "raw" / "pddu"
PASTA_GEOJSON = RAIZ / "data" / "geojson"
RUAS_BRUTAS = RAIZ / "data" / "raw" / "overpass_ruas.json"
SAIDA = RAIZ / "data" / "ruas_risco.geojson"

# Camada (nome do shapefile, sem extensão) -> faixa. Tabela da tarefa 0.4:
# o cenário de inundacao_vila_nova ("Futuro") e o de inundacao_itaum ainda
# estão em aberto; ajuste aqui e use --filtro para escolher o cenário
# (Vila Nova: campos tempretor = 5/10/25/50 anos e status_1 = Atual/Futuro).
CAMADAS = {
    "mare_cachoeira_1_6m": "mare_1_6",
    "mare_cachoeira_2_5m": "mare_2_5",
    "inundacao_vila_nova": "pluvial_vila_nova",
    "inundacao_itaum": "pluvial_itaum",
}

# Tipos de via descartados (não são "rua" para o cidadão)
VIAS_IGNORADAS = (
    "footway|path|steps|cycleway|pedestrian|track|bridleway|corridor|"
    "construction|proposed|raceway|busway|elevator|service"
)
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
USER_AGENT = "joinville-alerta-v2/pipeline-offline (projeto academico Univille)"

# Decisões em aberto (2.4 e 2.5): valores iniciais, ajuste ao ver o resultado.
TAMANHO_MIN_PEDACO_M = 10.0
SIMPLIFICAR_M = 1.0   # tolerância de simplificação, em metros
CASAS_DECIMAIS = 5    # ~1 m

AMOSTRA_2_7 = ["Rua Minas Gerais", "Rua Urussanga", "Rua Inácio Bastos"]

# --- UTM (SIRGAS 2000 = GRS80) <-> WGS84, séries de Krüger ----------------------
# Diferença GRS80/WGS84 é sub-milimétrica; evita a dependência do pyproj.

_A = 6378137.0
_F = 1 / 298.257222101
_N = _F / (2 - _F)
_K0, _E0, _N0, _LON0 = 0.9996, 500000.0, 10000000.0, math.radians(-51.0)  # zona 22 sul
_AA = _A / (1 + _N) * (1 + _N**2 / 4 + _N**4 / 64)
_ALFA = (_N / 2 - 2 * _N**2 / 3 + 5 * _N**3 / 16, 13 * _N**2 / 48 - 3 * _N**3 / 5, 61 * _N**3 / 240)
_BETA = (_N / 2 - 2 * _N**2 / 3 + 37 * _N**3 / 96, _N**2 / 48 + _N**3 / 15, 17 * _N**3 / 480)
_DELTA = (2 * _N - 2 * _N**2 / 3 - 2 * _N**3, 7 * _N**2 / 3 - 8 * _N**3 / 5, 56 * _N**3 / 15)


def graus_para_utm(lon, lat, z=None):
    phi, lam = math.radians(lat), math.radians(lon) - _LON0
    e = 2 * math.sqrt(_N) / (1 + _N)
    t = math.sinh(math.atanh(math.sin(phi)) - e * math.atanh(e * math.sin(phi)))
    xi0 = math.atan2(t, math.cos(lam))
    eta0 = math.atanh(math.sin(lam) / math.hypot(1, t))
    xi = xi0 + sum(a * math.sin(2 * j * xi0) * math.cosh(2 * j * eta0) for j, a in enumerate(_ALFA, 1))
    eta = eta0 + sum(a * math.cos(2 * j * xi0) * math.sinh(2 * j * eta0) for j, a in enumerate(_ALFA, 1))
    return _E0 + _K0 * _AA * eta, _N0 + _K0 * _AA * xi


def utm_para_graus(x, y, z=None):
    xi, eta = (y - _N0) / (_K0 * _AA), (x - _E0) / (_K0 * _AA)
    xi0 = xi - sum(b * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, b in enumerate(_BETA, 1))
    eta0 = eta - sum(b * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, b in enumerate(_BETA, 1))
    chi = math.asin(math.sin(xi0) / math.cosh(eta0))
    phi = chi + sum(d * math.sin(2 * j * chi) for j, d in enumerate(_DELTA, 1))
    lam = _LON0 + math.atan2(math.sinh(eta0), math.cos(xi0))
    return math.degrees(lam), math.degrees(phi)


def _para_utm(g):
    return transform(graus_para_utm, g)


def _para_graus(g):
    return transform(utm_para_graus, g)


# --- Manchas -------------------------------------------------------------------

def _feicoes(camada):
    """Lê uma camada como [(atributos, geometria em UTM 22S)] e diz de onde veio.

    Prefere o shapefile bruto (SIRGAS 2000 / UTM 22S); se não houver, usa o
    GeoJSON da v1 em data/geojson (WGS84, já reprojetado).
    """
    shp = PASTA_MANCHAS / f"{camada}.shp"
    gj = PASTA_GEOJSON / f"{camada}.geojson"
    if shp.exists():
        with shapefile.Reader(str(shp), encoding="latin-1") as r:
            itens = [(sr.record.as_dict(), make_valid(shape(sr.shape.__geo_interface__)))
                     for sr in r.iterShapeRecords()]
        prj = shp.with_suffix(".prj")
        return itens, f"shapefile, {prj.read_text(errors='replace')[:60] if prj.exists() else 'sem .prj (assumido UTM 22S)'}"
    if gj.exists():
        feicoes = json.loads(gj.read_text(encoding="utf-8"))["features"]
        itens = [(f["properties"], _para_utm(make_valid(shape(f["geometry"])))) for f in feicoes]
        return itens, "GeoJSON da v1 (assumido WGS84)"
    return None, None


def inspecionar():
    algum = False
    for camada, faixa in CAMADAS.items():
        itens, origem = _feicoes(camada)
        if itens is None:
            print(f"\n== {camada}: NÃO ENCONTRADA (procurei em {PASTA_MANCHAS} e {PASTA_GEOJSON})")
            continue
        algum = True
        print(f"\n== {camada}  ({len(itens)} feições)  faixa: {faixa}\n   origem: {origem}")
        campos = sorted({k for props, _ in itens for k in props})
        print(f"   campos: {campos}")
        for campo in campos:
            valores = sorted({str(props.get(campo)) for props, _ in itens})
            if len(valores) <= 12:
                print(f"     {campo}: {valores}")
        km2 = unary_union([g for _, g in itens]).area / 1e6
        print(f"   área total: {km2:.2f} km2")
    if not algum:
        sys.exit("Nenhuma camada encontrada.")


def _filtros(lista):
    """--filtro camada:campo=valor (repetível)  ->  {camada: [(campo, valor), ...]}"""
    out = {}
    for f in lista or []:
        camada, resto = f.split(":", 1)
        campo, valor = resto.split("=", 1)
        out.setdefault(camada, []).append((campo, valor))
    return out


def ler_manchas(filtros):
    """Devolve {faixa: geometria em UTM} com as áreas já sem sobreposição de maré."""
    por_faixa = {}
    for camada, faixa in CAMADAS.items():
        itens, _ = _feicoes(camada)
        if itens is None:
            print(f"[aviso] camada {camada} não encontrada; faixa {faixa} ficará de fora.")
            continue
        geoms = [g for props, g in itens
                 if all(str(props.get(c)) == v for c, v in filtros.get(camada, []))]
        if not geoms:
            print(f"[aviso] {camada}: nenhuma feição após o filtro.")
            continue
        uniao = unary_union(geoms)
        minx, miny, maxx, maxy = uniao.bounds
        if not (100_000 < minx and maxx < 900_000 and 6_500_000 < miny and maxy < 8_000_000):
            sys.exit(f"{camada}: coordenadas fora da região esperada (bbox UTM {uniao.bounds}). "
                     "Confira o CRS com a etapa 'inspecionar'.")
        por_faixa[faixa] = uniao

    # "só na 2,5 m": o que já está na mancha de 1,6 m pertence à faixa mare_1_6
    if "mare_1_6" in por_faixa and "mare_2_5" in por_faixa:
        por_faixa["mare_2_5"] = por_faixa["mare_2_5"].difference(por_faixa["mare_1_6"])
    return por_faixa


# --- Ruas (Overpass) ---------------------------------------------------------------

def baixar(areas, grade):
    minx, miny, maxx, maxy = unary_union(list(areas.values())).bounds
    sul, oeste = utm_para_graus(minx, miny)[::-1]
    norte, leste = utm_para_graus(maxx, maxy)[::-1]
    margem = 0.002
    sul, oeste, norte, leste = sul - margem, oeste - margem, norte + margem, leste + margem

    vias = {}
    dl, dn = (leste - oeste) / grade, (norte - sul) / grade
    for i in range(grade):
        for j in range(grade):
            bbox = (sul + j * dn, oeste + i * dl, sul + (j + 1) * dn, oeste + (i + 1) * dl)
            consulta = (
                f'[out:json][timeout:180];way["highway"]["highway"!~"^({VIAS_IGNORADAS})$"]'
                f"({bbox[0]:.5f},{bbox[1]:.5f},{bbox[2]:.5f},{bbox[3]:.5f});out tags geom;"
            )
            print(f"[overpass] célula {i * grade + j + 1}/{grade * grade} ...")
            for url in OVERPASS:
                try:
                    req = urllib.request.Request(
                        url,
                        data=urllib.parse.urlencode({"data": consulta}).encode(),
                        headers={"User-Agent": USER_AGENT},
                    )
                    with urllib.request.urlopen(req, timeout=240) as res:
                        for el in json.load(res)["elements"]:
                            vias[el["id"]] = el
                    break
                except Exception as e:
                    print(f"   falhou em {url}: {e}")
            else:
                sys.exit("Overpass indisponível; tente depois ou aumente --grade.")
    RUAS_BRUTAS.parent.mkdir(parents=True, exist_ok=True)
    RUAS_BRUTAS.write_text(json.dumps({"elements": list(vias.values())}), encoding="utf-8")
    print(f"[overpass] {len(vias)} vias salvas em {RUAS_BRUTAS.relative_to(RAIZ)}")


def ler_ruas():
    if not RUAS_BRUTAS.exists():
        sys.exit("Rode a etapa 'baixar' antes (ou coloque o JSON do Overpass em " + str(RUAS_BRUTAS) + ").")
    for el in json.loads(RUAS_BRUTAS.read_text(encoding="utf-8"))["elements"]:
        pts = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
        if len(pts) >= 2:
            yield el["id"], el["tags"], _para_utm(LineString(pts))


# --- Cruzamento ------------------------------------------------------------------------

def pedacos(linha, nomes, areas, bordas, arvore):
    """Divide a linha nas bordas das manchas; devolve {faixas(tuple): [linhas]}.

    Caminho rápido: via inteira dentro de uma mancha não precisa de corte.
    Só as vias que cruzam uma borda recortam a borda à janela da própria via.
    """
    cand = [i for i in arvore.query(linha) if areas[i].intersects(linha)]
    if not cand:
        return {}
    cruzam = [i for i in cand if not areas[i].contains(linha)]
    if not cruzam:
        return {tuple(sorted(nomes[i] for i in cand)): [linha]}

    janela = linha.bounds
    recortes = [shapely.clip_by_rect(bordas[i], *janela) for i in cruzam]
    cortada = linha.difference(unary_union(recortes))
    segmentos = [cortada] if isinstance(cortada, LineString) else list(getattr(cortada, "geoms", []))
    grupos = {}
    for seg in segmentos:
        if seg.is_empty or seg.length == 0:
            continue
        meio = seg.interpolate(0.5, normalized=True)
        faixas = tuple(sorted(nomes[i] for i in cand if areas[i].covers(meio)))
        if faixas:
            grupos.setdefault(faixas, []).append(seg)
    return grupos


def cruzar(filtros):
    por_faixa = ler_manchas(filtros)
    if not por_faixa:
        sys.exit("Nenhuma mancha carregada.")
    nomes = list(por_faixa)
    areas = [por_faixa[n] for n in nomes]
    arvore = STRtree(areas)
    bordas = [a.boundary for a in areas]
    shapely.prepare(areas)

    features, descartados_curtos, vias_total, sem_nome = [], 0, 0, 0
    for osm_id, tags, linha in ler_ruas():
        vias_total += 1
        for faixas, segs in pedacos(linha, nomes, areas, bordas, arvore).items():
            juntos = linemerge(segs) if len(segs) > 1 else segs[0]
            if juntos.length < TAMANHO_MIN_PEDACO_M:
                descartados_curtos += 1
                continue
            geo = _para_graus(juntos.simplify(SIMPLIFICAR_M, preserve_topology=True))
            coords = json.loads(json.dumps(geo.__geo_interface__["coordinates"]), parse_float=lambda s: round(float(s), CASAS_DECIMAIS))
            nome = tags.get("name")
            sem_nome += nome is None
            features.append(
                {
                    "type": "Feature",
                    "properties": {"osm": osm_id, "nome": nome, "faixas": list(faixas), "m": round(juntos.length)},
                    "geometry": {"type": geo.geom_type, "coordinates": coords},
                }
            )

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    relatorio(features, vias_total, descartados_curtos, sem_nome)


def _norm(s):
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()


def relatorio(features, vias_total, curtos, sem_nome):
    bruto = SAIDA.read_bytes()
    print(f"\n=== Relatório ({SAIDA.relative_to(RAIZ)}) ===")
    print(f"vias lidas: {vias_total} | trechos gerados: {len(features)} | pedaços < {TAMANHO_MIN_PEDACO_M:.0f} m descartados: {curtos}")
    print(f"trechos sem nome no OSM: {sem_nome}")
    print(f"tamanho: {len(bruto) / 1e6:.2f} MB | gzip: {len(gzip.compress(bruto)) / 1e6:.2f} MB")
    contagem = {}
    for f in features:
        k = "+".join(f["properties"]["faixas"])
        contagem[k] = contagem.get(k, 0) + f["properties"]["m"]
    for k, m in sorted(contagem.items()):
        print(f"  {k}: {m / 1000:.1f} km")
    print("\nAmostra da tarefa 2.7 (confira a olho no mapa):")
    for rua in AMOSTRA_2_7:
        achados = [f for f in features if _norm(f["properties"]["nome"]) == _norm(rua)]
        faixas = sorted({x for f in achados for x in f["properties"]["faixas"]})
        print(f"  {rua}: {len(achados)} trecho(s) {faixas if achados else '- fora de todas as manchas ou sem nome no OSM'}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("etapa", choices=["inspecionar", "baixar", "cruzar"])
    p.add_argument("--filtro", action="append", metavar="CAMADA:CAMPO=VALOR",
                   help="mantém só feições com CAMPO=VALOR na camada; repetível (ex.: inundacao_vila_nova:status_1=Atual)")
    p.add_argument("--grade", type=int, default=2, help="divide a área em GRADE x GRADE consultas ao Overpass")
    a = p.parse_args()

    if a.etapa == "inspecionar":
        inspecionar()
    elif a.etapa == "baixar":
        baixar(ler_manchas(_filtros(a.filtro)), a.grade)
    else:
        cruzar(_filtros(a.filtro))


if __name__ == "__main__":
    main()
