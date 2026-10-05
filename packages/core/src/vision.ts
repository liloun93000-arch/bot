import type Anthropic from "@anthropic-ai/sdk";
import { REASONING_HEADROOM } from "./llm";
import type { Logger } from "./logger";
import { logDecision } from "./logger";

/**
 * Analyse d'une photo envoyée par un client : le bot peut ainsi « voir » ce
 * dont il s'agit, au lieu de recevoir seulement « photo reçue ».
 *
 * Renvoie une description factuelle et prudente (ce qui est réellement
 * visible, ce qui est identifiable, ce qui ne l'est pas), ou `null` si
 * l'analyse est impossible (modèle sans vision, image trop lourde, erreur
 * réseau…). Dans ce cas l'appelant retombe sur le comportement d'avant et le
 * Manager IA transmet la photo à Jacob.
 */

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_VISION_BYTES = 4 * 1024 * 1024;

export const VISION_SYSTEM = `Tu aides un assistant commercial WhatsApp (vente de produits Apple/high-tech, formations, services digitaux) à comprendre la photo envoyée par un client. Décris UNIQUEMENT ce que tu vois réellement, en français, en 2 à 4 phrases courtes :
- le type d'objet ou de capture d'écran ;
- ce qui est identifiable avec certitude (marque, modèle, couleur, texte lisible) ;
- ce qui reste incertain.
N'invente jamais un modèle, une capacité ou une référence qui n'est pas lisible. Si l'image est illisible ou sans rapport, dis-le. Réponds uniquement avec la description, sans préambule.`;

export async function describeImage(
  client: Anthropic,
  model: string,
  image: { data: Buffer; mime: string },
  caption: string | undefined,
  log: Logger,
): Promise<string | null> {
  const mime = image.mime.split(";")[0]?.trim() ?? "";
  if (!SUPPORTED.has(mime) || image.data.byteLength > MAX_VISION_BYTES) {
    logDecision(log, "image_analysis_skipped", { mime, bytes: image.data.byteLength });
    return null;
  }
  try {
    const response = await client.messages.create({
      model,
      // Modèle à raisonnement : le plafond DOIT inclure la marge de réflexion.
      max_tokens: REASONING_HEADROOM + 400,
      system: VISION_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: image.data.toString("base64") },
            },
            { type: "text", text: caption?.trim() ? `Légende du client : « ${caption.trim()} »` : "Le client n'a pas ajouté de légende." },
          ],
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) {
      logDecision(log, "image_analysis_empty", {});
      return null;
    }
    logDecision(log, "image_analyzed", { chars: text.length });
    return text.slice(0, 800);
  } catch (err) {
    // Typiquement : le modèle ou l'endpoint n'accepte pas les images.
    log.error({ err: String(err) }, "image_analysis_failed");
    return null;
  }
}
