import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { clientPhotos, countClientPhotos } from "@/lib/home";
import { PhotoGallery } from "../home-client";
import { Icon } from "../icons";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 42;

/** Toutes les photos envoyées par les clients (« Voir tout » de l'accueil). Lecture seule. */
export default async function MediasPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireSession();
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const { core } = getRuntime();
  const total = countClientPhotos(core);
  const photos = clientPhotos(core, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Icon name="image" size={26} /> Médias
        </h1>
        <Link href="/admin/fichiers" className="btn btn-secondary">
          <Icon name="clip" size={16} /> Fichiers envoyés par le bot
        </Link>
      </div>
      <p className="text-sm text-neutral-500">
        Photos envoyées par les clients ({total}). Touche une photo pour l&apos;ouvrir en grand.
      </p>

      {photos.length === 0 ? (
        <div className="aj-empty">Aucune photo reçue pour le moment.</div>
      ) : (
        <PhotoGallery photos={photos} variant="grid" />
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          {page > 1 ? (
            <Link href={`/admin/medias?page=${page - 1}`} className="btn btn-secondary">
              ← Plus récentes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-neutral-500">
            Page {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={`/admin/medias?page=${page + 1}`} className="btn btn-secondary">
              Plus anciennes →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
