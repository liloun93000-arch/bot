import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createKnowledge } from "./src/knowledge";
export { createLogger } from "./src/logger";
export function silentLogger() { return createLogger("silent"); }
import { createLogger } from "./src/logger";
export function testCore() {
  const raw = new DatabaseSync(":memory:");
  const mig = readFileSync("./src/migrations.ts", "utf8");
  raw.exec(mig.slice(mig.indexOf("CREATE TABLE IF NOT EXISTS knowledge_entries"), mig.indexOf("CREATE TABLE IF NOT EXISTS settings (")));
  const db = { prepare: (sql: string) => { const s = raw.prepare(sql); return { all: (...p: any[]) => s.all(...p), get: (...p: any[]) => s.get(...p), run: (...p: any[]) => s.run(...p) }; } };
  const settings = new Map<string, unknown>(Object.entries({ admin_numbers: [], confiance_seuil_haut: 0.7, confiance_seuil_bas: 0.4, alert_template_name: "alerte_admin", alert_template_lang: "fr", relance_template_name: "" }));
  const contacts = new Map<string, any>();
  const msgs: any[] = [];
  return {
    knowledge: createKnowledge(db as any, Date.now),
    settings: { get: (k: string) => settings.get(k) as any, set: (k: string, v: unknown) => { settings.set(k, v); } },
    contacts: {
      get: (id: string) => contacts.get(id),
      upsert: (id: string, nom?: string | null) => { contacts.set(id, { ...(contacts.get(id) ?? { modeHumain: 0, optOut: 0, langue: "fr" }), nom: nom ?? contacts.get(id)?.nom }); },
      setModeHumain: (id: string, on: boolean) => { contacts.get(id).modeHumain = on ? 1 : 0; },
    },
    messages: { insert: (waId: string, role: string, contenu: string, wamid: string | null = null) => { msgs.push({ waId, role, contenu, wamid }); return msgs.length; }, all: () => msgs },
  } as any;
}
