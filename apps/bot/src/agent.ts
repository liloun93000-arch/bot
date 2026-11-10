import type Anthropic from "@anthropic-ai/sdk";
import {
  allowedAmounts,
  amountsIn,
  bestMatches,
  checkStyleRules,
  formatKnowledgeForPrompt,
  thresholdsFrom,
  findForeignPrices,
  logDecision,
  registerMarkers,
  triggerAlert,
  PAYMENT_OUTBOUND_RE,
  type AlertDeps,
  type ConversationStateData,
  type Core,
  type Logger,
  type WhatsAppClient,
} from "@arbi/core";
import type { Analysis } from "./brain";
import { buildDynamicContext, buildStaticPrompt } from "./prompt";
import { executeTool, exposedTools, type ToolContext } from "./tools";
import { claimsHandoffToJacob, escalateAndAck, isPaymentStage, looksLikeNoAnswer, stripJacobNumbers } from "./escalation";

interface HistoryRow {
  role: string;
  contenu: string;
}

// Filet déterministe anti-encaissement : déplacé dans @arbi/core (packages/core/src/pricing.ts)
// pour que packages/core/src/learning.ts puisse aussi s'en servir (rejet des
// exemples appris) sans dépendance circulaire vers apps/bot. Ré-exporté ici
// pour ne rien casser côté appelants existants de ce module.
export { PAYMENT_OUTBOUND_RE };

/** Qualificatifs acceptés autour d'un prix « dès » (jamais présenté comme final). */
const FROM_QUALIFIER_RE =
  /(à partir de|a partir de|d[èe]s\s|commenc|d[ée]marr|d[ée]but|minimum|entre\s|prix de d[ée]part|selon (le|ton) projet)/i;

/**
 * Convertit l'historique en messages Anthropic : rôles consécutifs fusionnés,
 * premier tour "user", tout tour assistant final tronqué (prefill interdit —
 * défense en profondeur : generate() refuse déjà un historique ne se terminant
 * pas par un tour client). Les messages de Jacob (role human) apparaissent
 * côté assistant, préfixés.
 */
