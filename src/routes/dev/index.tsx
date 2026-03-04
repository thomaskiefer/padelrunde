import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../convex/_generated/api";
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

export const Route = createFileRoute("/dev/")({
  component: DevDashboard,
});

function DevDashboard() {
  const { data: users } = useSuspenseQuery(
    convexQuery(api.users.listAll, {})
  );
  const { data: me } = useSuspenseQuery(convexQuery(api.users.me, {}));
  const toggleCanCreateGroup = useMutation(api.users.toggleCanCreateGroup);

  if (!me?.isDeveloper) {
    return (
      <div className="p-8 text-center text-gray-500">Kein Zugriff</div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6">
      <h2 className="text-2xl font-bold">Entwickler-Dashboard</h2>
      <Card>
        <CardHeader>
          <CardTitle>Registrierte Benutzer ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user._id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {user.isDeveloper && (
                        <Badge variant="default">Dev</Badge>
                      )}
                      {user.canCreateGroup && (
                        <Badge variant="secondary">Kann erstellen</Badge>
                      )}
                      {user.hasCreatedGroup && (
                        <Badge variant="outline">Hat Gruppe</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {!user.isDeveloper && (
                      <Button
                        size="sm"
                        variant={user.canCreateGroup ? "destructive" : "default"}
                        onClick={() =>
                          toggleCanCreateGroup({
                            userId: user._id,
                            canCreateGroup: !user.canCreateGroup,
                          })
                        }
                      >
                        {user.canCreateGroup
                          ? "Berechtigung entziehen"
                          : "Freischalten"}
                      </Button>
                    )}
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
