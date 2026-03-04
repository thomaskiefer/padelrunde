import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

const tierColors: Record<string, string> = {
  top: "bg-blue-100 dark:bg-blue-900/30",
  high: "bg-green-100 dark:bg-green-900/30",
  mid: "bg-orange-100 dark:bg-orange-900/30",
  low: "bg-pink-100 dark:bg-pink-900/30",
};

export function LiveTabelle({
  tournamentId,
}: {
  tournamentId: Id<"tournaments">;
}) {
  const { data: standings } = useSuspenseQuery(
    convexQuery(api.standings.getStandings, { tournamentId })
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live-Tabelle</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-center">Sp</TableHead>
              <TableHead className="text-center">Pkt</TableHead>
              <TableHead className="text-center">S</TableHead>
              <TableHead className="text-center">N</TableHead>
              <TableHead className="text-center">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map((s) => (
              <TableRow
                key={s.playerId}
                className={cn(tierColors[s.tier])}
              >
                <TableCell className="font-bold">{s.rank}</TableCell>
                <TableCell className="font-medium">{s.displayName}</TableCell>
                <TableCell className="text-center">{s.matches}</TableCell>
                <TableCell className="text-center font-bold">
                  {s.points}
                </TableCell>
                <TableCell className="text-center">{s.wins}</TableCell>
                <TableCell className="text-center">{s.losses}</TableCell>
                <TableCell className="text-center">
                  {s.diff > 0 ? `+${s.diff}` : s.diff}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
