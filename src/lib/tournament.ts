export const KNOCKOUT_PHASES = new Set(["semifinal", "bronze", "final"]);

export const phaseLabels: Record<string, string> = {
  preliminary: "Vorrunde",
  semifinal: "Halbfinale",
  bronze: "Spiel um Platz 3",
  final: "Finale",
};

export const statusLabels: Record<string, string> = {
  setup: "Vorbereitung",
  active: "Aktiv",
  knockout: "K.O.-Phase",
  finished: "Beendet",
};

export const modeLabels: Record<string, string> = {
  americano: "Americano",
  cup: "Cup",
};

export const statusBadgeVariant: Record<
  string,
  "statusActive" | "statusSetup" | "statusKnockout" | "statusFinished"
> = {
  setup: "statusSetup",
  active: "statusActive",
  knockout: "statusKnockout",
  finished: "statusFinished",
};

export const statusDotColor: Record<string, string> = {
  active: "bg-brand-red",
  knockout: "bg-brand-navy",
  finished: "bg-brand-teal",
  setup: "bg-gray-300",
};

// Team names on the tie-break buttons must stay readable on phones, so they wrap
// at body size there and only collapse to the compact label from `lg` up.
export const teamChoiceButtonClass =
  "h-auto min-h-11 w-full whitespace-normal break-words py-2 text-sm normal-case tracking-normal lg:w-auto lg:flex-1 lg:truncate lg:whitespace-nowrap lg:text-[10px] lg:uppercase lg:tracking-widest";
