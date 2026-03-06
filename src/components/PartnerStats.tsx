import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cn } from "~/lib/utils";

interface Props {
  tournamentId: Id<"tournaments">;
}

export function PartnerStats({ tournamentId }: Props) {
  const { data: stats } = useSuspenseQuery(
    convexQuery(api.stats.getStats, { tournamentId })
  );

  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  if (stats.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {stats.map((player) => {
        const isExpanded = expandedPlayer === player.playerId;
        return (
          <div
            key={player.playerId}
            className={cn(
              "bg-white rounded-xl border transition-all duration-200 shadow-sm overflow-hidden",
              isExpanded ? "border-brand-navy ring-1 ring-brand-navy/5" : "border-gray-100 hover:border-gray-200"
            )}
          >
            <button
              className="w-full min-h-[44px] p-4 flex items-center justify-between gap-3 text-left group focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-navy/50 focus-visible:ring-inset rounded-xl"
              aria-expanded={isExpanded}
              aria-label={`Statistik für ${player.displayName}`}
              aria-controls={`stats-${player.playerId}`}
              onClick={() =>
                setExpandedPlayer(isExpanded ? null : player.playerId)
              }
            >
              <div className="min-w-0">
                <p className="font-bold text-brand-navy truncate">
                  {player.displayName}
                </p>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mt-0.5">
                  Statistik
                </p>
              </div>
              <div className={cn(
                "w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center transition-transform duration-300",
                isExpanded ? "rotate-180 bg-brand-navy text-white" : "text-gray-400 group-hover:bg-gray-100"
              )}>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            
            <div
              id={`stats-${player.playerId}`}
              className={cn(
                "transition-[max-height,opacity] duration-300 ease-in-out overflow-hidden",
                isExpanded ? "max-h-[500px] opacity-100 border-t border-gray-50 px-4 pt-4 pb-4" : "max-h-0 opacity-0"
              )}
            >
              <div className="space-y-4">
                {player.partners.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-brand-teal block mb-2">Partner</span>
                    <div className="flex flex-wrap gap-2">
                      {player.partners.map((p) => (
                        <div
                          key={p.playerId}
                          className="bg-brand-teal/5 border border-brand-teal/10 px-3 py-1.5 rounded flex items-center gap-2"
                        >
                          <span className="text-xs font-semibold text-brand-teal truncate max-w-[120px]">{p.displayName}</span>
                          <span className="font-display text-[10px] text-brand-teal bg-white px-1.5 py-0.5 rounded shadow-sm">{p.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {player.opponents.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-brand-navy/40 block mb-2">Gegner</span>
                    <div className="flex flex-wrap gap-2">
                      {player.opponents.map((o) => (
                        <div
                          key={o.playerId}
                          className="bg-brand-navy/5 border border-brand-navy/10 px-3 py-1.5 rounded flex items-center gap-2"
                        >
                          <span className="text-xs font-semibold text-brand-navy/60 truncate max-w-[120px]">{o.displayName}</span>
                          <span className="font-display text-[10px] text-brand-navy/60 bg-white px-1.5 py-0.5 rounded shadow-sm">{o.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

