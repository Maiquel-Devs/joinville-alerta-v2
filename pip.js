// Ponto-em-polígono para FeatureCollection de Polygon/MultiPolygon (GeoJSON, [lng, lat]).
// Sem dependências; roda no navegador e no Node (para teste).
(function (raiz) {
  function noAnel(anel, x, y) {
    let dentro = false;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }

  // Caixa envolvente do anel externo, calculada uma vez por polígono
  const caixas = new WeakMap();
  function caixa(poly) {
    let c = caixas.get(poly);
    if (!c) {
      c = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of poly[0]) {
        if (x < c[0]) c[0] = x;
        if (y < c[1]) c[1] = y;
        if (x > c[2]) c[2] = x;
        if (y > c[3]) c[3] = y;
      }
      caixas.set(poly, c);
    }
    return c;
  }

  function noPoligono(poly, x, y) {
    const c = caixa(poly);
    if (x < c[0] || x > c[2] || y < c[1] || y > c[3]) return false;
    if (!noAnel(poly[0], x, y)) return false;
    for (let k = 1; k < poly.length; k++) if (noAnel(poly[k], x, y)) return false; // buraco
    return true;
  }

  // filtro(feature) -> bool, opcional
  function pontoNaColecao(colecao, lng, lat, filtro) {
    for (const f of colecao.features) {
      if (filtro && !filtro(f)) continue;
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) if (noPoligono(poly, lng, lat)) return true;
    }
    return false;
  }

  const api = { pontoNaColecao };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.PIP = api;
})(typeof window !== 'undefined' ? window : globalThis);