export function toAnthropicMessages(history: HistoryRow[]): Anthropic.Messages.MessageParam[] {
  const messages: Anthropic.Messages.MessageParam[] = [];
  for (const row of history) {
    const role: "user" | "assistant" = row.role === "user" ? "user" : "assistant";
    const contenu = row.role === "human" ? `[Réponse de Jacob] ${row.contenu}` : row.contenu;
    if (messages.length === 0 && role !== "user") continue;
    const last = messages.at(-1);
    if (last && last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n${contenu}`;
    } else {
      messages.push({ role, content: contenu });
    }
  }
  while (messages.at(-1)?.role === "assistant") {
    messages.pop();
  }
  return messages;
}

export interface AgentDeps {
  core: Core;
  client: Anthropic;
  model: string;
  wa: WhatsAppClient;
  alertDeps: AlertDeps;
  log: Logger;
  maxTokens?: number;
  maxIterations?: number;
  /** Lecture d'un fichier de la bibliothèque (accès disque injecté). */
  readBotFile?: (fichier: string) => Promise<Buffer | null>;
}

export interface AgentResult {
  text: string | null;
  alertFired: boolean;
  niveau4Sent: boolean;
  /** Une escalade vers Jacob a été créée et le client prévenu (un seul message) : rien d'autre à envoyer. */
  escalated?: boolean;
  /**
   * Dernier message client couvert par cette réponse. Marqué en base une fois
   * la réponse réellement ENVOYÉE, pour qu'un message arrivé entre-temps
   * obtienne la sienne au lieu d'être pris pour un doublon.
   */
  coveredMessageId?: number;
  /**
   * Persistance de l'état (marqueurs de style, flags groupe/cross-sell,
   * replyCount) — appelée par respond() UNIQUEMENT quand la réponse est
   * retenue, pour qu'une réponse jetée par la régénération ne pollue pas
   * l'état de la conversation.
   */
  commit?: () => void;
}

/**
 * Nombre de reprises quand le client continue d'écrire pendant que le bot
 * rédige. Chaque nouveau message coupe la génération et relance ; au-delà, le
 * batch suivant prendra le relais, pour qu'un client qui écrit sans arrêt
 * n'empêche jamais une réponse de partir.
 */
const MAX_REGENERATIONS = 8;

export class SalesAgent {
  private staticPrompt = "";
  private allowed = new Set<string>();
  private fromOnlyAmounts = new Set<string>();
  private versionStamp = "";
  /** Générations en cours, par contact : permet de les couper à la volée. */
  private readonly inFlight = new Map<string, AbortController>();
  private readonly maxTokens: number;
  private readonly maxIterations: number;

  /**
   * Coupe la génération en cours pour ce contact. Appelée dès qu'un nouveau
   * message arrive : la réponse en préparation est déjà obsolète.
   */
  interrupt(waId: string): void {
    const controller = this.inFlight.get(waId);
    if (!controller) return;
    controller.abort();
    this.inFlight.delete(waId);
  }

  constructor(private readonly deps: AgentDeps) {
    this.maxTokens = deps.maxTokens ?? 1024;
    this.maxIterations = deps.maxIterations ?? 6;
    this.refreshKnowledge();
  }

  /** Recharge prompt statique + montants autorisés si catalogue/tarifs/documents/exemples/guide de style ont changé. */
  private refreshKnowledge(): void {
    const { core } = this.deps;
    const pricingStampRow = core.sqlite
      .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS m FROM pricing`)
      .get() as { n: number; m: number };
    // Un document désactivé ou un exemple encore en_attente ne compte pas dans
    // ces stamps (documents.stamp()/examples.stamp() ne portent que sur les
    // lignes réellement injectées) : pas de réécriture de cache pour rien.
    const docStamp = core.documents.stamp();
    const exStamp = core.examples.stamp();
    const styleGuideRow = core.sqlite
      .prepare(`SELECT updated_at AS m FROM settings WHERE key = 'style_guide_appris'`)
      .get() as { m: number } | undefined;
    const botFileStamp = core.sqlite
      .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(id), 0) AS m FROM bot_files WHERE actif = 1`)
      .get() as { n: number; m: number };
    // `bot_autonomie` fait partie de l'empreinte : sans lui, changer le réglage
    // au back-office ne régénérerait pas le prompt en cache.
    const stamp =
      `${core.catalogue.currentVersionId()}:${pricingStampRow.n}:${pricingStampRow.m}` +
      `:${docStamp.n}:${docStamp.m}:${exStamp.n}:${exStamp.m}:${styleGuideRow?.m ?? 0}` +
      `:${core.settings.get("bot_autonomie")}` +
      // Sans ça, un fichier ajouté ou désactivé n'apparaîtrait pas dans le
      // prompt tant que le bot n'a pas redémarré.
      `:${botFileStamp.n}:${botFileStamp.m}` +
      `:mia${core.settings.get("manager_ia_actif") ? 1 : 0}`;
    if (stamp === this.versionStamp) return;
    const catalogue = core.catalogue.current().contenu;
    const rows = core.pricing.active();
    this.staticPrompt = buildStaticPrompt(
      catalogue,
      rows,
      core.documents.actifs(),
      core.examples.actifs(20),
      core.settings.get("style_guide_appris"),
      core.settings.get("bot_autonomie"),
      core.botFiles.actifs(),
      Boolean(core.settings.get("manager_ia_actif")),
    );
    // INVARIANT §0.1 : allowedAmounts ne prend QUE pricing + catalogue — jamais
    // les documents/exemples appris, qui n'élargissent JAMAIS les montants
    // autorisés en sortie (garde-fou vérifié par test dédié).
    this.allowed = allowedAmounts(rows, catalogue);

    // Montants qui n'existent QUE comme prix de départ (FROM) : ils devront
    // toujours être accompagnés d'un qualificatif « à partir de » / « dès ».
    const fixedAmounts = new Set<string>();
    const fromAmounts = new Set<string>();
    for (const row of rows) {
      const target = row.type === "FROM" ? fromAmounts : fixedAmounts;
      if (row.prixMin != null) target.add(String(row.prixMin));
      if (row.prixMax != null) target.add(String(row.prixMax));
      if (row.affichage) for (const a of amountsIn(row.affichage)) target.add(a);
    }
    this.fromOnlyAmounts = new Set([...fromAmounts].filter((a) => !fixedAmounts.has(a)));

    this.versionStamp = stamp;
    logDecision(this.deps.log, "knowledge_reloaded", { stamp });
  }

  /**
   * Manager IA : connaissances validées par Jacob qui correspondent au message
   * (avec niveau de confiance configurable) + demande éventuellement déjà en
   * attente chez Jacob pour ce client. Contexte DYNAMIQUE : jamais mis en cache.
   */
  private managerContext(waId: string, analysis: Analysis): string {
    const { core } = this.deps;
    if (!core.settings.get("manager_ia_actif")) return "";
    const thresholds = thresholdsFrom(core);
    const matches = bestMatches(
      core.knowledge.entries.active(),
      analysis.combinedText,
      { serviceKey: analysis.serviceKey ?? null },
      5,
    );
    const parts = [formatKnowledgeForPrompt(matches, thresholds)];
    const pending = core.knowledge.escalations.openFor(waId);
    if (pending) {
      parts.push(
        `# Demande en attente chez Jacob\nUne demande est DÉJÀ ouverte chez Jacob pour ce client (« ${pending.question.slice(0, 200)} ») et le client a déjà été prévenu automatiquement. Ne la reposte pas, n'appelle pas ask_director pour la même question, et N'ENVOIE AUCUN message d'attente ni de relance à ce sujet. Réponds uniquement aux AUTRES questions que tu maîtrises. Si le client te demande explicitement où ça en est, une seule phrase courte suffit (Jacob a été prévenu, tu reviens dès que tu as sa réponse) — sans numéro.`,
      );
    }
    return parts.join("\n\n");
  }

  /**
   * Prix « dès » cités comme prix fermes : pour chaque phrase contenant un
   * montant FROM, exige un qualificatif de prix de départ.
   */
  private fromViolations(reply: string): string[] {
    const violations: string[] = [];
    for (const sentence of reply.split(/(?<=[.!?\n])/)) {
      const cited = amountsIn(sentence).filter((a) => this.fromOnlyAmounts.has(a));
      if (cited.length === 0) continue;
      if (!FROM_QUALIFIER_RE.test(sentence)) violations.push(...cited);
    }
    return [...new Set(violations)];
  }

  /**
   * Garde-fou déterministe de sortie. Il ne reste QUE le filet
   * anti-encaissement : aucun IBAN, RIB, lien de paiement ou adresse crypto ne
   * doit partir à un client, même halluciné — c'est un risque de fraude, pas
   * un confort de rédaction.
   *
   * Les blocages tarifaires ont été retirés sur décision de Jacob : ils
   * remplaçaient la réponse par un renvoi vers lui et cassaient des
   * conversations que le bot menait correctement. Le bot répond maintenant
   * sur sa base de connaissance.
   */
  async guardReply(
    waId: string,
    reply: string,
    analysis: Analysis,
  ): Promise<{ text: string; blocked: boolean }> {
    const { core, log } = this.deps;

    const payment = reply.match(PAYMENT_OUTBOUND_RE);
    if (payment) {
      logDecision(log, "payment_guard_blocked", { waId, match: payment[0] });
      await triggerAlert(this.deps.alertDeps, {
        waId,
        motif: "coordonnées/lien de paiement détectés dans la réponse sortante (garde-fou)",
        intention: analysis.intent,
        categorie: analysis.categorie,
        dernierMessage: analysis.combinedText.slice(0, 300),
      });
      const contact = core.settings.get("contact_direct");
      return {
        text: `Pour tout ce qui touche au paiement, c'est Jacob qui gère en direct : écris-lui au ${contact}. Il a été prévenu de ton message.`,
        blocked: true,
      };
    }

    // Les blocages tarifaires (service sur devis chiffré, montant hors grille)
    // ont été RETIRÉS sur décision explicite de Jacob : ils remplaçaient la
    // réponse par un renvoi vers lui, y compris quand le bot citait un prix
    // parfaitement officiel, et coupaient des conversations qu'il maîtrisait.
    // Le bot répond désormais sur sa base de connaissance. Les prix restent
    // cadrés côté prompt (grille = seule source) et le garde FROM continue de
    // faire régénérer un « dès X » présenté comme prix ferme — sans jamais
    // renvoyer le client ailleurs. Un montant hors grille est simplement
    // journalisé, pour rester visible sans bloquer.
    const foreign = findForeignPrices(reply, this.allowed);
    if (foreign.length > 0) {
      logDecision(log, "price_out_of_grid", { waId, foreign });
    }

    // Le numéro de Jacob n'est JAMAIS donné hors parcours de paiement (celui-ci passe par le
    // garde-fou ci-dessus ou par le message niveau 4) : toute phrase qui le contient est retirée.
    const numbers = [
      core.settings.get("contact_direct"),
      ...((core.settings.get("admin_numbers") as Array<{ number: string; actif: boolean }>) ?? [])
        .filter((a) => a.actif)
        .map((a) => a.number),
    ];
    // Script V9.1, section 11 : le numéro de Jacob est permis au moment du PAIEMENT (paiement autrement
    // que par carte, offre personnelle hors boutique). Partout ailleurs, il est retiré.
    if (isPaymentStage(analysis.combinedText)) return { text: reply, blocked: false };
    const cleaned = stripJacobNumbers(reply, numbers);
    if (cleaned.stripped) {
      logDecision(log, "jacob_number_stripped", { waId });
      return { text: cleaned.text, blocked: false };
    }

    return { text: reply, blocked: false };
  }

  async respond(waId: string, analysis: Analysis): Promise<AgentResult> {
    this.refreshKnowledge();
    // Un client qui écrit par rafales envoie souvent un 2e, un 3e message
    // pendant que le bot rédige. À chaque nouveau message : la génération en
    // cours est COUPÉE (`interrupt`), et on repart avec tout le fil — le bot
    // répond une seule fois, en tenant compte du dernier message reçu.
    // Le plafond évite qu'un client qui écrit sans arrêt bloque la réponse.
    for (let pass = 0; pass < MAX_REGENERATIONS; pass++) {
      const cursor = this.deps.core.messages.lastUserMessageId(waId);
      const controller = new AbortController();
      this.inFlight.set(waId, controller);
      let result: AgentResult;
      try {
        result = await this.generate(waId, analysis, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) {
          logDecision(this.deps.log, "generation_interrupted", { waId, pass });
          continue; // un nouveau message est arrivé : on repart de zéro
        }
        throw err;
      } finally {
        if (this.inFlight.get(waId) === controller) this.inFlight.delete(waId);
      }
      if (result.text === null && !result.escalated) return result;
      if (this.deps.core.messages.lastUserMessageId(waId) !== cursor) {
        // Message arrivé pendant la génération sans l'interrompre (fin de
        // requête déjà en vol) : on JETTE cette réponse, sans persister son
        // état, et on régénère avec l'historique complet.
        logDecision(this.deps.log, "regenerate_after_new_message", { waId, pass });
        continue;
      }
      result.commit?.();
      // Le message couvert est celui présent au DÉBUT de cette génération :
      // un message arrivé depuis n'a pas été lu et doit rester sans réponse,
      // pour que le batch suivant le traite.
      return { ...result, coveredMessageId: cursor ?? 0 };
    }
    logDecision(this.deps.log, "regeneration_limit_reached", { waId });
    return { text: null, alertFired: false, niveau4Sent: false };
  }

  private async generate(
    waId: string,
    analysis: Analysis,
    signal?: AbortSignal,
  ): Promise<AgentResult> {
    const { core, client, model, log } = this.deps;
    const state = core.state.get(waId);
    const flags = { alertFired: false, niveau4Sent: false, escalationAckSent: false };
    // 40 lignes, tous rôles confondus : un client qui écrit par rafales
    // consomme 3 à 4 lignes par tour, donc 20 ne couvrait que ~5 échanges.
    const history = core.messages.history(waId, 40);

    // Le batch a-t-il déjà reçu une réponse ? On compare le dernier message
    // CLIENT à celui que la dernière réponse envoyée couvrait réellement.
    //
    // L'ancien critère (« le dernier message en base n'est pas du client »)
    // se fiait à l'ordre des id : un message arrivé pendant que le bot
    // rédigeait, ou pendant l'aller-retour d'envoi WhatsApp, passait derrière
    // la ligne de réponse et n'obtenait JAMAIS de réponse. C'est ce qui
    // faisait ignorer le 2e ou 3e message d'une rafale.
    const dernierClient = core.messages.lastUserMessageId(waId) ?? 0;
    if (dernierClient === 0 || dernierClient <= state.repliedMessageId) {
      logDecision(log, "batch_already_answered", {
        waId,
        dernierClient,
        deja: state.repliedMessageId,
      });
      return { text: null, alertFired: false, niveau4Sent: false };
    }
    // Jacob a repris la main après le dernier message client : le bot se tait.
    if (history.at(-1)?.role === "human") {
      logDecision(log, "human_took_over", { waId });
      return { text: null, alertFired: false, niveau4Sent: false };
    }
    const messages = toAnthropicMessages(history);

    const toolCtx: ToolContext = {
      waId,
      core,
      wa: this.deps.wa,
      alertDeps: this.deps.alertDeps,
      readBotFile: this.deps.readBotFile,
      state,
      log,
      flags,
      lastClientMessage: analysis.combinedText.slice(0, 300),
    };

    // Mémoire client (§5) : les 20 faits stockables, tous injectés. En n'en
    // passant que 10, la moitié de ce que Jacob voyait au back-office
    // n'atteignait jamais le bot — « il a l'info mais ne s'en sert pas ».
    // Ces lignes ne sont pas mises en cache, mais 20 faits courts pèsent peu
    // face au coût d'une réponse à côté.
    const dynamicContext = buildDynamicContext(
      state,
      core.settings.get("group_link"),
      core.settings.get("contact_direct"),
      core.facts.actifs(waId, 20),
      this.managerContext(waId, analysis),
    ) + (core.alerts.hasOpenFor(waId)
      ? "\n- ALERTE DÉJÀ OUVERTE pour ce client : Jacob est prévenu et va reprendre la conversation ici. Ne recrée pas d'alerte et ne répète pas l'annonce ; continue sur ce que tu peux traiter."
      : "");
    const system: Anthropic.Messages.TextBlockParam[] = [
      { type: "text", text: this.staticPrompt, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamicContext },
    ];

    let styleRetried = false;
    let fromRetried = false;
    let budget = this.maxTokens;
    let toolsUsed = false;

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const response = await client.messages.create(
        {
          model,
          max_tokens: budget,
          system,
          tools: exposedTools(),
          // Prix justes sur un long script : température basse à modérée (notice V9.1, §5).
          temperature: 0.4,
          messages,
        },
        // Coupe l'appel dès qu'un nouveau message client arrive : inutile de
        // finir (et de payer) une réponse qui sera de toute façon jetée.
        signal ? { signal } : undefined,
      );

      if (response.stop_reason === "refusal") {
        logDecision(log, "agent_refusal", { waId });
        return this.safetyFallback(waId, analysis, "refus du modèle", flags);
      }

      if (response.stop_reason === "max_tokens") {
        if (budget === this.maxTokens) {
          budget = this.maxTokens * 4;
          logDecision(log, "agent_retry_larger_budget", { waId, budget });
          continue;
        }
        logDecision(log, "agent_truncated", { waId });
        return this.safetyFallback(waId, analysis, "réponse tronquée", flags);
      }

      if (response.stop_reason === "tool_use") {
        toolsUsed = true;
        const toolUses = response.content.filter(
          (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
        );
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const toolUse of toolUses) {
          let output: string;
          let isError = false;
          try {
            output = await executeTool(toolUse.name, toolUse.input, toolCtx);
          } catch (err) {
            log.error({ waId, tool: toolUse.name, err: String(err) }, "tool_error");
            output = "Erreur interne de l'outil. Utilise ask_director.";
            isError = true;
          }
          results.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: output,
            ...(isError ? { is_error: true } : {}),
          });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      let text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      // Niveau 4 déjà envoyé par l'outil : la réponse texte doit rester vide.
      if (flags.niveau4Sent || flags.escalationAckSent) {
        this.persistTurn(state, "");
        logDecision(log, "agent_reply", { waId, niveau4: flags.niveau4Sent, escalated: flags.escalationAckSent });
        return {
          text: null,
          alertFired: flags.alertFired,
          niveau4Sent: flags.niveau4Sent,
          ...(flags.escalationAckSent ? { escalated: true } : {}),
        };
      }

      if (!text) {
        this.persistTurn(state, "");
        return { text: null, alertFired: flags.alertFired, niveau4Sent: false };
      }

      // Anti-répétition des marqueurs de style : une seule régénération.
      const styleCheck = checkStyleRules(text, state.styleMarkers, state.replyCount);
      if (!styleCheck.ok && !styleRetried) {
        styleRetried = true;
        logDecision(log, "style_regenerate", { waId, violations: styleCheck.violations });
        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content: `[Consigne interne, invisible pour le client] Reformule ta dernière réponse SANS expression familière (${styleCheck.violations.join(" ; ")}). Garde exactement le même fond.`,
        });
        continue;
      }
      if (!styleCheck.ok) {
        logDecision(log, "style_violation_sent", { waId, violations: styleCheck.violations });
      }

      // Prix « dès » présenté comme prix ferme : une régénération pour le
      // formuler correctement. Si le modèle s'entête, la réponse part quand
      // même — mieux vaut un « à partir de » manquant qu'une conversation
      // interrompue par un renvoi.
      const fromViolations = this.fromViolations(text);
      if (fromViolations.length > 0 && !fromRetried) {
        fromRetried = true;
        logDecision(log, "from_price_regenerate", { waId, amounts: fromViolations });
        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content: `[Consigne interne, invisible pour le client] Les montants ${fromViolations.join(", ")} € sont des prix DE DÉPART : reformule en le disant explicitement (« à partir de », « dès », « le prix final dépend du projet »). Garde le même fond.`,
        });
        continue;
      }
      if (fromViolations.length > 0) {
        logDecision(log, "from_price_not_qualified", { waId, amounts: fromViolations });
      }

      // Telegram (décision de Jacob) : aucun lien t.me / telegram.me, aucune mention de Telegram, SAUF la
      // redirection des produits à l'unité vers le revendeur @OGFactoryBot (script, section 8).
      {
        const before = text;
        text = text
          .split("\n")
          .filter((line) => {
            if (/\b(?:t|telegram)\.me\//i.test(line)) return false;
            if (/telegram/i.test(line) && !/@OGFactoryBot/i.test(line)) return false;
            return true;
          })
          .join("\n")
          .trim();
        if (text !== before) logDecision(log, "telegram_stripped", { waId });
      }

      // Lien du groupe privé : jamais deux fois dans une conversation.
      const groupLink = core.settings.get("group_link");
      if (groupLink && text.includes(groupLink)) {
        if (state.groupLinkSent) {
          text = text
            .split("\n")
            .filter((line) => !line.includes(groupLink))
            .join("\n")
            .trim();
          logDecision(log, "group_link_stripped", { waId });
        } else {
          state.groupLinkSent = true;
        }
      }

      // Cross-sell : un seul rebond par conversation (détection heuristique).
      if (/\b(si tu veux aussi|je peux aussi te|pense aussi à|en complément)\b/i.test(text)) {
        state.crossSellDone = true;
      }

      const guarded = await this.guardReply(waId, text, analysis);
      if (guarded.blocked) flags.alertFired = true;

      // Le bot ANNONCE qu'il transmet à Jacob (« je transmets ta demande à Jacob », « je fais remonter »…)
      // sans avoir appelé l'outil d'alerte : on crée l'alerte nous-mêmes. Aucune annonce ne doit rester
      // sans demande visible dans l'onglet Jacob.
      if (!guarded.blocked && !flags.alertFired && claimsHandoffToJacob(guarded.text) && !core.alerts.hasOpenFor(waId)) {
        logDecision(log, "handoff_claim_without_alert", { waId });
        await escalateAndAck(
          { core, wa: this.deps.wa, llm: this.deps.alertDeps.llm, model: this.deps.alertDeps.model, log, readMedia: this.deps.readBotFile, alertDeps: this.deps.alertDeps },
          { waId, question: analysis.combinedText.slice(0, 500), categorie: analysis.categorie, intention: analysis.intent, state, ack: false },
        );
        flags.alertFired = true;
      }

      // Un « je n'ai pas l'information » n'est pas une réponse : vraie escalade interne, un seul
      // message client, aucun numéro.
      if (!guarded.blocked && (looksLikeNoAnswer(guarded.text) || guarded.text.length === 0)) {
        logDecision(log, "no_answer_reply_converted_to_escalation", { waId });
        const alertMode = core.settings.get("escalation_mode") !== "question";
        await escalateAndAck(
          { core, wa: this.deps.wa, llm: this.deps.alertDeps.llm, model: this.deps.alertDeps.model, log, readMedia: this.deps.readBotFile, alertDeps: this.deps.alertDeps },
          {
            waId,
            question: analysis.combinedText.slice(0, 500),
            categorie: analysis.categorie,
            intention: analysis.intent,
            state,
            // Mode alerte : la réponse du modèle (« je n'ai pas l'info sous la main… ») part telle quelle ;
            // le message figé ne sert qu'en dernier recours, s'il n'y a aucun texte à envoyer.
            ...(alertMode && guarded.text.length === 0 ? { ack: true } : {}),
          },
        );
        if (alertMode && guarded.text.length > 0) {
          return { text: guarded.text, alertFired: true, niveau4Sent: false, commit: () => this.persistTurn(state, guarded.text) };
        }
        flags.alertFired = true;
        this.persistTurn(state, "");
        return { text: null, alertFired: true, niveau4Sent: false, escalated: true };
      }

      logDecision(log, "agent_reply", {
        waId,
        iterations: iteration + 1,
        toolsUsed,
        blocked: guarded.blocked,
      });
      return {
        text: guarded.text,
        alertFired: flags.alertFired,
        niveau4Sent: false,
        commit: () => this.persistTurn(state, guarded.text),
      };
    }

    logDecision(log, "agent_max_iterations", { waId, toolsUsed });
    if (toolsUsed) {
      this.persistTurn(state, "");
      return { text: null, alertFired: flags.alertFired, niveau4Sent: flags.niveau4Sent, ...(flags.escalationAckSent ? { escalated: true } : {}) };
    }
    return this.safetyFallback(waId, analysis, "boucle sans réponse", flags);
  }

  private persistTurn(state: ConversationStateData, sentReply: string): void {
    if (sentReply) {
      state.styleMarkers = registerMarkers(state.styleMarkers, sentReply, state.replyCount);
      state.replyCount += 1;
    }
    this.deps.core.state.save(state);
  }

  private async safetyFallback(
    waId: string,
    analysis: Analysis,
    motif: string,
    flags: { alertFired: boolean; niveau4Sent: boolean; escalationAckSent?: boolean },
  ): Promise<AgentResult> {
    // Incident technique (refus, troncature, boucle) : la demande est transmise à Jacob en
    // interne, le client reçoit UN message d'information — jamais un numéro.
    const state = this.deps.core.state.get(waId);
    logDecision(this.deps.log, "safety_fallback_escalation", { waId, motif });
    await escalateAndAck(
      { core: this.deps.core, wa: this.deps.wa, llm: this.deps.alertDeps.llm, model: this.deps.alertDeps.model, log: this.deps.log, readMedia: this.deps.readBotFile, alertDeps: this.deps.alertDeps },
      // Incident technique : aucun texte du modèle → le message d'information est le dernier recours.
      { waId, question: analysis.combinedText.slice(0, 500) || motif, categorie: analysis.categorie, intention: analysis.intent, state, ack: true },
    );
    this.persistTurn(state, "");
    return { text: null, alertFired: true, niveau4Sent: flags.niveau4Sent, escalated: true };
  }
}
