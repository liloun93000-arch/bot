import {
  createCore,
  refreshKimiBalance,
  createGate,
  createLlmClient,
  createLogger,
  ensureStripePaymentLink,
  pollStripePayments,
  processInboundMedia,
  describeImage,
  pushApiInvoiceItems,
  recordUsage,
  reviewExample,
  WhatsAppClient,
  withUsageMetering,
  type AlertDeps,
  reclassifyQuestions,
  ensureRelanceTemplate,
  RELANCE_TEMPLATE_NAME,
} from "@arbi/core";
import { readFile } from "node:fs/promises";
import { cleanupSmallTalkAlerts, installCatalogues, installScript, fixCasquettesPrice, auditCasquettes } from "./catalog-seed";
import { patchAppleNoMoq, patchCatalogue, patchOgFactory } from "./catalog-patches";
import { seedKnowledgeBase } from "./kb-seed";
import { relanceTick } from "./relance";
import { resendFailedMessages } from "./resend-failed";
import { dirname, join } from "node:path";
import { SalesAgent } from "./agent";
import { loadConfig } from "./config";
import { createHandler } from "./handler";
import { DebounceQueue } from "./queue";
import { buildServer } from "./server";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL, "wa-agent");

  const core = createCore({
    dbPath: config.DB_PATH,
    catalogueSeedPath: config.CATALOGUE_PATH,
    adminWhatsappNumber: config.ADMIN_WHATSAPP_NUMBER,
    dashboardUrl: config.DASHBOARD_URL,
  });

  // Catalogues PDF China Access : installés automatiquement dans « Fichiers du bot ».
  await installScript(core, config.CATALOGUE_PATH, log);
  fixCasquettesPrice(core, log);
  patchCatalogue(core, log);
  patchOgFactory(core, log);
  patchAppleNoMoq(core, log);
  // Templates WhatsApp (relance hors fenêtre 24 h) : retrouve le compte WABA, journalise l'état réel chez Meta et
  // soumet le template de relance s'il n'existe pas. En arrière-plan : ne retarde jamais le démarrage.
  void (async () => {
    try {
      const env = { token: config.WHATSAPP_TOKEN, wabaId: process.env.WABA_ID, phoneNumberId: process.env.PHONE_NUMBER_ID, apiBase: process.env.GRAPH_API_BASE };
      const out = await ensureRelanceTemplate(env);
      log.info(
        `meta_templates_check action=${out.action} waba=${out.wabaId ?? "?"} detail=${String(out.detail ?? "").slice(0, 900)} templates=[${out.templates.map((t) => `${t.name}|${t.language}|${t.status}|${t.category ?? ""}`).join(", ")}]`,
      );
      const usable = out.action === "deja_approuve" || out.action === "en_attente" || out.action === "soumis";
      if (usable && !String(core.settings.get("relance_template_name") ?? "").trim()) {
        core.settings.set("relance_template_name", RELANCE_TEMPLATE_NAME);
        log.info({ nom: RELANCE_TEMPLATE_NAME }, "relance_template_name_set");
      }
    } catch (err) {
      log.error({ err: String(err) }, "meta_templates_check_failed");
    }
  })();
  // Recalcul unique des anciennes demandes (catégories + exclusion des politesses), sans IA ni suppression.
  if (core.settings.get("demandes_recalcul_v1") !== true) {
    const r = reclassifyQuestions(core);
    core.settings.set("demandes_recalcul_v1", true);
    log.info(r, "demandes_reclassified");
  }
  seedKnowledgeBase(core, join(dirname(config.CATALOGUE_PATH), "knowledge", "llc-ltd-source.txt"), log);
  auditCasquettes(core, log);
  cleanupSmallTalkAlerts(core, log);
  await installCatalogues(core, join(dirname(config.CATALOGUE_PATH), "catalogues"), config.MEDIA_DIR, log);

  const gate = createGate({
    getContact: (waId) => {
      const contact = core.contacts.get(waId);
      return contact ? { optOut: contact.optOut } : undefined;
    },
    lastInboundTs: (waId) => core.messages.lastInboundTs(waId),
  });
  const wa = new WhatsAppClient(
    {
      apiBase: config.GRAPH_API_BASE,
      token: config.WHATSAPP_TOKEN,
      phoneNumberId: config.PHONE_NUMBER_ID,
    },
    gate,
    log,
  );

  // Chaque appel LLM est compté et facturé au client (montant = coût interne × marge).
  const llm = withUsageMetering(
    createLlmClient({
      apiKey: config.ANTHROPIC_API_KEY,
      baseUrl: config.ANTHROPIC_BASE_URL || undefined,
      model: config.ANTHROPIC_MODEL,
    }),
    {
      inputCentsPerMTok: config.LLM_COST_INPUT_CENTS_PER_MTOK,
      outputCentsPerMTok: config.LLM_COST_OUTPUT_CENTS_PER_MTOK,
      markup: config.LLM_MARKUP,
    },
    (usage) => recordUsage(core, usage),
  );

  // Plus aucune notion d'abonnement : le service n'est jamais suspendu et aucun débit n'est généré.
  const billingEnforced = false;

  const alertDeps: AlertDeps = {
    core,
    wa,
    llm,
    model: config.ANTHROPIC_MODEL,
    log,
    resendApiKey: config.RESEND_API_KEY || undefined,
    emailFrom: config.ALERT_EMAIL_FROM || undefined,
  };

  const agent = new SalesAgent({
    core,
    client: llm,
    model: config.ANTHROPIC_MODEL,
    wa,
    alertDeps,
    log,
    // Les fichiers envoyables vivent sur le même volume que les médias reçus.
    // Le nom vient de la base, jamais du modèle : aucune traversée possible.
    readBotFile: async (fichier: string) => {
      try {
        return await readFile(join(config.MEDIA_DIR, fichier));
      } catch (err) {
        log.error({ err: String(err), fichier }, "bot_file_read_failed");
        return null;
      }
    },
  });

  // Lecture d'un média archivé (photos clients) : nécessaire pour transmettre une photo à Jacob.
  const readMedia = async (fichier: string): Promise<Buffer | null> => {
    try {
      return await readFile(join(config.MEDIA_DIR, fichier));
    } catch (err) {
      log.error({ err: String(err), fichier }, "media_read_failed");
      return null;
    }
  };
  const visionOn = config.VISION_ENABLED.toLowerCase() !== "false";

  const handler = createHandler({
    core,
    wa,
    agent,
    alertDeps,
    log,
    billingEnforced,
    llm,
    model: config.ANTHROPIC_MODEL,
    readMedia,
    // Rythme humain (script V9.1) : indicateur « en train d'écrire » + délai proportionnel.
    pace: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  });
  const queue = new DebounceQueue(
    config.DEBOUNCE_MS,
    handler,
    (err, waId) => {
      log.error({ waId, err: String(err) }, `batch_processing_error wa=${waId} err=${String(err).slice(0, 400)} stack=${String((err as Error)?.stack ?? "").split("\n").slice(1, 4).join(" | ").slice(0, 400)}`);
    },
    // Un message qui arrive pendant que le bot rédige rend sa réponse
    // obsolète : on coupe, et la reprise repart avec le fil complet.
    (waId) => agent.interrupt(waId),
  );

  const app = buildServer({
    config: { VERIFY_TOKEN: config.VERIFY_TOKEN, APP_SECRET: config.APP_SECRET },
    core,
    queue,
    log,
    processMedia: (input) =>
      processInboundMedia(
        {
          media: {
            apiBase: config.GRAPH_API_BASE,
            token: config.WHATSAPP_TOKEN,
            dir: config.MEDIA_DIR,
          },
          transcription: {
            apiUrl: config.TRANSCRIBE_API_URL,
            apiKey: config.TRANSCRIBE_API_KEY,
            model: config.TRANSCRIBE_MODEL,
            costCentsPerMinute: config.TRANSCRIBE_COST_CENTS_PER_MIN,
          },
          log,
          // Vision : le bot « voit » la photo (description factuelle injectée dans la conversation).
          // Si le modèle n'accepte pas les images, renvoie null → repli : la photo est transmise à Jacob.
          vision: visionOn
            ? (image, caption) => describeImage(llm, config.ANTHROPIC_MODEL, image, caption, log)
            : undefined,
          // La transcription est un coût API : facturée comme les appels LLM.
          onTranscriptionCost: (costCentimes, seconds, model) =>
            recordUsage(core, {
              model: `transcription:${model}`,
              inputTokens: Math.round(seconds),
              outputTokens: 0,
              costCentimes,
              billedCentimes: costCentimes * config.LLM_MARKUP,
            }),
        },
        input,
      ),
  });
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info(
    { port: config.PORT, model: config.ANTHROPIC_MODEL },
    "Agent commercial WhatsApp v2 démarré",
  );

  // Relevé du solde Kimi réel toutes les 10 min (page « Consommation Kimi »).
  const kimiTick = (): void => {
    void refreshKimiBalance(core, config.ANTHROPIC_API_KEY, config.ANTHROPIC_BASE_URL, 60_000).then((r) => {
      if (!r.ok) log.warn({ err: r.error }, "kimi_balance_failed");
    });
  };
  kimiTick();
  const kimiTimer = setInterval(kimiTick, 10 * 60 * 1000);
  kimiTimer.unref?.();

  // Réactivation automatique du bot après inactivité en mode humain.
  const releaseTimer = setInterval(() => {
    const delayH = core.settings.get("reactivation_delay_h");
    const released = core.contacts.releaseStaleHumanMode(delayH * 60 * 60 * 1000);
    if (released > 0) {
      log.info({ released, delayH }, "human_mode_auto_released");
    }
  }, 10 * 60 * 1000);

  // Auto-amélioration (§6) : revue des exemples appris en_attente, au plus 10
  // par passe, FIFO (les plus anciens d'abord — évite qu'un exemple récent ne
  // double un ancien indéfiniment). Un échec technique (exception LLM) laisse
  // la ligne en_attente pour retry à la passe suivante, jamais un rejet
  // silencieux (voir packages/core/src/learning.ts:reviewExample).
  const learningTimer = setInterval(() => {
    void (async () => {
      const pending = core.examples.list("en_attente", { limit: 10, order: "asc" });
      if (pending.length === 0) return;
      const pricingLabels = core.pricing.active().map((row) => row.label);
      for (const example of pending) {
        try {
          const result = await reviewExample(llm, config.ANTHROPIC_MODEL, example, pricingLabels, log);
          core.examples.update(example.id, {
            question: result.question,
            reponse: result.reponse,
            theme: result.theme,
          });
          core.examples.setStatut(example.id, result.garder ? "actif" : "rejete", result.motif);
        } catch (err) {
          log.error({ id: example.id, err: String(err) }, "review_example_failed");
          // Plafond de tentatives (§6) : au-delà, la ligne est rejetée
          // automatiquement plutôt que de rester en_attente et de bloquer la
          // file FIFO (10 places) pour tout nouvel exemple valide.
          core.examples.recordFailedAttempt(example.id);
        }
      }
    })();
  }, 15 * 60 * 1000);

  // Relance automatique des clients silencieux (désactivée par défaut, réglée dans Réglages).
  // Renvoi unique des messages refusés par Meta pour cause de paiement (code 131042), une fois le paiement réglé.
  setTimeout(() => {
    void resendFailedMessages({
      core,
      sendText: (waId, text) => wa.sendText(waId, text),
      log: { info: (m) => log.info(m), warn: (m) => log.warn(m) },
    }).catch((err) => log.error({ err: String(err) }, "resend_failed_crashed"));
  }, 60_000);
  const relanceTimer = setInterval(() => {
    void relanceTick({ core, wa, llm, model: config.ANTHROPIC_MODEL, log });
  }, 5 * 60 * 1000);
  relanceTimer.unref?.();

  let stripeTimer: NodeJS.Timeout | undefined;
  if (config.STRIPE_SECRET_KEY) {
    const key = config.STRIPE_SECRET_KEY;
    // La création du lien est une étape du poll : un échec Stripe transitoire
    // au boot est retenté toutes les 15 min au lieu d'être perdu jusqu'au
    // prochain redémarrage.
    const poll = async () => {
      try {
        // Toujours appelé : vérifie aussi que les références mémorisées
        // appartiennent bien au compte de la clé courante (auto-réparation
        // après un changement de compte Stripe).
        await ensureStripePaymentLink(core, key, log);
        await pollStripePayments(core, key, log);
        await pushApiInvoiceItems(core, key, log);
      } catch (err) {
        log.error({ err: String(err) }, "stripe_poll_failed");
      }
    };
    void poll();
    stripeTimer = setInterval(() => void poll(), 15 * 60 * 1000);
  }

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Arrêt en cours");
    clearInterval(releaseTimer);
    clearInterval(relanceTimer);
    clearInterval(learningTimer);
    if (stripeTimer) clearInterval(stripeTimer);
    await app.close();
    core.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Démarrage impossible :", err);
  process.exit(1);
});
