// src/services/riskEngine.js

/**
 * Simula a oscilação astronômica contínua da maré (Ciclo M2)
 */
export function calculateTideLevel() {
  const currentEpochHours = Date.now() / (1000 * 3600);
  const astronomicalOscillation = 0.55 * Math.cos((2 * Math.PI * currentEpochHours) / 12.42);
  const calculatedTide = 1.15 + astronomicalOscillation;
  return parseFloat(Math.max(0.4, calculatedTide).toFixed(2));
}

/**
 * Classifica a severidade do risco em Joinville
 */
export function evaluateRisk(rain24h, forecast6h, tideLevel) {
  const rainLoad = rain24h + forecast6h;
  
  let tideFactor = 1.0;
  if (tideLevel >= 2.0) tideFactor = 1.7;
  else if (tideLevel >= 1.5) tideFactor = 1.35;

  const compositeLoad = rainLoad * tideFactor;

  let nivel = "NORMAL";
  if (compositeLoad >= 80 || (tideLevel >= 2.10 && rainLoad >= 30)) {
    nivel = "CRITICO";
  } else if (compositeLoad >= 50 || (tideLevel >= 1.60 && rainLoad >= 20)) {
    nivel = "ALTO";
  } else if (compositeLoad >= 30 || tideLevel >= 1.50) {
    nivel = "ATENCAO";
  }

  return { nivel, compositeLoad, tideLevel, rain24h };
}