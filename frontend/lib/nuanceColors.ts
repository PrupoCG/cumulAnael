export const NUANCE_COLORS: Record<string, string> = {
  // Droite (pastel bleu)
  LR: "#a3c4e0", UMP: "#a3c4e0", DVD: "#bdd4ea",
  // Gauche (pastel rose)
  SOC: "#f2a8b0", PS: "#f2a8b0", DVG: "#f5c0c6", COM: "#e8949d", FI: "#e8949d",
  NUP: "#e8949d", NUPES: "#e8949d", UG: "#f2a8b0", NFP: "#f2a8b0",
  // Centre / Macronisme (pastel orange)
  ENS: "#f5cfa0", REM: "#f5cfa0", LREM: "#f5cfa0", RE: "#f5cfa0",
  MDM: "#fae0a8", MODEM: "#fae0a8", DLF: "#fae0a8", HOR: "#fae0a8",
  // Centre-droit (pastel jaune)
  UDI: "#fce6b0", NC: "#fce6b0", DVC: "#bdd4ea", UC: "#fce6b0",
  // Extreme droite (bleu-gris foncé assourdi)
  RN: "#5c6178", FN: "#5c6178", EXD: "#6e7389", REC: "#5c6178",
  // Ecologistes (pastel vert)
  ECO: "#a8d8b0", VEC: "#a8d8b0", EELV: "#a8d8b0",
  // Regionalistes (pastel turquoise)
  REG: "#a0d4c4",
};

export function nuanceColor(code: string): string {
  if (!code || code === "Inconnu") return "#d0d5dd";
  const upper = code.toUpperCase();
  if (NUANCE_COLORS[upper]) return NUANCE_COLORS[upper];
  for (const [prefix, color] of Object.entries(NUANCE_COLORS)) {
    if (upper.startsWith(prefix)) return color;
  }
  return "#d0d5dd";
}
