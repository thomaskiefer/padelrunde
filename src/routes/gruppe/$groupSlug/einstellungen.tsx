import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

export const Route = createFileRoute("/gruppe/$groupSlug/einstellungen")({
  component: GroupSettings,
});

function GroupSettings() {
  const { groupSlug } = Route.useParams();
  const { data: group } = useSuspenseQuery(
    convexQuery(api.groups.getBySlug, { slug: groupSlug })
  );
  const { data: members } = useSuspenseQuery(
    convexQuery(api.groups.getMembers, {
      groupId: (group?._id ?? "") as any,
    })
  );
  const updateMemberRole = useMutation(api.groups.updateMemberRole);

  if (!group) {
    return <div className="p-8 text-center">Gruppe nicht gefunden</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6">
      <div>
        <Link
          to="/gruppe/$groupSlug"
          params={{ groupSlug }}
          className="text-sm text-gray-500 hover:underline"
        >
          Zurück zur Gruppe
        </Link>
        <h2 className="text-2xl font-bold">Einstellungen: {group.name}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mitglieder verwalten</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m._id}>
                  <TableCell>{m.displayName}</TableCell>
                  <TableCell>
                    <Badge
                      variant={m.role === "admin" ? "default" : "secondary"}
                    >
                      {m.role === "admin" ? "Admin" : "Mitglied"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateMemberRole({
                          memberId: m._id as any,
                          role: m.role === "admin" ? "member" : "admin",
                        })
                      }
                    >
                      {m.role === "admin"
                        ? "Zum Mitglied machen"
                        : "Zum Admin machen"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
