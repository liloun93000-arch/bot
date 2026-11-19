"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Row { waId: string; label: string }
interface Job {
  id: string; etat: "demarre" | "en_cours" | "termine" | "erreur"; etape: string; libelle: string;
  totalConversations: number; conversationsFaites: number; totalMedias: number; mediasFaits: number;
  mediasManquants: number; pourcent: number; taille: number; erreur: string;
}
type Mode = "toutes" | "filtre" | "choix";

const STEPS: Array<[string, string]> = [
  ["preparation", "Préparation"], ["conversations", "Récupération des conversations"],
  ["medias", "Récupération des médias"], ["archive", "Création de l'archive"], ["termine", "Terminé"],
];

export function ExportButton({ all, filtered, filtreActif }: { all: Row[]; filtered: Row[]; filtreActif: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(filtreActif ? "filtre" : "toutes");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const ids = useMemo(
    () => (mode === "toutes" ? all.map((r) => r.waId) : mode === "filtre" ? filtered.map((r) => r.waId) : [...picked]),
    [mode, all, filtered, picked],
  );
  const visible = useMemo(() => {
    const n = search.trim().toLowerCase();
    return n ? all.filter((r) => r.label.toLowerCase().includes(n) || r.waId.includes(n)) : all;
  }, [all, search]);
  const running = job?.etat === "demarre" || job?.etat === "en_cours";

  useEffect(() => {
    if (!job || !running) return;
    timer.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/export/conversations?id=${job.id}`, { cache: "no-store" });
        if (r.ok) setJob((await r.json()) as Job);
      } catch { /* on réessaie au prochain passage */ }
    }, 800);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [job?.id, running]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setError("");
    try {
      const r = await fetch("/api/export/conversations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
      });
      const data = (await r.json()) as Job & { error?: string };
      if (!r.ok) { setError(data.error ?? "Export impossible."); return; }
      setJob(data);
    } catch {
      setError("Connexion impossible avec le serveur.");
    }
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const stepIdx = job ? STEPS.findIndex(([k]) => k === job.etape) : -1;

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>⬇ Exporter</button>
      {open && createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Exporter les conversations">
          <div className="max-h-[92vh] w-full pb-[max(1rem,env(safe-area-inset-bottom))] max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#15151b] p-4 text-neutral-900 shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Exporter les conversations</h2>
              <button type="button" className="rounded px-2 py-1 text-neutral-500" aria-label="Fermer" onClick={() => setOpen(false)}>✕</button>
            </div>

            {!job && (
              <div className="space-y-3">
                {([
                  ["toutes", `Toutes les conversations (${all.length})`],
                  ["filtre", `Conversations actuellement filtrées (${filtered.length})`],
                  ["choix", "Choisir manuellement"],
                ] as Array<[Mode, string]>).map(([m, label]) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /> {label}
                  </label>
                ))}
                {mode === "choix" && (
                  <div className="rounded-lg border border-neutral-200 p-2">
                    <input className="input mb-2 w-full" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    <div className="mb-2 flex gap-3 text-xs">
                      <button type="button" className="underline" onClick={() => setPicked((p) => new Set([...p, ...visible.map((r) => r.waId)]))}>Tout cocher (affichées)</button>
                      <button type="button" className="underline" onClick={() => setPicked(new Set())}>Tout décocher</button>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {visible.map((r) => (
                        <label key={r.waId} className="flex items-center gap-2 py-1 text-sm">
                          <input type="checkbox" checked={picked.has(r.waId)} onChange={() => toggle(r.waId)} />
                          <span className="truncate">{r.label}</span>
                        </label>
                      ))}
                      {visible.length === 0 && <p className="text-sm text-neutral-500">Aucun résultat.</p>}
                    </div>
                  </div>
                )}
                <p className="text-sm font-semibold">{ids.length} conversation{ids.length > 1 ? "s" : ""} seront exportées.</p>
                <p className="text-xs text-neutral-500">ZIP : version lisible, JSON exploitable par une IA, index et médias (photos, documents, vocaux). Aucune transcription n'est générée : seules celles déjà enregistrées sont incluses.</p>
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                <button type="button" className="btn btn-primary w-full" disabled={ids.length === 0} onClick={start}>Lancer l'export</button>
              </div>
            )}

            {job && (
              <div className="space-y-3" aria-live="polite">
                <p className="text-sm font-semibold">
                  {job.etat === "erreur" ? "Erreur" : job.etat === "termine" ? "Export terminé" : job.etat === "demarre" ? "Export démarré" : "Export en cours"} — {job.libelle}
                </p>
                <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuenow={job.pourcent} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full ${job.etat === "erreur" ? "bg-red-500" : "bg-emerald-600"}`} style={{ width: `${job.pourcent}%`, transition: "width .3s" }} />
                </div>
                <p className="text-xs text-neutral-600">
                  {job.pourcent} % · conversations {job.conversationsFaites}/{job.totalConversations} · médias {job.mediasFaits}/{job.totalMedias}
                  {job.mediasManquants > 0 && ` · ${job.mediasManquants} introuvable(s)`}
                </p>
                <ol className="space-y-1 text-sm">
                  {STEPS.map(([k, label], i) => (
                    <li key={k} className={i < stepIdx || job.etat === "termine" ? "text-emerald-700" : i === stepIdx && job.etat !== "erreur" ? "font-semibold" : "text-neutral-400"}>
                      {i < stepIdx || job.etat === "termine" ? "✓" : i === stepIdx ? "●" : "○"} {label}
                    </li>
                  ))}
                </ol>
                {job.etat === "erreur" && <p className="text-sm text-red-600" role="alert">{job.erreur}</p>}
                {job.etat === "termine" && (
                  <>
                    {job.mediasManquants > 0 && <p className="text-xs text-amber-700">Certains médias sont introuvables : la liste précise est dans medias_manquants.txt.</p>}
                    <a className="btn btn-primary block w-full text-center" href={`/api/export/conversations/download?id=${job.id}`}>
                      Télécharger le ZIP ({(job.taille / 1048576).toFixed(1)} Mo)
                    </a>
                  </>
                )}
                {!running && <button type="button" className="btn btn-secondary w-full" onClick={() => { setJob(null); setError(""); }}>Nouvel export</button>}
                {running && <p className="text-xs text-neutral-500">Vous pouvez fermer cette fenêtre : l'export continue et reste utilisable ensuite via « Exporter ».</p>}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
