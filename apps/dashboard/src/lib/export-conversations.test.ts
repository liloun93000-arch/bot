import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createCore } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { exportFilePath, getJob, startExport } from "./export-conversations";

const WA = "33612345678";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("export des conversations en ZIP", () => {
  it("produit un ZIP lisible avec texte, JSON, index, vrai média et média manquant signalé", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "aj-export-"));
    process.env.MEDIA_DIR = join(tmp, "media");
    process.env.EXPORT_DIR = join(tmp, "exports");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(process.env.MEDIA_DIR);
    writeFileSync(join(process.env.MEDIA_DIR, "ok.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    const core = createCore({ dbPath: join(tmp, "t.db"), catalogueSeedPath: undefined, adminWhatsappNumber: "33600000000", dashboardUrl: "" } as never);
    core.contacts.upsert(WA, "Karim Benali");
    core.messages.insert(WA, "user", "Bonjour, je veux une LLC");
    core.messages.insert(WA, "assistant", "Avec plaisir !");
    core.messages.insert(WA, "user", "[Photo du client]", "w1", Date.now(), { type: "image", file: "ok.jpg", mime: "image/jpeg" });
    core.messages.insert(WA, "user", "[Message vocal] je voudrais un devis", "w2", Date.now(), { type: "audio", file: "absent.ogg", mime: "audio/ogg" });
    core.messages.insert(WA, "user", "[Document reçu]", "w3", Date.now(), { type: "document", file: "", mime: "application/pdf" });

    const job = startExport(core, join(tmp, "t.db"), [WA]);
    for (let i = 0; i < 100 && getJob(process.env.EXPORT_DIR, job.id)?.etat !== "termine"; i++) await wait(50);
    const done = getJob(process.env.EXPORT_DIR, job.id)!;
    expect(done.erreur).toBe("");
    expect(done.etat).toBe("termine");
    expect(done.pourcent).toBe(100);
    expect(done.totalMedias).toBe(2);
    expect(done.mediasManquants).toBe(1);
    const path = exportFilePath(process.env.EXPORT_DIR, done)!;
    expect(readFileSync(path).subarray(0, 2).toString()).toBe("PK");

    const dest = join(tmp, "out");
    execFileSync("python3", ["-c", `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;z.extractall(sys.argv[2])`, path, dest]);
    const conv = JSON.parse(readFileSync(join(dest, "conversations.json"), "utf8"));
    const msgs = conv.conversations[0].messages;
    expect(msgs).toHaveLength(5);
    expect(msgs[3].transcription_vocale).toBe("je voudrais un devis");
    expect(readFileSync(join(dest, `conversations/${WA}-Karim-Benali/medias/${msgs[2].id}-image.jpg`))).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    expect(readFileSync(join(dest, "medias_manquants.txt"), "utf8")).toContain("absent.ogg");
    expect(readFileSync(join(dest, `conversations/${WA}-Karim-Benali/conversation.txt`), "utf8")).toContain("Transcription : je voudrais un devis");
    expect(JSON.parse(readFileSync(join(dest, "index.json"), "utf8")).conversations).toHaveLength(1);
    core.close();
  });
});
