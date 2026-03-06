import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";

interface Props {
  tournamentId: Id<"tournaments">;
  isFinished: boolean;
}

export function KnockoutBracket({ tournamentId, isFinished }: Props) {
  const { data: rounds } = useSuspenseQuery(
    convexQuery(api.rounds.listByTournament, { tournamentId })
  );

  const sfRound = rounds.find((r) => r.phase === "semifinal");
  const finalRound = rounds.find((r) => r.phase === "final");
  const bronzeRound = rounds.find((r) => r.phase === "bronze");

  if (!sfRound) return null;

  return (
    <div className="space-y-6">
      {/* Semifinals */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 flex items-center gap-2">
          <span className="w-4 h-px bg-gray-200" aria-hidden="true" />
          Halbfinale
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <BracketMatch roundId={sfRound._id} index={0} isFinished={isFinished} medal={null} />
          <BracketMatch roundId={sfRound._id} index={1} isFinished={isFinished} medal={null} />
        </div>
      </div>

      {/* Final + Bronze */}
      {finalRound && bronzeRound && (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-brand-red flex items-center gap-2">
              <span className="w-4 h-px bg-brand-red/20" aria-hidden="true" />
              Finale
            </p>
            <BracketMatch roundId={finalRound._id} index={0} isFinished={isFinished} medal="gold" />
          </div>
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-brand-navy/40 flex items-center gap-2">
              <span className="w-4 h-px bg-gray-200" aria-hidden="true" />
              Spiel um Platz 3
            </p>
            <BracketMatch roundId={bronzeRound._id} index={0} isFinished={isFinished} medal="bronze" />
          </div>
        </div>
      )}
    </div>
  );
}

function BracketMatch({
  roundId,
  index,
  isFinished,
  medal,
}: {
  roundId: Id<"rounds">;
  index: number;
  isFinished: boolean;
  medal: "gold" | "bronze" | null;
}) {
  const { data: matches } = useSuspenseQuery(
    convexQuery(api.matches.getByRound, { roundId })
  );

  const match = matches.at(index);
  if (!match) return null;

  const isCompleted = match.status === "completed";
  const winnerIsA = match.winningSide === "A";
  const winnerIsB = match.winningSide === "B";

  const getMedalType = (side: "A" | "B"): "gold" | "silver" | "bronze" | null => {
    if (!isFinished || !isCompleted) return null;
    if (medal === "gold") {
      if ((side === "A" && winnerIsA) || (side === "B" && winnerIsB)) return "gold";
      if ((side === "A" && winnerIsB) || (side === "B" && winnerIsA)) return "silver";
    }
    if (medal === "bronze") {
      if ((side === "A" && winnerIsA) || (side === "B" && winnerIsB)) return "bronze";
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-4 hover:border-brand-navy/30 transition-all duration-200">
      <div className="flex items-center gap-4">
        {/* Team A */}
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <p className={cn(
              "text-xs sm:text-sm font-bold truncate",
              isCompleted && winnerIsA ? "text-brand-navy" : "text-gray-400"
            )}>
              {match.teamANames.join(" & ")}
            </p>
            <MedalBadge type={getMedalType("A")} />
          </div>
        </div>

        {/* Score */}
        <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
          {isCompleted ? (
            <>
              <span className={cn(
                "font-display text-lg leading-none",
                winnerIsA ? "text-brand-navy" : "text-gray-300"
              )}>{match.scoreA}</span>
              <span className="text-gray-200 font-display text-sm">:</span>
              <span className={cn(
                "font-display text-lg leading-none",
                winnerIsB ? "text-brand-navy" : "text-gray-300"
              )}>{match.scoreB}</span>
            </>
          ) : (
            <span className="text-[10px] font-display uppercase tracking-widest text-gray-400">–</span>
          )}
        </div>

        {/* Team B */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <MedalBadge type={getMedalType("B")} />
            <p className={cn(
              "text-xs sm:text-sm font-bold truncate",
              isCompleted && winnerIsB ? "text-brand-navy" : "text-gray-400"
            )}>
              {match.teamBNames.join(" & ")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const medalBadgeVariant: Record<string, "medalGold" | "medalSilver" | "medalBronze"> = {
  gold: "medalGold",
  silver: "medalSilver",
  bronze: "medalBronze",
};

const medalLabels: Record<string, string> = {
  gold: "1",
  silver: "2",
  bronze: "3",
};

function MedalBadge({ type }: { type: "gold" | "silver" | "bronze" | null }) {
  if (!type) return null;
  return (
    <Badge
      variant={medalBadgeVariant[type]}
      className="w-5 h-5 rounded-full text-[10px] font-bold shrink-0 p-0 justify-center"
      aria-label={`Platz ${medalLabels[type]}`}
    >
      {medalLabels[type]}
    </Badge>
  );
}
