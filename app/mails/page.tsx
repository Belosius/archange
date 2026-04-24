'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { apiFetch } from '@/lib/api-fetch'
import { useRouter } from 'next/navigation'



// âââ Type espace dynamique ââââââââââââââââââââââââââââââââââââââââââââââââââââ
interface EspaceDyn {
  id: string; nom: string; color: string; description: string;
  assisMin: string; assisMax: string;   // capacitÃ© assis (fourchette)
  deboutMin: string; deboutMax: string; // capacitÃ© debout / cocktail (fourchette)
  /** @deprecated legacy â migrÃ© vers assisMin/assisMax/deboutMin/deboutMax */
  capacite?: string;
}
const DEFAULT_ESPACES_DYN: EspaceDyn[] = [
  { id: "rdc",       nom: "Rez-de-chaussÃ©e", color: "#C9A876", assisMin: "80",  assisMax: "100", deboutMin: "100", deboutMax: "150", description: "Espace principal 120mÂ², idÃ©al grandes rÃ©ceptions" },
  { id: "patio",     nom: "Le Patio",         color: "#6DB8A0", assisMin: "40",  assisMax: "75",  deboutMin: "60",  deboutMax: "100", description: "Espace extÃ©rieur couvert 70mÂ², ambiance intimiste" },
  { id: "belvedere", nom: "Le BelvÃ©dÃ¨re",     color: "#6D9BE8", assisMin: "40",  assisMax: "75",  deboutMin: "60",  deboutMax: "100", description: "Espace en hauteur 70mÂ², vue panoramique" },
];
// Alias pour rÃ©trocompatibilitÃ© â les autres parties de l'app utilisent encore ESPACES
// On le remplace dynamiquement via useEspaces()
const ESPACES_LEGACY = DEFAULT_ESPACES_DYN;
const TYPES_EVT = ["DÃ®ner","DÃ©jeuner","Cocktail","Buffet","ConfÃ©rence","RÃ©union","SoirÃ©e DJ","KaraokÃ©","SoirÃ©e Ã  thÃ¨me"];
const MOIS = ["Janvier","FÃ©vrier","Mars","Avril","Mai","Juin","Juillet","AoÃ»t","Septembre","Octobre","Novembre","DÃ©cembre"];
type StatutDef = { id: string; label: string; bg: string; color: string };

const DEFAULT_STATUTS: StatutDef[] = [
  { id: "nouveau",    label: "Nouveau",    bg: "#EFF6FF", color: "#1D4ED8" },
  { id: "en_cours",  label: "En cours",   bg: "#FEF3C7", color: "#92400E" },
  { id: "en_attente",label: "En attente", bg: "#FDF4FF", color: "#7E22CE" },
  { id: "confirme",  label: "ConfirmÃ©",   bg: "#D1FAE5", color: "#3F5B32" },
  { id: "annule",    label: "AnnulÃ©",     bg: "#FEE2E2", color: "#991B1B" },
];

// âââ SYSTEM_PROMPT dynamique â gÃ©nÃ©rÃ© Ã  partir des donnÃ©es de l'Ã©tablissement â
// Plus aucune mention codÃ©e en dur de RÃVA â tout vient des Sources IA
function buildSystemPrompt(opts: {
  nomEtab: string;
  adresseEtab: string;
  emailEtab: string;
  telEtab: string;
  espacesDyn: EspaceDyn[];
}): string {
  const { nomEtab, adresseEtab, emailEtab, telEtab, espacesDyn } = opts;
  const nom = nomEtab || "l'Ã©tablissement";
  const adresse = adresseEtab || "";
  const email = emailEtab || "";

  // Formater la capacitÃ© d'un espace : "40â75 assis, 60â100 debout"
  const fmtCapacite = (e: EspaceDyn) => {
    const parts: string[] = [];
    if (e.assisMin || e.assisMax) {
      const min = e.assisMin, max = e.assisMax;
      parts.push(min && max && min !== max ? `${min}â${max} assis` : `${max || min} assis`);
    }
    if (e.deboutMin || e.deboutMax) {
      const min = e.deboutMin, max = e.deboutMax;
      parts.push(min && max && min !== max ? `${min}â${max} debout/cocktail` : `${max || min} debout/cocktail`);
    }
    // fallback legacy
    if (parts.length === 0 && e.capacite) parts.push(e.capacite);
    return parts.join(", ");
  };

  const espacesTexte = espacesDyn.length > 0
    ? espacesDyn.map(e => {
        const cap = fmtCapacite(e);
        return `- ${e.nom}${cap ? ` (${cap})` : ""}${e.description ? ` : ${e.description}` : ""}`;
      }).join("\n")
    : "Les espaces sont dÃ©crits dans les Sources IA.";
  const espacesAlternatifs = espacesDyn.length > 1
    ? espacesDyn.map((e, i) =>
        `   - Si ${e.nom} pris â valorise ${espacesDyn.filter((_,j)=>j!==i).map(x=>x.nom).join(" ou ")}`
      ).join("\n")
    : "";
  const signature = [
    "Cordialement,",
    `L'Ã©quipe ${nom}`,
    adresse,
    email,
    telEtab,
  ].filter(Boolean).join("\n");

  return `Tu es ARCHANGE, l'assistant commercial de ${nom}${adresse ? ` (${adresse})` : ""}. Tu rÃ©ponds aux emails reÃ§us par l'Ã©tablissement avec le niveau d'expertise d'un directeur commercial expÃ©rimentÃ© dans la restauration Ã©vÃ©nementielle haut de gamme.

â ï¸ââââââââââââââââââââââââââââââ
â ï¸ MISSION CRITIQUE â Ã RAPPELER Ã CHAQUE LECTURE
â ï¸ââââââââââââââââââââââââââââââ

Tu rÃ©ponds AU CLIENT RÃEL, pas Ã  la plateforme intermÃ©diaire. Si le mail vient de Zenchef/ABC Salles/etc., le destinataire de TA rÃ©ponse est le vrai client (dont les coordonnÃ©es sont dans le briefing en dÃ©but de message utilisateur), pas la plateforme.

<identite_etablissement>
  <nom>${nom}</nom>
  ${adresse ? `<adresse>${adresse}</adresse>` : ""}
  ${email ? `<email_contact>${email}</email_contact>` : ""}
  ${telEtab ? `<telephone>${telEtab}</telephone>` : ""}
</identite_etablissement>

<espaces_disponibles>
${espacesTexte.split("\n").map(l => "  " + l).join("\n")}
</espaces_disponibles>

ââââââââââââââââââââââââââââââ
ð¯ TON RÃLE
ââââââââââââââââââââââââââââââ

Tu incarnes un commercial senior spÃ©cialisÃ© dans la restauration Ã©vÃ©nementielle. Double compÃ©tence :
1. Relationnelle : tu crÃ©es immÃ©diatement un lien chaleureux et professionnel
2. Commerciale : tu valorises systÃ©matiquement l'offre de ${nom} et tu cherches Ã  convertir chaque contact en rÃ©servation concrÃ¨te

Tu ne te contentes jamais de "rÃ©pondre" â tu accompagnes, tu proposes, tu rassures, tu convaincs avec subtilitÃ©.

â ï¸ââââââââââââââââââââââââââââââ
â ï¸ SOURCES DE RÃFÃRENCE â PRIORITÃ ABSOLUE
â ï¸ââââââââââââââââââââââââââââââ

Tu vas recevoir dans le message utilisateur des sections balisÃ©es <sources_archange>, <planning_temps_reel>, <historique_echanges_avec_ce_client>. Ces Ã©lÃ©ments constituent ta documentation OFFICIELLE.

RÃGLES STRICTES :
- Lis intÃ©gralement chaque section <menus>, <conditions>, <espaces>, <regles_ton> avant de rÃ©diger
- Cite EXACTEMENT les chiffres, conditions, noms, tarifs des sources â jamais d'approximation
- Donne TOUJOURS prioritÃ© aux informations des sources sur tes connaissances gÃ©nÃ©rales
- Si une info demandÃ©e n'est pas dans les sources, dis-le Ã©lÃ©gamment :
  "Notre Ã©quipe vous confirme ce point trÃ¨s prochainement"
  â JAMAIS d'invention, JAMAIS de "j'estime Ã  environ..."

ââââââââââââââââââââââââââââââ
ð PLANNING & DISPONIBILITÃS
ââââââââââââââââââââââââââââââ

Tu reÃ§ois <planning_temps_reel> avec la liste complÃ¨te des rÃ©servations en cours. Chaque ligne indique : espace, date, horaires, nombre de personnes, statut.

RÃGLE DE DISPONIBILITÃ :
Un espace est INDISPONIBLE uniquement si une rÃ©servation existante sur ce crÃ©neau a un statut "confirmÃ©".
Tout autre statut (option, en attente, devis envoyÃ©) ne bloque pas le crÃ©neau â tu peux proposer l'espace en prÃ©cisant que la disponibilitÃ© sera confirmÃ©e sous peu.

COMPORTEMENT SELON LA SITUATION :
1. Espace demandÃ© DISPONIBLE â Confirme avec enthousiasme, propose les prochaines Ã©tapes
2. Espace demandÃ© INDISPONIBLE â Regrets brefs, rebondis immÃ©diatement sur un espace alternatif
${espacesAlternatifs ? espacesAlternatifs + "\n" : ""}
   â Si AUCUN espace n'est disponible : propose une date ou un horaire alternatif avec bienveillance
3. CrÃ©neau non prÃ©cisÃ© â Demande la date et l'heure souhaitÃ©es avant de te prononcer
4. Plusieurs espaces dispo â Oriente vers le plus adaptÃ© selon le type d'Ã©vÃ©nement et le nombre

ââââââââââââââââââââââââââââââ
âï¸ STYLE & TONALITÃ
ââââââââââââââââââââââââââââââ

TOUJOURS :
- Chaleureux mais professionnel â jamais familier, jamais froid
- PersonnalisÃ© : utilise le PRÃNOM du client rÃ©el (pas celui de la plateforme)
- Concis et clair : pas de phrases inutiles, chaque mot compte
- Positif et orientÃ© solution : mÃªme face Ã  une contrainte, propose une alternative
- En franÃ§ais impeccable, sans fautes, ponctuation soignÃ©e

JAMAIS :
- De formules gÃ©nÃ©riques creuses ("Suite Ã  votre mailâ¦", "N'hÃ©sitez pas Ã â¦")
- De jargon administratif ("Dans l'attente de vous lire", "Bien Ã  vous")
- De rÃ©ponses trop longues qui noient l'essentiel
- D'informations inventÃ©es sur les disponibilitÃ©s ou les tarifs

ââââââââââââââââââââââââââââââ
ð FORMAT DE LA RÃPONSE
ââââââââââââââââââââââââââââââ

Structure recommandÃ©e :
1. Formule d'ouverture personnalisÃ©e ("Bonjour [PrÃ©nom],")
2. Accroche chaleureuse en 1 phrase
3. Corps du message â rÃ©ponse structurÃ©e, aÃ©rÃ©e
4. Appel Ã  l'action clair
5. Formule de clÃ´ture Ã©lÃ©gante
6. Signature (sera fournie dans les instructions finales du message utilisateur)

â ï¸ââââââââââââââââââââââââââââââ
â ï¸ RÃGLES ABSOLUES
â ï¸ââââââââââââââââââââââââââââââ

- Tu rÃ©ponds UNIQUEMENT en franÃ§ais
- Tu ne rÃ©vÃ¨les jamais que tu es une IA
- Tu n'inventes JAMAIS de disponibilitÃ©s, tarifs ou faits non confirmÃ©s par les sources
- Pour les disponibilitÃ©s, tu te bases EXCLUSIVEMENT sur le planning fourni
- Si une information te manque, tu le dis Ã©lÃ©gamment
- Tu gÃ©nÃ¨res uniquement le texte de la rÃ©ponse email, rien d'autre`;
}
// âââ DÃ©tection plateforme intermÃ©diaire (Zenchef, ABC Salles, etc.) ââââââââââ
// Scanne D'ABORD l'expÃ©diteur, PUIS le corps si fourni (cas des mails forwardÃ©s)
function detectPlateforme(fromEmail: string, body?: string): string | null {
  // 1. DÃ©tection sur l'expÃ©diteur direct
  if (fromEmail) {
    const e = fromEmail.toLowerCase();
    if (/zenchef/.test(e)) return "Zenchef";
    if (/abcsalles|abc-salles/.test(e)) return "ABC Salles";
    if (/funbooker/.test(e)) return "Funbooker";
    if (/bookingshake/.test(e)) return "BookingShake";
    if (/thefork|lafourchette/.test(e)) return "TheFork";
    if (/mapado/.test(e)) return "Mapado";
    if (/eventdrive/.test(e)) return "Eventdrive";
    if (/bedouk/.test(e)) return "Bedouk";
    if (/^(noreply|no-reply|notifications?|ne-pas-repondre|do-not-reply|mailer|system|postmaster)@/i.test(e)) return "Plateforme automatique";
  }
  // 2. Si pas dÃ©tectÃ© et qu'on a le corps : scanner les mails forwardÃ©s
  if (body) {
    const b = body.toLowerCase();
    // Indicateur que c'est un forward
    const estForward = /fwd\s*:|fw\s*:|forwarded\s+message|d[Ã©e]but\s+du\s+message\s+r[Ã©e]exp[Ã©e]di[Ã©e]|----[-\s]*(forwarded|message\s+transf[Ã©e]r[Ã©e])/i.test(body);
    if (estForward) {
      if (/(^|[\s<(]+)(de|from)\s*:[^\n]{0,200}zenchef/im.test(body)) return "Zenchef (via forward)";
      if (/(^|[\s<(]+)(de|from)\s*:[^\n]{0,200}abc[-\s]?salles/im.test(body)) return "ABC Salles (via forward)";
      if (/(^|[\s<(]+)(de|from)\s*:[^\n]{0,200}funbooker/im.test(body)) return "Funbooker (via forward)";
      if (/(^|[\s<(]+)(de|from)\s*:[^\n]{0,200}bookingshake/im.test(body)) return "BookingShake (via forward)";
      if (/(^|[\s<(]+)(de|from)\s*:[^\n]{0,200}(thefork|lafourchette)/im.test(body)) return "TheFork (via forward)";
      if (/(^|[\s<(]+)(de|from)\s*:[^\n]{0,200}mapado/im.test(body)) return "Mapado (via forward)";
      if (/(^|[\s<(]+)(de|from)\s*:[^\n]{0,200}eventdrive/im.test(body)) return "Eventdrive (via forward)";
      if (/(^|[\s<(]+)(de|from)\s*:[^\n]{0,200}bedouk/im.test(body)) return "Bedouk (via forward)";
      // Forward dÃ©tectÃ© mais plateforme inconnue
      return "Mail forwardÃ© (source Ã  analyser dans le corps)";
    }
  }
  return null;
}

// âââ DÃ©tection si l'email est un mail forwardÃ© (Fwd:, transfÃ©rÃ©, etc.) ââââââ
function estMailForwarde(email: { subject?: string; body?: string }): boolean {
  const s = (email.subject || "").toLowerCase();
  if (/^(fwd|fw|tr)\s*:|^fwd:|^fw:/i.test(s.trim())) return true;
  if (email.body) {
    return /forwarded\s+message|d[Ã©e]but\s+du\s+message\s+r[Ã©e]exp[Ã©e]di[Ã©e]|----[-\s]*(forwarded|message\s+transf[Ã©e]r[Ã©e])/i.test(email.body);
  }
  return false;
}

// âââ Extraction du vrai contact client depuis le corps (cas plateforme) âââââ
function extraireContactDepuisCorps(corps: string, fromEmail?: string): { email: string|null, telephone: string|null, nomComplet: string|null } {
  if (!corps) return { email: null, telephone: null, nomComplet: null };
  const platformeEmail = (fromEmail||"").toLowerCase();
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = (corps.match(emailRegex) || [])
    .map(e => e.toLowerCase())
    .filter(e => e !== platformeEmail
      && !/noreply|no-reply|notifications?|do-not-reply|ne-pas-repondre|mailer|postmaster/.test(e)
      && !/zenchef|abcsalles|funbooker|bookingshake|thefork|mapado|eventdrive|bedouk/.test(e));
  const phoneRegex = /(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}\b/g;
  const phones = corps.match(phoneRegex) || [];
  const nomMatch = corps.match(/\b(?:nom|name)\s*[:=]\s*([A-ZÃ-Ã][A-Za-zÃ-Ã¿\s'-]{1,40})/i);
  const prenomMatch = corps.match(/\b(?:pr[Ã©e]nom|first.?name)\s*[:=]\s*([A-ZÃ-Ã][A-Za-zÃ-Ã¿\s'-]{1,30})/i);
  let nomComplet: string | null = null;
  if (prenomMatch && nomMatch) nomComplet = `${prenomMatch[1].trim()} ${nomMatch[1].trim()}`;
  else if (nomMatch) nomComplet = nomMatch[1].trim();
  else if (prenomMatch) nomComplet = prenomMatch[1].trim();
  return {
    email: emails[0] || null,
    telephone: phones[0]?.trim() || null,
    nomComplet,
  };
}

// âââ Estimation tokens (rough â 1 token â 4 chars en franÃ§ais) ââââââââââââââ
function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / 4);
}
function estimateCostUSD(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 3 / 1_000_000) + (outputTokens * 15 / 1_000_000);
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Sources ARCHANGE v2 â Activation conditionnelle des rÃ¨gles commerciales
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Renvoie UNIQUEMENT les rÃ¨gles pertinentes pour le mail en cours, selon les
// infos extraites par l'IA. RÃ©duit la taille du prompt et augmente la prÃ©cision.
function activerReglesSelonContexte(opts: {
  extraction: any | null;
  regles: any; // ReglesCommerciales
  espacesDyn: { id: string; nom: string }[];
}): string {
  const { extraction, regles, espacesDyn } = opts;
  if (!extraction || !regles) return "";

  const activees: string[] = [];

  // Nombre de personnes
  const nbPers = typeof extraction.nombrePersonnes === "number" ? extraction.nombrePersonnes : null;
  if (nbPers !== null && regles.parNombrePersonnes) {
    let key = "";
    if (nbPers < 30) key = "petits";
    else if (nbPers <= 80) key = "moyens";
    else if (nbPers <= 150) key = "grands";
    else key = "xl";
    const texte = regles.parNombrePersonnes[key];
    if (texte && texte.trim()) activees.push(`  <par_nombre_personnes categorie="${key} (${nbPers} pers.)">\n${texte.trim()}\n  </par_nombre_personnes>`);
  }

  // Budget par personne â dÃ©tection depuis string "45â¬/pers" etc.
  const budgetStr = String(extraction.budget || "").toLowerCase();
  const matchParPers = budgetStr.match(/(\d+)\s*â¬?\s*(?:\/|par)\s*(?:pers|personne)/);
  const budgetParPersonne = matchParPers ? parseInt(matchParPers[1], 10) : null;
  if (budgetParPersonne !== null && regles.parBudgetParPers) {
    let key = "";
    if (budgetParPersonne < 60) key = "economique";
    else if (budgetParPersonne <= 120) key = "standard";
    else key = "premium";
    const texte = regles.parBudgetParPers[key];
    if (texte && texte.trim()) activees.push(`  <par_budget_par_pers categorie="${key} (${budgetParPersonne}â¬/pers)">\n${texte.trim()}\n  </par_budget_par_pers>`);
  }

  // Budget total
  const matchTotal = budgetStr.match(/(\d+[\s.,]?\d*)\s*â¬/);
  let budgetTotal: number | null = null;
  if (matchTotal && !matchParPers) {
    budgetTotal = parseInt(matchTotal[1].replace(/[\s.,]/g, ""), 10);
  } else if (budgetParPersonne !== null && nbPers !== null) {
    budgetTotal = budgetParPersonne * nbPers;
  }
  if (budgetTotal !== null && regles.parBudgetTotal) {
    let key = "";
    if (budgetTotal < 250) key = "petit";
    else if (budgetTotal <= 1000) key = "moyen";
    else if (budgetTotal <= 2500) key = "important";
    else key = "tresImportant";
    const texte = regles.parBudgetTotal[key];
    if (texte && texte.trim()) activees.push(`  <par_budget_total categorie="${key} (${budgetTotal}â¬)">\n${texte.trim()}\n  </par_budget_total>`);
  }

  // Profil client â dÃ©tection simple depuis champ "entreprise" et "sourceEmail"
  if (regles.parProfilClient) {
    const entreprise = String(extraction.entreprise || "").trim();
    const nom = String(extraction.nom || "").trim();
    let profil = "";
    // Heuristique simple : entreprise non vide ET pas d'indication particulier â entreprise
    if (entreprise && !/mr|mme|m\.|mlle|madame|monsieur/i.test(nom)) {
      // DÃ©tecter institutionnel vs entreprise classique vs agence
      const bigCorp = /mairie|ministÃ¨re|ministere|universitÃ©|universite|ambassade|prÃ©fecture|prefecture|conseil (rÃ©gional|general|gÃ©nÃ©ral)/i.test(entreprise);
      const agency = /agence|event|incentive|travel|communication|marketing/i.test(entreprise);
      if (bigCorp) profil = "institutionnels";
      else if (agency) profil = "agences";
      else profil = "entreprises";
    } else {
      profil = "particuliers";
    }
    const texte = regles.parProfilClient[profil];
    if (texte && texte.trim()) activees.push(`  <par_profil_client categorie="${profil}">\n${texte.trim()}\n  </par_profil_client>`);
  }

  // Moment â basÃ© sur heureDebut
  const heure = String(extraction.heureDebut || "").match(/^(\d{1,2})/);
  if (heure && regles.parMoment) {
    const h = parseInt(heure[1], 10);
    let key = "";
    if (h >= 11 && h < 15) key = "dejeuner";
    else if (h >= 17 && h < 22) key = "soir";
    else if (h >= 22 || h < 5) key = "cocktailTardif";
    if (key) {
      const texte = regles.parMoment[key];
      if (texte && texte.trim()) activees.push(`  <par_moment categorie="${key} (${h}h)">\n${texte.trim()}\n  </par_moment>`);
    }
  }

  // Espace
  const espaceId = extraction.espaceDetecte;
  if (espaceId && regles.parEspace && regles.parEspace[espaceId]) {
    const esp = espacesDyn.find(e => e.id === espaceId);
    const texte = regles.parEspace[espaceId];
    if (texte && texte.trim()) activees.push(`  <par_espace id="${espaceId}" nom="${esp?.nom || espaceId}">\n${texte.trim()}\n  </par_espace>`);
  }

  if (activees.length === 0) return "";
  return `\n<regles_commerciales_activees>\n${activees.join("\n\n")}\n</regles_commerciales_activees>`;
}

// Sources ARCHANGE v2 â DÃ©tection des cas particuliers (clients VIP, partenaires)
function matchCasParticulier(opts: {
  email: { from?: string; fromEmail?: string };
  extraction: any | null;
  liste: any[]; // CasParticulier[]
}): any | null {
  const { email, extraction, liste } = opts;
  if (!liste || liste.length === 0) return null;
  const fromEmailLower = (email.fromEmail || "").toLowerCase();
  const extractedEmailLower = String(extraction?.email || "").toLowerCase();
  const fromNameLower = String(email.from || "").toLowerCase();
  const extractedNomLower = String(extraction?.nom || "").toLowerCase();

  for (const cp of liste) {
    if (cp.matchingMode === "manuel") continue; // Mode manuel : ne jamais auto-matcher
    const emailPat = String(cp.emailPattern || "").toLowerCase().trim();
    const nomPat = String(cp.nomPattern || "").toLowerCase().trim();

    // Match sur email : pattern @domaine.fr OU adresse complÃ¨te
    if (emailPat) {
      if (emailPat.startsWith("@") && (fromEmailLower.endsWith(emailPat) || extractedEmailLower.endsWith(emailPat))) return cp;
      if (!emailPat.startsWith("@") && (fromEmailLower === emailPat || extractedEmailLower === emailPat)) return cp;
      if (!emailPat.startsWith("@") && emailPat.includes("@") === false && (fromEmailLower.includes(emailPat) || extractedEmailLower.includes(emailPat))) return cp;
    }
    // Match sur nom
    if (nomPat && (fromNameLower.includes(nomPat) || extractedNomLower.includes(nomPat))) return cp;
  }
  return null;
}

// Sources ARCHANGE v2 â Construction du bloc ton & style formalitÃ©
function buildTonStyleBlock(ton: any, profilDetecte: string): string {
  if (!ton) return "";
  const parts: string[] = [];

  if (Array.isArray(ton.formulesValides) && ton.formulesValides.length > 0) {
    const formulesStr = ton.formulesValides
      .filter((f: any) => f && (f.formule || "").trim())
      .map((f: any) => `    â¢ ${f.contexte ? `[${f.contexte}] ` : ""}"${f.formule}"`)
      .join("\n");
    if (formulesStr) parts.push(`  <formules_a_utiliser>\n${formulesStr}\n  </formules_a_utiliser>`);
  }

  if (Array.isArray(ton.formulesInterdites) && ton.formulesInterdites.length > 0) {
    const interdits = ton.formulesInterdites.filter((f: string) => f && f.trim());
    if (interdits.length > 0) {
      parts.push(`  <formules_interdites>\n${interdits.map((f: string) => `    â¢ "${f}" â NE JAMAIS UTILISER`).join("\n")}\n  </formules_interdites>`);
    }
  }

  // FormalitÃ© : traduire le slider 0-1 en instruction verbale
  if (ton.formalite && profilDetecte && ton.formalite[profilDetecte] !== undefined) {
    const niveau = ton.formalite[profilDetecte];
    let desc = "";
    if (niveau < 0.25) desc = "Chaleureux et proche â utiliser un ton cordial, accessible, presque amical. Tutoiement possible si le client le propose.";
    else if (niveau < 0.5) desc = "Professionnel avec chaleur â vouvoiement, mais avec des formulations personnelles et bienveillantes.";
    else if (niveau < 0.75) desc = "Professionnel neutre â vouvoiement systÃ©matique, ton courtois et mesurÃ©.";
    else desc = "TrÃ¨s formel â vouvoiement strict, formulations institutionnelles, registre soutenu.";
    parts.push(`  <niveau_formalite profil="${profilDetecte}">\n    ${desc}\n  </niveau_formalite>`);
  }

  if (parts.length === 0) return "";
  return `\n<ton_style>\n${parts.join("\n\n")}\n</ton_style>`;
}

// EXTRACT_PROMPT est une fonction pour injecter la date du jour dynamiquement
const buildExtractPrompt = (
  nomEtablissement = "l'Ã©tablissement",
  espacesDyn: EspaceDyn[] = []
) => {
  const today = new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" });

  // Construire la rÃ¨gle d'attribution d'espaces dynamiquement
  let espacesRegle = "";
  if (espacesDyn.length > 0) {
    const withCap = espacesDyn.map(e => {
      const assisMax = parseInt(e.assisMax || "0", 10);
      const deboutMax = parseInt(e.deboutMax || "0", 10);
      const legacyMatch = (e.capacite || "").match(/(\d+)/g);
      const legacy = legacyMatch ? Math.max(...legacyMatch.map(Number)) : 0;
      const cap = Math.max(assisMax, deboutMax, legacy);
      return { id: e.id, nom: e.nom, assisMax, deboutMax, cap };
    }).sort((a, b) => a.cap - b.cap);

    espacesRegle = withCap.map((e, i) => {
      const prev = i > 0 ? withCap[i-1].cap + 1 : 1;
      const range = i === 0 ? `â¤ ${e.cap} personnes` :
                    i === withCap.length - 1 ? `> ${withCap[i-1].cap} personnes` :
                    `${prev}â${e.cap} personnes`;
      const assis = e.assisMax ? ` (max ${e.assisMax} assis, max ${e.deboutMax||e.assisMax} debout)` : "";
      return `    * ${range} â "${e.id}" (${e.nom})${assis}`;
    }).join("\n");
  } else {
    espacesRegle = `    * Laisse null si aucun espace n'est configurÃ©`;
  }

  return `Tu es un assistant spÃ©cialisÃ© dans l'analyse d'emails reÃ§us par ${nomEtablissement}, un lieu Ã©vÃ©nementiel.

Date du jour : ${today}

Analyse l'email ci-dessous et retourne UNIQUEMENT un JSON valide, sans aucun texte avant ou aprÃ¨s.

â ï¸ââââââââââââââââââââââââââââââ
â ï¸ RÃGLE FONDAMENTALE â IDENTIFIER LE CLIENT RÃEL
â ï¸ââââââââââââââââââââââââââââââ

L'expÃ©diteur technique du mail (champ "De:") n'est PAS toujours le client.
Beaucoup de demandes arrivent via des plateformes intermÃ©diaires :
  - Zenchef (noreply@*.zenchef.com, *@mg.zenchefrestaurants.com)
  - ABC Salles (info@abcsalles.com, contact@abc-salles.com, noreply@abcsalles.com)
  - BookingShake, Funbooker, TheFork, Mapado, Eventdrive, Bedouk
  - Formulaires de contact (no-reply@, contact@, hello@, info@)

INDICES qu'un mail vient d'une plateforme :
  - L'email "De:" contient : noreply, no-reply, notifications, ne-pas-repondre, mailer, system, postmaster
  - Le nom d'expÃ©diteur est gÃ©nÃ©rique : "Notifications", "RÃ©servations", "Contact"
  - Le corps contient des sections structurÃ©es type formulaire :
    "Nom: ... PrÃ©nom: ... Email: ... TÃ©lÃ©phone: ..."

DANS CE CAS, les VRAIES coordonnÃ©es du client sont DANS LE CORPS DU MAIL.
Tu DOIS les y chercher activement et les remplir dans nom/email/telephone/entreprise.
N'utilise les coordonnÃ©es du "De:" que si tu es certain qu'il s'agit du vrai client.

EXEMPLE :
  De: noreply@mg.zenchefrestaurants.com
  Corps: "Nouvelle demande. Nom: MORILLON. PrÃ©nom: Roxane.
          Email: roxane.morillon@setec.com. TÃ©lÃ©phone: 01 82 51 50 97
          SociÃ©tÃ©: SETEC. 30 personnes le 15 mai..."
  â  "nom": "Roxane MORILLON",
     "email": "roxane.morillon@setec.com",
     "telephone": "01 82 51 50 97",
     "entreprise": "SETEC"
  PAS noreply@mg.zenchefrestaurants.com !

â ï¸ââââââââââââââââââââââââââââââ
â ï¸ CAS SPÃCIAL â MAILS FORWARDÃS (Fwd:, Tr:, "transfÃ©rÃ©")
â ï¸ââââââââââââââââââââââââââââââ

Quand un mail est forwardÃ© (objet commenÃ§ant par "Fwd:", "Fw:", "Tr:",
ou corps contenant "DÃ©but du message rÃ©expÃ©diÃ©", "---------- Forwarded message",
"---------- Message transfÃ©rÃ©"), le VRAI message Ã  analyser est le mail ORIGINAL
inclus dans le corps, PAS le message du forwardeur.

Le forwardeur (ex: ton collÃ¨gue Olivier qui te transfÃ¨re une demande) n'est PAS
le client. MÃªme si sa signature apparaÃ®t en tÃªte du mail, ses coordonnÃ©es
(nom, email, tÃ©lÃ©phone) ne doivent PAS Ãªtre mises dans le JSON.

EXEMPLE DE FORWARD :
  De: Olivier Teissedre <reva13france@gmail.com>
  Objet: "TEST TES TEST Fwd: Nouvelle demande de rÃ©servation"
  Corps: "TEST TES TEST
          Bien Ã  vous
          Teissedre Olivier
          Mail: reva13france@gmail.com

          DÃ©but du message rÃ©expÃ©diÃ© :
          De: ABC Salles <contact@email.abcsalles.com>
          Objet: Nouvelle demande de rÃ©servation - Mariage
          RÃ©pondre Ã : shana1212@icloud.com

          Nouvelle demande pour RÃªva Brasserie, de la part de Shana Atia.
          Type: Mariage. 100 personnes. Date: 30/06/2026.
          Email: shana1212@icloud.com. TÃ©lÃ©phone: 06.51.75.53.19"

  CORRECT :
    "isReservation": true (c'est bien une demande de rÃ©servation !)
    "nom": "Shana Atia"
    "email": "shana1212@icloud.com"
    "telephone": "06.51.75.53.19"
    "sourceEmail": "plateforme:abc_salles"
    "typeEvenement": "Mariage"
    "dateDebut": "2026-06-30"
    "nombrePersonnes": 100

  INCORRECT (ce que tu ferais si tu ne lisais que la tÃªte du mail) :
    "isReservation": false (parce que "TEST TES TEST" semble anodin)
    "nom": "Olivier Teissedre"
    "email": "reva13france@gmail.com"
    â NON ! Olivier est le FORWARDEUR, pas le client.

RÃGLES POUR LES FORWARDS :
1. Lis INTÃGRALEMENT le corps, y compris la partie aprÃ¨s "DÃ©but du message rÃ©expÃ©diÃ©"
2. La demande de rÃ©servation est dans la PARTIE FORWARDÃE, pas en tÃªte
3. Ignore le "TEST", "Bonjour", "Bien Ã  vous" du forwardeur â ce n'est pas le vrai message
4. Si la partie forwardÃ©e vient d'une plateforme (ABC Salles, Zenchef...), applique les rÃ¨gles plateforme
5. isReservation = true si la partie forwardÃ©e est une demande de rÃ©servation

ââââââââââââââââââââââââââââââ
RÃGLES D'EXTRACTION :
ââââââââââââââââââââââââââââââ

- isReservation : true UNIQUEMENT si l'email contient une demande explicite de rÃ©servation, privatisation, devis pour un groupe, ou un Ã©vÃ©nement. Une simple question sur les horaires ou le menu = false.
  Note : un mail venant d'une plateforme de rÃ©servation avec des coordonnÃ©es client structurÃ©es est presque toujours isReservation=true.

- confiance : "haute" si tous les Ã©lÃ©ments clÃ©s sont prÃ©sents, "moyenne" si partielle, "faible" si incertain

- nom : PrÃ©nom + NOM du client rÃ©el (jamais le nom de la plateforme).
  Cherche dans le corps : "Nom:", "De la part de:", "Contact:", signatures de mail.

- email : adresse email du client rÃ©el. Si "De:" est noreply/plateforme â cherche dans le corps : "Email:", "Mail:", "Reply-To:", ou toute adresse prÃ©sente dans la signature.

- telephone : numÃ©ro du client. Cherche : "TÃ©lÃ©phone:", "TÃ©l:", "Phone:", "Mobile:", ou numÃ©ro franÃ§ais dans le corps.

- entreprise : sociÃ©tÃ© du client (PAS la plateforme). Cherche : "SociÃ©tÃ©:", "Entreprise:", "Company:", domaine email (roxane@setec.com â SETEC), signature.

- typeEvenement : dÃ©tecte parmi [DÃ®ner, DÃ©jeuner, Cocktail, Buffet, ConfÃ©rence, RÃ©union, SoirÃ©e DJ, KaraokÃ©, SoirÃ©e Ã  thÃ¨me, Afterwork, Team building, SÃ©minaire, Anniversaire, Mariage] ou laisse null

- nombrePersonnes : extrais le nombre maximum mentionnÃ© (entier). Ex : "entre 80 et 120" â 120

- nombrePersonnesMin : si une fourchette est mentionnÃ©e, extrais le minimum. Sinon, mÃªme valeur que nombrePersonnes.

- espaceDetecte : dÃ©duis l'espace le plus adaptÃ© selon le nombre de personnes et le type :
${espacesRegle}
  Si l'espace est mentionnÃ© explicitement dans l'email, utilise-le en prioritÃ©.

- dateDebut : format YYYY-MM-DD. Pour les dates relatives, utilise la date du jour fournie en rÃ©fÃ©rence.

- heureDebut / heureFin : format HH:MM. Si non mentionnÃ© â null

- budget : extrais le budget si mentionnÃ© (ex: "1900â¬", "45â¬/pers"), sinon null

- resume : 1-2 phrases maximum rÃ©sumant la demande de faÃ§on factuelle. Ne mettre que si isReservation est true, sinon null.

- notes : rÃ©sume en 1-2 phrases les dÃ©tails importants. Si le mail vient d'une plateforme, mentionne-la ici (ex: "Demande reÃ§ue via Zenchef").

- statutSuggere : suggÃ¨re un statut parmi [nouveau, en_cours, en_attente, confirme]

- sourceEmail : "client_direct" / "plateforme:zenchef" / "plateforme:abc_salles" / "plateforme:funbooker" / "plateforme:autre" / "formulaire_contact" / null

â ï¸ââââââââââââââââââââââââââââââ
â ï¸ AUTO-VÃRIFICATION AVANT DE RETOURNER LE JSON
â ï¸ââââââââââââââââââââââââââââââ

Avant de produire ta rÃ©ponse JSON, vÃ©rifie mentalement :
1. â L'email retournÃ© n'est PAS une adresse noreply / plateforme / systÃ¨me ?
2. â Le nom retournÃ© n'est PAS le nom de la plateforme ?
3. â L'entreprise retournÃ©e est bien celle du client (pas la plateforme) ?
4. â Si tu n'as pas trouvÃ© l'email/tÃ©lÃ©phone/nom : as-tu vraiment regardÃ© toute la signature ?

JSON Ã  retourner :
{
  "isReservation": false,
  "confiance": "haute|moyenne|faible",
  "nom": null,
  "email": null,
  "telephone": null,
  "entreprise": null,
  "typeEvenement": null,
  "nombrePersonnes": null,
  "nombrePersonnesMin": null,
  "espaceDetecte": null,
  "dateDebut": null,
  "heureDebut": null,
  "heureFin": null,
  "budget": null,
  "notes": null,
  "resume": null,
  "statutSuggere": "nouveau",
  "sourceEmail": null
}`;
};

// âââ Fonctions pures de construction de message (rÃ©utilisables sync + async) â
function buildExtractMessage(email: {
  from?: string;
  fromEmail?: string;
  subject?: string;
  body?: string;
  snippet?: string;
}): string {
  const fromEmail = email.fromEmail || "";
  const corpsBrut = email.body || email.snippet || "";
  // Nouveau : on passe le corps pour dÃ©tecter les forwards
  const plateforme = detectPlateforme(fromEmail, corpsBrut);
  const estForward = estMailForwarde({ subject: email.subject, body: corpsBrut });
  // On cherche le contact dans le corps si plateforme dÃ©tectÃ©e OU si c'est un forward
  const contactExtrait = (plateforme || estForward) ? extraireContactDepuisCorps(corpsBrut, fromEmail) : null;

  // Briefing adaptÃ© Ã  la situation
  let briefing: string;
  if (estForward && plateforme) {
    briefing = `ð¯ BRIEFING : Mail FORWARDÃ (transfÃ©rÃ©) â la demande originale vient de "${plateforme}". L'expÃ©diteur "${fromEmail}" est le FORWARDEUR, pas le client. Le vrai client et ses coordonnÃ©es sont dans la partie forwardÃ©e du corps (aprÃ¨s "DÃ©but du message rÃ©expÃ©diÃ©" ou Ã©quivalent).${contactExtrait?.email ? `\n   Indice automatique : email candidat = ${contactExtrait.email}` : ""}${contactExtrait?.nomComplet ? `\n   Indice automatique : nom candidat = ${contactExtrait.nomComplet}` : ""}${contactExtrait?.telephone ? `\n   Indice automatique : tÃ©lÃ©phone candidat = ${contactExtrait.telephone}` : ""}\n   â ï¸ NE PAS confondre les coordonnÃ©es du forwardeur avec celles du client rÃ©el.`;
  } else if (estForward) {
    briefing = `ð¯ BRIEFING : Mail FORWARDÃ (transfÃ©rÃ©) â l'expÃ©diteur "${fromEmail}" est le forwardeur, pas forcÃ©ment le client. Lis la partie forwardÃ©e du corps pour identifier la vraie demande et le vrai destinataire.${contactExtrait?.email ? `\n   Indice automatique : email candidat trouvÃ© dans le forward = ${contactExtrait.email}` : ""}${contactExtrait?.nomComplet ? `\n   Indice automatique : nom candidat = ${contactExtrait.nomComplet}` : ""}`;
  } else if (plateforme) {
    briefing = `ð¯ BRIEFING : Mail reÃ§u via la plateforme "${plateforme}". Le client rÃ©el n'est PAS l'expÃ©diteur "${fromEmail}". Cherche ses vraies coordonnÃ©es dans le corps.${contactExtrait?.email ? `\n   Indice automatique : email candidat = ${contactExtrait.email}` : ""}${contactExtrait?.nomComplet ? `\n   Indice automatique : nom candidat = ${contactExtrait.nomComplet}` : ""}${contactExtrait?.telephone ? `\n   Indice automatique : tÃ©lÃ©phone candidat = ${contactExtrait.telephone}` : ""}\n   VÃ©rifie ces indices et complÃ¨te les autres champs en lisant le corps complet.`;
  } else {
    briefing = `ð¯ BRIEFING : Mail direct du client (pas de plateforme ni forward dÃ©tectÃ©s).`;
  }

  const MAX_BODY = 30000;
  const corpsTronque = corpsBrut.length > MAX_BODY
    ? corpsBrut.slice(0, MAX_BODY) + "\n\n[â¦message tronquÃ© â " + corpsBrut.length + " chars au total]"
    : corpsBrut;

  return `${briefing}

<email_a_analyser>
  <metadonnees>
    <expediteur_technique>${email.from || ""} <${fromEmail}></expediteur_technique>
    <objet>${email.subject || "(sans objet)"}</objet>
    ${plateforme ? `<plateforme_detectee>${plateforme}</plateforme_detectee>` : ""}
    ${estForward ? `<mail_forwarde>true â la vraie demande est dans la partie forwardÃ©e du corps</mail_forwarde>` : ""}
  </metadonnees>
  <corps>
${corpsTronque}
  </corps>
</email_a_analyser>

â ï¸ Rappel final :${estForward ? ` c'est un MAIL FORWARDÃ â ignore les coordonnÃ©es du forwardeur en tÃªte, le vrai client est dans la partie forwardÃ©e du corps.` : ""}${plateforme ? ` le mail implique la plateforme "${plateforme}" â les vrais nom/email/tÃ©lÃ©phone/sociÃ©tÃ© sont DANS LE CORPS, pas dans <expediteur_technique>.` : (!estForward ? ` mail direct, utilise les coordonnÃ©es de l'expÃ©diteur.` : "")}
Retourne maintenant le JSON.`;
}

function buildResponseMessage(opts: {
  email: { from?: string; fromEmail?: string; subject?: string; body?: string; snippet?: string };
  extracted?: any;
  historiqueMails?: { from: string; fromEmail: string; date: string; subject: string; body: string; direction: "in"|"out" }[];
  signature?: string;
}): string {
  const { email, extracted, historiqueMails = [], signature = "" } = opts;
  const fromEmail = email.fromEmail || "";
  const corpsEmail = email.body || email.snippet || "";
  const plateforme = detectPlateforme(fromEmail, corpsEmail);
  const contactDansCorps = plateforme ? extraireContactDepuisCorps(corpsEmail, fromEmail) : null;
  const vraiNom = extracted?.nom || contactDansCorps?.nomComplet || email.from || "le client";
  const vraiEmail = extracted?.email || contactDansCorps?.email || fromEmail;
  const prenom = vraiNom.split(/\s+/)[0] || "";

  const briefing = `ð¯ BRIEFING â RÃPONSE Ã RÃDIGER :
Client : ${vraiNom}${extracted?.entreprise ? " (" + extracted.entreprise + ")" : ""}
Email du client : ${vraiEmail}
${plateforme ? `ð¨ Mail reÃ§u via la plateforme "${plateforme}" (saluer ${prenom}, pas la plateforme)` : "ð¨ Mail direct du client"}
${extracted?.dateDebut ? `Date demandÃ©e : ${extracted.dateDebut}` : ""}${extracted?.heureDebut ? ` Ã  ${extracted.heureDebut}` : ""}
${extracted?.nombrePersonnes ? `Personnes : ${extracted.nombrePersonnes}` : ""}
${extracted?.typeEvenement ? `Type : ${extracted.typeEvenement}` : ""}
${extracted?.budget ? `Budget : ${extracted.budget}` : ""}
${extracted?.resume ? `RÃ©sumÃ© : ${extracted.resume}` : ""}`;

  const histStr = historiqueMails.length > 0
    ? `<historique_echanges_avec_ce_client>
${historiqueMails.slice(0, 5).map(h => {
  const corpsH = (h.body || "").slice(0, 3000);
  return `  <${h.direction === "in" ? "mail_recu" : "reponse_envoyee"} date="${h.date}" expediteur="${h.from}">
    <objet>${h.subject || ""}</objet>
    <contenu>${corpsH}${(h.body||"").length > 3000 ? "\n[â¦tronquÃ©]" : ""}</contenu>
  </${h.direction === "in" ? "mail_recu" : "reponse_envoyee"}>`;
}).join("\n\n")}
</historique_echanges_avec_ce_client>`
    : `<historique_echanges_avec_ce_client>Aucun Ã©change prÃ©cÃ©dent avec ce client.</historique_echanges_avec_ce_client>`;

  const corpsTronque = (email.body || email.snippet || "").slice(0, 30000);
  const corpsAffiche = (email.body||"").length > 30000
    ? corpsTronque + "\n[â¦message tronquÃ©]"
    : corpsTronque;

  return `${briefing}

${histStr}

â ï¸ââââââââââââââââââââââââââââââ
â ï¸ EMAIL EN COURS â Ã TRAITER MAINTENANT
â ï¸ââââââââââââââââââââââââââââââ

<email_a_repondre>
  <metadonnees>
    <expediteur_affiche>${email.from || ""} <${fromEmail}></expediteur_affiche>
    <vrai_destinataire_de_la_reponse>${vraiNom} <${vraiEmail}></vrai_destinataire_de_la_reponse>
    <objet>${email.subject || "(sans objet)"}</objet>
  </metadonnees>
  <corps_complet>
${corpsAffiche}
  </corps_complet>
</email_a_repondre>

â ï¸ââââââââââââââââââââââââââââââ
â ï¸ INSTRUCTIONS FINALES POUR TA RÃPONSE
â ï¸ââââââââââââââââââââââââââââââ

RÃ©dige maintenant ta rÃ©ponse en respectant STRICTEMENT :

1. â Adresse-toi Ã  ${prenom || vraiNom} (et non Ã  la plateforme intermÃ©diaire)
2. â N'utilise QUE les tarifs/conditions prÃ©sents dans <sources_archange> du contexte systÃ¨me â n'invente jamais un chiffre
3. â VÃ©rifie la disponibilitÃ© dans <planning_temps_reel> avant de confirmer une date/un espace
4. â Si l'historique montre une promesse dÃ©jÃ  faite, respecte-la
5. â Ne re-propose pas une option dÃ©jÃ  mentionnÃ©e dans l'historique
6. â Termine par la signature exacte ci-dessous

SIGNATURE Ã UTILISER (exacte) :
---
${signature}
---

â ï¸ AVANT DE FINALISER TA RÃPONSE, AUTO-VÃRIFIE :
   â¢ Tous les chiffres (tarifs, capacitÃ©s) viennent-ils des sources ? (pas inventÃ©s)
   â¢ Le prÃ©nom utilisÃ© est-il bien celui du client rÃ©el ?
   â¢ La date proposÃ©e est-elle compatible avec le planning fourni ?
   â¢ La signature est-elle complÃ¨te et correcte ?

GÃ©nÃ¨re uniquement le texte de la rÃ©ponse email, rien d'autre.`;
}

// EMPTY_RESA : espaceId initialisÃ© au premier espace dispo â sera surchargÃ© par getEmptyResa()
const EMPTY_RESA = { id:null, prenom:"", nom:"", email:"", telephone:"", entreprise:"", typeEvenement:"", nombrePersonnes:"", espaceId:"", dateDebut:"", heureDebut:"", heureFin:"", statut:"nouveau", notes:"", budget:"", noteDirecteur:"" };

// âââ Traduction des erreurs techniques en langage humain âââââââââââââââââââââ
function humanError(e: any): string {
  const msg = (e?.message || String(e || "")).toLowerCase();
  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid_grant") || msg.includes("unauthenticated")) return "Votre session a expirÃ©. DÃ©connectez-vous puis reconnectez-vous.";
  if (msg.includes("403") || msg.includes("forbidden")) return "AccÃ¨s refusÃ©. VÃ©rifiez vos autorisations Gmail.";
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("overload") || msg.includes("surcharg")) return "Service momentanÃ©ment surchargÃ©. RÃ©essayez dans quelques secondes.";
  if (msg.includes("timeout") || msg.includes("abort") || msg.includes("dÃ©lai")) return "La requÃªte a pris trop de temps. VÃ©rifiez votre connexion et rÃ©essayez.";
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("rÃ©seau") || msg.includes("connexion") || msg.includes("failed to fetch")) return "Connexion impossible. VÃ©rifiez votre accÃ¨s internet.";
  if (msg.includes("500") || msg.includes("internal server")) return "Une erreur est survenue cÃ´tÃ© serveur. RÃ©essayez dans un moment.";
  if (msg.includes("503") || msg.includes("unavailable")) return "Le service est temporairement indisponible. RÃ©essayez dans quelques minutes.";
  if (msg.includes("gmail_auth_expired") || msg.includes("session gmail")) return "Session Gmail expirÃ©e. DÃ©connectez-vous puis reconnectez-vous.";
  if (msg.includes("ia indisponible") || msg.includes("erreur ia") || msg.includes("anthropic")) return "ARCHANGE est temporairement indisponible. RÃ©essayez dans un moment.";
  // Fallback â garder le message original si non reconnu, mais le nettoyer
  return e?.message || "Une erreur inattendue est survenue. RÃ©essayez.";
}

// âââ Stats globales d'usage API (in-memory, accessible via window pour debug) â
const apiUsageStats = {
  totalCalls: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUSD: 0,
  history: [] as { timestamp: string; type: string; inputTokens: number; outputTokens: number; costUSD: number }[],
};
if (typeof window !== "undefined") (window as any).__archangeApiStats = apiUsageStats;

async function callClaude(msg: string, system: string, docs: any[] | null, callType: string = "generic"): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  const inputTokens = estimateTokens(system) + estimateTokens(msg);
  try {
    const res = await apiFetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "raw", msg, system, docs }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Erreur API (${res.status})`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const response = data.response || "";
    const realInputTokens = data.usage?.input_tokens || inputTokens;
    const realOutputTokens = data.usage?.output_tokens || estimateTokens(response);
    const cost = estimateCostUSD(realInputTokens, realOutputTokens);
    apiUsageStats.totalCalls += 1;
    apiUsageStats.totalInputTokens += realInputTokens;
    apiUsageStats.totalOutputTokens += realOutputTokens;
    apiUsageStats.totalCostUSD += cost;
    apiUsageStats.history.push({
      timestamp: new Date().toISOString(),
      type: callType,
      inputTokens: realInputTokens,
      outputTokens: realOutputTokens,
      costUSD: cost,
    });
    if (apiUsageStats.history.length > 200) apiUsageStats.history.shift();
    return response;
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error("DÃ©lai dÃ©passÃ© â rÃ©essayez");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// âââ Extraction texte propre depuis HTML email ââââââââââââââââââââââââââââââââ
// Toujours retourne du texte lisible â utilisÃ© pour snippet, IA, et prÃ©visualisation
function stripHtml(raw: string): string {
  if (!raw) return "";
  let text = raw;
  // Supprimer <head>...</head> et son contenu (CSS, meta, etc.)
  text = text.replace(/<head[\s\S]*?<\/head>/gi, "");
  // Supprimer <style>...</style> et leur contenu (CSS brut)
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Supprimer <script>...</script>
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Supprimer les commentaires HTML <!-- ... -->
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  // Ajouter des sauts de ligne aux Ã©lÃ©ments de bloc avant de les supprimer
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(p|div|tr|li|h[1-6]|blockquote|section|article|header|footer)[^>]*>/gi, "\n");
  text = text.replace(/<\/td>/gi, " | ").replace(/<\/th>/gi, " | ");
  // Supprimer toutes les balises HTML restantes
  text = text.replace(/<[^>]+>/g, "");
  // DÃ©coder les entitÃ©s HTML
  const entities: Record<string,string> = {
    "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&apos;":"'",
    "&nbsp;":" ","&hellip;":"â¦","&mdash;":"â","&ndash;":"â","&laquo;":"Â«","&raquo;":"Â»",
    "&eacute;":"Ã©","&egrave;":"Ã¨","&ecirc;":"Ãª","&euml;":"Ã«",
    "&agrave;":"Ã ","&acirc;":"Ã¢","&auml;":"Ã¤",
    "&ocirc;":"Ã´","&ouml;":"Ã¶","&oslash;":"Ã¸",
    "&ugrave;":"Ã¹","&ucirc;":"Ã»","&uuml;":"Ã¼",
    "&iuml;":"Ã¯","&ccedil;":"Ã§","&copy;":"Â©","&reg;":"Â®","&trade;":"â¢",
  };
  Object.entries(entities).forEach(([e, c]) => {
    text = text.replace(new RegExp(e, "gi"), c);
  });
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // Nettoyer les espaces multiples et lignes vides excessives
  text = text.split("\n").map(l => l.replace(/[ \t]{2,}/g, " ").trim()).join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();
  if (text.length > 20000) text = text.slice(0, 20000) + "\n\n[â¦tronquÃ©]";
  return text;
}

// âââ Sanitize HTML pour affichage sÃ©curisÃ© en iframe âââââââââââââââââââââââââ
function sanitizeHtmlForDisplay(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")           // scripts
    // head conservÃ© â l'iframe est sandboxÃ©e, les styles sont nÃ©cessaires pour le rendu
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")        // event handlers inline
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, "")               // event handlers sans guillemets
    .replace(/javascript\s*:/gi, "void:")                  // js: dans href
    .replace(/<meta[^>]*http-equiv[^>]*>/gi, "")           // meta refresh
    .replace(/<link[^>]*rel\s*=\s*["']?stylesheet["']?[^>]*>/gi, "") // feuilles CSS externes
    .replace(/url\s*\(\s*["']?\s*data:/gi, "url(data:")   // garder les data: URLs inline
    .replace(/<iframe[^>]*src[^>]*>/gi, "")               // iframes externes
    .replace(/expression\s*\(/gi, "");                     // CSS expressions IE
}

// Alias pour compatibilitÃ© â retourne toujours du texte propre
function cleanEmailBody(raw: string): string { return stripHtml(raw); }

// âââ Rendu texte brut enrichi â URLs, emails, tÃ©l cliquables ââââââââââââââââ
function renderPlainText(text: string): React.ReactNode[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
  const emailRegex = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  const telRegex = /(\+?[\d][\d\s\-\.]{7,}[\d])/g;
  const lines = text.split("\n");
  return lines.map((line, li) => {
    // Remplacer URLs, emails, tels par des Ã©lÃ©ments React cliquables
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;
    const allMatches: {index:number, len:number, node:React.ReactNode}[] = [];
    let m: RegExpExecArray|null;
    const rx = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)|([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
    while ((m = rx.exec(line)) !== null) {
      if (m[1]) allMatches.push({index:m.index, len:m[1].length, node:<a key={key++} href={m[1]} target="_blank" rel="noopener noreferrer" style={{color:"#2563EB",textDecoration:"underline"}}>{m[1]}</a>});
      else if (m[2]) allMatches.push({index:m.index, len:m[2].length, node:<a key={key++} href={`mailto:${m[2]}`} style={{color:"#2563EB",textDecoration:"underline"}}>{m[2]}</a>});
    }
    if (allMatches.length === 0) {
      parts.push(<span key="t">{line}</span>);
    } else {
      let cursor = 0;
      allMatches.forEach(({index,len,node}) => {
        if (index > cursor) parts.push(<span key={key++}>{line.slice(cursor,index)}</span>);
        parts.push(node);
        cursor = index + len;
      });
      if (cursor < line.length) parts.push(<span key={key++}>{line.slice(cursor)}</span>);
    }
    return <React.Fragment key={li}>{parts}{li < lines.length-1 && "\n"}</React.Fragment>;
  });
}


const Spin = ({s=16}: {s?: number}) => (
  <div style={{width:s,height:s,borderRadius:"50%",border:`${Math.max(1.5,s*.1)}px solid rgba(184,146,79,0.2)`,borderTopColor:"#B8924F",animation:"spin .7s linear infinite",flexShrink:0}} />
);

const Avatar = ({name: nameProp, size=34}) => {
  const name = nameProp || "?";
  const i = name.split(" ").map(w=>w[0]).filter(Boolean).slice(0,2).join("").toUpperCase() || "?";
  const p = ["#C9A876","#6DB8A0","#6D9BE8","#B86D9B","#E86D6D"];
  const bg = p[name.charCodeAt(0)%p.length] || p[0];
  return <div style={{width:size,height:size,borderRadius:"50%",background:bg+"25",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.33,fontWeight:700,color:bg,flexShrink:0}}>{i}</div>;
};

// âââ GÃ©nÃ¨re les crÃ©neaux horaires ââââââââââââââââââââââââââââââââââââââââââââ
const TIME_SLOTS: string[] = [];
for(let h=0;h<24;h++) for(let m of [0,30]) TIME_SLOTS.push(String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"));

// âââ SÃ©lecteur d'heure (dropdown) ââââââââââââââââââââââââââââââââââââââââââââ
const TimePicker = ({value, onChange, placeholder="Heure", light=false}: {value:string, onChange:(v:string)=>void, placeholder?:string, light?:boolean}) => (
  <select
    value={value||""}
    onChange={e=>onChange(e.target.value)}
    style={{padding:"8px 10px",borderRadius:8,border:light?"1px solid #D1D5DB":"1px solid #EBEAE5",background:light?"#F9FAFB":"#FAFAF7",color:light?value?"#111111":"#9CA3AF":value?"#1A1A1E":"#A5A4A0",fontSize:13,width:"100%",cursor:"pointer",appearance:"auto"}}
  >
    <option value="">{placeholder}</option>
    {TIME_SLOTS.map(t=><option key={t} value={t}>{t}</option>)}
  </select>
);

// âââ Mini calendrier picker âââââââââââââââââââââââââââââââââââââââââââââââââââ
const JOURS_COURTS = ["L","M","M","J","V","S","D"];
const MOIS_COURTS = ["Jan","FÃ©v","Mar","Avr","Mai","Jun","Jul","AoÃ»","Sep","Oct","Nov","DÃ©c"];

const DatePicker = ({value, onChange, light=false}: {value:string, onChange:(v:string)=>void, light?:boolean}) => {
  const parseDate = (s:string) => { const d=new Date(s+"T12:00:00"); return isNaN(d.getTime())?null:d; };
  const sel = parseDate(value);
  const today = new Date();
  const initMonth = sel||new Date(today.getFullYear(), today.getMonth(), 1);
  const [nav, setNav] = React.useState(new Date(initMonth.getFullYear(), initMonth.getMonth(), 1));
  const [open, setOpen] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(()=>{
    const handler = (e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",handler);
    return ()=>document.removeEventListener("mousedown",handler);
  },[]);

  const firstDayOfMonth = (d:Date)=>{ const f=new Date(d.getFullYear(),d.getMonth(),1).getDay(); return f===0?6:f-1; };
  const daysInMonth = (d:Date)=>new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  const fmt = (d:Date)=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const fmtDisplay = (s:string)=>{ const d=parseDate(s); if(!d) return ""; return d.getDate()+" "+MOIS_COURTS[d.getMonth()]+" "+d.getFullYear(); };

  const bg = light?"#F9FAFB":"#FAFAF7";
  const border = light?"1px solid #D1D5DB":"1px solid #EBEAE5";
  const textMain = light?"#111111":"#1A1A1E";
  const textSub = light?"#9CA3AF":"#A5A4A0";

  return (
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      <button onClick={()=>setOpen(v=>!v)} type="button" style={{width:"100%",padding:"8px 12px",borderRadius:8,border,background:bg,color:value?textMain:textSub,fontSize:13,textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:14}}>ð</span>
        <span style={{flex:1}}>{value?fmtDisplay(value):"Choisir une date"}</span>
        {value&&<span onClick={e=>{e.stopPropagation();onChange("");}} style={{fontSize:14,opacity:.4,lineHeight:1}}>Ã</span>}
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:1000,background:"#FFFFFF",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,.18)",border:"1px solid #E5E7EB",width:260,padding:"12px"}}>
          {/* Nav mois */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <button onClick={()=>setNav(new Date(nav.getFullYear(),nav.getMonth()-1,1))} style={{width:26,height:26,borderRadius:6,border:"1px solid #E5E7EB",background:"transparent",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#374151"}}>â¹</button>
            <span style={{fontSize:13,fontWeight:600,color:"#111111"}}>{MOIS_COURTS[nav.getMonth()]} {nav.getFullYear()}</span>
            <button onClick={()=>setNav(new Date(nav.getFullYear(),nav.getMonth()+1,1))} style={{width:26,height:26,borderRadius:6,border:"1px solid #E5E7EB",background:"transparent",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#374151"}}>âº</button>
          </div>
          {/* Jours de la semaine */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
            {JOURS_COURTS.map((j,i)=><div key={i} style={{textAlign:"center",fontSize:10,fontWeight:600,color:"#9CA3AF",padding:"2px 0"}}>{j}</div>)}
          </div>
          {/* Grille des jours */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {Array.from({length:firstDayOfMonth(nav)}).map((_,i)=><div key={"e"+i}/>)}
            {Array.from({length:daysInMonth(nav)}).map((_,i)=>{
              const day=i+1;
              const ds=nav.getFullYear()+"-"+String(nav.getMonth()+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
              const isSel=ds===value;
              const isTd=ds===fmt(today);
              return (
                <button key={day} onClick={()=>{onChange(ds);setOpen(false);}} style={{width:"100%",aspectRatio:"1",borderRadius:6,border:"none",background:isSel?"#C9A876":isTd?"rgba(201,168,118,0.15)":"transparent",color:isSel?"#0F0F0F":isTd?"#C9A876":"#374151",fontSize:12,fontWeight:isSel||isTd?700:400,cursor:"pointer"}}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// SVG icons for mail sub-categories â CÃ©leste theme
const MailCatIcon = ({id, active}: {id:string, active:boolean}) => {
  const c = active ? "#1A1A1E" : "#6B6E7E";
  const icons: Record<string,JSX.Element> = {
    nonlus:   <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3" fill={active?"#B8924F":"#6B6E7E"}/><circle cx="7" cy="7" r="5.5" stroke={c} strokeWidth="1"/></svg>,
    atraiter: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke={c} strokeWidth="1"/><path d="M4.5 7l2 2 3-3" stroke={active?"#B8924F":c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    star:     <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l1.5 3 3.3.5-2.4 2.3.6 3.3L7 9l-3 1.6.6-3.3-2.4-2.3 3.3-.5L7 1.5z" stroke="#B8924F" strokeWidth="1" fill={active?"#B8924F":"none"}/></svg>,
    flag:     <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3.5 1.5v11M3.5 2.5h7L8 6l2.5 3.5H3.5" stroke={c} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill={active?"rgba(184,146,79,0.2)":"none"}/></svg>,
  };
  return icons[id] || <span style={{fontSize:11}}>{id[0]}</span>;
};

const MAIL_CATS = [
  {id:"nonlus",   label:"Non lus"},
  {id:"atraiter", label:"Ã traiter"},
  {id:"star",     label:"Favoris"},
  {id:"flag",     label:"FlaggÃ©s"},
];

export default function App() {
  const { data: session, status } = useSession()
  const router = useRouter()
  useEffect(() => { if (status === "unauthenticated") router.replace("/") }, [status, router])
  const [view, setView] = useState("general");
  const [emails, setEmails] = useState([]);
  // Fix #4 â Pagination : savoir s'il y a plus d'emails Ã  charger
  const [emailsTotal, setEmailsTotal] = useState(0);
  const [emailsLimit, setEmailsLimit] = useState(100);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resas, setResas] = useState<any[]>([]);
  const [sel, setSel] = useState(null);
  // Origine du mail ouvert â pour le fil d'Ariane "â Retour Ã  l'Ã©vÃ©nement" ou "â Retour au Radar"
  const [mailOrigine, setMailOrigine] = useState<{type:'evenement'|'radar',resaId:string,nom:string}|null>(null);

  // Ouvrir un mail depuis une fiche Ã©vÃ©nement
  // handleSel fait setMailOrigine(null) en dÃ©but â on le reset aprÃ¨s
  const ouvrirMailDepuisEvenement = (email: any, resa: any) => {
    setView("mails");
    setMailFilter("all");
    setTagFilter(null);
    setSearch("");
    setShowArchived(false);
    // handleSel marque comme lu + charge le corps complet + restaure le cache
    handleSel(email);
    // setMailOrigine aprÃ¨s handleSel car handleSel le remet Ã  null
    setTimeout(() => {
      setMailOrigine({type:'evenement', resaId: resa.id, nom: resa.nom || resa.entreprise || "l'Ã©vÃ©nement"});
    }, 0);
  };
  const [reply, setReply] = useState("");
  const [genReply, setGenReply] = useState(false);
  const [extracted, setExtracted] = useState<any>(null);
  // Cache des rÃ©ponses par email ID â Ã©vite les regÃ©nÃ©rations inutiles
  const [repliesCache, setRepliesCache] = useState<Record<string,{reply:string,editReply:string,extracted:any|null,dateGen?:string}>>({});
  const [drafted, setDrafted] = useState(new Set());
  const [undoDelete, setUndoDelete] = useState<{email:any,timer:any}|null>(null);
  // RÃ©ponses envoyÃ©es â indexÃ©es par emailId, persistÃ©es en Supabase
  const [sentReplies, setSentReplies] = useState<Record<string,{text:string,date:string,subject:string,toEmail:string}>>({});
  const [editing, setEditing] = useState(false);
  const [editReply, setEditReply] = useState("");

  // âââ Ãditeur de rÃ©ponse manuelle (distinct de l'IA) âââââââââââââââââââââââââ
  const [showReplyEditor, setShowReplyEditor] = useState(false);
  const [replyEditorText, setReplyEditorText] = useState("");
  const [replyEditorMode, setReplyEditorMode] = useState<"reply"|"replyAll"|"forward">("reply");
  const [replyEditorTo, setReplyEditorTo] = useState("");
  const [sending, setSending] = useState(false);

  // âââ Composer nouveau mail ââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);

  // âââ Brouillons persistÃ©s âââââââââââââââââââââââââââââââââââââââââââââââââââââ
  type DraftItem = {id:string, to:string, subject:string, body:string, date:string, emailId?:string};
  const [localDrafts, setLocalDrafts] = useState<DraftItem[]>([]);
  const [notif, setNotif] = useState<{msg:string,type:string}|null>(null);
  const notifTimer = useRef<any>(null);
  const toast = (msg: string, type = "ok") => {
    if (notifTimer.current) clearTimeout(notifTimer.current);
    setNotif({ msg, type });
    notifTimer.current = setTimeout(() => setNotif(null), type === "undo" ? 4500 : 3000);
  };
  useEffect(() => () => { if (notifTimer.current) clearTimeout(notifTimer.current); }, []);

  // Suppression mail au clavier (Delete ou Backspace) quand un mail est sÃ©lectionnÃ©
  // âââ Badge non lus dans le titre de l'onglet ââââââââââââââââââââââââââââââââ
  useEffect(() => {
    const unreadCount = emails.filter(m => m.unread && !m.archived).length;
    document.title = unreadCount > 0 ? `(${unreadCount}) ARCHANGE` : "ARCHANGE";
  }, [emails]);

  // âââ Ãtats tri, archivage, sÃ©lection multiple, snooze âââââââââââââââââââââââ
  const [sortOrder, setSortOrder] = useState<"date_desc"|"date_asc"|"from"|"subject">("date_desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  // Ref pour accÃ©der Ã  la liste filtrÃ©e depuis les event handlers sans TDZ
  // (filtered est dÃ©clarÃ© plus bas via useMemo â on ne peut pas le mettre directement dans les deps)
  const filteredRef = useRef<any[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;

      // "/" â focus recherche
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Rechercher..."]')?.focus();
        return;
      }
      // "?" â aide raccourcis
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowKeyHelp(v => !v);
        return;
      }

      if (!sel) return;

      // J / K â email suivant/prÃ©cÃ©dent
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        const idx = filteredRef.current.findIndex(m => m.id === sel.id);
        if (idx < filteredRef.current.length - 1) handleSel(filteredRef.current[idx + 1]);
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        const idx = filteredRef.current.findIndex(m => m.id === sel.id);
        if (idx > 0) handleSel(filteredRef.current[idx - 1]);
        return;
      }
      // E â archiver
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        archiveEmail(sel.id);
        return;
      }
      // U â toggle non lu
      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        toggleUnread(sel.id);
        return;
      }
      // S â toggle Ã©toile
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        toggleFlag(sel.id, "star");
        return;
      }
      // R â rÃ©pondre
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        openReplyEditor("reply");
        return;
      }
      // F â transfÃ©rer (forward)
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        openReplyEditor("forward");
        return;
      }
      // # â supprimer
      if (e.key === "#") {
        e.preventDefault();
        deleteEmailWithUndo(sel);
        return;
      }
      // Delete / Backspace â supprimer
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteEmailWithUndo(sel);
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [sel, emails]);
  const [loadingMail, setLoadingMail] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [analysingProgress, setAnalysingProgress] = useState("");

  // âââ Synchronisation complÃ¨te Gmail âââââââââââââââââââââââââââââââââââââââââ
  const [syncStatus, setSyncStatus] = useState<'idle'|'running'|'done'|'error'>('idle');
  const [syncProgress, setSyncProgress] = useState({synced: 0, total: 0, pageToken: null as string|null});
  const [syncLastDate, setSyncLastDate] = useState<string|null>(null);
  const [deepSearching, setDeepSearching] = useState(false);
  const [deepResults, setDeepResults] = useState<any[]>([]);
  const syncRunning = useRef(false);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<Record<string,string>>({}); // P4: file hors-ligne
  // âââ Notifications de troncature : par emailId, liste des Ã©lÃ©ments dÃ©passÃ©s â
  type TruncationInfo = { label: string; actuel: number; limite: number };
  const [truncations, setTruncations] = useState<Record<string, TruncationInfo[]>>({});
  // âââ Stats API tokens (mises Ã  jour Ã  chaque appel callClaude) ââââââââââââ
  const [apiStatsView, setApiStatsView] = useState({ totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUSD: 0 });
  const [apiStatsOpen, setApiStatsOpen] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => {
      setApiStatsView({
        totalCalls: apiUsageStats.totalCalls,
        totalInputTokens: apiUsageStats.totalInputTokens,
        totalOutputTokens: apiUsageStats.totalOutputTokens,
        totalCostUSD: apiUsageStats.totalCostUSD,
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  // alerteUrgente supprimÃ©
  const saveTimer = useRef<any>(null);
  // âââ Ãtats Radar ARCHANGE âââââââââââââââââââââââââââââââââââââââââââââââââââ
  const [radarHoverId, setRadarHoverId] = useState<string|null>(null);
  const [radarResaModal, setRadarResaModal] = useState<any>(null);
  const [radarReplyModal, setRadarReplyModal] = useState<any>(null);
  const [radarReplyLoading, setRadarReplyLoading] = useState(false);
  const [radarReplyText, setRadarReplyText] = useState("");
  const [radarTraites, setRadarTraites] = useState<Set<string>>(new Set());
  const [calDate, setCalDate] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  // âââ Ãtat onglet unifiÃ© pour la fiche Ã©vÃ©nement (4 onglets : infos, mails, noteIA, relances) âââ
  const [resaOnglet, setResaOnglet] = useState<'infos'|'mails'|'noteIA'|'relances'>('infos');
  const [links, setLinks] = useState({website:"",instagram:"",facebook:"",other:""});
  const [linksFetched, setLinksFetched] = useState({});
  const [fetchingLink, setFetchingLink] = useState(null);
  const [customCtx, setCustomCtx] = useState("");
  // âââ Infos Ã©tablissement â remplacent les valeurs codÃ©es en dur ââââââââââââââ
  const [nomEtab, setNomEtab] = useState("RÃVA");
  const [adresseEtab, setAdresseEtab] = useState("133 avenue de France, 75013 Paris");
  const [emailEtab, setEmailEtab] = useState("contact@brasserie-reva.fr");
  const [telEtab, setTelEtab] = useState("");
  const [espacesDyn, setEspacesDyn] = useState<EspaceDyn[]>(DEFAULT_ESPACES_DYN);
  // Alias pour rÃ©trocompatibilitÃ© â toutes les ref ESPACES utilisent maintenant espacesDyn
  const ESPACES = espacesDyn;
  const [editingCtx, setEditingCtx] = useState(false);
  const [mailFilter, setMailFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Planning form dans mail
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState<any>({});
  const [planErrors, setPlanErrors] = useState<Record<string,string>>({});
  const [planFormAI, setPlanFormAI] = useState<Record<string,boolean>>({});
  // Suggestions de modifications de fiche Ã©vÃ©nement par l'IA
  type SuggestionModif = {
    champ: string;
    label: string;
    ancienne: any;
    nouvelle: any;
    raison: string;
    selectionnee: boolean;
  };
  type PendingSuggestions = {
    resaId: string;
    emailId: string;
    suggestions: SuggestionModif[];
  };
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestions|null>(null);

  // GÃ©nÃ©ral view state
  const [statuts, setStatuts] = useState<StatutDef[]>(DEFAULT_STATUTS);
  const [showCreateStatut, setShowCreateStatut] = useState(false);
  const [newStatutLabel, setNewStatutLabel] = useState("");
  const [newStatutColor, setNewStatutColor] = useState("#6366f1");
  const [generalFilter, setGeneralFilter] = useState("all");
  const [searchEvt, setSearchEvt] = useState("");
  const [selResaGeneral, setSelResaGeneral] = useState<any>(null);
  const [eventsGroupBy, setEventsGroupBy] = useState<"urgency"|"status">("urgency");
  // UI collapse state
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [subCollapsed, setSubCollapsed] = useState(false);
  // Relances
  const [relances, setRelances] = useState<any[]>([]);
  // Tags personnalisÃ©s â persistÃ©s en Supabase
  type CustomTag = { id: string; label: string; color: string };
  const TAG_PALETTE = ["#EF4444","#F97316","#EAB308","#22C55E","#3B82F6","#8B5CF6","#EC4899","#14B8A6","#6B7280","#B8924F"];
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [emailTags, setEmailTags] = useState<Record<string,string[]>>({}); // emailId â tagIds
  const [showTagMenu, setShowTagMenu] = useState<string|null>(null); // emailId ou null
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_PALETTE[0]);
  const [tagFilter, setTagFilter] = useState<string|null>(null); // tagId filtrÃ© ou null
  const saveCustomTags = (t: CustomTag[]) => { setCustomTags(t); saveToSupabase({custom_tags:JSON.stringify(t)}); };
  const saveEmailTags = (t: Record<string,string[]>) => { setEmailTags(t); saveToSupabase({email_tags:JSON.stringify(t)}); };

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  //  SOURCES ARCHANGE v2 â 5 nouvelles structures (restructuration complÃ¨te)
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  // Types
  type ReglesCommerciales = {
    parNombrePersonnes: { petits: string; moyens: string; grands: string; xl: string };
    parBudgetParPers: { economique: string; standard: string; premium: string };
    parBudgetTotal: { petit: string; moyen: string; important: string; tresImportant: string };
    parProfilClient: { entreprises: string; particuliers: string; institutionnels: string; agences: string };
    parMoment: { dejeuner: string; soir: string; cocktailTardif: string };
    parEspace: Record<string, string>; // keyed by espaceId
  };
  type FormuleValide = { id: string; contexte: string; formule: string };
  type TonStyle = {
    formulesValides: FormuleValide[];
    formulesInterdites: string[];
    formalite: { particuliers: number; entreprises: number; institutionnels: number; agences: number };
  };
  type ApprentissageRegle = { id: string; texte: string; categorie: string; occurrences: number; active: boolean; dateCreation: string };
  type ApprentissageExemple = { id: string; emailSubject: string; emailBody: string; reponseValidee: string; typeEvenement: string; nombrePersonnes: number | null; dateAjout: string };
  type ApprentissageSuggestion = { id: string; regleProposee: string; exemples: string[]; dateDetection: string };
  type Apprentissages = {
    reglesApprises: ApprentissageRegle[];
    exemplesReference: ApprentissageExemple[];
    suggestionsEnAttente: ApprentissageSuggestion[];
  };
  type CasParticulier = {
    id: string;
    nom: string;
    emailPattern: string;
    nomPattern: string;
    matchingMode: "auto" | "manuel";
    contexte: string;
    regles: string;
  };

  // Valeurs par dÃ©faut
  const DEFAULT_REGLES_COMMERCIALES: ReglesCommerciales = {
    parNombrePersonnes: { petits: "", moyens: "", grands: "", xl: "" },
    parBudgetParPers: { economique: "", standard: "", premium: "" },
    parBudgetTotal: { petit: "", moyen: "", important: "", tresImportant: "" },
    parProfilClient: { entreprises: "", particuliers: "", institutionnels: "", agences: "" },
    parMoment: { dejeuner: "", soir: "", cocktailTardif: "" },
    parEspace: {},
  };
  const DEFAULT_TON_STYLE: TonStyle = {
    formulesValides: [],
    formulesInterdites: [],
    formalite: { particuliers: 0.3, entreprises: 0.7, institutionnels: 0.9, agences: 0.6 },
  };
  const DEFAULT_APPRENTISSAGES: Apprentissages = {
    reglesApprises: [],
    exemplesReference: [],
    suggestionsEnAttente: [],
  };

  // States
  const [reglesCommerciales, setReglesCommerciales] = useState<ReglesCommerciales>(DEFAULT_REGLES_COMMERCIALES);
  const [tonStyle, setTonStyle] = useState<TonStyle>(DEFAULT_TON_STYLE);
  const [apprentissages, setApprentissages] = useState<Apprentissages>(DEFAULT_APPRENTISSAGES);
  const [casParticuliers, setCasParticuliers] = useState<CasParticulier[]>([]);
  const [reglesAbsolues, setReglesAbsolues] = useState<string>("");
  // Filtre d'affichage pour les tags de section Sources ARCHANGE
  const [sourcesFilter, setSourcesFilter] = useState<string>("all"); // "all" | "infos" | "regles_com" | "ton" | "appr" | "cas_part" | "absolues"
  // UI : quel accordÃ©on ouvert dans chaque sous-section de rÃ¨gles commerciales
  const [openReglesComTab, setOpenReglesComTab] = useState<string>(""); // "" = aucun, sinon "dim_X_tab_Y"
  // ââ Modale "Tester ARCHANGE" â analyse Ã  la volÃ©e d'un mail test ââââââââââ
  const [showTestArchange, setShowTestArchange] = useState<boolean>(false);
  const [testMailContent, setTestMailContent] = useState<string>("");
  const [testMailSubject, setTestMailSubject] = useState<string>("");
  const [testMailFrom, setTestMailFrom] = useState<string>("");
  const [testRunning, setTestRunning] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  // ââ Stats : pÃ©riode + focus pour la sidebar ââââââââââââââââââââââââââââââ
  const [statsPeriode, setStatsPeriode] = useState<string>("mois"); // "semaine" | "mois" | "trimestre" | "annee" | "tout"
  const [statsFocus, setStatsFocus] = useState<string>("ensemble"); // "ensemble" | "perf_ia" | "espaces" | "types" | "profils"

  // Save helpers (debounce 1s pour Ã©viter spam)
  const saveReglesCommerciales = (rc: ReglesCommerciales) => {
    setReglesCommerciales(rc);
    saveToSupabase({ regles_commerciales: JSON.stringify(rc) });
  };
  const saveTonStyle = (ts: TonStyle) => {
    setTonStyle(ts);
    saveToSupabase({ ton_style: JSON.stringify(ts) });
  };
  const saveApprentissages = (a: Apprentissages) => {
    setApprentissages(a);
    saveToSupabase({ apprentissages: JSON.stringify(a) });
  };
  const saveCasParticuliers = (cp: CasParticulier[]) => {
    setCasParticuliers(cp);
    saveToSupabase({ cas_particuliers: JSON.stringify(cp) });
  };
  const saveReglesAbsolues = (ra: string) => {
    setReglesAbsolues(ra);
    saveToSupabase({ regles_absolues: ra });
  };

  // Liens email â Ã©vÃ©nement â persistÃ©s en Supabase
  // Structure : { [emailId]: resaId }
  const [emailResaLinks, setEmailResaLinks] = useState<Record<string,string>>({});
  const [showRelanceForm, setShowRelanceForm] = useState<string|null>(null); // resaId
  const [relanceDate, setRelanceDate] = useState("");
  const [relanceHeure, setRelanceHeure] = useState("");
  const [relanceNote, setRelanceNote] = useState("");
  const [generalSubFilter, setGeneralSubFilter] = useState<"statuts"|"arelancer">("statuts");
  // Modal relance IA
  const [showRelanceIA, setShowRelanceIA] = useState<any>(null); // resa
  const [showKeyHelp, setShowKeyHelp] = useState(false);
  const [relanceIAText, setRelanceIAText] = useState("");
  const [genRelanceIA, setGenRelanceIA] = useState(false);
  // Motifs de relance â personnalisables, persistÃ©s en Supabase
  const DEFAULT_MOTIFS_RELANCE = [
    "Devis envoyÃ© sans rÃ©ponse",
    "Confirmation de rÃ©servation attendue",
    "Acompte non reÃ§u",
    "Informations manquantes (date, nb personnes, menu...)",
    "Prise de contact suite Ã  visite",
    "Relance Ã  J-30 avant l'Ã©vÃ©nement",
    "Relance Ã  J-7 avant l'Ã©vÃ©nement",
    "Autre",
  ];
  const [motifsRelance, setMotifsRelance] = useState<string[]>(DEFAULT_MOTIFS_RELANCE);
  const [motifSelectionne, setMotifSelectionne] = useState<string>("");
  const [motifPersonnalise, setMotifPersonnalise] = useState<string>("");
  const [showAddMotif, setShowAddMotif] = useState(false);
  const [newMotifLabel, setNewMotifLabel] = useState("");
  // Modal envoyer mail
  const [showSendMail, setShowSendMail] = useState<any>(null); // resa
  const [sendMailSubject, setSendMailSubject] = useState("");
  const [sendMailBody, setSendMailBody] = useState("");
  // Drag statuts
  const [dragStatutIdx, setDragStatutIdx] = useState<number|null>(null);
  // Note IA par Ã©vÃ©nement
  const [noteIA, setNoteIA] = useState<Record<string,{text:string,date:string}>>({});
  const [genNoteIA, setGenNoteIA] = useState<string|null>(null); // resaId en cours
  const [editResaPanel, setEditResaPanel] = useState<any>(null);
  // Planning view mode
  const [calView, setCalView] = useState<"mois"|"semaine"|"jour">("mois");
  const [planFilter, setPlanFilter] = useState("all"); // filtre Planning legacy (rÃ©trocompat)
  const [planEspaceFilter, setPlanEspaceFilter] = useState("all"); // filtre espace Planning v3
  const [filtresStatutsEvents, setFiltresStatutsEvents] = useState<string[]>([]); // Point 2 â multi-select ÃvÃ©nements
  const [filtresStatutsPlanning, setFiltresStatutsPlanning] = useState<string[]>([]); // Point 2 â multi-select Planning
  const [calWeekStart, setCalWeekStart] = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)); d.setHours(0,0,0,0); return d; });
  // Sources IA sections open/collapsed state
  const [srcSections, setSrcSections] = useState({liens:false, menus:true, conditions:false, espaces:false, ton:false});
  // Nouvelles sections Sources IA â texte structurÃ© persistÃ© en Supabase
  const [menusCtx, setMenusCtx] = useState("");
  const [conditionsCtx, setConditionsCtx] = useState("");
  const [espacesCtx, setEspacesCtx] = useState("");
  const [tonCtx, setTonCtx] = useState("");
  // Ãdition en cours pour chaque section
  const [editingSrc, setEditingSrc] = useState<Record<string,boolean>>({});
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState<any>({...EMPTY_RESA, espaceId: DEFAULT_ESPACES_DYN[0]?.id || ""});
  const [newEventErrors, setNewEventErrors] = useState<any>({});
  const [initializing, setInitializing] = useState(true);

  const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  const firstDay = (d: Date) => { const f = new Date(d.getFullYear(),d.getMonth(),1).getDay(); return f===0?6:f-1; };

  // Ref pour tracker l'email en cours de gÃ©nÃ©ration IA (Ã©vite les race conditions)
  const genReplyForEmailId = React.useRef<string|null>(null);
  // Fix C2 â SÃ©maphore pour Ã©viter deux analyses simultanÃ©es
  const analysingRef = React.useRef(false);
  // Ref pour pointer toujours vers la version courante de loadEmailsFromApi
  // Ãvite le bug de closure stale dans le setInterval du polling
  const loadEmailsFromApiRef = React.useRef<(withSync?: boolean) => Promise<void>>(async () => {});

  // âââ PrioritÃ©s ARCHANGE â calcul JS pur, zÃ©ro appel API âââââââââââââââââ
  // âââ getStatut â accessible partout dans le composant (Planning, ÃvÃ©nements, modal) ââ
  const getStatut = React.useCallback((r: any) =>
    statuts.find(s => s.id === (r?.statut || "nouveau")) || { bg:"#F3F4F6", color:"#6B7280", label:"â" },
    [statuts]
  );

  const prioritesArchange = React.useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);

    // Construire les cartes uniquement Ã  partir des emails avec isReservation dÃ©tectÃ©e
    const cartes = emails.flatMap(m => {
      const cache = repliesCache[m.id];
      const ext = cache?.extracted;
      if (!ext?.isReservation) return [];

      // Ignorer si marquÃ© traitÃ© manuellement
      if (radarTraites.has(m.id)) return [];

      // Trouver la rÃ©servation liÃ©e
      const resaId = emailResaLinks[m.id];
      const resa = resas.find(r => r.id === resaId) ||
        resas.find(r => r.email && m.fromEmail && r.email.toLowerCase() === m.fromEmail.toLowerCase());

      // Ignorer si rÃ©servation confirmÃ©e ou annulÃ©e
      if (resa && (resa.statut === "confirme" || resa.statut === "annule")) return [];

      // Ignorer si date passÃ©e
      const dateStr = ext.dateDebut || resa?.dateDebut;
      if (dateStr) {
        const d = new Date(dateStr + "T12:00:00");
        if (d < today) return [];
      }

      // Calculer le score de prioritÃ©
      let priorite = 4; // neutre par dÃ©faut
      let type: "rouge"|"or"|"neutre" = "neutre";

      // PrioritÃ© 1 â Ã©vÃ©nement dans -7 jours
      if (dateStr) {
        const d = new Date(dateStr + "T12:00:00");
        if (d >= today && d <= in7) { priorite = 1; type = "rouge"; }
      }

      // PrioritÃ© 2 â relance sans rÃ©ponse +3 jours (email flaggÃ© ou aTraiter depuis longtemps)
      if (priorite > 2 && (m.flags||[]).includes("flag")) {
        // VÃ©rifier si la date de l'email est ancienne (+3j)
        const emailDateMs = m.rawDate || 0;
        if (emailDateMs && (Date.now() - emailDateMs) > 3 * 86400000) {
          priorite = 2; type = "rouge";
        }
      }

      // PrioritÃ© 3 â budget + date prÃ©cis
      const budget = ext.budget || resa?.budget;
      if (priorite > 3 && budget && dateStr) { priorite = 3; type = "or"; }

      // PrioritÃ© 4 â nouvelle demande sans date/budget
      if (priorite > 4) { priorite = 4; type = "neutre"; }

      return [{ m, ext, resa, priorite, type, dateStr, budget }];
    });

    // Trier : 1 urgent rouge > 2 relance rouge > 3 or > 4 neutre, puis par date
    return cartes.sort((a, b) => {
      if (a.priorite !== b.priorite) return a.priorite - b.priorite;
      if (a.dateStr && b.dateStr) return a.dateStr.localeCompare(b.dateStr);
      return 0;
    });
  }, [emails, repliesCache, radarTraites, emailResaLinks, resas]);
  const getLinkedEmails = React.useCallback((resa: any) => {
    if (!resa) return [];
    const resaEmailLower = (resa.email || "").toLowerCase();
    return emails.filter(m => {
      // 1. Lien explicite dÃ©fini par l'utilisateur ou l'IA
      if (emailResaLinks[m.id] === resa.id) return true;
      // 2. Match direct fromEmail = resa.email (cas client direct)
      if (resa.email && m.fromEmail && m.fromEmail.toLowerCase() === resaEmailLower) return true;
      // 3. CRITIQUE : match via extracted.email (cas plateforme â vrai client extrait du corps)
      if (resaEmailLower) {
        const extractedEmail = repliesCache[m.id]?.extracted?.email;
        if (extractedEmail && extractedEmail.toLowerCase() === resaEmailLower) return true;
      }
      // 4. Fallback nom (heuristique faible â last resort)
      if (resa.nom && m.from) {
        const firstWord = resa.nom.toLowerCase().split(" ")[0];
        if (firstWord.length > 2 && m.from.toLowerCase().includes(firstWord)) return true;
      }
      return false;
    });
  }, [emails, emailResaLinks, repliesCache]);

  // Sauvegarde Supabase â debounce par clÃ© pour Ã©viter les Ã©crasements
  const _saveTimers = React.useRef<Record<string,any>>({});
  // Cleanup timers Ã  l'unmount pour Ã©viter les appels rÃ©seau aprÃ¨s dÃ©montage
  useEffect(() => () => { Object.values(_saveTimers.current).forEach(clearTimeout); }, []);
  const saveToSupabase = (data: Record<string, string>) => {
    Object.entries(data).forEach(([key, value]) => {
      if (_saveTimers.current[key]) clearTimeout(_saveTimers.current[key]);
      _saveTimers.current[key] = setTimeout(async () => {
        const doSave = async () => {
          try {
            const res = await apiFetch("/api/user-data", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ [key]: value }),
            });
            if (res.ok) {
              // Retirer de la queue offline si prÃ©sent
              setOfflineQueue(q => { const n = {...q}; delete n[key]; return n; });
              setSaveIndicator(true);
              if (saveTimer.current) clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(() => setSaveIndicator(false), 2000);
            } else {
              console.error("Supabase save error:", key, res.status);
              setOfflineQueue(q => ({ ...q, [key]: value }));
            }
          } catch {
            // Hors ligne â mettre en file d'attente
            setOfflineQueue(q => ({ ...q, [key]: value }));
          }
        };
        doSave();
      }, 1000);
    });
  };

  const saveSentReplies = (r: Record<string,any>) => { setSentReplies(r); saveToSupabase({ sent_replies: JSON.stringify(r) }); };
  const saveNoteIA = (n: Record<string,{text:string,date:string}>) => { setNoteIA(n); saveToSupabase({note_ia:JSON.stringify(n)}); };
  const saveStatuts = (s: StatutDef[]) => { setStatuts(s); saveToSupabase({statuts:JSON.stringify(s)}); };
  const saveResas = (r: any[]) => { setResas(r); saveToSupabase({resas:JSON.stringify(r)}); };
  const saveRelances = (r: any[]) => { setRelances(r); saveToSupabase({relances:JSON.stringify(r)}); };
  const saveEmailResaLinks = (links: Record<string,string>) => {
    setEmailResaLinks(links);
    saveToSupabase({ email_resa_links: JSON.stringify(links) });
  };
  const saveMotifsRelance = (m: string[]) => {
    setMotifsRelance(m);
    saveToSupabase({ motifs_relance: JSON.stringify(m) });
  };
  // Sauvegarder uniquement les extractions IA (JSON lÃ©ger) dans Supabase
  const saveExtractions = (cache: Record<string,any>) => {
    saveToSupabase({ extractions: JSON.stringify(cache) });
  };
  // P3 â Sauvegarder radarTraites en Supabase
  const saveRadarTraites = (set: Set<string>) => {
    setRadarTraites(set);
    saveToSupabase({ radar_traites: JSON.stringify([...set]) });
  };
  // On sÃ©rialise toutes les sections dans un JSON pour Ã©viter les colonnes inconnues
  const saveSourcesIA = (menus: string, conditions: string, espaces: string, ton: string, custom: string, nom?: string, adresse?: string, emailEt?: string, tel?: string, esps?: EspaceDyn[]) => {
    const payload = JSON.stringify({
      menus, conditions, espaces, ton, custom,
      nomEtab: nom ?? nomEtab,
      adresseEtab: adresse ?? adresseEtab,
      emailEtab: emailEt ?? emailEtab,
      telEtab: tel ?? telEtab,
      espacesDyn: esps ?? espacesDyn,
    });
    saveToSupabase({ context: payload });
  };
  const saveMenusCtx = (v: string) => { setMenusCtx(v); saveSourcesIA(v, conditionsCtx, espacesCtx, tonCtx, customCtx); };
  const saveConditionsCtx = (v: string) => { setConditionsCtx(v); saveSourcesIA(menusCtx, v, espacesCtx, tonCtx, customCtx); };
  const saveEspacesCtx = (v: string) => { setEspacesCtx(v); saveSourcesIA(menusCtx, conditionsCtx, v, tonCtx, customCtx); };
  const saveTonCtx = (v: string) => { setTonCtx(v); saveSourcesIA(menusCtx, conditionsCtx, espacesCtx, v, customCtx); };
  const saveNomEtab = (v: string) => { setNomEtab(v); saveSourcesIA(menusCtx, conditionsCtx, espacesCtx, tonCtx, customCtx, v, adresseEtab, emailEtab, telEtab, espacesDyn); };
  const saveAdresseEtab = (v: string) => { setAdresseEtab(v); saveSourcesIA(menusCtx, conditionsCtx, espacesCtx, tonCtx, customCtx, nomEtab, v, emailEtab, telEtab, espacesDyn); };
  const saveEmailEtab = (v: string) => { setEmailEtab(v); saveSourcesIA(menusCtx, conditionsCtx, espacesCtx, tonCtx, customCtx, nomEtab, adresseEtab, v, telEtab, espacesDyn); };
  const saveTelEtab = (v: string) => { setTelEtab(v); saveSourcesIA(menusCtx, conditionsCtx, espacesCtx, tonCtx, customCtx, nomEtab, adresseEtab, emailEtab, v, espacesDyn); };
  const saveEspacesDyn = (esps: EspaceDyn[]) => { setEspacesDyn(esps); saveSourcesIA(menusCtx, conditionsCtx, espacesCtx, tonCtx, customCtx, nomEtab, adresseEtab, emailEtab, telEtab, esps); };
  const saveLinks = async (l: any) => { setLinks(l); saveToSupabase({links:JSON.stringify(l)}); };
  // Sauvegarde immÃ©diate des mÃ©tadonnÃ©es email â sans debounce
  // UtilisÃ© pour lu/non lu, flags, aTraiter â doit Ãªtre instantanÃ©
  const saveEmailMetaImmediat = async (meta: Record<string,any>) => {
    const json = JSON.stringify(meta);
    // localStorage en premier â synchrone, immÃ©diat
    try { localStorage.setItem("arc_email_meta", json); } catch {}
    // Supabase sans debounce â fire and forget
    try {
      apiFetch("/api/user-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_meta: json }),
      }).then(r => { if (!r.ok) console.error("email_meta save error", r.status); });
    } catch {}
  };

  const saveEmails = (e: any[]) => {
    setEmails(e);
    const meta: Record<string,{flags:string[],aTraiter:boolean,unread:boolean}> = {};
    e.forEach(m => { meta[m.id] = { flags: m.flags||[], aTraiter: !!m.aTraiter, unread: !!m.unread }; });
    saveEmailMetaImmediat(meta);
  };

  // Fonction partagÃ©e de mapping email API â Ã©tat React
  // âââ Formate date_iso en heure locale (comme Gmail) âââââââââââââââââââââââââ
  const fmtEmailDate = (isoStr: string): string => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "";
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart.getTime() - 86400000);
      const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
      if (d >= todayStart) {
        // Aujourd'hui â heure locale HH:MM
        return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      } else if (d >= yesterdayStart) {
        return "Hier";
      } else if (d >= weekStart) {
        // Cette semaine â nom du jour
        return d.toLocaleDateString("fr-FR", { weekday: "long" });
      } else {
        // Plus ancien â JJ/MM/AAAA
        return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
      }
    } catch { return ""; }
  };

  const mapEmail = (m: any) => {
    // Champs emails_cache (body_html/body_text) + rÃ©trocompat ancienne table (body)
    const rawBodyHtml = m.body_html || null;
    const rawBodyText = m.body_text || m.body || "";
    const rawSnippet  = m.snippet || "";

    // bodyHtml : prioritÃ© au HTML de emails_cache (dÃ©jÃ  stockÃ© proprement)
    // Si absent, dÃ©tecter si body est du HTML
    let bodyHtml: string | null = null;
    if (rawBodyHtml) {
      bodyHtml = sanitizeHtmlForDisplay(rawBodyHtml);
    } else if (rawBodyText.trim().startsWith("<") || /<(html|head|body|div|table)\b/i.test(rawBodyText.slice(0, 500))) {
      bodyHtml = sanitizeHtmlForDisplay(rawBodyText);
    }

    // Flags â is_starred de emails_cache â flag "star"
    const baseFlags = Array.isArray(m.flags) ? m.flags : [];
    const flags = m.is_starred && !baseFlags.includes("star")
      ? [...baseFlags, "star"]
      : baseFlags;

    return {
      id:          m.id,
      gmailId:     m.gmail_id   || null,  // ID Gmail pour les appels PATCH/DELETE
      from:        m.from_name  || "",
      fromEmail:   m.from_email || "",
      subject:     m.subject    || "(sans objet)",
      date:        fmtEmailDate(m.date_iso || m.created_at) || m.date || "",
      rawDate:     m.date_iso   || m.created_at || "",
      threadId:    m.thread_id  || null,
      cc:          Array.isArray(m.cc_addresses) ? m.cc_addresses : (Array.isArray(m.cc) ? m.cc : []),
      snippet:     stripHtml(rawSnippet),
      body:        stripHtml(rawBodyText),   // texte propre pour IA
      bodyHtml,                              // HTML sanitisÃ© pour iframe
      bodyLoaded:  !!(rawBodyHtml || rawBodyText), // true si corps dÃ©jÃ  chargÃ©
      flags,
      aTraiter:    m.a_traiter  || false,
      unread:      m.is_unread  || false,
      archived:    m.is_archived || false,
      direction:   m.direction  || "received",
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
    };
  };

  // âââ Synchronisation complÃ¨te Gmail en arriÃ¨re-plan âââââââââââââââââââââââââ
  const lancerSyncComplete = async () => {
    if (syncRunning.current) return;
    syncRunning.current = true;
    setSyncStatus('running');
    setSyncProgress({synced: 0, total: 0, pageToken: null});

    let totalSynced = 0;
    let estimatedTotal = 0;

    // Fonction interne â paginer UN label + gÃ©rer nextLabel automatiquement
    const syncLabel = async (label: string) => {
      let pageToken: string|null = null;
      while (syncRunning.current) {
        const res = await apiFetch('/api/emails/sync', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ pageToken, labels: [label] }),
        });
        if (!res.ok) { setSyncStatus('error'); return; }
        const data = await res.json();
        totalSynced += data.synced || 0;
        if (data.total > estimatedTotal) estimatedTotal = data.total;
        pageToken = data.nextPageToken || null;
        setSyncProgress({synced: totalSynced, total: estimatedTotal, pageToken});
        // Si le serveur signale de passer au label suivant
        if (data.nextLabel && data.nextLabel !== label) {
          await syncLabel(data.nextLabel);
          break;
        }
        if (!pageToken) break;
        await new Promise(r => setTimeout(r, 300));
      }
    };

    try {
      await syncLabel('INBOX');
      setSyncStatus('done');
      setSyncLastDate(new Date().toISOString());
      // Recharger les emails depuis emails_cache maintenant rempli
      await loadEmailsFromApi(false);
    } catch(e) {
      setSyncStatus('error');
      syncRunning.current = false;
    }
    syncRunning.current = false;
  };

  // âââ Recherche approfondie dans Gmail ââââââââââââââââââââââââââââââââââââââââ
  const lancerDeepSearch = async (q: string) => {
    if (!q.trim()) return;
    setDeepSearching(true);
    setDeepResults([]);
    try {
      const res = await apiFetch(`/api/emails/deep-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const { results } = await res.json();
        setDeepResults((results || []).map((m: any) => ({
          ...mapEmail(m),
          _fromGmailSearch: true,
        })));
      }
    } catch {}
    setDeepSearching(false);
  };

  // Analyse IA en arriÃ¨re-plan â uniquement les emails sans extraction
  const analyserEmailsEnArrierePlan = async (emailsList: any[], cacheSnapshot: typeof repliesCache) => {
    // Fix C2 â Garde-fou : une seule analyse Ã  la fois (Ã©vite les appels Anthropic en double)
    if (analysingRef.current) return;
    // Fix C3 â Utiliser le cacheSnapshot passÃ© en paramÃ¨tre, pas la closure
    // (la closure pouvait pointer vers repliesCache = {} si appelÃ©e depuis un contexte stale)
    const aAnalyser = emailsList.filter(m => !cacheSnapshot[m.id]?.extracted);
    if (aAnalyser.length === 0) return;
    analysingRef.current = true;
    setAnalysing(true);
    const nouvellesExtractions: Record<string,any> = {};
    try {
    for (let i = 0; i < aAnalyser.length; i++) {
      const m = aAnalyser[i];
      setAnalysingProgress(`${i + 1}/${aAnalyser.length}`);
      try {
        const raw = await callClaude(
          buildExtractMessage(m),
          buildExtractPrompt(nomEtab, espacesDyn), null,
          "extraction_radar_bg"
        );
        const extracted = JSON.parse(raw.replace(/```json|```/g, "").trim());
        nouvellesExtractions[m.id] = extracted;
        // Mettre Ã  jour le cache React au fur et Ã  mesure (UI uniquement, pas de Supabase)
        setRepliesCache(prev => ({
          ...prev,
          [m.id]: { ...(prev[m.id] || { reply: "", editReply: "" }), extracted },
        }));
      } catch {
        // Fix #8 â ne pas marquer comme analysÃ© si Ã©chec : sera retentÃ© au prochain cycle
        console.warn(`Analyse email ${m.id} Ã©chouÃ©e â sera retentÃ©e`);
      }
    }
    // Sauvegarder en Supabase UNE SEULE FOIS Ã  la fin â payload maÃ®trisÃ©
    if (Object.keys(nouvellesExtractions).length > 0) {
      setRepliesCache(prev => {
        const allExtractions: Record<string,any> = {};
        Object.entries(prev).forEach(([id, v]: [string, any]) => {
          if (v.extracted) allExtractions[id] = v.extracted;
        });
        // Limiter Ã  500 entrÃ©es (200 Ã©tait trop bas â Ã©vinÃ§ait des analyses valides â re-analyses inutiles)
        const keys = Object.keys(allExtractions);
        if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(k => delete allExtractions[k]);
        saveExtractions(allExtractions);
        return prev;
      });
    }
    } finally {
      // Fix C2 â Toujours libÃ©rer le sÃ©maphore, mÃªme en cas d'erreur inattendue
      analysingRef.current = false;
      setAnalysing(false);
      setAnalysingProgress("");
    }
  };

  // âââ Re-analyser un email spÃ©cifique (force une nouvelle extraction) ââââââ
  // Utile quand le prompt a Ã©tÃ© amÃ©liorÃ© ou que l'extraction prÃ©cÃ©dente Ã©tait incorrecte
  const [reanalysingId, setReanalysingId] = useState<string | null>(null);
  const reanalyserEmail = async (email: any) => {
    if (!email || reanalysingId) return;
    setReanalysingId(email.id);
    try {
      const raw = await callClaude(
        buildExtractMessage(email),
        buildExtractPrompt(nomEtab, espacesDyn), null,
        "reanalyse_manuelle"
      );
      const nouvelle = JSON.parse(raw.replace(/```json|```/g, "").trim());
      // Mettre Ã  jour cache React (immÃ©diat) + state local extracted si ce mail est sÃ©lectionnÃ©
      setRepliesCache(prev => {
        const updated = {
          ...prev,
          [email.id]: { ...(prev[email.id] || { reply: "", editReply: "" }), extracted: nouvelle },
        };
        // Persister en Supabase
        const allExtractions: Record<string,any> = {};
        Object.entries(updated).forEach(([id, v]: [string, any]) => {
          if (v.extracted) allExtractions[id] = v.extracted;
        });
        saveExtractions(allExtractions);
        return updated;
      });
      // Si ce mail est celui affichÃ© actuellement, rafraÃ®chir l'extraction visible
      if (sel?.id === email.id) setExtracted(nouvelle);
      toast("Mail re-analysÃ© â");
    } catch (e: any) {
      toast("Re-analyse Ã©chouÃ©e : " + humanError(e), "err");
    }
    setReanalysingId(null);
  };

  // âââ Tester ARCHANGE sur un mail fictif (modale) ââââââââââââââââââââââââ
  const runTestArchange = async () => {
    if (!testMailContent.trim()) { toast("Collez un mail pour tester", "err"); return; }
    setTestRunning(true);
    setTestResult(null);
    try {
      const fakeEmail = {
        id: "test_" + Date.now(),
        from: testMailFrom || "Test client",
        fromEmail: (testMailFrom.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]) || "test@example.com",
        subject: testMailSubject || "(test sans objet)",
        body: testMailContent,
        snippet: testMailContent.slice(0, 200),
      };
      const tStart = Date.now();
      const tokensInDebut = apiUsageStats.totalInputTokens;
      const tokensOutDebut = apiUsageStats.totalOutputTokens;
      const coutDebut = apiUsageStats.totalCostUSD;
      const raw = await callClaude(
        buildExtractMessage(fakeEmail),
        buildExtractPrompt(nomEtab, espacesDyn), null,
        "test_archange"
      );
      const extracted = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const duree = ((Date.now() - tStart) / 1000).toFixed(1);
      const dTokensIn = apiUsageStats.totalInputTokens - tokensInDebut;
      const dTokensOut = apiUsageStats.totalOutputTokens - tokensOutDebut;
      const dCout = apiUsageStats.totalCostUSD - coutDebut;
      const plateforme = detectPlateforme(fakeEmail.fromEmail, fakeEmail.body);
      const estForward = estMailForwarde({ subject: fakeEmail.subject, body: fakeEmail.body });
      setTestResult({ extracted, duree, tokensIn: dTokensIn, tokensOut: dTokensOut, cout: dCout, plateforme, estForward });
      toast("Test terminÃ© â");
    } catch (e: any) {
      toast("Test Ã©chouÃ© : " + humanError(e), "err");
      setTestResult({ error: humanError(e) });
    }
    setTestRunning(false);
  };

  // Chargement/synchronisation des emails â dÃ©clenche d'abord une sync Gmail, puis relit Supabase
  const loadEmailsFromApi = async (withSync = false) => {
    setLoadingMail(true);
    try {
      if (withSync) {
        try {
          // Fix #1 â Sync diffÃ©rentielle via historyId (ne rÃ©cupÃ¨re que les nouveaux)
          // RÃ©cupÃ©rer le dernier historyId connu depuis la route sync
          const statusRes = await apiFetch("/api/emails/sync");
          if (statusRes.ok) {
            const { lastHistoryId, syncCompleted } = await statusRes.json();

            if (syncCompleted && lastHistoryId) {
              // Sync diffÃ©rentielle â seulement les changements depuis la derniÃ¨re sync
              const diffRes = await apiFetch("/api/emails/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ useHistoryId: true, lastHistoryId }),
              });
              if (diffRes.status === 401) {
                const d = await diffRes.json();
                if (d.error === "GMAIL_AUTH_EXPIRED") {
                  toast("Session Gmail expirÃ©e â reconnectez-vous", "err");
                  setLoadingMail(false);
                  return;
                }
              }
            } else if (!syncCompleted) {
              // Sync initiale pas encore terminÃ©e â relancer lancerSyncComplete
              lancerSyncComplete();
            }
          }
        } catch {}
      }
      const r = await apiFetch(`/api/emails?limit=${emailsLimit}`);
      if (!r.ok) throw new Error("Erreur " + r.status);
      const payload = await r.json();
      // Nouveau format : { emails: [], syncCompleted: bool, total? } â rÃ©trocompat avec []
      const data = Array.isArray(payload) ? payload : (payload?.emails || []);
      if (payload?.total) setEmailsTotal(payload.total);
      if (data.length > 0) {
        const mapped = data.map((m: any) => mapEmail(m));
        setEmails(mapped);
        toast(mapped.length + " emails chargÃ©s");
        if (withSync) setTimeout(() => analyserEmailsEnArrierePlan(mapped, repliesCache), 500);
      } else {
        setEmails([]);
        toast("Aucun email â vÃ©rifiez la connexion Gmail", "err");
      }
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setLoadingMail(false);
  };

  // Fix #4 â Charger plus d'emails (pagination cursor)
  const chargerPlusEmails = async () => {
    if (loadingMore || emails.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = emails[emails.length - 1]?.rawDate || "";
      const r = await apiFetch(`/api/emails?limit=50&before=${encodeURIComponent(oldest)}`);
      if (!r.ok) throw new Error("Erreur " + r.status);
      const payload = await r.json();
      const data = Array.isArray(payload) ? payload : (payload?.emails || []);
      if (data.length > 0) {
        const mapped = data.map((m: any) => mapEmail(m));
        setEmails(prev => [...prev, ...mapped]);
        if (payload?.total) setEmailsTotal(payload.total);
      } else {
        toast("Tous les emails sont chargÃ©s");
      }
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Chargement parallÃ¨le â user-data + emails simultanÃ©ment
      const [userData, emailsData] = await Promise.allSettled([
        apiFetch("/api/user-data").then(r => r.ok ? r.json() : Promise.reject("user-data:" + r.status)),
        apiFetch("/api/emails").then(r => r.ok ? r.json() : Promise.reject("emails:" + r.status)),
      ]);

      if (cancelled) return;

      if (userData.status === "fulfilled") {
        const d = userData.value;
        try { if (d.resas)         setResas(JSON.parse(d.resas)); }         catch {}
        try { if (d.links)         setLinks(JSON.parse(d.links)); }         catch {}
        try { if (d.links_fetched) setLinksFetched(JSON.parse(d.links_fetched)); } catch {}
        if (d.context) {
          // Le champ context contient soit un JSON avec les sections Sources IA,
          // soit une chaÃ®ne de texte brut (ancienne valeur legacy)
          try {
            const parsed = JSON.parse(d.context);
            if (parsed && typeof parsed === "object") {
              if (parsed.menus)     setMenusCtx(parsed.menus);
              if (parsed.conditions) setConditionsCtx(parsed.conditions);
              if (parsed.espaces)   setEspacesCtx(parsed.espaces);
              if (parsed.ton)       setTonCtx(parsed.ton);
              if (parsed.custom)    setCustomCtx(parsed.custom);
              // Infos Ã©tablissement dynamiques
              if (parsed.nomEtab)      setNomEtab(parsed.nomEtab);
              if (parsed.adresseEtab)  setAdresseEtab(parsed.adresseEtab);
              if (parsed.emailEtab)    setEmailEtab(parsed.emailEtab);
              if (parsed.telEtab)      setTelEtab(parsed.telEtab);
              if (parsed.espacesDyn && Array.isArray(parsed.espacesDyn) && parsed.espacesDyn.length > 0)
                setEspacesDyn(parsed.espacesDyn);
            }
          } catch {
            // Valeur legacy texte brut â mettre dans customCtx
            setCustomCtx(d.context);
          }
        }
        try { if (d.statuts)  { const s = JSON.parse(d.statuts); if (Array.isArray(s) && s.length > 0) setStatuts(s); } } catch {}
        try { if (d.relances)  setRelances(JSON.parse(d.relances)); }  catch {}
        try { if (d.note_ia)   setNoteIA(JSON.parse(d.note_ia)); }     catch {}
        try { if (d.email_resa_links) setEmailResaLinks(JSON.parse(d.email_resa_links)); } catch {}
        try { if (d.motifs_relance) { const m = JSON.parse(d.motifs_relance); if (Array.isArray(m) && m.length > 0) setMotifsRelance(m); } } catch {}
        try { if (d.email_meta) {
          const meta = JSON.parse(d.email_meta);
          try { localStorage.setItem("arc_email_meta", JSON.stringify(meta)); } catch {}
        } } catch {}
        try { if (d.radar_traites) { const t = JSON.parse(d.radar_traites); setRadarTraites(new Set(t)); } } catch {}
        try { if (d.sent_replies) setSentReplies(JSON.parse(d.sent_replies)); } catch {}
        try { if (d.custom_tags) setCustomTags(JSON.parse(d.custom_tags)); } catch {}
        try { if (d.email_tags) setEmailTags(JSON.parse(d.email_tags)); } catch {}
        // ââ Sources ARCHANGE v2 â chargement des 5 nouvelles structures ââââ
        try { if (d.regles_commerciales) {
          const loaded = JSON.parse(d.regles_commerciales);
          // Deep merge avec DEFAULT pour garantir toutes les clÃ©s mÃªme si la structure Ã©volue
          setReglesCommerciales({
            parNombrePersonnes: { ...DEFAULT_REGLES_COMMERCIALES.parNombrePersonnes, ...(loaded.parNombrePersonnes || {}) },
            parBudgetParPers: { ...DEFAULT_REGLES_COMMERCIALES.parBudgetParPers, ...(loaded.parBudgetParPers || {}) },
            parBudgetTotal: { ...DEFAULT_REGLES_COMMERCIALES.parBudgetTotal, ...(loaded.parBudgetTotal || {}) },
            parProfilClient: { ...DEFAULT_REGLES_COMMERCIALES.parProfilClient, ...(loaded.parProfilClient || {}) },
            parMoment: { ...DEFAULT_REGLES_COMMERCIALES.parMoment, ...(loaded.parMoment || {}) },
            parEspace: loaded.parEspace || {},
          });
        } } catch {}
        try { if (d.ton_style) {
          const loaded = JSON.parse(d.ton_style);
          setTonStyle({
            formulesValides: Array.isArray(loaded.formulesValides) ? loaded.formulesValides : [],
            formulesInterdites: Array.isArray(loaded.formulesInterdites) ? loaded.formulesInterdites : [],
            formalite: { ...DEFAULT_TON_STYLE.formalite, ...(loaded.formalite || {}) },
          });
        } } catch {}
        try { if (d.apprentissages) {
          const loaded = JSON.parse(d.apprentissages);
          setApprentissages({
            reglesApprises: Array.isArray(loaded.reglesApprises) ? loaded.reglesApprises : [],
            exemplesReference: Array.isArray(loaded.exemplesReference) ? loaded.exemplesReference : [],
            suggestionsEnAttente: Array.isArray(loaded.suggestionsEnAttente) ? loaded.suggestionsEnAttente : [],
          });
        } } catch {}
        try { if (d.cas_particuliers) {
          const loaded = JSON.parse(d.cas_particuliers);
          if (Array.isArray(loaded)) setCasParticuliers(loaded);
        } } catch {}
        try { if (typeof d.regles_absolues === "string") setReglesAbsolues(d.regles_absolues); } catch {}
        // P1 â Charger les rÃ©ponses IA persistÃ©es â restaure les replies aprÃ¨s F5
        try { if (d.replies_cache) {
          const replies = JSON.parse(d.replies_cache);
          setRepliesCache(prev => {
            const merged: Record<string,any> = { ...prev };
            Object.entries(replies).forEach(([id, rc]: [string, any]) => {
              if (!merged[id]) merged[id] = { reply: rc.reply||"", editReply: rc.editReply||rc.reply||"", extracted: null, dateGen: rc.dateGen||"" };
              else merged[id] = { ...merged[id], reply: merged[id].reply || rc.reply||"", editReply: merged[id].editReply || rc.editReply||rc.reply||"", dateGen: merged[id].dateGen || rc.dateGen||"" };
            });
            return merged;
          });
        } } catch {}
        // Charger les extractions IA persistÃ©es â alimente directement repliesCache
        try { if (d.extractions) {
          const extr = JSON.parse(d.extractions);
          setRepliesCache(prev => {
            const merged: Record<string,any> = { ...prev };
            Object.entries(extr).forEach(([id, extracted]) => {
              if (!merged[id]) merged[id] = { reply: "", editReply: "", extracted };
              else if (!merged[id].extracted) merged[id] = { ...merged[id], extracted };
            });
            return merged;
          });
        } } catch {}
      } else {
        console.error("Chargement donnÃ©es utilisateur Ã©chouÃ© :", userData.reason);
        toast("â ï¸ Impossible de charger vos donnÃ©es â vÃ©rifiez votre connexion", "err");
      }

      if (emailsData.status === "fulfilled") {
        const payload = emailsData.value;
        // Nouveau format : { emails: [], syncCompleted } â rÃ©trocompat avec []
        const data = Array.isArray(payload) ? payload : (payload?.emails || []);
        const mapped = data.length > 0 ? data.map((m: any) => mapEmail(m)) : [];
        setEmails(mapped);
      } else {
        console.error("Chargement emails Ã©chouÃ© :", emailsData.reason);
        setEmails([]);
      }

      if (!cancelled) {
        setInitializing(false);
        setLoadingMail(false);
        // Lancer la synchronisation complÃ¨te en arriÃ¨re-plan (sans bloquer l'UI)
        setTimeout(() => lancerSyncComplete(), 2000);
        // Fix #5 â VÃ©rifier et renouveler le Gmail Watch si expirÃ© (temps rÃ©el)
        setTimeout(async () => {
          try {
            const watchRes = await apiFetch("/api/gmail/watch");
            if (watchRes.ok) {
              const { active } = await watchRes.json();
              if (!active) {
                // Watch expirÃ© ou non configurÃ© â tenter de le renouveler
                await apiFetch("/api/gmail/watch", { method: "POST" });
              }
            }
          } catch {}
        }, 5000);
      }
    };

    setLoadingMail(true);
    // P2 â Restaurer l'Ã©tat UI depuis localStorage avant le chargement
    try {
      const ui = JSON.parse(localStorage.getItem("arc_ui_state") || "{}");
      if (ui.view && ["general","mails","planning","stats","sources"].includes(ui.view)) setView(ui.view);
      if (ui.mailFilter) setMailFilter(ui.mailFilter);
      if (ui.generalFilter) setGeneralFilter(ui.generalFilter);
      if (typeof ui.navCollapsed === "boolean") setNavCollapsed(ui.navCollapsed);
      if (ui.calView && ["mois","semaine","jour"].includes(ui.calView)) setCalView(ui.calView);
      if (ui.planFilter) setPlanFilter(ui.planFilter);
    } catch {}
    init();
    return () => { cancelled = true; };
  }, []);

  // Retry automatique â au retour connexion ET toutes les 30s si queue non vide
  useEffect(() => {
    const flushQueue = async () => {
      setOfflineQueue(q => {
        if (Object.keys(q).length === 0) return q;
        // Retenter chaque entrÃ©e â saveToSupabase supprime de la queue si succÃ¨s
        Object.entries(q).forEach(([key, value]) => saveToSupabase({ [key]: value }));
        return q; // Ne pas vider ici â saveToSupabase le fera si succÃ¨s
      });
    };
    window.addEventListener("online", flushQueue);
    const interval = setInterval(() => {
      setOfflineQueue(q => {
        if (Object.keys(q).length > 0) flushQueue();
        return q;
      });
    }, 30000);
    return () => { window.removeEventListener("online", flushQueue); clearInterval(interval); };
  }, []);

  // Fix C1 â Polling automatique toutes les 2 minutes pour dÃ©tecter les nouveaux emails
  // Utilise un ref pour Ã©viter le bug de closure stale (le setInterval capturait
  // loadEmailsFromApi du premier render, avec repliesCache = {} vide â re-analysait tout)
  useEffect(() => { loadEmailsFromApiRef.current = loadEmailsFromApi; });
  useEffect(() => {
    const pollingInterval = setInterval(() => {
      loadEmailsFromApiRef.current(true);
    }, 2 * 60 * 1000);
    return () => clearInterval(pollingInterval);
  }, []);

  // Supabase Realtime â mise Ã  jour instantanÃ©e quand emails_cache change (via webhook Pub/Sub)
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let channel: any = null;
    try {
      // Lazy import pour ne pas bloquer si @supabase/supabase-js n'est pas installÃ© cÃ´tÃ© client
      import('@supabase/supabase-js').then(({ createClient }) => {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        channel = supabase
          .channel('emails_cache_changes')
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'emails_cache',
          }, (payload: any) => {
            const newEmail = mapEmail(payload.new);
            setEmails(prev => {
              if (prev.some(m => m.id === newEmail.id)) return prev;
              return [newEmail, ...prev];
            });
            if (newEmail.unread) {
              toast(`Nouvel email de ${newEmail.from} â ${newEmail.subject}`);
            }
          })
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'emails_cache',
          }, (payload: any) => {
            const updated = mapEmail(payload.new);
            setEmails(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
            if (sel?.id === updated.id) setSel((prev: any) => prev ? { ...prev, ...updated } : prev);
          })
          .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'emails_cache',
          }, (payload: any) => {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setEmails(prev => prev.filter(m => m.id !== deletedId));
              if (sel?.id === deletedId) setSel(null);
            }
          })
          .subscribe();
      }).catch(() => {}); // Silencieux si @supabase/supabase-js absent cÃ´tÃ© client
    } catch {}
    return () => { if (channel) channel.unsubscribe?.(); };
  }, []);

  // P2 â Sauvegarder l'Ã©tat UI dans localStorage Ã  chaque changement
  useEffect(() => {
    try { localStorage.setItem("arc_ui_state", JSON.stringify({ view, mailFilter, generalFilter, navCollapsed, calView, planFilter })); } catch {}
  }, [view, mailFilter, generalFilter, navCollapsed, calView, planFilter]);

  // P5 â Avertir avant fermeture si rÃ©ponse non sauvegardÃ©e
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (reply && !drafted.has(sel?.id)) {
        e.preventDefault();
        e.returnValue = "Une rÃ©ponse a Ã©tÃ© gÃ©nÃ©rÃ©e mais n'a pas encore Ã©tÃ© crÃ©Ã©e comme brouillon. Voulez-vous quitter ?";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [reply, drafted, sel]);
  // [bandeau alerteUrgente supprimÃ© â point 6]

  const deleteEmailWithUndo = (em: any) => {
    if (undoDelete?.timer) clearTimeout(undoDelete.timer);
    // Retirer immÃ©diatement de la liste (optimiste)
    setEmails(prev => prev.filter(m => m.id !== em.id));
    if (sel?.id === em.id) setSel(null);
    const timer = setTimeout(() => {
      // Confirmer la suppression aprÃ¨s 4s â appel Gmail trash
      if (em.gmailId) {
        apiFetch("/api/emails", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail_id: em.gmailId }),
        }).catch(() => {});
      }
      setUndoDelete(null);
    }, 4000);
    setUndoDelete({ email: em, timer });
    toast("Email supprimÃ© â Annuler ?", "undo");
  };

  const toggleFlag = (id: string, flag: string) => {
    const email = emails.find(m => m.id === id);
    if (!email) return;
    const hasFlag = (email.flags || []).includes(flag);
    const newFlags = hasFlag
      ? (email.flags || []).filter((x: string) => x !== flag)
      : [...(email.flags || []), flag];
    // Optimiste local
    setEmails(prev => prev.map(m => m.id === id ? { ...m, flags: newFlags } : m));
    if (sel?.id === id) setSel((prev: any) => prev ? { ...prev, flags: newFlags } : prev);
    // Bidirectionnel Gmail â avec rollback si Ã©chec
    if (email.gmailId && flag === "star") {
      apiFetch("/api/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail_id: email.gmailId, action: "star", value: !hasFlag }),
      }).catch(() => {
        // Rollback si Gmail Ã©choue
        setEmails(prev => prev.map(m => m.id === id ? { ...m, flags: email.flags || [] } : m));
        if (sel?.id === id) setSel((prev: any) => prev ? { ...prev, flags: email.flags || [] } : prev);
        toast("Erreur synchronisation Gmail â rÃ©essayez", "err");
      });
    }
  };

  const toggleATraiter = (id: string) => {
    setEmails(prev => prev.map(m => m.id === id ? { ...m, aTraiter: !m.aTraiter } : m));
    if (sel?.id === id) setSel((prev: any) => prev ? { ...prev, aTraiter: !prev.aTraiter } : prev);
  };

  // âââ Archivage ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const archiveEmail = (id: string) => {
    const email = emails.find(m => m.id === id);
    // Optimiste local
    setEmails(prev => prev.map(m => m.id === id ? { ...m, archived: true } : m));
    if (sel?.id === id) setSel(null);
    // Bidirectionnel Gmail â avec rollback si Ã©chec
    if (email?.gmailId) {
      apiFetch("/api/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail_id: email.gmailId, action: "archive" }),
      }).catch(() => {
        // Rollback si Gmail Ã©choue
        setEmails(prev => prev.map(m => m.id === id ? { ...m, archived: false } : m));
        toast("Erreur archivage Gmail â rÃ©essayez", "err");
      });
    }
    toast("Email archivÃ© â E pour archiver");
  };

  const unarchiveEmail = (id: string) => {
    setEmails(prev => prev.map(m => m.id === id ? { ...m, archived: false } : m));
    toast("Email restaurÃ© dans la boÃ®te");
  };

  // âââ Transfert email ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const forwardEmail = (em: any) => {
    const body = encodeURIComponent(
      `\n\n---------- Message transfÃ©rÃ© ----------\nDe : ${em.from} <${em.fromEmail}>\nDate : ${em.date}\nObjet : ${em.subject}\n\n${em.body || em.snippet || ""}`
    );
    const subject = encodeURIComponent(`Tr: ${em.subject || ""}`);
    window.open(`https://mail.google.com/mail/?view=cm&su=${subject}&body=${body}`, "_blank");
  };

  // âââ Ouvrir l'Ã©diteur de rÃ©ponse manuelle âââââââââââââââââââââââââââââââââââ
  const openReplyEditor = (mode: "reply"|"replyAll"|"forward" = "reply") => {
    if (!sel) return;
    setReplyEditorMode(mode);
    if (mode === "reply") {
      setReplyEditorTo(sel.fromEmail || "");
    } else if (mode === "replyAll") {
      const all = [sel.fromEmail, ...(sel.cc || [])].filter(Boolean).join(", ");
      setReplyEditorTo(all);
    } else {
      setReplyEditorTo("");
    }
    // PrÃ©-remplir avec la citation de l'email original
    const sig = `\n\n--\nCordialement,\nL'Ã©quipe ${nomEtab}${adresseEtab ? "\n" + adresseEtab : ""}${emailEtab ? "\n" + emailEtab : ""}`;
    const citation = `\n\n\nâââ Message original âââ\nDe : ${sel.from} <${sel.fromEmail}>\nDate : ${sel.date}\nObjet : ${sel.subject}\n\n${sel.body?.slice(0, 2000) || sel.snippet || ""}`;
    setReplyEditorText(sig + citation);
    setShowReplyEditor(true);
  };

  // âââ Envoi rÃ©el via /api/gmail/send âââââââââââââââââââââââââââââââââââââââââ
  const sendReply = async () => {
    if (!sel || !replyEditorTo.trim() || !replyEditorText.trim()) return;
    setSending(true);
    try {
      const subject = replyEditorMode === "forward"
        ? `Tr: ${sel.subject || ""}`
        : sel.subject?.startsWith("Re:") ? sel.subject : `Re: ${sel.subject || ""}`;
      const r = await apiFetch("/api/gmail/send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          to: replyEditorTo,
          subject,
          body: replyEditorText,
          threadId: replyEditorMode !== "forward" ? (sel.threadId || null) : null,
        }),
      });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      // Sauvegarder dans l'historique
      const upd = { ...sentReplies, [sel.id]: { text: replyEditorText, date: new Date().toLocaleDateString("fr-FR"), subject, toEmail: replyEditorTo }};
      saveSentReplies(upd);
      setShowReplyEditor(false);
      setReplyEditorText("");
      toast("Email envoyÃ© â");
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setSending(false);
  };

  // âââ Envoi nouveau mail ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const sendNewMail = async () => {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) return;
    setComposeSending(true);
    try {
      const r = await apiFetch("/api/gmail/send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody, threadId: null }),
      });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      setShowCompose(false);
      setComposeTo(""); setComposeSubject(""); setComposeBody("");
      toast("Email envoyÃ© â");
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setComposeSending(false);
  };

  // âââ Sauvegarde brouillon local ââââââââââââââââââââââââââââââââââââââââââââââ
  const saveDraft = async () => {
    if (!replyEditorText.trim() && !composeBody.trim()) return;
    const to      = showCompose ? composeTo : replyEditorTo;
    const subject = showCompose ? composeSubject : (sel ? `Re: ${sel.subject}` : "");
    const body    = showCompose ? composeBody : replyEditorText;

    const draft: DraftItem = {
      id: "draft_" + Date.now(),
      to, subject, body,
      date: new Date().toLocaleDateString("fr-FR"),
      emailId: showReplyEditor ? sel?.id : undefined,
    };

    // Fix #6 â CrÃ©er le brouillon dans Gmail rÃ©el (en parallÃ¨le du stockage local)
    try {
      const res = await apiFetch("/api/gmail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      if (res.ok) {
        toast("Brouillon crÃ©Ã© dans Gmail â");
      } else {
        // Fallback : stockage local si Gmail Ã©choue
        const updated = [...localDrafts, draft];
        setLocalDrafts(updated);
        saveToSupabase({ replies_cache: JSON.stringify(updated) });
        toast("Brouillon sauvegardÃ© localement â");
      }
    } catch {
      // Fallback hors ligne
      const updated = [...localDrafts, draft];
      setLocalDrafts(updated);
      saveToSupabase({ replies_cache: JSON.stringify(updated) });
      toast("Brouillon sauvegardÃ© â");
    }

    setShowReplyEditor(false);
    setShowCompose(false);
  };

  // âââ Snooze âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const snoozeEmail = (id: string, until: string) => {
    const upd = emails.map(m => m.id === id ? { ...m, snoozedUntil: until } : m);
    saveEmails(upd);
    if (sel?.id === id) setSel(null);
    toast("Email reportÃ© â°");
  };
  // RÃ©veil des emails snoozÃ©s â au mount + toutes les 60s pour rÃ©veil automatique en session longue
  useEffect(() => {
    const checkWake = () => {
      const now = new Date().toISOString();
      const toWake = emails.filter(m => m.snoozedUntil && m.snoozedUntil <= now);
      if (toWake.length > 0) {
        const upd = emails.map(m => m.snoozedUntil && m.snoozedUntil <= now ? { ...m, snoozedUntil: null, unread: true } : m);
        saveEmails(upd);
        toast(`${toWake.length} email${toWake.length > 1 ? "s" : ""} reportÃ©${toWake.length > 1 ? "s" : ""} de retour dans la boÃ®te`);
      }
    };
    checkWake();
    const t = setInterval(checkWake, 60_000);
    return () => clearInterval(t);
  }, [emails.length]);

  // âââ SÃ©lection multiple âââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(filtered.map(m => m.id)));
  const clearSelection = () => setSelectedIds(new Set());
  const bulkMarkRead = () => {
    const upd = emails.map(m => selectedIds.has(m.id) ? { ...m, unread: false } : m);
    saveEmails(upd); clearSelection(); toast(`${selectedIds.size} email(s) marquÃ©s lus`);
  };
  const bulkMarkUnread = () => {
    const upd = emails.map(m => selectedIds.has(m.id) ? { ...m, unread: true } : m);
    saveEmails(upd); clearSelection(); toast(`${selectedIds.size} email(s) marquÃ©s non lus`);
  };
  const bulkArchive = () => {
    const upd = emails.map(m => selectedIds.has(m.id) ? { ...m, archived: true } : m);
    saveEmails(upd); clearSelection(); toast(`${selectedIds.size} email(s) archivÃ©(s)`);
  };
  const bulkDelete = () => {
    const upd = emails.filter(m => !selectedIds.has(m.id));
    saveEmails(upd); clearSelection(); setSel(null); toast(`${selectedIds.size} email(s) supprimÃ©(s)`);
  };
  const bulkATraiter = () => {
    const upd = emails.map(m => selectedIds.has(m.id) ? { ...m, aTraiter: true } : m);
    saveEmails(upd); clearSelection(); toast(`${selectedIds.size} email(s) marquÃ©s Ã  traiter`);
  };

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    let res = emails.filter(m => {
      // Filtre "ReportÃ©s" â Point 4 : affiche UNIQUEMENT les mails snoozÃ©s
      if (mailFilter === "reported") {
        if (!m.snoozedUntil || m.snoozedUntil <= new Date().toISOString()) return false;
        if (m.archived) return false;
      } else {
        // Comportement normal : masquer les snoozÃ©s et archivÃ©s
        if (m.snoozedUntil && m.snoozedUntil > new Date().toISOString()) return false;
        if (showArchived) return !!m.archived;
        if (m.archived) return false;
      }
      // 3 â Filtre par tag personnalisÃ©
      if (tagFilter && !(emailTags[m.id]||[]).includes(tagFilter)) return false;
      // Recherche full-text (from + subject + body + snippet)
      const matchesSearch = !q
        || m.from?.toLowerCase().includes(q)
        || m.subject?.toLowerCase().includes(q)
        || (m.body || "").toLowerCase().includes(q)
        || (m.snippet || "").toLowerCase().includes(q)
        || m.fromEmail?.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (mailFilter === "nonlus")   return !!m.unread;
      if (mailFilter === "star")     return (m.flags || []).includes("star");
      if (mailFilter === "flag")     return (m.flags || []).includes("flag");
      if (mailFilter === "atraiter") return !!m.aTraiter;
      return true;
    });
    // Tri â utilise rawDate (ISO) pour un ordre chronologique exact
    res = [...res].sort((a, b) => {
      if (sortOrder === "date_asc")  return (a.rawDate||a.date||"").localeCompare(b.rawDate||b.date||"");
      if (sortOrder === "from")      return (a.from||"").localeCompare(b.from||"");
      if (sortOrder === "subject")   return (a.subject||"").localeCompare(b.subject||"");
      return (b.rawDate||b.date||"").localeCompare(a.rawDate||a.date||""); // date_desc par dÃ©faut
    });
    return res;
  }, [emails, search, mailFilter, sortOrder, showArchived, tagFilter, emailTags]);

  // Synchroniser le ref Ã  chaque render (avant les effects)
  filteredRef.current = filtered;

  // âââ Vue EnvoyÃ©s âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // Fix : emails SENT depuis emails_cache (vrais emails Gmail envoyÃ©s)
  const [sentEmails, setSentEmails] = React.useState<any[]>([]);
  const [loadingSent, setLoadingSent] = React.useState(false);

  // Charger les emails SENT depuis le backend quand on passe sur cette vue
  React.useEffect(() => {
    if (mailFilter !== "envoyes") return;
    setLoadingSent(true);
    apiFetch("/api/emails?filter=sent&limit=100")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        const data = Array.isArray(d) ? d : (d?.emails || []);
        setSentEmails(data.map((m: any) => mapEmail(m)));
      })
      .catch(() => {})
      .finally(() => setLoadingSent(false));
  }, [mailFilter]);

  const sentList = React.useMemo(() => {
    // Fusionner les emails SENT Gmail + les rÃ©ponses envoyÃ©es depuis ARCHANGE
    const fromCache = sentEmails;
    const fromReplies = Object.entries(sentReplies)
      .map(([emailId, s]) => ({ _sentId: emailId, from: "Moi", fromEmail: "", subject: s.subject, date: s.date, body: s.text, snippet: s.text.slice(0,120), unread: false, flags: [], attachments: [], id: "sent_"+emailId, rawDate: s.date }));
    // Fusionner sans doublons (prefer cache)
    const cacheIds = new Set(fromCache.map((m: any) => m.id));
    const merged = [...fromCache, ...fromReplies.filter(r => !cacheIds.has(r.id))];
    return merged.sort((a: any, b: any) => (b.rawDate||"").localeCompare(a.rawDate||""));
  }, [sentEmails, sentReplies]);

  // âââ Vue Brouillons âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const draftList = React.useMemo(() => {
    return localDrafts.map(d => ({...d, from: "Brouillon", fromEmail: d.to, snippet: d.body.slice(0,120), unread: false, flags: [], attachments: [], id: d.id, rawDate: d.date}))
      .sort((a,b) => b.rawDate.localeCompare(a.rawDate));
  }, [localDrafts]);

  const handleSel = async (emailArg: any) => {
    let email = emailArg;
    setMailOrigine(null);

    // Fix 5 â Sauvegarder le brouillon de rÃ©ponse en cours avant de changer d'email
    if (sel && sel.id !== email.id && showReplyEditor && replyEditorText.trim()) {
      // Sauvegarder comme brouillon liÃ© Ã  l'email prÃ©cÃ©dent
      const draftKey = `draft_reply_${sel.id}`;
      try { localStorage.setItem(draftKey, replyEditorText); } catch {}
    }
    // RÃ©initialiser l'Ã©diteur de rÃ©ponse (isolation par email)
    setShowReplyEditor(false);
    setReplyEditorText("");
    // Restaurer un brouillon Ã©ventuel pour le nouvel email
    if (email.id) {
      try {
        const saved = localStorage.getItem(`draft_reply_${email.id}`);
        if (saved) { setReplyEditorText(saved); setShowReplyEditor(true); }
      } catch {}
    }

    // Marquer comme lu â optimiste puis sync Gmail via PATCH
    if (email.unread) {
      email = { ...email, unread: false };
      setEmails(prev => prev.map(m => m.id === email.id ? { ...m, unread: false } : m));
      if (email.gmailId) {
        apiFetch("/api/emails", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail_id: email.gmailId, action: "read" }),
        }).catch(() => {});
      }
    }

    // Restaurer la rÃ©ponse mise en cache
    const cached = repliesCache[email.id];
    setReply(cached?.reply || "");
    setEditReply(cached?.editReply || "");
    setExtracted(cached?.extracted || null);
    setEditing(false); setShowPlanForm(false);
    setSel(email);

    // Charger le corps complet Ã  la demande (format=full) si pas encore en cache
    if (email.gmailId && !email.bodyLoaded) {
      try {
        const res = await apiFetch(`/api/emails?gmail_id=${encodeURIComponent(email.gmailId)}`);
        if (res.ok) {
          const body = await res.json();
          if (body.body_html || body.body_text) {
            const rawHtml = body.body_html || "";
            const rawText = body.body_text || "";
            const bodyHtml = rawHtml ? sanitizeHtmlForDisplay(rawHtml) : null;
            const enriched = {
              ...email,
              body:        stripHtml(rawText || rawHtml),
              bodyHtml,
              bodyLoaded:  true,
              attachments: Array.isArray(body.attachments) ? body.attachments : email.attachments,
            };
            setSel(enriched);
            setEmails(prev => prev.map(m => m.id === email.id ? enriched : m));
          }
        }
      } catch (e) {
        console.warn("Chargement corps email Ã©chouÃ©:", e);
      }
    }
  };

  const genererReponse = async () => {
    if (!sel) return;
    const emailId = sel.id;
    genReplyForEmailId.current = emailId;
    setGenReply(true);
    setReply(""); setEditReply(""); setExtracted(null);
    try {
      // ââ Limites Option A (10-15Ã anciennes valeurs) ââââââââââââââââââââââââ
      const LIM = {
        body: 30000,
        menus: 15000,
        conditions: 8000,
        espaces: 8000,
        ton: 5000,
        custom: 5000,
        link: 2000,
      };

      // ââ DÃ©tection des troncatures pour notification utilisateur ââââââââââââ
      const detectedTruncations: TruncationInfo[] = [];
      const corpsLen = (sel.body || sel.snippet || "").length;
      if (corpsLen > LIM.body) detectedTruncations.push({ label: "Corps du mail", actuel: corpsLen, limite: LIM.body });
      if ((menusCtx?.length || 0) > LIM.menus) detectedTruncations.push({ label: "Menus & Tarifs", actuel: menusCtx.length, limite: LIM.menus });
      if ((conditionsCtx?.length || 0) > LIM.conditions) detectedTruncations.push({ label: "Conditions & Politique", actuel: conditionsCtx.length, limite: LIM.conditions });
      if ((espacesCtx?.length || 0) > LIM.espaces) detectedTruncations.push({ label: "Espaces & CapacitÃ©s", actuel: espacesCtx.length, limite: LIM.espaces });
      if ((tonCtx?.length || 0) > LIM.ton) detectedTruncations.push({ label: "RÃ¨gles & Ton", actuel: tonCtx.length, limite: LIM.ton });
      if ((customCtx?.length || 0) > LIM.custom) detectedTruncations.push({ label: "Contexte personnalisÃ©", actuel: customCtx.length, limite: LIM.custom });
      Object.values(linksFetched).forEach((l: any) => {
        const sumLen = (l?.summary || "").length;
        if (sumLen > LIM.link) {
          const existing = detectedTruncations.find(t => t.label === "Liens web analysÃ©s");
          if (!existing) detectedTruncations.push({ label: "Liens web analysÃ©s", actuel: sumLen, limite: LIM.link });
          else if (sumLen > existing.actuel) { existing.actuel = sumLen; }
        }
      });

      // ââ Construire le planning temps rÃ©el (balisÃ© XML) âââââââââââââââââââââ
      const planningCtx = `\n\n<planning_temps_reel>\n` + (
        resas.length > 0
          ? resas.map(r => {
              const espace = ESPACES.find(e => e.id === r.espaceId)?.nom || r.espaceId;
              const statut = statuts.find(s => s.id === (r.statut || "nouveau"))?.label || r.statut;
              return `  <reservation espace="${espace}" date="${r.dateDebut || "?"}" horaires="${r.heureDebut || "?"}-${r.heureFin || "?"}" personnes="${r.nombrePersonnes || "?"}" statut="${statut}">${r.nom || ""}${r.entreprise ? " ("+r.entreprise+")" : ""}${r.typeEvenement ? " - "+r.typeEvenement : ""}</reservation>`;
            }).join("\n")
          : "  <vide>Aucune rÃ©servation enregistrÃ©e.</vide>"
      ) + `\n</planning_temps_reel>`;

      // ââ Liens web (rÃ©sumÃ©s) âââââââââââââââââââââââââââââââââââââââââââââââ
      const linkCtx = Object.values(linksFetched).filter(Boolean)
        .map((l: any) => (l.summary || "").slice(0, LIM.link)).join("\n\n");

      // ââ Historique : on rÃ©cupÃ¨re TOUS les mails liÃ©s (reÃ§us + envoyÃ©s) ââââ
      // CRITIQUE : on cherche aussi via extracted.email (vrai client) en plus de fromEmail
      const cachedExtracted = repliesCache[sel.id]?.extracted || extracted;
      const vraiEmailClient = (cachedExtracted?.email || sel.fromEmail || "").toLowerCase();
      const fromEmailDirect = (sel.fromEmail || "").toLowerCase();

      const mailsRecusDuClient = emails
        .filter(m => m.id !== sel.id && m.fromEmail && (
          m.fromEmail.toLowerCase() === fromEmailDirect ||
          m.fromEmail.toLowerCase() === vraiEmailClient ||
          repliesCache[m.id]?.extracted?.email?.toLowerCase() === vraiEmailClient
        ))
        .sort((a, b) => (b.rawDate || "").localeCompare(a.rawDate || ""))
        .slice(0, 5)
        .map(m => ({
          from: m.from,
          fromEmail: m.fromEmail,
          date: m.date,
          subject: m.subject,
          body: m.body || m.snippet || "",
          direction: "in" as const,
        }));

      const mailsEnvoyesAuClient = Object.entries(sentReplies)
        .filter(([eId]: [string, any]) => {
          const emailSrc = emails.find(m => m.id === eId);
          const srcFrom = emailSrc?.fromEmail?.toLowerCase();
          const srcExtractedEmail = repliesCache[eId]?.extracted?.email?.toLowerCase();
          return srcFrom === fromEmailDirect
              || srcFrom === vraiEmailClient
              || srcExtractedEmail === vraiEmailClient;
        })
        .map(([, sr]: [string, any]) => ({
          from: nomEtab || "Ãtablissement",
          fromEmail: emailEtab || "",
          date: sr.date,
          subject: sr.subject,
          body: sr.text || "",
          direction: "out" as const,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);

      const historiqueMails = [...mailsRecusDuClient, ...mailsEnvoyesAuClient]
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      // ââ System prompt avec sources balisÃ©es XML ââââââââââââââââââââââââââââ
      const sources = [
        menusCtx ? `  <menus>\n${menusCtx.slice(0, LIM.menus)}\n  </menus>` : "",
        conditionsCtx ? `  <conditions>\n${conditionsCtx.slice(0, LIM.conditions)}\n  </conditions>` : "",
        espacesCtx ? `  <espaces>\n${espacesCtx.slice(0, LIM.espaces)}\n  </espaces>` : "",
        tonCtx ? `  <regles_ton>\n${tonCtx.slice(0, LIM.ton)}\n  </regles_ton>` : "",
        customCtx ? `  <contexte_personnalise>\n${customCtx.slice(0, LIM.custom)}\n  </contexte_personnalise>` : "",
        linkCtx ? `  <infos_web>\n${linkCtx}\n  </infos_web>` : "",
      ].filter(Boolean).join("\n\n");
      const sourcesBlock = sources ? `\n\n<sources_archange>\n${sources}\n</sources_archange>` : "";

      // ââ v2 : rÃ¨gles commerciales activÃ©es conditionnellement selon le mail â
      const reglesComActivees = activerReglesSelonContexte({
        extraction: cachedExtracted,
        regles: reglesCommerciales,
        espacesDyn,
      });
      // DÃ©terminer le profil client pour le ton
      const profilDetecte = (() => {
        const entr = String(cachedExtracted?.entreprise || "").trim();
        const nom = String(cachedExtracted?.nom || "").trim();
        if (!entr || /mr|mme|m\.|mlle|madame|monsieur/i.test(nom)) return "particuliers";
        if (/mairie|ministÃ¨re|universitÃ©|ambassade|prÃ©fecture/i.test(entr)) return "institutionnels";
        if (/agence|event|incentive|communication|marketing/i.test(entr)) return "agences";
        return "entreprises";
      })();
      const tonBlock = buildTonStyleBlock(tonStyle, profilDetecte);
      // ââ v2 : dÃ©tection cas particulier (VIP / partenaires) âââââââââââââââââ
      const casParticulierActif = matchCasParticulier({
        email: sel,
        extraction: cachedExtracted,
        liste: casParticuliers,
      });
      const casParticulierBlock = casParticulierActif ? `\n\n<cas_particulier_actif nom="${casParticulierActif.nom}">\n  <contexte>${casParticulierActif.contexte || ""}</contexte>\n  <regles_specifiques>${casParticulierActif.regles || ""}</regles_specifiques>\n  â ï¸ Ce client est identifiÃ© comme cas particulier â respecte ses rÃ¨gles spÃ©cifiques.\n</cas_particulier_actif>` : "";

      // ââ v2 : rÃ¨gles absolues injectÃ©es EN FIN DE PROMPT (rÃ©cence bias) âââââ
      const reglesAbsoluesBlock = (reglesAbsolues || "").trim() ? `\n\nâ ï¸ââââââââââââââââââââââââââââââ\nâ ï¸ RÃGLES ABSOLUES â JAMAIS TRANSGRESSABLES\nâ ï¸ââââââââââââââââââââââââââââââ\n\n${reglesAbsolues.trim()}\n\nâ ï¸ Ces rÃ¨gles priment sur toute autre instruction. VÃ©rifie une derniÃ¨re fois ta rÃ©ponse avant de la produire.` : "";

      const sys = buildSystemPrompt({nomEtab, adresseEtab, emailEtab, telEtab, espacesDyn})
        + sourcesBlock
        + reglesComActivees
        + tonBlock
        + casParticulierBlock
        + planningCtx
        + reglesAbsoluesBlock;

      // ââ Signature Ã  utiliser dans la rÃ©ponse âââââââââââââââââââââââââââââââ
      const signature = [
        "Cordialement,",
        `L'Ã©quipe ${nomEtab || "l'Ã©tablissement"}`,
        adresseEtab,
        emailEtab,
        telEtab,
      ].filter(Boolean).join("\n");

      // ââ Construire le message utilisateur (briefing + email + instructions)
      const userMsg = buildResponseMessage({
        email: sel,
        extracted: cachedExtracted,
        historiqueMails,
        signature,
      });

      // ââ Court-circuit cache : ne refaire l'extraction que si elle MANQUE ââ
      const extractionExisteDeja = !!cachedExtracted;
      const callsToMake: Promise<string>[] = [
        callClaude(userMsg, sys, null, "generation_reponse"),
      ];
      if (!extractionExisteDeja) {
        callsToMake.push(
          callClaude(buildExtractMessage(sel), buildExtractPrompt(nomEtab, espacesDyn), null, "extraction_a_la_demande")
        );
      }

      const settled = await Promise.allSettled(callsToMake);
      const reponse = settled[0];
      const infoRaw = settled[1];

      let newReply = "";
      let newExtracted: any = cachedExtracted;

      if (genReplyForEmailId.current !== emailId) { setGenReply(false); return; }

      if (reponse.status === "fulfilled" && reponse.value) {
        newReply = reponse.value;
        setReply(newReply); setEditReply(newReply);
      } else {
        const msg = reponse.status === "rejected" ? (reponse.reason?.message || "Erreur ARCHANGE") : "RÃ©ponse vide";
        toast("ARCHANGE n'a pas pu rÃ©diger la rÃ©ponse. " + humanError({message: msg}), "err");
      }

      if (infoRaw && infoRaw.status === "fulfilled") {
        try {
          newExtracted = JSON.parse(infoRaw.value.replace(/```json|```/g, "").trim());
          setExtracted(newExtracted);
        } catch { /* extraction silencieuse */ }
      } else if (cachedExtracted) {
        setExtracted(cachedExtracted);
      }

      // Mettre en cache la rÃ©ponse pour cet email + persister en Supabase
      if (newReply) {
        setRepliesCache(prev => {
          const dateGen = new Date().toLocaleDateString("fr-FR");
          const updated = {
            ...prev,
            [sel.id]: { reply: newReply, editReply: newReply, extracted: newExtracted, dateGen }
          };
          const repliesToSave: Record<string,{reply:string,editReply:string,dateGen:string}> = {};
          Object.entries(updated).forEach(([id, v]: [string, any]) => {
            if (v.reply) repliesToSave[id] = { reply: v.reply, editReply: v.editReply || v.reply, dateGen: v.dateGen || "" };
          });
          saveToSupabase({ replies_cache: JSON.stringify(repliesToSave) });
          return updated;
        });
        // Enregistrer les troncatures dÃ©tectÃ©es (vide = pas de notification affichÃ©e)
        setTruncations(prev => ({ ...prev, [sel.id]: detectedTruncations }));
      }

      // ââ Association IA email â Ã©vÃ©nement ââââââââââââââââââââââââââââââââââââ
      // Si des Ã©vÃ©nements existent et que le lien n'est pas dÃ©jÃ  Ã©tabli
      if (resas.length > 0 && !emailResaLinks[sel.id]) {
        try {
          const resaList = resas.map(r =>
            `- ID:${r.id} | Nom:${r.nom || "?"} | Entreprise:${r.entreprise || "?"} | Email:${r.email || "?"} | Type:${r.typeEvenement || "?"} | Date:${r.dateDebut || "?"} | Personnes:${r.nombrePersonnes || "?"}`
          ).join("\n");

          const matchPrompt = `Analyse cet email et dÃ©termine Ã  quel Ã©vÃ©nement il correspond parmi la liste ci-dessous.

EMAIL REÃU :
De: ${sel.from} <${sel.fromEmail}>
Objet: ${sel.subject}
Corps: ${(sel.body || sel.snippet || "").substring(0, 800)}

ÃVÃNEMENTS EN COURS :
${resaList}

RÃ©ponds UNIQUEMENT avec un JSON valide et rien d'autre :
{"resaId": "ID_DE_L_EVENEMENT_ou_null", "confiance": "haute|moyenne|faible", "raison": "explication courte"}

CritÃ¨res de matching (par ordre de prioritÃ©) :
1. Email de l'expÃ©diteur correspond Ã  l'email de l'Ã©vÃ©nement
2. Nom de l'expÃ©diteur correspond au nom du contact de l'Ã©vÃ©nement
3. Entreprise mentionnÃ©e dans le mail correspond Ã  l'entreprise de l'Ã©vÃ©nement
4. Date ou type d'Ã©vÃ©nement mentionnÃ© correspond
5. Si aucune correspondance Ã©vidente â resaId: null`;

          const matchResult = await callClaude(matchPrompt, "Tu es un assistant qui analyse des emails pour les associer aux bons Ã©vÃ©nements. RÃ©ponds uniquement en JSON valide.", null, "match_email_resa");
          const match = JSON.parse(matchResult.replace(/```json|```/g, "").trim());

          if (match.resaId && match.confiance !== "faible") {
            const resaExists = resas.find(r => r.id === match.resaId);
            if (resaExists) {
              const newLinks = { ...emailResaLinks, [sel.id]: match.resaId };
              saveEmailResaLinks(newLinks);

              // ââ DÃ©tecter les modifications sur la fiche Ã©vÃ©nement ââââââââââ
              try {
                const ficheActuelle = { ...resaExists };
                delete ficheActuelle.id; // on ne modifie pas l'id

                // Labels lisibles pour chaque champ (extensible automatiquement)
                const LABELS_CHAMPS: Record<string,string> = {
                  nom: "Nom du contact", email: "Email", telephone: "TÃ©lÃ©phone",
                  entreprise: "Entreprise", typeEvenement: "Type d'Ã©vÃ©nement",
                  nombrePersonnes: "Nombre de personnes", espaceId: "Espace",
                  dateDebut: "Date", heureDebut: "Heure de dÃ©but", heureFin: "Heure de fin",
                  statut: "Statut", notes: "Notes", budget: "Budget",
                  noteDirecteur: "Note directeur",
                };

                const modifPrompt = `Tu es un assistant qui analyse un email pour dÃ©tecter si le client communique des informations modifiant sa rÃ©servation.

FICHE ÃVÃNEMENT ACTUELLE :
${JSON.stringify(ficheActuelle, null, 2)}

EMAIL REÃU :
De: ${sel.from} <${sel.fromEmail}>
Objet: ${sel.subject}
${sel.body || sel.snippet || ""}

INSTRUCTIONS :
- Analyse uniquement les informations EXPLICITEMENT mentionnÃ©es dans l'email
- Ne propose une modification que si l'email contient clairement une nouvelle valeur diffÃ©rente de l'actuelle
- Pour le statut, utilise uniquement ces valeurs : nouveau, en_cours, en_attente, confirme, annule
- Si aucune modification n'est dÃ©tectÃ©e, retourne {"modifications": []}
- Pour les champs absents de la fiche actuelle mais mentionnÃ©s dans l'email, inclus-les quand mÃªme

Retourne UNIQUEMENT ce JSON valide :
{"modifications": [{"champ": "nomDuChamp", "ancienne": "valeurActuelle", "nouvelle": "nouvelleValeur", "raison": "explication courte en franÃ§ais"}]}`;

                const modifResult = await callClaude(modifPrompt, "Tu analyses des emails pour dÃ©tecter des modifications de rÃ©servation. RÃ©ponds uniquement en JSON valide.", null, "detection_modif_resa");
                const modifData = JSON.parse(modifResult.replace(/```json|```/g, "").trim());

                if (modifData.modifications && modifData.modifications.length > 0) {
                  const suggestions: SuggestionModif[] = modifData.modifications.map((m: any) => ({
                    champ: m.champ,
                    label: LABELS_CHAMPS[m.champ] || m.champ,
                    ancienne: m.ancienne,
                    nouvelle: m.nouvelle,
                    raison: m.raison,
                    selectionnee: true, // cochÃ©e par dÃ©faut
                  }));
                  setPendingSuggestions({ resaId: resaExists.id, emailId: sel.id, suggestions });
                }
              } catch { /* dÃ©tection silencieuse */ }
            }
          }
        } catch { /* matching silencieux â ne bloque pas la gÃ©nÃ©ration */ }
      }
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setGenReply(false);
  };

  // P7 â Autosave du formulaire de rÃ©servation en cours
  const updatePlanForm = (updates: any) => {
    const next = { ...planForm, ...updates };
    setPlanForm(next);
    try { localStorage.setItem("arc_draft_planform", JSON.stringify(next)); } catch {}
  };

  const openPlanForm = () => {
    const pers = parseInt(String(extracted?.nombrePersonnes || "0"), 10);
    // Split "PrÃ©nom Nom" depuis ce que l'IA ou le From a extrait
    const splitNom = (full: string) => {
      const parts = (full || "").trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return { prenom: "", nom: "" };
      if (parts.length === 1) return { prenom: "", nom: parts[0] };
      return { prenom: parts[0], nom: parts.slice(1).join(" ") };
    };
    const rawFull = extracted?.nom || sel?.from || "";
    const { prenom, nom } = splitNom(rawFull);
    // Attribution dynamique selon type d'Ã©vÃ©nement (assis vs debout) et nombre de personnes
    const getEspaceAuto = () => {
      if (extracted?.espaceDetecte) return extracted.espaceDetecte;
      if (espacesDyn.length === 0) return "";
      if (pers === 0) return espacesDyn[0].id;
      // DÃ©tecter si l'Ã©vÃ©nement est debout (cocktail, afterwork, standingâ¦)
      const typeEvt = (extracted?.typeEvenement || "").toLowerCase();
      const isDebout = typeEvt.includes("cocktail") || typeEvt.includes("afterwork") || typeEvt.includes("standing") || typeEvt.includes("reception");
      const withCap = espacesDyn.map(e => {
        const assisMax = parseInt(e.assisMax || "0", 10);
        const deboutMax = parseInt(e.deboutMax || "0", 10);
        const legacyMatch = (e.capacite || "").match(/(\d+)/g);
        const legacy = legacyMatch ? Math.max(...legacyMatch.map(Number)) : 0;
        const cap = isDebout
          ? (deboutMax || assisMax || legacy)
          : (assisMax || deboutMax || legacy);
        return { id: e.id, cap };
      }).sort((a, b) => a.cap - b.cap);
      const fit = withCap.find(e => e.cap >= pers);
      return fit ? fit.id : withCap[withCap.length - 1].id;
    };
    const espaceAuto = getEspaceAuto();
    const min = extracted?.nombrePersonnesMin;
    const max = extracted?.nombrePersonnes;
    const fourchette = (min && max && min !== max) ? `Fourchette : ${min}â${max} personnes. ` : "";
    const f = {
      prenom:         prenom,
      nom:            nom,
      email:          extracted?.email          || sel?.fromEmail || "",
      telephone:      extracted?.telephone      || "",
      entreprise:     extracted?.entreprise     || "",
      typeEvenement:  extracted?.typeEvenement  || "",
      nombrePersonnes:max != null ? String(max) : "",
      espaceId:       espaceAuto,
      dateDebut:      extracted?.dateDebut      || "",
      heureDebut:     extracted?.heureDebut     || "",
      heureFin:       extracted?.heureFin       || "",
      notes:          fourchette + (extracted?.notes || ""),
      budget:         extracted?.budget         || "",
      statut:         extracted?.statutSuggere  || "nouveau",
      noteDirecteur:  "",
      _emailId:       sel?.id,
    };
    // Marquer les champs prÃ©-remplis par l'IA (pour afficher le badge â¦ IA)
    const aiFields = {
      prenom:         Boolean(extracted?.nom),
      nom:            Boolean(extracted?.nom),
      entreprise:     Boolean(extracted?.entreprise),
      dateDebut:      Boolean(extracted?.dateDebut),
      heureDebut:     Boolean(extracted?.heureDebut),
      heureFin:       Boolean(extracted?.heureFin),
      nombrePersonnes:Boolean(extracted?.nombrePersonnes),
      typeEvenement:  Boolean(extracted?.typeEvenement),
      espaceId:       Boolean(extracted?.espaceDetecte),
      budget:         Boolean(extracted?.budget),
      notes:          Boolean(extracted?.notes) || Boolean(fourchette),
    };
    // P7 â Proposer de restaurer un brouillon si disponible pour ce mÃªme email
    try {
      const draft = JSON.parse(localStorage.getItem("arc_draft_planform") || "null");
      if (draft && draft._emailId === sel?.id && draft.nom && window.confirm(`Un brouillon existe pour "${draft.nom}". Restaurer ?`)) {
        setPlanForm(draft); setPlanErrors({}); setPlanFormAI({}); setShowPlanForm(true); return;
      }
    } catch {}
    setPlanForm(f); setPlanErrors({}); setPlanFormAI(aiFields); setShowPlanForm(true);
    try { localStorage.setItem("arc_draft_planform", JSON.stringify(f)); } catch {}
  };

  const submitPlanForm = () => {
    const errs: Record<string, string> = {};
    if (!planForm.prenom?.trim())         errs.prenom         = "PrÃ©nom obligatoire";
    if (!planForm.nom?.trim())            errs.nom            = "Nom obligatoire";
    if (!planForm.dateDebut)              errs.dateDebut      = "Date obligatoire";
    if (!planForm.nombrePersonnes)        errs.nombrePersonnes= "Nombre de personnes obligatoire";
    if (!planForm.heureDebut)             errs.heureDebut     = "Heure de dÃ©but obligatoire";
    if (!planForm.heureFin)               errs.heureFin       = "Heure de fin obligatoire";
    if (Object.keys(errs).length > 0)    { setPlanErrors(errs); return; }
    const pers = parseInt(String(planForm.nombrePersonnes), 10);
    const r = { ...planForm, id: "r" + Date.now(), nombrePersonnes: isNaN(pers) ? planForm.nombrePersonnes : pers };
    saveResas([...resas, r]);
    try { localStorage.removeItem("arc_draft_planform"); } catch {} // P7 â effacer le draft
    // Lier l'email source Ã  la rÃ©servation crÃ©Ã©e et persister en Supabase
    if (sel?.id) saveEmailResaLinks({ ...emailResaLinks, [sel.id]: r.id });
    toast("RÃ©servation ajoutÃ©e au planning !");
    setShowPlanForm(false); setExtracted(null);
    // 2D â Proposer de voir la fiche Ã©vÃ©nement crÃ©Ã©e (setTimeout pour laisser resas se mettre Ã  jour)
    setTimeout(() => {
      if (window.confirm(`ÃvÃ©nement crÃ©Ã© pour ${r.nom}. Ouvrir la fiche ?`)) {
        setSelResaGeneral(r);
        setView("general");
      }
    }, 100);
  };

  const fetchLink = async (url: string, key: string) => {
    if (!url?.trim()) return;
    setFetchingLink(key);
    try {
      const prompt = `Recherche et analyse ce site web pour ${nomEtab} : ${url}\nRÃ©sume en 200 mots max : ce que fait ce site, ses services, son ambiance, pour aider Ã  rÃ©pondre Ã  des emails professionnels.`;
      const sys = "Tu es un assistant qui analyse des sites web pour une brasserie parisienne. RÃ©ponds en franÃ§ais, de faÃ§on concise et utile.";
      const txt = await callClaude(prompt, sys, null, "analyse_lien_web");
      const upd = { ...linksFetched, [key]: { url, summary: txt || "Analyse effectuÃ©e.", fetchedAt: new Date().toLocaleDateString("fr-FR") } };
      setLinksFetched(upd);
      saveToSupabase({ links_fetched: JSON.stringify(upd) });
      toast("AnalysÃ© !");
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setFetchingLink(null);
  };

  const genRelanceIAFn = async (resa: any) => {
    setRelanceIAText(""); setGenRelanceIA(true);
    try {
      const linkedMails = getLinkedEmails(resa);
      // Garder les 3 emails les plus rÃ©cents, corps tronquÃ© Ã  800 chars chacun
      const mailsRecents = linkedMails.slice(0, 3);
      const hist = mailsRecents.length > 0
        ? mailsRecents.map(m => {
            const corps = (m.body || m.snippet || "").slice(0, 800);
            return `---\nDe: ${m.from}\nDate: ${m.date}\nObjet: ${m.subject}\n${corps}${(m.body||"").length > 800 ? "\n[â¦tronquÃ©]" : ""}`;
          }).join("\n\n")
        : "Aucun Ã©change prÃ©cÃ©dent.";

      // Calculer le dernier contact
      const dernierMail = linkedMails.length > 0 ? linkedMails[0] : null;
      const dernierContact = dernierMail
        ? `${dernierMail.date} â "${dernierMail.subject}"`
        : "Aucun Ã©change prÃ©cÃ©dent";

      // Date du jour et dÃ©lai avant Ã©vÃ©nement
      const today = new Date().toLocaleDateString("fr-FR", {day:"2-digit", month:"2-digit", year:"numeric"});
      const statutLabel = statuts.find(s => s.id === (resa.statut || "nouveau"))?.label || resa.statut || "Nouveau";
      const espaceName = ESPACES.find(e => e.id === resa.espaceId)?.nom || "â";

      // Motif final â personnalisÃ© ou sÃ©lectionnÃ©
      const motifFinal = motifSelectionne === "Autre"
        ? (motifPersonnalise || "Relance gÃ©nÃ©rale")
        : (motifSelectionne || "Relance sans motif spÃ©cifique");

      const sys = buildSystemPrompt({nomEtab, adresseEtab, emailEtab, telEtab, espacesDyn});

      const prompt = `Tu dois rÃ©diger un email de relance pour ${nomEtab}.

ââââââââââââââââââââââââââââââ
DOSSIER ÃVÃNEMENT
ââââââââââââââââââââââââââââââ
Client : ${resa.nom || "â"}${resa.entreprise ? " (" + resa.entreprise + ")" : ""}
Email : ${resa.email || "â"}
Type : ${resa.typeEvenement || "â"} | Espace : ${espaceName}
Date Ã©vÃ©nement : ${resa.dateDebut || "non dÃ©finie"} | Horaires : ${resa.heureDebut || "â"} â ${resa.heureFin || "â"}
Personnes : ${resa.nombrePersonnes || "â"} | Budget : ${resa.budget || "non mentionnÃ©"}
Statut actuel : ${statutLabel}
Notes internes : ${resa.notes || "â"}

ââââââââââââââââââââââââââââââ
MISSION PRÃALABLE â ANALYSE DU DOSSIER (silencieuse)
ââââââââââââââââââââââââââââââ
Avant de rÃ©diger, analyse silencieusement :
1. Le statut actuel du dossier : ${statutLabel}
2. Le dernier Ã©change : ${dernierContact}
3. Ce qui est en suspens dans les Ã©changes (rÃ©ponse non reÃ§ue, validation attendue, acompte non confirmÃ©, dÃ©tail non rÃ©solu)
4. Le dÃ©lai restant avant l'Ã©vÃ©nement (${resa.dateDebut || "date inconnue"} vs date du jour ${today})

Le directeur a identifiÃ© le motif suivant : ${motifFinal}
Base ta relance principalement sur ce motif.

En complÃ©ment, si ton analyse rÃ©vÃ¨le d'autres points en suspens importants non couverts par ce motif, mentionne-les subtilement dans l'email sans les imposer. Cela sert de double vÃ©rification bienveillante.

ââââââââââââââââââââââââââââââ
HISTORIQUE DES ÃCHANGES
ââââââââââââââââââââââââââââââ
${hist}

ââââââââââââââââââââââââââââââ
INSTRUCTIONS DE RÃDACTION
ââââââââââââââââââââââââââââââ
- RÃ©dige un email de relance complet
- PremiÃ¨re ligne obligatoirement : Objet: [objet du mail]
- Puis le corps du mail
- Ton chaleureux, professionnel, jamais insistant
- Personnalise selon le profil et l'historique du client
- Appel Ã  l'action clair en fin de mail
- Signature : L'Ã©quipe ${nomEtab}${adresseEtab ? "\n" + adresseEtab : ""}${emailEtab ? "\n" + emailEtab : ""}${telEtab ? "\n" + telEtab : ""}`;

      // Docs exclus volontairement â non nÃ©cessaires pour une relance et trop lourds (PDFs base64)
      const txt = await callClaude(prompt, sys, null, "generation_relance");
      setRelanceIAText(txt);
    } catch (e: any) {
      toast(humanError(e), "err");
      setShowRelanceIA(null);
    }
    setGenRelanceIA(false);
  };

  const generateNoteIA = async (resa: any) => {
    setGenNoteIA(resa.id);
    try {
      const linkedMails = getLinkedEmails(resa);
      const hist = linkedMails.length > 0
        ? linkedMails.map(m => `---\nDe: ${m.from} <${m.fromEmail}>\nObjet: ${m.subject}\n${m.body || m.snippet || ""}`).join("\n\n")
        : "Aucun Ã©change email trouvÃ© pour cet Ã©vÃ©nement.";
      const espaceName = ESPACES.find(e => e.id === resa.espaceId)?.nom || "â";
      const statutLabel = statuts.find(s => s.id === (resa.statut || "nouveau"))?.label || resa.statut || "â";
      const prompt = `DOSSIER ÃVÃNEMENT :
Nom : ${resa.nom || "â"}${resa.entreprise ? " (" + resa.entreprise + ")" : ""}
Email : ${resa.email || "â"} | TÃ©l : ${resa.telephone || "â"}
Type : ${resa.typeEvenement || "â"} | Date : ${resa.dateDebut || "â"} | Horaires : ${resa.heureDebut || "â"} â ${resa.heureFin || "â"}
Espace : ${espaceName} | Personnes : ${resa.nombrePersonnes || "â"} | Budget : ${resa.budget || "â"}
Statut : ${statutLabel}
Notes internes : ${resa.notes || "â"}

ÃCHANGES EMAILS :
${hist}`;

      const sys = `Tu es un coordinateur Ã©vÃ©nementiel senior chez ${nomEtab}, expert dans la lecture et l'analyse d'Ã©changes clients. Tu as lu l'intÃ©gralitÃ© des emails de ce dossier.

RÃ©dige une note de briefing destinÃ©e au directeur de ${nomEtab}. Cette note a deux niveaux de lecture distincts.

ââââââââââââââââââââââââââââââ
NIVEAU 1 â FICHE ÃVÃNEMENT (faits bruts)
ââââââââââââââââââââââââââââââ

SynthÃ©tise les informations factuelles confirmÃ©es :
- Interlocuteur : nom, email, tÃ©lÃ©phone, entreprise si applicable
- Type d'Ã©vÃ©nement
- Date et horaires (arrivÃ©e / fin)
- Espace rÃ©servÃ©
- Nombre de personnes (min / max si fourchette)
- Prestations demandÃ©es (restauration, sono, dÃ©coration, etc.)
- Budget mentionnÃ© ou budget indicatif
- Statut actuel du dossier

ââââââââââââââââââââââââââââââ
NIVEAU 2 â ANALYSE PERSONNALISÃE â ï¸ PRIORITÃ HAUTE
ââââââââââââââââââââââââââââââ

C'est la partie la plus importante de cette note. Elle ne se substitue pas aux faits â elle les dÃ©passe.

Analyse les Ã©changes en profondeur et rÃ©ponds Ã  ces questions :

PROFIL CLIENT
â Quel type de client est-ce ? (professionnel aguerri, particulier stressÃ©, client exigeant, organisateur expÃ©rimentÃ©, premier Ã©vÃ©nement, etc.)
â Quel est son niveau d'implication et d'exigence perÃ§u dans les Ã©changes ?
â Y a-t-il des signaux d'inquiÃ©tude, d'hÃ©sitation ou au contraire de grande confiance ?

DEMANDES PARTICULIÃRES & HORS CADRE
â Quelles sont les demandes qui sortent du cadre standard de ${nomEtab} ? (dÃ©coration, contraintes alimentaires, exigences techniques, flexibilitÃ© horaires, etc.)
â Y a-t-il des points non rÃ©solus ou en attente de confirmation dans les Ã©changes ?
â Des promesses ou engagements ont-ils Ã©tÃ© pris dans les emails ? Lesquels exactement ?

POINTS DE VIGILANCE
â Quels sont les risques ou points de friction potentiels ? (malentendu sur un tarif, attente irrÃ©aliste, dÃ©lai serrÃ©, dÃ©tail oubliÃ©)
â Y a-t-il des non-dits ou des sous-entendus importants Ã  interprÃ©ter ?

INFORMATIONS MANQUANTES
â Liste explicitement les informations cruciales absentes des Ã©changes et Ã  obtenir impÃ©rativement avant de confirmer (budget, date dÃ©finitive, nombre exact de personnes, choix du menu, acompte, etc.)

RECOMMANDATION DIRECTEUR
â En 2-3 phrases maximum : ce que le directeur doit absolument savoir avant de rencontrer ou recontacter ce client. Le ton, l'Ã©tat d'esprit, ce qui compte vraiment pour lui.

ââââââââââââââââââââââââââââââ
FORMAT
ââââââââââââââââââââââââââââââ

- Bullet points pour le Niveau 1
- Paragraphes courts et directs pour le Niveau 2
- Pas de formules de politesse
- Pas d'informations inventÃ©es : si un Ã©lÃ©ment est absent des Ã©changes, indique "non mentionnÃ©" plutÃ´t que de supposer
- Longueur totale : aussi longue que nÃ©cessaire pour le Niveau 2 â ne sacrifie jamais la profondeur d'analyse par souci de concision`;
      const txt = await callClaude(prompt, sys, null, "note_briefing");
      const upd = { ...noteIA, [resa.id]: { text: txt, date: new Date().toLocaleDateString("fr-FR") } };
      saveNoteIA(upd);
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setGenNoteIA(null);
  };

  const genRadarReply = async (m: any) => {
    setRadarReplyLoading(true);
    setRadarReplyText("");
    try {
      // Utilise l'extraction dÃ©jÃ  faite si disponible (zÃ©ro travail en double)
      const cachedExtractedRadar = repliesCache[m.id]?.extracted || null;
      const signature = ["Cordialement,", `L'Ã©quipe ${nomEtab || "l'Ã©tablissement"}`, adresseEtab, emailEtab, telEtab].filter(Boolean).join("\n");

      const sourcesRadar = [
        menusCtx ? `  <menus>\n${menusCtx.slice(0, 15000)}\n  </menus>` : "",
        conditionsCtx ? `  <conditions>\n${conditionsCtx.slice(0, 8000)}\n  </conditions>` : "",
        espacesCtx ? `  <espaces>\n${espacesCtx.slice(0, 8000)}\n  </espaces>` : "",
        tonCtx ? `  <regles_ton>\n${tonCtx.slice(0, 5000)}\n  </regles_ton>` : "",
      ].filter(Boolean).join("\n\n");
      const sourcesBlockRadar = sourcesRadar ? `\n\n<sources_archange>\n${sourcesRadar}\n</sources_archange>` : "";

      const sys = buildSystemPrompt({nomEtab, adresseEtab, emailEtab, telEtab, espacesDyn}) + sourcesBlockRadar;

      const userMsg = buildResponseMessage({
        email: m,
        extracted: cachedExtractedRadar,
        historiqueMails: [],
        signature,
      });

      const rep = await callClaude(userMsg, sys, null, "generation_radar_reply");
      setRadarReplyText(rep || "");
    } catch(e: any) {
      toast(humanError(e), "err");
    }
    setRadarReplyLoading(false);
  };

  const openSendMail = (resa) => {
    setShowSendMail(resa);
    setSendMailSubject(`Votre Ã©vÃ©nement chez ${nomEtab} â ${resa.typeEvenement||""}`);
    setSendMailBody("");
  };

  const fmt = s => s>1048576?(s/1048576).toFixed(1)+" Mo":Math.round(s/1024)+" Ko";

  // Split un nom complet en {prenom, nom} pour rÃ©trocompatibilitÃ© des anciennes rÃ©sas
  const splitNomPrenom = (r: any) => {
    if (r.prenom) return { prenom: r.prenom, nom: r.nom || "" };
    const full = (r.nom || "").trim();
    if (!full) return { prenom: "", nom: "" };
    const parts = full.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { prenom: "", nom: parts[0] };
    return { prenom: parts[0], nom: parts.slice(1).join(" ") };
  };
  const displayNom = (r: any) => {
    const { prenom, nom } = splitNomPrenom(r);
    return [prenom, nom].filter(Boolean).join(" ") || "â";
  };

  // âââ Helpers vue ÃvÃ©nements v3 âââ
  const computeEventsKPIs = React.useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const ago72h = new Date(); ago72h.setHours(ago72h.getHours() - 72);
    const todayStr = today.toISOString().slice(0,10);

    const cetteSemaine = resas.filter(r => {
      if (!r.dateDebut) return false;
      try { const d = new Date(r.dateDebut); return d >= today && d <= in7; } catch { return false; }
    });
    const enRetard = relances.filter(r => r.date && r.date < todayStr);
    const nouvelles = resas.filter(r => {
      const statut = r.statut || "nouveau";
      const st = statuts.find(s => s.id === statut);
      const isNouveau = statut === "nouveau" || (st && st.label.toLowerCase().includes("nouveau"));
      return isNouveau;
    });

    // CA prÃ©visionnel : somme des budgets des rÃ©sas confirmÃ©es/en cours du mois courant
    const thisMonth = today.getMonth(), thisYear = today.getFullYear();
    let totalBudget = 0;
    resas.forEach(r => {
      if (!r.dateDebut) return;
      try {
        const d = new Date(r.dateDebut);
        if (d.getMonth() !== thisMonth || d.getFullYear() !== thisYear) return;
      } catch { return; }
      const statut = r.statut || "nouveau";
      const st = statuts.find(s => s.id === statut);
      const isValid = st && (st.label.toLowerCase().includes("confirm") || st.label.toLowerCase().includes("valid") || st.label.toLowerCase().includes("en cours") || st.label.toLowerCase().includes("devis"));
      if (!isValid) return;
      const match = String(r.budget || "").match(/(\d[\d\s]*)/);
      if (match) {
        const n = parseInt(match[1].replace(/\s/g, ''), 10);
        if (!isNaN(n) && n > 0 && n < 1000000) totalBudget += n;
      }
    });
    return { cetteSemaine, enRetard, aRelancerTotal: relances.length, nouvelles, totalBudget };
  }, [resas, relances, statuts]);

  const computePlanningKPIs = (monthDate: Date) => {
    const m = monthDate.getMonth(), y = monthDate.getFullYear();
    const daysInM = new Date(y, m+1, 0).getDate();
    const todayISO = new Date().toISOString().slice(0,10);
    const monthResas = resas.filter(r => {
      if (!r.dateDebut) return false;
      try { const d = new Date(r.dateDebut); return d.getMonth()===m && d.getFullYear()===y; } catch { return false; }
    });
    // Jours uniques avec au moins 1 Ã©vÃ©nement
    const uniqueDays = new Set(monthResas.map(r => r.dateDebut)).size;
    const occupation = Math.round((uniqueDays / daysInM) * 100);
    // ConfirmÃ©s = statut label contient "confirm"/"valid"
    const confirmed = monthResas.filter(r => {
      const st = statuts.find(s=>s.id===(r.statut||"nouveau"));
      return st && (st.label.toLowerCase().includes("confirm") || st.label.toLowerCase().includes("valid"));
    }).length;
    // Prochain Ã©vÃ©nement
    const upcoming = resas
      .filter(r => r.dateDebut && r.dateDebut >= todayISO)
      .sort((a,b) => (a.dateDebut||"").localeCompare(b.dateDebut||"") || (a.heureDebut||"").localeCompare(b.heureDebut||""))[0];
    // Budget prÃ©visionnel : confirmÃ©s + en cours + devis
    let totalBudget = 0;
    monthResas.forEach(r => {
      const st = statuts.find(s=>s.id===(r.statut||"nouveau"));
      const isValid = st && (st.label.toLowerCase().includes("confirm") || st.label.toLowerCase().includes("valid") || st.label.toLowerCase().includes("en cours") || st.label.toLowerCase().includes("devis"));
      if (!isValid) return;
      const match = String(r.budget||"").match(/(\d[\d\s]*)/);
      if (match) {
        const n = parseInt(match[1].replace(/\s/g,''), 10);
        if (!isNaN(n) && n > 0 && n < 1000000) totalBudget += n;
      }
    });
    return { total: monthResas.length, confirmed, uniqueDays, daysInM, occupation, upcoming, totalBudget };
  };

  const groupResasByUrgency = (list: any[]) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const groups = { cetteSemaine: [] as any[], nouvelles: [] as any[], enCours: [] as any[], confirmees: [] as any[] };
    list.forEach(r => {
      const d = r.dateDebut ? (()=>{try{return new Date(r.dateDebut);}catch{return null;}})() : null;
      const isThisWeek = d && d >= today && d <= in7;
      const statut = r.statut || "nouveau";
      const st = statuts.find(s => s.id === statut);
      const isNouveau = statut === "nouveau" || (st && st.label.toLowerCase().includes("nouveau"));
      const isConfirmed = st && (st.label.toLowerCase().includes("confirm") || st.label.toLowerCase().includes("valid"));
      if (isThisWeek) groups.cetteSemaine.push(r);
      else if (isNouveau) groups.nouvelles.push(r);
      else if (isConfirmed) groups.confirmees.push(r);
      else groups.enCours.push(r);
    });
    return groups;
  };

  const fmtDateFr = (s: string) => {
    if (!s) return "";
    const d = new Date(s + "T12:00:00");
    if (isNaN(d.getTime())) return s;
    return d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear();
  };

  const mailListRef = useRef<HTMLDivElement>(null);

  const toggleUnread = (id: string) => {
    const email = emails.find(m => m.id === id);
    if (!email) return;
    const newUnread = !email.unread;
    // Optimiste local
    setEmails(prev => prev.map(m => m.id === id ? { ...m, unread: newUnread } : m));
    if (sel?.id === id) setSel((prev: any) => prev ? { ...prev, unread: newUnread } : prev);
    // Bidirectionnel Gmail â avec rollback si Ã©chec
    if (email.gmailId) {
      apiFetch("/api/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail_id: email.gmailId, action: newUnread ? "unread" : "read" }),
      }).catch(() => {
        // Rollback si Gmail Ã©choue
        setEmails(prev => prev.map(m => m.id === id ? { ...m, unread: email.unread } : m));
        if (sel?.id === id) setSel((prev: any) => prev ? { ...prev, unread: email.unread } : prev);
        toast("Erreur synchronisation Gmail â rÃ©essayez", "err");
      });
    }
  };

  const total=resas.length, conf=resas.filter(r=>r.statut==="confirme").length, att=resas.filter(r=>r.statut==="en_attente"||r.statut==="nouveau"||r.statut==="en_cours").length;
  const taux=total>0?Math.round(conf/total*100):0;
  const parEspace=ESPACES.map(e=>({...e,n:resas.filter(r=>r.espaceId===e.id).length,c:resas.filter(r=>r.espaceId===e.id&&r.statut==="confirme").length}));
  const parType=TYPES_EVT.map(t=>({t,n:resas.filter(r=>r.typeEvenement===t).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
  const maxN=Math.max(...parEspace.map(e=>e.n),1);
  const srcActives = React.useMemo(
    () => Object.values(linksFetched).filter(Boolean).length
      + (menusCtx ? 1 : 0)
      + (conditionsCtx ? 1 : 0)
      + (espacesCtx ? 1 : 0)
      + (tonCtx ? 1 : 0)
      + (customCtx ? 1 : 0),
    [linksFetched, menusCtx, conditionsCtx, espacesCtx, tonCtx, customCtx]
  );

  // âââ IcÃ´nes SVG CÃ©leste pour la navigation ââââââââââââââââââââââââââââââââââ
  const NavIcon = ({id, active}: {id:string, active:boolean}) => {
    const c = active ? "#1A1A1E" : "#6B6E7E";
    const icons: Record<string, JSX.Element> = {
      // ÃvÃ©nements â calendrier avec Ã©toile
      general: <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="12" rx="1" stroke={c} strokeWidth="1.1"/>
        <path d="M1.5 6h13" stroke={c} strokeWidth="1.1"/>
        <path d="M5 1v3M11 1v3" stroke={c} strokeWidth="1.1" strokeLinecap="round"/>
        <path d="M8 9l.8 1.6L11 11l-1.5 1.4.3 2L8 13.5l-1.8.9.3-2L5 11l2.2-.4L8 9z" fill={active?"#B8924F":"none"} stroke="#B8924F" strokeWidth="0.8"/>
      </svg>,
      // Mails â enveloppe avec sceau
      mails: <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="3.5" width="13" height="9" rx="1" stroke={c} strokeWidth="1.1"/>
        <path d="M1.5 4.5l6.5 5 6.5-5" stroke={c} strokeWidth="1.1" strokeLinecap="round"/>
      </svg>,
      // Planning â grille semaine
      planning: <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="1.5" width="6" height="6" rx="0.8" stroke={c} strokeWidth="1.1"/>
        <rect x="8.5" y="1.5" width="6" height="6" rx="0.8" stroke={c} strokeWidth="1.1"/>
        <rect x="1.5" y="8.5" width="6" height="6" rx="0.8" stroke={c} strokeWidth="1.1"/>
        <rect x="8.5" y="8.5" width="6" height="6" rx="0.8" stroke={active?"#B8924F":c} strokeWidth="1.1" fill={active?"rgba(184,146,79,0.1)":"none"}/>
      </svg>,
      // Stats â lignes ascendantes
      stats: <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M2 12l3.5-4 3 2 3-5 2.5 3" stroke={active?"#B8924F":c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 14h12" stroke={c} strokeWidth="1.1" strokeLinecap="round"/>
      </svg>,
      // Sources IA â sceau Archange miniature
      sources: <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke={active?"#B8924F":c} strokeWidth="1.1"/>
        <path d="M5.5 6.5L10.5 6.5" stroke="#B8924F" strokeWidth="1" strokeLinecap="round"/>
        <circle cx="8" cy="5" r="0.8" fill="#B8924F"/>
        <path d="M8 7v5" stroke="#B8924F" strokeWidth="1" strokeLinecap="round"/>
        <path d="M7 11.5L8 12.5L9 11.5" fill="#B8924F"/>
      </svg>,
    };
    return icons[id] || <span style={{fontSize:13}}>{id[0].toUpperCase()}</span>;
  };

  const NAV=[
    {id:"general",  label:"ÃvÃ©nements", badge:resas.filter(r=>r.statut==="nouveau"||!r.statut).length||null},
    {id:"mails",    label:"Mails",       badge:emails.filter(m=>m.unread).length||null},
    {id:"planning", label:"Planning"},
    {id:"stats",    label:"Stats"},
    {id:"sources",  label:"Sources ARCHANGE",  badge:(!menusCtx&&!conditionsCtx&&!tonCtx&&!espacesCtx)?"!":null},
  ];

  const inp = {padding:"8px 12px",borderRadius:3,border:"1px solid #EBEAE5",background:"#F5F4F0",color:"#1A1A1E",fontSize:13,width:"100%",outline:"none",transition:"border-color .15s",fontFamily:"'Geist','system-ui',sans-serif"};
  const inpLight = {padding:"8px 12px",borderRadius:3,border:"1px solid #EBEAE5",background:"#FAFAF7",color:"#1A1A1E",fontSize:13,width:"100%",fontFamily:"'Geist','system-ui',sans-serif"};
  const gold = {padding:"8px 18px",borderRadius:3,border:"none",background:"#1A1A1E",color:"#F5F4F0",fontWeight:500,fontSize:12,cursor:"pointer",letterSpacing:"0.04em",fontFamily:"'Geist','system-ui',sans-serif"};
  const out  = {padding:"7px 14px",borderRadius:3,border:"1px solid #EBEAE5",background:"transparent",color:"#4A4A52",fontSize:12,cursor:"pointer",letterSpacing:"0.02em",fontFamily:"'Geist','system-ui',sans-serif"};
  const outLight = {padding:"7px 14px",borderRadius:3,border:"1px solid #EBEAE5",background:"transparent",color:"#4A4A52",fontSize:12,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif"};

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",fontFamily:"'Geist','system-ui',sans-serif",background:"#F5F4F0"}}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Geist:wght@300;400;500;600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#E0DED7;border-radius:10px;}::-webkit-scrollbar-thumb:hover{background:#B8924F;}.mail-row:hover .mail-actions{opacity:1!important}.mail-row:hover .mail-checkbox{opacity:1!important}.celeste-nav-btn:hover{background:#EBEAE5!important;}.fade-in{animation:fadeIn .25s ease}@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}.snooze-wrap:hover .snooze-menu{display:block!important}.snooze-menu button:hover{background:#FAFAF7!important}.celeste-email-item:hover{background:#FAFAF7!important}.plan-statut-wrap>div>button:hover{background:#FAFAF7!important}@keyframes celesteBlink{0%,50%{opacity:1}51%,100%{opacity:0}}"}</style>

      {/* Ãcran de chargement initial */}
      {initializing && (
        <div style={{position:"fixed",inset:0,background:"#1A1A1E",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,zIndex:9999}}>
          <div style={{fontSize:11,fontWeight:700,color:"#1A1A1E",letterSpacing:"0.28em",textTransform:"uppercase"}}>ARCHANGE</div>
          <div style={{fontSize:8,color:"#6B6E7E",letterSpacing:"0.18em",textTransform:"uppercase",marginTop:-8}}>{nomEtab} Â· AGENT ARCHANGE</div>
          <Spin s={18}/>
          <div style={{fontSize:11,color:"#6B6E7E",letterSpacing:"0.08em"}}>Chargement en coursâ¦</div>
        </div>
      )}

      {notif && <div style={{position:"fixed",bottom:32,left:"50%",transform:"translateX(-50%)",zIndex:9999,padding:"12px 24px",borderRadius:12,background:notif.type==="err"?"#2D0A0A":notif.type==="undo"?"#1A1A1E":"#1F2E1A",color:notif.type==="err"?"#FCA5A5":notif.type==="undo"?"#E0DED7":"#6EE7B7",fontSize:13,fontWeight:500,whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,.25)",letterSpacing:"0.01em",border:notif.type==="err"?"1px solid rgba(239,68,68,.2)":notif.type==="undo"?"1px solid rgba(209,196,178,.2)":"1px solid rgba(52,211,153,.2)",display:"flex",alignItems:"center",gap:12}}>
        <span>{notif.msg}</span>
        {notif.type==="undo"&&undoDelete&&<button onClick={()=>{
          if(undoDelete.timer) clearTimeout(undoDelete.timer);
          saveEmails([undoDelete.email,...emails]);
          setUndoDelete(null); setNotif(null);
          toast("Email restaurÃ© â");
        }} style={{fontSize:12,fontWeight:700,color:"#B8924F",background:"none",border:"1px solid rgba(184,146,79,.4)",borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>Annuler</button>}
      </div>}

      {/* ââ Modal raccourcis clavier ââ */}
      {showKeyHelp&&(
        <div onClick={()=>setShowKeyHelp(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:9990,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",borderRadius:16,padding:"28px 32px",minWidth:340,boxShadow:"0 24px 64px rgba(0,0,0,.2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700,color:"#1A1A1E"}}>â¨ï¸ Raccourcis clavier</div>
              <button onClick={()=>setShowKeyHelp(false)} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#6B6E7E"}}>Ã</button>
            </div>
            {[
              ["/","Rechercher"],["J / K","Email suivant / prÃ©cÃ©dent"],["R","RÃ©pondre"],
              ["F","TransfÃ©rer"],["E","Archiver"],["U","Marquer lu / non lu"],
              ["S","Ãtoile"],["#","Supprimer"],["Del","Supprimer"],["?","Afficher cette aide"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #F5F4F0"}}>
                <span style={{fontSize:12,color:"#6B6E7E"}}>{v}</span>
                <kbd style={{fontSize:11,background:"#F5F4F0",border:"1px solid #EBEAE5",borderRadius:5,padding:"2px 8px",color:"#1A1A1E",fontFamily:"monospace",fontWeight:600}}>{k}</kbd>
              </div>
            ))}
            <div style={{fontSize:11,color:"#6B6E7E",marginTop:12,textAlign:"center"}}>Appuie sur ? ou Ãchap pour fermer</div>
          </div>
        </div>
      )}

      {/* ââ Indicateur de sauvegarde ââ */}
      {saveIndicator&&<div style={{position:"fixed",top:12,right:16,zIndex:9998,padding:"5px 12px",borderRadius:20,background:"#1F2E1A",color:"#6EE7B7",fontSize:11,fontWeight:600,letterSpacing:"0.04em",border:"1px solid rgba(52,211,153,.2)",pointerEvents:"none"}}>â SauvegardÃ©</div>}
      {Object.keys(offlineQueue).length>0&&<div style={{position:"fixed",top:12,right:16,zIndex:9998,padding:"5px 12px",borderRadius:20,background:"#431407",color:"#FED7AA",fontSize:11,fontWeight:600,letterSpacing:"0.04em",border:"1px solid rgba(251,146,60,.2)",cursor:"default"}} title="Les modifications seront sauvegardÃ©es dÃ¨s le retour de connexion">â  Non sauvegardÃ©</div>}

      {/* ââ Indicateur usage API ARCHANGE â discret en bas Ã  droite ââ */}
      {apiStatsView.totalCalls > 0 && (
        <div style={{position:"fixed",bottom:12,right:16,zIndex:9998}}>
          <button
            onClick={()=>setApiStatsOpen(v=>!v)}
            title="DÃ©tails de l'usage ARCHANGE"
            style={{
              padding:"6px 12px",
              borderRadius:20,
              background:"rgba(255,255,255,0.92)",
              backdropFilter:"blur(8px)",
              WebkitBackdropFilter:"blur(8px)",
              color:"#B8924F",
              fontSize:10.5,
              fontWeight:500,
              letterSpacing:"0.02em",
              border:"1px solid rgba(184,146,79,0.28)",
              cursor:"pointer",
              fontFamily:"'Geist','system-ui',sans-serif",
              fontVariantNumeric:"tabular-nums",
              boxShadow:"0 2px 6px rgba(184,146,79,0.1)",
            }}
          >
            â¦ {apiStatsView.totalCalls} appel{apiStatsView.totalCalls>1?"s":""} Â· ${apiStatsView.totalCostUSD.toFixed(4)}
          </button>
          {apiStatsOpen && (
            <div style={{
              position:"absolute",
              bottom:"calc(100% + 6px)",
              right:0,
              minWidth:280,
              padding:"14px 16px",
              borderRadius:12,
              background:"#FFFFFF",
              border:"1px solid rgba(184,146,79,0.22)",
              boxShadow:"0 8px 24px rgba(184,146,79,0.12)",
              fontSize:12,
              color:"#1A1A1E",
              fontFamily:"'Geist','system-ui',sans-serif",
            }}>
              <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14,fontWeight:500,marginBottom:10,color:"#1A1A1E",letterSpacing:"-0.01em"}}>
                Usage ARCHANGE â session
              </div>
              <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:"6px 14px",fontVariantNumeric:"tabular-nums"}}>
                <span style={{color:"#6B6E7E"}}>Appels API :</span>
                <span style={{textAlign:"right",fontWeight:500}}>{apiStatsView.totalCalls}</span>
                <span style={{color:"#6B6E7E"}}>Tokens entrÃ©e :</span>
                <span style={{textAlign:"right",fontWeight:500}}>{apiStatsView.totalInputTokens.toLocaleString("fr-FR")}</span>
                <span style={{color:"#6B6E7E"}}>Tokens sortie :</span>
                <span style={{textAlign:"right",fontWeight:500}}>{apiStatsView.totalOutputTokens.toLocaleString("fr-FR")}</span>
                <span style={{color:"#6B6E7E",borderTop:"1px solid rgba(184,146,79,0.15)",paddingTop:6}}>CoÃ»t session :</span>
                <span style={{textAlign:"right",fontWeight:600,color:"#B8924F",borderTop:"1px solid rgba(184,146,79,0.15)",paddingTop:6}}>${apiStatsView.totalCostUSD.toFixed(4)}</span>
                <span style={{color:"#6B6E7E"}}>CoÃ»t en â¬ (~) :</span>
                <span style={{textAlign:"right",fontWeight:500}}>â {(apiStatsView.totalCostUSD * 0.92).toFixed(4)} â¬</span>
              </div>
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(184,146,79,0.15)",fontSize:11,color:"#A5A4A0",lineHeight:1.4}}>
                Compteur depuis le chargement de la page. Tarif Claude Sonnet 4 : $3/M tokens entrÃ©e, $15/M sortie.
              </div>
              <button onClick={()=>setApiStatsOpen(false)} style={{marginTop:8,width:"100%",padding:"6px 0",background:"none",border:"1px solid rgba(184,146,79,0.22)",borderRadius:6,color:"#6B6E7E",fontFamily:"inherit",fontSize:11,cursor:"pointer"}}>
                Fermer
              </button>
            </div>
          )}
        </div>
      )}

      {/* bandeau alerteUrgente supprimÃ© */}

      {/* Nav principale â CÃ©leste */}
      <aside style={{width:navCollapsed?52:220,background:"#FAFAF7",display:"flex",flexDirection:"column",flexShrink:0,transition:"width .3s cubic-bezier(.4,0,.2,1)",overflow:"hidden",borderRight:"1px solid #EBEAE5"}}>
        <div style={{padding:navCollapsed?"14px 0 12px":"18px 18px 14px",display:"flex",alignItems:"center",justifyContent:navCollapsed?"center":"space-between",flexShrink:0,borderBottom:"1px solid #EBEAE5"}}>
          {!navCollapsed&&<div style={{display:"flex",alignItems:"center",gap:9}}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
              <circle cx="12" cy="12" r="11" stroke="#B8924F" strokeWidth="1"/>
              <path d="M12 9 C 9.5 9, 7 9.5, 5 10.5 C 6.8 10.8, 8.5 10.7, 10.5 10.2" stroke="#B8924F" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
              <path d="M12 9 C 14.5 9, 17 9.5, 19 10.5 C 17.2 10.8, 15.5 10.7, 13.5 10.2" stroke="#B8924F" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
              <path d="M8.5 9 L 15.5 9" stroke="#B8924F" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="12" cy="7" r="1.1" fill="#B8924F"/>
              <path d="M12 9.6 L 12 18.2" stroke="#B8924F" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M10.8 17.8 L 12 19.2 L 13.2 17.8 Z" fill="#B8924F"/>
            </svg>
            <div>
              <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:19,fontWeight:500,color:"#1A1A1E",letterSpacing:0.3,lineHeight:1}}>Archange</div>
              <div style={{fontSize:9,letterSpacing:"0.16em",textTransform:"uppercase",color:"#6B6E7E",marginTop:2}}>{nomEtab}</div>
            </div>
          </div>}
          {navCollapsed&&<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" stroke="#B8924F" strokeWidth="1"/><path d="M8.5 9 L 15.5 9" stroke="#B8924F" strokeWidth="1.2" strokeLinecap="round"/><circle cx="12" cy="7" r="1.1" fill="#B8924F"/><path d="M12 9.6 L 12 18.2" stroke="#B8924F" strokeWidth="1.2" strokeLinecap="round"/><path d="M10.8 17.8 L 12 19.2 L 13.2 17.8 Z" fill="#B8924F"/></svg>}
          <button onClick={()=>setNavCollapsed(v=>!v)} title={navCollapsed?"Agrandir":"RÃ©duire"} style={{width:20,height:20,borderRadius:2,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:navCollapsed?0:6}}>
            {navCollapsed?"âº":"â¹"}
          </button>
        </div>
        <div style={{flex:1,padding:navCollapsed?"6px 5px":"8px 8px",display:"flex",flexDirection:"column",gap:1,overflowY:"auto"}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>{setView(n.id);setSubCollapsed(false);}} title={navCollapsed?n.label:undefined} className="celeste-nav-btn" style={{display:"flex",alignItems:"center",gap:navCollapsed?0:9,width:"100%",padding:navCollapsed?"10px 0":"7px 10px",borderRadius:3,border:"none",background:view===n.id?"#F5F4F0":"transparent",color:view===n.id?"#1A1A1E":"#4A4A52",fontSize:12,textAlign:"left",cursor:"pointer",justifyContent:navCollapsed?"center":"flex-start",position:"relative",transition:"all .12s",letterSpacing:"0.03em",fontWeight:view===n.id?500:400,fontFamily:"'Geist','system-ui',sans-serif"}}>
              <NavIcon id={n.id} active={view===n.id}/>
              {!navCollapsed&&<><span style={{flex:1}}>{n.label}</span>{n.badge>0&&<span style={{fontSize:10,background:view===n.id?"rgba(184,146,79,0.12)":"rgba(27,30,43,0.06)",color:view===n.id?"#B8924F":"#6B6E7E",padding:"1px 5px",borderRadius:2,fontWeight:500}}>{n.badge}</span>}</>}
              {navCollapsed&&n.badge>0&&<span style={{position:"absolute",top:5,right:5,width:5,height:5,borderRadius:"50%",background:"#B8924F"}}/>}
            </button>
          ))}
        </div>
        {!navCollapsed&&<div style={{padding:"12px 14px",borderTop:"1px solid #EBEAE5",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:"#1A1A1E",color:"#F5F4F0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:500,flexShrink:0}}>
              {(session?.user?.name||"?")[0].toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontWeight:500,color:"#1A1A1E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session?.user?.name||"Directeur"}</div>
              <button onClick={()=>signOut({callbackUrl:"/"})} style={{fontSize:9.5,color:"#6B6E7E",background:"none",border:"none",cursor:"pointer",padding:0,letterSpacing:"0.05em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>â DÃ©connexion</button>
            </div>
          </div>
        </div>}
      </aside>

      <main style={{flex:1,display:"flex",overflow:"hidden",minWidth:0}}>

        {/* ââ ÃVÃNEMENTS v3 â Apple Mail 2026 ââ */}
        {view==="general" && (()=>{
          const kpi = computeEventsKPIs;
          // Filtrage par recherche
          const q = searchEvt.toLowerCase();
          const matchesSearch = (r: any) => !q || r.nom?.toLowerCase().includes(q) || r.entreprise?.toLowerCase().includes(q) || r.typeEvenement?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.dateDebut?.includes(q);
          // Filtrage par statut (multi-select) â Point 2
          const inStatusFilter = (r: any) => {
            // Cas "Relances" traitÃ© sÃ©parÃ©ment via generalFilter (onglet spÃ©cial sidebar)
            if (generalFilter === "arelancer") return true;
            // Si aucun filtre multi actif ET generalFilter="all" â tous les statuts
            if (filtresStatutsEvents.length === 0) return true;
            // Sinon : l'Ã©vÃ©nement doit avoir l'un des statuts cochÃ©s
            return filtresStatutsEvents.includes(r.statut || "nouveau");
          };
          const filteredResas = resas.filter(r => matchesSearch(r) && inStatusFilter(r));
          // Styles communs
          const chipStyle:any = {display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,color:"#6B6B72",background:"#F5F4F0",padding:"3px 9px",borderRadius:6,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.005em",whiteSpace:"nowrap"};
          const chipMoney:any = {...chipStyle,background:"#F4EEDF",color:"#B8924F",fontWeight:500};
          const chipFaint:any = {...chipStyle,opacity:0.6};
          const iconSvg = (path: string, size=11) => <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><g dangerouslySetInnerHTML={{__html: path}}/></svg>;
          const IcCal = () => <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 5.5h11" stroke="currentColor" strokeWidth="1.3"/></svg>;
          const IcClock = () => <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.3"/></svg>;
          const IcPeople = () => <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
          const IcPin = () => <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><path d="M7 12.5s3.8-3.4 3.8-7A3.8 3.8 0 107 1.7c0 3.5 3.8 7 3.8 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7" cy="5.3" r="1.3" stroke="currentColor" strokeWidth="1.3"/></svg>;
          const IcMail = () => <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{opacity:0.6}}><path d="M1 4l6 4.5L13 4M1 3.5h12v7H1z" stroke="currentColor" strokeWidth="1.2"/></svg>;

          // Composant carte Ã©vÃ©nement rÃ©utilisable
          const EventCard = ({r, relance}: {r: any, relance?: any}) => {
            const st = statuts.find(s=>s.id===(r.statut||"nouveau"))||statuts[0]||{bg:"#F5F4F0",color:"#6B6B72",label:"â"};
            const linkedEmails = getLinkedEmails(r);
            const espace = espacesDyn.find(e=>e.id===r.espaceId);
            const isActive = selResaGeneral?.id===r.id;
            const today = new Date(); today.setHours(0,0,0,0);
            const isOverdue = relance && relance.date < today.toISOString().slice(0,10);
            const daysOverdue = relance && isOverdue ? Math.floor((today.getTime() - new Date(relance.date).getTime())/86400000) : 0;
            return (
              <div key={r.id+(relance?"-"+relance.id:"")} onClick={()=>setSelResaGeneral(r)} style={{background:"#FFFFFF",border:`1px solid ${isActive?"rgba(184,146,79,0.35)":"#EBEAE5"}`,borderRadius:12,padding:"14px 16px",marginBottom:8,cursor:"pointer",transition:"all .14s ease",display:"flex",alignItems:"center",gap:14,boxShadow:isActive?"0 0 0 3px rgba(184,146,79,0.08), 0 1px 3px rgba(15,15,20,0.06)":"0 1px 2px rgba(15,15,20,0.04)",position:"relative"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:st.color,flexShrink:0}}/>
                <Avatar name={r.nom||"?"} size={38}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:5}}>
                    <div style={{fontSize:13.5,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.005em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:"'Geist','system-ui',sans-serif"}}>{r.nom||"â"}</div>
                    {r.entreprise&&<div style={{fontSize:12,color:"#6B6B72",whiteSpace:"nowrap",fontFamily:"'Geist','system-ui',sans-serif"}}>Â· {r.entreprise}</div>}
                    {isOverdue&&<span style={{fontSize:10,fontWeight:500,color:"#A84B45",background:"#FAEDEB",padding:"2px 8px",borderRadius:4,textTransform:"uppercase",letterSpacing:"0.06em",marginLeft:6,display:"inline-flex",alignItems:"center",gap:4,fontFamily:"'Geist','system-ui',sans-serif"}}>{daysOverdue} jour{daysOverdue>1?"s":""} de retard</span>}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",fontFamily:"'Geist','system-ui',sans-serif"}}>
                    {r.dateDebut&&<span style={chipStyle}><IcCal/>{fmtDateFr(r.dateDebut)}</span>}
                    {(r.heureDebut||r.heureFin)&&<span style={chipStyle}><IcClock/>{r.heureDebut||"?"}{r.heureFin?"â"+r.heureFin:""}</span>}
                    {r.nombrePersonnes&&<span style={chipStyle}><IcPeople/>{r.nombrePersonnes} pers.</span>}
                    <span style={espace?chipStyle:chipFaint}><IcPin/>{espace?.nom||"Espace Ã  dÃ©finir"}</span>
                    {r.budget&&<span style={chipMoney}>{r.budget}</span>}
                    {r.typeEvenement&&<span style={chipStyle}>{r.typeEvenement}</span>}
                  </div>
                  {relance&&relance.note&&<div style={{fontSize:11.5,color:"#6B6B72",marginTop:6,display:"flex",alignItems:"center",gap:6,fontFamily:"'Geist','system-ui',sans-serif"}}><svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{color:"#B17D2E",opacity:0.8,flexShrink:0}}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>Relance prÃ©vue le {fmtDateFr(relance.date)}{relance.note?" â "+relance.note:""}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                  <span style={{fontSize:10.5,fontWeight:500,padding:"3px 10px",borderRadius:100,background:st.bg,color:st.color,letterSpacing:"0.02em",fontFamily:"'Geist','system-ui',sans-serif"}}>{st.label}</span>
                  {linkedEmails.length>0&&<span style={{fontSize:11,color:"#A5A4A0",display:"inline-flex",alignItems:"center",gap:4,fontVariantNumeric:"tabular-nums",fontFamily:"'Geist','system-ui',sans-serif"}}><IcMail/>{linkedEmails.length} mail{linkedEmails.length>1?"s":""}</span>}
                </div>
              </div>
            );
          };

          const GroupHead = ({color, title, count}: any) => (
            <div style={{display:"flex",alignItems:"center",gap:10,margin:"2px 4px 10px"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}}/>
              <div style={{fontSize:13,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.005em",fontFamily:"'Geist','system-ui',sans-serif"}}>{title}</div>
              <span style={{fontSize:11.5,color:"#A5A4A0",fontVariantNumeric:"tabular-nums",background:"#F5F4F0",padding:"1px 8px",borderRadius:100,fontWeight:500,fontFamily:"'Geist','system-ui',sans-serif"}}>{count}</span>
              <div style={{flex:1,height:1,background:"#EBEAE5"}}/>
            </div>
          );

          return (
          <div style={{display:"flex",flex:1,overflow:"hidden"}}>
            {/* âââ Sub-sidebar filtres statuts âââ */}
            <div style={{width:subCollapsed?44:220,background:"#FAFAF7",display:"flex",flexDirection:"column",flexShrink:0,borderRight:"1px solid #EBEAE5",transition:"width .2s ease",overflow:"hidden"}}>
              <div style={{padding:subCollapsed?"10px 6px":"16px 10px 10px",display:"flex",alignItems:"center",justifyContent:subCollapsed?"center":"space-between",flexShrink:0}}>
                {!subCollapsed&&<div style={{fontSize:10,fontWeight:500,color:"#A5A4A0",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif",padding:"0 1px"}}>Filtrer par statut</div>}
                <button onClick={()=>setSubCollapsed(v=>!v)} title={subCollapsed?"Agrandir":"RÃ©duire"} style={{width:22,height:22,borderRadius:5,border:"none",background:"#EBEAE5",color:"#6B6B72",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{subCollapsed?"âº":"â¹"}</button>
              </div>
              {subCollapsed?(
                <div style={{padding:"4px 6px",display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>
                  <button onClick={()=>{setFiltresStatutsEvents([]);setGeneralFilter("all");}} title="Tous" style={{width:32,height:32,borderRadius:8,border:"none",background:(filtresStatutsEvents.length===0&&generalFilter==="all")?"rgba(184,146,79,0.15)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:10,height:10,borderRadius:"50%",background:"#C5C3BE"}}/></button>
                  {statuts.map(s=>{const active=filtresStatutsEvents.includes(s.id);return (
                    <button key={s.id} onClick={()=>{const next=active?filtresStatutsEvents.filter(x=>x!==s.id):[...filtresStatutsEvents,s.id];setFiltresStatutsEvents(next);if(generalFilter==="arelancer")setGeneralFilter("all");}} title={s.label} style={{width:32,height:32,borderRadius:8,border:active?`1px solid ${s.color}55`:"none",background:active?"rgba(184,146,79,0.15)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:10,height:10,borderRadius:"50%",background:s.color}}/></button>
                  );})}
                  <button onClick={()=>setGeneralFilter("arelancer")} title="Relances" style={{width:32,height:32,borderRadius:8,border:"none",background:generalFilter==="arelancer"?"rgba(184,146,79,0.15)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:kpi.enRetard.length>0?"#A84B45":"#6B6B72"}}><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M7 4v3l1.8 1.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg></button>
                </div>
              ):(
                <>
                  <div style={{padding:"0 10px 10px",flex:1,overflowY:"auto"}}>
                    <button onClick={()=>{setFiltresStatutsEvents([]);setGeneralFilter("all");}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:(filtresStatutsEvents.length===0&&generalFilter==="all")?"#FFFFFF":"transparent",color:(filtresStatutsEvents.length===0&&generalFilter==="all")?"#1A1A1E":"#6B6B72",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:(filtresStatutsEvents.length===0&&generalFilter==="all")?500:400,boxShadow:(filtresStatutsEvents.length===0&&generalFilter==="all")?"0 1px 2px rgba(15,15,20,0.04)":"none",transition:"background .12s ease"}}>
                      <div style={{width:9,height:9,borderRadius:"50%",background:"#C5C3BE",flexShrink:0}}/>
                      <span style={{flex:1}}>Tous</span>
                      <span style={{fontSize:11,color:(filtresStatutsEvents.length===0&&generalFilter==="all")?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{resas.length}</span>
                    </button>
                    {statuts.map((s,idx)=>{
                      const count=resas.filter(r=>(r.statut||"nouveau")===s.id).length;
                      const active=filtresStatutsEvents.includes(s.id);
                      return (
                        <div key={s.id}
                          draggable
                          onDragStart={()=>setDragStatutIdx(idx)}
                          onDragOver={e=>{e.preventDefault();}}
                          onDrop={e=>{e.preventDefault();if(dragStatutIdx===null||dragStatutIdx===idx) return;const arr=[...statuts];const [moved]=arr.splice(dragStatutIdx,1);arr.splice(idx,0,moved);saveStatuts(arr); setDragStatutIdx(null);}}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"8px 11px",borderRadius:8,background:active?"#FFFFFF":"transparent",marginBottom:2,cursor:"grab",userSelect:"none",opacity:dragStatutIdx===idx?0.4:1,boxShadow:active?"0 1px 2px rgba(15,15,20,0.04)":"none",border:active?`1px solid ${s.color}30`:"1px solid transparent"}}>
                          <button onClick={()=>{const next=active?filtresStatutsEvents.filter(x=>x!==s.id):[...filtresStatutsEvents,s.id];setFiltresStatutsEvents(next);if(generalFilter==="arelancer")setGeneralFilter("all");}} style={{display:"flex",alignItems:"center",gap:10,background:"none",border:"none",color:active?"#1A1A1E":"#6B6B72",fontSize:12.5,textAlign:"left",cursor:"pointer",flex:1,padding:0,fontWeight:active?500:400,fontFamily:"'Geist','system-ui',sans-serif"}}>
                            <div style={{width:9,height:9,borderRadius:"50%",background:s.color,flexShrink:0,boxShadow:active?`0 0 0 2px ${s.color}30`:"none"}}/>
                            <span>{s.label}</span>
                          </button>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            {count>0&&<span style={{fontSize:11,color:active?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{count}</span>}
                            <button onClick={e=>{e.stopPropagation();const ok=window.confirm('Supprimer "'+s.label+'" ? Les Ã©vÃ©nements avec ce statut passeront Ã  "Nouveau".');if(!ok) return;const arr=statuts.filter(x=>x.id!==s.id);saveStatuts(arr);setFiltresStatutsEvents(filtresStatutsEvents.filter(x=>x!==s.id));setFiltresStatutsPlanning(filtresStatutsPlanning.filter(x=>x!==s.id));toast("Statut supprimÃ©");}} title="Supprimer ce statut" style={{width:16,height:16,borderRadius:4,border:"none",background:"transparent",color:"rgba(27,30,43,0.2)",cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1,flexShrink:0}} onMouseEnter={e=>(e.currentTarget.style.color="rgba(168,75,69,0.8)")} onMouseLeave={e=>(e.currentTarget.style.color="rgba(27,30,43,0.2)")}>â</button>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{height:1,background:"#EBEAE5",margin:"10px 4px"}}/>
                    <button onClick={()=>setGeneralFilter("arelancer")} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:generalFilter==="arelancer"?"#FFFFFF":"transparent",color:generalFilter==="arelancer"?"#1A1A1E":"#6B6B72",fontSize:12.5,textAlign:"left",cursor:"pointer",fontWeight:generalFilter==="arelancer"?500:400,fontFamily:"'Geist','system-ui',sans-serif",boxShadow:generalFilter==="arelancer"?"0 1px 2px rgba(15,15,20,0.04)":"none",transition:"background .12s ease"}}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{color:kpi.enRetard.length>0?"#A84B45":"#B17D2E",flexShrink:0}}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M7 4v3l1.8 1.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      <span style={{flex:1}}>Relances</span>
                      {relances.length>0&&<span style={{fontSize:11,color:kpi.enRetard.length>0?"#A84B45":(generalFilter==="arelancer"?"#B8924F":"#A5A4A0"),fontVariantNumeric:"tabular-nums",fontWeight:kpi.enRetard.length>0?500:400}}>{relances.length}</span>}
                    </button>
                  </div>
                  <div style={{padding:"10px 10px",borderTop:"1px solid #EBEAE5"}}>
                    {showCreateStatut?(
                      <div>
                        <div style={{fontSize:11,color:"#6B6B72",marginBottom:8,fontFamily:"'Geist','system-ui',sans-serif"}}>Nouveau statut</div>
                        <input value={newStatutLabel} onChange={e=>setNewStatutLabel(e.target.value)} placeholder="Nom du statutâ¦" style={{width:"100%",padding:"7px 10px",borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",fontSize:12,marginBottom:8,outline:"none",fontFamily:"'Geist','system-ui',sans-serif"}}/>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <span style={{fontSize:11,color:"#6B6B72",fontFamily:"'Geist','system-ui',sans-serif"}}>Couleur</span>
                          <input type="color" value={newStatutColor} onChange={e=>setNewStatutColor(e.target.value)} style={{width:32,height:24,borderRadius:5,border:"none",cursor:"pointer",background:"transparent"}}/>
                          <div style={{width:16,height:16,borderRadius:"50%",background:newStatutColor}}/>
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>{if(!newStatutLabel.trim()) return;const hex=newStatutColor;const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);const bg=`rgba(${r},${g},${b},0.12)`;const ns:StatutDef={id:"s_"+Date.now(),label:newStatutLabel.trim(),bg,color:hex};saveStatuts([...statuts,ns]);setNewStatutLabel("");setNewStatutColor("#6366f1");setShowCreateStatut(false);toast("Statut crÃ©Ã© !");}} style={{flex:1,padding:"7px",borderRadius:8,border:"none",background:"#1A1A1E",color:"#FFFFFF",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif"}}>CrÃ©er</button>
                          <button onClick={()=>{setShowCreateStatut(false);setNewStatutLabel("");}} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6B72",fontSize:12,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif"}}>â</button>
                        </div>
                      </div>
                    ):(
                      <button onClick={()=>setShowCreateStatut(true)} style={{width:"100%",padding:"9px 11px",borderRadius:8,border:"1px dashed #E0DED7",background:"transparent",color:"#A5A4A0",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:"'Geist','system-ui',sans-serif"}}>
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                        CrÃ©er un statut
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* âââ Zone principale âââ */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"#FAFAF7"}}>
              {/* Header : titre + toggle + bouton nouvelle */}
              <div style={{padding:"22px 28px 14px",flexShrink:0,display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16}}>
                <div>
                  <h1 style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:28,fontWeight:400,color:"#1A1A1E",letterSpacing:"-0.02em",lineHeight:1.1,margin:0}}>ÃvÃ©nements</h1>
                  <div style={{fontSize:12.5,color:"#6B6B72",marginTop:4,fontFamily:"'Geist','system-ui',sans-serif"}}>
                    {generalFilter==="arelancer"?`${relances.length} relance${relances.length!==1?"s":""}`:
                     filtresStatutsEvents.length===0?`${resas.length} demande${resas.length!==1?"s":""}`:
                     `${filteredResas.length} demande${filteredResas.length!==1?"s":""} Â· FiltrÃ© par ${filtresStatutsEvents.length} statut${filtresStatutsEvents.length!==1?"s":""}`}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{display:"inline-flex",border:"1px solid #E0DED7",background:"#FFFFFF",borderRadius:8,padding:3,fontSize:12}}>
                    <button onClick={()=>setEventsGroupBy("urgency")} style={{padding:"5px 11px",border:"none",background:eventsGroupBy==="urgency"?"#F5F4F0":"transparent",color:eventsGroupBy==="urgency"?"#1A1A1E":"#6B6B72",fontFamily:"'Geist','system-ui',sans-serif",cursor:"pointer",borderRadius:6,fontWeight:500}}>Par urgence</button>
                    <button onClick={()=>setEventsGroupBy("status")} style={{padding:"5px 11px",border:"none",background:eventsGroupBy==="status"?"#F5F4F0":"transparent",color:eventsGroupBy==="status"?"#1A1A1E":"#6B6B72",fontFamily:"'Geist','system-ui',sans-serif",cursor:"pointer",borderRadius:6,fontWeight:500}}>Par statut</button>
                  </div>
                  <button onClick={()=>{ setNewEvent({...EMPTY_RESA, espaceId: espacesDyn[0]?.id || ""}); setNewEventErrors({}); setShowNewEvent(true); }} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"9px 14px",borderRadius:8,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",boxShadow:"0 1px 2px rgba(184,146,79,0.2)",letterSpacing:"-0.005em"}}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                    Nouvelle demande
                  </button>
                </div>
              </div>
              {/* Recherche */}
              <div style={{padding:"0 28px 18px",flexShrink:0,position:"relative"}}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{position:"absolute",left:42,top:"50%",transform:"translateY(calc(-50% - 9px))",color:"#A5A4A0",pointerEvents:"none"}}><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <input value={searchEvt} onChange={e=>setSearchEvt(e.target.value)} placeholder="Rechercher par nom, entreprise, type, dateâ¦" style={{width:"100%",padding:"10px 14px 10px 38px",border:"1px solid #EBEAE5",borderRadius:10,background:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,color:"#1A1A1E",outline:"none",transition:"border-color .12s ease"}}/>
                {searchEvt&&<button onClick={()=>setSearchEvt("")} style={{position:"absolute",right:36,top:"50%",transform:"translateY(calc(-50% - 9px))",background:"none",border:"none",color:"#A5A4A0",cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 4px"}}>Ã</button>}
              </div>
              {/* Barre des filtres statuts actifs â Point 2 */}
              {filtresStatutsEvents.length>0 && (
                <div style={{padding:"0 28px 14px",flexShrink:0,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",fontFamily:"'Geist','system-ui',sans-serif"}}>
                  <span style={{fontSize:11.5,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500,marginRight:2}}>Filtres actifs</span>
                  {filtresStatutsEvents.map(sid=>{const s=statuts.find(x=>x.id===sid);if(!s)return null;return (
                    <button key={sid} onClick={()=>setFiltresStatutsEvents(filtresStatutsEvents.filter(x=>x!==sid))} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:100,border:`1px solid ${s.color}33`,background:s.bg||"#F5F4F0",color:s.color,fontSize:11.5,fontWeight:500,cursor:"pointer",fontFamily:"inherit",transition:"all .12s ease"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:s.color}}/>
                      {s.label}
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{marginLeft:2,opacity:0.7}}><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    </button>
                  );})}
                  <button onClick={()=>setFiltresStatutsEvents([])} style={{padding:"4px 10px",borderRadius:100,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#6B6B72",fontSize:11.5,fontWeight:500,cursor:"pointer",fontFamily:"inherit",marginLeft:4}}>RÃ©initialiser les filtres</button>
                </div>
              )}
              {/* Hero dashboard 4 KPI */}
              <div style={{padding:"0 28px 22px",flexShrink:0,display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:12}}>
                <div style={{background:"linear-gradient(180deg, #FEF7F6 0%, #FFFFFF 100%)",border:"1px solid #EBEAE5",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .15s ease",position:"relative",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{width:26,height:26,borderRadius:7,background:"#FAEDEB",color:"#A84B45",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 5.5h11M4.5 1v2.5M9.5 1v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </div>
                    <div style={{fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>Cette semaine</div>
                  </div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:30,fontWeight:500,color:"#A84B45",letterSpacing:"-0.03em",lineHeight:1,marginBottom:5,fontVariantNumeric:"tabular-nums"}}>{kpi.cetteSemaine.length}</div>
                  <div style={{fontSize:11.5,color:"#6B6B72",lineHeight:1.4,fontFamily:"'Geist','system-ui',sans-serif"}}>Ã©vÃ©nement{kpi.cetteSemaine.length!==1?"s":""} dans les <strong style={{color:"#1A1A1E",fontWeight:500}}>7 prochains jours</strong></div>
                </div>
                <div onClick={()=>setGeneralFilter("arelancer")} style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .15s ease",position:"relative",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{width:26,height:26,borderRadius:7,background:"#F7EDD8",color:"#B17D2E",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </div>
                    <div style={{fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>Ã relancer</div>
                  </div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:30,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.03em",lineHeight:1,marginBottom:5,fontVariantNumeric:"tabular-nums"}}>{relances.length}</div>
                  <div style={{fontSize:11.5,color:"#6B6B72",lineHeight:1.4,fontFamily:"'Geist','system-ui',sans-serif"}}>{kpi.enRetard.length>0?<>dont <strong style={{color:"#A84B45",fontWeight:500}}>{kpi.enRetard.length} en retard</strong></>:<>aucune en retard</>}</div>
                </div>
                <div style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .15s ease",position:"relative",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{width:26,height:26,borderRadius:7,background:"#EDF2E8",color:"#3F5B32",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </div>
                    <div style={{fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>Nouvelles</div>
                  </div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:30,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.03em",lineHeight:1,marginBottom:5,fontVariantNumeric:"tabular-nums"}}>{kpi.nouvelles.length}</div>
                  <div style={{fontSize:11.5,color:"#6B6B72",lineHeight:1.4,fontFamily:"'Geist','system-ui',sans-serif"}}>demande{kpi.nouvelles.length!==1?"s":""} <strong style={{color:"#1A1A1E",fontWeight:500}}>au statut Nouveau</strong></div>
                </div>
                <div style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .15s ease",position:"relative",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{width:26,height:26,borderRadius:7,background:"#F4EEDF",color:"#B8924F",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10 3H5a2 2 0 000 4h4a2 2 0 010 4H3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M6.5 1.5v11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </div>
                    <div style={{fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>PrÃ©visionnel</div>
                  </div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:kpi.totalBudget>999?24:30,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.025em",lineHeight:1,marginBottom:5,fontVariantNumeric:"tabular-nums"}}>{kpi.totalBudget.toLocaleString("fr-FR")} â¬</div>
                  <div style={{fontSize:11.5,color:"#6B6B72",lineHeight:1.4,fontFamily:"'Geist','system-ui',sans-serif"}}><strong style={{color:"#1A1A1E",fontWeight:500}}>mois en cours</strong> Â· en cours + confirmÃ©s</div>
                </div>
              </div>

              {/* âââ Liste âââ */}
              <div style={{flex:1,overflowY:"auto",padding:"0 28px 40px"}}>

                {/* Vue Relances (depuis filter ou KPI) */}
                {generalFilter==="arelancer"?(
                  <>
                    <GroupHead color="#B17D2E" title="Toutes les relances" count={relances.length}/>
                    {relances.length===0?(
                      <div style={{textAlign:"center",padding:"60px 24px",color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif"}}>
                        <svg width="32" height="32" viewBox="0 0 14 14" fill="none" style={{color:"#C5C3BE",marginBottom:10}}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                        <div style={{fontSize:14,color:"#6B6B72"}}>Aucune relance programmÃ©e</div>
                        <div style={{fontSize:12,marginTop:4}}>Ouvrez un Ã©vÃ©nement et cliquez sur "Relance date"</div>
                      </div>
                    ):(
                      relances.sort((a,b)=>a.date.localeCompare(b.date)).map(rel=>{
                        const resa = resas.find(r=>r.id===rel.resaId);
                        if (!resa) return null;
                        return <EventCard key={"rel-"+rel.id} r={resa} relance={rel}/>;
                      })
                    )}
                  </>
                ):resas.length===0?(
                  <div style={{textAlign:"center",padding:"80px 24px",color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif"}}>
                    <svg width="40" height="40" viewBox="0 0 14 14" fill="none" style={{color:"#C5C3BE",marginBottom:12}}><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1"/><path d="M1.5 5.5h11" stroke="currentColor" strokeWidth="1"/></svg>
                    <div style={{fontSize:14,color:"#6B6B72"}}>Aucune demande de rÃ©servation</div>
                    <div style={{fontSize:12,marginTop:4}}>Les demandes dÃ©tectÃ©es dans vos mails apparaÃ®tront ici.</div>
                  </div>
                ):searchEvt&&filteredResas.length===0?(
                  <div style={{textAlign:"center",padding:"60px 24px",color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif"}}>
                    <svg width="32" height="32" viewBox="0 0 14 14" fill="none" style={{color:"#C5C3BE",marginBottom:10}}><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1"/><path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                    <div style={{fontSize:14,color:"#6B6B72"}}>Aucun rÃ©sultat pour "{searchEvt}"</div>
                    <button onClick={()=>setSearchEvt("")} style={{marginTop:12,background:"none",border:"none",color:"#B8924F",fontSize:12,cursor:"pointer",fontWeight:500,fontFamily:"'Geist','system-ui',sans-serif"}}>Effacer la recherche</button>
                  </div>
                ):eventsGroupBy==="urgency"?(()=>{
                  const grp = groupResasByUrgency(filteredResas);
                  const relancesEnRetardFiltered = kpi.enRetard.filter(rel => {
                    const r = resas.find(x=>x.id===rel.resaId);
                    return r && matchesSearch(r) && inStatusFilter(r);
                  });
                  return (
                    <>
                      {grp.cetteSemaine.length>0&&<div style={{marginBottom:26}}>
                        <GroupHead color="#A84B45" title="Cette semaine" count={grp.cetteSemaine.length}/>
                        {grp.cetteSemaine.map(r=><EventCard key={r.id} r={r}/>)}
                      </div>}
                      {relancesEnRetardFiltered.length>0&&<div style={{marginBottom:26}}>
                        <GroupHead color="#B17D2E" title="Relances en retard" count={relancesEnRetardFiltered.length}/>
                        {relancesEnRetardFiltered.map(rel=>{
                          const r = resas.find(x=>x.id===rel.resaId);
                          return r ? <EventCard key={"rel-"+rel.id} r={r} relance={rel}/> : null;
                        })}
                      </div>}
                      {grp.nouvelles.length>0&&<div style={{marginBottom:26}}>
                        <GroupHead color="#6B8A5B" title="Nouvelles demandes" count={grp.nouvelles.length}/>
                        {grp.nouvelles.map(r=><EventCard key={r.id} r={r}/>)}
                      </div>}
                      {grp.enCours.length>0&&<div style={{marginBottom:26}}>
                        <GroupHead color="#B17D2E" title="En cours" count={grp.enCours.length}/>
                        {grp.enCours.map(r=><EventCard key={r.id} r={r}/>)}
                      </div>}
                      {grp.confirmees.length>0&&<div style={{marginBottom:26}}>
                        <GroupHead color="#3F5B32" title="ConfirmÃ©es" count={grp.confirmees.length}/>
                        {grp.confirmees.map(r=><EventCard key={r.id} r={r}/>)}
                      </div>}
                      {filteredResas.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13}}>Aucun Ã©vÃ©nement avec ce filtre</div>}
                    </>
                  );
                })():(() => {
                  // Vue par statut
                  if (generalFilter === "__none__") {
                    const group = filteredResas.filter(r=>(!r.statut||!statuts.find(s=>s.id===r.statut)));
                    return (
                      <>
                        <GroupHead color="#C5C3BE" title="Sans statut" count={group.length}/>
                        {group.length===0?<div style={{textAlign:"center",padding:"60px 0",color:"#A5A4A0",fontSize:13,fontFamily:"'Geist','system-ui',sans-serif"}}>Aucun Ã©vÃ©nement sans statut</div>:group.map(r=><EventCard key={r.id} r={r}/>)}
                      </>
                    );
                  }
                  const statutsToShow = generalFilter==="all"?statuts:[statuts.find(s=>s.id===generalFilter)].filter(Boolean);
                  return (
                    <>
                      {statutsToShow.map(statut=>{
                        const group = filteredResas.filter(r=>(r.statut||"nouveau")===statut!.id);
                        if (group.length===0 && generalFilter==="all") return null;
                        return (
                          <div key={statut!.id} style={{marginBottom:26}}>
                            {generalFilter==="all"&&<GroupHead color={statut!.color} title={statut!.label} count={group.length}/>}
                            {group.length===0&&generalFilter!=="all"?(
                              <div style={{textAlign:"center",padding:"48px 24px",color:"#A5A4A0",fontSize:13,fontFamily:"'Geist','system-ui',sans-serif"}}>Aucune demande avec ce statut</div>
                            ):group.map(r=><EventCard key={r.id} r={r}/>)}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Panel dÃ©tail rÃ©servation (gÃ©nÃ©ral) â ouvert comme modale via selResaGeneral */}
          </div>
          );
        })()}

        {/* ââ MAILS ââ */}
        {view==="mails" && (
          <>
            {/* Sidebar catÃ©gories mails â collapsible */}
            <div style={{width:subCollapsed?44:240,background:"#FAFAF7",display:"flex",flexDirection:"column",flexShrink:0,borderRight:"1px solid #EBEAE5",transition:"width .2s ease",overflow:"hidden"}}>
              {/* Barre de progression synchronisation */}
              {!subCollapsed&&syncStatus==="running"&&(
                <div style={{padding:"6px 10px",background:"rgba(184,146,79,0.08)",borderBottom:"1px solid #EBEAE5",flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                    <Spin s={9}/>
                    <span style={{fontSize:9,color:"#B8924F",letterSpacing:"0.06em",fontFamily:"'Geist','system-ui',sans-serif"}}>Synchronisationâ¦</span>
                  </div>
                  <div style={{height:2,background:"#EBEAE5",borderRadius:1,overflow:"hidden"}}>
                    <div style={{height:"100%",background:"#B8924F",borderRadius:1,width:syncProgress.total>0?`${Math.min(100,syncProgress.synced/syncProgress.total*100)}%`:"30%",transition:"width .5s ease"}}/>
                  </div>
                  {syncProgress.total>0&&<div style={{fontSize:8,color:"#6B6E7E",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>{syncProgress.synced.toLocaleString('fr')} / {syncProgress.total.toLocaleString('fr')}</div>}
                </div>
              )}
              {!subCollapsed&&syncStatus==="done"&&(
                <div style={{padding:"4px 10px",borderBottom:"1px solid #EBEAE5",flexShrink:0,display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:9,color:"#059669",fontFamily:"'Geist','system-ui',sans-serif"}}>â SynchronisÃ©</span>
                  {syncLastDate&&<span style={{fontSize:8,color:"#6B6E7E"}}>{new Date(syncLastDate).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</span>}
                </div>
              )}
              <div style={{padding:subCollapsed?"10px 6px":"10px 10px 8px",display:"flex",alignItems:"center",justifyContent:subCollapsed?"center":"space-between",flexShrink:0,gap:6}}>
                {!subCollapsed&&<>
                  <button onClick={()=>{setShowCompose(true);setComposeTo("");setComposeSubject("");setComposeBody(`\n\n--\nCordialement,\nL'Ã©quipe ${nomEtab}`);}} style={{...gold,flex:1,fontSize:10,padding:"7px 8px",display:"flex",alignItems:"center",justifyContent:"center",gap:5,letterSpacing:"0.06em"}}>
                    â Nouveau mail
                  </button>
                  <button onClick={()=>loadEmailsFromApi(true)} title="Actualiser" style={{width:28,height:28,borderRadius:6,border:"1px solid rgba(209,196,178,0.2)",background:"rgba(201,168,118,0.08)",color:"#C9A876",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {loadingMail?<Spin s={10}/>:"âº"}
                  </button>
                </>}
                {subCollapsed&&<button onClick={()=>loadEmailsFromApi(true)} title="Actualiser" style={{width:32,height:32,borderRadius:8,border:"none",background:"rgba(201,168,118,0.1)",color:"#C9A876",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>{loadingMail?<Spin s={10}/>:"âº"}</button>}
                <button onClick={()=>setSubCollapsed(v=>!v)} title={subCollapsed?"Agrandir":"RÃ©duire"} style={{width:22,height:22,borderRadius:5,border:"none",background:"#EBEAE5",color:"#6B6E7E",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {subCollapsed?"âº":"â¹"}
                </button>
              </div>
              {subCollapsed?(
                <div style={{padding:"4px 6px",display:"flex",flexDirection:"column",gap:4,alignItems:"center",height:"100%"}}>
                  <button onClick={()=>loadEmailsFromApi(true)} title="Actualiser" style={{width:32,height:32,borderRadius:8,border:"none",background:"rgba(201,168,118,0.1)",color:"#C9A876",cursor:"pointer",fontSize:13}}>âº</button>
                  {/* Radar ARCHANGE â en premier */}
                  <button onClick={()=>setMailFilter("priorites")} title="Radar ARCHANGE" style={{width:32,height:32,borderRadius:8,border:`1px solid ${mailFilter==="priorites"?"rgba(184,146,79,0.5)":"rgba(184,146,79,0.2)"}`,background:mailFilter==="priorites"?"rgba(184,146,79,0.15)":"rgba(184,146,79,0.06)",cursor:"pointer",fontSize:12,color:"#B8924F",fontWeight:700,position:"relative"}}>
                    â
                    {prioritesArchange.length>0&&<span style={{position:"absolute",top:1,right:1,width:8,height:8,borderRadius:"50%",background:"#A84B45"}}/>}
                  </button>
                  <button onClick={()=>{setMailFilter("all");setShowArchived(false);setTagFilter(null);setSearch("");}} title="Tous les mails" style={{width:32,height:32,borderRadius:8,border:"none",background:mailFilter==="all"&&!showArchived&&!tagFilter?"rgba(201,168,118,0.1)":"transparent",cursor:"pointer",fontSize:14}}>ð¬</button>
                  {MAIL_CATS.map(c=>(
                    <button key={c.id} onClick={()=>setMailFilter(c.id)} title={c.label} style={{width:32,height:32,borderRadius:8,border:"none",background:mailFilter===c.id?"rgba(201,168,118,0.1)":"transparent",cursor:"pointer",fontSize:14}}>
                      {c.icon}
                    </button>
                  ))}
                </div>
              ):(
                <div style={{padding:"10px 10px",flex:1,display:"flex",flexDirection:"column"}}>
                  {/* Radar ARCHANGE â en premier, hero */}
                  <div style={{paddingBottom:10,marginBottom:8,borderBottom:"1px solid #EBEAE5"}}>
                    {analysing&&(
                      <div style={{display:"flex",alignItems:"center",gap:7,padding:"4px 11px",marginBottom:5}}>
                        <Spin s={10}/>
                        <span style={{fontSize:11,color:"#6B6E7E",fontFamily:"'Geist','system-ui',sans-serif"}}>Analyse {analysingProgress}â¦</span>
                      </div>
                    )}
                    <button onClick={()=>setMailFilter("priorites")} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 12px",borderRadius:10,border:`1px solid ${mailFilter==="priorites"?"rgba(184,146,79,0.45)":"rgba(184,146,79,0.25)"}`,background:mailFilter==="priorites"?"linear-gradient(180deg, rgba(184,146,79,0.14) 0%, rgba(184,146,79,0.08) 100%)":"linear-gradient(180deg, rgba(184,146,79,0.08) 0%, rgba(184,146,79,0.04) 100%)",textAlign:"left",cursor:"pointer",transition:"all .15s ease",position:"relative",overflow:"hidden",fontFamily:"'Geist','system-ui',sans-serif"}}>
                      <span style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:"#B8924F"}}/>
                      <span style={{fontSize:14,color:"#B8924F",lineHeight:1,flexShrink:0}}>â¦</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:12.5,color:"#B8924F",letterSpacing:"-0.005em"}}>Radar ARCHANGE</div>
                        <div style={{fontSize:11,color:"#6B6E7E",marginTop:1,fontVariantNumeric:"tabular-nums"}}>{analysing?"Analyse en coursâ¦":`${prioritesArchange.length} demande${prioritesArchange.length!==1?"s":""}`}</div>
                      </div>
                      {prioritesArchange.length>0&&<span style={{fontSize:11,background:"#A84B45",color:"#fff",padding:"2px 8px",borderRadius:100,fontWeight:600,flexShrink:0,fontVariantNumeric:"tabular-nums",minWidth:22,textAlign:"center"}}>{prioritesArchange.length}</span>}
                    </button>
                  </div>
                  {/* CatÃ©gories standard */}
                  {[
                    {id:"all", label:"Tous les mails", count:emails.filter(m=>m.unread&&!m.archived).length||null,
                      icon:<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M1 4l6 4.5L13 4" stroke="currentColor" strokeWidth="1.1"/></svg>},
                  ].map(item=>(
                    <button key={item.id} onClick={()=>{setMailFilter("all");setShowArchived(false);setTagFilter(null);setSearch("");}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:mailFilter==="all"&&!showArchived&&!tagFilter?"#F5F4F0":"transparent",color:mailFilter==="all"&&!showArchived&&!tagFilter?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:mailFilter==="all"&&!showArchived&&!tagFilter?500:400,transition:"background .12s ease"}}>
                      <span style={{color:mailFilter==="all"&&!showArchived&&!tagFilter?"#1A1A1E":"#6B6E7E",display:"inline-flex"}}>{item.icon}</span>
                      <span style={{flex:1}}>{item.label}</span>
                      <span style={{fontSize:11,color:mailFilter==="all"&&!showArchived&&!tagFilter?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{item.count||""}</span>
                    </button>
                  ))}
                  {MAIL_CATS.map(c=>{
                    const cnt = emails.filter(m=>!m.archived&&(c.id==="nonlus"?!!m.unread:c.id==="atraiter"?m.aTraiter:(m.flags||[]).includes(c.id))).length;
                    const isActive = mailFilter===c.id&&!showArchived;
                    return (
                    <button key={c.id} onClick={()=>{setMailFilter(c.id);setShowArchived(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:isActive?"#F5F4F0":"transparent",color:isActive?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:isActive?500:400,transition:"background .12s ease"}}>
                      <span style={{color:isActive?"#1A1A1E":"#6B6E7E",display:"inline-flex"}}><MailCatIcon id={c.id} active={isActive}/></span>
                      <span style={{flex:1}}>{c.label}</span>
                      <span style={{fontSize:11,color:isActive?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{cnt||""}</span>
                    </button>
                  );})}
                  {/* SÃ©parateur */}
                  <div style={{height:1,background:"#EBEAE5",margin:"10px 4px"}}/>
                  {/* ArchivÃ©s */}
                  <button onClick={()=>setShowArchived(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:showArchived?"#F5F4F0":"transparent",color:showArchived?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:showArchived?500:400,transition:"background .12s ease"}}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{color:showArchived?"#1A1A1E":"#6B6E7E"}}><rect x="1" y="2.5" width="12" height="3" rx="0.8" stroke="currentColor" strokeWidth="1"/><rect x="2" y="5.5" width="10" height="7" rx="0.8" stroke="currentColor" strokeWidth="1"/></svg>
                    <span style={{flex:1}}>ArchivÃ©s</span>
                    <span style={{fontSize:11,color:showArchived?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{emails.filter(m=>m.archived).length||""}</span>
                  </button>
                  {/* EnvoyÃ©s */}
                  <button onClick={()=>{setMailFilter("envoyes");setShowArchived(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:mailFilter==="envoyes"&&!showArchived?"#F5F4F0":"transparent",color:mailFilter==="envoyes"&&!showArchived?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:mailFilter==="envoyes"&&!showArchived?500:400,transition:"background .12s ease"}}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{color:mailFilter==="envoyes"&&!showArchived?"#1A1A1E":"#6B6E7E"}}><path d="M1 7L13 1L9.5 13L7 8L1 7z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
                    <span style={{flex:1}}>EnvoyÃ©s</span>
                  </button>
                  {/* Brouillons */}
                  <button onClick={()=>{setMailFilter("brouillons");setShowArchived(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:mailFilter==="brouillons"&&!showArchived?"#F5F4F0":"transparent",color:mailFilter==="brouillons"&&!showArchived?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:mailFilter==="brouillons"&&!showArchived?500:400,transition:"background .12s ease"}}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{color:mailFilter==="brouillons"&&!showArchived?"#1A1A1E":"#6B6E7E"}}><path d="M2 11l1-3 7-7 2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 3l2 2" stroke="currentColor" strokeWidth="1.1"/></svg>
                    <span style={{flex:1}}>Brouillons</span>
                    <span style={{fontSize:11,color:localDrafts.length>0?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{localDrafts.length||""}</span>
                  </button>
                  {/* ReportÃ©s â Point 4 */}
                  {(()=>{const reportedCount=emails.filter(m=>m.snoozedUntil&&m.snoozedUntil>new Date().toISOString()&&!m.archived).length;return (
                    <button onClick={()=>{setMailFilter("reported");setShowArchived(false);setTagFilter(null);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:mailFilter==="reported"?"#F5F4F0":"transparent",color:mailFilter==="reported"?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:mailFilter==="reported"?500:400,transition:"background .12s ease"}}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{color:mailFilter==="reported"?"#1A1A1E":"#6B6E7E"}}><circle cx="7" cy="7.5" r="5" stroke="currentColor" strokeWidth="1.1"/><path d="M7 5v3l2 1M4 2.5L2 4M10 2.5L12 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                      <span style={{flex:1}}>ReportÃ©s</span>
                      {reportedCount>0&&<span style={{fontSize:11,color:mailFilter==="reported"?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{reportedCount}</span>}
                    </button>
                  );})()}
                  {/* 3 â Filtres par tag personnalisÃ© */}
                  {customTags.length>0&&<>
                    <div style={{height:1,background:"#EBEAE5",margin:"10px 4px"}}/>
                    <div style={{fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",color:"#A5A4A0",padding:"10px 11px 6px",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500}}>Tags</div>
                    {customTags.map(t=>{
                      const cnt = Object.values(emailTags).filter(ids=>(ids as string[]).includes(t.id)).length;
                      const isActive = tagFilter===t.id;
                      return <button key={t.id} onClick={()=>{setTagFilter(isActive?null:t.id);setMailFilter("all");setShowArchived(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"7px 11px",borderRadius:8,border:"none",background:isActive?"#F5F4F0":"transparent",color:isActive?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:isActive?500:400,transition:"background .12s ease"}}>
                        <span style={{width:9,height:9,borderRadius:"50%",background:t.color,flexShrink:0}}/>
                        <span style={{flex:1}}>{t.label}</span>
                        {cnt>0&&<span style={{fontSize:11,color:isActive?t.color:"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{cnt}</span>}
                      </button>;
                    })}
                  </>}
                  {/* Aide raccourcis */}
                  <div style={{marginTop:"auto",paddingTop:10}}>
                    <button onClick={()=>setShowKeyHelp(true)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:"transparent",color:"#6B6E7E",fontSize:11.5,cursor:"pointer",textAlign:"left",fontFamily:"'Geist','system-ui',sans-serif",transition:"background .12s ease"}}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1"/><path d="M4 6.5h6M4 8.5h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                      <span>Raccourcis clavier</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ââ VUE RADAR ARCHANGE ââ */}
            {mailFilter==="priorites" && (
              <div style={{flex:sel?undefined:1,width:sel?560:undefined,display:"flex",overflow:"hidden",flexShrink:0}}>

                {/* ââ Panel gauche â liste des cartes ââ */}
                <div style={{flex:1,overflowY:"auto",background:"#F5F4F0",padding:"20px 20px",borderRight:sel?"1px solid #EBEAE5":"none"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                    <div>
                      <div style={{fontSize:18,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",letterSpacing:"0.01em"}}>Radar ARCHANGE</div>
                      <div style={{fontSize:12,color:"#6B6E7E",marginTop:2}}>{prioritesArchange.length} demande{prioritesArchange.length!==1?"s":""} en attente</div>
                    </div>
                  </div>

                  {prioritesArchange.length===0?(
                    <div style={{textAlign:"center",padding:"60px 24px",color:"#6B6E7E"}}>
                      <div style={{fontSize:36,marginBottom:12}}>â</div>
                      <div style={{fontSize:14,color:"#1A1A1E",marginBottom:6}}>Aucune demande en attente</div>
                      <div style={{fontSize:12}}>Les demandes de rÃ©servation dÃ©tectÃ©es par ARCHANGE apparaÃ®tront ici</div>
                    </div>
                  ):(()=>{
                    let lastType: string|null = null;
                    const sectionLabels: Record<string,string> = {
                      rouge: "Urgences",
                      or: "Leads confirmÃ©s",
                      neutre: "Nouvelles demandes",
                    };
                    return prioritesArchange.map((item, idx) => {
                      const showSection = item.type !== lastType;
                      lastType = item.type;
                      const { m, ext, resa, type, dateStr } = item;
                      const isRouge = type === "rouge";
                      const isOr = type === "or";
                      const isHovered = radarHoverId === m.id;
                      const isSelected = sel?.id === m.id;

                      const headerBg = isRouge ? "linear-gradient(135deg,#FCEBEB,#F7C1C1)" : isOr ? "linear-gradient(135deg,#FAEEDA,#FAC775)" : "#FAFAF7";
                      const borderCol = isSelected ? "#B8924F" : isRouge ? "#A84B45" : isOr ? "#BA7517" : "#EBEAE5";
                      const badgeBg = isRouge ? "#A84B45" : isOr ? "#BA7517" : "#888780";
                      const nameCol = isRouge ? "#791F1F" : isOr ? "#633806" : "#1A1A1E";
                      const contactCol = isRouge ? "#C94040" : isOr ? "#854F0B" : "#A5A4A0";
                      const avBg = isRouge ? "#F7C1C1" : isOr ? "#FAC775" : "#E5E2DD";
                      const avCol = isRouge ? "#791F1F" : isOr ? "#412402" : "#6B6B72";

                      const nom = ext.nom || m.from || "â";
                      const initiales = nom.split(" ").map((w:string)=>w[0]).filter(Boolean).slice(0,2).join("").toUpperCase() || "?";
                      const entreprise = ext.entreprise || resa?.entreprise;
                      const telephone = ext.telephone || resa?.telephone || null;
                      const budget = ext.budget || resa?.budget;
                      const heureDebut = ext.heureDebut || resa?.heureDebut;
                      const heureFin = ext.heureFin || resa?.heureFin;
                      const type_evt = ext.typeEvenement || resa?.typeEvenement;
                      const nbPers = ext.nombrePersonnes || resa?.nombrePersonnes;
                      const espaceNom = resa?.espaceId ? ESPACES.find(e=>e.id===resa.espaceId)?.nom : ext.espaceDetecte ? ESPACES.find(e=>e.id===ext.espaceDetecte)?.nom || ext.espaceDetecte : null;
                      const resume = ext.resume || ext.notes || null;

                      const hasDraft = drafted.has(m.id);
                      const hasResa = !!emailResaLinks[m.id];
                      const statutLabel = hasResa ? "RÃ©servation crÃ©Ã©e" : hasDraft ? "RÃ©ponse rÃ©digÃ©e" : "Nouveau";
                      const statutBg = hasResa ? "#D1FAE5" : hasDraft ? "#DBEAFE" : "#F1EFE8";
                      const statutCol = hasResa ? "#3F5B32" : hasDraft ? "#1D4ED8" : "#5F5E5A";

                      const today = new Date(); today.setHours(0,0,0,0);
                      let badgeLabel = isRouge ? (dateStr && new Date(dateStr+"T12:00:00") < new Date(today.getTime()+2*86400000) ? "â¡ Demain" : "â¡ Urgent") : isOr ? `ð° ${budget}` : "Nouveau";
                      if(isRouge && (m.flags||[]).includes("flag")) badgeLabel = "â¡ Relance";

                      const cells: [string,string][] = [
                        ["Type", type_evt||"â"],
                        ["Date", dateStr ? fmtDateFr(dateStr) : "â"],
                        ["Personnes", nbPers ? `${nbPers} pers.` : "â"],
                        ["Budget", budget||"â"],
                        ...(heureDebut ? [["Horaires", heureDebut+(heureFin?` â ${heureFin}`:"")]] : [["Horaires","â"]]),
                        ...(espaceNom ? [["Espace", espaceNom]] : [["Espace","â"]]),
                      ];

                      return (
                        <div key={m.id}>
                          {showSection&&<div style={{fontSize:10,fontWeight:500,color:"#6B6E7E",letterSpacing:"0.1em",textTransform:"uppercase",margin:idx===0?"0 0 10px":"20px 0 10px"}}>{sectionLabels[type]}</div>}
                          <div
                            onClick={()=>{
                              // Fix 8 â Ouvrir le lecteur complet Ã  droite du Radar (split view)
                              // handleSel charge le corps et marque lu, sans naviguer ailleurs
                              setMailOrigine({type:'radar', resaId: resa?.id||'', nom: 'Radar ARCHANGE'});
                              setRadarReplyModal(null); setRadarReplyText("");
                              handleSel(m);
                            }}
                            style={{background:"#FFFFFF",borderRadius:12,border:`1.5px solid ${borderCol}`,overflow:"hidden",marginBottom:8,boxShadow:isSelected?"0 0 0 3px rgba(184,146,79,0.2)":isHovered?"0 4px 16px rgba(0,0,0,.08)":"none",transition:"box-shadow .15s, border-color .15s",cursor:"pointer"}}
                            onMouseEnter={()=>setRadarHoverId(m.id)}
                            onMouseLeave={()=>setRadarHoverId(null)}>

                            {/* Header â nom, email, tÃ©lÃ©phone */}
                            <div style={{padding:"10px 14px",background:headerBg,display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:34,height:34,borderRadius:"50%",background:avBg,color:avCol,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,flexShrink:0}}>{initiales}</div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,fontWeight:600,color:nameCol,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nom}{entreprise?` â ${entreprise}`:""}</div>
                                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2,flexWrap:"wrap"}}>
                                  <span style={{fontSize:11,color:contactCol}}>{m.fromEmail}</span>
                                  {telephone&&<span style={{fontSize:11,color:contactCol,display:"flex",alignItems:"center",gap:3}}>Â· ð {telephone}</span>}
                                </div>
                              </div>
                              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                                <span style={{background:badgeBg,color:"#fff",fontSize:11,fontWeight:500,padding:"3px 10px",borderRadius:20}}>{badgeLabel}</span>
                                <span style={{background:statutBg,color:statutCol,fontSize:10,fontWeight:500,padding:"2px 7px",borderRadius:20}}>{statutLabel}</span>
                              </div>
                            </div>

                            {/* Grille infos */}
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr"}}>
                              {cells.map(([lbl,val],i)=>(
                                <div key={lbl} style={{padding:"8px 14px",borderBottom:i<3?"0.5px solid #EBEAE5":"none",borderRight:(i+1)%3!==0?"0.5px solid #EBEAE5":"none"}}>
                                  <div style={{fontSize:10,color:"#6B6E7E",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif"}}>{lbl}</div>
                                  <div style={{fontSize:12,fontWeight:val==="â"?400:500,color:val==="â"?"#C5C3BE":"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif"}}>{val}</div>
                                </div>
                              ))}
                            </div>

                            {resume && (
                              <div style={{padding:"10px 14px",borderTop:"0.5px solid #EBEAE5",background:"#FFFFFF"}}>
                                <div style={{fontSize:12,color:"#6B6E7E",lineHeight:1.55,fontFamily:"'Geist','system-ui',sans-serif"}}>{resume}</div>
                              </div>
                            )}

                            <div style={{padding:"10px 12px",borderTop:"0.5px solid #EBEAE5",display:"flex",alignItems:"center",gap:7,background:"#FAFAF9"}}>
                              <button onClick={e=>{e.stopPropagation(); setRadarResaModal({ nom: ext.nom||m.from||"", email: ext.email||m.fromEmail||"", telephone: ext.telephone||"", entreprise: ext.entreprise||"", typeEvenement: ext.typeEvenement||"", nombrePersonnes: ext.nombrePersonnes||"", espaceId: ext.espaceDetecte||resa?.espaceId||espacesDyn[0]?.id||"", dateDebut: ext.dateDebut||resa?.dateDebut||"", heureDebut: ext.heureDebut||resa?.heureDebut||"", heureFin: ext.heureFin||resa?.heureFin||"", budget: ext.budget||resa?.budget||"", notes: ext.notes||"", statut: ext.statutSuggere||"nouveau", _emailId: m.id, });}} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 13px",borderRadius:9,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",letterSpacing:"-0.005em",transition:"all .14s ease"}}>
                                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1.5 5.5h11M4.5 1v2.5M9.5 1v2.5M7 8v3M5.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                Ajouter au planning
                              </button>
                              <button onClick={e=>{e.stopPropagation();
                                // Ouvrir le lecteur complet (panel droit) plutÃ´t qu'une modale sÃ©parÃ©e
                                // genererReponse sera accessible depuis le lecteur avec tout le contexte
                                setMailOrigine({type:'radar', resaId: resa?.id||'', nom: 'Radar ARCHANGE'});
                                handleSel(m);
                                setRadarSelEmail(m);
                              }} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:9,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",transition:"all .14s ease"}}>
                                <span style={{color:"#B8924F",fontSize:13,lineHeight:1}}>â¦</span>
                                GÃ©nÃ©rer rÃ©ponse
                              </button>
                              <button onClick={e=>{e.stopPropagation(); saveRadarTraites(new Set([...radarTraites,m.id])); toast("Demande archivÃ©e du Radar");}} style={{marginLeft:"auto",padding:"7px 11px",borderRadius:9,border:"none",background:"transparent",color:"#6B6E7E",fontSize:12,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",transition:"all .14s ease"}} title="Archiver cette carte">
                                â TraitÃ©
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* ââ Panel droit â lecteur email (mÃªme rendu que la boÃ®te mail, via sel) ââ */}
                {/* Lecteur standard partagÃ© â affichÃ© via la zone ci-dessous */}
              </div>
            )}

            {/* Liste emails standard */}
            {mailFilter!=="priorites" && (
            <div style={{width:330,borderRight:"1px solid #EBEAE5",background:"#F5F4F0",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>

              {/* ââ Vues EnvoyÃ©s / Brouillons ââ */}
              {(mailFilter==="envoyes"||mailFilter==="brouillons")&&(
                <div style={{flex:1,overflowY:"auto"}}>
                  <div style={{padding:"16px 18px 10px",borderBottom:"1px solid #EBEAE5"}}>
                    <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:22,fontWeight:500,color:"#1A1A1E"}}>
                      {mailFilter==="envoyes"?"EnvoyÃ©s":"Brouillons"}
                    </div>
                  </div>
                  {(mailFilter==="envoyes"?sentList:draftList).length===0&&(
                    <div style={{padding:"40px 16px",textAlign:"center",color:"#6B6E7E",fontSize:12}}>
                      {mailFilter==="envoyes"?"Aucun email envoyÃ© depuis ARCHANGE":"Aucun brouillon sauvegardÃ©"}
                    </div>
                  )}
                  {(mailFilter==="envoyes"?sentList:draftList).map(em=>(
                    <div key={em.id} onClick={()=>handleSel(em as any)} style={{padding:"12px 16px",borderBottom:"1px solid #EBEAE5",cursor:"pointer",background:sel?.id===em.id?"#FAFAF7":"transparent",borderLeft:`2px solid ${sel?.id===em.id?"#B8924F":"transparent"}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontSize:12,fontWeight:500,color:"#1A1A1E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{mailFilter==="envoyes"?(em as any).toEmail||"Moi":em.fromEmail}</span>
                        <span style={{fontSize:10,color:"#6B6E7E",flexShrink:0,fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic"}}>{em.date}</span>
                      </div>
                      <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14,fontWeight:500,color:"#1A1A1E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{em.subject}</div>
                      <div style={{fontSize:11,color:"#6B6E7E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{em.snippet}</div>
                      {mailFilter==="brouillons"&&(
                        <button onClick={e=>{e.stopPropagation();const d=em as any;setComposeTo(d.to);setComposeSubject(d.subject);setComposeBody(d.body);setShowCompose(true);setLocalDrafts(prev=>prev.filter(x=>x.id!==d.id));}} style={{marginTop:6,fontSize:10,padding:"3px 10px",borderRadius:2,border:"1px solid #B8924F",background:"transparent",color:"#B8924F",cursor:"pointer",letterSpacing:"0.04em"}}>Reprendre â</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Vue standard */}
              {mailFilter!=="envoyes"&&mailFilter!=="brouillons"&&<>
              {/* Header liste â v3 Apple Mail 2026 */}
              <div style={{borderBottom:"1px solid #EBEAE5",flexShrink:0,background:"#FFFFFF"}}>
                {/* 1. Barre de recherche */}
                <div style={{padding:"12px 16px 10px",position:"relative"}}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{position:"absolute",left:28,top:"50%",transform:"translateY(-50%)",color:"#A5A4A0",pointerEvents:"none"}}><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  <input value={search} onChange={e=>{setSearch(e.target.value);setDeepResults([]);}} placeholder="Rechercher un mailâ¦" style={{width:"100%",padding:"8px 32px 8px 34px",border:"1px solid #EBEAE5",borderRadius:8,background:"#FAFAF7",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,color:"#1A1A1E",outline:"none",transition:"all .12s ease"}} onFocus={e=>{e.currentTarget.style.borderColor="#B8924F";e.currentTarget.style.background="#FFFFFF";}} onBlur={e=>{e.currentTarget.style.borderColor="#EBEAE5";e.currentTarget.style.background="#FAFAF7";}}/>
                  {search&&<button onClick={()=>{setSearch("");setDeepResults([]);}} title="Effacer" style={{position:"absolute",right:22,top:"50%",transform:"translateY(-50%)",width:20,height:20,background:"transparent",border:"none",color:"#A5A4A0",cursor:"pointer",borderRadius:4,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:14,lineHeight:1}} onMouseEnter={e=>{e.currentTarget.style.background="#EBEAE5";e.currentTarget.style.color="#1A1A1E";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#A5A4A0";}}>Ã</button>}
                </div>
                {/* Recherche approfondie Gmail */}
                {search&&filtered.length===0&&deepResults.length===0&&!deepSearching&&(
                  <div style={{padding:"0 16px 8px"}}>
                    <button onClick={()=>lancerDeepSearch(search)} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11.5,padding:"5px 10px",borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#B8924F",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500}}>
                      <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      Chercher dans tout Gmail
                    </button>
                  </div>
                )}
                {deepSearching&&(
                  <div style={{padding:"0 16px 8px",display:"flex",alignItems:"center",gap:8}}>
                    <Spin s={11}/>
                    <span style={{fontSize:11.5,color:"#6B6B72",fontFamily:"'Geist','system-ui',sans-serif"}}>Recherche dans tous vos emailsâ¦</span>
                  </div>
                )}
                {/* 2. Ligne de contexte : catÃ©gorie + compteur */}
                <div style={{padding:"2px 18px 8px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:10,minWidth:0}}>
                    <h2 style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:17,fontWeight:500,letterSpacing:"-0.01em",color:"#1A1A1E",margin:0,whiteSpace:"nowrap"}}>
                      {(()=>{
                        if(showArchived) return "Archives";
                        if(mailFilter==="reported") return "ReportÃ©s";
                        if(mailFilter==="nonlus") return "Non lus";
                        if(mailFilter==="atraiter") return "Ã traiter";
                        if(mailFilter==="star") return "Favoris";
                        if(mailFilter==="flag") return "FlaggÃ©s";
                        if(mailFilter==="priorites") return "Radar ARCHANGE";
                        if(tagFilter){const t=customTags.find(x=>x.id===tagFilter);return t?.label||"Tag";}
                        return "Tous les mails";
                      })()}
                    </h2>
                    <span style={{fontSize:11.5,color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>
                      {(()=>{
                        // Pour "Tous les mails" : nombre de non-lus, sinon total
                        if(mailFilter==="all"&&!showArchived&&!tagFilter){
                          const unread=emails.filter(m=>m.unread&&!m.archived&&(!m.snoozedUntil||m.snoozedUntil<=new Date().toISOString())).length;
                          return unread>0?`${unread} non lu${unread!==1?"s":""}`:"tout lu";
                        }
                        return `${filtered.length} message${filtered.length!==1?"s":""}`;
                      })()}
                    </span>
                  </div>
                </div>
                {/* 3. Barre tri + actions */}
                <div style={{padding:"0 16px 10px",display:"flex",alignItems:"center",gap:6}}>
                  <button onClick={selectedIds.size>0?clearSelection:selectAll} style={{fontSize:11.5,padding:"5px 10px",borderRadius:7,border:`1px solid ${selectedIds.size>0?"#B8924F":"#EBEAE5"}`,background:selectedIds.size>0?"#F4EEDF":"#FFFFFF",color:selectedIds.size>0?"#B8924F":"#6B6B72",cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,fontVariantNumeric:"tabular-nums"}}>
                    {selectedIds.size>0?`${selectedIds.size} sÃ©lectionnÃ©${selectedIds.size>1?"s":""}`:"Tout sÃ©lectionner"}
                  </button>
                  <div style={{flex:1}}/>
                  <select value={sortOrder} onChange={e=>setSortOrder(e.target.value as any)} style={{fontSize:11.5,border:"1px solid #EBEAE5",borderRadius:7,padding:"5px 26px 5px 10px",background:"#FFFFFF url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='none'%3E%3Cpath d='M2 3.5L5 6.5L8 3.5' stroke='%236B6B72' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 8px center",color:"#1A1A1E",cursor:"pointer",appearance:"none",WebkitAppearance:"none",fontFamily:"'Geist','system-ui',sans-serif",outline:"none",fontWeight:500}}>
                    <option value="date_desc">Plus rÃ©cent</option>
                    <option value="date_asc">Plus ancien</option>
                    <option value="from">ExpÃ©diteur (AâZ)</option>
                    <option value="subject">Objet (AâZ)</option>
                  </select>
                </div>
                {/* Actions groupÃ©es (si sÃ©lection) */}
                {selectedIds.size>0&&(
                  <div style={{display:"flex",gap:4,padding:"0 16px 10px",flexWrap:"wrap"}}>
                    <button onClick={bulkMarkRead} style={{fontSize:11.5,padding:"5px 10px",borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,display:"inline-flex",alignItems:"center",gap:5}}><svg width="10" height="10" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.3"/></svg>Marquer lu</button>
                    <button onClick={bulkMarkUnread} style={{fontSize:11.5,padding:"5px 10px",borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,display:"inline-flex",alignItems:"center",gap:5}}><svg width="10" height="10" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3" fill="currentColor"/></svg>Non lu</button>
                    <button onClick={bulkATraiter} style={{fontSize:11.5,padding:"5px 10px",borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,display:"inline-flex",alignItems:"center",gap:5}}><svg width="10" height="10" viewBox="0 0 14 14" fill="none"><rect x="2.5" y="1.5" width="9" height="11" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h4M5 7.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>Ã traiter</button>
                    <button onClick={bulkArchive} style={{fontSize:11.5,padding:"5px 10px",borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,display:"inline-flex",alignItems:"center",gap:5}}><svg width="10" height="10" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="3" rx="0.7" stroke="currentColor" strokeWidth="1.2"/><rect x="2.5" y="5.5" width="9" height="7" rx="0.7" stroke="currentColor" strokeWidth="1.2"/></svg>Archiver</button>
                    <button onClick={bulkDelete} style={{fontSize:11.5,padding:"5px 10px",borderRadius:7,border:"1px solid rgba(168,75,69,0.3)",background:"#FFFFFF",color:"#A84B45",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,display:"inline-flex",alignItems:"center",gap:5}}><svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M2.5 4h9M5.5 4V2.5h3V4M4 4l0.5 8a1 1 0 001 1h3a1 1 0 001-1L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>Supprimer</button>
                  </div>
                )}
              </div>
              <div ref={mailListRef} style={{flex:1,overflowY:"auto"}}>
                {filtered.length===0&&(
                  <div style={{padding:"32px 16px",textAlign:"center",color:"#6B6E7E"}}>
                    <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:32,marginBottom:8,opacity:.3}}>â¦</div>
                    <div style={{fontSize:12,fontWeight:500,marginBottom:4}}>
                      {mailFilter==="nonlus"?"Aucun email non lu":mailFilter==="atraiter"?"Aucun email Ã  traiter":mailFilter==="star"?"Aucun favori":mailFilter==="flag"?"Aucun email flaggÃ©":search?"Aucun rÃ©sultat":"Aucun email"}
                    </div>
                    {(mailFilter!=="all"||tagFilter)&&<button onClick={()=>{setMailFilter("all");setSearch("");setTagFilter(null);setShowArchived(false);}} style={{fontSize:11,color:"#B8924F",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Voir tous les mails</button>}
                  </div>
                )}
                {filtered.map(em=>{
                  // Tags CÃ©leste : statut IA + espace + Ã©tat fonctionnel
                  const ext = repliesCache[em.id]?.extracted;
                  const isActive = sel?.id===em.id;
                  const isSelected = selectedIds.has(em.id);
                  // Trouver le statut resa liÃ©
                  const linkedResa = resas.find(r=>emailResaLinks[em.id]===r.id);
                  const linkedStatut = linkedResa ? (statuts.find(s=>s.id===(linkedResa.statut||"nouveau"))||statuts[0]) : null;
                  // Espace dÃ©tectÃ©
                  const detectedEspace = ext?.espaceDetecte ? espacesDyn.find(e=>e.id===ext.espaceDetecte) : null;

                  return (
                  <div key={em.id} className="mail-row celeste-email-item"
                    style={{position:"relative",margin:"2px 8px",borderRadius:10,cursor:"pointer",
                      background:isSelected?"#EEF2FF":isActive?"#FAFAF7":"transparent",
                      boxShadow:isActive?"0 1px 2px rgba(15,15,20,0.05), 0 0 0 1px rgba(184,146,79,0.18)":"none",
                      transition:"background .12s ease, box-shadow .12s ease"}}>
                    {/* Checkbox sÃ©lection */}
                    <div className="mail-checkbox" onClick={e=>{e.stopPropagation();toggleSelect(em.id);}} style={{position:"absolute",top:14,left:8,width:16,height:16,borderRadius:4,border:`1.5px solid ${isSelected?"#7BA8C4":"#E0DED7"}`,background:isSelected?"#7BA8C4":"transparent",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2,opacity:isSelected?1:0,transition:"opacity .1s",cursor:"pointer"}}>
                      {isSelected&&<span style={{color:"#fff",fontSize:10,lineHeight:1}}>â</span>}
                    </div>
                    {/* Corps de la carte */}
                    <div onClick={()=>handleSel(em)} style={{padding:"14px 14px 12px 14px"}}>
                      {/* Ligne 1 â expÃ©diteur + date */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3,gap:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                          {em.unread&&<div style={{width:6,height:6,borderRadius:"50%",background:"#B8924F",flexShrink:0}}/>}
                          <span style={{fontSize:13,fontWeight:em.unread?600:500,color:"#1A1A1E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",letterSpacing:"-0.005em"}}>{em.from||"(inconnu)"}</span>
                        </div>
                        <span style={{fontSize:11,color:"#6B6E7E",flexShrink:0,fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums"}}>{em.date}</span>
                      </div>
                      {/* Ligne 2 â objet en serif */}
                      <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14.5,fontWeight:em.unread?500:400,color:"#1A1A1E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:5,lineHeight:1.25,letterSpacing:"-0.01em"}}>{em.subject||"(sans objet)"}</div>
                      {/* Ligne 3 â snippet */}
                      <div style={{fontSize:12,color:"#6B6E7E",overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",lineHeight:1.5,marginBottom:9}}>{em.snippet}</div>
                      {/* Tags enrichis CÃ©leste */}
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        {/* Statut resa */}
                        {linkedStatut&&(
                          <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"2px 9px",borderRadius:100,fontSize:10,letterSpacing:"0.04em",textTransform:"uppercase",color:"#4A4A52",background:"#F5F4F0",border:"1px solid #EBEAE5",fontWeight:500}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:linkedStatut.color,flexShrink:0}}/>
                            {linkedStatut.label}
                          </span>
                        )}
                        {/* Espace dÃ©tectÃ© */}
                        {detectedEspace&&(
                          <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"2px 9px",borderRadius:100,fontSize:10,letterSpacing:"0.04em",textTransform:"uppercase",color:"#4A4A52",background:"#F5F4F0",border:"1px solid #EBEAE5",fontWeight:500}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:detectedEspace.color,flexShrink:0}}/>
                            {detectedEspace.nom}
                          </span>
                        )}
                        {/* Personnes + type */}
                        {ext?.nombrePersonnes&&(
                          <span style={{fontSize:11,color:"#6B6E7E",fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums"}}>
                            <strong style={{fontWeight:500,color:"#1A1A1E"}}>{ext.nombrePersonnes} pers.</strong>{ext.typeEvenement?` Â· ${ext.typeEvenement}`:""}
                          </span>
                        )}
                        {/* Flags fonctionnels */}
                        {em.aTraiter&&<span style={{fontSize:9.5,padding:"2px 8px",borderRadius:100,background:"rgba(184,146,79,0.1)",color:"#B8924F",border:"1px solid rgba(184,146,79,0.25)",letterSpacing:"0.05em",textTransform:"uppercase",fontWeight:600}}>Ã traiter</span>}
                        {(em.flags||[]).includes("star")&&<span style={{fontSize:12,color:"#B8924F"}}>â¦</span>}
                        {em.snoozedUntil&&(()=>{const d=new Date(em.snoozedUntil);const label=d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})+" Â· "+d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}).replace(":","h");return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,padding:"2px 7px",borderRadius:100,background:"rgba(184,146,79,0.1)",color:"#B8924F",border:"1px solid rgba(184,146,79,0.25)",fontWeight:500,fontVariantNumeric:"tabular-nums"}}><svg width="9" height="9" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M7 5.5v2l1.5 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>{label}</span>;})()}
                        {/* 5 â Indicateur brouillon de rÃ©ponse en cours */}
                        {(()=>{try{return localStorage.getItem(`draft_reply_${em.id}`);}catch{return null;}})()&&<span style={{fontSize:9.5,padding:"2px 8px",borderRadius:100,background:"#EFF6FF",color:"#3B82F6",border:"1px solid #BFDBFE",letterSpacing:"0.04em",textTransform:"uppercase",fontWeight:600}}>Brouillon</span>}
                        {/* 3 â Badges tags personnalisÃ©s */}
                        {(emailTags[em.id]||[]).map((tid:string)=>{const t=customTags.find(x=>x.id===tid);return t?<span key={tid} style={{fontSize:9.5,padding:"2px 8px",borderRadius:100,background:t.color+"1A",color:t.color,border:`1px solid ${t.color}40`,fontWeight:600,letterSpacing:"0.03em"}}>{t.label}</span>:null;})}
                      </div>
                    </div>
                    {/* Barre d'actions au survol â v3 */}
                    <div className="mail-actions" style={{display:"flex",gap:3,opacity:0,transition:"opacity .15s ease",borderTop:"1px solid #EBEAE5",padding:"5px 10px",background:isActive?"rgba(245,244,240,0.7)":"rgba(250,250,247,0.7)",justifyContent:"flex-end",alignItems:"center",borderRadius:"0 0 10px 10px"}}>
                      {(()=>{const starred=(em.flags||[]).includes("star");return (
                      <button onClick={e=>{e.stopPropagation();toggleFlag(em.id,"star");}} title={starred?"Retirer des favoris":"Ajouter aux favoris"} style={{width:28,height:28,borderRadius:7,border:"none",cursor:"pointer",background:starred?"rgba(184,146,79,0.12)":"transparent",color:starred?"#B8924F":"#6B6B72",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease,color .12s ease"}} onMouseEnter={e=>{if(!starred)e.currentTarget.style.background="rgba(184,146,79,0.08)";e.currentTarget.style.color="#B8924F";}} onMouseLeave={e=>{if(!starred){e.currentTarget.style.background="transparent";e.currentTarget.style.color="#6B6B72";}}}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill={starred?"currentColor":"none"}><path d="M7 1.5l1.8 3.7 4 0.6-2.9 2.8 0.7 4L7 10.7l-3.6 1.9 0.7-4L1.2 5.8l4-0.6L7 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                      </button>
                      );})()}
                      <button onClick={e=>{e.stopPropagation();toggleATraiter(em.id);}} title={em.aTraiter?"Retirer de Ã traiter":"Marquer Ã traiter"} style={{width:28,height:28,borderRadius:7,border:"none",cursor:"pointer",background:em.aTraiter?"rgba(107,138,91,0.14)":"transparent",color:em.aTraiter?"#3F5B32":"#6B6B72",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"all .12s ease"}} onMouseEnter={e=>{if(!em.aTraiter)e.currentTarget.style.background="#EBEAE5";}} onMouseLeave={e=>{if(!em.aTraiter)e.currentTarget.style.background="transparent";}}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="2.5" y="1.5" width="9" height="11" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h4M5 7.5h4M5 10h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      </button>
                      <button onClick={e=>{e.stopPropagation();toggleUnread(em.id);}} title={em.unread?"Marquer comme lu":"Marquer comme non lu"} style={{width:28,height:28,borderRadius:7,border:"none",cursor:"pointer",background:"transparent",color:em.unread?"#1A1A1E":"#6B6B72",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}} onMouseEnter={e=>{e.currentTarget.style.background="#EBEAE5";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">{em.unread?<circle cx="7" cy="7" r="3" fill="currentColor"/>:<circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2"/>}</svg>
                      </button>
                      <button onClick={e=>{e.stopPropagation();archiveEmail(em.id);}} title="Archiver" style={{width:28,height:28,borderRadius:7,border:"none",cursor:"pointer",background:"transparent",color:"#6B6B72",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}} onMouseEnter={e=>{e.currentTarget.style.background="#EBEAE5";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="3" rx="0.7" stroke="currentColor" strokeWidth="1.2"/><rect x="2.5" y="5.5" width="9" height="7" rx="0.7" stroke="currentColor" strokeWidth="1.2"/><path d="M5.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      </button>
                      {/* SNOOZE â menu moderne v3 */}
                      <div style={{position:"relative"}} className="snooze-wrap">
                        <button onClick={e=>{e.stopPropagation(); const el=e.currentTarget.nextElementSibling as HTMLElement; if(el) el.style.display=el.style.display==="block"?"none":"block";}} title="Reporter" style={{width:28,height:28,borderRadius:7,border:"none",cursor:"pointer",background:em.snoozedUntil?"rgba(184,146,79,0.14)":"transparent",color:em.snoozedUntil?"#B8924F":"#6B6B72",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}} onMouseEnter={e=>{if(!em.snoozedUntil)e.currentTarget.style.background="#EBEAE5";}} onMouseLeave={e=>{if(!em.snoozedUntil)e.currentTarget.style.background="transparent";}}>
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M7 5.5v2l1.5 1M3.5 2.5L2 4M10.5 2.5L12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                        </button>
                        <div className="snooze-menu" style={{display:"none",position:"absolute",bottom:"calc(100% + 4px)",right:0,background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:10,boxShadow:"0 8px 24px rgba(15,15,20,0.1), 0 0 0 1px rgba(15,15,20,0.02)",zIndex:100,minWidth:200,padding:5,fontFamily:"'Geist','system-ui',sans-serif"}}>
                          <div style={{padding:"6px 10px 4px",fontSize:10.5,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500}}>Reporter Ã </div>
                          {[
                            {label:"Ce soir",sub:"18h",tonight:18},
                            {label:"Demain matin",sub:"9h",days:1,h:9},
                            {label:"Dans 3 jours",sub:"9h",days:3,h:9},
                            {label:"La semaine prochaine",sub:"lundi 9h",nextMonday:true},
                          ].map(opt=>{
                            const d = new Date();
                            if((opt as any).tonight) { d.setDate(d.getDate()+(d.getHours()>=(opt as any).tonight?1:0)); d.setHours((opt as any).tonight,0,0,0); }
                            else if((opt as any).days) { d.setDate(d.getDate()+(opt as any).days); d.setHours((opt as any).h||9,0,0,0); }
                            else if((opt as any).nextMonday) { const cd=new Date(); const addDays=((8-cd.getDay())%7)||7; d.setDate(d.getDate()+addDays); d.setHours(9,0,0,0); }
                            const label=d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})+" Â· "+d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}).replace(":","h");
                            return <button key={opt.label} onClick={e=>{e.stopPropagation();snoozeEmail(em.id,d.toISOString()); const menu=(e.currentTarget.closest(".snooze-menu") as HTMLElement); if(menu) menu.style.display="none";}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,width:"100%",padding:"7px 10px",fontSize:12.5,color:"#1A1A1E",background:"none",border:"none",cursor:"pointer",borderRadius:6,fontFamily:"inherit",textAlign:"left"}}>
                              <span style={{fontWeight:500}}>{opt.label}</span>
                              <span style={{fontSize:11,color:"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{label}</span>
                            </button>;
                          })}
                          <div style={{height:1,background:"#EBEAE5",margin:"4px 2px"}}/>
                          <div style={{padding:"4px 10px 5px"}}>
                            <label style={{fontSize:10.5,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500,display:"block",marginBottom:4}}>Choisir une date</label>
                            <input type="datetime-local" onClick={e=>e.stopPropagation()} onChange={e=>{if(!e.target.value)return;const d=new Date(e.target.value);if(isNaN(d.getTime()))return;snoozeEmail(em.id,d.toISOString()); const menu=(e.currentTarget.closest(".snooze-menu") as HTMLElement); if(menu) menu.style.display="none";}} style={{width:"100%",padding:"7px 10px",border:"1px solid #EBEAE5",borderRadius:7,background:"#FFFFFF",fontFamily:"inherit",fontSize:12,color:"#1A1A1E",outline:"none",fontVariantNumeric:"tabular-nums"}}/>
                          </div>
                        </div>
                      </div>
                      {em.snoozedUntil && (
                        <button onClick={e=>{e.stopPropagation();const upd=emails.map(m=>m.id===em.id?{...m,snoozedUntil:null}:m);saveEmails(upd);toast("Report annulÃ©");}} title="Annuler le report" style={{width:28,height:28,borderRadius:7,border:"none",cursor:"pointer",background:"transparent",color:"#6B6B72",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}} onMouseEnter={e=>{e.currentTarget.style.background="#EBEAE5";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M4 4l-2 3 2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                      <div style={{flex:1}}/>
                      <button onClick={e=>{e.stopPropagation();deleteEmailWithUndo(em);}} title="Supprimer" style={{width:28,height:28,borderRadius:7,border:"none",cursor:"pointer",background:"transparent",color:"#A84B45",display:"inline-flex",alignItems:"center",justifyContent:"center",opacity:0.75,transition:"all .12s ease"}} onMouseEnter={e=>{e.currentTarget.style.background="#FAEDEB";e.currentTarget.style.opacity="1";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.opacity="0.75";}}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 4h9M5.5 4V2.5h3V4M4 4l0.5 8a1 1 0 001 1h3a1 1 0 001-1L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </div>
                  </div>
                );})}

                {/* ââ Fix #4 â Charger plus d'emails ââ */}
                {!search && emails.length > 0 && emails.length % 100 === 0 && (
                  <div style={{padding:"12px 16px",textAlign:"center",borderTop:"1px solid #EBEAE5"}}>
                    <button
                      onClick={chargerPlusEmails}
                      disabled={loadingMore}
                      style={{fontSize:11,padding:"6px 18px",borderRadius:2,border:"1px solid #EBEAE5",background:"transparent",color:"#B8924F",cursor:loadingMore?"wait":"pointer",display:"inline-flex",alignItems:"center",gap:6,fontFamily:"'Geist','system-ui',sans-serif",letterSpacing:"0.04em"}}
                    >
                      {loadingMore ? <><Spin s={10}/> Chargementâ¦</> : `â Charger plus (${emails.length} chargÃ©s)`}
                    </button>
                  </div>
                )}
                {/* ââ RÃ©sultats recherche approfondie Gmail ââ */}
                {deepResults.length>0&&(
                  <>
                    <div style={{padding:"8px 14px 4px",display:"flex",alignItems:"center",gap:6,borderTop:"1px solid #EBEAE5",marginTop:4}}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#B8924F" strokeWidth="1.3"><circle cx="5" cy="5" r="3.5"/><path d="M8 8l3 3"/></svg>
                      <span style={{fontSize:10,color:"#B8924F",fontWeight:500,letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>RÃSULTATS GMAIL ({deepResults.length})</span>
                    </div>
                    {deepResults.map(em=>(
                      <div key={em.id} onClick={()=>handleSel(em)} style={{padding:"10px 14px 8px 14px",borderBottom:"1px solid #EBEAE5",cursor:"pointer",background:"rgba(184,146,79,0.03)",borderLeft:"2px solid rgba(184,146,79,0.3)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                          <span style={{fontSize:12,fontWeight:500,color:"#1A1A1E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{em.from||"(inconnu)"}</span>
                          <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginLeft:6}}>
                            <span style={{fontSize:8,padding:"1px 5px",borderRadius:1,background:"rgba(184,146,79,0.15)",color:"#B8924F",border:"1px solid rgba(184,146,79,0.3)",letterSpacing:"0.06em",fontFamily:"'Geist','system-ui',sans-serif"}}>Gmail</span>
                            <span style={{fontSize:10,color:"#6B6E7E",fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic"}}>{em.date}</span>
                          </div>
                        </div>
                        <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:13,fontWeight:500,color:"#1A1A1E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{em.subject}</div>
                        <div style={{fontSize:11,color:"#6B6E7E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{em.snippet}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>}
            </div>
            )}

            {/* Zone lecture â CÃ©leste */}
            {(mailFilter!=="priorites" || (mailFilter==="priorites" && sel)) && <div style={{flex:1,overflowY:"auto",background:"#F5F4F0"}}>
              {!sel ? (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12,color:"#6B6E7E"}}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{opacity:.18}}>
                    <circle cx="12" cy="12" r="11" stroke="#B8924F" strokeWidth="1"/>
                    <path d="M8.5 9 L 15.5 9" stroke="#B8924F" strokeWidth="1.2" strokeLinecap="round"/>
                    <circle cx="12" cy="7" r="1.1" fill="#B8924F"/>
                    <path d="M12 9.6 L 12 18.2" stroke="#B8924F" strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M10.8 17.8 L 12 19.2 L 13.2 17.8 Z" fill="#B8924F"/>
                  </svg>
                  <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:15,fontStyle:"italic",color:"#6B6E7E"}}>SÃ©lectionnez un email</div>
                </div>
              ) : (
                <div style={{maxWidth:720,margin:"0 auto",padding:"20px 28px 80px"}}>

                  {/* ââ Fil d'Ariane retour Ã©vÃ©nement ou Radar ââ */}
                  {mailOrigine&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,padding:"6px 10px",background:"rgba(184,146,79,0.08)",borderRadius:2,border:"1px solid rgba(184,146,79,0.2)"}}>
                      <button onClick={()=>{
                        if (mailOrigine.type==="evenement") {
                          const resa = resas.find(r=>r.id===mailOrigine.resaId);
                          if(resa){ setSelResaGeneral(resa); setView("general"); setResaOnglet('mails'); }
                        } else if (mailOrigine.type==="radar") {
                          setSel(null);
                          setMailFilter("priorites");
                        }
                        setMailOrigine(null);
                      }} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:"#B8924F",fontSize:11,fontWeight:500,padding:0,fontFamily:"'Geist','system-ui',sans-serif",letterSpacing:"0.02em"}}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="#B8924F" strokeWidth="1.3" strokeLinecap="round"/></svg>
                        {mailOrigine.type==="radar" ? "â Retour au Radar" : `Retour Ã  ${mailOrigine.nom}`}
                      </button>
                    </div>
                  )}

                  {/* ââ Barre d'actions Reader v3 â icon buttons sobres ââ */}
                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:0,padding:"10px 18px",background:"rgba(255,255,255,0.72)",backdropFilter:"saturate(180%) blur(8px)",WebkitBackdropFilter:"saturate(180%) blur(8px)",borderBottom:"1px solid #EBEAE5",flexWrap:"wrap"}}>
                    {/* Action principale : RÃ©pondre */}
                    <button onClick={()=>openReplyEditor("reply")} title="RÃ©pondre (R)" style={{fontSize:13,padding:"7px 13px",borderRadius:8,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",cursor:"pointer",fontWeight:500,display:"inline-flex",alignItems:"center",gap:7,letterSpacing:"-0.005em",fontFamily:"'Geist','system-ui',sans-serif",transition:"all .14s ease"}}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M12 10L8 6l4-4M2 2v4a3 3 0 003 3h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      RÃ©pondre
                    </button>
                    {sel.cc?.length>0&&(
                      <button onClick={()=>openReplyEditor("replyAll")} title="RÃ©pondre Ã  tous" style={{fontSize:12,padding:"7px 11px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,transition:"all .14s ease"}}>Ã tous</button>
                    )}
                    <button onClick={()=>openReplyEditor("forward")} title="TransfÃ©rer" style={{fontSize:12,padding:"7px 11px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,display:"inline-flex",alignItems:"center",gap:5,transition:"all .14s ease"}}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 10l4-4L2 2M12 2v4a3 3 0 01-3 3H3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      TransfÃ©rer
                    </button>
                    {/* Bouton Re-analyser â force une nouvelle extraction IA avec le prompt Ã  jour */}
                    <button
                      onClick={()=>reanalyserEmail(sel)}
                      disabled={reanalysingId===sel.id}
                      title="Re-analyser avec ARCHANGE (force une nouvelle extraction)"
                      style={{
                        fontSize:12,
                        padding:"7px 11px",
                        borderRadius:8,
                        border:"1px solid rgba(184,146,79,0.35)",
                        background: reanalysingId===sel.id ? "rgba(184,146,79,0.08)" : "#FFFFFF",
                        color: reanalysingId===sel.id ? "#A5A4A0" : "#B8924F",
                        cursor: reanalysingId===sel.id ? "wait" : "pointer",
                        fontFamily:"'Geist','system-ui',sans-serif",
                        fontWeight:500,
                        display:"inline-flex",
                        alignItems:"center",
                        gap:5,
                        transition:"all .14s ease",
                      }}
                    >
                      {reanalysingId===sel.id ? (
                        <><Spin s={11}/> Analyseâ¦</>
                      ) : (
                        <>â¦ Re-analyser</>
                      )}
                    </button>
                    {/* NB : Les boutons "Planning" et "ÃvÃ©nement liÃ©" sont rendus par la rÃ©sa card directement
                        (affichÃ©e au-dessus du corps du mail), donc pas de doublon ici. */}
                    <div style={{width:1,height:20,background:"#EBEAE5",margin:"0 4px"}}/>
                    {/* Toggles d'Ã©tat â icon buttons 30x30 */}
                    <button onClick={()=>toggleFlag(sel.id,"star")} title={(sel.flags||[]).includes("star")?"Retirer des favoris":"Ajouter aux favoris"} style={{width:30,height:30,borderRadius:6,border:"none",background:"transparent",color:(sel.flags||[]).includes("star")?"#B8924F":"#A5A4A0",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease, color .12s ease"}}>â¦</button>
                    <button onClick={()=>toggleUnread(sel.id)} title={sel.unread?"Marquer comme lu":"Marquer comme non lu"} style={{width:30,height:30,borderRadius:6,border:"none",background:sel.unread?"rgba(184,146,79,0.1)":"transparent",color:sel.unread?"#B8924F":"#A5A4A0",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>â</button>
                    <button onClick={()=>toggleATraiter(sel.id)} title={sel.aTraiter?"Retirer de Ã traiter":"Marquer Ã traiter"} style={{width:30,height:30,borderRadius:6,border:"none",background:sel.aTraiter?"rgba(184,146,79,0.1)":"transparent",color:sel.aTraiter?"#B8924F":"#6B6E7E",cursor:"pointer",fontSize:13,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>ð</button>
                    <button onClick={()=>archiveEmail(sel.id)} title={sel.archived?"ArchivÃ©":"Archiver"} style={{width:30,height:30,borderRadius:6,border:"none",background:"transparent",color:sel.archived?"#B8924F":"#6B6E7E",cursor:"pointer",fontSize:13,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>ð¦</button>
                    <div style={{flex:1}}/>
                    {/* 3 â Bouton tag personnalisÃ© */}
                    <div style={{position:"relative"}}>
                      <button onClick={()=>setShowTagMenu(showTagMenu===sel.id?null:sel.id)} title="Tags" style={{width:30,height:30,borderRadius:6,border:"none",background:showTagMenu===sel.id?"rgba(184,146,79,0.1)":"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:13,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>ð·ï¸</button>
                      {showTagMenu===sel.id&&(
                        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:300,background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:10,boxShadow:"0 8px 24px rgba(15,15,20,0.10)",minWidth:200,padding:8}}>
                          {customTags.length===0&&<div style={{fontSize:11.5,color:"#A5A4A0",padding:"6px 10px"}}>Aucun tag â crÃ©ez-en dans Sources ARCHANGE</div>}
                          {customTags.map(t=>{const applied=(emailTags[sel.id]||[]).includes(t.id);return(
                            <div key={t.id} onClick={()=>{const cur=emailTags[sel.id]||[];saveEmailTags({...emailTags,[sel.id]:applied?cur.filter((x:string)=>x!==t.id):[...cur,t.id]});}} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 10px",borderRadius:6,cursor:"pointer",background:applied?"rgba(184,146,79,0.08)":"transparent",transition:"background .12s ease"}}>
                              <span style={{width:10,height:10,borderRadius:"50%",background:t.color,flexShrink:0,boxShadow:applied?"0 0 0 2px #1A1A1E":undefined}}/>
                              <span style={{fontSize:12.5,flex:1,color:"#1A1A1E"}}>{t.label}</span>
                              {applied&&<span style={{fontSize:11,color:"#B8924F"}}>â</span>}
                            </div>);
                          })}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>deleteEmailWithUndo(sel)} title="Supprimer" style={{width:30,height:30,borderRadius:6,border:"none",background:"transparent",color:"#A84B45",cursor:"pointer",fontSize:13,display:"inline-flex",alignItems:"center",justifyContent:"center",opacity:0.75,transition:"background .12s ease, opacity .12s ease"}}>â</button>
                  </div>

                  {/* ââ En-tÃªte Ã©ditorial Reader v3 â sujet display ââ */}
                  <div style={{padding:"24px 32px 20px",borderBottom:"1px solid #EBEAE5"}}>
                    {(()=>{const ext=repliesCache[sel.id]?.extracted; return ext&&(
                      <div style={{fontSize:10.5,letterSpacing:"0.08em",textTransform:"uppercase",color:"#B8924F",marginBottom:10,fontWeight:500,display:"flex",alignItems:"center",gap:8,fontFamily:"'Geist','system-ui',sans-serif"}}>
                        {ext.statutSuggere&&<span>{ext.statutSuggere.replace(/_/g," ")}</span>}
                        {ext.typeEvenement&&<><span style={{color:"#E0DED7"}}>Â·</span><span>{ext.typeEvenement}</span></>}
                        {ext.nombrePersonnes&&<><span style={{color:"#E0DED7"}}>Â·</span><span style={{fontVariantNumeric:"tabular-nums"}}>{ext.nombrePersonnes} personnes</span></>}
                      </div>
                    );})()}
                    {/* Sujet en grand */}
                    <h1 style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:28,fontWeight:400,letterSpacing:"-0.02em",lineHeight:1.2,color:"#1A1A1E",margin:"0 0 14px",wordBreak:"break-word"}}>{sel.subject||"(sans objet)"}</h1>
                    {/* Ligne expÃ©diteur */}
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(184,146,79,0.12)",border:"1px solid rgba(184,146,79,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,color:"#B8924F",flexShrink:0,letterSpacing:"-0.01em"}}>
                        {(sel.from||"?")[0].toUpperCase()}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.005em"}}>{sel.from||"(inconnu)"}</div>
                        <div style={{fontSize:12,color:"#6B6E7E",fontFamily:"'Geist','system-ui',sans-serif",marginTop:1}}>{sel.fromEmail}</div>
                      </div>
                      <span style={{fontSize:12,color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",flexShrink:0}}>{sel.date}</span>
                    </div>
                  </div>

                  {/* ââ Encart Lecture par Archange â v3 Apple Mail 2026 ââ */}
                  {extracted?.isReservation && !showPlanForm && (()=>{
                    const alreadyIn = resas.find(r =>
                      emailResaLinks[sel?.id || ""] === r.id ||
                      (r.email && extracted.email && r.email.toLowerCase() === extracted.email.toLowerCase())
                    );
                    const espace = ESPACES.find(e=>e.id===extracted.espaceDetecte);
                    const labelStyle = {fontSize:10.5,color:"#A5A4A0",textTransform:"uppercase" as const,letterSpacing:"0.06em",fontWeight:500,fontFamily:"'Geist','system-ui',sans-serif"};
                    const valueStyle = {fontSize:14,color:"#1A1A1E",fontWeight:500,letterSpacing:"-0.005em",fontFamily:"'Geist','system-ui',sans-serif",lineHeight:1.35};
                    return (
                      <div style={{marginBottom:18,background:"linear-gradient(180deg, #F6F9F3 0%, #FFFFFF 62%)",border:"1px solid rgba(107,138,91,0.22)",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 6px rgba(107,138,91,0.06)"}}>
                        {/* En-tÃªte â RÃ©servation dÃ©tectÃ©e + confiance en bars */}
                        <div style={{padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid rgba(107,138,91,0.15)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:10.5,fontWeight:500,color:"#3F5B32",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="2.5" width="12" height="10" rx="1.2" stroke="#3F5B32" strokeWidth="1.1"/><path d="M1 6h12M4.5 1v2.5M9.5 1v2.5" stroke="#3F5B32" strokeWidth="1.1" strokeLinecap="round"/></svg>
                            RÃ©servation dÃ©tectÃ©e
                          </div>
                          {extracted.confiance&&(()=>{
                            const conf = extracted.confiance;
                            const isHaute = conf === "haute";
                            const isFaible = conf === "faible";
                            const nbBars = isHaute ? 4 : isFaible ? 2 : 3;
                            const barColor = isFaible ? "#A84B45" : "#6B8A5B";
                            const tip = isFaible
                              ? "ARCHANGE a extrait ces informations avec incertitude. VÃ©rifiez chaque champ avant de crÃ©er l'Ã©vÃ©nement."
                              : isHaute
                              ? "ARCHANGE a extrait ces informations avec une bonne certitude."
                              : "ARCHANGE a extrait ces informations partiellement. VÃ©rifiez les champs importants.";
                            return (
                              <div title={tip} style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:"#6B6B72",cursor:"help",fontFamily:"'Geist','system-ui',sans-serif"}}>
                                <span style={{display:"inline-flex",gap:2}}>
                                  {[0,1,2,3].map(i => (
                                    <span key={i} style={{width:3,height:9,background:i<nbBars?barColor:"#E0DED7",borderRadius:1}}/>
                                  ))}
                                </span>
                                Confiance {conf}
                              </div>
                            );
                          })()}
                        </div>
                        {/* Grille infos â 3 colonnes aÃ©rÃ©es */}
                        <div style={{padding:"18px 22px",display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:"14px 20px"}}>
                          {extracted.nom&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Client</span>
                              <span style={valueStyle}>{extracted.nom}{extracted.entreprise?` â ${extracted.entreprise}`:""}</span>
                            </div>
                          )}
                          {extracted.typeEvenement&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>ÃvÃ©nement</span>
                              <span style={valueStyle}>{extracted.typeEvenement}</span>
                            </div>
                          )}
                          {extracted.nombrePersonnes&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Convives</span>
                              <span style={valueStyle}>{extracted.nombrePersonnesMin&&extracted.nombrePersonnesMin!==extracted.nombrePersonnes?`${extracted.nombrePersonnesMin}â${extracted.nombrePersonnes}`:extracted.nombrePersonnes} personnes</span>
                            </div>
                          )}
                          {extracted.dateDebut&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Date</span>
                              <span style={valueStyle}>{extracted.dateDebut}{extracted.heureDebut?` Â· ${extracted.heureDebut}${extracted.heureFin?` â ${extracted.heureFin}`:""}`:""}</span>
                            </div>
                          )}
                          {espace&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Espace suggÃ©rÃ©</span>
                              <span style={{...valueStyle,color:"#B8924F"}}>{espace.nom} Â· disponible</span>
                            </div>
                          )}
                          {extracted.budget&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Budget</span>
                              <span style={valueStyle}>{extracted.budget}</span>
                            </div>
                          )}
                        </div>
                        {/* Footer â action unique "Ajouter au planning" */}
                        <div style={{padding:"14px 18px",borderTop:"1px solid rgba(107,138,91,0.12)",background:"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",gap:10}}>
                          {!alreadyIn&&(
                            <button onClick={openPlanForm} style={{padding:"9px 14px",borderRadius:10,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,letterSpacing:"-0.005em",transition:"all .14s ease"}}>
                              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1.5 5.5h11M4.5 1v2.5M9.5 1v2.5M7 8v3M5.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                              Ajouter au planning
                            </button>
                          )}
                          {alreadyIn&&(
                            <button onClick={()=>{setSelResaGeneral(alreadyIn);setView("general");}} style={{padding:"9px 14px",borderRadius:10,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,transition:"all .14s ease"}}>
                              Voir l'Ã©vÃ©nement â
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Formulaire planning â v3 Apple Mail 2026 */}
                  {showPlanForm && (()=>{
                    const espaceNom = ESPACES.find(e=>e.id===planForm.espaceId)?.nom || "";
                    const grpLabel = {fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:9,fontFamily:"'Geist','system-ui',sans-serif"};
                    const fieldLabel = (hasErr:boolean) => ({fontSize:12,color:hasErr?"#A84B45":"#6B6B72",marginBottom:5,display:"inline-flex",alignItems:"center",gap:5,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:400});
                    const req = {color:"#A84B45",fontSize:12,fontWeight:500};
                    const aiBadge = {display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:"#B8924F",background:"rgba(184,146,79,0.12)",padding:"1px 6px",borderRadius:100,marginLeft:"auto",fontWeight:500,letterSpacing:"0.02em",textTransform:"uppercase" as const,fontFamily:"'Geist','system-ui',sans-serif"};
                    const inputStyle = {width:"100%",padding:"9px 12px",border:"1px solid #EBEAE5",borderRadius:8,background:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13.5,color:"#1A1A1E",outline:"none",transition:"border-color .12s ease"};
                    return (
                    <div style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:14,overflow:"hidden",marginBottom:18,boxShadow:"0 1px 3px rgba(15,15,20,0.06)"}}>
                      {/* Header : icÃ´ne + titre Fraunces + sous-titre IA */}
                      <div style={{padding:"16px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #EBEAE5"}}>
                        <div style={{display:"flex",alignItems:"center",gap:12}}>
                          <div style={{width:36,height:36,borderRadius:10,background:"rgba(184,146,79,0.12)",color:"#B8924F",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M1.5 5.5h11M4.5 1v2.5M9.5 1v2.5M7 8v3M5.5 9.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                          </div>
                          <div>
                            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:17,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.01em",lineHeight:1.2}}>CrÃ©er l'Ã©vÃ©nement</div>
                            <div style={{fontSize:11.5,color:"#6B6B72",marginTop:2,display:"inline-flex",alignItems:"center",gap:5,fontFamily:"'Geist','system-ui',sans-serif"}}>
                              <span style={{fontSize:11,color:"#B8924F"}}>â¦</span>
                              PrÃ©-rempli par ARCHANGE â vÃ©rifiez et complÃ©tez
                            </div>
                          </div>
                        </div>
                        <button onClick={()=>setShowPlanForm(false)} title="Annuler" style={{width:30,height:30,borderRadius:6,border:"none",background:"transparent",color:"#6B6B72",cursor:"pointer",fontSize:18,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>Ã</button>
                      </div>

                      {/* AperÃ§u sage temps rÃ©el */}
                      {(planForm.prenom || planForm.nom || planForm.nombrePersonnes || planForm.dateDebut) && (
                        <div style={{margin:"16px 22px 0",padding:"12px 16px",background:"#F6F9F3",border:"1px solid rgba(107,138,91,0.22)",borderRadius:10,display:"flex",alignItems:"flex-start",gap:10}}>
                          <span style={{color:"#3F5B32",fontSize:13,marginTop:1,flexShrink:0}}>â¦</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:10,fontWeight:500,color:"#3F5B32",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3,fontFamily:"'Geist','system-ui',sans-serif"}}>AperÃ§u de l'Ã©vÃ©nement</div>
                            <div style={{fontSize:13,color:"#6B6B72",lineHeight:1.55,fontFamily:"'Geist','system-ui',sans-serif"}}>
                              {(planForm.prenom || planForm.nom) && <span style={{color:"#1A1A1E",fontWeight:500}}>{[planForm.prenom,planForm.nom].filter(Boolean).join(" ")}</span>}
                              {planForm.entreprise && <span style={{color:"#A5A4A0"}}> ({planForm.entreprise})</span>}
                              {planForm.nombrePersonnes && <><span style={{margin:"0 7px",color:"#A5A4A0"}}>Â·</span><span style={{color:"#1A1A1E",fontWeight:500}}>{planForm.nombrePersonnes} personnes</span></>}
                              {planForm.dateDebut && <><span style={{margin:"0 7px",color:"#A5A4A0"}}>Â·</span><span style={{color:"#1A1A1E",fontWeight:500,fontVariantNumeric:"tabular-nums"}}>{planForm.dateDebut}</span></>}
                              {planForm.heureDebut && <><span style={{margin:"0 7px",color:"#A5A4A0"}}>Â·</span><span style={{fontVariantNumeric:"tabular-nums"}}>{planForm.heureDebut}{planForm.heureFin?` â ${planForm.heureFin}`:""}</span></>}
                              {espaceNom && <><span style={{margin:"0 7px",color:"#A5A4A0"}}>Â·</span><span>{espaceNom}</span></>}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Corps : groupes logiques */}
                      <div style={{padding:"20px 22px 18px"}}>

                        {/* GROUPE CLIENT */}
                        <div style={{marginBottom:18}}>
                          <div style={grpLabel}>Client</div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12}}>
                            <div>
                              <label style={fieldLabel(!!planErrors.prenom)}>PrÃ©nom<span style={req}>*</span>{planFormAI.prenom&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <input value={planForm.prenom||""} onChange={e=>setPlanForm({...planForm,prenom:e.target.value})} placeholder="PrÃ©nom" style={{...inputStyle,borderColor:planErrors.prenom?"#A84B45":"#EBEAE5"}}/>
                              {planErrors.prenom&&<div style={{fontSize:11,color:"#A84B45",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>â  {planErrors.prenom}</div>}
                            </div>
                            <div>
                              <label style={fieldLabel(!!planErrors.nom)}>Nom<span style={req}>*</span>{planFormAI.nom&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <input value={planForm.nom||""} onChange={e=>setPlanForm({...planForm,nom:e.target.value})} placeholder="Nom" style={{...inputStyle,borderColor:planErrors.nom?"#A84B45":"#EBEAE5"}}/>
                              {planErrors.nom&&<div style={{fontSize:11,color:"#A84B45",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>â  {planErrors.nom}</div>}
                            </div>
                            <div>
                              <label style={fieldLabel(false)}>SociÃ©tÃ©{planFormAI.entreprise&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <input value={planForm.entreprise||""} onChange={e=>setPlanForm({...planForm,entreprise:e.target.value})} placeholder="Optionnel" style={inputStyle}/>
                            </div>
                          </div>
                        </div>

                        {/* GROUPE QUAND */}
                        <div style={{marginBottom:18}}>
                          <div style={grpLabel}>Quand</div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12}}>
                            <div>
                              <label style={fieldLabel(!!planErrors.dateDebut)}>Date<span style={req}>*</span>{planFormAI.dateDebut&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <DatePicker value={planForm.dateDebut||""} onChange={v=>setPlanForm({...planForm,dateDebut:v})}/>
                              {planErrors.dateDebut&&<div style={{fontSize:11,color:"#A84B45",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>â  {planErrors.dateDebut}</div>}
                            </div>
                            <div>
                              <label style={fieldLabel(!!planErrors.heureDebut)}>Heure de dÃ©but<span style={req}>*</span>{planFormAI.heureDebut&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <TimePicker value={planForm.heureDebut||""} onChange={v=>setPlanForm({...planForm,heureDebut:v})} placeholder="Heure de dÃ©but"/>
                              {planErrors.heureDebut&&<div style={{fontSize:11,color:"#A84B45",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>â  {planErrors.heureDebut}</div>}
                            </div>
                            <div>
                              <label style={fieldLabel(!!planErrors.heureFin)}>Heure de fin<span style={req}>*</span>{planFormAI.heureFin&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <TimePicker value={planForm.heureFin||""} onChange={v=>setPlanForm({...planForm,heureFin:v})} placeholder="Heure de fin"/>
                              {planErrors.heureFin&&<div style={{fontSize:11,color:"#A84B45",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>â  {planErrors.heureFin}</div>}
                            </div>
                          </div>
                        </div>

                        {/* GROUPE INVITÃS */}
                        <div style={{marginBottom:18}}>
                          <div style={grpLabel}>InvitÃ©s</div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
                            <div>
                              <label style={fieldLabel(!!planErrors.nombrePersonnes)}>Nombre de personnes<span style={req}>*</span>{planFormAI.nombrePersonnes&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <input type="number" min="1" value={planForm.nombrePersonnes||""} onChange={e=>setPlanForm({...planForm,nombrePersonnes:e.target.value})} placeholder="Ex: 50" style={{...inputStyle,fontVariantNumeric:"tabular-nums",borderColor:planErrors.nombrePersonnes?"#A84B45":"#EBEAE5"}}/>
                              {planErrors.nombrePersonnes&&<div style={{fontSize:11,color:"#A84B45",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>â  {planErrors.nombrePersonnes}</div>}
                            </div>
                            <div>
                              <label style={fieldLabel(false)}>Type d'Ã©vÃ©nement{planFormAI.typeEvenement&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <input value={planForm.typeEvenement||""} onChange={e=>setPlanForm({...planForm,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, DÃ®nerâ¦" style={inputStyle}/>
                            </div>
                          </div>
                        </div>

                        {/* GROUPE LIEU & BUDGET */}
                        <div style={{marginBottom:18}}>
                          <div style={grpLabel}>Lieu & budget</div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
                            <div>
                              <label style={fieldLabel(false)}>Espace{planFormAI.espaceId&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <select value={planForm.espaceId||espacesDyn[0]?.id||""} onChange={e=>setPlanForm({...planForm,espaceId:e.target.value})} style={inputStyle}>
                                {ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={fieldLabel(false)}>Budget client{planFormAI.budget&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                              <input value={planForm.budget||""} onChange={e=>setPlanForm({...planForm,budget:e.target.value})} placeholder="Ex: 5 000â¬, 45â¬/persâ¦" style={inputStyle}/>
                            </div>
                          </div>
                        </div>

                        {/* GROUPE STATUT â Point 1 */}
                        <div style={{marginBottom:18}}>
                          <div style={grpLabel}>Statut</div>
                          <div>
                            <label style={fieldLabel(false)}>
                              Ãtat de la demande
                              {extracted?.statutSuggere && planForm.statut===extracted.statutSuggere && <span style={aiBadge}>â¦ ARCHANGE</span>}
                            </label>
                            <select value={planForm.statut||"nouveau"} onChange={e=>setPlanForm({...planForm,statut:e.target.value})} style={inputStyle}>
                              {statuts.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* GROUPE NOTES */}
                        <div>
                          <div style={grpLabel}>Notes</div>
                          <div>
                            <label style={{...fieldLabel(false),marginBottom:0,display:planFormAI.notes?"inline-flex":"none"}}>{planFormAI.notes&&<span style={aiBadge}>â¦ ARCHANGE</span>}</label>
                            <textarea value={planForm.notes||""} onChange={e=>setPlanForm({...planForm,notes:e.target.value})} rows={3} placeholder="Informations complÃ©mentaires, demandes spÃ©cifiquesâ¦" style={{...inputStyle,resize:"vertical",minHeight:64,lineHeight:1.55}}/>
                          </div>
                        </div>
                      </div>

                      {/* Footer : raccourcis Ã  gauche, actions Ã  droite */}
                      <div style={{padding:"14px 22px",borderTop:"1px solid #EBEAE5",background:"#FAFAF7",display:"flex",alignItems:"center",gap:8}}>
                        <div style={{fontSize:11.5,color:"#A5A4A0",display:"inline-flex",alignItems:"center",gap:9,flexWrap:"wrap",fontFamily:"'Geist','system-ui',sans-serif"}}>
                          <span><kbd style={{fontFamily:"inherit",fontSize:10.5,padding:"2px 6px",border:"1px solid #EBEAE5",borderRadius:4,background:"#FFFFFF",color:"#6B6B72",fontWeight:500,margin:"0 2px"}}>â</kbd><kbd style={{fontFamily:"inherit",fontSize:10.5,padding:"2px 6px",border:"1px solid #EBEAE5",borderRadius:4,background:"#FFFFFF",color:"#6B6B72",fontWeight:500,margin:"0 2px"}}>â©</kbd> crÃ©er</span>
                          <span style={{color:"#E0DED7"}}>Â·</span>
                          <span><kbd style={{fontFamily:"inherit",fontSize:10.5,padding:"2px 6px",border:"1px solid #EBEAE5",borderRadius:4,background:"#FFFFFF",color:"#6B6B72",fontWeight:500,margin:"0 2px"}}>Esc</kbd> annuler</span>
                        </div>
                        <div style={{flex:1}}/>
                        <button onClick={()=>setShowPlanForm(false)} style={{padding:"9px 13px",borderRadius:10,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12.5,fontWeight:500,cursor:"pointer",transition:"all .14s ease"}}>Annuler</button>
                        <button onClick={submitPlanForm} style={{padding:"9px 16px",borderRadius:10,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,letterSpacing:"-0.005em",boxShadow:"0 1px 2px rgba(184,146,79,0.2)",transition:"all .14s ease"}}>
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          CrÃ©er l'Ã©vÃ©nement
                        </button>
                      </div>
                    </div>
                    );
                  })()}


                  {/* ââ Corps email â Reader v3 ââ */}
                  {/* 1a â Bandeau rÃ©sumÃ© IA ARCHANGE (si extraction dispo et isReservation) */}
                  {(()=>{const ext=repliesCache[sel.id]?.extracted; return ext?.isReservation&&ext?.resume&&(
                    <div style={{margin:"18px 32px 0",padding:"12px 16px",background:"rgba(107,138,91,0.06)",border:"1px solid rgba(107,138,91,0.18)",borderRadius:10,display:"flex",gap:10,alignItems:"flex-start"}}>
                      <span style={{fontSize:13,flexShrink:0,marginTop:1,color:"#3F5B32"}}>â¦</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,fontWeight:500,color:"#3F5B32",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3,fontFamily:"'Geist','system-ui',sans-serif"}}>RÃ©sumÃ© ARCHANGE</div>
                        <div style={{fontSize:13,color:"#4A4A52",lineHeight:1.55,fontFamily:"'Geist','system-ui',sans-serif"}}>{ext.resume}</div>
                      </div>
                    </div>
                  );})()}
                  <div style={{marginBottom:16}}>
                    {sel.bodyHtml ? (
                      <iframe
                        key={sel.id}
                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;}html,body{margin:0;padding:0;background:#F5F4F0;}body{font-family:'Fraunces',Georgia,serif;font-size:16px;color:#4A4A52;line-height:1.7;word-break:break-word;overflow-wrap:break-word;padding:0;}img{max-width:100%!important;height:auto!important;}a{color:#B8924F;}table{max-width:100%!important;border-collapse:collapse;}td,th{word-break:break-word;}table[width="100%"]{width:100%!important;}img[width="1"],img[height="1"],img[width="0"],img[height="0"]{display:none!important;}</style></head><body>${sel.bodyHtml}</body></html>`}
                        sandbox="allow-same-origin allow-popups"
                        style={{width:"100%",border:"none",display:"block",minHeight:100,background:"#F5F4F0"}}
                        onLoad={e=>{const f=e.currentTarget;try{const h=f.contentDocument?.documentElement?.scrollHeight||f.contentDocument?.body?.scrollHeight||400;f.style.height=(h+20)+"px";}catch{}}}
                      />
                    ) : (
                      <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:16,color:"#4A4A52",lineHeight:1.7,whiteSpace:"pre-wrap"}}>
                        {renderPlainText(sel.body||sel.snippet||"")}
                      </div>
                    )}

                    {/* PiÃ¨ces jointes */}
                    {(sel.attachments||[]).length > 0 && (
                      <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid #EBEAE5"}}>
                        <div style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"#6B6E7E",marginBottom:8,fontFamily:"'Geist','system-ui',sans-serif"}}>PiÃ¨ces jointes Â· {sel.attachments.length}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                          {sel.attachments.map((att: any, i: number) => {
                            const ext = (att.filename||att.name||"").split(".").pop()?.toLowerCase() || "";
                            const icons: Record<string,string> = {pdf:"ð",doc:"ð",docx:"ð",xls:"ð",xlsx:"ð",ppt:"ð",pptx:"ð",jpg:"ð¼",jpeg:"ð¼",png:"ð¼",gif:"ð¼",webp:"ð¼",zip:"ð",csv:"ð",txt:"ð"};
                            const icon = icons[ext] || "ð";
                            const size = att.size ? (att.size > 1048576 ? (att.size/1048576).toFixed(1)+" Mo" : Math.round(att.size/1024)+" Ko") : "";
                            return (
                              <div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 10px",background:"#FAFAF7",borderRadius:2,border:"1px solid #EBEAE5",cursor:"pointer"}} onClick={async()=>{
                                if (att.id && sel?.gmailId) {
                                  // TÃ©lÃ©chargement via /api/gmail/attachment
                                  try {
                                    const url = `/api/gmail/attachment?gmailId=${encodeURIComponent(sel.gmailId)}&attachmentId=${encodeURIComponent(att.id)}&filename=${encodeURIComponent(att.filename||att.name||"attachment")}`;
                                    const a = document.createElement("a");
                                    a.href = url; a.download = att.filename||att.name||"attachment";
                                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                  } catch { toast("Erreur tÃ©lÃ©chargement", "err"); }
                                } else if (att.url) {
                                  window.open(att.url, "_blank");
                                }
                              }}>
                                <span style={{fontSize:14}}>{icon}</span>
                                <div>
                                  <div style={{fontSize:11,fontWeight:500,color:"#1A1A1E",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{att.filename||att.name||"PiÃ¨ce jointe"}</div>
                                  {size&&<div style={{fontSize:9.5,color:"#6B6E7E"}}>{size}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ââ Ãditeur de rÃ©ponse manuelle Reader v3 ââ */}
                  {showReplyEditor&&(
                    <div style={{background:"#FFFFFF",borderRadius:14,border:"1px solid #EBEAE5",overflow:"hidden",marginBottom:18,boxShadow:"0 1px 3px rgba(15,15,20,0.04)"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d={replyEditorMode==="forward"?"M2 10l4-4L2 2M12 2v4a3 3 0 01-3 3H3":"M12 10L8 6l4-4M2 2v4a3 3 0 003 3h6"} stroke="#1A1A1E" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          <span style={{fontSize:12,fontWeight:500,color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",letterSpacing:"-0.005em"}}>
                            {replyEditorMode==="reply"?"RÃ©pondre":replyEditorMode==="replyAll"?"RÃ©pondre Ã  tous":"TransfÃ©rer"}
                          </span>
                        </div>
                        <button onClick={()=>{if(replyEditorText.trim()&&!window.confirm("Fermer ?"))return;setShowReplyEditor(false);setReplyEditorText("");}} title="Fermer" style={{width:28,height:28,borderRadius:6,border:"none",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:16,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>Ã</button>
                      </div>
                      <div style={{padding:"10px 18px",borderBottom:"1px solid #EBEAE5",display:"flex",alignItems:"center",gap:9,background:"#FFFFFF"}}>
                        <span style={{fontSize:11,color:"#A5A4A0",fontWeight:500,flexShrink:0,fontFamily:"'Geist','system-ui',sans-serif"}}>Ã</span>
                        <input value={replyEditorTo} onChange={e=>setReplyEditorTo(e.target.value)} style={{flex:1,border:"none",outline:"none",fontSize:13,color:"#1A1A1E",background:"transparent",fontFamily:"'Geist','system-ui',sans-serif"}} placeholder="destinataire@exemple.com"/>
                      </div>
                      <textarea value={replyEditorText} onChange={e=>setReplyEditorText(e.target.value)} style={{width:"100%",minHeight:200,padding:"16px 18px",fontFamily:"'Geist','system-ui',sans-serif",fontSize:14,color:"#1A1A1E",lineHeight:1.65,border:"none",outline:"none",resize:"vertical",background:"transparent"}} placeholder="Votre rÃ©ponseâ¦" autoFocus/>
                      <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 18px",borderTop:"1px solid #EBEAE5",background:"#FAFAF7"}}>
                        <button onClick={sendReply} disabled={sending||!replyEditorTo.trim()||!replyEditorText.trim()} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",fontSize:13,fontWeight:500,cursor:sending?"wait":"pointer",display:"inline-flex",alignItems:"center",gap:6,opacity:sending||!replyEditorTo.trim()||!replyEditorText.trim()?0.5:1,letterSpacing:"-0.005em",fontFamily:"'Geist','system-ui',sans-serif",transition:"all .14s ease"}}>
                          {sending?<><Spin s={11}/> Envoiâ¦</>:<><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 7L13 1L9.5 13L7 8L1 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> Envoyer</>}
                        </button>
                        <button onClick={saveDraft} style={{padding:"8px 13px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontSize:12.5,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,transition:"all .14s ease"}}>Brouillon</button>
                        <div style={{flex:1}}/>
                        <button onClick={()=>{if(replyEditorText.trim()&&!window.confirm("Fermer ?"))return;setShowReplyEditor(false);setReplyEditorText("");}} style={{padding:"8px 12px",borderRadius:8,border:"none",background:"transparent",color:"#6B6E7E",fontSize:12.5,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",transition:"color .14s ease"}}>Annuler</button>
                      </div>
                    </div>
                  )}

                  {/* ââ RÃ©ponse ARCHANGE Reader v3 â palette dorÃ©e subtile ââ */}
                  <div style={{background:"linear-gradient(180deg, rgba(184,146,79,0.04) 0%, #FFFFFF 50%)",borderRadius:14,border:"1px solid rgba(184,146,79,0.22)",overflow:"hidden",boxShadow:"0 2px 6px rgba(184,146,79,0.06)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",borderBottom:"1px solid rgba(184,146,79,0.15)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14,color:"#B8924F",lineHeight:1}}>â¦</span>
                        <span style={{fontSize:10.5,fontWeight:500,color:"#B8924F",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>RÃ©ponse ARCHANGE</span>
                        {genReply&&<Spin s={11}/>}
                      </div>
                      {srcActives>0&&(
                        <span style={{fontSize:11,color:"#6B6E7E",fontFamily:"'Geist','system-ui',sans-serif",display:"inline-flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:12}}>ð§ </span>
                          <span><strong style={{fontWeight:500,color:"#1A1A1E",fontVariantNumeric:"tabular-nums"}}>{srcActives}</strong> source{srcActives>1?"s":""}</span>
                        </span>
                      )}
                    </div>
                    {/* ââ Bandeau notification troncatures (visible UNIQUEMENT si dÃ©passement rÃ©el) ââ */}
                    {sel && truncations[sel.id] && truncations[sel.id].length > 0 && (
                      <div style={{
                        padding:"11px 18px",
                        background:"rgba(184,146,79,0.06)",
                        borderBottom:"1px solid rgba(184,146,79,0.15)",
                        display:"flex",
                        alignItems:"flex-start",
                        gap:10,
                      }}>
                        <span style={{fontSize:14,lineHeight:1.4,flexShrink:0,marginTop:1,color:"#B8924F"}}>â </span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11.5,fontWeight:500,color:"#8B6914",fontFamily:"'Geist','system-ui',sans-serif",letterSpacing:"0.02em",marginBottom:4}}>
                            Contenu tronquÃ© â ARCHANGE n'a vu qu'une partie de {truncations[sel.id].length === 1 ? "cet Ã©lÃ©ment" : "ces Ã©lÃ©ments"}
                          </div>
                          <div style={{fontSize:11,color:"#6B6E7E",fontFamily:"'Geist','system-ui',sans-serif",lineHeight:1.6,fontVariantNumeric:"tabular-nums"}}>
                            {truncations[sel.id].map((t, i) => (
                              <div key={i}>
                                â¢ <strong style={{color:"#1A1A1E",fontWeight:500}}>{t.label}</strong> : {t.actuel.toLocaleString("fr-FR")} caractÃ¨res prÃ©sents,
                                {" "}<strong style={{color:"#1A1A1E",fontWeight:500}}>{t.limite.toLocaleString("fr-FR")} envoyÃ©s</strong>
                                {" "}<span style={{color:"#A5A4A0"}}>({Math.round((t.limite/t.actuel)*100)}% transmis)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {genReply
                      ? <div style={{padding:"24px",fontSize:13,color:"#6B6E7E",display:"flex",alignItems:"center",gap:10,fontFamily:"'Geist','system-ui',sans-serif",justifyContent:"center"}}><Spin/> Archange rÃ©digeâ¦</div>
                      : !reply
                        ? <div style={{padding:"28px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
                            <div style={{fontSize:13,color:"#6B6E7E",textAlign:"center",fontFamily:"'Geist','system-ui',sans-serif",lineHeight:1.5,maxWidth:320}}>Cliquez pour qu'Archange rÃ©dige une rÃ©ponse adaptÃ©e au contexte de cet email.</div>
                            <button onClick={genererReponse} disabled={genReply} style={{padding:"9px 18px",borderRadius:10,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontSize:13,fontWeight:500,cursor:"pointer",letterSpacing:"-0.005em",display:"inline-flex",alignItems:"center",gap:7,fontFamily:"'Geist','system-ui',sans-serif",transition:"all .14s ease",boxShadow:"0 1px 2px rgba(184,146,79,0.2)"}}>
                              {genReply?<><Spin s={11}/> GÃ©nÃ©rationâ¦</>:<>â¦ GÃ©nÃ©rer une rÃ©ponse</>}
                            </button>
                          </div>
                        : editing
                          ? <textarea value={editReply} onChange={e=>setEditReply(e.target.value)} style={{width:"100%",padding:"18px 22px",fontFamily:"'Geist','system-ui',sans-serif",fontSize:14,color:"#1A1A1E",lineHeight:1.65,border:"none",outline:"none",resize:"vertical",background:"transparent",minHeight:200}}/>
                          : <div style={{padding:"20px 22px",fontFamily:"'Fraunces',Georgia,serif",fontSize:15,color:"#1A1A1E",lineHeight:1.75,whiteSpace:"pre-wrap"}}>
                              {reply}
                              {repliesCache[sel?.id]?.dateGen&&<div style={{marginTop:14,fontSize:11,color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif"}}>GÃ©nÃ©rÃ©e le <span style={{fontVariantNumeric:"tabular-nums"}}>{repliesCache[sel.id].dateGen}</span></div>}
                            </div>
                    }
                    <div style={{display:"flex",gap:8,padding:"12px 18px",borderTop:"1px solid rgba(184,146,79,0.15)",background:"rgba(255,255,255,0.6)",flexWrap:"wrap"}}>
                      {reply && <><button onClick={async()=>{
                        const replyText = editing ? editReply : reply;
                        const subject = sel.subject?.startsWith("Re:") ? sel.subject : `Re: ${sel.subject||""}`;
                        // Fix #6 â appel direct /api/gmail/draft
                        try {
                          const res = await apiFetch("/api/gmail/draft", {
                            method:"POST",
                            headers:{"Content-Type":"application/json"},
                            body: JSON.stringify({ to: sel.fromEmail, subject, body: replyText })
                          });
                          if (res.ok) toast("Brouillon crÃ©Ã© dans Gmail â");
                          else toast("Erreur crÃ©ation brouillon", "err");
                        } catch { toast(humanError(new Error("network")), "err"); }
                        setDrafted(p=>new Set([...p,sel.id]));
                        const upd = { ...sentReplies, [sel.id]: { text: replyText, date: new Date().toLocaleDateString("fr-FR"), subject: sel.subject||"", toEmail: sel.fromEmail||"" }};
                        saveSentReplies(upd);
                      }} disabled={genReply} style={{...gold}}>CrÃ©er le brouillon</button>
                      {sel?.fromEmail&&<button onClick={()=>{
                        const replyText = editing ? editReply : reply;
                        const subject = sel.subject?.startsWith("Re:") ? sel.subject : `Re: ${sel.subject||""}`;
                        const body = encodeURIComponent(replyText);
                        window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(sel.fromEmail)}&su=${encodeURIComponent(subject)}&body=${body}`, "_blank");
                        setDrafted(p=>new Set([...p,sel.id]));
                        // Sauvegarder la rÃ©ponse dans l'historique
                        const upd = { ...sentReplies, [sel.id]: { text: replyText, date: new Date().toLocaleDateString("fr-FR"), subject: subject, toEmail: sel.fromEmail||"" }};
                        saveSentReplies(upd);
                        toast("Gmail ouvert â");
                      }} disabled={genReply} style={{...gold,background:"#1a73e8",color:"#fff",boxShadow:"0 2px 8px rgba(26,115,232,.3)"}}>â Ouvrir dans Gmail</button>}
                      <button onClick={()=>{ if(editing){setReply(editReply);setEditing(false);if(sel)setRepliesCache(prev=>({...prev,[sel.id]:{...prev[sel.id],reply:editReply,editReply}}));}else{setEditing(true);setEditReply(reply);} }} disabled={genReply} style={{...out}}>{editing?"Valider":"Modifier"}</button>
                      <button onClick={genererReponse} disabled={genReply} style={{...out,color:"#6B6E7E",display:"flex",alignItems:"center",gap:5}}>{genReply?<><Spin s={11}/> En coursâ¦</>:"â» RegÃ©nÃ©rer"}</button></>}
                    </div>
                  </div>
                </div>
              )}
            </div>}
          </>
        )}

        {/* ââ PLANNING v3 â Apple Mail 2026 ââ */}
        {view==="planning" && (()=>{
          const today = new Date();
          const todayStr = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
          const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(calWeekStart); d.setDate(d.getDate()+i); return d; });
          const fmtDate = (d: Date) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");

          const resasForDate = (ds:string) => resas.filter(r => {
            if(r.dateDebut!==ds) return false;
            // Filtre statut multi â Point 2
            if(filtresStatutsPlanning.length > 0 && !filtresStatutsPlanning.includes(r.statut||"nouveau")) return false;
            if(planEspaceFilter!=="all" && r.espaceId!==planEspaceFilter) return false;
            return true;
          });

          const calDayStr = fmtDate(calDate);
          const dayResas = resasForDate(calDayStr);
          const kpi = computePlanningKPIs(calDate);

          // Header contextuel selon la vue
          const headSubtitle =
            calView==="mois" ? `${kpi.total} Ã©vÃ©nement${kpi.total!==1?"s":""} Â· ${MOIS[calDate.getMonth()]} ${calDate.getFullYear()}` :
            calView==="semaine" ? `Semaine du ${weekDays[0].getDate()} ${MOIS[weekDays[0].getMonth()].slice(0,3)} â ${weekDays[6].getDate()} ${MOIS[weekDays[6].getMonth()].slice(0,3)}` :
            `${dayResas.length} Ã©vÃ©nement${dayResas.length!==1?"s":""} Â· ${["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"][calDate.getDay()]}. ${calDate.getDate()} ${MOIS[calDate.getMonth()].toLowerCase()}`;

          const periodLabel =
            calView==="mois" ? `${MOIS[calDate.getMonth()]} ${calDate.getFullYear()}` :
            calView==="semaine" ? `${weekDays[0].getDate()} ${MOIS[weekDays[0].getMonth()].slice(0,3)} â ${weekDays[6].getDate()} ${MOIS[weekDays[6].getMonth()].slice(0,3)} ${weekDays[6].getFullYear()}` :
            `${["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"][calDate.getDay()]}. ${calDate.getDate()} ${MOIS[calDate.getMonth()]} ${calDate.getFullYear()}`;

          // Composant carte jour (rÃ©utilise pattern vue ÃvÃ©nements v3)
          const DayEventCard = ({r}:{r:any}) => {
            const st = statuts.find(s=>s.id===(r.statut||"nouveau"))||statuts[0]||{bg:"#F5F4F0",color:"#6B6B72",label:"â"};
            const espace = ESPACES.find(e=>e.id===r.espaceId);
            const fullName = displayNom(r);
            return (
              <div onClick={()=>{ setSelResaGeneral(r); setResaOnglet("infos"); }} style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .14s ease",display:"flex",alignItems:"center",gap:14,boxShadow:"0 1px 2px rgba(15,15,20,0.04)"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:st.color,flexShrink:0}}/>
                <Avatar name={fullName} size={38}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:5}}>
                    <div style={{fontSize:13.5,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.005em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:"'Geist','system-ui',sans-serif"}}>{fullName}</div>
                    {r.entreprise&&<div style={{fontSize:12,color:"#6B6B72",whiteSpace:"nowrap",fontFamily:"'Geist','system-ui',sans-serif"}}>Â· {r.entreprise}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    {(r.heureDebut||r.heureFin)&&<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,color:"#6B6B72",background:"#F5F4F0",padding:"3px 9px",borderRadius:6,fontVariantNumeric:"tabular-nums",fontFamily:"'Geist','system-ui',sans-serif"}}><svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.3"/></svg>{r.heureDebut||"?"}{r.heureFin?" â "+r.heureFin:""}</span>}
                    {r.nombrePersonnes&&<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,color:"#6B6B72",background:"#F5F4F0",padding:"3px 9px",borderRadius:6,fontVariantNumeric:"tabular-nums",fontFamily:"'Geist','system-ui',sans-serif"}}><svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>{r.nombrePersonnes} pers.</span>}
                    <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,color:espace?"#6B6B72":"#A5A4A0",background:"#F5F4F0",padding:"3px 9px",borderRadius:6,fontFamily:"'Geist','system-ui',sans-serif",opacity:espace?1:0.6}}><svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><path d="M7 12.5s3.8-3.4 3.8-7A3.8 3.8 0 107 1.7c0 3.5 3.8 7 3.8 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7" cy="5.3" r="1.3" stroke="currentColor" strokeWidth="1.3"/></svg>{espace?.nom||"Espace Ã  dÃ©finir"}</span>
                    {r.budget&&<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,color:"#B8924F",background:"#F4EEDF",padding:"3px 9px",borderRadius:6,fontWeight:500,fontFamily:"'Geist','system-ui',sans-serif"}}>{r.budget}</span>}
                    {r.typeEvenement&&<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,color:"#6B6B72",background:"#F5F4F0",padding:"3px 9px",borderRadius:6,fontFamily:"'Geist','system-ui',sans-serif"}}>{r.typeEvenement}</span>}
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                  <span style={{fontSize:10.5,fontWeight:500,padding:"3px 10px",borderRadius:100,background:st.bg,color:st.color,letterSpacing:"0.02em",fontFamily:"'Geist','system-ui',sans-serif"}}>{st.label}</span>
                </div>
              </div>
            );
          };

          return (
            <div style={{display:"flex",flex:1,overflow:"hidden",background:"#FAFAF7"}}>
              <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

                {/* Header */}
                <div style={{padding:"22px 28px 14px",flexShrink:0,display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16}}>
                  <div>
                    <h1 style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:28,fontWeight:400,color:"#1A1A1E",letterSpacing:"-0.02em",lineHeight:1.1,margin:0}}>Planning</h1>
                    <div style={{fontSize:12.5,color:"#6B6B72",marginTop:4,fontFamily:"'Geist','system-ui',sans-serif"}}>{headSubtitle}</div>
                  </div>
                  <button onClick={()=>{ setNewEvent({...EMPTY_RESA, espaceId: espacesDyn[0]?.id || "", dateDebut: calView==="jour"?calDayStr:""}); setNewEventErrors({}); setShowNewEvent(true); }} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"9px 14px",borderRadius:8,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",boxShadow:"0 1px 2px rgba(184,146,79,0.2)",letterSpacing:"-0.005em"}}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                    Nouvelle demande
                  </button>
                </div>

                {/* Hero Dashboard 4 KPI */}
                <div style={{padding:"0 28px 18px",flexShrink:0,display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:12}}>
                  <div style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .15s ease"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <div style={{width:26,height:26,borderRadius:7,background:"#EFEAF5",color:"#6F56A8",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 5.5h11M4.5 1v2.5M9.5 1v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      </div>
                      <div style={{fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>Ce mois</div>
                    </div>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:30,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.03em",lineHeight:1,marginBottom:5,fontVariantNumeric:"tabular-nums"}}>{kpi.total}</div>
                    <div style={{fontSize:11.5,color:"#6B6B72",lineHeight:1.4,fontFamily:"'Geist','system-ui',sans-serif"}}>Ã©vÃ©nement{kpi.total!==1?"s":""}, dont <strong style={{color:"#1A1A1E",fontWeight:500}}>{kpi.confirmed} confirmÃ©{kpi.confirmed!==1?"s":""}</strong></div>
                  </div>
                  <div style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .15s ease"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <div style={{width:26,height:26,borderRadius:7,background:"#F4EEDF",color:"#B8924F",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M2 5h10M5 2v10" stroke="currentColor" strokeWidth="1.3"/></svg>
                      </div>
                      <div style={{fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>Occupation</div>
                    </div>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:30,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.03em",lineHeight:1,marginBottom:5,fontVariantNumeric:"tabular-nums"}}>{kpi.occupation} %</div>
                    <div style={{fontSize:11.5,color:"#6B6B72",lineHeight:1.4,fontFamily:"'Geist','system-ui',sans-serif"}}><strong style={{color:"#1A1A1E",fontWeight:500}}>{kpi.uniqueDays} jour{kpi.uniqueDays!==1?"s":""}</strong> sur {kpi.daysInM} avec Ã©vÃ©nement</div>
                  </div>
                  <div onClick={()=>{if(kpi.upcoming){setCalDate(new Date(kpi.upcoming.dateDebut));setCalView("jour");}}} style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,padding:"14px 16px",cursor:kpi.upcoming?"pointer":"default",transition:"all .15s ease"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <div style={{width:26,height:26,borderRadius:7,background:"#EDF2E8",color:"#3F5B32",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      </div>
                      <div style={{fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>Prochain</div>
                    </div>
                    {kpi.upcoming ? <>
                      <div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.025em",lineHeight:1,marginBottom:5,fontVariantNumeric:"tabular-nums"}}>{fmtDateFr(kpi.upcoming.dateDebut).replace(/\s\d{4}$/,"")}</div>
                      <div style={{fontSize:11.5,color:"#6B6B72",lineHeight:1.4,fontFamily:"'Geist','system-ui',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><strong style={{color:"#1A1A1E",fontWeight:500}}>{displayNom(kpi.upcoming)}</strong>{kpi.upcoming.nombrePersonnes?` Â· ${kpi.upcoming.nombrePersonnes} pers.`:""}</div>
                    </> : <>
                      <div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:500,color:"#A5A4A0",letterSpacing:"-0.025em",lineHeight:1,marginBottom:5}}>â</div>
                      <div style={{fontSize:11.5,color:"#6B6B72",lineHeight:1.4,fontFamily:"'Geist','system-ui',sans-serif"}}>Aucun Ã©vÃ©nement Ã  venir</div>
                    </>}
                  </div>
                  <div style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .15s ease"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <div style={{width:26,height:26,borderRadius:7,background:"#F4EEDF",color:"#B8924F",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10 3H5a2 2 0 000 4h4a2 2 0 010 4H3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M6.5 1.5v11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      </div>
                      <div style={{fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>PrÃ©visionnel</div>
                    </div>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:kpi.totalBudget>999?22:30,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.025em",lineHeight:1,marginBottom:5,fontVariantNumeric:"tabular-nums"}}>{kpi.totalBudget.toLocaleString("fr-FR")} â¬</div>
                    <div style={{fontSize:11.5,color:"#6B6B72",lineHeight:1.4,fontFamily:"'Geist','system-ui',sans-serif"}}><strong style={{color:"#1A1A1E",fontWeight:500}}>{MOIS[calDate.getMonth()]} {calDate.getFullYear()}</strong> Â· en cours + confirmÃ©s</div>
                  </div>
                </div>

                {/* Toolbar */}
                <div style={{padding:"0 28px 16px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,borderBottom:"1px solid #EBEAE5",paddingBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={()=>{ const n=new Date(); setCalDate(new Date(n.getFullYear(),n.getMonth(),n.getDate())); const w=new Date(n); w.setDate(w.getDate()-((w.getDay()+6)%7)); w.setHours(0,0,0,0); setCalWeekStart(w); }} style={{padding:"7px 13px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12.5,fontWeight:500,cursor:"pointer"}}>Aujourd'hui</button>
                    <button onClick={()=>{
                      if(calView==="mois") setCalDate(new Date(calDate.getFullYear(),calDate.getMonth()-1,1));
                      else if(calView==="semaine"){ const d=new Date(calWeekStart); d.setDate(d.getDate()-7); setCalWeekStart(d); }
                      else { const d=new Date(calDate); d.setDate(d.getDate()-1); setCalDate(d); }
                    }} style={{width:30,height:30,borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>â¹</button>
                    <button onClick={()=>{
                      if(calView==="mois") setCalDate(new Date(calDate.getFullYear(),calDate.getMonth()+1,1));
                      else if(calView==="semaine"){ const d=new Date(calWeekStart); d.setDate(d.getDate()+7); setCalWeekStart(d); }
                      else { const d=new Date(calDate); d.setDate(d.getDate()+1); setCalDate(d); }
                    }} style={{width:30,height:30,borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>âº</button>
                    <span style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:17,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.01em",marginLeft:6,fontVariantNumeric:"tabular-nums"}}>{periodLabel}</span>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{position:"relative"}} className="plan-statut-wrap">
                      <button onClick={e=>{const el=e.currentTarget.nextElementSibling as HTMLElement;if(el)el.style.display=el.style.display==="block"?"none":"block";}} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${filtresStatutsPlanning.length>0?"#B8924F":"#E0DED7"}`,background:filtresStatutsPlanning.length>0?"#F4EEDF":"#FFFFFF",color:filtresStatutsPlanning.length>0?"#B8924F":"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12.5,fontWeight:filtresStatutsPlanning.length>0?500:400,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}>
                        <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 3h10M4 7h6M6 11h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        {filtresStatutsPlanning.length===0?"Tous les statuts":`${filtresStatutsPlanning.length} statut${filtresStatutsPlanning.length>1?"s":""}`}
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{opacity:0.6}}><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                      <div style={{display:"none",position:"absolute",top:"calc(100% + 6px)",right:0,background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:10,boxShadow:"0 6px 24px rgba(15,15,20,0.08)",zIndex:50,minWidth:220,padding:6,fontFamily:"'Geist','system-ui',sans-serif"}}>
                        {statuts.map(s=>{const active=filtresStatutsPlanning.includes(s.id);return (
                          <button key={s.id} onClick={()=>{const next=active?filtresStatutsPlanning.filter(x=>x!==s.id):[...filtresStatutsPlanning,s.id];setFiltresStatutsPlanning(next);}} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"7px 10px",borderRadius:6,border:"none",background:active?"#F5F4F0":"transparent",color:"#1A1A1E",fontFamily:"inherit",fontSize:12.5,textAlign:"left",cursor:"pointer",transition:"background .12s ease"}}>
                            <div style={{width:14,height:14,borderRadius:4,border:`1.5px solid ${active?s.color:"#C5C3BE"}`,background:active?s.color:"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              {active&&<svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <div style={{width:7,height:7,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                            <span style={{flex:1,fontWeight:active?500:400}}>{s.label}</span>
                          </button>
                        );})}
                        {filtresStatutsPlanning.length>0 && <>
                          <div style={{height:1,background:"#EBEAE5",margin:"4px 2px"}}/>
                          <button onClick={()=>setFiltresStatutsPlanning([])} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 10px",borderRadius:6,border:"none",background:"transparent",color:"#6B6B72",fontFamily:"inherit",fontSize:12,textAlign:"left",cursor:"pointer"}}>
                            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                            RÃ©initialiser les filtres
                          </button>
                        </>}
                      </div>
                    </div>
                    <select value={planEspaceFilter} onChange={e=>setPlanEspaceFilter(e.target.value)} style={{padding:"7px 28px 7px 12px",borderRadius:8,border:`1px solid ${planEspaceFilter!=="all"?"#B8924F":"#EBEAE5"}`,background:`${planEspaceFilter!=="all"?"#F4EEDF":"#FFFFFF"} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='none'%3E%3Cpath d='M2 3.5L5 6.5L8 3.5' stroke='%236B6B72' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 10px center`,appearance:"none",WebkitAppearance:"none",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12.5,color:planEspaceFilter!=="all"?"#B8924F":"#1A1A1E",cursor:"pointer",outline:"none",fontWeight:planEspaceFilter!=="all"?500:400}}>
                      <option value="all">Tous les espaces</option>
                      {ESPACES.map(e=>(<option key={e.id} value={e.id}>{e.nom}</option>))}
                    </select>
                    <div style={{display:"inline-flex",border:"1px solid #E0DED7",background:"#FFFFFF",borderRadius:8,padding:3}}>
                      {(["mois","semaine","jour"] as const).map(v=>(
                        <button key={v} onClick={()=>setCalView(v)} style={{padding:"5px 12px",border:"none",background:calView===v?"#F5F4F0":"transparent",color:calView===v?"#1A1A1E":"#6B6B72",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12,fontWeight:500,cursor:"pointer",borderRadius:6,textTransform:"capitalize"}}>{v.charAt(0).toUpperCase()+v.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ââ VUE MOIS ââ */}
                {calView==="mois" && (
                  <div style={{flex:1,overflowY:"auto",padding:"16px 28px 28px",background:"#FAFAF7"}}>
                    <div style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,overflow:"hidden"}}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid #EBEAE5"}}>
                        {["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"].map(d=>(
                          <div key={d} style={{textAlign:"left",fontSize:10.5,color:"#A5A4A0",padding:"8px 10px",fontWeight:500,fontFamily:"'Geist','system-ui',sans-serif",textTransform:"uppercase",letterSpacing:"0.08em"}}>{d}</div>
                        ))}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                        {/* Cellules du mois prÃ©cÃ©dent (out) */}
                        {(()=>{
                          const fd = firstDay(calDate);
                          const prevMonth = new Date(calDate.getFullYear(), calDate.getMonth(), 0);
                          const prevDays = prevMonth.getDate();
                          return Array.from({length:fd}).map((_,i)=>(
                            <div key={"p"+i} style={{minHeight:110,background:"#FAFAF7",opacity:0.55,borderRight:i<fd-1||fd<7?"1px solid #EBEAE5":"none",borderBottom:"1px solid #EBEAE5",padding:"6px 8px"}}>
                              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,fontSize:13,color:"#A5A4A0",fontVariantNumeric:"tabular-nums",fontFamily:"'Geist','system-ui',sans-serif"}}>{prevDays-fd+i+1}</span>
                            </div>
                          ));
                        })()}
                        {Array.from({length:daysInMonth(calDate)}).map((_,i)=>{
                          const day=i+1;
                          const ds=calDate.getFullYear()+"-"+String(calDate.getMonth()+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
                          const dr=resasForDate(ds);
                          const isToday=ds===todayStr;
                          const col=(firstDay(calDate)+i)%7;
                          return (
                            <div key={day} style={{minHeight:110,borderRight:col<6?"1px solid #EBEAE5":"none",borderBottom:"1px solid #EBEAE5",padding:"6px 8px",background:isToday?"rgba(184,146,79,0.04)":"#FFFFFF",display:"flex",flexDirection:"column",gap:3,cursor:"pointer",transition:"background .12s ease"}} onClick={()=>{setCalDate(new Date(calDate.getFullYear(),calDate.getMonth(),day));setCalView("jour");}}>
                              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,fontSize:13,color:isToday?"#FFFFFF":"#6B6B72",fontVariantNumeric:"tabular-nums",fontWeight:isToday?500:400,background:isToday?"#B8924F":"transparent",borderRadius:"50%",boxShadow:isToday?"0 0 0 3px rgba(184,146,79,0.15)":"none",fontFamily:"'Geist','system-ui',sans-serif",marginBottom:2}}>{day}</span>
                              {dr.slice(0,3).map(r=>{
                                const st=getStatut(r);
                                const statutLabel = (st.label||"").toLowerCase();
                                const isConfirmed = statutLabel.includes("confirm") || statutLabel.includes("valid");
                                const isNouveau = statutLabel.includes("nouveau");
                                const bg = isConfirmed?"#F6F9F3":isNouveau?"#EDF2E8":st.bg||"#F5F4F0";
                                return (
                                  <div key={r.id} onClick={e=>{e.stopPropagation(); setSelResaGeneral(r); setResaOnglet("infos"); }} style={{fontSize:10.5,background:bg,padding:"2px 6px",borderRadius:4,cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",gap:5,fontFamily:"'Geist','system-ui',sans-serif"}}>
                                    <span style={{width:5,height:5,borderRadius:"50%",background:st.color,flexShrink:0}}/>
                                    {r.heureDebut&&<span style={{color:"#6B6B72",fontWeight:500,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{r.heureDebut}</span>}
                                    <span style={{fontWeight:500,color:st.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{displayNom(r)}</span>
                                  </div>
                                );
                              })}
                              {dr.length>3&&<div style={{fontSize:10.5,color:"#A5A4A0",padding:"2px 6px",cursor:"pointer",fontWeight:500,fontFamily:"'Geist','system-ui',sans-serif"}} onClick={e=>{e.stopPropagation();setCalDate(new Date(calDate.getFullYear(),calDate.getMonth(),day));setCalView("jour");}}>+ {dr.length-3} autre{dr.length-3>1?"s":""}</div>}
                            </div>
                          );
                        })}
                        {/* Cellules du mois suivant (out) */}
                        {(()=>{
                          const fd = firstDay(calDate);
                          const dim = daysInMonth(calDate);
                          const total = fd + dim;
                          const remainder = total % 7;
                          const fillCount = remainder === 0 ? 0 : 7 - remainder;
                          return Array.from({length:fillCount}).map((_,i)=>(
                            <div key={"n"+i} style={{minHeight:110,background:"#FAFAF7",opacity:0.55,borderRight:i<fillCount-1?"1px solid #EBEAE5":"none",borderBottom:"1px solid #EBEAE5",padding:"6px 8px"}}>
                              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,fontSize:13,color:"#A5A4A0",fontVariantNumeric:"tabular-nums",fontFamily:"'Geist','system-ui',sans-serif"}}>{i+1}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* ââ VUE SEMAINE ââ */}
                {calView==="semaine" && (
                  <div style={{flex:1,overflowY:"auto",padding:"16px 28px 28px",background:"#FAFAF7"}}>
                    <div style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:12,overflow:"hidden"}}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid #EBEAE5"}}>
                        {weekDays.map((d,i)=>{
                          const ds=fmtDate(d);
                          const isTd=ds===todayStr;
                          return (
                            <div key={ds} style={{textAlign:"center",padding:"12px 8px",borderLeft:i>0?"1px solid #EBEAE5":"none"}}>
                              <div style={{fontSize:10.5,color:"#A5A4A0",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>{["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"][d.getDay()===0?6:d.getDay()-1]}</div>
                              <div style={{width:30,height:30,borderRadius:"50%",background:isTd?"#B8924F":"transparent",color:isTd?"#FFFFFF":"#1A1A1E",fontSize:15,fontWeight:isTd?500:400,display:"inline-flex",alignItems:"center",justifyContent:"center",margin:"5px auto 0",fontVariantNumeric:"tabular-nums",fontFamily:"'Geist','system-ui',sans-serif",boxShadow:isTd?"0 0 0 3px rgba(184,146,79,0.15)":"none"}}>{d.getDate()}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                        {weekDays.map((d,i)=>{
                          const ds=fmtDate(d);
                          const dr=resasForDate(ds);
                          const isTd=ds===todayStr;
                          return (
                            <div key={ds} onClick={()=>{setCalDate(new Date(d));setCalView("jour");}} style={{borderLeft:i>0?"1px solid #EBEAE5":"none",minHeight:320,padding:"8px 6px",background:isTd?"rgba(184,146,79,0.03)":"transparent",cursor:"pointer",display:"flex",flexDirection:"column",gap:5}}>
                              {dr.length===0?(
                                <div style={{fontSize:11,color:"#C5C3BE",textAlign:"center",padding:"20px 4px",fontFamily:"'Geist','system-ui',sans-serif"}}>â</div>
                              ):dr.map(r=>{
                                const st=getStatut(r);
                                const espace=ESPACES.find(e=>e.id===r.espaceId);
                                const statutLabel = (st.label||"").toLowerCase();
                                const isConfirmed = statutLabel.includes("confirm") || statutLabel.includes("valid");
                                const isNouveau = statutLabel.includes("nouveau");
                                const bg = isConfirmed?"#F6F9F3":isNouveau?"#EDF2E8":st.bg||"#F5F4F0";
                                return (
                                  <div key={r.id} onClick={e=>{e.stopPropagation(); setSelResaGeneral(r); setResaOnglet("infos"); }} style={{background:bg,borderRadius:8,padding:"7px 9px",cursor:"pointer",fontSize:11,fontFamily:"'Geist','system-ui',sans-serif",display:"flex",flexDirection:"column",gap:2}}>
                                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                                      <span style={{width:5,height:5,borderRadius:"50%",background:st.color,flexShrink:0}}/>
                                      {r.heureDebut&&<span style={{fontSize:10.5,color:"#6B6B72",fontWeight:500,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{r.heureDebut}</span>}
                                    </div>
                                    <div style={{fontWeight:500,color:st.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontSize:11.5,letterSpacing:"-0.005em"}}>{displayNom(r)}</div>
                                    {(r.entreprise||espace)&&<div style={{fontSize:10,color:st.color,opacity:0.7,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{[r.entreprise,espace?.nom].filter(Boolean).join(" Â· ")}</div>}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ââ VUE JOUR ââ */}
                {calView==="jour" && (
                  <div style={{flex:1,overflowY:"auto",padding:"18px 28px 28px",background:"#FAFAF7"}}>
                    {dayResas.length===0?(
                      <div style={{textAlign:"center",padding:"60px 0",color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif"}}>
                        <svg width="40" height="40" viewBox="0 0 14 14" fill="none" style={{color:"#C5C3BE",marginBottom:12}}><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1"/><path d="M1.5 5.5h11M4.5 1v2.5M9.5 1v2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                        <div style={{fontSize:14,color:"#6B6B72"}}>Aucun Ã©vÃ©nement ce jour</div>
                        <div style={{fontSize:12,marginTop:4}}>Ajoutez une demande via le bouton en haut Ã  droite</div>
                        <button onClick={()=>{ setNewEvent({...EMPTY_RESA, espaceId: espacesDyn[0]?.id || "", dateDebut: calDayStr}); setNewEventErrors({}); setShowNewEvent(true); }} style={{marginTop:16,display:"inline-flex",alignItems:"center",gap:7,padding:"9px 14px",borderRadius:8,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",boxShadow:"0 1px 2px rgba(184,146,79,0.2)"}}>
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                          Ajouter un Ã©vÃ©nement
                        </button>
                      </div>
                    ):(
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {dayResas.map(r=><DayEventCard key={r.id} r={r}/>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ââ STATS ââ */}
        {view==="stats" && (() => {
          // âââ Calculs des KPI Ã©tendus âââ
          // Filtre selon la pÃ©riode
          const today = new Date();
          let dateLimit: Date | null = null;
          if (statsPeriode === "semaine") { dateLimit = new Date(today); dateLimit.setDate(today.getDate() - 7); }
          else if (statsPeriode === "mois") { dateLimit = new Date(today); dateLimit.setDate(1); }
          else if (statsPeriode === "trimestre") { dateLimit = new Date(today); dateLimit.setMonth(today.getMonth() - 3); }
          else if (statsPeriode === "annee") { dateLimit = new Date(today); dateLimit.setFullYear(today.getFullYear() - 1); }

          const resasFiltrees = dateLimit
            ? resas.filter(r => { try { return r.dateDebut && new Date(r.dateDebut) >= dateLimit!; } catch { return false; } })
            : resas;

          const totalP = resasFiltrees.length;
          const confP = resasFiltrees.filter(r => r.statut === "confirme").length;
          const attP = resasFiltrees.filter(r => r.statut === "en_attente" || r.statut === "nouveau" || r.statut === "en_cours").length;
          const tauxP = totalP > 0 ? Math.round(confP / totalP * 100) : 0;

          // CA prÃ©visionnel (somme budgets confirmÃ©s + en cours)
          const caPrev = resasFiltrees.reduce((sum, r) => {
            const b = String(r.budget || "");
            const matchTotal = b.match(/(\d+[\s.,]?\d*)\s*â¬/);
            const matchPers = b.match(/(\d+)\s*â¬?\s*(?:\/|par)\s*(?:pers|personne)/);
            let val = 0;
            if (matchPers) val = parseInt(matchPers[1], 10) * (parseInt(String(r.nombrePersonnes||0), 10) || 0);
            else if (matchTotal) val = parseInt(matchTotal[1].replace(/[\s.,]/g, ""), 10);
            return sum + val;
          }, 0);

          // DÃ©lai de rÃ©ponse moyen (en heures)
          const delaisReponse: number[] = [];
          Object.entries(sentReplies).forEach(([eId, sr]: [string, any]) => {
            const m = emails.find(em => em.id === eId);
            if (m && m.rawDate && sr.date) {
              try {
                const dRecu = new Date(m.rawDate).getTime();
                // sr.date est format "DD/MM/YYYY" â on prend midi par dÃ©faut
                const parts = sr.date.split("/");
                if (parts.length === 3) {
                  const dEnvoi = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 12, 0).getTime();
                  const diffHours = (dEnvoi - dRecu) / 3600000;
                  if (diffHours > 0 && diffHours < 720) delaisReponse.push(diffHours);
                }
              } catch {}
            }
          });
          const delaiMoyen = delaisReponse.length > 0
            ? (delaisReponse.reduce((a, b) => a + b, 0) / delaisReponse.length)
            : null;

          // Taux de modification IA (rÃ©ponses modifiÃ©es avant envoi)
          let tauxModifIA = 0;
          let modifiedCount = 0;
          let totalCachedReplies = 0;
          Object.values(repliesCache).forEach((rc: any) => {
            if (rc.reply && rc.editReply) {
              totalCachedReplies++;
              if (rc.reply !== rc.editReply) modifiedCount++;
            }
          });
          if (totalCachedReplies > 0) tauxModifIA = Math.round(modifiedCount / totalCachedReplies * 100);

          // Tokens / mail moyen
          const tokensPerMail = apiUsageStats.totalCalls > 0
            ? Math.round((apiUsageStats.totalInputTokens + apiUsageStats.totalOutputTokens) / apiUsageStats.totalCalls)
            : 0;
          const coutPerMail = apiUsageStats.totalCalls > 0
            ? apiUsageStats.totalCostUSD / apiUsageStats.totalCalls
            : 0;

          // Espaces â utiliser ESPACES dynamiques
          const parEspaceP = ESPACES.map(e => ({
            ...e,
            n: resasFiltrees.filter(r => r.espaceId === e.id).length,
            c: resasFiltrees.filter(r => r.espaceId === e.id && r.statut === "confirme").length,
          })).sort((a, b) => b.n - a.n);
          const maxNP = Math.max(...parEspaceP.map(e => e.n), 1);

          // Types
          const parTypeP = TYPES_EVT.map(t => ({
            t,
            n: resasFiltrees.filter(r => r.typeEvenement === t).length,
          })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5);

          // Profils (estimÃ©s depuis l'extraction)
          const profilsCount = { entreprises: 0, particuliers: 0, institutionnels: 0, agences: 0 };
          resasFiltrees.forEach(r => {
            const entr = String(r.entreprise || "").trim();
            const nom = String(r.nom || "").trim();
            if (!entr || /mr|mme|m\.|mlle|madame|monsieur/i.test(nom)) profilsCount.particuliers++;
            else if (/mairie|ministÃ¨re|universitÃ©|ambassade|prÃ©fecture/i.test(entr)) profilsCount.institutionnels++;
            else if (/agence|event|incentive|communication|marketing/i.test(entr)) profilsCount.agences++;
            else profilsCount.entreprises++;
          });

          // Ãvolution sur 12 mois
          const evol12: { mois: string; demandes: number; confirmes: number; annules: number }[] = [];
          for (let i = 11; i >= 0; i--) {
            const d = new Date(today);
            d.setMonth(d.getMonth() - i);
            const m = d.getMonth(), y = d.getFullYear();
            const inMonth = resas.filter(r => {
              try { const rd = new Date(r.dateDebut); return rd.getMonth() === m && rd.getFullYear() === y; } catch { return false; }
            });
            evol12.push({
              mois: d.toLocaleDateString("fr-FR", { month: "short" }),
              demandes: inMonth.length,
              confirmes: inMonth.filter(r => r.statut === "confirme").length,
              annules: inMonth.filter(r => r.statut === "annule").length,
            });
          }
          const maxEvol = Math.max(...evol12.map(e => e.demandes), 1);

          // Performance ARCHANGE â distribution par callType
          const callTypeStats: Record<string, { count: number; tokensIn: number; tokensOut: number; cost: number }> = {};
          (apiUsageStats.history || []).forEach(h => {
            if (!callTypeStats[h.type]) callTypeStats[h.type] = { count: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
            callTypeStats[h.type].count++;
            callTypeStats[h.type].tokensIn += h.inputTokens;
            callTypeStats[h.type].tokensOut += h.outputTokens;
            callTypeStats[h.type].cost += h.costUSD;
          });
          const callTypesArr = Object.entries(callTypeStats).sort((a, b) => b[1].count - a[1].count);

          // Sous-titre dynamique selon pÃ©riode
          const periodeLabel = {
            semaine: "Cette semaine",
            mois: "Ce mois (" + today.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) + ")",
            trimestre: "Ces 3 derniers mois",
            annee: "Cette annÃ©e",
            tout: "Toute la pÃ©riode",
          }[statsPeriode] || "Ce mois";

          const exportCSV = () => {
            const rows = [
              ["KPI", "Valeur"],
              ["CA prÃ©visionnel", caPrev + " â¬"],
              ["Taux de conversion", tauxP + "%"],
              ["DÃ©lai de rÃ©ponse moyen (h)", delaiMoyen !== null ? delaiMoyen.toFixed(1) : "â"],
              ["ÃvÃ©nements confirmÃ©s", confP],
              ["Taux modification IA", tauxModifIA + "%"],
              ["Tokens / mail moyen", tokensPerMail],
              ["CoÃ»t / mail moyen ($)", coutPerMail.toFixed(4)],
            ];
            const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `archange-stats-${statsPeriode}.csv`; a.click();
            URL.revokeObjectURL(url);
            toast("Export CSV gÃ©nÃ©rÃ© â");
          };

          return (
          <div style={{flex:1,display:"flex",overflow:"hidden",background:"#F5F4F0"}}>
            {/* âââ SIDEBAR SECONDAIRE âââ */}
            <div style={{width:220,flexShrink:0,background:"#FAFAF7",borderRight:"1px solid #EBEAE5",padding:"22px 16px",display:"flex",flexDirection:"column",overflowY:"auto"}}>
              {/* Bloc PÃRIODE */}
              <div style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:14,fontFamily:"'Geist','system-ui',sans-serif"}}>PÃ©riode</div>
              <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:24}}>
                {[
                  {k:"semaine", l:"Cette semaine"},
                  {k:"mois", l:"Ce mois"},
                  {k:"trimestre", l:"Ce trimestre"},
                  {k:"annee", l:"Cette annÃ©e"},
                  {k:"tout", l:"Tout"},
                ].map(p => {
                  const isActive = statsPeriode === p.k;
                  return (
                    <button key={p.k} onClick={()=>setStatsPeriode(p.k)} style={{padding:"9px 12px",borderRadius:7,border:"none",background:isActive?"#B8924F":"transparent",color:isActive?"#FFFFFF":"#1A1A1E",fontSize:12.5,fontWeight:isActive?500:400,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",textAlign:"left",transition:"background .14s ease"}} onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background="rgba(184,146,79,0.06)"; }} onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background="transparent"; }}>{p.l}</button>
                  );
                })}
              </div>

              {/* Bloc FOCUS */}
              <div style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:14,fontFamily:"'Geist','system-ui',sans-serif"}}>Focus</div>
              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {[
                  {k:"ensemble", l:"Vue d'ensemble"},
                  {k:"perf_ia", l:"Performance ARCHANGE"},
                  {k:"espaces", l:"Espaces"},
                  {k:"types", l:"Types d'Ã©vÃ©nements"},
                  {k:"profils", l:"Profils clients"},
                ].map(f => {
                  const isActive = statsFocus === f.k;
                  return (
                    <button key={f.k} onClick={()=>setStatsFocus(f.k)} style={{padding:"9px 12px",borderRadius:7,border:"none",borderLeft:isActive?"3px solid #B8924F":"3px solid transparent",background:isActive?"rgba(184,146,79,0.08)":"transparent",color:"#1A1A1E",fontSize:12.5,fontWeight:isActive?500:400,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",textAlign:"left",transition:"all .14s ease"}} onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background="rgba(184,146,79,0.06)"; }} onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background="transparent"; }}>{f.l}</button>
                  );
                })}
              </div>
            </div>

            {/* âââ ZONE PRINCIPALE âââ */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
              {/* Header */}
              <div style={{padding:"22px 28px 16px",flexShrink:0,borderBottom:"1px solid #EBEAE5",background:"#F5F4F0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontSize:22,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",letterSpacing:"0.02em"}}>Statistiques</div>
                    <div style={{fontSize:12,color:"#6B6E7E",marginTop:3}}>Performance commerciale Â· {periodeLabel}</div>
                  </div>
                  <button onClick={exportCSV} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",display:"inline-flex",alignItems:"center",gap:6,transition:"all .14s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#B8924F";e.currentTarget.style.color="#B8924F";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#EBEAE5";e.currentTarget.style.color="#1A1A1E";}}>
                    <span style={{fontSize:13}}>ð¥</span> Exporter CSV
                  </button>
                </div>

                {/* 6 KPI cards */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:10}}>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>ð°</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>CA prÃ©visionnel</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{caPrev.toLocaleString("fr-FR")} â¬</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5}}>{totalP} demande{totalP>1?"s":""} sur la pÃ©riode</div>
                  </div>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>ð</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>Taux conversion</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:tauxP>=40?"#639922":tauxP>=20?"#B8924F":"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{tauxP}%</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5}}>{confP} confirmÃ©es sur {totalP}</div>
                  </div>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>â±</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>DÃ©lai rÃ©ponse</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{delaiMoyen !== null ? delaiMoyen.toFixed(1) + " h" : "â"}</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5}}>moyenne sur {delaisReponse.length} envois</div>
                  </div>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>â</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>ConfirmÃ©s</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{confP}</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5}}>{attP} en attente</div>
                  </div>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>âï¸</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>Tx modif IA</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:tauxModifIA<25?"#639922":tauxModifIA<50?"#B8924F":"#A03939",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{tauxModifIA}%</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5}}>{modifiedCount}/{totalCachedReplies} rÃ©ponses modifiÃ©es</div>
                  </div>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>â¨</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>Tokens / mail</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{tokensPerMail >= 1000 ? (tokensPerMail/1000).toFixed(1) + " k" : tokensPerMail}</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5}}>â ${coutPerMail.toFixed(4)} / mail</div>
                  </div>
                </div>
              </div>

              {/* Zone scrollable */}
              <div style={{flex:1,overflowY:"auto",padding:"16px 28px 28px",display:"flex",flexDirection:"column",gap:12,minHeight:0}}>

                {/* Graphique Ã©volution 12 mois */}
                <div style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"14px 18px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
                    <span style={{fontSize:13,fontWeight:500,color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif"}}>Ãvolution sur 12 mois</span>
                    <div style={{display:"flex",gap:14,fontSize:11,color:"#6B6E7E",alignItems:"center"}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:10,height:2,background:"#B8924F",display:"inline-block"}}/>Demandes</span>
                      <span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:10,height:2,background:"#639922",display:"inline-block"}}/>ConfirmÃ©es</span>
                      <span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:10,height:2,background:"#E89999",display:"inline-block"}}/>AnnulÃ©es</span>
                    </div>
                  </div>
                  <svg viewBox="0 0 600 140" style={{width:"100%",height:130}}>
                    {[0, 1, 2, 3].map(i => (
                      <line key={i} x1="40" y1={20 + i * 30} x2="595" y2={20 + i * 30} stroke="#EBEAE5" strokeWidth="0.5" strokeDasharray={i === 3 ? "" : "2 3"}/>
                    ))}
                    {evol12.map((e, i) => {
                      const x = 40 + (i * (555 / 11));
                      return (
                        <text key={i} x={x} y={130} fontSize="9" fill="#6B6E7E" textAnchor="middle">{e.mois}</text>
                      );
                    })}
                    <polyline
                      points={evol12.map((e, i) => `${40 + i * (555 / 11)},${110 - (e.demandes / maxEvol) * 90}`).join(" ")}
                      fill="none" stroke="#B8924F" strokeWidth="2"
                    />
                    <polyline
                      points={evol12.map((e, i) => `${40 + i * (555 / 11)},${110 - (e.confirmes / maxEvol) * 90}`).join(" ")}
                      fill="none" stroke="#639922" strokeWidth="2"
                    />
                    <polyline
                      points={evol12.map((e, i) => `${40 + i * (555 / 11)},${110 - (e.annules / maxEvol) * 90}`).join(" ")}
                      fill="none" stroke="#E89999" strokeWidth="1.5" opacity="0.7"
                    />
                    {evol12.map((e, i) => {
                      const x = 40 + i * (555 / 11);
                      return e.demandes > 0 ? (
                        <circle key={i} cx={x} cy={110 - (e.demandes / maxEvol) * 90} r="3" fill="#B8924F"/>
                      ) : null;
                    })}
                  </svg>
                </div>

                {/* 2 panneaux contextuels selon focus */}
                {statsFocus === "ensemble" && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    {/* Top espaces */}
                    <div style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"14px 18px"}}>
                      <div style={{fontSize:13,fontWeight:500,color:"#1A1A1E",marginBottom:12,fontFamily:"'Geist','system-ui',sans-serif"}}>Top espaces rÃ©servÃ©s</div>
                      {parEspaceP.length === 0 ? <div style={{fontSize:12,color:"#A5A4A0"}}>Aucune donnÃ©e</div> : (
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {parEspaceP.slice(0, 5).map(e => (
                            <div key={e.id} style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:11.5,color:"#1A1A1E",flex:"0 0 110px"}}>{e.nom}</span>
                              <div style={{flex:1,height:6,background:"#EBEAE5",borderRadius:3,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${(e.n/maxNP)*100}%`,background:"#B8924F",borderRadius:3,transition:"width .3s ease"}}/>
                              </div>
                              <span style={{fontSize:10.5,color:"#6B6E7E",flex:"0 0 32px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{e.n}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Top types */}
                    <div style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"14px 18px"}}>
                      <div style={{fontSize:13,fontWeight:500,color:"#1A1A1E",marginBottom:12,fontFamily:"'Geist','system-ui',sans-serif"}}>Top types d'Ã©vÃ©nements</div>
                      {parTypeP.length === 0 ? <div style={{fontSize:12,color:"#A5A4A0"}}>Aucune donnÃ©e</div> : (
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {parTypeP.map(t => (
                            <div key={t.t} style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:11.5,color:"#1A1A1E",flex:"0 0 110px"}}>{t.t}</span>
                              <div style={{flex:1,height:6,background:"#EBEAE5",borderRadius:3,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${(t.n/parTypeP[0].n)*100}%`,background:"#639922",borderRadius:3,transition:"width .3s ease"}}/>
                              </div>
                              <span style={{fontSize:10.5,color:"#6B6E7E",flex:"0 0 32px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{t.n}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {statsFocus === "espaces" && (
                  <div style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"14px 18px"}}>
                    <div style={{fontSize:13,fontWeight:500,color:"#1A1A1E",marginBottom:14,fontFamily:"'Geist','system-ui',sans-serif"}}>DÃ©tail par espace</div>
                    {parEspaceP.map(e => (
                      <div key={e.id} style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid #EBEAE5"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:13,color:"#1A1A1E",fontWeight:500}}>{e.nom}</span>
                          <span style={{fontSize:12,color:"#6B6E7E",fontVariantNumeric:"tabular-nums"}}>{e.c}/{e.n}</span>
                        </div>
                        <div style={{height:8,background:"#EBEAE5",borderRadius:4,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${(e.n/maxNP)*100}%`,background:e.color || "#B8924F",borderRadius:4}}/>
                        </div>
                        <div style={{fontSize:11,color:"#6B6E7E",marginTop:4}}>{e.n>0?Math.round(e.c/e.n*100)+"% confirmÃ©s":"Aucune demande"}</div>
                      </div>
                    ))}
                  </div>
                )}

                {statsFocus === "types" && (
                  <div style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"14px 18px"}}>
                    <div style={{fontSize:13,fontWeight:500,color:"#1A1A1E",marginBottom:14,fontFamily:"'Geist','system-ui',sans-serif"}}>RÃ©partition par type d'Ã©vÃ©nement</div>
                    {parTypeP.length === 0 ? <div style={{fontSize:12,color:"#A5A4A0"}}>Aucune donnÃ©e disponible</div> : (
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {parTypeP.map(t => (
                          <div key={t.t} style={{display:"flex",alignItems:"center",gap:12}}>
                            <span style={{fontSize:13,color:"#1A1A1E",flex:"0 0 140px"}}>{t.t}</span>
                            <div style={{flex:1,height:8,background:"#EBEAE5",borderRadius:4,overflow:"hidden"}}>
                              <div style={{height:"100%",width:`${(t.n/parTypeP[0].n)*100}%`,background:"#639922",borderRadius:4}}/>
                            </div>
                            <span style={{fontSize:13,color:"#6B6E7E",flex:"0 0 30px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:500}}>{t.n}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {statsFocus === "profils" && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    {([
                      ["Entreprises", profilsCount.entreprises, "ð¢"],
                      ["Particuliers", profilsCount.particuliers, "ð¤"],
                      ["Institutionnels", profilsCount.institutionnels, "ð"],
                      ["Agences", profilsCount.agences, "ð£"],
                    ] as [string, number, string][]).map(([l, n, ic]) => {
                      const totalProfils = profilsCount.entreprises + profilsCount.particuliers + profilsCount.institutionnels + profilsCount.agences;
                      const pct = totalProfils > 0 ? Math.round(n / totalProfils * 100) : 0;
                      return (
                        <div key={l} style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"14px 18px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <span style={{fontSize:16}}>{ic}</span>
                            <span style={{fontSize:12,fontWeight:500,color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif"}}>{l}</span>
                          </div>
                          <div style={{fontSize:24,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{n}</div>
                          <div style={{fontSize:11,color:"#6B6E7E",marginTop:6,fontVariantNumeric:"tabular-nums"}}>{pct}% du total</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {statsFocus === "perf_ia" && (
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {/* Vue globale */}
                    <div style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"14px 18px"}}>
                      <div style={{fontSize:13,fontWeight:500,color:"#1A1A1E",marginBottom:14,fontFamily:"'Geist','system-ui',sans-serif"}}>SynthÃ¨se API ARCHANGE â session en cours</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:10}}>
                        <div style={{padding:"10px 12px",background:"#FAFAF7",borderRadius:8}}>
                          <div style={{fontSize:9.5,color:"#6B6E7E",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Appels totaux</div>
                          <div style={{fontSize:18,fontWeight:500,color:"#1A1A1E",fontVariantNumeric:"tabular-nums"}}>{apiUsageStats.totalCalls}</div>
                        </div>
                        <div style={{padding:"10px 12px",background:"#FAFAF7",borderRadius:8}}>
                          <div style={{fontSize:9.5,color:"#6B6E7E",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Tokens entrÃ©e</div>
                          <div style={{fontSize:18,fontWeight:500,color:"#1A1A1E",fontVariantNumeric:"tabular-nums"}}>{apiUsageStats.totalInputTokens.toLocaleString("fr-FR")}</div>
                        </div>
                        <div style={{padding:"10px 12px",background:"#FAFAF7",borderRadius:8}}>
                          <div style={{fontSize:9.5,color:"#6B6E7E",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Tokens sortie</div>
                          <div style={{fontSize:18,fontWeight:500,color:"#1A1A1E",fontVariantNumeric:"tabular-nums"}}>{apiUsageStats.totalOutputTokens.toLocaleString("fr-FR")}</div>
                        </div>
                        <div style={{padding:"10px 12px",background:"#FAFAF7",borderRadius:8}}>
                          <div style={{fontSize:9.5,color:"#6B6E7E",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>CoÃ»t total</div>
                          <div style={{fontSize:18,fontWeight:500,color:"#B8924F",fontVariantNumeric:"tabular-nums"}}>${apiUsageStats.totalCostUSD.toFixed(4)}</div>
                        </div>
                      </div>
                    </div>

                    {/* DÃ©tail par callType */}
                    <div style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"14px 18px"}}>
                      <div style={{fontSize:13,fontWeight:500,color:"#1A1A1E",marginBottom:14,fontFamily:"'Geist','system-ui',sans-serif"}}>Distribution par type d'appel</div>
                      {callTypesArr.length === 0 ? <div style={{fontSize:12,color:"#A5A4A0"}}>Aucun appel encore enregistrÃ© dans cette session</div> : (
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {callTypesArr.map(([type, st]) => (
                            <div key={type} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:"1px solid #EBEAE5"}}>
                              <span style={{fontSize:11.5,color:"#1A1A1E",flex:"0 0 200px",fontFamily:"'Geist','system-ui',sans-serif"}}>{type}</span>
                              <span style={{fontSize:11,color:"#6B6E7E",flex:"0 0 60px",fontVariantNumeric:"tabular-nums"}}>{st.count} appel{st.count>1?"s":""}</span>
                              <div style={{flex:1,height:5,background:"#EBEAE5",borderRadius:3,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${(st.count/Math.max(...callTypesArr.map(c=>c[1].count)))*100}%`,background:"#B8924F",borderRadius:3}}/>
                              </div>
                              <span style={{fontSize:11,color:"#B8924F",flex:"0 0 70px",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:500}}>${st.cost.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}

                {/* ââ SOURCES IA ââ */}
        {view==="sources" && (() => {
          // ââ Calcul des KPI âââââââââââââââââââââââââââââââââââââââââââââââ
          const totalZones = 18;
          const zonesRemplies = (nomEtab?1:0) + (menusCtx?1:0) + (conditionsCtx?1:0) + (espacesCtx?1:0) + (customCtx?1:0)
            + (Object.values(reglesCommerciales.parNombrePersonnes).filter(Boolean).length>0?1:0)
            + (Object.values(reglesCommerciales.parBudgetParPers).filter(Boolean).length>0?1:0)
            + (Object.values(reglesCommerciales.parBudgetTotal).filter(Boolean).length>0?1:0)
            + (Object.values(reglesCommerciales.parProfilClient).filter(Boolean).length>0?1:0)
            + (Object.values(reglesCommerciales.parMoment).filter(Boolean).length>0?1:0)
            + (Object.values(reglesCommerciales.parEspace).filter(Boolean).length>0?1:0)
            + (tonStyle.formulesValides.length>0?1:0)
            + (tonStyle.formulesInterdites.length>0?1:0)
            + (casParticuliers.length>0?1:0)
            + ((reglesAbsolues||"").trim().length>0?1:0)
            + (espacesDyn.length>0?1:0)
            + (Object.values(linksFetched).filter(Boolean).length>0?1:0)
            + (customTags.length>0?1:0);
          const completude = Math.round((zonesRemplies / totalZones) * 100);
          const reglesActives = Object.values(reglesCommerciales.parNombrePersonnes).filter(Boolean).length
            + Object.values(reglesCommerciales.parBudgetParPers).filter(Boolean).length
            + Object.values(reglesCommerciales.parBudgetTotal).filter(Boolean).length
            + Object.values(reglesCommerciales.parProfilClient).filter(Boolean).length
            + Object.values(reglesCommerciales.parMoment).filter(Boolean).length
            + Object.values(reglesCommerciales.parEspace).filter(Boolean).length;
          const dimensionsCouvertes = [
            Object.values(reglesCommerciales.parNombrePersonnes).filter(Boolean).length>0,
            Object.values(reglesCommerciales.parBudgetParPers).filter(Boolean).length>0,
            Object.values(reglesCommerciales.parBudgetTotal).filter(Boolean).length>0,
            Object.values(reglesCommerciales.parProfilClient).filter(Boolean).length>0,
            Object.values(reglesCommerciales.parMoment).filter(Boolean).length>0,
            Object.values(reglesCommerciales.parEspace).filter(Boolean).length>0,
          ].filter(Boolean).length;
          // QualitÃ© prÃ©dictive : pondÃ©ration simple
          const qualitePred = Math.min(100, Math.round(
            (completude * 0.4) +
            (Math.min(reglesActives, 12) / 12 * 100 * 0.3) +
            (casParticuliers.length>0?20:0) +
            ((reglesAbsolues||"").trim().length>0?10:0)
          ));
          // Compteurs par catÃ©gorie pour la sidebar
          const counts = {
            infos: (nomEtab?1:0) + (menusCtx?1:0) + (conditionsCtx?1:0) + (espacesCtx?1:0) + (customCtx?1:0),
            regles_com: reglesActives,
            ton: tonStyle.formulesValides.length + tonStyle.formulesInterdites.length,
            appr: apprentissages.reglesApprises.length + apprentissages.exemplesReference.length + apprentissages.suggestionsEnAttente.length,
            cas_part: casParticuliers.length,
            absolues: (reglesAbsolues||"").split("\n").filter((l: string)=>l.trim()).length,
          };
          const totalCount = counts.infos + counts.regles_com + counts.ton + counts.appr + counts.cas_part + counts.absolues;
          // DÃ©finition catÃ©gories sidebar
          const categories: {key: string; icon: string; label: string; count: number; isAbsolue?: boolean}[] = [
            {key:"all", icon:"ð ", label:"Tout", count: totalCount},
            {key:"infos", icon:"ð¢", label:"IdentitÃ©", count: counts.infos},
            {key:"regles_com", icon:"â¡", label:"RÃ¨gles com.", count: counts.regles_com},
            {key:"ton", icon:"ð¨", label:"Ton & Style", count: counts.ton},
            {key:"appr", icon:"ð", label:"Apprentissages", count: counts.appr},
            {key:"cas_part", icon:"ð", label:"Cas part.", count: counts.cas_part},
            {key:"absolues", icon:"ð«", label:"Absolues", count: counts.absolues, isAbsolue: true},
          ];

          return (
          <div style={{flex:1,display:"flex",overflow:"hidden",background:"#F5F4F0"}}>
            {/* âââ SIDEBAR SECONDAIRE (200px) âââââââââââââââââââââââââââââââ */}
            <div style={{width:220,flexShrink:0,background:"#FAFAF7",borderRight:"1px solid #EBEAE5",padding:"22px 16px",display:"flex",flexDirection:"column",overflowY:"auto"}}>
              {/* Bloc CatÃ©gories */}
              <div style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:14,fontFamily:"'Geist','system-ui',sans-serif"}}>CatÃ©gories</div>
              <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:24}}>
                {categories.map(cat => {
                  const isActive = sourcesFilter === cat.key;
                  return (
                    <button
                      key={cat.key}
                      onClick={()=>setSourcesFilter(cat.key)}
                      style={{
                        padding:"9px 12px",
                        borderRadius:7,
                        border:"none",
                        background: isActive ? "#B8924F" : "transparent",
                        color: isActive ? "#FFFFFF" : (cat.count===0 ? "#A5A4A0" : "#1A1A1E"),
                        fontSize:12.5,
                        fontWeight: isActive ? 500 : 400,
                        cursor:"pointer",
                        fontFamily:"'Geist','system-ui',sans-serif",
                        display:"flex",
                        justifyContent:"space-between",
                        alignItems:"center",
                        gap:8,
                        transition:"background .14s ease",
                        textAlign:"left",
                      }}
                      onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background="rgba(184,146,79,0.06)"; }}
                      onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background="transparent"; }}
                    >
                      <span style={{display:"inline-flex",alignItems:"center",gap:7}}>
                        <span style={{fontSize:13}}>{cat.icon}</span>
                        {cat.label}
                      </span>
                      {cat.count > 0 ? (
                        <span style={{
                          fontSize:10,
                          fontWeight:500,
                          padding:"1px 7px",
                          borderRadius:100,
                          background: isActive ? "rgba(255,255,255,0.25)" : (cat.isAbsolue?"rgba(220,38,38,0.1)":"rgba(184,146,79,0.12)"),
                          color: isActive ? "#FFFFFF" : (cat.isAbsolue?"#DC2626":"#B8924F"),
                          fontVariantNumeric:"tabular-nums",
                        }}>{cat.count}</span>
                      ) : (
                        <span style={{fontSize:10,color: isActive ? "rgba(255,255,255,0.6)" : "#C5C3BE",fontVariantNumeric:"tabular-nums"}}>0</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{flex:1}}/>

              {/* Bloc Statut gÃ©nÃ©ral */}
              <div style={{padding:14,background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                <div style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:9,fontFamily:"'Geist','system-ui',sans-serif"}}>Statut gÃ©nÃ©ral</div>
                <div style={{fontSize:11.5,color:"#1A1A1E",marginBottom:8,lineHeight:1.4}}>
                  ARCHANGE est nourri Ã  <strong style={{color:"#B8924F",fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{completude}%</strong>
                </div>
                <div style={{height:5,background:"#EBEAE5",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${completude}%`,background:"#B8924F",transition:"width .3s ease"}}/>
                </div>
                <div style={{fontSize:10,color:"#6B6E7E",marginTop:8,lineHeight:1.4}}>
                  {totalZones - zonesRemplies > 0 ? `${totalZones - zonesRemplies} zone${(totalZones-zonesRemplies)>1?"s":""} Ã  complÃ©ter` : "Toutes les zones sont remplies !"}
                </div>
              </div>
            </div>

            {/* âââ ZONE PRINCIPALE ââââââââââââââââââââââââââââââââââââââââââ */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
              {/* Header */}
              <div style={{padding:"22px 28px 16px",flexShrink:0,borderBottom:"1px solid #EBEAE5",background:"#F5F4F0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontSize:22,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",letterSpacing:"0.02em"}}>Sources ARCHANGE</div>
                    <div style={{fontSize:12,color:"#6B6E7E",marginTop:3}}>Tout ce qu'ARCHANGE sait sur votre Ã©tablissement</div>
                  </div>
                  <button onClick={()=>setShowTestArchange(true)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",display:"inline-flex",alignItems:"center",gap:6,boxShadow:"0 1px 2px rgba(184,146,79,0.2)"}}>
                    <span style={{fontSize:13}}>â¡</span> Tester ARCHANGE
                  </button>
                </div>

                {/* C4 â Bandeau onboarding si aucune source n'est configurÃ©e */}
                {!menusCtx && !conditionsCtx && !tonCtx && !espacesCtx && (
                  <div style={{marginBottom:14,padding:"12px 16px",background:"rgba(184,146,79,0.08)",border:"1px solid rgba(184,146,79,0.3)",borderLeft:"3px solid #B8924F",borderRadius:"0 6px 6px 0",display:"flex",alignItems:"flex-start",gap:12}}>
                    <span style={{fontSize:18,flexShrink:0}}>â¨</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",marginBottom:3}}>Personnalisez ARCHANGE pour votre Ã©tablissement</div>
                      <div style={{fontSize:12,color:"#6B6E7E",lineHeight:1.5}}>
                        Aucune source n'est encore configurÃ©e. En renseignant vos menus, conditions et rÃ¨gles, ARCHANGE rÃ©digera des rÃ©ponses parfaitement adaptÃ©es Ã  votre brasserie.
                      </div>
                      <div style={{fontSize:11,color:"#B8924F",marginTop:6,fontWeight:500}}>ð Commencez par "IdentitÃ©" dans la sidebar</div>
                    </div>
                  </div>
                )}

                {/* 4 KPI cards â refonte design moderne */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:10}}>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>ð</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>ComplÃ©tude</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{completude}%</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5,fontVariantNumeric:"tabular-nums"}}>{zonesRemplies} / {totalZones} zones remplies</div>
                  </div>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>â¡</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>RÃ¨gles actives</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{reglesActives}</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5}}>{dimensionsCouvertes} / 6 dimensions couvertes</div>
                  </div>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>ð</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>Cas particuliers</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{casParticuliers.length}</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5}}>
                      {casParticuliers.length > 0
                        ? `${casParticuliers.filter(c=>c.matchingMode==="auto").length} en mode auto`
                        : "aucun dÃ©fini"}
                    </div>
                  </div>
                  <div style={{padding:"12px 14px",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:13}}>â¨</span>
                      <span style={{fontSize:9.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>QualitÃ© IA</span>
                    </div>
                    <div style={{fontSize:24,fontWeight:300,color:"#B8924F",fontFamily:"'Fraunces',Georgia,serif",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{qualitePred}%</div>
                    <div style={{fontSize:10,color:"#6B6E7E",marginTop:5}}>prÃ©dictif sur extractions</div>
                  </div>
                </div>
              </div>

            {/* ââ Zone scrollable ââ */}
            <div style={{flex:1,overflowY:"scroll",padding:"16px 28px 28px",display:"flex",flexDirection:"column",gap:12,minHeight:0}}>

            {/* ââ Section Ãtablissement ââ */}
            <div style={{display: (sourcesFilter==="all"||sourcesFilter==="infos")?"block":"none",background:"#FFFFFF",borderRadius:12,border:"2px solid #B8924F"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FDF8EF",borderBottom:srcSections["etablissement"]?"1px solid #EBEAE5":"none",cursor:"pointer",borderRadius:srcSections["etablissement"]?"12px 12px 0 0":"12px"}} onClick={()=>setSrcSections(s=>({...s,etablissement:!s["etablissement"]}))}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>ð </span>
                    <span style={{fontSize:13,fontWeight:700,color:"#1A1A1E"}}>IdentitÃ© de l'Ã©tablissement</span>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"#FEF3C7",color:"#92400E",fontWeight:600}}>Multi-compte</span>
                  </div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>Nom, adresse, email â personnalise tout ARCHANGE et la sidebar</div>
                </div>
                <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections["etablissement"]?"â²":"â¼"}</span>
              </div>
              {srcSections["etablissement"]&&(
                <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>ð· Nom de l'Ã©tablissement</label>
                    <input value={nomEtab} onChange={e=>setNomEtab(e.target.value)} onBlur={()=>saveNomEtab(nomEtab)} placeholder="Ex : Brasserie RÃVA, Le Comptoir du Portâ¦" style={{...inp,fontSize:14,fontWeight:600}}/>
                    <div style={{fontSize:11,color:"#6B6E7E",marginTop:4}}>UtilisÃ© dans tous les prompts ARCHANGE et la signature email</div>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>ð Adresse</label>
                    <input value={adresseEtab} onChange={e=>setAdresseEtab(e.target.value)} onBlur={()=>saveAdresseEtab(adresseEtab)} placeholder="Ex : 133 avenue de France, 75013 Paris" style={{...inp}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>ð§ Email de contact</label>
                    <input value={emailEtab} onChange={e=>setEmailEtab(e.target.value)} onBlur={()=>saveEmailEtab(emailEtab)} placeholder="Ex : contact@brasserie-reva.fr" style={{...inp}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>ð TÃ©lÃ©phone</label>
                    <input value={telEtab} onChange={e=>setTelEtab(e.target.value)} onBlur={()=>saveTelEtab(telEtab)} placeholder="Ex : +33 1 23 45 67 89" style={{...inp}}/>
                  </div>
                </div>
              )}
            </div>

            {/* ââ Section Espaces dynamiques ââ */}
            <div style={{display:(sourcesFilter==="all"||sourcesFilter==="infos")?"block":"none",background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FAFAF7",borderBottom:srcSections["espacesDyn"]?"1px solid #EBEAE5":"none",cursor:"pointer"}} onClick={()=>setSrcSections(s=>({...s,espacesDyn:!s["espacesDyn"]}))}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>ðï¸</span>
                    <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>Espaces de l'Ã©tablissement</span>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"#D1FAE5",color:"#3F5B32",fontWeight:600}}>{espacesDyn.length} espace{espacesDyn.length>1?"s":""}</span>
                  </div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>Salles, capacitÃ©s, descriptions â remplacent les espaces codÃ©s en dur</div>
                </div>
                <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections["espacesDyn"]?"â²":"â¼"}</span>
              </div>
              {srcSections["espacesDyn"]&&(
                <div style={{padding:20,display:"flex",flexDirection:"column",gap:12}}>
                  {espacesDyn.map((esp, idx) => (
                    <div key={esp.id} style={{padding:"14px 16px",background:"#F5F4F0",borderRadius:10,border:"1px solid #EBEAE5"}}>
                      {/* Ligne 1 : couleur + nom + supprimer */}
                      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                        <input type="color" value={esp.color} onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],color:e.target.value}; saveEspacesDyn(u);}} style={{width:32,height:32,borderRadius:6,border:"none",cursor:"pointer",flexShrink:0}}/>
                        <input value={esp.nom} onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],nom:e.target.value}; setEspacesDyn(u);}} onBlur={()=>saveEspacesDyn(espacesDyn)} placeholder="Nom de l'espace" style={{...inp,fontWeight:700,flex:1,fontSize:13}}/>
                        {espacesDyn.length > 1 && (
                          <button onClick={()=>saveEspacesDyn(espacesDyn.filter((_,i)=>i!==idx))} title="Supprimer" style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:16,padding:"4px",flexShrink:0}}>â</button>
                        )}
                      </div>

                      {/* Ligne 2 : capacitÃ©s assis / debout */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        {/* Assis */}
                        <div style={{background:"#FFFFFF",borderRadius:8,padding:"10px 12px",border:"1px solid #EBEAE5"}}>
                          <div style={{fontSize:11,fontWeight:600,color:"#6B6E7E",marginBottom:8,display:"flex",alignItems:"center",gap:5}}>
                            ðª Assis
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:"#6B6E7E",marginBottom:3}}>Min</div>
                              <input
                                type="number" min="0"
                                value={esp.assisMin}
                                onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],assisMin:e.target.value}; setEspacesDyn(u);}}
                                onBlur={()=>saveEspacesDyn(espacesDyn)}
                                placeholder="â"
                                style={{...inp,textAlign:"center",padding:"6px 8px"}}
                              />
                            </div>
                            <span style={{color:"#C5C3BE",fontSize:13,marginTop:16}}>â</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:"#6B6E7E",marginBottom:3}}>Max</div>
                              <input
                                type="number" min="0"
                                value={esp.assisMax}
                                onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],assisMax:e.target.value}; setEspacesDyn(u);}}
                                onBlur={()=>saveEspacesDyn(espacesDyn)}
                                placeholder="â"
                                style={{...inp,textAlign:"center",padding:"6px 8px"}}
                              />
                            </div>
                            <span style={{fontSize:10,color:"#6B6E7E",marginTop:16,flexShrink:0}}>pers.</span>
                          </div>
                        </div>

                        {/* Debout */}
                        <div style={{background:"#FFFFFF",borderRadius:8,padding:"10px 12px",border:"1px solid #EBEAE5"}}>
                          <div style={{fontSize:11,fontWeight:600,color:"#6B6E7E",marginBottom:8,display:"flex",alignItems:"center",gap:5}}>
                            ð¥ Debout / Cocktail
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:"#6B6E7E",marginBottom:3}}>Min</div>
                              <input
                                type="number" min="0"
                                value={esp.deboutMin}
                                onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],deboutMin:e.target.value}; setEspacesDyn(u);}}
                                onBlur={()=>saveEspacesDyn(espacesDyn)}
                                placeholder="â"
                                style={{...inp,textAlign:"center",padding:"6px 8px"}}
                              />
                            </div>
                            <span style={{color:"#C5C3BE",fontSize:13,marginTop:16}}>â</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:"#6B6E7E",marginBottom:3}}>Max</div>
                              <input
                                type="number" min="0"
                                value={esp.deboutMax}
                                onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],deboutMax:e.target.value}; setEspacesDyn(u);}}
                                onBlur={()=>saveEspacesDyn(espacesDyn)}
                                placeholder="â"
                                style={{...inp,textAlign:"center",padding:"6px 8px"}}
                              />
                            </div>
                            <span style={{fontSize:10,color:"#6B6E7E",marginTop:16,flexShrink:0}}>pers.</span>
                          </div>
                        </div>
                      </div>

                      {/* Ligne 3 : description */}
                      <input value={esp.description} onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],description:e.target.value}; setEspacesDyn(u);}} onBlur={()=>saveEspacesDyn(espacesDyn)} placeholder="Description courte (vue, surface, ambiance, Ã©quipementsâ¦)" style={{...inp,width:"100%"}}/>
                    </div>
                  ))}
                  <button onClick={()=>saveEspacesDyn([...espacesDyn,{id:"esp_"+Date.now(),nom:"Nouvel espace",color:"#8B5CF6",assisMin:"",assisMax:"",deboutMin:"",deboutMax:"",description:""}])} style={{padding:"10px",borderRadius:8,border:"2px dashed #EBEAE5",background:"transparent",color:"#6B6E7E",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    + Ajouter un espace
                  </button>

                  {/* Notes complÃ©mentaires â remplace l'ancien textarea "Espaces & CapacitÃ©s" */}
                  <div style={{marginTop:4}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#6B6E7E",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>ð Notes complÃ©mentaires sur les espaces</div>
                    <textarea
                      value={espacesCtx}
                      onChange={e=>setEspacesCtx(e.target.value)}
                      onBlur={()=>saveEspacesCtx(espacesCtx)}
                      placeholder={"Ãquipements disponibles, accÃ¨s PMR, parking, matÃ©riel sonorisation, contraintes techniques, rÃ¨gles d'accÃ¨s, horaires d'ouverture des espacesâ¦"}
                      rows={5}
                      style={{...inp,lineHeight:1.75,resize:"vertical",width:"100%",fontFamily:"inherit",fontSize:12}}
                    />
                    <div style={{fontSize:11,color:"#6B6E7E",marginTop:4}}>Ces informations complÃ¨tent les espaces ci-dessus â Ã©quipements, accÃ¨s, contraintes non structurÃ©es.</div>
                  </div>

                  <div style={{fontSize:11,color:"#6B6E7E",padding:"8px 12px",background:"#F5F4F0",borderRadius:8}}>
                    ð¡ Les espaces ci-dessus remplacent les salles codÃ©es en dur. ARCHANGE les utilisera pour les attributions et les rÃ©ponses.
                  </div>
                </div>
              )}
            </div>

            {/* Composant rÃ©utilisable pour chaque section texte */}
            {([
              ["menus",      "ð½ï¸", "Menus & Tarifs",        "Collez ici vos menus, formules, tarifs par personne, options boissonsâ¦",            menusCtx,      saveMenusCtx],
              ["conditions", "ð", "Conditions & Politique", "Politique d'annulation, acomptes, dÃ©lais de confirmation, horaires d'accÃ¨sâ¦",       conditionsCtx, saveConditionsCtx],
              ["ton",        "âï¸", "RÃ¨gles & Ton IA (legacy)",        "Ancienne zone libre â remplacÃ©e par Ton & Style v2 (ð¨). ConservÃ©e pour compatibilitÃ© ; si vous utilisez la nouvelle section Ton, videz celle-ci.", tonCtx, saveTonCtx],
            ]).map(([key, icon, title, ph, val, save]) => (
              <div key={key} style={{display:(sourcesFilter==="all"||sourcesFilter==="infos")?"block":"none",background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FAFAF7",borderBottom:srcSections[key]?"1px solid #EBEAE5":"none",cursor:"pointer"}} onClick={()=>setSrcSections(s=>({...s,[key]:!s[key]}))}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>{icon}</span>
                      <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>{title}</span>
                      {val&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"#D1FAE5",color:"#3F5B32",fontWeight:600}}>Actif</span>}
                    </div>
                    <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>{ph.slice(0,60)}â¦</div>
                  </div>
                  <span style={{fontSize:12,color:"#6B6E7E",flexShrink:0,marginLeft:12}}>{srcSections[key]?"â²":"â¼"}</span>
                </div>
                {srcSections[key]&&(
                  <div style={{padding:20,display:"flex",flexDirection:"column",gap:10}}>
                    <textarea
                      value={val}
                      onChange={e=>save(e.target.value)}
                      placeholder={ph}
                      rows={8}
                      style={{...inp,lineHeight:1.75,resize:"vertical",width:"100%",fontFamily:"inherit"}}
                    />
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:11,color:"#6B6E7E"}}>{val.length} caractÃ¨res</span>
                      {val&&<button onClick={()=>save("")} style={{fontSize:11,color:"#DC2626",background:"none",border:"none",cursor:"pointer"}}>Vider Ã</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Liens web â section existante conservÃ©e */}
            <div style={{display:(sourcesFilter==="all"||sourcesFilter==="infos")?"block":"none",background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
              <button onClick={()=>setSrcSections(s=>({...s,liens:!s.liens}))} style={{width:"100%",padding:"14px 20px",background:"#FAFAF7",border:"none",borderBottom:srcSections.liens?"1px solid #EBEAE5":"none",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>ð Liens web analysÃ©s</div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:2}}>Site internet, Instagram, Facebook â ARCHANGE analyse le contenu.</div>
                </div>
                <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections.liens?"â²":"â¼"}</span>
              </button>
              {srcSections.liens&&(
                <div style={{padding:20,display:"flex",flexDirection:"column",gap:16}}>
                  {[["website","ð","Site internet","https://..."],["instagram","ð¸","Instagram","https://instagram.com/..."],["facebook","ð","Facebook","https://facebook.com/..."],["other","ð","Autre lien","https://..."]].map(([key,icon,label,ph])=>(
                    <div key={key}>
                      <label style={{fontSize:11,color:"#7A736A",display:"block",marginBottom:6,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>{icon} {label}</label>
                      <div style={{display:"flex",gap:8}}>
                        <input value={links[key]||""} onChange={e=>setLinks({...links,[key]:e.target.value})} onBlur={()=>saveLinks(links)} placeholder={ph} style={{...inp,flex:1}}/>
                        <button onClick={()=>fetchLink(links[key],key)} disabled={!links[key]||fetchingLink===key} style={{padding:"9px 16px",borderRadius:8,border:"none",background:linksFetched[key]?"#E8F5EE":!links[key]||fetchingLink===key?"#E8E4DE":"#B8924F",color:linksFetched[key]?"#2D6A4F":!links[key]||fetchingLink===key?"#A09890":"#1A1A1E",fontSize:12,fontWeight:600,cursor:links[key]&&fetchingLink!==key?"pointer":"default",display:"flex",alignItems:"center",gap:6,flexShrink:0,whiteSpace:"nowrap"}}>
                          {fetchingLink===key?<><Spin s={12}/> Analyseâ¦</>:linksFetched[key]?"â AnalysÃ©":"Analyser"}
                        </button>
                      </div>
                      {linksFetched[key]&&(
                        <div style={{marginTop:8,padding:"12px 14px",background:"#EDF5F0",border:"1px solid #C3DDD0",borderRadius:8}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                            <div style={{fontSize:10,color:"#2D6A4F",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>RÃ©sumÃ© Â· {linksFetched[key].fetchedAt}</div>
                            <button onClick={()=>{ const u={...linksFetched}; delete u[key]; setLinksFetched(u); saveToSupabase({links_fetched:JSON.stringify(u)}); }} style={{background:"none",border:"none",color:"#A0522D",fontSize:11,cursor:"pointer",padding:0}}>Supprimer Ã</button>
                          </div>
                          <div style={{fontSize:12,color:"#2D4A3A",lineHeight:1.7}}>{linksFetched[key].summary||""}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3 â Tags personnalisÃ©s */}
            <div style={{display:(sourcesFilter==="all"||sourcesFilter==="infos")?"block":"none",background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
              <div style={{padding:"14px 20px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>ð·ï¸ Tags personnalisÃ©s</div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:2}}>CrÃ©ez des tags pour classifier vos emails et filtrer rapidement.</div>
                </div>
                <span style={{fontSize:11,color:"#B8924F",padding:"2px 8px",borderRadius:100,background:"rgba(184,146,79,0.1)"}}>{customTags.length} tag{customTags.length!==1?"s":""}</span>
              </div>
              <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
                {/* Liste des tags existants */}
                {customTags.length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {customTags.map(t=>(
                      <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#F5F4F0",borderRadius:6,border:"1px solid #EBEAE5"}}>
                        <span style={{width:14,height:14,borderRadius:"50%",background:t.color,flexShrink:0}}/>
                        <span style={{flex:1,fontSize:13,color:"#1A1A1E",fontWeight:500}}>{t.label}</span>
                        <span style={{fontSize:11,color:"#9CA3AF"}}>{Object.values(emailTags).filter(ids=>(ids as string[]).includes(t.id)).length} email{Object.values(emailTags).filter(ids=>(ids as string[]).includes(t.id)).length!==1?"s":""}</span>
                        <button onClick={()=>{
                          if (!window.confirm(`Supprimer le tag "${t.label}" ? Il sera retirÃ© de tous les emails.`)) return;
                          const newTags = customTags.filter(x=>x.id!==t.id);
                          saveCustomTags(newTags);
                          // Retirer le tag de tous les emails
                          const newEmailTags: Record<string,string[]> = {};
                          Object.entries(emailTags).forEach(([eid,ids])=>{
                            const filtered = (ids as string[]).filter(x=>x!==t.id);
                            if (filtered.length>0) newEmailTags[eid]=filtered;
                          });
                          saveEmailTags(newEmailTags);
                          // Point 6 â Si ce tag Ã©tait filtrÃ©, reset le filtre
                          if (tagFilter===t.id) setTagFilter(null);
                          toast("Tag supprimÃ©");
                        }} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:14,padding:"2px 4px",borderRadius:4,lineHeight:1}}>â</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* CrÃ©er un nouveau tag */}
                <div style={{display:"flex",flexDirection:"column",gap:10,padding:"12px",background:"#F9F8F6",borderRadius:6,border:"1px dashed #EBEAE5"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.06em",textTransform:"uppercase"}}>CrÃ©er un tag</div>
                  <input value={newTagLabel} onChange={e=>setNewTagLabel(e.target.value)} placeholder="Nom du tagâ¦" style={{padding:"8px 10px",borderRadius:6,border:"1px solid #EBEAE5",fontSize:13,background:"#FFF",color:"#1A1A1E",outline:"none"}}/>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {TAG_PALETTE.map(c=>(
                      <button key={c} onClick={()=>setNewTagColor(c)} style={{width:22,height:22,borderRadius:"50%",background:c,border:newTagColor===c?"3px solid #1A1A1E":"2px solid transparent",cursor:"pointer",flexShrink:0}}/>
                    ))}
                  </div>
                  <button onClick={()=>{
                    if (!newTagLabel.trim()) return;
                    const tag: CustomTag = {id:`tag_${Date.now()}`,label:newTagLabel.trim(),color:newTagColor};
                    saveCustomTags([...customTags,tag]);
                    setNewTagLabel("");
                    toast("Tag crÃ©Ã© !");
                  }} disabled={!newTagLabel.trim()} style={{padding:"8px 16px",borderRadius:6,border:"none",background:newTagLabel.trim()?"#1A1A1E":"#EBEAE5",color:newTagLabel.trim()?"#F5F4F0":"#9CA3AF",fontSize:12,fontWeight:600,cursor:newTagLabel.trim()?"pointer":"default",textAlign:"center"}}>
                    + CrÃ©er ce tag
                  </button>
                </div>
              </div>
            </div>

            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {/* â¡ SECTION B â RÃGLES COMMERCIALES (5 dimensions conditionnelles) */}
            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {(sourcesFilter==="all"||sourcesFilter==="regles_com") && (() => {
              // Helper : rendu d'une sous-section avec onglets internes
              const renderDimension = (dimKey: string, dimIcon: string, dimTitle: string, dimDesc: string, tabs: {id: string; label: string; placeholder: string}[], dimData: Record<string,string>, updateFn: (newData: Record<string,string>) => void) => {
                const activeTab = openReglesComTab.startsWith(`${dimKey}:`) ? openReglesComTab.slice(dimKey.length+1) : tabs[0]?.id || "";
                const countFilled = Object.values(dimData).filter(v => (v||"").trim()).length;
                const dimSectionKey = `regcom_${dimKey}`;
                return (
                  <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FAFAF7",borderBottom:srcSections[dimSectionKey]?"1px solid #EBEAE5":"none",cursor:"pointer"}} onClick={()=>setSrcSections(s=>({...s,[dimSectionKey]:!s[dimSectionKey]}))}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:16}}>{dimIcon}</span>
                          <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>{dimTitle}</span>
                          {countFilled > 0 && <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"rgba(184,146,79,0.12)",color:"#B8924F",fontWeight:600}}>{countFilled} remplie{countFilled>1?"s":""}</span>}
                        </div>
                        <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>{dimDesc}</div>
                      </div>
                      <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections[dimSectionKey]?"â²":"â¼"}</span>
                    </div>
                    {srcSections[dimSectionKey] && (
                      <div style={{padding:"16px 20px"}}>
                        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",borderBottom:"1px solid #EBEAE5",paddingBottom:10}}>
                          {tabs.map(t => {
                            const isActive = activeTab === t.id;
                            const hasContent = (dimData[t.id]||"").trim().length > 0;
                            return (
                              <button key={t.id} onClick={()=>setOpenReglesComTab(`${dimKey}:${t.id}`)} style={{padding:"6px 12px",borderRadius:8,border:isActive?"1px solid #B8924F":"1px solid #EBEAE5",background:isActive?"#B8924F":"#FFFFFF",color:isActive?"#FFFFFF":(hasContent?"#1A1A1E":"#6B6E7E"),fontSize:12,fontWeight:isActive?600:500,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",display:"inline-flex",alignItems:"center",gap:5,transition:"all .14s ease"}}>
                                {t.label}
                                {hasContent && !isActive && <span style={{fontSize:9,color:"#B8924F"}}>â</span>}
                              </button>
                            );
                          })}
                        </div>
                        {(() => {
                          const tab = tabs.find(t => t.id === activeTab) || tabs[0];
                          if (!tab) return null;
                          const val = dimData[tab.id] || "";
                          return (
                            <div>
                              <textarea
                                value={val}
                                onChange={e => updateFn({...dimData, [tab.id]: e.target.value})}
                                placeholder={tab.placeholder}
                                rows={6}
                                style={{...inp,lineHeight:1.7,resize:"vertical",width:"100%",fontFamily:"inherit"}}
                              />
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                                <span style={{fontSize:11,color:"#6B6E7E"}}>{val.length} caractÃ¨res â activÃ© automatiquement sur les mails correspondants</span>
                                {val && <button onClick={()=>updateFn({...dimData, [tab.id]: ""})} style={{fontSize:11,color:"#DC2626",background:"none",border:"none",cursor:"pointer"}}>Vider Ã</button>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              };

              // Construction des onglets dynamiques pour "Par espace"
              const tabsEspaces = espacesDyn.map(e => ({
                id: e.id,
                label: e.nom || e.id,
                placeholder: `RÃ¨gles spÃ©cifiques Ã  l'espace "${e.nom || e.id}" â ex: "Toujours mentionner la faÃ§ade LED pour les lancements de produit. AccÃ¨s voiturier disponible sur demande."`
              }));

              return (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {/* Header section B */}
                  <div style={{padding:"10px 14px",background:"rgba(184,146,79,0.06)",borderLeft:"3px solid #B8924F",borderRadius:"0 8px 8px 0"}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>â¡</span> RÃ¨gles commerciales
                    </div>
                    <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,lineHeight:1.5}}>
                      RÃ¨gles activÃ©es automatiquement selon le contexte du mail (nb de personnes, budget, profil client, moment, espace). ARCHANGE n'injecte que les rÃ¨gles pertinentes â pas de surcharge.
                    </div>
                  </div>

                  {renderDimension("nbPers", "ð¢", "Par nombre de personnes",
                    "Active selon nombrePersonnes extrait du mail",
                    [
                      {id:"petits", label:"Petits (<30)", placeholder:"Ex: Pour les petits groupes, proposer la salle privative au RDC. Mentionner option dÃ©gustation vins."},
                      {id:"moyens", label:"Moyens (30-80)", placeholder:"Ex: Pour les groupes moyens, le Patio est idÃ©al. Proposer option voiturier si >50 pers."},
                      {id:"grands", label:"Grands (80-150)", placeholder:"Ex: Pour les grands groupes, Atrium en prioritÃ©. Toujours proposer visite prÃ©alable."},
                      {id:"xl", label:"TrÃ¨s grands (>150)", placeholder:"Ex: Pour les trÃ¨s grands groupes, privatisation totale possible. Devis sur-mesure, service dÃ©diÃ©."},
                    ],
                    reglesCommerciales.parNombrePersonnes,
                    (nv) => saveReglesCommerciales({...reglesCommerciales, parNombrePersonnes: nv as any})
                  )}

                  {renderDimension("budPers", "ð°", "Par budget â¬/personne",
                    "Active si le budget est exprimÃ© en â¬/pers dans le mail",
                    [
                      {id:"economique", label:"Ãconomique (<60â¬/pers)", placeholder:"Ex: Pour budgets serrÃ©s, proposer formule apÃ©ritif dÃ®natoire 3 piÃ¨ces + boissons. Mentionner Patio comme espace le plus abordable."},
                      {id:"standard", label:"Standard (60-120â¬/pers)", placeholder:"Ex: Formule cocktail 6 piÃ¨ces + entrÃ©e/plat/dessert. Proposer accord mets-vins optionnel."},
                      {id:"premium", label:"Premium (>120â¬/pers)", placeholder:"Ex: Menu signature chef + sommelier dÃ©diÃ© + accords mets-vins inclus. Service voiturier offert."},
                    ],
                    reglesCommerciales.parBudgetParPers,
                    (nv) => saveReglesCommerciales({...reglesCommerciales, parBudgetParPers: nv as any})
                  )}

                  {renderDimension("budTot", "ð°", "Par budget total",
                    "Active selon budget total du mail (ou calcul nb pers Ã â¬/pers)",
                    [
                      {id:"petit", label:"Petit (<250â¬)", placeholder:"Ex: Petits Ã©vÃ©nements â privilÃ©gier la convivialitÃ©, pas de devis formel, email chaleureux."},
                      {id:"moyen", label:"Moyen (250-1000â¬)", placeholder:"Ex: Proposer visite rapide, devis structurÃ© simple, mentionner options upsell modestes."},
                      {id:"important", label:"Important (1000-2500â¬)", placeholder:"Ex: Toujours proposer visite prÃ©alable, devis dÃ©taillÃ©, mentionner options premium, rappel tÃ©lÃ©phonique dans les 48h."},
                      {id:"tresImportant", label:"TrÃ¨s important (>2500â¬)", placeholder:"Ex: Rendez-vous physique systÃ©matique, devis VIP personnalisÃ©, chef disponible pour Ã©change, conditions nÃ©gociables."},
                    ],
                    reglesCommerciales.parBudgetTotal,
                    (nv) => saveReglesCommerciales({...reglesCommerciales, parBudgetTotal: nv as any})
                  )}

                  {renderDimension("profil", "ð¢", "Par profil client",
                    "DÃ©tectÃ© automatiquement selon entreprise et sourceEmail",
                    [
                      {id:"entreprises", label:"Entreprises", placeholder:"Ex: Ton professionnel, mentionner facture et numÃ©ro de TVA, parler d'Ã©quipe et de team building. Proposer options ROI (espace de travail, connexion wifi, Ã©crans)."},
                      {id:"particuliers", label:"Particuliers", placeholder:"Ex: Ton chaleureux, focus Ã©motion/expÃ©rience, Ã©voquer l'ambiance, photos des espaces. Proposer visite comme moment convivial."},
                      {id:"institutionnels", label:"Institutionnels", placeholder:"Ex: Ton formel, rÃ©fÃ©rences similaires (autres institutions), mentionner normes accessibilitÃ©/sÃ©curitÃ©. Conditions de rÃ¨glement adaptÃ©es (mandats, dÃ©lais)."},
                      {id:"agences", label:"Agences Ã©vÃ©nementielles", placeholder:"Ex: Ton direct et efficace, tarifs nets, commissions prÃ©cisÃ©es. Mentionner fiche technique complÃ¨te, photos HD, contrat partenaire."},
                    ],
                    reglesCommerciales.parProfilClient,
                    (nv) => saveReglesCommerciales({...reglesCommerciales, parProfilClient: nv as any})
                  )}

                  {renderDimension("moment", "ð", "Par moment",
                    "Active selon heureDebut extrait du mail",
                    [
                      {id:"dejeuner", label:"DÃ©jeuner (11h-15h)", placeholder:"Ex: Pour dÃ©jeuners, proposer formules rapides, mentionner dÃ©part Ã  14h30 max. Menu allÃ©gÃ© pour retour au bureau facilitÃ©."},
                      {id:"soir", label:"Soir (17h-22h)", placeholder:"Ex: Pour les soirs, mettre en avant l'ambiance, Ã©clairage chaleureux, service plus long, options digestifs."},
                      {id:"cocktailTardif", label:"Cocktail tardif (22h+)", placeholder:"Ex: Pour Ã©vÃ©nements tardifs, mentionner insonorisation, voisinage, option DJ/musique live. Service jusqu'Ã  2h max."},
                    ],
                    reglesCommerciales.parMoment,
                    (nv) => saveReglesCommerciales({...reglesCommerciales, parMoment: nv as any})
                  )}

                  {tabsEspaces.length > 0 ? renderDimension("espace", "ð", "Par espace",
                    "SynchronisÃ© automatiquement avec les espaces dÃ©finis plus haut",
                    tabsEspaces,
                    reglesCommerciales.parEspace,
                    (nv) => saveReglesCommerciales({...reglesCommerciales, parEspace: nv})
                  ) : (
                    <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5",padding:"16px 20px"}}>
                      <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontSize:16}}>ð</span> Par espace
                      </div>
                      <div style={{fontSize:11,color:"#6B6E7E"}}>Aucun espace dÃ©fini. Ajoutez des espaces dans la section "ðï¸ Espaces de l'Ã©tablissement" pour pouvoir y attacher des rÃ¨gles spÃ©cifiques.</div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {/* ð¨ SECTION C â TON & STYLE */}
            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {(sourcesFilter==="all"||sourcesFilter==="ton") && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {/* Header section C */}
                <div style={{padding:"10px 14px",background:"rgba(184,146,79,0.06)",borderLeft:"3px solid #B8924F",borderRadius:"0 8px 8px 0"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>ð¨</span> Ton & style de communication
                  </div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,lineHeight:1.5}}>
                    Formules Ã  utiliser, formules Ã  bannir, niveau de formalitÃ© par profil â tous les mails hÃ©ritent automatiquement de ces rÃ¨gles.
                  </div>
                </div>

                {/* C.1 â Formules valides */}
                <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FAFAF7",borderBottom:srcSections["ton_valides"]?"1px solid #EBEAE5":"none",cursor:"pointer"}} onClick={()=>setSrcSections(s=>({...s,ton_valides:!s["ton_valides"]}))}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:16}}>â</span>
                        <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>Formules Ã  utiliser</span>
                        {tonStyle.formulesValides.length > 0 && <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"#D1FAE5",color:"#3F5B32",fontWeight:600}}>{tonStyle.formulesValides.length}</span>}
                      </div>
                      <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>Expressions que ARCHANGE doit privilÃ©gier</div>
                    </div>
                    <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections["ton_valides"]?"â²":"â¼"}</span>
                  </div>
                  {srcSections["ton_valides"] && (
                    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:10}}>
                      {tonStyle.formulesValides.map((f, idx) => (
                        <div key={f.id} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"10px 12px",background:"#F9F8F6",borderRadius:8,border:"1px solid #EBEAE5"}}>
                          <input value={f.contexte} onChange={e=>{const u=[...tonStyle.formulesValides]; u[idx]={...u[idx],contexte:e.target.value}; saveTonStyle({...tonStyle,formulesValides:u});}} placeholder="Contexte (ex: Ouverture)" style={{...inp,flex:"0 0 140px",fontSize:12}}/>
                          <input value={f.formule} onChange={e=>{const u=[...tonStyle.formulesValides]; u[idx]={...u[idx],formule:e.target.value}; saveTonStyle({...tonStyle,formulesValides:u});}} placeholder="Formule exacte" style={{...inp,flex:1,fontSize:12}}/>
                          <button onClick={()=>saveTonStyle({...tonStyle,formulesValides:tonStyle.formulesValides.filter(x=>x.id!==f.id)})} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:14,padding:"4px 6px"}}>â</button>
                        </div>
                      ))}
                      <button onClick={()=>saveTonStyle({...tonStyle,formulesValides:[...tonStyle.formulesValides,{id:`f_${Date.now()}`,contexte:"",formule:""}]})} style={{padding:"8px 14px",borderRadius:8,border:"1px dashed #B8924F",background:"#FFFFFF",color:"#B8924F",fontSize:12,fontWeight:500,cursor:"pointer",alignSelf:"flex-start"}}>+ Ajouter une formule</button>
                    </div>
                  )}
                </div>

                {/* C.2 â Formules interdites */}
                <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FAFAF7",borderBottom:srcSections["ton_interdits"]?"1px solid #EBEAE5":"none",cursor:"pointer"}} onClick={()=>setSrcSections(s=>({...s,ton_interdits:!s["ton_interdits"]}))}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:16}}>â</span>
                        <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>Formules interdites</span>
                        {tonStyle.formulesInterdites.length > 0 && <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"#FEE2E2",color:"#991B1B",fontWeight:600}}>{tonStyle.formulesInterdites.length}</span>}
                      </div>
                      <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>Expressions Ã  bannir absolument</div>
                    </div>
                    <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections["ton_interdits"]?"â²":"â¼"}</span>
                  </div>
                  {srcSections["ton_interdits"] && (
                    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:8}}>
                      {tonStyle.formulesInterdites.map((f, idx) => (
                        <div key={idx} style={{display:"flex",gap:8}}>
                          <input value={f} onChange={e=>{const u=[...tonStyle.formulesInterdites]; u[idx]=e.target.value; saveTonStyle({...tonStyle,formulesInterdites:u});}} placeholder={`Ex: N'hÃ©sitez pas, Cordialementâ¦`} style={{...inp,flex:1,fontSize:12}}/>
                          <button onClick={()=>saveTonStyle({...tonStyle,formulesInterdites:tonStyle.formulesInterdites.filter((_,i)=>i!==idx)})} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:14,padding:"4px 6px"}}>â</button>
                        </div>
                      ))}
                      <button onClick={()=>saveTonStyle({...tonStyle,formulesInterdites:[...tonStyle.formulesInterdites,""]})} style={{padding:"8px 14px",borderRadius:8,border:"1px dashed #DC2626",background:"#FFFFFF",color:"#DC2626",fontSize:12,fontWeight:500,cursor:"pointer",alignSelf:"flex-start"}}>+ Ajouter une interdiction</button>
                    </div>
                  )}
                </div>

                {/* C.3 â Niveau de formalitÃ© par profil */}
                <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FAFAF7",borderBottom:srcSections["ton_form"]?"1px solid #EBEAE5":"none",cursor:"pointer"}} onClick={()=>setSrcSections(s=>({...s,ton_form:!s["ton_form"]}))}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:16}}>ð</span>
                        <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>Niveau de formalitÃ© par profil</span>
                      </div>
                      <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>Curseur : chaleureux â professionnel</div>
                    </div>
                    <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections["ton_form"]?"â²":"â¼"}</span>
                  </div>
                  {srcSections["ton_form"] && (
                    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:16}}>
                      {([
                        ["particuliers", "Particuliers"],
                        ["entreprises", "Entreprises"],
                        ["institutionnels", "Institutionnels"],
                        ["agences", "Agences Ã©vÃ©nementielles"],
                      ] as [keyof TonStyle["formalite"], string][]).map(([key, label]) => (
                        <div key={key}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12,color:"#1A1A1E"}}>
                            <span style={{fontWeight:500}}>{label}</span>
                            <span style={{color:"#B8924F",fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{Math.round((tonStyle.formalite[key] || 0) * 100)}% formel</span>
                          </div>
                          <input type="range" min="0" max="100" value={Math.round((tonStyle.formalite[key] || 0) * 100)} onChange={e=>saveTonStyle({...tonStyle,formalite:{...tonStyle.formalite,[key]:parseInt(e.target.value,10)/100}})} style={{width:"100%",accentColor:"#B8924F",cursor:"pointer"}}/>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#6B6E7E",marginTop:2}}>
                            <span>Chaleureux</span>
                            <span>TrÃ¨s formel</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {/* ð SECTION D â APPRENTISSAGES ARCHANGE */}
            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {(sourcesFilter==="all"||sourcesFilter==="appr") && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{padding:"10px 14px",background:"rgba(184,146,79,0.06)",borderLeft:"3px solid #B8924F",borderRadius:"0 8px 8px 0"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>ð</span> Apprentissages ARCHANGE
                  </div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,lineHeight:1.5}}>
                    Cette section se remplira automatiquement quand ARCHANGE dÃ©tectera des patterns rÃ©currents dans vos corrections. BientÃ´t disponible.
                  </div>
                </div>

                {/* Message d'accueil */}
                {apprentissages.reglesApprises.length === 0 && apprentissages.exemplesReference.length === 0 && apprentissages.suggestionsEnAttente.length === 0 ? (
                  <div style={{background:"#FFFFFF",borderRadius:3,border:"1px dashed #EBEAE5",padding:"32px 20px",textAlign:"center"}}>
                    <div style={{fontSize:32,marginBottom:12,opacity:0.4}}>ð±</div>
                    <div style={{fontSize:14,color:"#1A1A1E",fontWeight:500,marginBottom:6,fontFamily:"'Fraunces',Georgia,serif"}}>ARCHANGE n'a encore rien appris</div>
                    <div style={{fontSize:12,color:"#6B6E7E",lineHeight:1.6,maxWidth:480,margin:"0 auto"}}>
                      Quand vous modifiez une rÃ©ponse gÃ©nÃ©rÃ©e avant envoi, ARCHANGE enregistre la correction.<br/>
                      AprÃ¨s quelques corrections similaires (3 minimum), une rÃ¨gle apprise apparaÃ®tra ici pour validation.
                    </div>
                  </div>
                ) : (
                  <>
                    {/* D.1 â RÃ¨gles apprises */}
                    <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                      <div style={{padding:"14px 20px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:16}}>ð¡</span>
                          <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>RÃ¨gles apprises</span>
                          <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"rgba(184,146,79,0.12)",color:"#B8924F",fontWeight:600}}>{apprentissages.reglesApprises.length}</span>
                        </div>
                      </div>
                      <div style={{padding:"16px 20px"}}>
                        {apprentissages.reglesApprises.length === 0 ? (
                          <div style={{fontSize:12,color:"#A5A4A0",textAlign:"center",padding:"20px"}}>Aucune rÃ¨gle apprise pour l'instant</div>
                        ) : (
                          <div style={{display:"flex",flexDirection:"column",gap:10}}>
                            {apprentissages.reglesApprises.map(r => (
                              <div key={r.id} style={{padding:"12px 14px",background:"#F9F8F6",borderRadius:8,border:"1px solid #EBEAE5",display:"flex",gap:10,alignItems:"flex-start"}}>
                                <input type="checkbox" checked={r.active} onChange={e=>saveApprentissages({...apprentissages,reglesApprises:apprentissages.reglesApprises.map(x=>x.id===r.id?{...x,active:e.target.checked}:x)})} style={{marginTop:3,accentColor:"#B8924F"}}/>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:12.5,color:"#1A1A1E",lineHeight:1.5,opacity:r.active?1:0.5}}>{r.texte}</div>
                                  <div style={{display:"flex",gap:8,marginTop:4,fontSize:10,color:"#6B6E7E"}}>
                                    <span style={{padding:"2px 6px",background:"rgba(184,146,79,0.1)",color:"#B8924F",borderRadius:4,fontWeight:600}}>{r.categorie}</span>
                                    <span>Ã {r.occurrences} fois</span>
                                    <span>{r.dateCreation}</span>
                                  </div>
                                </div>
                                <button onClick={()=>saveApprentissages({...apprentissages,reglesApprises:apprentissages.reglesApprises.filter(x=>x.id!==r.id)})} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:13,padding:"4px 6px"}}>â</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* D.2 â Exemples rÃ©fÃ©rence */}
                    <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                      <div style={{padding:"14px 20px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:16}}>â­</span>
                          <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>Exemples de rÃ©fÃ©rence</span>
                          <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"rgba(184,146,79,0.12)",color:"#B8924F",fontWeight:600}}>{apprentissages.exemplesReference.length}</span>
                        </div>
                      </div>
                      <div style={{padding:"16px 20px"}}>
                        {apprentissages.exemplesReference.length === 0 ? (
                          <div style={{fontSize:12,color:"#A5A4A0",textAlign:"center",padding:"20px"}}>Aucun exemple â marquez une rÃ©ponse comme "â­ exemplaire" depuis la vue email pour l'ajouter ici</div>
                        ) : (
                          <div style={{display:"flex",flexDirection:"column",gap:10}}>
                            {apprentissages.exemplesReference.map(ex => (
                              <div key={ex.id} style={{padding:"12px 14px",background:"#F9F8F6",borderRadius:8,border:"1px solid #EBEAE5"}}>
                                <div style={{fontSize:12,fontWeight:600,color:"#1A1A1E",marginBottom:4}}>{ex.emailSubject}</div>
                                <div style={{fontSize:11,color:"#6B6E7E",display:"flex",gap:10,flexWrap:"wrap"}}>
                                  <span>ð {ex.dateAjout}</span>
                                  {ex.typeEvenement && <span style={{padding:"1px 6px",background:"rgba(184,146,79,0.1)",color:"#B8924F",borderRadius:4}}>{ex.typeEvenement}</span>}
                                  {ex.nombrePersonnes && <span>{ex.nombrePersonnes} pers.</span>}
                                  <button onClick={()=>saveApprentissages({...apprentissages,exemplesReference:apprentissages.exemplesReference.filter(x=>x.id!==ex.id)})} style={{marginLeft:"auto",background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:11}}>Retirer</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* D.3 â Suggestions en attente */}
                    {apprentissages.suggestionsEnAttente.length > 0 && (
                      <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                        <div style={{padding:"14px 20px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:16}}>ð</span>
                            <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>Suggestions en attente</span>
                            <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"#FEF3C7",color:"#92400E",fontWeight:600}}>{apprentissages.suggestionsEnAttente.length}</span>
                          </div>
                        </div>
                        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:10}}>
                          {apprentissages.suggestionsEnAttente.map(s => (
                            <div key={s.id} style={{padding:"12px 14px",background:"rgba(254,243,199,0.3)",borderRadius:8,border:"1px solid #FDE68A"}}>
                              <div style={{fontSize:12.5,color:"#1A1A1E",lineHeight:1.5,marginBottom:8}}>ð¡ {s.regleProposee}</div>
                              <div style={{fontSize:10,color:"#6B6E7E",marginBottom:8}}>DÃ©tectÃ© {s.dateDetection} Â· BasÃ© sur {s.exemples.length} exemples</div>
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={()=>{
                                  const nvRegle: ApprentissageRegle = {id:`r_${Date.now()}`,texte:s.regleProposee,categorie:"apprise",occurrences:s.exemples.length,active:true,dateCreation:new Date().toLocaleDateString("fr-FR")};
                                  saveApprentissages({...apprentissages,reglesApprises:[...apprentissages.reglesApprises,nvRegle],suggestionsEnAttente:apprentissages.suggestionsEnAttente.filter(x=>x.id!==s.id)});
                                  toast("RÃ¨gle adoptÃ©e â");
                                }} style={{padding:"6px 12px",borderRadius:6,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontSize:11,fontWeight:500,cursor:"pointer"}}>â Adopter</button>
                                <button onClick={()=>saveApprentissages({...apprentissages,suggestionsEnAttente:apprentissages.suggestionsEnAttente.filter(x=>x.id!==s.id)})} style={{padding:"6px 12px",borderRadius:6,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#6B6E7E",fontSize:11,cursor:"pointer"}}>â Ignorer</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {/* ð SECTION E â CAS PARTICULIERS */}
            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {(sourcesFilter==="all"||sourcesFilter==="cas_part") && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{padding:"10px 14px",background:"rgba(184,146,79,0.06)",borderLeft:"3px solid #B8924F",borderRadius:"0 8px 8px 0"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>ð</span> Cas particuliers (clients VIP, partenaires)
                  </div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,lineHeight:1.5}}>
                    Matching automatique par domaine email et/ou nom. Quand un mail match, ARCHANGE active les rÃ¨gles spÃ©cifiques de la fiche.
                  </div>
                </div>

                {casParticuliers.map((cp, idx) => (
                  <div key={cp.id} style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                    <div style={{padding:"14px 20px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <input value={cp.nom} onChange={e=>{const u=[...casParticuliers]; u[idx]={...u[idx],nom:e.target.value}; saveCasParticuliers(u);}} placeholder="Nom du cas particulier (ex: Cabinet Dubois)" style={{...inp,flex:1,fontSize:13,fontWeight:600}}/>
                      <button onClick={()=>saveCasParticuliers(casParticuliers.filter(x=>x.id!==cp.id))} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:14,padding:"4px 10px"}}>â</button>
                    </div>
                    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                        <div>
                          <label style={{fontSize:10,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>ð§ Email / Domaine</label>
                          <input value={cp.emailPattern} onChange={e=>{const u=[...casParticuliers]; u[idx]={...u[idx],emailPattern:e.target.value}; saveCasParticuliers(u);}} placeholder="@cabinetdubois.fr ou contact@exact.com" style={{...inp,fontSize:12}}/>
                        </div>
                        <div>
                          <label style={{fontSize:10,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>ð¤ Nom (contient)</label>
                          <input value={cp.nomPattern} onChange={e=>{const u=[...casParticuliers]; u[idx]={...u[idx],nomPattern:e.target.value}; saveCasParticuliers(u);}} placeholder="Dubois" style={{...inp,fontSize:12}}/>
                        </div>
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>âï¸ Mode de matching</label>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>{const u=[...casParticuliers]; u[idx]={...u[idx],matchingMode:"auto"}; saveCasParticuliers(u);}} style={{padding:"6px 12px",borderRadius:6,border:cp.matchingMode==="auto"?"1px solid #B8924F":"1px solid #EBEAE5",background:cp.matchingMode==="auto"?"#B8924F":"#FFFFFF",color:cp.matchingMode==="auto"?"#FFFFFF":"#1A1A1E",fontSize:11,fontWeight:500,cursor:"pointer"}}>â¨ Automatique</button>
                          <button onClick={()=>{const u=[...casParticuliers]; u[idx]={...u[idx],matchingMode:"manuel"}; saveCasParticuliers(u);}} style={{padding:"6px 12px",borderRadius:6,border:cp.matchingMode==="manuel"?"1px solid #B8924F":"1px solid #EBEAE5",background:cp.matchingMode==="manuel"?"#B8924F":"#FFFFFF",color:cp.matchingMode==="manuel"?"#FFFFFF":"#1A1A1E",fontSize:11,fontWeight:500,cursor:"pointer"}}>â Manuel</button>
                        </div>
                        <div style={{fontSize:10,color:"#6B6E7E",marginTop:4}}>{cp.matchingMode==="auto"?"AppliquÃ© automatiquement aux mails correspondants":"Ne s'applique que si vous le forcez (pour Ã©viter les faux positifs)"}</div>
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>ð Contexte / historique</label>
                        <textarea value={cp.contexte} onChange={e=>{const u=[...casParticuliers]; u[idx]={...u[idx],contexte:e.target.value}; saveCasParticuliers(u);}} placeholder="Ex: Client fidÃ¨le depuis 2023, organise 4-5 Ã©vÃ©nements/an, tarif prÃ©fÃ©rentiel nÃ©gociÃ©." rows={2} style={{...inp,fontSize:12,resize:"vertical"}}/>
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>â¡ RÃ¨gles spÃ©cifiques</label>
                        <textarea value={cp.regles} onChange={e=>{const u=[...casParticuliers]; u[idx]={...u[idx],regles:e.target.value}; saveCasParticuliers(u);}} placeholder="Ex: Toujours vouvoyer. Tarif -10% systÃ©matique. Remise du devis en main propre." rows={3} style={{...inp,fontSize:12,resize:"vertical"}}/>
                      </div>
                    </div>
                  </div>
                ))}

                <button onClick={()=>saveCasParticuliers([...casParticuliers,{id:`cp_${Date.now()}`,nom:"",emailPattern:"",nomPattern:"",matchingMode:"auto",contexte:"",regles:""}])} style={{padding:"10px 16px",borderRadius:8,border:"1px dashed #B8924F",background:"#FFFFFF",color:"#B8924F",fontSize:13,fontWeight:500,cursor:"pointer",alignSelf:"flex-start"}}>+ Nouveau cas particulier</button>
              </div>
            )}

            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {/* ð« SECTION F â RÃGLES ABSOLUES (JAMAIS) */}
            {/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */}
            {(sourcesFilter==="all"||sourcesFilter==="absolues") && (() => {
              const lignes = (reglesAbsolues || "").split("\n").filter((l: string)=>l.trim());
              const tooMany = lignes.length > 10;
              return (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{padding:"10px 14px",background:"rgba(220,38,38,0.04)",borderLeft:"3px solid #DC2626",borderRadius:"0 8px 8px 0"}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>ð«</span> RÃ¨gles absolues (JAMAIS transgresser)
                    </div>
                    <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,lineHeight:1.5}}>
                      InjectÃ©es en FIN de prompt (rÃ©cence bias) pour maximiser le respect. Une rÃ¨gle par ligne, recommandÃ© max 10.
                    </div>
                  </div>

                  <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5",padding:"16px 20px"}}>
                    <textarea
                      value={reglesAbsolues}
                      onChange={e=>saveReglesAbsolues(e.target.value)}
                      placeholder={`Une rÃ¨gle par ligne. Formulation forte (JAMAIS, TOUJOURS). Ex :

1. Ne jamais donner un tarif sans prÃ©ciser "tarif indicatif"
2. Ne jamais confirmer une date sans vÃ©rifier le planning
3. Ne jamais s'engager sur un menu spÃ©cifique (dÃ©pend du chef)
4. Ne jamais mentionner le tarif d'un autre client
5. Toujours mentionner l'acompte 30% pour les devis > 1000â¬`}
                      rows={12}
                      style={{...inp,lineHeight:1.8,resize:"vertical",width:"100%",fontFamily:"inherit",fontSize:13}}
                    />
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                      <span style={{fontSize:11,color: tooMany ? "#DC2626" : "#6B6E7E"}}>
                        {lignes.length} rÃ¨gle{lignes.length>1?"s":""} {tooMany ? `â â ï¸ trop nombreuses (max recommandÃ© : 10)` : ""}
                      </span>
                      {reglesAbsolues && <button onClick={()=>saveReglesAbsolues("")} style={{fontSize:11,color:"#DC2626",background:"none",border:"none",cursor:"pointer"}}>Vider Ã</button>}
                    </div>
                  </div>
                </div>
              );
            })()}

            </div>
            </div>
          </div>
          );
        })()}
      </main>

      {/* ââ MODAL FICHE ÃVÃNEMENT depuis le Planning ââ */}
      {/* Affiche la fiche complÃ¨te en overlay sans quitter la vue Planning */}
      {/* ââ FICHE ÃVÃNEMENT UNIFIÃE ââ
           UN seul composant â ouvert depuis ÃvÃ©nements, Planning ou Mails
           Toujours en modale slide-in (position:fixed), 4 onglets identiques partout */}
      {selResaGeneral && !editResaPanel && (()=>{
        const resa = selResaGeneral;
        const {prenom, nom} = splitNomPrenom(resa);
        const fullName = [prenom, nom].filter(Boolean).join(" ") || "â";
        const st = statuts.find(s=>s.id===(resa.statut||"nouveau")) || statuts[0] || {bg:"#F5F4F0",color:"#6B6B72",label:"â"};
        const espaceNom = ESPACES.find(e=>e.id===resa.espaceId)?.nom || "";
        const linkedCount = getLinkedEmails(resa).length;
        const relancesCount = relances.filter(r=>r.resaId===resa.id).length;

        const grpLabel:any = {fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:9,fontFamily:"'Geist','system-ui',sans-serif"};
        const infoLabelStyle:any = {fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4,display:"inline-flex",alignItems:"center",gap:6,fontFamily:"'Geist','system-ui',sans-serif"};
        const infoValueStyle:any = {fontSize:14,color:"#1A1A1E",fontWeight:500,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.005em",fontFamily:"'Geist','system-ui',sans-serif"};
        const infoValueEmpty:any = {...infoValueStyle,color:"#A5A4A0",fontWeight:400};

        const IcCal = () => <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{opacity:0.6}}><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 5.5h11" stroke="currentColor" strokeWidth="1.3"/></svg>;
        const IcClock = () => <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{opacity:0.6}}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.3"/></svg>;
        const IcPeople = () => <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{opacity:0.6}}><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
        const IcType = () => <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{opacity:0.6}}><circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 3.5v3M7 7.5v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
        const IcPin = () => <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{opacity:0.6}}><path d="M7 12.5s3.8-3.4 3.8-7A3.8 3.8 0 107 1.7c0 3.5 3.8 7 3.8 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7" cy="5.3" r="1.3" stroke="currentColor" strokeWidth="1.3"/></svg>;
        const IcMoney = () => <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{opacity:0.6}}><path d="M10 3H5a2 2 0 000 4h4a2 2 0 010 4H3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M6.5 1.5v11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;

        return (
        <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"stretch",justifyContent:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget){setSelResaGeneral(null);setResaOnglet("infos");}}}>
          <div style={{position:"absolute",inset:0,background:"rgba(27,30,43,0.45)",backdropFilter:"blur(3px)",WebkitBackdropFilter:"blur(3px)"}}/>
          <div style={{position:"relative",width:580,maxWidth:"95vw",height:"100vh",background:"#FFFFFF",display:"flex",flexDirection:"column",boxShadow:"-12px 0 40px rgba(15,15,20,0.12)",borderLeft:"1px solid #EBEAE5"}}>

            {/* Header hero */}
            <div style={{padding:"22px 24px 18px",borderBottom:"1px solid #EBEAE5",flexShrink:0}}>
              <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:14}}>
                <Avatar name={fullName} size={52}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:22,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.02em",lineHeight:1.15}}>{fullName}</div>
                  {resa.entreprise && <div style={{fontSize:13,color:"#6B6B72",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>{resa.entreprise}</div>}
                  <div style={{display:"inline-flex",alignItems:"center",gap:7,marginTop:7}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:st.color,flexShrink:0}}/>
                    <span style={{fontSize:11.5,fontWeight:500,color:st.color,textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:"'Geist','system-ui',sans-serif"}}>{st.label}</span>
                  </div>
                </div>
                <button onClick={()=>{setSelResaGeneral(null);setResaOnglet("infos");}} title="Fermer" style={{width:30,height:30,borderRadius:8,border:"none",background:"transparent",color:"#6B6B72",cursor:"pointer",fontSize:18,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>Ã</button>
              </div>
              {(resa.email || resa.telephone) && (
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {resa.email && <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11.5,color:"#6B6B72",background:"#F5F4F0",padding:"4px 10px",borderRadius:6,fontFamily:"'Geist','system-ui',sans-serif"}}>
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.6,flexShrink:0}}><path d="M1 4l6 4.5L13 4M1 3.5h12v7H1z" stroke="currentColor" strokeWidth="1.3"/></svg>
                    {resa.email}
                  </span>}
                  {resa.telephone && <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11.5,color:"#6B6B72",background:"#F5F4F0",padding:"4px 10px",borderRadius:6,fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums"}}>
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{opacity:0.6,flexShrink:0}}><path d="M2 2l2 0c0.5 0 0.9 0.3 1.1 0.8l0.7 2c0.2 0.5 0 1.1-0.4 1.4l-1 0.7c0.8 1.5 2 2.7 3.5 3.5l0.7-1c0.3-0.4 0.9-0.6 1.4-0.4l2 0.7c0.5 0.2 0.8 0.6 0.8 1.1l0 2c0 0.7-0.6 1.2-1.3 1.2C5.8 14 0 8.2 0 1.3 0 0.6 0.5 0 1.2 0L2 2z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
                    {resa.telephone}
                  </span>}
                </div>
              )}
            </div>

            {/* Onglets */}
            <div style={{display:"flex",borderBottom:"1px solid #EBEAE5",flexShrink:0,padding:"0 24px",gap:4}}>
              {([
                ["infos","Infos",null,<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M4 5h6M4 7h6M4 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>],
                ["mails","Mails",linkedCount||null,<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 4l6 4.5L13 4M1 3.5h12v7H1z" stroke="currentColor" strokeWidth="1.3"/></svg>],
                ["noteIA","Note ARCHANGE",null,<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v2M7 11v2M2.5 2.5l1.5 1.5M10 10l1.5 1.5M1 7h2M11 7h2M2.5 11.5l1.5-1.5M10 4l1.5-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>],
                ["relances","Relances",relancesCount||null,<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>],
              ] as const).map(([tab,label,cnt,icon])=>{
                const active = resaOnglet === tab;
                return (
                  <button key={tab} onClick={()=>setResaOnglet(tab as any)} style={{padding:"10px 14px",fontSize:12.5,fontWeight:active?500:400,color:active?"#1A1A1E":"#6B6B72",background:"transparent",border:"none",borderBottom:`2px solid ${active?"#B8924F":"transparent"}`,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",marginBottom:-1,display:"inline-flex",alignItems:"center",gap:6}}>
                    {icon}
                    {label}
                    {cnt!=null && <span style={{fontSize:10.5,padding:"1px 6px",background:active?"rgba(184,146,79,0.12)":"#F5F4F0",color:active?"#B8924F":"#A5A4A0",borderRadius:100,fontVariantNumeric:"tabular-nums",fontWeight:500}}>{cnt}</span>}
                  </button>
                );
              })}
            </div>

            {/* Corps scrollable */}
            <div style={{flex:1,overflowY:"auto",padding:"22px 24px 24px"}}>

              {/* ââ Onglet INFOS ââ */}
              {resaOnglet==="infos"&&(
                <div>
                  {/* Changer le statut */}
                  <div style={{marginBottom:22}}>
                    <div style={grpLabel}>Changer le statut</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {statuts.map(s=>{
                        const active = (resa.statut||"nouveau")===s.id;
                        return (
                          <button key={s.id} onClick={()=>{const upd=resas.map(r=>r.id===resa.id?{...r,statut:s.id}:r);saveResas(upd);setSelResaGeneral({...resa,statut:s.id});}} style={{padding:"6px 12px",borderRadius:100,border:active?`1px solid ${s.color}55`:"1px solid transparent",background:active?s.bg:"#F5F4F0",color:active?s.color:"#6B6B72",fontFamily:"'Geist','system-ui',sans-serif",fontSize:11.5,fontWeight:500,cursor:"pointer",transition:"all .12s ease",display:"inline-flex",alignItems:"center",gap:6}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:s.color}}/>
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Grille infos hairline */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:"1px solid #EBEAE5",marginBottom:22}}>
                    {([
                      [<IcCal/>, "Date", resa.dateDebut?fmtDateFr(resa.dateDebut):null],
                      [<IcClock/>, "Horaires", (resa.heureDebut||resa.heureFin)?`${resa.heureDebut||"?"}${resa.heureFin?" â "+resa.heureFin:""}`:null],
                      [<IcPeople/>, "Personnes", resa.nombrePersonnes||null],
                      [<IcType/>, "Type", resa.typeEvenement||null],
                      [<IcPin/>, "Espace", espaceNom||null],
                      [<IcMoney/>, "Budget", resa.budget||null],
                    ] as const).map(([icon,k,v],i)=>(
                      <div key={String(k)} style={{padding:"14px 0",borderBottom:"1px solid #EBEAE5",paddingRight:i%2===0?16:0,paddingLeft:i%2===1?16:0,borderRight:i%2===0?"1px solid #EBEAE5":"none"}}>
                        <div style={infoLabelStyle}>{icon}{k}</div>
                        <div style={k==="Budget"&&v?{...infoValueStyle,color:"#B8924F"}:(v?infoValueStyle:infoValueEmpty)}>{v||"Non renseignÃ©"}</div>
                      </div>
                    ))}
                  </div>

                  {/* Notes du client */}
                  {resa.notes&&(
                    <div style={{background:"#F5F4F0",borderRadius:10,padding:"14px 16px",marginBottom:18}}>
                      <div style={grpLabel}>Notes du client</div>
                      <div style={{fontSize:13,color:"#1A1A1E",lineHeight:1.6,fontFamily:"'Geist','system-ui',sans-serif"}}>{resa.notes}</div>
                    </div>
                  )}

                  {/* Note directeur */}
                  <div style={{border:"1px solid #EBEAE5",borderRadius:10,overflow:"hidden",marginBottom:8}}>
                    <div style={{padding:"10px 14px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5",fontSize:11.5,fontWeight:500,color:"#1A1A1E",display:"flex",alignItems:"center",gap:6,fontFamily:"'Geist','system-ui',sans-serif"}}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{color:"#B8924F"}}><path d="M2 11l1-3 7-7 2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 3l2 2" stroke="currentColor" strokeWidth="1.3"/></svg>
                      Note directeur
                      <span style={{marginLeft:"auto",fontSize:10,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:500}}>PrivÃ©</span>
                    </div>
                    <div style={{padding:"12px 14px",background:"#FFFFFF"}}>
                      <textarea value={resa.noteDirecteur||""} onChange={e=>{const upd=resas.map(r=>r.id===resa.id?{...r,noteDirecteur:e.target.value}:r);saveResas(upd);setSelResaGeneral({...resa,noteDirecteur:e.target.value});}} placeholder="Note confidentielle rÃ©servÃ©e Ã  la directionâ¦" rows={3} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #EBEAE5",background:"#FAFAF7",color:"#1A1A1E",fontSize:13,lineHeight:1.6,resize:"vertical",outline:"none",fontFamily:"'Geist','system-ui',sans-serif"}}/>
                    </div>
                  </div>
                </div>
              )}

              {/* ââ Onglet MAILS ââ */}
              {resaOnglet==="mails"&&(()=>{
                const linked = getLinkedEmails(resa);
                return linked.length===0?(
                  <div style={{textAlign:"center",padding:"48px 16px",color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif"}}>
                    <svg width="32" height="32" viewBox="0 0 14 14" fill="none" style={{color:"#C5C3BE",marginBottom:10}}><path d="M1 4l6 4.5L13 4M1 3.5h12v7H1z" stroke="currentColor" strokeWidth="1"/></svg>
                    <div style={{fontSize:13,color:"#6B6B72"}}>Aucun mail associÃ©</div>
                    <div style={{fontSize:11.5,marginTop:4}}>Ã  l'adresse {resa.email||"â"}</div>
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {linked.map(m=>(
                      <div key={m.id}>
                        <div style={{background:"#FFFFFF",borderRadius:10,padding:"13px 15px",border:"1px solid #EBEAE5"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,gap:10}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                              <span style={{fontSize:10,background:"#EDF2F8",color:"#2D5AA8",padding:"2px 7px",borderRadius:100,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",fontFamily:"'Geist','system-ui',sans-serif"}}>ReÃ§u</span>
                              <span style={{fontSize:13,fontWeight:500,color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.from}</span>
                            </div>
                            <span style={{fontSize:11,color:"#A5A4A0",flexShrink:0,fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums"}}>{m.date}</span>
                          </div>
                          <div style={{fontSize:12.5,color:"#6B6B72",lineHeight:1.55,marginBottom:10,fontFamily:"'Geist','system-ui',sans-serif"}}>{(m.snippet||"").slice(0,120)}{(m.snippet||"").length>120?"â¦":""}</div>
                          <button onClick={()=>{ouvrirMailDepuisEvenement(m,resa);}} style={{width:"100%",padding:"8px",borderRadius:8,border:"1px solid #E0DED7",background:"transparent",color:"#6B6B72",fontSize:12,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500}}>Ouvrir le mail â</button>
                        </div>
                        {sentReplies[m.id]&&(
                          <div style={{marginLeft:20,marginTop:6,background:"#F6F9F3",borderRadius:10,padding:"11px 14px",border:"1px solid rgba(107,138,91,0.22)"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <span style={{fontSize:10,background:"#EDF2E8",color:"#3F5B32",padding:"2px 7px",borderRadius:100,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",fontFamily:"'Geist','system-ui',sans-serif"}}>Vous</span>
                              <span style={{fontSize:11,color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums"}}>{sentReplies[m.id].date}</span>
                            </div>
                            <div style={{fontSize:12.5,color:"#374151",lineHeight:1.55,whiteSpace:"pre-wrap",fontFamily:"'Geist','system-ui',sans-serif"}}>{sentReplies[m.id].text.slice(0,200)}{sentReplies[m.id].text.length>200?"â¦":""}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ââ Onglet NOTE IA ââ */}
              {resaOnglet==="noteIA"&&(
                <div>
                  {noteIA[resa.id]
                    ? <div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                          <span style={{fontSize:11.5,color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif"}}>GÃ©nÃ©rÃ©e le {noteIA[resa.id].date}</span>
                          <button onClick={()=>generateNoteIA(resa)} disabled={!!genNoteIA} style={{fontSize:12,padding:"6px 12px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#6B6B72",cursor:genNoteIA?"wait":"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500}}>âº RÃ©gÃ©nÃ©rer</button>
                        </div>
                        <div style={{fontSize:13.5,color:"#1A1A1E",lineHeight:1.75,whiteSpace:"pre-wrap",fontFamily:"'Geist','system-ui',sans-serif"}}>{noteIA[resa.id].text}</div>
                      </div>
                    : <div style={{textAlign:"center",padding:"48px 0",fontFamily:"'Geist','system-ui',sans-serif"}}>
                        <svg width="32" height="32" viewBox="0 0 14 14" fill="none" style={{color:"#B8924F",marginBottom:10,opacity:0.6}}><path d="M7 1v2M7 11v2M2.5 2.5l1.5 1.5M10 10l1.5 1.5M1 7h2M11 7h2M2.5 11.5l1.5-1.5M10 4l1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                        <div style={{fontSize:13,color:"#6B6B72",marginBottom:16}}>GÃ©nÃ©rez une note de briefing basÃ©e sur les Ã©changes emails</div>
                        <button onClick={()=>generateNoteIA(resa)} disabled={!!genNoteIA} style={{padding:"10px 18px",borderRadius:10,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontSize:13,fontWeight:500,cursor:genNoteIA?"wait":"pointer",display:"inline-flex",alignItems:"center",gap:8,fontFamily:"'Geist','system-ui',sans-serif",boxShadow:"0 1px 2px rgba(184,146,79,0.2)"}}>
                          {genNoteIA?<><Spin s={12}/> GÃ©nÃ©rationâ¦</>:<><span style={{fontSize:13}}>â¦</span> GÃ©nÃ©rer la note</>}
                        </button>
                      </div>
                  }
                </div>
              )}

              {/* ââ Onglet RELANCES ââ */}
              {resaOnglet==="relances"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:13,fontWeight:500,color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",letterSpacing:"-0.005em"}}>Relances planifiÃ©es</div>
                    <button onClick={()=>setShowRelanceForm(resa.id)} style={{fontSize:12,padding:"6px 12px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500}}>+ Ajouter</button>
                  </div>
                  {relances.filter(r=>r.resaId===resa.id).length===0
                    ? <div style={{textAlign:"center",padding:"32px 0",color:"#A5A4A0",fontSize:13,fontFamily:"'Geist','system-ui',sans-serif"}}>Aucune relance planifiÃ©e</div>
                    : [...relances.filter(r=>r.resaId===resa.id)].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(rel=>{
                        const isOverdue = rel.date < new Date().toISOString().slice(0,10);
                        return (
                          <div key={rel.id} style={{padding:"11px 14px",background:"#FFFFFF",borderRadius:10,border:`1px solid ${isOverdue?"#FAEDEB":"#EBEAE5"}`,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div>
                              <div style={{fontSize:12.5,fontWeight:500,color:isOverdue?"#A84B45":"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums"}}>{fmtDateFr(rel.date)}{rel.heure&&` Ã  ${rel.heure}`}{isOverdue&&" Â· en retard"}</div>
                              {rel.note&&<div style={{fontSize:11.5,color:"#6B6B72",marginTop:2,fontFamily:"'Geist','system-ui',sans-serif"}}>{rel.note}</div>}
                            </div>
                            <button onClick={()=>saveRelances(relances.filter(r=>r.id!==rel.id))} title="Supprimer" style={{background:"none",border:"none",color:"#A5A4A0",cursor:"pointer",fontSize:14,padding:"2px 6px",borderRadius:4,transition:"color .12s ease"}} onMouseEnter={e=>e.currentTarget.style.color="#A84B45"} onMouseLeave={e=>e.currentTarget.style.color="#A5A4A0"}>â</button>
                          </div>
                        );
                      })
                  }
                  {/* Formulaire ajout relance */}
                  {showRelanceForm===resa.id&&(
                    <div style={{background:"#FAFAF7",borderRadius:10,padding:"14px 16px",border:"1px solid #EBEAE5",marginTop:12}}>
                      <div style={{fontSize:12.5,fontWeight:500,color:"#1A1A1E",marginBottom:12,fontFamily:"'Geist','system-ui',sans-serif"}}>Programmer une relance</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div><label style={{fontSize:10.5,color:"#6B6B72",display:"block",marginBottom:5,fontFamily:"'Geist','system-ui',sans-serif"}}>Date</label><DatePicker value={relanceDate} onChange={v=>setRelanceDate(v)}/></div>
                        <div><label style={{fontSize:10.5,color:"#6B6B72",display:"block",marginBottom:5,fontFamily:"'Geist','system-ui',sans-serif"}}>Heure</label><TimePicker value={relanceHeure} onChange={v=>setRelanceHeure(v)} placeholder="Heure"/></div>
                      </div>
                      <div style={{marginBottom:12}}><label style={{fontSize:10.5,color:"#6B6B72",display:"block",marginBottom:5,fontFamily:"'Geist','system-ui',sans-serif"}}>Note (optionnel)</label><input value={relanceNote} onChange={e=>setRelanceNote(e.target.value)} placeholder="Ex: Rappeler pour le devisâ¦" style={{width:"100%",padding:"9px 12px",border:"1px solid #EBEAE5",borderRadius:8,background:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,color:"#1A1A1E",outline:"none"}}/></div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{if(!relanceDate)return;const rel={id:"rel_"+Date.now(),resaId:resa.id,resaNom:fullName,resaEmail:resa.email,date:relanceDate,heure:relanceHeure,note:relanceNote};saveRelances([...relances,rel]);setShowRelanceForm(null);setRelanceDate("");setRelanceHeure("");setRelanceNote("");toast("Relance programmÃ©e !");}} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12,fontWeight:500,cursor:"pointer"}}>Confirmer</button>
                        <button onClick={()=>setShowRelanceForm(null)} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12,cursor:"pointer"}}>Annuler</button>
                      </div>
                    </div>
                  )}
                  <button onClick={()=>{setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");setShowRelanceIA(resa);}} style={{width:"100%",padding:"10px",borderRadius:10,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",fontSize:12.5,fontWeight:500,cursor:"pointer",marginTop:12,display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:"'Geist','system-ui',sans-serif"}}><span style={{fontSize:13,color:"#B8924F"}}>â¦</span> GÃ©nÃ©rer une relance IA</button>
                </div>
              )}
            </div>

            {/* Footer hiÃ©rarchisÃ© */}
            <div style={{padding:"14px 24px",borderTop:"1px solid #EBEAE5",background:"#FAFAF7",display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>openSendMail(resa)} style={{flex:1,padding:"10px 16px",borderRadius:10,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,letterSpacing:"-0.005em",boxShadow:"0 1px 2px rgba(184,146,79,0.2)",justifyContent:"center"}}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 7L13 1L9.5 13L7 8L1 7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                  Envoyer un mail
                </button>
                <button onClick={()=>{setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");setShowRelanceIA(resa);}} style={{flex:1,padding:"10px 16px",borderRadius:10,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,letterSpacing:"-0.005em",justifyContent:"center"}}>
                  <span style={{fontSize:13,color:"#B8924F"}}>â¦</span> Relance ARCHANGE
                </button>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>setEditResaPanel({...resa,prenom:prenom,nom:nom})} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><path d="M2 11l1-3 7-7 2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 3l2 2" stroke="currentColor" strokeWidth="1.3"/></svg>
                  Modifier
                </button>
                <button onClick={()=>setShowRelanceForm(resa.id)} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{opacity:0.7}}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  Programmer une relance
                </button>
              </div>
              <button onClick={()=>{if(!window.confirm(`Supprimer l'Ã©vÃ©nement de ${fullName||"ce client"} ? Cette action est irrÃ©versible.`))return;saveResas(resas.filter(r=>r.id!==resa.id));setSelResaGeneral(null);toast("SupprimÃ©");}} style={{padding:"8px 12px",border:"none",background:"transparent",color:"#A84B45",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12,fontWeight:400,cursor:"pointer",borderRadius:6,transition:"background .12s ease"}} onMouseEnter={e=>e.currentTarget.style.background="#FAEDEB"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Supprimer l'Ã©vÃ©nement</button>
            </div>
          </div>
        </div>
        );
      })()}
      {/* Formulaire modification Ã©vÃ©nement â v3 */}
      {editResaPanel&&selResaGeneral&&(()=>{
        const grpLabel:any = {fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:9,fontFamily:"'Geist','system-ui',sans-serif"};
        const fieldLabel:any = {fontSize:12,color:"#6B6B72",marginBottom:5,display:"inline-flex",alignItems:"center",gap:5,fontWeight:400,fontFamily:"'Geist','system-ui',sans-serif"};
        const inputStyle:any = {width:"100%",padding:"9px 12px",border:"1px solid #EBEAE5",borderRadius:8,background:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13.5,color:"#1A1A1E",outline:"none"};
        return (
        <div style={{position:"fixed",inset:0,zIndex:601,display:"flex",alignItems:"stretch",justifyContent:"flex-end"}}>
          <div style={{position:"absolute",inset:0,background:"rgba(27,30,43,0.55)",backdropFilter:"blur(3px)",WebkitBackdropFilter:"blur(3px)"}}/>
          <div style={{position:"relative",width:520,maxWidth:"95vw",height:"100vh",background:"#FFFFFF",display:"flex",flexDirection:"column",boxShadow:"-12px 0 40px rgba(15,15,20,0.15)",borderLeft:"1px solid #EBEAE5"}}>
            {/* Header */}
            <div style={{padding:"16px 22px",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,borderRadius:10,background:"#F4EEDF",color:"#B8924F",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M2 11l1-3 7-7 2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 3l2 2" stroke="currentColor" strokeWidth="1.4"/></svg>
                </div>
                <div>
                  <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:17,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.01em",lineHeight:1.2}}>Modifier l'Ã©vÃ©nement</div>
                  <div style={{fontSize:11.5,color:"#6B6B72",marginTop:2,fontFamily:"'Geist','system-ui',sans-serif"}}>Ãditer les informations de la demande</div>
                </div>
              </div>
              <button onClick={()=>setEditResaPanel(null)} title="Annuler" style={{width:30,height:30,borderRadius:8,border:"none",background:"transparent",color:"#6B6B72",cursor:"pointer",fontSize:18,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>Ã</button>
            </div>
            {/* Body */}
            <div style={{flex:1,overflowY:"auto",padding:"20px 22px 18px"}}>
              {/* CLIENT */}
              <div style={{marginBottom:18}}>
                <div style={grpLabel}>Client</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12}}>
                  <div>
                    <label style={fieldLabel}>PrÃ©nom</label>
                    <input value={editResaPanel.prenom||""} onChange={e=>setEditResaPanel({...editResaPanel,prenom:e.target.value})} placeholder="PrÃ©nom" style={inputStyle}/>
                  </div>
                  <div>
                    <label style={fieldLabel}>Nom</label>
                    <input value={editResaPanel.nom||""} onChange={e=>setEditResaPanel({...editResaPanel,nom:e.target.value})} placeholder="Nom" style={inputStyle}/>
                  </div>
                  <div>
                    <label style={fieldLabel}>SociÃ©tÃ©</label>
                    <input value={editResaPanel.entreprise||""} onChange={e=>setEditResaPanel({...editResaPanel,entreprise:e.target.value})} placeholder="Optionnel" style={inputStyle}/>
                  </div>
                </div>
              </div>
              {/* CONTACT */}
              <div style={{marginBottom:18}}>
                <div style={grpLabel}>Contact</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
                  <div>
                    <label style={fieldLabel}>Email</label>
                    <input value={editResaPanel.email||""} onChange={e=>setEditResaPanel({...editResaPanel,email:e.target.value})} placeholder="nom@exemple.com" style={inputStyle}/>
                  </div>
                  <div>
                    <label style={fieldLabel}>TÃ©lÃ©phone</label>
                    <input value={editResaPanel.telephone||""} onChange={e=>setEditResaPanel({...editResaPanel,telephone:e.target.value})} placeholder="+33 6 12 34 56 78" style={{...inputStyle,fontVariantNumeric:"tabular-nums"}}/>
                  </div>
                </div>
              </div>
              {/* QUAND */}
              <div style={{marginBottom:18}}>
                <div style={grpLabel}>Quand</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12}}>
                  <div>
                    <label style={fieldLabel}>Date</label>
                    <DatePicker value={editResaPanel.dateDebut||""} onChange={v=>setEditResaPanel({...editResaPanel,dateDebut:v})}/>
                  </div>
                  <div>
                    <label style={fieldLabel}>Heure de dÃ©but</label>
                    <TimePicker value={editResaPanel.heureDebut||""} onChange={v=>setEditResaPanel({...editResaPanel,heureDebut:v})} placeholder="Heure de dÃ©but"/>
                  </div>
                  <div>
                    <label style={fieldLabel}>Heure de fin</label>
                    <TimePicker value={editResaPanel.heureFin||""} onChange={v=>setEditResaPanel({...editResaPanel,heureFin:v})} placeholder="Heure de fin"/>
                  </div>
                </div>
              </div>
              {/* INVITÃS */}
              <div style={{marginBottom:18}}>
                <div style={grpLabel}>InvitÃ©s</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
                  <div>
                    <label style={fieldLabel}>Nombre de personnes</label>
                    <input type="number" min="1" value={editResaPanel.nombrePersonnes||""} onChange={e=>setEditResaPanel({...editResaPanel,nombrePersonnes:e.target.value})} style={{...inputStyle,fontVariantNumeric:"tabular-nums"}}/>
                  </div>
                  <div>
                    <label style={fieldLabel}>Type d'Ã©vÃ©nement</label>
                    <input value={editResaPanel.typeEvenement||""} onChange={e=>setEditResaPanel({...editResaPanel,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, DÃ®nerâ¦" style={inputStyle}/>
                  </div>
                </div>
              </div>
              {/* LIEU & BUDGET */}
              <div style={{marginBottom:18}}>
                <div style={grpLabel}>Lieu & budget</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
                  <div>
                    <label style={fieldLabel}>Espace</label>
                    <select value={editResaPanel.espaceId||espacesDyn[0]?.id||""} onChange={e=>setEditResaPanel({...editResaPanel,espaceId:e.target.value})} style={inputStyle}>
                      {ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={fieldLabel}>Budget client</label>
                    <input value={editResaPanel.budget||""} onChange={e=>setEditResaPanel({...editResaPanel,budget:e.target.value})} placeholder="Ex: 5 000â¬â¦" style={inputStyle}/>
                  </div>
                </div>
              </div>
              {/* STATUT */}
              <div style={{marginBottom:18}}>
                <div style={grpLabel}>Statut</div>
                <select value={editResaPanel.statut||"nouveau"} onChange={e=>setEditResaPanel({...editResaPanel,statut:e.target.value})} style={inputStyle}>
                  {statuts.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              {/* NOTES */}
              <div>
                <div style={grpLabel}>Notes</div>
                <textarea value={editResaPanel.notes||""} onChange={e=>setEditResaPanel({...editResaPanel,notes:e.target.value})} rows={3} placeholder="Informations complÃ©mentaires, demandes spÃ©cifiquesâ¦" style={{...inputStyle,resize:"vertical",minHeight:70,lineHeight:1.55}}/>
              </div>
            </div>
            {/* Footer */}
            <div style={{padding:"14px 22px",borderTop:"1px solid #EBEAE5",background:"#FAFAF7",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <div style={{flex:1}}/>
              <button onClick={()=>setEditResaPanel(null)} style={{padding:"9px 13px",borderRadius:10,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12.5,fontWeight:500,cursor:"pointer"}}>Annuler</button>
              <button onClick={()=>{if(!editResaPanel.nom?.trim()&&!editResaPanel.prenom?.trim()){toast("PrÃ©nom ou nom requis","err");return;}const upd=resas.map(r=>r.id===editResaPanel.id?editResaPanel:r);saveResas(upd);setSelResaGeneral(editResaPanel);setEditResaPanel(null);toast("Mis Ã  jour !");}} style={{padding:"9px 16px",borderRadius:10,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,letterSpacing:"-0.005em",boxShadow:"0 1px 2px rgba(184,146,79,0.2)"}}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
        );
      })()}
      {/* ââ MODALE RADAR â CRÃER RÃSERVATION ââ */}
      {radarResaModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99998,padding:24}}>
          <div style={{background:"#FFFFFF",borderRadius:16,width:"min(540px,100%)",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 32px 80px rgba(0,0,0,.3)"}}>
            <div style={{padding:"18px 22px",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:600,color:"#1A1A1E"}}>ð CrÃ©er la rÃ©servation</div>
              <button onClick={()=>setRadarResaModal(null)} style={{width:30,height:30,borderRadius:7,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>Ã</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{background:"#FEF9EE",borderRadius:9,padding:"9px 13px",fontSize:12,color:"#854F0B"}}>DonnÃ©es prÃ©-remplies par ARCHANGE â vÃ©rifiez avant de valider.</div>
              {[["nom","ð¤ Nom"],["email","ð§ Email"],["telephone","ð TÃ©lÃ©phone"],["entreprise","ð¢ Entreprise"],["nombrePersonnes","ð¥ Nb personnes"],["budget","ð° Budget"]].map(([k,l])=>(
                <div key={k}><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>{l}</label><input value={radarResaModal[k]||""} onChange={e=>setRadarResaModal({...radarResaModal,[k]:e.target.value})} style={{...inp}}/></div>
              ))}
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>ð Date</label><DatePicker value={radarResaModal.dateDebut||""} onChange={v=>setRadarResaModal({...radarResaModal,dateDebut:v})}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>ð Heure dÃ©but</label><TimePicker value={radarResaModal.heureDebut||""} onChange={v=>setRadarResaModal({...radarResaModal,heureDebut:v})} placeholder="Heure dÃ©but"/></div>
                <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>ð Heure fin</label><TimePicker value={radarResaModal.heureFin||""} onChange={v=>setRadarResaModal({...radarResaModal,heureFin:v})} placeholder="Heure fin"/></div>
              </div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>ð Type d'Ã©vÃ©nement</label><input value={radarResaModal.typeEvenement||""} onChange={e=>setRadarResaModal({...radarResaModal,typeEvenement:e.target.value})} style={{...inp}}/></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>ð Espace</label><select value={radarResaModal.espaceId||espacesDyn[0]?.id||""} onChange={e=>setRadarResaModal({...radarResaModal,espaceId:e.target.value})} style={{...inp}}>{ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>ð Notes</label><textarea value={radarResaModal.notes||""} onChange={e=>setRadarResaModal({...radarResaModal,notes:e.target.value})} rows={3} style={{...inp,resize:"vertical",lineHeight:1.6}}/></div>
            </div>
            <div style={{padding:"14px 20px",borderTop:"1px solid #EBEAE5",display:"flex",gap:8,flexShrink:0}}>
              <button onClick={()=>{
                if(!radarResaModal.nom?.trim()){toast("Le nom est requis","err");return;}
                const newResa={...EMPTY_RESA,...radarResaModal,id:Date.now()};
                const updated=[...resas,newResa]; saveResas(updated);
                if(radarResaModal._emailId) saveEmailResaLinks({...emailResaLinks,[radarResaModal._emailId]:newResa.id});
                setRadarTraites(prev=>new Set([...prev,radarResaModal._emailId]));
                setRadarResaModal(null); toast("RÃ©servation crÃ©Ã©e !");
              }} style={{flex:1,...gold,padding:"10px"}}>CrÃ©er la rÃ©servation</button>
              <button onClick={()=>setRadarResaModal(null)} style={{...out}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ââ MODALE RADAR â GÃNÃRER RÃPONSE v3 ââ */}
      {radarReplyModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,26,30,0.45)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99998,padding:24}}>
          <div style={{background:"#FFFFFF",borderRadius:16,width:"min(620px,100%)",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(15,15,20,0.18), 0 0 0 1px rgba(184,146,79,0.15)",overflow:"hidden"}}>
            {/* Header dorÃ© cohÃ©rent avec RÃ©ponse ARCHANGE inline */}
            <div style={{padding:"14px 22px",borderBottom:"1px solid rgba(184,146,79,0.15)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,background:"linear-gradient(180deg, rgba(184,146,79,0.06) 0%, #FFFFFF 100%)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                <span style={{fontSize:16,color:"#B8924F",lineHeight:1,flexShrink:0}}>â¦</span>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:"#B8924F",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>RÃ©ponse ARCHANGE</div>
                  <div style={{fontSize:12.5,color:"#1A1A1E",marginTop:2,fontFamily:"'Geist','system-ui',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{radarReplyModal.m?.from}</div>
                </div>
              </div>
              <button onClick={()=>{setRadarReplyModal(null);setRadarReplyText("");}} title="Fermer" style={{width:30,height:30,borderRadius:8,border:"none",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease",flexShrink:0}}>Ã</button>
            </div>
            {/* Body */}
            <div style={{flex:1,overflowY:"auto",padding:"20px 22px"}}>
              {radarReplyLoading
                ? <div style={{display:"flex",alignItems:"center",gap:12,color:"#6B6E7E",padding:"48px 0",justifyContent:"center",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13}}><Spin s={16}/> Archange rÃ©dige la rÃ©ponseâ¦</div>
                : radarReplyText
                  ? <textarea value={radarReplyText} onChange={e=>setRadarReplyText(e.target.value)} rows={14} style={{width:"100%",padding:"14px 16px",fontFamily:"'Geist','system-ui',sans-serif",fontSize:14,color:"#1A1A1E",lineHeight:1.65,border:"1px solid #EBEAE5",borderRadius:10,outline:"none",resize:"vertical",background:"#FAFAF7",transition:"border-color .12s ease"}}/>
                  : <div style={{padding:"40px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:12,fontFamily:"'Geist','system-ui',sans-serif"}}>
                      <div style={{color:"#6B6E7E",textAlign:"center",fontSize:13,lineHeight:1.5,maxWidth:340}}>La rÃ©ponse gÃ©nÃ©rÃ©e par Archange apparaÃ®tra ici. Vous pourrez l'Ã©diter avant de la copier ou de la marquer en brouillon.</div>
                    </div>
              }
            </div>
            {/* Footer avec hiÃ©rarchie claire : primary dorÃ© + ghost + text */}
            <div style={{padding:"14px 22px",borderTop:"1px solid #EBEAE5",display:"flex",gap:8,flexShrink:0,background:"#FAFAF7",alignItems:"center"}}>
              <button onClick={()=>{navigator.clipboard.writeText(radarReplyText);toast("CopiÃ© !");}} disabled={!radarReplyText||radarReplyLoading} style={{padding:"9px 14px",borderRadius:10,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontSize:13,fontWeight:500,cursor:(!radarReplyText||radarReplyLoading)?"not-allowed":"pointer",opacity:!radarReplyText||radarReplyLoading?0.5:1,fontFamily:"'Geist','system-ui',sans-serif",display:"inline-flex",alignItems:"center",gap:6,transition:"all .14s ease"}}>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M10.5 3.5V2a.5.5 0 00-.5-.5H2a.5.5 0 00-.5.5v8a.5.5 0 00.5.5h1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                Copier
              </button>
              <button onClick={()=>{if(radarReplyModal?.m) {setDrafted(prev=>new Set([...prev,radarReplyModal.m.id]));} setRadarReplyModal(null);setRadarReplyText("");toast("Brouillon marquÃ© !");}} disabled={!radarReplyText||radarReplyLoading} style={{padding:"9px 16px",borderRadius:10,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontSize:13,fontWeight:500,cursor:(!radarReplyText||radarReplyLoading)?"not-allowed":"pointer",opacity:!radarReplyText||radarReplyLoading?0.5:1,fontFamily:"'Geist','system-ui',sans-serif",display:"inline-flex",alignItems:"center",gap:6,transition:"all .14s ease",boxShadow:"0 1px 2px rgba(184,146,79,0.2)"}}>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Marquer brouillon
              </button>
              <div style={{flex:1}}/>
              <button onClick={()=>{setRadarReplyModal(null);setRadarReplyText("");}} style={{padding:"9px 12px",borderRadius:10,border:"none",background:"transparent",color:"#6B6E7E",fontSize:12.5,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",transition:"color .14s ease"}}>Fermer</button>
            </div>
          </div>
        </div>
      )}
      {showNewEvent&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(26,26,30,0.45)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99999,padding:32}}>
          <div style={{background:"#FFFFFF",borderRadius:14,width:"min(620px,100%)",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(15,15,20,0.18), 0 0 0 1px rgba(15,15,20,0.05)",overflow:"hidden"}}>
            {/* Header */}
            <div style={{padding:"16px 22px",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,borderRadius:10,background:"#EDF2E8",color:"#3F5B32",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:17,fontWeight:500,color:"#1A1A1E",letterSpacing:"-0.01em",lineHeight:1.2}}>Nouvelle demande</div>
                  <div style={{fontSize:11.5,color:"#6B6B72",marginTop:2,fontFamily:"'Geist','system-ui',sans-serif"}}>Saisie manuelle â indÃ©pendante d'un email</div>
                </div>
              </div>
              <button onClick={()=>setShowNewEvent(false)} title="Annuler" style={{width:30,height:30,borderRadius:8,border:"none",background:"transparent",color:"#6B6B72",cursor:"pointer",fontSize:18,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>Ã</button>
            </div>
            {/* Body */}
            <div style={{flex:1,overflowY:"auto",padding:"20px 22px 18px"}}>
              {(()=>{
                const grpLabel:any = {fontSize:10.5,fontWeight:500,color:"#A5A4A0",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:9,fontFamily:"'Geist','system-ui',sans-serif"};
                const fieldLabel = (hasErr:boolean) => ({fontSize:12,color:hasErr?"#A84B45":"#6B6B72",marginBottom:5,display:"inline-flex",alignItems:"center",gap:5,fontWeight:400,fontFamily:"'Geist','system-ui',sans-serif"});
                const req:any = {color:"#A84B45",fontSize:12,fontWeight:500};
                const inputStyle:any = {width:"100%",padding:"9px 12px",border:"1px solid #EBEAE5",borderRadius:8,background:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13.5,color:"#1A1A1E",outline:"none"};
                const errMsg = (k:string) => newEventErrors[k] ? <div style={{fontSize:11,color:"#A84B45",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>â  {newEventErrors[k]}</div> : null;
                return (
                <>
                  {/* CLIENT */}
                  <div style={{marginBottom:18}}>
                    <div style={grpLabel}>Client</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12}}>
                      <div>
                        <label style={fieldLabel(!!newEventErrors.prenom)}>PrÃ©nom<span style={req}>*</span></label>
                        <input value={newEvent.prenom||""} onChange={e=>setNewEvent({...newEvent,prenom:e.target.value})} placeholder="PrÃ©nom" style={{...inputStyle,borderColor:newEventErrors.prenom?"#A84B45":"#EBEAE5"}}/>
                        {errMsg("prenom")}
                      </div>
                      <div>
                        <label style={fieldLabel(!!newEventErrors.nom)}>Nom<span style={req}>*</span></label>
                        <input value={newEvent.nom||""} onChange={e=>setNewEvent({...newEvent,nom:e.target.value})} placeholder="Nom" style={{...inputStyle,borderColor:newEventErrors.nom?"#A84B45":"#EBEAE5"}}/>
                        {errMsg("nom")}
                      </div>
                      <div>
                        <label style={fieldLabel(false)}>SociÃ©tÃ©</label>
                        <input value={newEvent.entreprise||""} onChange={e=>setNewEvent({...newEvent,entreprise:e.target.value})} placeholder="Optionnel" style={inputStyle}/>
                      </div>
                    </div>
                  </div>
                  {/* CONTACT */}
                  <div style={{marginBottom:18}}>
                    <div style={grpLabel}>Contact</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
                      <div>
                        <label style={fieldLabel(false)}>Email</label>
                        <input value={newEvent.email||""} onChange={e=>setNewEvent({...newEvent,email:e.target.value})} placeholder="nom@exemple.com" style={inputStyle}/>
                      </div>
                      <div>
                        <label style={fieldLabel(false)}>TÃ©lÃ©phone</label>
                        <input value={newEvent.telephone||""} onChange={e=>setNewEvent({...newEvent,telephone:e.target.value})} placeholder="+33 6 12 34 56 78" style={{...inputStyle,fontVariantNumeric:"tabular-nums"}}/>
                      </div>
                    </div>
                  </div>
                  {/* QUAND */}
                  <div style={{marginBottom:18}}>
                    <div style={grpLabel}>Quand</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12}}>
                      <div>
                        <label style={fieldLabel(!!newEventErrors.dateDebut)}>Date<span style={req}>*</span></label>
                        <DatePicker value={newEvent.dateDebut||""} onChange={v=>setNewEvent({...newEvent,dateDebut:v})} light={true}/>
                        {errMsg("dateDebut")}
                      </div>
                      <div>
                        <label style={fieldLabel(!!newEventErrors.heureDebut)}>Heure de dÃ©but<span style={req}>*</span></label>
                        <TimePicker value={newEvent.heureDebut||""} onChange={v=>setNewEvent({...newEvent,heureDebut:v})} placeholder="Heure de dÃ©but" light={true}/>
                        {errMsg("heureDebut")}
                      </div>
                      <div>
                        <label style={fieldLabel(!!newEventErrors.heureFin)}>Heure de fin<span style={req}>*</span></label>
                        <TimePicker value={newEvent.heureFin||""} onChange={v=>setNewEvent({...newEvent,heureFin:v})} placeholder="Heure de fin" light={true}/>
                        {errMsg("heureFin")}
                      </div>
                    </div>
                  </div>
                  {/* INVITÃS */}
                  <div style={{marginBottom:18}}>
                    <div style={grpLabel}>InvitÃ©s</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
                      <div>
                        <label style={fieldLabel(false)}>Nombre de personnes</label>
                        <input type="number" min="1" value={newEvent.nombrePersonnes||""} onChange={e=>setNewEvent({...newEvent,nombrePersonnes:e.target.value})} placeholder="Ex: 50" style={{...inputStyle,fontVariantNumeric:"tabular-nums"}}/>
                      </div>
                      <div>
                        <label style={fieldLabel(false)}>Type d'Ã©vÃ©nement</label>
                        <input value={newEvent.typeEvenement||""} onChange={e=>setNewEvent({...newEvent,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, DÃ®nerâ¦" style={inputStyle}/>
                      </div>
                    </div>
                  </div>
                  {/* LIEU & BUDGET */}
                  <div style={{marginBottom:18}}>
                    <div style={grpLabel}>Lieu & budget</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
                      <div>
                        <label style={fieldLabel(false)}>Espace</label>
                        <select value={newEvent.espaceId||espacesDyn[0]?.id||""} onChange={e=>setNewEvent({...newEvent,espaceId:e.target.value})} style={inputStyle}>
                          {ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={fieldLabel(false)}>Budget client</label>
                        <input value={newEvent.budget||""} onChange={e=>setNewEvent({...newEvent,budget:e.target.value})} placeholder="Ex: 5 000â¬, 45â¬/persâ¦" style={inputStyle}/>
                      </div>
                    </div>
                  </div>
                  {/* NOTES */}
                  <div>
                    <div style={grpLabel}>Notes</div>
                    <textarea value={newEvent.notes||""} onChange={e=>setNewEvent({...newEvent,notes:e.target.value})} rows={3} placeholder="Informations complÃ©mentaires, demandes spÃ©cifiquesâ¦" style={{...inputStyle,resize:"vertical",minHeight:70,lineHeight:1.55}}/>
                  </div>
                </>
                );
              })()}
            </div>
            {/* Footer */}
            <div style={{padding:"14px 22px",borderTop:"1px solid #EBEAE5",background:"#FAFAF7",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <div style={{fontSize:11.5,color:"#A5A4A0",display:"inline-flex",alignItems:"center",gap:9,flexWrap:"wrap",fontFamily:"'Geist','system-ui',sans-serif"}}>
                <span><kbd style={{fontFamily:"inherit",fontSize:10.5,padding:"2px 6px",border:"1px solid #EBEAE5",borderRadius:4,background:"#FFFFFF",color:"#6B6B72",fontWeight:500,margin:"0 2px"}}>â</kbd><kbd style={{fontFamily:"inherit",fontSize:10.5,padding:"2px 6px",border:"1px solid #EBEAE5",borderRadius:4,background:"#FFFFFF",color:"#6B6B72",fontWeight:500,margin:"0 2px"}}>â©</kbd> crÃ©er</span>
                <span style={{color:"#E0DED7"}}>Â·</span>
                <span><kbd style={{fontFamily:"inherit",fontSize:10.5,padding:"2px 6px",border:"1px solid #EBEAE5",borderRadius:4,background:"#FFFFFF",color:"#6B6B72",fontWeight:500,margin:"0 2px"}}>Esc</kbd> annuler</span>
              </div>
              <div style={{flex:1}}/>
              <button onClick={()=>setShowNewEvent(false)} style={{padding:"9px 13px",borderRadius:10,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:12.5,fontWeight:500,cursor:"pointer"}}>Annuler</button>
              <button onClick={()=>{
                const errs:any={};
                if(!newEvent.prenom?.trim()) errs.prenom="PrÃ©nom obligatoire";
                if(!newEvent.nom?.trim()) errs.nom="Nom obligatoire";
                if(!newEvent.dateDebut) errs.dateDebut="Date obligatoire";
                if(!newEvent.heureDebut) errs.heureDebut="Heure de dÃ©but obligatoire";
                if(!newEvent.heureFin) errs.heureFin="Heure de fin obligatoire";
                if(Object.keys(errs).length>0){ setNewEventErrors(errs); return; }
                const r={...newEvent,id:"r"+Date.now(),statut:newEvent.statut||"nouveau",nombrePersonnes:parseInt(newEvent.nombrePersonnes)||newEvent.nombrePersonnes};
                saveResas([...resas,r]); setShowNewEvent(false); setNewEvent({...EMPTY_RESA, espaceId: espacesDyn[0]?.id || ""}); setNewEventErrors({}); toast("Demande crÃ©Ã©e !");
              }} style={{padding:"9px 16px",borderRadius:10,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,letterSpacing:"-0.005em",boxShadow:"0 1px 2px rgba(184,146,79,0.2)"}}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                CrÃ©er la demande
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ââ MODALE SUGGESTIONS MODIFICATIONS IA ââ */}
      {pendingSuggestions && (() => {
        const resa = resas.find(r => r.id === pendingSuggestions.resaId);
        if (!resa) return null;
        const nbSel = pendingSuggestions.suggestions.filter(s => s.selectionnee).length;
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(26,26,30,0.6)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:"#FFFFFF",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
              {/* Header */}
              <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #EBEAE5"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <span style={{fontSize:20}}>â¡</span>
                  <div style={{fontSize:15,fontWeight:700,color:"#1A1A1E"}}>Modifications dÃ©tectÃ©es</div>
                </div>
                <div style={{fontSize:12,color:"#6B6E7E"}}>
                  ARCHANGE a dÃ©tectÃ© des changements dans l'email de <strong>{resa.nom || "ce contact"}</strong>. Validez les modifications Ã  appliquer.
                </div>
              </div>

              {/* Liste des suggestions */}
              <div style={{padding:"16px 24px",display:"flex",flexDirection:"column",gap:8}}>
                {pendingSuggestions.suggestions.map((s, i) => (
                  <div key={i} onClick={()=>setPendingSuggestions(prev => prev ? {
                    ...prev,
                    suggestions: prev.suggestions.map((x,j) => j===i ? {...x, selectionnee:!x.selectionnee} : x)
                  } : null)}
                  style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",borderRadius:10,border:`1.5px solid ${s.selectionnee?"#B8924F":"#EBEAE5"}`,background:s.selectionnee?"#FFFBF0":"#F9F8F6",cursor:"pointer",transition:"all .15s"}}>
                    {/* Checkbox */}
                    <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${s.selectionnee?"#B8924F":"#C8C0B4"}`,background:s.selectionnee?"#B8924F":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                      {s.selectionnee&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>â</span>}
                    </div>
                    {/* Contenu */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#1A1A1E",marginBottom:4}}>{s.label}</div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:"#6B6E7E",background:"#FAFAF7",padding:"2px 8px",borderRadius:6,textDecoration:"line-through"}}>
                          {s.ancienne !== null && s.ancienne !== "" ? String(s.ancienne) : "(vide)"}
                        </span>
                        <span style={{fontSize:12,color:"#6B6E7E"}}>â</span>
                        <span style={{fontSize:12,color:"#1A1A1E",fontWeight:600,background:s.selectionnee?"#FEF3C7":"#F5F4F0",padding:"2px 8px",borderRadius:6}}>
                          {s.nouvelle !== null && s.nouvelle !== "" ? String(s.nouvelle) : "(vide)"}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:"#6B6E7E",marginTop:4,fontStyle:"italic"}}>{s.raison}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{padding:"16px 24px",borderTop:"1px solid #EBEAE5",display:"flex",gap:10}}>
                <button
                  disabled={nbSel===0}
                  onClick={()=>{
                    if (!pendingSuggestions) return;
                    const selected = pendingSuggestions.suggestions.filter(s => s.selectionnee);
                    if (selected.length === 0) return;
                    const patch: Record<string,any> = {};
                    selected.forEach(s => { patch[s.champ] = s.nouvelle; });
                    const updated = resas.map(r => r.id === pendingSuggestions.resaId ? {...r, ...patch} : r);
                    saveResas(updated);
                    // Mettre Ã  jour selResaGeneral si c'est l'Ã©vÃ©nement ouvert
                    if (selResaGeneral?.id === pendingSuggestions.resaId) setSelResaGeneral((prev:any) => ({...prev, ...patch}));
                    setPendingSuggestions(null);
                    toast(`${selected.length} modification${selected.length>1?"s":""} appliquÃ©e${selected.length>1?"s":""}  â`);
                  }}
                  style={{flex:2,padding:"11px",borderRadius:8,border:"none",background:nbSel>0?"#B8924F":"#EBEAE5",color:nbSel>0?"#1A1A1E":"#A09890",fontSize:13,fontWeight:600,cursor:nbSel>0?"pointer":"not-allowed",transition:"all .15s"}}>
                  Appliquer {nbSel>0?`(${nbSel})`:""}
                </button>
                <button onClick={()=>setPendingSuggestions(null)} style={{flex:1,padding:"11px",borderRadius:8,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",fontSize:13,cursor:"pointer"}}>
                  Ignorer tout
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ââ Modal Composer â Nouveau mail ââ */}
      {showCompose&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:9980,display:"flex",alignItems:"flex-end",justifyContent:"flex-end",padding:"0 24px 24px"}}>
          <div style={{background:"#FFFFFF",borderRadius:16,boxShadow:"0 24px 80px rgba(0,0,0,.25)",width:540,maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* En-tÃªte */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:"#1A1A1E",borderRadius:"16px 16px 0 0"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#B8924F",letterSpacing:"0.06em"}}>â Nouveau message</span>
              <button onClick={()=>{if((composeBody.trim()||composeTo.trim())&&!window.confirm("Fermer sans sauvegarder ?"))return;setShowCompose(false);}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:18}}>Ã</button>
            </div>
            {/* Champs */}
            <div style={{padding:"12px 16px",borderBottom:"1px solid #EBEAE5"}}>
              <input value={composeTo} onChange={e=>setComposeTo(e.target.value)} placeholder="Ã : destinataire@exemple.com" style={{width:"100%",border:"none",borderBottom:"1px solid #EBEAE5",outline:"none",fontSize:13,color:"#1A1A1E",padding:"6px 0",marginBottom:8,background:"transparent"}}/>
              <input value={composeSubject} onChange={e=>setComposeSubject(e.target.value)} placeholder="Objet" style={{width:"100%",border:"none",borderBottom:"1px solid #EBEAE5",outline:"none",fontSize:13,color:"#1A1A1E",padding:"6px 0",background:"transparent"}}/>
            </div>
            {/* Corps */}
            <textarea
              value={composeBody}
              onChange={e=>setComposeBody(e.target.value)}
              placeholder="RÃ©digez votre messageâ¦"
              style={{flex:1,padding:"14px 16px",fontSize:13,color:"#1A1A1E",lineHeight:1.8,border:"none",outline:"none",resize:"none",fontFamily:"inherit",minHeight:220}}
              autoFocus
            />
            {/* Actions */}
            <div style={{display:"flex",gap:8,padding:"10px 16px",borderTop:"1px solid #EBEAE5",background:"#F5F4F0"}}>
              <button onClick={sendNewMail} disabled={composeSending||!composeTo.trim()||!composeSubject.trim()||!composeBody.trim()} style={{padding:"9px 22px",borderRadius:8,border:"none",background:"#1A1A1E",color:"#B8924F",fontSize:13,fontWeight:700,cursor:composeSending?"wait":"pointer",display:"flex",alignItems:"center",gap:6,opacity:composeSending||!composeTo.trim()||!composeSubject.trim()||!composeBody.trim()?0.5:1}}>
                {composeSending?<><Spin s={12}/> Envoiâ¦</>:"â Envoyer"}
              </button>
              <button onClick={saveDraft} style={{padding:"9px 16px",borderRadius:8,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",fontSize:12,cursor:"pointer"}}>Brouillon</button>
              <div style={{flex:1}}/>
              <button onClick={()=>setShowCompose(false)} style={{padding:"9px 12px",borderRadius:8,border:"none",background:"transparent",color:"#6B6E7E",fontSize:12,cursor:"pointer"}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showRelanceIA&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(17,17,17,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99999,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",borderRadius:16,width:"min(700px, 100%)",height:"min(760px, 95vh)",display:"flex",flexDirection:"column",boxShadow:"0 32px 100px rgba(0,0,0,.6)",border:"1px solid #D1D5DB"}}>

            {/* Header */}
            <div style={{padding:"20px 24px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:"#111111"}}>â¨ Mail de relance ARCHANGE</div>
                <div style={{fontSize:12,color:"#9CA3AF",marginTop:3}}>{showRelanceIA.nom}{showRelanceIA.email ? " Â· " + showRelanceIA.email : ""}</div>
              </div>
              <button onClick={()=>{setShowRelanceIA(null);setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");}} style={{width:32,height:32,borderRadius:8,border:"1px solid #D1D5DB",background:"#F3F4F6",color:"#111111",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:300}}>Ã</button>
            </div>

            {/* SÃ©lecteur de motif */}
            <div style={{padding:"14px 24px",borderBottom:"1px solid #EBEAE5",flexShrink:0,background:"#FAFAFA"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B6E7E",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:9}}>Motif de la relance</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
                {motifsRelance.map((m, i) => (
                  <div key={i} style={{display:"flex",alignItems:"center",borderRadius:100,border:`1.5px solid ${motifSelectionne===m?"#B8924F":"#EBEAE5"}`,background:motifSelectionne===m?"#FEF3C7":"#FFFFFF",overflow:"hidden"}}>
                    <button onClick={()=>setMotifSelectionne(motifSelectionne===m?"":m)} style={{padding:"5px 10px",fontSize:11,fontWeight:motifSelectionne===m?600:400,color:motifSelectionne===m?"#92400E":"#6B6B72",background:"transparent",border:"none",cursor:"pointer"}}>{m}</button>
                    <button onClick={()=>{const upd=motifsRelance.filter((_,j)=>j!==i);saveMotifsRelance(upd);if(motifSelectionne===m)setMotifSelectionne("");}} title="Supprimer" style={{padding:"5px 8px 5px 0",fontSize:10,color:"#C5C3BE",background:"transparent",border:"none",cursor:"pointer"}} onMouseEnter={e=>(e.currentTarget.style.color="#DC2626")} onMouseLeave={e=>(e.currentTarget.style.color="#C5C3BE")}>Ã</button>
                  </div>
                ))}
                {showAddMotif?(
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <input autoFocus value={newMotifLabel} onChange={e=>setNewMotifLabel(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newMotifLabel.trim()){const upd=[...motifsRelance,newMotifLabel.trim()];saveMotifsRelance(upd);setNewMotifLabel("");setShowAddMotif(false);}if(e.key==="Escape"){setShowAddMotif(false);setNewMotifLabel("");}}} placeholder="Nouveau motifâ¦" style={{padding:"5px 10px",fontSize:11,borderRadius:100,border:"1.5px solid #B8924F",outline:"none",width:150}}/>
                    <button onClick={()=>{if(newMotifLabel.trim()){const upd=[...motifsRelance,newMotifLabel.trim()];saveMotifsRelance(upd);setNewMotifLabel("");setShowAddMotif(false);}}} style={{padding:"5px 10px",fontSize:11,borderRadius:100,border:"none",background:"#B8924F",color:"#1A1A1E",cursor:"pointer",fontWeight:600}}>+</button>
                    <button onClick={()=>{setShowAddMotif(false);setNewMotifLabel("");}} style={{padding:"5px 8px",fontSize:11,borderRadius:100,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer"}}>â</button>
                  </div>
                ):(
                  <button onClick={()=>setShowAddMotif(true)} style={{padding:"5px 12px",fontSize:11,borderRadius:100,border:"1.5px dashed #B8924F",background:"transparent",color:"#B8924F",cursor:"pointer",fontWeight:500}}>+ Ajouter</button>
                )}
              </div>
              {motifSelectionne==="Autre"&&<input value={motifPersonnalise} onChange={e=>setMotifPersonnalise(e.target.value)} placeholder="PrÃ©cisez le motifâ¦" style={{width:"100%",padding:"7px 12px",fontSize:12,borderRadius:8,border:"1px solid #B8924F",outline:"none",marginTop:4}}/>}
              {!motifSelectionne&&<div style={{fontSize:11,color:"#B0AAA2",fontStyle:"italic",marginTop:2}}>Optionnel â guide la rÃ©daction</div>}
            </div>

            {/* Corps */}
            <div style={{flex:1,overflow:"hidden",padding:24,display:"flex",flexDirection:"column"}}>
              {genRelanceIA?(
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,color:"#9CA3AF"}}>
                  <Spin s={32}/>
                  <div style={{fontSize:14,fontWeight:500}}>RÃ©daction en coursâ¦</div>
                  <div style={{fontSize:12,opacity:.6}}>Analyse de l'historique et du motif sÃ©lectionnÃ©</div>
                </div>
              ):relanceIAText?(
                <textarea value={relanceIAText} onChange={e=>setRelanceIAText(e.target.value)} style={{flex:1,width:"100%",padding:"16px 18px",fontSize:13,color:"#111111",lineHeight:1.9,border:"1px solid #D1D5DB",borderRadius:12,background:"#F3F4F6",resize:"none",outline:"none",fontFamily:"inherit"}}/>
              ):(
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:"#9CA3AF"}}>
                  <div style={{fontSize:36}}>â¨</div>
                  <div style={{fontSize:13,textAlign:"center",maxWidth:280}}>{motifSelectionne?`Motif sÃ©lectionnÃ© : "${motifSelectionne==="Autre"?motifPersonnalise||"Autre":motifSelectionne}"` : "SÃ©lectionnez un motif ou gÃ©nÃ©rez directement"}</div>
                  <button onClick={()=>genRelanceIAFn(showRelanceIA)} style={{...gold,fontSize:12,padding:"9px 20px"}}>â¨ GÃ©nÃ©rer le mail</button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{padding:"16px 24px",borderTop:"1px solid #EBEAE5",display:"flex",gap:8,flexShrink:0}}>
              <button onClick={()=>{if(!relanceIAText) return;window.sendPrompt("CREATE_DRAFT|"+showRelanceIA.email+"|Relance â "+showRelanceIA.nom+"|"+relanceIAText);toast("Brouillon crÃ©Ã© !");setShowRelanceIA(null);setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");}} disabled={!relanceIAText||genRelanceIA} style={{...gold,flex:1,padding:"11px",fontSize:13,opacity:(!relanceIAText||genRelanceIA)?0.4:1,cursor:(!relanceIAText||genRelanceIA)?"not-allowed":"pointer"}}>ð§ CrÃ©er le brouillon</button>
              <button onClick={()=>genRelanceIAFn(showRelanceIA)} disabled={genRelanceIA} style={{...out,padding:"11px 18px",fontSize:13,opacity:genRelanceIA?0.4:1,display:"flex",alignItems:"center",gap:6}}>{genRelanceIA?<Spin s={12}/>:"â»"} {relanceIAText?"RegÃ©nÃ©rer":"GÃ©nÃ©rer"}</button>
              <button onClick={()=>{setShowRelanceIA(null);setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");}} style={{...out,padding:"11px 18px",fontSize:13}}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ââ MODAL ENVOYER MAIL ââ */}
      {showSendMail&&(
        <div style={{position:"fixed",inset:0,background:"#111111",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99999,padding:24,backdropFilter:"blur(2px)"}}>
          <div style={{background:"#FFFFFF",borderRadius:18,width:"100%",maxWidth:540,maxHeight:"88vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>
            <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:"#111111"}}>ð¤ Envoyer un mail</div>
                <div style={{fontSize:12,color:"#9CA3AF",marginTop:3}}>Ã : <strong>{showSendMail.nom}</strong> Â· {showSendMail.email}</div>
              </div>
              <button onClick={()=>setShowSendMail(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid #D1D5DB",background:"transparent",color:"#9CA3AF",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>Ã</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",gap:16,minHeight:0}}>
              <div>
                <div style={{fontSize:11,color:"#9CA3AF",marginBottom:6,fontWeight:600,letterSpacing:"0.05em"}}>DESTINATAIRE</div>
                <div style={{padding:"10px 14px",background:"#F3F4F6",borderRadius:9,fontSize:13,color:"#111111",border:"1px solid #E5E7EB"}}>{showSendMail.email}</div>
              </div>
              <div>
                <label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:6,fontWeight:600,letterSpacing:"0.05em"}}>OBJET</label>
                <input value={sendMailSubject} onChange={e=>setSendMailSubject(e.target.value)} style={{...inpLight}}/>
              </div>
              <div style={{flex:1,display:"flex",flexDirection:"column"}}>
                <label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:6,fontWeight:600,letterSpacing:"0.05em"}}>MESSAGE</label>
                <textarea value={sendMailBody} onChange={e=>setSendMailBody(e.target.value)} placeholder="RÃ©digez votre messageâ¦" rows={9} style={{...inpLight,resize:"none",lineHeight:1.8,flex:1,fontFamily:"inherit"}}/>
              </div>
            </div>
            <div style={{padding:"16px 24px",borderTop:"1px solid #EBEAE5",display:"flex",gap:8,flexShrink:0,background:"#F3F4F6"}}>
              <button onClick={()=>{ window.sendPrompt("CREATE_DRAFT|"+showSendMail.email+"|"+sendMailSubject+"|"+sendMailBody); toast("Brouillon crÃ©Ã© !"); setShowSendMail(null); }} disabled={!sendMailBody||!sendMailSubject} style={{...gold,flex:1,padding:"11px",fontSize:13,opacity:!sendMailBody||!sendMailSubject?0.4:1,cursor:!sendMailBody||!sendMailSubject?"not-allowed":"pointer"}}>ð§ CrÃ©er le brouillon Gmail</button>
              <button onClick={()=>setShowSendMail(null)} style={{...out,fontSize:12,padding:"11px 16px"}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ââ MODALE â TESTER ARCHANGE ââ */}
      {showTestArchange && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,15,20,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)"}} onClick={()=>!testRunning && setShowTestArchange(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",borderRadius:14,maxWidth:780,width:"100%",maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            {/* Header modale */}
            <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"flex-start",background:"linear-gradient(135deg, rgba(184,146,79,0.06) 0%, #FFFFFF 60%)"}}>
              <div>
                <div style={{fontSize:20,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",letterSpacing:"0.02em",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18,color:"#B8924F"}}>â¡</span> Tester ARCHANGE
                </div>
                <div style={{fontSize:12,color:"#6B6E7E",marginTop:4}}>Collez un mail fictif et voyez exactement ce qu'ARCHANGE en extrait. Sans persistance â purement test.</div>
              </div>
              <button onClick={()=>!testRunning && setShowTestArchange(false)} disabled={testRunning} style={{background:"none",border:"none",color:"#6B6E7E",fontSize:20,cursor:testRunning?"not-allowed":"pointer",padding:"4px 8px",lineHeight:1}}>Ã</button>
            </div>

            {/* Body â scrollable */}
            <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div>
                  <label style={{fontSize:10.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.06em",textTransform:"uppercase",display:"block",marginBottom:6,fontFamily:"'Geist','system-ui',sans-serif"}}>De (expÃ©diteur)</label>
                  <input value={testMailFrom} onChange={e=>setTestMailFrom(e.target.value)} placeholder="Ex: Marie Dupont &lt;marie@example.com&gt;" style={{...inp,fontSize:13}}/>
                </div>
                <div>
                  <label style={{fontSize:10.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.06em",textTransform:"uppercase",display:"block",marginBottom:6,fontFamily:"'Geist','system-ui',sans-serif"}}>Objet</label>
                  <input value={testMailSubject} onChange={e=>setTestMailSubject(e.target.value)} placeholder="Ex: Demande devis cocktail" style={{...inp,fontSize:13}}/>
                </div>
              </div>
              <label style={{fontSize:10.5,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.06em",textTransform:"uppercase",display:"block",marginBottom:6,fontFamily:"'Geist','system-ui',sans-serif"}}>Corps du mail</label>
              <textarea value={testMailContent} onChange={e=>setTestMailContent(e.target.value)} placeholder="Collez ici le corps complet d'un mail (peut Ãªtre un Fwd:, un mail Zenchef, un mail directâ¦)" rows={8} style={{...inp,fontSize:13,lineHeight:1.6,resize:"vertical",width:"100%",fontFamily:"inherit"}}/>

              {/* Boutons d'action */}
              <div style={{display:"flex",gap:8,marginTop:14,alignItems:"center"}}>
                <button
                  onClick={runTestArchange}
                  disabled={testRunning || !testMailContent.trim()}
                  style={{padding:"9px 18px",borderRadius:8,border:"1px solid #B8924F",background:testRunning||!testMailContent.trim()?"rgba(184,146,79,0.15)":"#B8924F",color:testRunning||!testMailContent.trim()?"#A5A4A0":"#FFFFFF",fontSize:13,fontWeight:500,cursor:testRunning||!testMailContent.trim()?"not-allowed":"pointer",fontFamily:"'Geist','system-ui',sans-serif",display:"inline-flex",alignItems:"center",gap:7}}>
                  {testRunning ? <><Spin s={11}/> Analyse en coursâ¦</> : <>â¡ Lancer l'analyse</>}
                </button>
                {testResult && !testRunning && (
                  <button onClick={()=>{setTestResult(null); setTestMailContent(""); setTestMailSubject(""); setTestMailFrom("");}} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#6B6E7E",fontSize:12,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif"}}>RÃ©initialiser</button>
                )}
              </div>

              {/* RÃ©sultats */}
              {testResult && !testResult.error && (
                <div style={{marginTop:20,padding:"16px 18px",background:"#FAFAF7",borderRadius:10,border:"1px solid #EBEAE5"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:14,fontFamily:"'Geist','system-ui',sans-serif"}}>RÃ©sultat de l'analyse</div>

                  {/* MÃ©triques */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:8,marginBottom:14}}>
                    <div style={{padding:"8px 10px",background:"#FFFFFF",borderRadius:7,border:"1px solid #EBEAE5"}}>
                      <div style={{fontSize:9.5,color:"#6B6E7E",fontWeight:500,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:3}}>DurÃ©e</div>
                      <div style={{fontSize:14,fontWeight:500,color:"#1A1A1E",fontVariantNumeric:"tabular-nums"}}>{testResult.duree}s</div>
                    </div>
                    <div style={{padding:"8px 10px",background:"#FFFFFF",borderRadius:7,border:"1px solid #EBEAE5"}}>
                      <div style={{fontSize:9.5,color:"#6B6E7E",fontWeight:500,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:3}}>Tokens IN</div>
                      <div style={{fontSize:14,fontWeight:500,color:"#1A1A1E",fontVariantNumeric:"tabular-nums"}}>{testResult.tokensIn.toLocaleString("fr-FR")}</div>
                    </div>
                    <div style={{padding:"8px 10px",background:"#FFFFFF",borderRadius:7,border:"1px solid #EBEAE5"}}>
                      <div style={{fontSize:9.5,color:"#6B6E7E",fontWeight:500,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:3}}>Tokens OUT</div>
                      <div style={{fontSize:14,fontWeight:500,color:"#1A1A1E",fontVariantNumeric:"tabular-nums"}}>{testResult.tokensOut.toLocaleString("fr-FR")}</div>
                    </div>
                    <div style={{padding:"8px 10px",background:"#FFFFFF",borderRadius:7,border:"1px solid #EBEAE5"}}>
                      <div style={{fontSize:9.5,color:"#6B6E7E",fontWeight:500,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:3}}>CoÃ»t</div>
                      <div style={{fontSize:14,fontWeight:500,color:"#B8924F",fontVariantNumeric:"tabular-nums"}}>${testResult.cout.toFixed(4)}</div>
                    </div>
                  </div>

                  {/* DÃ©tection */}
                  {(testResult.plateforme || testResult.estForward) && (
                    <div style={{marginBottom:14,padding:"10px 12px",background:"rgba(184,146,79,0.08)",borderRadius:7,border:"1px solid rgba(184,146,79,0.25)"}}>
                      <div style={{fontSize:11,color:"#1A1A1E",lineHeight:1.5}}>
                        {testResult.plateforme && <><strong style={{color:"#B8924F"}}>ð¨ Plateforme dÃ©tectÃ©e :</strong> {testResult.plateforme}<br/></>}
                        {testResult.estForward && <><strong style={{color:"#B8924F"}}>âªï¸ Mail forwardÃ© dÃ©tectÃ©</strong></>}
                      </div>
                    </div>
                  )}

                  {/* Champs extraits */}
                  <div style={{display:"grid",gridTemplateColumns:"140px 1fr",gap:"6px 14px",fontSize:12,fontFamily:"'Geist','system-ui',sans-serif"}}>
                    {[
                      ["RÃ©servation ?", testResult.extracted.isReservation ? "â Oui" : "â Non"],
                      ["Confiance", testResult.extracted.confiance || "â"],
                      ["Nom", testResult.extracted.nom || "â"],
                      ["Email", testResult.extracted.email || "â"],
                      ["TÃ©lÃ©phone", testResult.extracted.telephone || "â"],
                      ["Entreprise", testResult.extracted.entreprise || "â"],
                      ["Type Ã©vÃ©nement", testResult.extracted.typeEvenement || "â"],
                      ["Nb personnes", testResult.extracted.nombrePersonnes || "â"],
                      ["Espace dÃ©tectÃ©", testResult.extracted.espaceDetecte || "â"],
                      ["Date dÃ©but", testResult.extracted.dateDebut || "â"],
                      ["Heure", (testResult.extracted.heureDebut || "â") + (testResult.extracted.heureFin ? ` â ${testResult.extracted.heureFin}` : "")],
                      ["Budget", testResult.extracted.budget || "â"],
                      ["Source", testResult.extracted.sourceEmail || "â"],
                    ].map(([label, val]: [string, any], idx) => (
                      <React.Fragment key={idx}>
                        <span style={{color:"#6B6E7E",fontWeight:500}}>{label}</span>
                        <span style={{color: val==="â" ? "#A5A4A0" : "#1A1A1E", fontWeight: val==="â" ? 400 : 500}}>{String(val)}</span>
                      </React.Fragment>
                    ))}
                  </div>

                  {testResult.extracted.notes && (
                    <div style={{marginTop:12,padding:"10px 12px",background:"#FFFFFF",borderRadius:7,border:"1px solid #EBEAE5"}}>
                      <div style={{fontSize:10,fontWeight:500,color:"#6B6E7E",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:5}}>Notes</div>
                      <div style={{fontSize:12,color:"#1A1A1E",lineHeight:1.5}}>{testResult.extracted.notes}</div>
                    </div>
                  )}

                  {testResult.extracted.resume && (
                    <div style={{marginTop:8,padding:"10px 12px",background:"rgba(184,146,79,0.05)",borderRadius:7,border:"1px solid rgba(184,146,79,0.2)"}}>
                      <div style={{fontSize:10,fontWeight:500,color:"#B8924F",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:5}}>RÃ©sumÃ© IA</div>
                      <div style={{fontSize:12,color:"#1A1A1E",lineHeight:1.5,fontFamily:"'Fraunces',Georgia,serif"}}>{testResult.extracted.resume}</div>
                    </div>
                  )}
                </div>
              )}

              {testResult && testResult.error && (
                <div style={{marginTop:20,padding:"14px 16px",background:"rgba(220,38,38,0.06)",borderRadius:10,border:"1px solid rgba(220,38,38,0.25)"}}>
                  <div style={{fontSize:13,fontWeight:500,color:"#DC2626",marginBottom:5}}>â Erreur d'analyse</div>
                  <div style={{fontSize:12,color:"#6B6E7E"}}>{testResult.error}</div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{padding:"12px 24px",borderTop:"1px solid #EBEAE5",background:"#FAFAF7",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:"#6B6E7E"}}>ð¡ Astuce : testez avec un mail Zenchef ou ABC Salles forwardÃ© pour vÃ©rifier la dÃ©tection</span>
              <button onClick={()=>!testRunning && setShowTestArchange(false)} disabled={testRunning} style={{padding:"7px 14px",borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",fontSize:12,cursor:testRunning?"not-allowed":"pointer",fontFamily:"'Geist','system-ui',sans-serif"}}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
