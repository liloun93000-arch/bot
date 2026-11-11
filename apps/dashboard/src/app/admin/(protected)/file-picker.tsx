"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function formatMo(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const SENDABLE_IMAGE = /^image\/(jpeg|png)$/;
const IMAGE_LIMIT = 5 * 1024 * 1024; // plafond WhatsApp pour une photo
const VIDEO_LIMIT = 16 * 1024 * 1024;
const DOC_LIMIT = 45 * 1024 * 1024;

/**
 * Photo du téléphone (HEIC, WebP, ou JPEG > 5 Mo) → JPEG accepté par WhatsApp. Sans ça, la photo
 * était refusée et rien ne partait. Redimensionnée à 2560 px max, qualité 85 %.
 */
async function toSendableImage(file: File): Promise<File> {
  if (SENDABLE_IMAGE.test(file.type) && file.size <= IMAGE_LIMIT * 0.9) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 2560 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    let quality = 0.85;
    let blob: Blob | null = null;
    do {
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      quality -= 0.15;
    } while (blob && blob.size > IMAGE_LIMIT * 0.9 && quality > 0.3);
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file; // le serveur dira clairement pourquoi s'il refuse
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Preview {
  name: string;
  size: number;
  url: string | null;
  kind: "image" | "video" | "doc";
}

/**
 * Sélection de pièces jointes (photo, vidéo, PDF, Excel, Word…) avec aperçu, conversion automatique
 * des photos du téléphone et contrôle de taille AVANT l'envoi. Le vrai envoi WhatsApp est fait par
 * l'action serveur du formulaire ; le bouton affiche « Envoi en cours… » pendant ce temps.
 */
export function FilePicker({
  accept,
  disabled = false,
  maxFiles = 10,
  required = true,
  label = "📎 Ajouter des fichiers",
}: {
  accept: string;
  disabled?: boolean;
  maxFiles?: number;
  required?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [prep, setPrep] = useState(false);

  async function onChange(): Promise<void> {
    const el = input.current;
    if (!el) return;
    const files = [...(el.files ?? [])];
    setErreur(null);
    if (files.length > maxFiles) {
      setErreur(`${maxFiles} fichiers maximum en une fois.`);
      el.value = "";
      setPreviews([]);
      return;
    }
    setPrep(true);
    const ready: File[] = [];
    for (const f of files) ready.push(f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name) ? await toSendableImage(f) : f);
    setPrep(false);
    const trop = ready.find((f) =>
      f.type.startsWith("image/") ? f.size > IMAGE_LIMIT : f.type.startsWith("video/") ? f.size > VIDEO_LIMIT : f.size > DOC_LIMIT,
    );
    if (trop) {
      setErreur(`« ${trop.name} » fait ${formatMo(trop.size)} — trop lourd pour WhatsApp (photo 5 Mo, vidéo 16 Mo, document 45 Mo).`);
      el.value = "";
      setPreviews([]);
      return;
    }
    // Remplace la sélection par les fichiers convertis (DataTransfer : pris en charge par les navigateurs récents).
    try {
      const dt = new DataTransfer();
      for (const f of ready) dt.items.add(f);
      el.files = dt.files;
    } catch {
      /* navigateur ancien : on envoie les originaux */
    }
    for (const p of previews) if (p.url) URL.revokeObjectURL(p.url);
    setPreviews(
      ready.map((f) => ({
        name: f.name,
        size: f.size,
        kind: f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "doc",
        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      })),
    );
  }

  return (
    <div className="aj-files">
      <label className={`aj-files-btn${disabled ? " is-off" : ""}`}>
        <input
          ref={input}
          type="file"
          name="fichier"
          accept={accept}
          multiple
          required={required}
          disabled={disabled}
          onChange={() => void onChange()}
        />
        {label}
      </label>
      {prep && <span className="aj-files-note">Préparation des photos…</span>}
      {previews.length > 0 && (
        <ul className="aj-files-list">
          {previews.map((p) => (
            <li key={p.name}>
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" />
              ) : (
                <span className="aj-files-ico" aria-hidden>
                  {p.kind === "video" ? "🎬" : "📄"}
                </span>
              )}
              <span className="aj-files-name">{p.name}</span>
              <span className="aj-files-size">{formatMo(p.size)}</span>
            </li>
          ))}
        </ul>
      )}
      {erreur && <span className="aj-files-err">⚠️ {erreur}</span>}
    </div>
  );
}

/** Bouton d'envoi qui montre l'état : « Envoi en cours… » tant que WhatsApp n'a pas répondu. */
export function SendButton({ children, className = "btn btn-primary", disabled = false }: { children: React.ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending}>
      {pending ? "Envoi en cours…" : children}
    </button>
  );
}
