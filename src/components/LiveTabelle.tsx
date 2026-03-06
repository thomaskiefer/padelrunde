import { Skeleton } from "./ui/skeleton";
import type { Id } from "../../convex/_generated/dataModel";
import { cn } from "~/lib/utils";

const tierBorder: Record<string, string> = {
  top: "border-l-4 border-gold",
  high: "border-l-4 border-silver",
  mid: "border-l-4 border-bronze",
  low: "border-l-4 border-gray-300",
};

export function LiveTabelleSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
      <div className="bg-brand-navy/5 px-4 py-3 flex items-center justify-between border-b border-gray-50">
        <Skeleton className="h-4 w-32 bg-brand-navy/10" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 flex-1 rounded-md" />
            <Skeleton className="h-8 w-12 rounded-md" />
            <Skeleton className="h-8 w-12 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LiveTabelle({
  tournamentId,
  standings,
}: {
  tournamentId: Id<"tournaments">;
  standings: Array<{
    playerId: string;
    rank: number;
    displayName: string;
    matches: number;
    points: number;
    wins: number;
    losses: number;
    diff: number;
    tier: string;
    form: Array<"W" | "L" | "D">;
  }>;
}) {
  // Keep prop for future live-query wiring while rendering standalone standings.
  void tournamentId;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="bg-brand-navy px-4 py-3 flex items-center justify-between">
        <h3 className="font-display uppercase tracking-[0.1em] text-sm text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" aria-hidden="true" />
          Live-Tabelle
        </h3>
        <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
          Live aktualisiert
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <caption className="sr-only">Live-Tabelle Rangliste</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-gray-400 font-bold border-b border-gray-100 bg-gray-50/50">
              <th scope="col" className="w-12 py-3 text-left pl-4">#</th>
              <th scope="col" className="py-3 text-left">Spieler</th>
              <th scope="col" className="py-3 text-center w-10">Sp</th>
              <th scope="col" className="py-3 text-center w-12 font-bold text-brand-navy">Pkt</th>
              <th scope="col" className="hidden sm:table-cell py-3 text-center w-10 text-brand-teal">S</th>
              <th scope="col" className="hidden sm:table-cell py-3 text-center w-10 text-brand-red">N</th>
              <th scope="col" className="py-3 text-center w-16">Diff</th>
              <th scope="col" className="py-3 text-center w-24 pr-4">Form</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {standings.map((s, i) => (
              <tr
                key={s.playerId}
                className={cn(
                  "animate-slide-in-left transition-colors hover:bg-gray-50/80 group",
                  tierBorder[s.tier]
                )}
                style={{ animationDelay: `${Math.min(i * 0.04, 0.3)}s` }}
              >
                <td className="py-3 pl-4 font-display text-lg text-brand-navy/30 group-hover:text-brand-red transition-colors">
                  {s.rank}
                </td>
                <td className="py-3 font-semibold text-brand-navy truncate max-w-[120px] sm:max-w-none">
                  {s.displayName}
                </td>
                <td className="py-3 text-center text-gray-400 font-medium">{s.matches}</td>
                <td className="py-3 text-center font-display text-lg text-brand-red">
                  {s.points}
                </td>
                <td className="hidden sm:table-cell py-3 text-center text-gray-500 font-medium">{s.wins}</td>
                <td className="hidden sm:table-cell py-3 text-center text-gray-500 font-medium">{s.losses}</td>
                <td
                  className={cn(
                    "py-3 text-center font-bold",
                    s.diff > 0
                      ? "text-brand-teal"
                      : s.diff < 0
                        ? "text-brand-red"
                        : "text-gray-300"
                  )}
                >
                  {s.diff > 0 ? `+${s.diff}` : s.diff}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center justify-center gap-1">
                    {s.form.map((f, idx) => (
                      <span
                        key={idx}
                        className={cn(
                          "w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white",
                          f === "W" ? "bg-brand-teal" : f === "L" ? "bg-brand-red" : "bg-gray-300"
                        )}
                        title={f === "W" ? "Sieg" : f === "L" ? "Niederlage" : "Unentschieden"}
                        aria-label={f === "W" ? "Sieg" : f === "L" ? "Niederlage" : "Unentschieden"}
                      >
                        {f === "W" ? "S" : f === "L" ? "N" : "U"}
                      </span>
                    ))}
                    {s.form.length === 0 && <span className="text-[10px] text-gray-400 italic font-medium">Noch keine Spiele</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
