import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useState } from "react";

export const Route = createFileRoute("/gruppe/neu")({
  component: CreateGroup,
});

function CreateGroup() {
  const navigate = useNavigate();
  const createGroup = useMutation(api.groups.create);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await createGroup({ name, slug });
      navigate({ to: "/gruppe/$groupSlug", params: { groupSlug: slug } });
    } catch (err: any) {
      setError(err.message ?? "Fehler beim Erstellen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-4 mt-8">
      <Card>
        <CardHeader>
          <CardTitle>Neue Gruppe erstellen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Gruppenname</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="z.B. Padelfreunde Obersulm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL-Kürzel</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="padelfreunde-obersulm"
                required
              />
              <p className="text-xs text-gray-500">
                Deine Gruppe ist unter /gruppe/{slug || "..."} erreichbar
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Erstelle..." : "Gruppe erstellen"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
