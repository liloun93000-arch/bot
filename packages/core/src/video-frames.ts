import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Lance ffmpeg ; code -1 si ffmpeg est absent. Ne lève jamais. */
function ffmpeg(args: string[], timeoutMs = 120_000): Promise<{ code: number; err: string }> {
  return new Promise((resolve) => {
    let err = "";
    let done = false;
    const fin = (code: number) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve({ code, err });
    };
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stderr?.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-6000);
    });
    p.on("error", () => fin(-1));
    p.on("close", (code) => fin(code ?? -1));
  });
}

function duree(err: string): number {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

export interface VideoParts {
  /** 4 images de la vidéo (début → fin) assemblées en une seule (2 × 2), JPEG. */
  planche: Buffer | null;
  /** Bande son en MP3 (null si pas de son). */
  audio: Buffer | null;
  seconds: number;
}

/** Extrait de quoi « comprendre » une vidéo : une planche d'images et le son. */
export async function extractVideoParts(video: Buffer): Promise<VideoParts> {
  const dir = await mkdtemp(join(tmpdir(), "vin-"));
  const src = join(dir, "in.bin");
  try {
    await writeFile(src, video);
    const probe = await ffmpeg(["-hide_banner", "-i", src]);
    if (probe.code === -1) return { planche: null, audio: null, seconds: 0 };
    const seconds = duree(probe.err);
    const fps = seconds > 0 ? Math.max(0.05, 4 / seconds) : 1;
    const img = join(dir, "planche.jpg");
    const a = await ffmpeg(["-y", "-i", src, "-vf", `fps=${fps.toFixed(4)},scale=640:-2,tile=2x2`, "-frames:v", "1", "-q:v", "4", img]);
    const mp3 = join(dir, "son.mp3");
    const b = await ffmpeg(["-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-t", "300", mp3]);
    return {
      planche: a.code === 0 ? await readFile(img).catch(() => null) : null,
      audio: b.code === 0 ? await readFile(mp3).catch(() => null) : null,
      seconds,
    };
  } catch {
    return { planche: null, audio: null, seconds: 0 };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
