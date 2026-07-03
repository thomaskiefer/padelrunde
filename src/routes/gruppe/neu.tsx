import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { isValidSlugLength, normalizeSlug } from "../../../convex/model/slug";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { canCreateAnotherGroup } from "~/lib/groupPermissions";

export const Route = createFileRoute("/gruppe/neu")({
  component: CreateGroup,
});

function CreateGroup() {
  const navigate = useNavigate();
  const { data: me } = useSuspenseQuery(convexQuery(api.users.me, {}));
  const createGroup = useMutation(api.groups.create);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const allowed = canCreateAnotherGroup(me);
  const trimmedName = name.trim();

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md p-6 mt-8 text-center animate-fade-in-up bg-white rounded-xl border border-gray-100 shadow-sm">
        <h2 className="font-display uppercase text-brand-navy mb-2">Keine Berechtigung</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Du kannst aktuell keine neue Gruppe erstellen.
        </p>
        <Button variant="brandNavy" size="touchLg" asChild>
          <Link to="/">
            &larr; Zurück zur Startseite
          </Link>
        </Button>
      </div>
    );
  }

  const handleNameChange = (value: string) => {
    setName(value);
    // Keep mirroring the name into the slug only until the user edits the slug
    // directly — the slug is the permanent, unchangeable public URL, so a manual
    // choice must never be silently overwritten by a later name edit.
    if (!slugTouched) setSlug(normalizeSlug(value));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug || !isValidSlugLength(normalizedSlug)) {
      setError("URL-Kürzel muss 3 bis 48 Zeichen lang sein");
      return;
    }
    if (!trimmedName) {
      setError("Gruppenname darf nicht leer sein");
      return;
    }

    setLoading(true);
    try {
      await createGroup({ name: trimmedName, slug: normalizedSlug });
      navigate({
        to: "/gruppe/$groupSlug",
        params: { groupSlug: normalizedSlug },
      });
    } catch (err: any) {
      setError(err.message ?? "Fehler beim Erstellen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-4 space-y-8 animate-fade-in-up">
      <div className="space-y-2">
        <Link
          to="/"
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5"
        >
          <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Startseite
        </Link>
        <h2 className="font-display text-2xl sm:text-3xl uppercase text-brand-navy">
          Neue Gruppe erstellen
        </h2>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-xl border border-gray-100 shadow-sm space-y-8 relative overflow-hidden">
        {/* Slanted Accent Corner */}
        <div className="absolute top-0 right-0 w-16 h-16 -mr-8 -mt-8 bg-brand-navy/5 rotate-45" aria-hidden="true" />

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-[10px] uppercase tracking-widest font-bold text-gray-400"
            >
              Gruppenname
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="z.B. Padelfreunde Obersulm"
              required
              className="h-12 border-gray-200 font-medium text-lg"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="slug"
              className="text-[10px] uppercase tracking-widest font-bold text-gray-400"
            >
              URL-Kürzel
            </Label>
            <div className="flex items-center h-12 rounded-md border border-gray-200 bg-transparent shadow-xs transition-[color,box-shadow] has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50">
              <span className="shrink-0 pl-3 text-gray-400 font-mono text-sm select-none">padelrun.de/</span>
              <input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(normalizeSlug(e.target.value));
                }}
                placeholder="padelfreunde-obersulm"
                required
                className="h-full w-full min-w-0 bg-transparent pl-0 pr-3 font-mono text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed italic">
              Dies ist die Web-Adresse unter der deine Gruppe für Mitglieder erreichbar ist.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border-l-2 border-red-500 p-3" role="alert">
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            variant={loading ? "brandSubtle" : "brand"}
            size="touchXl"
            className="w-full"
            disabled={loading || !trimmedName}
          >
            {loading ? "Wird erstellt..." : "Gruppe erstellen"}
          </Button>
        </form>
      </div>

      <div className="bg-brand-navy/5 border border-brand-navy/10 rounded-xl p-5 space-y-3">
        <p className="text-[10px] uppercase tracking-widest font-bold text-brand-navy">Was passiert als nächstes?</p>
        <ul className="space-y-2">
          {[
            "Mitglieder einladen über dein URL-Kürzel",
            "Erstes Americano- oder Padel-Cup-Turnier planen",
            "Ergebnisse live erfassen und Rangliste führen"
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-brand-navy/60 font-medium">
              <svg className="w-3.5 h-3.5 text-brand-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
