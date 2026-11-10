import { BRAND_ASSETS } from "@/lib/brand-assets.generated";

// Logo et mascotte de l'interface. Public (même logique qu'un favicon) : la
// page de connexion en a besoin avant toute session. Le build standalone ne
// copie pas `public/` : les images sont embarquées dans le code.
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }): Promise<Response> {
  const { name } = await params;
  const asset = Object.prototype.hasOwnProperty.call(BRAND_ASSETS, name) ? BRAND_ASSETS[name] : undefined;
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(asset.b64, "base64"), {
    headers: {
      "content-type": asset.mime,
      "cache-control": "public, max-age=86400",
    },
  });
}
