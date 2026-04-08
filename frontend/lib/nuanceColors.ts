export const NUANCE_COLORS: Record<string, string> = {
  // Droite
  LR: "#0077b6", UMP: "#0077b6", DVD: "#74a7cf",
  // Gauche
  SOC: "#e03131", PS: "#e03131", DVG: "#e8686d", COM: "#c92a2a", FI: "#c92a2a",
  NUP: "#c92a2a", NUPES: "#c92a2a", UG: "#e03131", NFP: "#e03131",
  // Centre / Macronisme
  ENS: "#e67700", REM: "#e67700", LREM: "#e67700", RE: "#e67700",
  MDM: "#f59f00", MODEM: "#f59f00", DLF: "#f59f00", HOR: "#f59f00",
  // Centre-droit
  UDI: "#fab005", NC: "#fab005", DVC: "#74a7cf", UC: "#fab005",
  // Extreme droite
  RN: "#1a1a2e", FN: "#1a1a2e", EXD: "#343a40", REC: "#1a1a2e",
  // Ecologistes
  ECO: "#2f9e44", VEC: "#2f9e44", EELV: "#2f9e44",
  // Regionalistes
  REG: "#0ca678",
};

export function nuanceColor(code: string): string {
  if (!code || code === "Inconnu") return "#94a3b8";
  const upper = code.toUpperCase();
  if (NUANCE_COLORS[upper]) return NUANCE_COLORS[upper];
  for (const [prefix, color] of Object.entries(NUANCE_COLORS)) {
    if (upper.startsWith(prefix)) return color;
  }
  return "#94a3b8";
}
