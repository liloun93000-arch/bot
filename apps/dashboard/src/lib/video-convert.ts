import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Vidéos envoyées depuis le dashboard : WhatsApp n'accepte que le MP4 (H.264/AAC) de 16 Mo max.
 * Les vidéos d'iPhone (.mov), .m4v, .webm, .mkv, .avi… ou trop lourdes sont converties ici avec ffmpeg
 * (720p max, compressées pour tenir sous 15 Mo). Sans ffmpeg, le fichier est laissé tel quel.
 */
const VIDEO_EXT = /\.(mov|qt|m4v|mp4|3gp|webm|mkv|avi|wmv|flv|mpeg|mpg|hevc)$/i;
const LIMITE = 15 * 1024 * 1024; // marge sous les 16 Mo de WhatsApp

export function isVideoFile(name: string, type: string): boolean {
  return type.startsWith("video/") || VIDEO_EXT.test(name);
}

function run(args: string[], timeoutMs = 240_000): Promise<{ code: number; err: string }> {
  return new Promise((resolve) => {
    let err = "";
    let p;
    try {
      p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    } catch {
      resolve({ code: -1, err: "ffmpeg absent" });
      return;
    }
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stderr?.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-4000);
    });
    p.on("error", () => {
      clearTimeout(t);
      resolve({ code: -1, err: "ffmpeg absent" });
    });
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? -1, err });
    });
  });
}

function duree(err: string): number {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

export interface VideoPrete {
  buffer: Buffer;
  name: string;
  type: string;
  converted: boolean;
  error?: string;
}

/** Renvoie une vidéo MP4 envoyable par WhatsApp (ou le fichier d'origine si rien à faire / impossible). */
export async function prepareVideo(buffer: Buffer, name: string, type: string): Promise<VideoPrete> {
  const base = name.replace(/\.[^.]+$/, "") || "video";
  const dejaOk = /\.mp4$/i.test(name) && (type === "video/mp4" || type === "") && buffer.length <= LIMITE;
  if (dejaOk) return { buffer, name, type: "video/mp4", converted: false };

  const dir = await mkdtemp(join(tmpdir(), "vid-"));
  const src = join(dir, "in" + (/\.[a-z0-9]+$/i.exec(name)?.[0] ?? ".bin"));
  const out = join(dir, "out.mp4");
  try {
    await writeFile(src, buffer);
    const commun = ["-y", "-i", src, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-profile:v", "main", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"];
    let r = await run([...commun, "-crf", "28", out]);
    if (r.code !== 0) return { buffer, name, type, converted: false, error: r.code === -1 ? "ffmpeg absent" : "conversion impossible" };
    let res = await readFile(out);
    if (res.length > LIMITE) {
      // Trop lourde : débit calculé pour tenir sous la limite.
      const d = duree(r.err) || 60;
      const kbps = Math.max(150, Math.floor((LIMITE * 8) / 1000 / d) - 110);
      r = await run([...commun, "-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`, out]);
      if (r.code === 0) res = await readFile(out);
    }
    return { buffer: res, name: `${base}.mp4`, type: "video/mp4", converted: true };
  } catch {
    return { buffer, name, type, converted: false, error: "conversion impossible" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
