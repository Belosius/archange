'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'



// ─── Type espace dynamique ────────────────────────────────────────────────────
interface EspaceDyn {
  id: string; nom: string; color: string; description: string;
  assisMin: string; assisMax: string;   // capacité assis (fourchette)
  deboutMin: string; deboutMax: string; // capacité debout / cocktail (fourchette)
  /** @deprecated legacy — migré vers assisMin/assisMax/deboutMin/deboutMax */
  capacite?: string;
}
const DEFAULT_ESPACES_DYN: EspaceDyn[] = [
  { id: "rdc",       nom: "Rez-de-chaussée", color: "#C9A876", assisMin: "80",  assisMax: "100", deboutMin: "100", deboutMax: "150", description: "Espace principal 120m², idéal grandes réceptions" },
  { id: "patio",     nom: "Le Patio",         color: "#6DB8A0", assisMin: "40",  assisMax: "75",  deboutMin: "60",  deboutMax: "100", description: "Espace extérieur couvert 70m², ambiance intimiste" },
  { id: "belvedere", nom: "Le Belvédère",     color: "#6D9BE8", assisMin: "40",  assisMax: "75",  deboutMin: "60",  deboutMax: "100", description: "Espace en hauteur 70m², vue panoramique" },
];
// Alias pour rétrocompatibilité — les autres parties de l'app utilisent encore ESPACES
// On le remplace dynamiquement via useEspaces()
const ESPACES_LEGACY = DEFAULT_ESPACES_DYN;
const TYPES_EVT = ["Dîner","Déjeuner","Cocktail","Buffet","Conférence","Réunion","Soirée DJ","Karaoké","Soirée à thème"];
const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
type StatutDef = { id: string; label: string; bg: string; color: string };

const DEFAULT_STATUTS: StatutDef[] = [
  { id: "nouveau",    label: "Nouveau",    bg: "#EFF6FF", color: "#1D4ED8" },
  { id: "en_cours",  label: "En cours",   bg: "#FEF3C7", color: "#92400E" },
  { id: "en_attente",label: "En attente", bg: "#FDF4FF", color: "#7E22CE" },
  { id: "confirme",  label: "Confirmé",   bg: "#D1FAE5", color: "#3F5B32" },
  { id: "annule",    label: "Annulé",     bg: "#FEE2E2", color: "#991B1B" },
];

// ─── SYSTEM_PROMPT dynamique — généré à partir des données de l'établissement ─
// Plus aucune mention codée en dur de RÊVA — tout vient des Sources IA
function buildSystemPrompt(opts: {
  nomEtab: string;
  adresseEtab: string;
  emailEtab: string;
  telEtab: string;
  espacesDyn: EspaceDyn[];
}): string {
  const { nomEtab, adresseEtab, emailEtab, telEtab, espacesDyn } = opts;
  const nom = nomEtab || "l'établissement";
  const adresse = adresseEtab || "";
  const email = emailEtab || "";

  // Formater la capacité d'un espace : "40–75 assis, 60–100 debout"
  const fmtCapacite = (e: EspaceDyn) => {
    const parts: string[] = [];
    if (e.assisMin || e.assisMax) {
      const min = e.assisMin, max = e.assisMax;
      parts.push(min && max && min !== max ? `${min}–${max} assis` : `${max || min} assis`);
    }
    if (e.deboutMin || e.deboutMax) {
      const min = e.deboutMin, max = e.deboutMax;
      parts.push(min && max && min !== max ? `${min}–${max} debout/cocktail` : `${max || min} debout/cocktail`);
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
    : "Les espaces sont décrits dans les Sources IA.";
  const espacesAlternatifs = espacesDyn.length > 1
    ? espacesDyn.map((e, i) =>
        `   - Si ${e.nom} pris → valorise ${espacesDyn.filter((_,j)=>j!==i).map(x=>x.nom).join(" ou ")}`
      ).join("\n")
    : "";
  const signature = [
    "Cordialement,",
    `L'équipe ${nom}`,
    adresse,
    email,
    telEtab,
  ].filter(Boolean).join("\n");

  return `Tu es ARCHANGE, l'assistant commercial de ${nom}${adresse ? ` (${adresse})` : ""}. Tu réponds aux emails reçus par l'établissement avec le niveau d'expertise d'un directeur commercial expérimenté dans la restauration événementielle haut de gamme.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 IDENTITÉ & ÉTABLISSEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${nom} est un établissement de restauration événementielle. Il dispose des espaces suivants :

${espacesTexte}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TON RÔLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu incarnes un commercial senior spécialisé dans la restauration événementielle. Tu as une double compétence :
1. Relationnelle : tu crées immédiatement un lien chaleureux et professionnel
2. Commerciale : tu valorises systématiquement l'offre de ${nom} et tu cherches à convertir chaque contact en réservation concrète

Tu ne te contentes jamais de "répondre" — tu accompagnes, tu proposes, tu rassures, tu convaincs avec subtilité.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 SOURCES DE RÉFÉRENCE — PRIORITÉ ABSOLUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu reçois dans ce message un contexte personnalisé. Ces éléments constituent la documentation officielle de ${nom} : menus, tarifs, capacités, conditions de réservation, politique d'annulation, horaires, offres spéciales, etc.

Tu dois :
- Lire intégralement chaque section avant de rédiger ta réponse
- Extraire et utiliser les informations précises qu'elles contiennent (chiffres, conditions, noms, tarifs exacts)
- Donner toujours priorité aux informations des sources sur tes connaissances générales
- Si une information demandée n'est pas dans les sources, ne jamais l'inventer — répondre avec élégance : "Notre équipe vous confirme ce point très prochainement"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 PLANNING & DISPONIBILITÉS — TEMPS RÉEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu reçois dans chaque message la liste complète des réservations en cours sous la section === PLANNING EN COURS ===. Chaque ligne indique : l'espace, la date, les horaires, le nombre de personnes et le statut.

RÈGLE DE DISPONIBILITÉ :
Un espace est considéré INDISPONIBLE uniquement si une réservation existante sur ce créneau a un statut confirmé.
Tout autre statut (option, en attente, devis envoyé, etc.) ne bloque pas le créneau — tu peux proposer l'espace, en précisant que la disponibilité sera confirmée sous peu.

COMPORTEMENT SELON LA SITUATION :
1. Espace demandé DISPONIBLE → Confirme avec enthousiasme et propose les prochaines étapes
2. Espace demandé INDISPONIBLE → Exprime des regrets brefs, rebondis immédiatement sur un espace alternatif
${espacesAlternatifs ? espacesAlternatifs + "\n" : ""}→ Si AUCUN espace n'est disponible sur ce créneau : propose une date ou un horaire alternatif avec bienveillance
3. Créneau non précisé → Demande la date et l'heure souhaitées avant de te prononcer
4. Plusieurs espaces disponibles → Oriente vers le plus adapté selon le type d'événement et le nombre de personnes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✍️ STYLE & TONALITÉ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOUJOURS :
- Chaleureux mais professionnel — jamais familier, jamais froid
- Personnalisé : utilise le prénom ou le nom de l'expéditeur dès que disponible
- Concis et clair : pas de phrases inutiles, chaque mot compte
- Positif et orienté solution : même face à une contrainte, propose une alternative
- En français impeccable, sans fautes, avec une ponctuation soignée

JAMAIS :
- De formules génériques creuses ("Suite à votre mail…", "N'hésitez pas à…")
- De jargon administratif ("Dans l'attente de vous lire", "Bien à vous")
- De réponses trop longues qui noient l'essentiel
- D'informations inventées sur les disponibilités ou les tarifs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 FORMAT DE LA RÉPONSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Structure recommandée :
1. Formule d'ouverture personnalisée ("Bonjour [Prénom]," ou "Cher [Nom],")
2. Accroche chaleureuse en 1 phrase
3. Corps du message — réponse structurée, aérée
4. Appel à l'action clair
5. Formule de clôture élégante
6. Signature :
---
${signature}
---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ RÈGLES ABSOLUES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Tu réponds UNIQUEMENT en français
- Tu ne révèles jamais que tu es une IA
- Tu n'inventes jamais de disponibilités, de tarifs ou de faits non confirmés par les sources
- Pour les disponibilités, tu te bases EXCLUSIVEMENT sur le planning fourni
- Si une information te manque, tu le dis élégamment
- Tu génères uniquement le texte de la réponse email, rien d'autre`;
}
// EXTRACT_PROMPT est une fonction pour injecter la date du jour dynamiquement
const buildExtractPrompt = (
  nomEtablissement = "l'établissement",
  espacesDyn: EspaceDyn[] = []
) => {
  const today = new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" });

  // Construire la règle d'attribution d'espaces dynamiquement
  // — basée sur capacité assis (événements assis) et debout (cocktail/standing)
  let espacesRegle = "";
  if (espacesDyn.length > 0) {
    const withCap = espacesDyn.map(e => {
      // Priorité aux champs structurés, fallback sur legacy capacite
      const assisMax = parseInt(e.assisMax || "0", 10);
      const deboutMax = parseInt(e.deboutMax || "0", 10);
      const legacyMatch = (e.capacite || "").match(/(\d+)/g);
      const legacy = legacyMatch ? Math.max(...legacyMatch.map(Number)) : 0;
      const cap = Math.max(assisMax, deboutMax, legacy);
      return { id: e.id, nom: e.nom, assisMax, deboutMax, cap };
    }).sort((a, b) => a.cap - b.cap);

    espacesRegle = withCap.map((e, i) => {
      const prev = i > 0 ? withCap[i-1].cap + 1 : 1;
      const range = i === 0 ? `≤ ${e.cap} personnes` :
                    i === withCap.length - 1 ? `> ${withCap[i-1].cap} personnes` :
                    `${prev}–${e.cap} personnes`;
      const assis = e.assisMax ? ` (max ${e.assisMax} assis, max ${e.deboutMax||e.assisMax} debout)` : "";
      return `    * ${range} → "${e.id}" (${e.nom})${assis}`;
    }).join("\n");
  } else {
    espacesRegle = `    * Laisse null si aucun espace n'est configuré`;
  }

  return `Tu es un assistant spécialisé dans l'analyse d'emails reçus par ${nomEtablissement}, un lieu événementiel.

Date du jour : ${today}

Analyse l'email ci-dessous, quelle que soit sa langue, et retourne UNIQUEMENT un JSON valide, sans aucun texte avant ou après.

RÈGLES D'EXTRACTION :

- isReservation : true UNIQUEMENT si l'email contient une demande explicite de réservation, privatisation, devis pour un groupe, ou un événement. Une simple question sur les horaires ou le menu = false.

- confiance : "haute" si tous les éléments clés sont présents, "moyenne" si partielle, "faible" si incertain

- typeEvenement : détecte parmi [Dîner, Déjeuner, Cocktail, Buffet, Conférence, Réunion, Soirée DJ, Karaoké, Soirée à thème, Afterwork, Team building, Séminaire, Anniversaire, Mariage] ou laisse null

- nombrePersonnes : extrais le nombre maximum mentionné (entier). Ex : "entre 80 et 120" → 120

- nombrePersonnesMin : si une fourchette est mentionnée, extrais le minimum. Ex : "entre 80 et 120" → 80. Sinon, même valeur que nombrePersonnes.

- espaceDetecte : déduis l'espace le plus adapté selon le nombre de personnes (nombrePersonnes) et le type :
${espacesRegle}
  Si l'espace est mentionné explicitement dans l'email, utilise-le en priorité.

- dateDebut : format YYYY-MM-DD. Pour les dates relatives, utilise la date du jour fournie en référence. Si le mois est mentionné sans année, prends l'année en cours si la date n'est pas encore passée, sinon l'année suivante. Si non mentionné → null.

- heureDebut / heureFin : format HH:MM. Si non mentionné → null

- budget : extrais le budget si mentionné (ex: "1900€", "45€/pers"), sinon null

- resume : 1-2 phrases maximum résumant la demande de façon factuelle. Ne mettre que si isReservation est true, sinon null.

- notes : résume en 1-2 phrases les détails importants non couverts par les autres champs. Si l'email est dans une autre langue que le français, indique-le ici.

- statutSuggere : suggère un statut parmi [nouveau, en_cours, en_attente, confirme] selon le contenu du mail

JSON à retourner :
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
  "statutSuggere": "nouveau"
}`;
};

// EMPTY_RESA : espaceId initialisé au premier espace dispo — sera surchargé par getEmptyResa()
const EMPTY_RESA = { id:null, nom:"", email:"", telephone:"", entreprise:"", typeEvenement:"", nombrePersonnes:"", espaceId:"", dateDebut:"", heureDebut:"", heureFin:"", statut:"nouveau", notes:"", budget:"", noteDirecteur:"" };

// ─── Traduction des erreurs techniques en langage humain ─────────────────────
function humanError(e: any): string {
  const msg = (e?.message || String(e || "")).toLowerCase();
  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid_grant") || msg.includes("unauthenticated")) return "Votre session a expiré. Déconnectez-vous puis reconnectez-vous.";
  if (msg.includes("403") || msg.includes("forbidden")) return "Accès refusé. Vérifiez vos autorisations Gmail.";
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("overload") || msg.includes("surcharg")) return "Service momentanément surchargé. Réessayez dans quelques secondes.";
  if (msg.includes("timeout") || msg.includes("abort") || msg.includes("délai")) return "La requête a pris trop de temps. Vérifiez votre connexion et réessayez.";
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("réseau") || msg.includes("connexion") || msg.includes("failed to fetch")) return "Connexion impossible. Vérifiez votre accès internet.";
  if (msg.includes("500") || msg.includes("internal server")) return "Une erreur est survenue côté serveur. Réessayez dans un moment.";
  if (msg.includes("503") || msg.includes("unavailable")) return "Le service est temporairement indisponible. Réessayez dans quelques minutes.";
  if (msg.includes("gmail_auth_expired") || msg.includes("session gmail")) return "Session Gmail expirée. Déconnectez-vous puis reconnectez-vous.";
  if (msg.includes("ia indisponible") || msg.includes("erreur ia") || msg.includes("anthropic")) return "L'assistant IA est temporairement indisponible. Réessayez dans un moment.";
  // Fallback — garder le message original si non reconnu, mais le nettoyer
  return e?.message || "Une erreur inattendue est survenue. Réessayez.";
}

async function callClaude(msg: string, system: string, docs: any[] | null): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "raw", msg, system, docs }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Erreur API (${res.status})`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.response || "";
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error("Délai dépassé — réessayez");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Extraction texte propre depuis HTML email ────────────────────────────────
// Toujours retourne du texte lisible — utilisé pour snippet, IA, et prévisualisation
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
  // Ajouter des sauts de ligne aux éléments de bloc avant de les supprimer
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(p|div|tr|li|h[1-6]|blockquote|section|article|header|footer)[^>]*>/gi, "\n");
  text = text.replace(/<\/td>/gi, " | ").replace(/<\/th>/gi, " | ");
  // Supprimer toutes les balises HTML restantes
  text = text.replace(/<[^>]+>/g, "");
  // Décoder les entités HTML
  const entities: Record<string,string> = {
    "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&apos;":"'",
    "&nbsp;":" ","&hellip;":"…","&mdash;":"—","&ndash;":"–","&laquo;":"«","&raquo;":"»",
    "&eacute;":"é","&egrave;":"è","&ecirc;":"ê","&euml;":"ë",
    "&agrave;":"à","&acirc;":"â","&auml;":"ä",
    "&ocirc;":"ô","&ouml;":"ö","&oslash;":"ø",
    "&ugrave;":"ù","&ucirc;":"û","&uuml;":"ü",
    "&iuml;":"ï","&ccedil;":"ç","&copy;":"©","&reg;":"®","&trade;":"™",
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
  if (text.length > 20000) text = text.slice(0, 20000) + "\n\n[…tronqué]";
  return text;
}

// ─── Sanitize HTML pour affichage sécurisé en iframe ─────────────────────────
function sanitizeHtmlForDisplay(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")           // scripts
    // head conservé — l'iframe est sandboxée, les styles sont nécessaires pour le rendu
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")        // event handlers inline
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, "")               // event handlers sans guillemets
    .replace(/javascript\s*:/gi, "void:")                  // js: dans href
    .replace(/<meta[^>]*http-equiv[^>]*>/gi, "")           // meta refresh
    .replace(/<link[^>]*rel\s*=\s*["']?stylesheet["']?[^>]*>/gi, "") // feuilles CSS externes
    .replace(/url\s*\(\s*["']?\s*data:/gi, "url(data:")   // garder les data: URLs inline
    .replace(/<iframe[^>]*src[^>]*>/gi, "")               // iframes externes
    .replace(/expression\s*\(/gi, "");                     // CSS expressions IE
}

// Alias pour compatibilité — retourne toujours du texte propre
function cleanEmailBody(raw: string): string { return stripHtml(raw); }

// ─── Rendu texte brut enrichi — URLs, emails, tél cliquables ────────────────
function renderPlainText(text: string): React.ReactNode[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
  const emailRegex = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  const telRegex = /(\+?[\d][\d\s\-\.]{7,}[\d])/g;
  const lines = text.split("\n");
  return lines.map((line, li) => {
    // Remplacer URLs, emails, tels par des éléments React cliquables
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

// ─── Génère les créneaux horaires ────────────────────────────────────────────
const TIME_SLOTS: string[] = [];
for(let h=0;h<24;h++) for(let m of [0,30]) TIME_SLOTS.push(String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"));

// ─── Sélecteur d'heure (dropdown) ────────────────────────────────────────────
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

// ─── Mini calendrier picker ───────────────────────────────────────────────────
const JOURS_COURTS = ["L","M","M","J","V","S","D"];
const MOIS_COURTS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

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
        <span style={{fontSize:14}}>📅</span>
        <span style={{flex:1}}>{value?fmtDisplay(value):"Choisir une date"}</span>
        {value&&<span onClick={e=>{e.stopPropagation();onChange("");}} style={{fontSize:14,opacity:.4,lineHeight:1}}>×</span>}
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:1000,background:"#FFFFFF",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,.18)",border:"1px solid #E5E7EB",width:260,padding:"12px"}}>
          {/* Nav mois */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <button onClick={()=>setNav(new Date(nav.getFullYear(),nav.getMonth()-1,1))} style={{width:26,height:26,borderRadius:6,border:"1px solid #E5E7EB",background:"transparent",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#374151"}}>‹</button>
            <span style={{fontSize:13,fontWeight:600,color:"#111111"}}>{MOIS_COURTS[nav.getMonth()]} {nav.getFullYear()}</span>
            <button onClick={()=>setNav(new Date(nav.getFullYear(),nav.getMonth()+1,1))} style={{width:26,height:26,borderRadius:6,border:"1px solid #E5E7EB",background:"transparent",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#374151"}}>›</button>
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

// SVG icons for mail sub-categories — Céleste theme
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
  {id:"atraiter", label:"À traiter"},
  {id:"star",     label:"Favoris"},
  {id:"flag",     label:"Flaggés"},
];

export default function App() {
  const { data: session, status } = useSession()
  const router = useRouter()
  useEffect(() => { if (status === "unauthenticated") router.replace("/") }, [status, router])
  const [view, setView] = useState("general");
  const [emails, setEmails] = useState([]);
  // Fix #4 — Pagination : savoir s'il y a plus d'emails à charger
  const [emailsTotal, setEmailsTotal] = useState(0);
  const [emailsLimit, setEmailsLimit] = useState(100);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resas, setResas] = useState<any[]>([]);
  const [sel, setSel] = useState(null);
  // Origine du mail ouvert — pour le fil d'Ariane "← Retour à l'événement" ou "← Retour au Radar"
  const [mailOrigine, setMailOrigine] = useState<{type:'evenement'|'radar',resaId:string,nom:string}|null>(null);

  // Ouvrir un mail depuis une fiche événement
  // handleSel fait setMailOrigine(null) en début — on le reset après
  const ouvrirMailDepuisEvenement = (email: any, resa: any) => {
    setView("mails");
    setMailFilter("all");
    // handleSel marque comme lu + charge le corps complet + restaure le cache
    handleSel(email);
    // setMailOrigine après handleSel car handleSel le remet à null
    setTimeout(() => {
      setMailOrigine({type:'evenement', resaId: resa.id, nom: resa.nom || resa.entreprise || "l'événement"});
    }, 0);
  };
  const [reply, setReply] = useState("");
  const [genReply, setGenReply] = useState(false);
  const [extracted, setExtracted] = useState<any>(null);
  // Cache des réponses par email ID — évite les regénérations inutiles
  const [repliesCache, setRepliesCache] = useState<Record<string,{reply:string,editReply:string,extracted:any|null,dateGen?:string}>>({});
  const [drafted, setDrafted] = useState(new Set());
  const [undoDelete, setUndoDelete] = useState<{email:any,timer:any}|null>(null);
  // Réponses envoyées — indexées par emailId, persistées en Supabase
  const [sentReplies, setSentReplies] = useState<Record<string,{text:string,date:string,subject:string,toEmail:string}>>({});
  const [editing, setEditing] = useState(false);
  const [editReply, setEditReply] = useState("");

  // ─── Éditeur de réponse manuelle (distinct de l'IA) ─────────────────────────
  const [showReplyEditor, setShowReplyEditor] = useState(false);
  const [replyEditorText, setReplyEditorText] = useState("");
  const [replyEditorMode, setReplyEditorMode] = useState<"reply"|"replyAll"|"forward">("reply");
  const [replyEditorTo, setReplyEditorTo] = useState("");
  const [sending, setSending] = useState(false);

  // ─── Composer nouveau mail ────────────────────────────────────────────────────
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);

  // ─── Brouillons persistés ─────────────────────────────────────────────────────
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

  // Suppression mail au clavier (Delete ou Backspace) quand un mail est sélectionné
  // ─── Badge non lus dans le titre de l'onglet ────────────────────────────────
  useEffect(() => {
    const unreadCount = emails.filter(m => m.unread && !m.archived).length;
    document.title = unreadCount > 0 ? `(${unreadCount}) ARCHANGE` : "ARCHANGE";
  }, [emails]);

  // ─── États tri, archivage, sélection multiple, snooze ───────────────────────
  const [sortOrder, setSortOrder] = useState<"date_desc"|"date_asc"|"from"|"subject">("date_desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  // Ref pour accéder à la liste filtrée depuis les event handlers sans TDZ
  // (filtered est déclaré plus bas via useMemo — on ne peut pas le mettre directement dans les deps)
  const filteredRef = useRef<any[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;

      // "/" — focus recherche
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Rechercher..."]')?.focus();
        return;
      }
      // "?" — aide raccourcis
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowKeyHelp(v => !v);
        return;
      }

      if (!sel) return;

      // J / K — email suivant/précédent
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
      // E — archiver
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        archiveEmail(sel.id);
        return;
      }
      // U — toggle non lu
      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        toggleUnread(sel.id);
        return;
      }
      // S — toggle étoile
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        toggleFlag(sel.id, "star");
        return;
      }
      // R — répondre
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        openReplyEditor("reply");
        return;
      }
      // F — transférer (forward)
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        openReplyEditor("forward");
        return;
      }
      // # — supprimer
      if (e.key === "#") {
        e.preventDefault();
        deleteEmailWithUndo(sel);
        return;
      }
      // Delete / Backspace — supprimer
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

  // ─── Synchronisation complète Gmail ─────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<'idle'|'running'|'done'|'error'>('idle');
  const [syncProgress, setSyncProgress] = useState({synced: 0, total: 0, pageToken: null as string|null});
  const [syncLastDate, setSyncLastDate] = useState<string|null>(null);
  const [deepSearching, setDeepSearching] = useState(false);
  const [deepResults, setDeepResults] = useState<any[]>([]);
  const syncRunning = useRef(false);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<Record<string,string>>({}); // P4: file hors-ligne
  // alerteUrgente supprimé
  const saveTimer = useRef<any>(null);
  // ─── États Radar ARCHANGE ───────────────────────────────────────────────────
  const [radarHoverId, setRadarHoverId] = useState<string|null>(null);
  const [radarResaModal, setRadarResaModal] = useState<any>(null);
  const [radarReplyModal, setRadarReplyModal] = useState<any>(null);
  const [radarReplyLoading, setRadarReplyLoading] = useState(false);
  const [radarReplyText, setRadarReplyText] = useState("");
  const [radarTraites, setRadarTraites] = useState<Set<string>>(new Set());
  const [calDate, setCalDate] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  // ─── État onglet unifié pour la fiche événement (4 onglets : infos, mails, noteIA, relances) ───
  const [resaOnglet, setResaOnglet] = useState<'infos'|'mails'|'noteIA'|'relances'>('infos');
  const [links, setLinks] = useState({website:"",instagram:"",facebook:"",other:""});
  const [linksFetched, setLinksFetched] = useState({});
  const [fetchingLink, setFetchingLink] = useState(null);
  const [customCtx, setCustomCtx] = useState("");
  // ─── Infos établissement — remplacent les valeurs codées en dur ──────────────
  const [nomEtab, setNomEtab] = useState("RÊVA");
  const [adresseEtab, setAdresseEtab] = useState("133 avenue de France, 75013 Paris");
  const [emailEtab, setEmailEtab] = useState("contact@brasserie-reva.fr");
  const [telEtab, setTelEtab] = useState("");
  const [espacesDyn, setEspacesDyn] = useState<EspaceDyn[]>(DEFAULT_ESPACES_DYN);
  // Alias pour rétrocompatibilité — toutes les ref ESPACES utilisent maintenant espacesDyn
  const ESPACES = espacesDyn;
  const [editingCtx, setEditingCtx] = useState(false);
  const [mailFilter, setMailFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Planning form dans mail
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState({});
  const [planErrors, setPlanErrors] = useState({});
  // Suggestions de modifications de fiche événement par l'IA
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

  // Général view state
  const [statuts, setStatuts] = useState<StatutDef[]>(DEFAULT_STATUTS);
  const [showCreateStatut, setShowCreateStatut] = useState(false);
  const [newStatutLabel, setNewStatutLabel] = useState("");
  const [newStatutColor, setNewStatutColor] = useState("#6366f1");
  const [generalFilter, setGeneralFilter] = useState("all");
  const [searchEvt, setSearchEvt] = useState("");
  const [selResaGeneral, setSelResaGeneral] = useState<any>(null);
  // UI collapse state
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [subCollapsed, setSubCollapsed] = useState(false);
  // Relances
  const [relances, setRelances] = useState<any[]>([]);
  // Tags personnalisés — persistés en Supabase
  type CustomTag = { id: string; label: string; color: string };
  const TAG_PALETTE = ["#EF4444","#F97316","#EAB308","#22C55E","#3B82F6","#8B5CF6","#EC4899","#14B8A6","#6B7280","#B8924F"];
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [emailTags, setEmailTags] = useState<Record<string,string[]>>({}); // emailId → tagIds
  const [showTagMenu, setShowTagMenu] = useState<string|null>(null); // emailId ou null
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_PALETTE[0]);
  const [tagFilter, setTagFilter] = useState<string|null>(null); // tagId filtré ou null
  const saveCustomTags = (t: CustomTag[]) => { setCustomTags(t); saveToSupabase({custom_tags:JSON.stringify(t)}); };
  const saveEmailTags = (t: Record<string,string[]>) => { setEmailTags(t); saveToSupabase({email_tags:JSON.stringify(t)}); };
  // Liens email ↔ événement — persistés en Supabase
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
  // Motifs de relance — personnalisables, persistés en Supabase
  const DEFAULT_MOTIFS_RELANCE = [
    "Devis envoyé sans réponse",
    "Confirmation de réservation attendue",
    "Acompte non reçu",
    "Informations manquantes (date, nb personnes, menu...)",
    "Prise de contact suite à visite",
    "Relance à J-30 avant l'événement",
    "Relance à J-7 avant l'événement",
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
  // Note IA par événement
  const [noteIA, setNoteIA] = useState<Record<string,{text:string,date:string}>>({});
  const [genNoteIA, setGenNoteIA] = useState<string|null>(null); // resaId en cours
  const [editResaPanel, setEditResaPanel] = useState<any>(null);
  // Planning view mode
  const [calView, setCalView] = useState<"mois"|"semaine"|"jour">("mois");
  const [planFilter, setPlanFilter] = useState("all"); // filtre Planning indépendant
  const [calWeekStart, setCalWeekStart] = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)); d.setHours(0,0,0,0); return d; });
  // Sources IA sections open/collapsed state
  const [srcSections, setSrcSections] = useState({liens:false, menus:true, conditions:false, espaces:false, ton:false});
  // Nouvelles sections Sources IA — texte structuré persisté en Supabase
  const [menusCtx, setMenusCtx] = useState("");
  const [conditionsCtx, setConditionsCtx] = useState("");
  const [espacesCtx, setEspacesCtx] = useState("");
  const [tonCtx, setTonCtx] = useState("");
  // Édition en cours pour chaque section
  const [editingSrc, setEditingSrc] = useState<Record<string,boolean>>({});
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState<any>({...EMPTY_RESA, espaceId: DEFAULT_ESPACES_DYN[0]?.id || ""});
  const [newEventErrors, setNewEventErrors] = useState<any>({});
  const [initializing, setInitializing] = useState(true);

  const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  const firstDay = (d: Date) => { const f = new Date(d.getFullYear(),d.getMonth(),1).getDay(); return f===0?6:f-1; };

  // Ref pour tracker l'email en cours de génération IA (évite les race conditions)
  const genReplyForEmailId = React.useRef<string|null>(null);
  // Fix C2 — Sémaphore pour éviter deux analyses simultanées
  const analysingRef = React.useRef(false);
  // Ref pour pointer toujours vers la version courante de loadEmailsFromApi
  // Évite le bug de closure stale dans le setInterval du polling
  const loadEmailsFromApiRef = React.useRef<(withSync?: boolean) => Promise<void>>(async () => {});

  // ─── Priorités ARCHANGE — calcul JS pur, zéro appel API ─────────────────
  // ─── getStatut — accessible partout dans le composant (Planning, Événements, modal) ──
  const getStatut = React.useCallback((r: any) =>
    statuts.find(s => s.id === (r?.statut || "nouveau")) || { bg:"#F3F4F6", color:"#6B7280", label:"—" },
    [statuts]
  );

  const prioritesArchange = React.useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);

    // Construire les cartes uniquement à partir des emails avec isReservation détectée
    const cartes = emails.flatMap(m => {
      const cache = repliesCache[m.id];
      const ext = cache?.extracted;
      if (!ext?.isReservation) return [];

      // Ignorer si marqué traité manuellement
      if (radarTraites.has(m.id)) return [];

      // Trouver la réservation liée
      const resaId = emailResaLinks[m.id];
      const resa = resas.find(r => r.id === resaId) ||
        resas.find(r => r.email && m.fromEmail && r.email.toLowerCase() === m.fromEmail.toLowerCase());

      // Ignorer si réservation confirmée ou annulée
      if (resa && (resa.statut === "confirme" || resa.statut === "annule")) return [];

      // Ignorer si date passée
      const dateStr = ext.dateDebut || resa?.dateDebut;
      if (dateStr) {
        const d = new Date(dateStr + "T12:00:00");
        if (d < today) return [];
      }

      // Calculer le score de priorité
      let priorite = 4; // neutre par défaut
      let type: "rouge"|"or"|"neutre" = "neutre";

      // Priorité 1 — événement dans -7 jours
      if (dateStr) {
        const d = new Date(dateStr + "T12:00:00");
        if (d >= today && d <= in7) { priorite = 1; type = "rouge"; }
      }

      // Priorité 2 — relance sans réponse +3 jours (email flaggé ou aTraiter depuis longtemps)
      if (priorite > 2 && (m.flags||[]).includes("flag")) {
        // Vérifier si la date de l'email est ancienne (+3j)
        const emailDateMs = m.rawDate || 0;
        if (emailDateMs && (Date.now() - emailDateMs) > 3 * 86400000) {
          priorite = 2; type = "rouge";
        }
      }

      // Priorité 3 — budget + date précis
      const budget = ext.budget || resa?.budget;
      if (priorite > 3 && budget && dateStr) { priorite = 3; type = "or"; }

      // Priorité 4 — nouvelle demande sans date/budget
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
    return emails.filter(m => {
      if (emailResaLinks[m.id] === resa.id) return true;
      if (resa.email && m.fromEmail && m.fromEmail.toLowerCase() === resa.email.toLowerCase()) return true;
      if (resa.nom && m.from) {
        const firstWord = resa.nom.toLowerCase().split(" ")[0];
        if (firstWord.length > 2 && m.from.toLowerCase().includes(firstWord)) return true;
      }
      return false;
    });
  }, [emails, emailResaLinks]);

  // Sauvegarde Supabase — debounce par clé pour éviter les écrasements
  const _saveTimers = React.useRef<Record<string,any>>({});
  // Cleanup timers à l'unmount pour éviter les appels réseau après démontage
  useEffect(() => () => { Object.values(_saveTimers.current).forEach(clearTimeout); }, []);
  const saveToSupabase = (data: Record<string, string>) => {
    Object.entries(data).forEach(([key, value]) => {
      if (_saveTimers.current[key]) clearTimeout(_saveTimers.current[key]);
      _saveTimers.current[key] = setTimeout(async () => {
        const doSave = async () => {
          try {
            const res = await fetch("/api/user-data", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ [key]: value }),
            });
            if (res.ok) {
              // Retirer de la queue offline si présent
              setOfflineQueue(q => { const n = {...q}; delete n[key]; return n; });
              setSaveIndicator(true);
              if (saveTimer.current) clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(() => setSaveIndicator(false), 2000);
            } else {
              console.error("Supabase save error:", key, res.status);
              setOfflineQueue(q => ({ ...q, [key]: value }));
            }
          } catch {
            // Hors ligne — mettre en file d'attente
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
  // Sauvegarder uniquement les extractions IA (JSON léger) dans Supabase
  const saveExtractions = (cache: Record<string,any>) => {
    saveToSupabase({ extractions: JSON.stringify(cache) });
  };
  // P3 — Sauvegarder radarTraites en Supabase
  const saveRadarTraites = (set: Set<string>) => {
    setRadarTraites(set);
    saveToSupabase({ radar_traites: JSON.stringify([...set]) });
  };
  // On sérialise toutes les sections dans un JSON pour éviter les colonnes inconnues
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
  // Sauvegarde immédiate des métadonnées email — sans debounce
  // Utilisé pour lu/non lu, flags, aTraiter — doit être instantané
  const saveEmailMetaImmediat = async (meta: Record<string,any>) => {
    const json = JSON.stringify(meta);
    // localStorage en premier — synchrone, immédiat
    try { localStorage.setItem("arc_email_meta", json); } catch {}
    // Supabase sans debounce — fire and forget
    try {
      fetch("/api/user-data", {
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

  // Fonction partagée de mapping email API → état React
  // ─── Formate date_iso en heure locale (comme Gmail) ─────────────────────────
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
        // Aujourd'hui → heure locale HH:MM
        return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      } else if (d >= yesterdayStart) {
        return "Hier";
      } else if (d >= weekStart) {
        // Cette semaine → nom du jour
        return d.toLocaleDateString("fr-FR", { weekday: "long" });
      } else {
        // Plus ancien → JJ/MM/AAAA
        return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
      }
    } catch { return ""; }
  };

  const mapEmail = (m: any) => {
    // Champs emails_cache (body_html/body_text) + rétrocompat ancienne table (body)
    const rawBodyHtml = m.body_html || null;
    const rawBodyText = m.body_text || m.body || "";
    const rawSnippet  = m.snippet || "";

    // bodyHtml : priorité au HTML de emails_cache (déjà stocké proprement)
    // Si absent, détecter si body est du HTML
    let bodyHtml: string | null = null;
    if (rawBodyHtml) {
      bodyHtml = sanitizeHtmlForDisplay(rawBodyHtml);
    } else if (rawBodyText.trim().startsWith("<") || /<(html|head|body|div|table)\b/i.test(rawBodyText.slice(0, 500))) {
      bodyHtml = sanitizeHtmlForDisplay(rawBodyText);
    }

    // Flags — is_starred de emails_cache → flag "star"
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
      bodyHtml,                              // HTML sanitisé pour iframe
      bodyLoaded:  !!(rawBodyHtml || rawBodyText), // true si corps déjà chargé
      flags,
      aTraiter:    m.a_traiter  || false,
      unread:      m.is_unread  || false,
      archived:    m.is_archived || false,
      direction:   m.direction  || "received",
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
    };
  };

  // ─── Synchronisation complète Gmail en arrière-plan ─────────────────────────
  const lancerSyncComplete = async () => {
    if (syncRunning.current) return;
    syncRunning.current = true;
    setSyncStatus('running');
    setSyncProgress({synced: 0, total: 0, pageToken: null});

    let totalSynced = 0;
    let estimatedTotal = 0;

    // Fonction interne — paginer UN label + gérer nextLabel automatiquement
    const syncLabel = async (label: string) => {
      let pageToken: string|null = null;
      while (syncRunning.current) {
        const res = await fetch('/api/emails/sync', {
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

  // ─── Recherche approfondie dans Gmail ────────────────────────────────────────
  const lancerDeepSearch = async (q: string) => {
    if (!q.trim()) return;
    setDeepSearching(true);
    setDeepResults([]);
    try {
      const res = await fetch(`/api/emails/deep-search?q=${encodeURIComponent(q)}`);
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

  // Analyse IA en arrière-plan — uniquement les emails sans extraction
  const analyserEmailsEnArrierePlan = async (emailsList: any[], cacheSnapshot: typeof repliesCache) => {
    // Fix C2 — Garde-fou : une seule analyse à la fois (évite les appels Anthropic en double)
    if (analysingRef.current) return;
    // Fix C3 — Utiliser le cacheSnapshot passé en paramètre, pas la closure
    // (la closure pouvait pointer vers repliesCache = {} si appelée depuis un contexte stale)
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
          `Email:\nDe: ${m.from} <${m.fromEmail}>\nObjet: ${m.subject}\n\n${(m.body || m.snippet || "").slice(0, 3000)}`,
          buildExtractPrompt(nomEtab, espacesDyn), null
        );
        const extracted = JSON.parse(raw.replace(/```json|```/g, "").trim());
        nouvellesExtractions[m.id] = extracted;
        // Mettre à jour le cache React au fur et à mesure (UI uniquement, pas de Supabase)
        setRepliesCache(prev => ({
          ...prev,
          [m.id]: { ...(prev[m.id] || { reply: "", editReply: "" }), extracted },
        }));
      } catch {
        // Fix #8 — ne pas marquer comme analysé si échec : sera retenté au prochain cycle
        console.warn(`Analyse email ${m.id} échouée — sera retentée`);
      }
    }
    // Sauvegarder en Supabase UNE SEULE FOIS à la fin — payload maîtrisé
    if (Object.keys(nouvellesExtractions).length > 0) {
      setRepliesCache(prev => {
        const allExtractions: Record<string,any> = {};
        Object.entries(prev).forEach(([id, v]: [string, any]) => {
          if (v.extracted) allExtractions[id] = v.extracted;
        });
        // Limiter à 500 entrées (200 était trop bas — évinçait des analyses valides → re-analyses inutiles)
        const keys = Object.keys(allExtractions);
        if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(k => delete allExtractions[k]);
        saveExtractions(allExtractions);
        return prev;
      });
    }
    } finally {
      // Fix C2 — Toujours libérer le sémaphore, même en cas d'erreur inattendue
      analysingRef.current = false;
      setAnalysing(false);
      setAnalysingProgress("");
    }
  };

  // Chargement/synchronisation des emails — déclenche d'abord une sync Gmail, puis relit Supabase
  const loadEmailsFromApi = async (withSync = false) => {
    setLoadingMail(true);
    try {
      if (withSync) {
        try {
          // Fix #1 — Sync différentielle via historyId (ne récupère que les nouveaux)
          // Récupérer le dernier historyId connu depuis la route sync
          const statusRes = await fetch("/api/emails/sync");
          if (statusRes.ok) {
            const { lastHistoryId, syncCompleted } = await statusRes.json();

            if (syncCompleted && lastHistoryId) {
              // Sync différentielle — seulement les changements depuis la dernière sync
              const diffRes = await fetch("/api/emails/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ useHistoryId: true, lastHistoryId }),
              });
              if (diffRes.status === 401) {
                const d = await diffRes.json();
                if (d.error === "GMAIL_AUTH_EXPIRED") {
                  toast("Session Gmail expirée — reconnectez-vous", "err");
                  setLoadingMail(false);
                  return;
                }
              }
            } else if (!syncCompleted) {
              // Sync initiale pas encore terminée — relancer lancerSyncComplete
              lancerSyncComplete();
            }
          }
        } catch {}
      }
      const r = await fetch(`/api/emails?limit=${emailsLimit}`);
      if (!r.ok) throw new Error("Erreur " + r.status);
      const payload = await r.json();
      // Nouveau format : { emails: [], syncCompleted: bool, total? } — rétrocompat avec []
      const data = Array.isArray(payload) ? payload : (payload?.emails || []);
      if (payload?.total) setEmailsTotal(payload.total);
      if (data.length > 0) {
        const mapped = data.map((m: any) => mapEmail(m));
        setEmails(mapped);
        toast(mapped.length + " emails chargés");
        if (withSync) setTimeout(() => analyserEmailsEnArrierePlan(mapped, repliesCache), 500);
      } else {
        setEmails([]);
        toast("Aucun email — vérifiez la connexion Gmail", "err");
      }
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setLoadingMail(false);
  };

  // Fix #4 — Charger plus d'emails (pagination cursor)
  const chargerPlusEmails = async () => {
    if (loadingMore || emails.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = emails[emails.length - 1]?.rawDate || "";
      const r = await fetch(`/api/emails?limit=50&before=${encodeURIComponent(oldest)}`);
      if (!r.ok) throw new Error("Erreur " + r.status);
      const payload = await r.json();
      const data = Array.isArray(payload) ? payload : (payload?.emails || []);
      if (data.length > 0) {
        const mapped = data.map((m: any) => mapEmail(m));
        setEmails(prev => [...prev, ...mapped]);
        if (payload?.total) setEmailsTotal(payload.total);
      } else {
        toast("Tous les emails sont chargés");
      }
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Chargement parallèle — user-data + emails simultanément
      const [userData, emailsData] = await Promise.allSettled([
        fetch("/api/user-data").then(r => r.ok ? r.json() : Promise.reject("user-data:" + r.status)),
        fetch("/api/emails").then(r => r.ok ? r.json() : Promise.reject("emails:" + r.status)),
      ]);

      if (cancelled) return;

      if (userData.status === "fulfilled") {
        const d = userData.value;
        try { if (d.resas)         setResas(JSON.parse(d.resas)); }         catch {}
        try { if (d.links)         setLinks(JSON.parse(d.links)); }         catch {}
        try { if (d.links_fetched) setLinksFetched(JSON.parse(d.links_fetched)); } catch {}
        if (d.context) {
          // Le champ context contient soit un JSON avec les sections Sources IA,
          // soit une chaîne de texte brut (ancienne valeur legacy)
          try {
            const parsed = JSON.parse(d.context);
            if (parsed && typeof parsed === "object") {
              if (parsed.menus)     setMenusCtx(parsed.menus);
              if (parsed.conditions) setConditionsCtx(parsed.conditions);
              if (parsed.espaces)   setEspacesCtx(parsed.espaces);
              if (parsed.ton)       setTonCtx(parsed.ton);
              if (parsed.custom)    setCustomCtx(parsed.custom);
              // Infos établissement dynamiques
              if (parsed.nomEtab)      setNomEtab(parsed.nomEtab);
              if (parsed.adresseEtab)  setAdresseEtab(parsed.adresseEtab);
              if (parsed.emailEtab)    setEmailEtab(parsed.emailEtab);
              if (parsed.telEtab)      setTelEtab(parsed.telEtab);
              if (parsed.espacesDyn && Array.isArray(parsed.espacesDyn) && parsed.espacesDyn.length > 0)
                setEspacesDyn(parsed.espacesDyn);
            }
          } catch {
            // Valeur legacy texte brut → mettre dans customCtx
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
        // P1 — Charger les réponses IA persistées → restaure les replies après F5
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
        // Charger les extractions IA persistées → alimente directement repliesCache
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
        console.error("Chargement données utilisateur échoué :", userData.reason);
        toast("⚠️ Impossible de charger vos données — vérifiez votre connexion", "err");
      }

      if (emailsData.status === "fulfilled") {
        const payload = emailsData.value;
        // Nouveau format : { emails: [], syncCompleted } — rétrocompat avec []
        const data = Array.isArray(payload) ? payload : (payload?.emails || []);
        const mapped = data.length > 0 ? data.map((m: any) => mapEmail(m)) : [];
        setEmails(mapped);
      } else {
        console.error("Chargement emails échoué :", emailsData.reason);
        setEmails([]);
      }

      if (!cancelled) {
        setInitializing(false);
        setLoadingMail(false);
        // Lancer la synchronisation complète en arrière-plan (sans bloquer l'UI)
        setTimeout(() => lancerSyncComplete(), 2000);
        // Fix #5 — Vérifier et renouveler le Gmail Watch si expiré (temps réel)
        setTimeout(async () => {
          try {
            const watchRes = await fetch("/api/gmail/watch");
            if (watchRes.ok) {
              const { active } = await watchRes.json();
              if (!active) {
                // Watch expiré ou non configuré — tenter de le renouveler
                await fetch("/api/gmail/watch", { method: "POST" });
              }
            }
          } catch {}
        }, 5000);
      }
    };

    setLoadingMail(true);
    // P2 — Restaurer l'état UI depuis localStorage avant le chargement
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

  // Retry automatique — au retour connexion ET toutes les 30s si queue non vide
  useEffect(() => {
    const flushQueue = async () => {
      setOfflineQueue(q => {
        if (Object.keys(q).length === 0) return q;
        // Retenter chaque entrée — saveToSupabase supprime de la queue si succès
        Object.entries(q).forEach(([key, value]) => saveToSupabase({ [key]: value }));
        return q; // Ne pas vider ici — saveToSupabase le fera si succès
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

  // Fix C1 — Polling automatique toutes les 2 minutes pour détecter les nouveaux emails
  // Utilise un ref pour éviter le bug de closure stale (le setInterval capturait
  // loadEmailsFromApi du premier render, avec repliesCache = {} vide → re-analysait tout)
  useEffect(() => { loadEmailsFromApiRef.current = loadEmailsFromApi; });
  useEffect(() => {
    const pollingInterval = setInterval(() => {
      loadEmailsFromApiRef.current(true);
    }, 2 * 60 * 1000);
    return () => clearInterval(pollingInterval);
  }, []);

  // Supabase Realtime — mise à jour instantanée quand emails_cache change (via webhook Pub/Sub)
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let channel: any = null;
    try {
      // Lazy import pour ne pas bloquer si @supabase/supabase-js n'est pas installé côté client
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
              toast(`Nouvel email de ${newEmail.from} — ${newEmail.subject}`);
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
      }).catch(() => {}); // Silencieux si @supabase/supabase-js absent côté client
    } catch {}
    return () => { if (channel) channel.unsubscribe?.(); };
  }, []);

  // P2 — Sauvegarder l'état UI dans localStorage à chaque changement
  useEffect(() => {
    try { localStorage.setItem("arc_ui_state", JSON.stringify({ view, mailFilter, generalFilter, navCollapsed, calView, planFilter })); } catch {}
  }, [view, mailFilter, generalFilter, navCollapsed, calView, planFilter]);

  // P5 — Avertir avant fermeture si réponse non sauvegardée
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (reply && !drafted.has(sel?.id)) {
        e.preventDefault();
        e.returnValue = "Une réponse a été générée mais n'a pas encore été créée comme brouillon. Voulez-vous quitter ?";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [reply, drafted, sel]);
  // [bandeau alerteUrgente supprimé — point 6]

  const deleteEmailWithUndo = (em: any) => {
    if (undoDelete?.timer) clearTimeout(undoDelete.timer);
    // Retirer immédiatement de la liste (optimiste)
    setEmails(prev => prev.filter(m => m.id !== em.id));
    if (sel?.id === em.id) setSel(null);
    const timer = setTimeout(() => {
      // Confirmer la suppression après 4s — appel Gmail trash
      if (em.gmailId) {
        fetch("/api/emails", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail_id: em.gmailId }),
        }).catch(() => {});
      }
      setUndoDelete(null);
    }, 4000);
    setUndoDelete({ email: em, timer });
    toast("Email supprimé — Annuler ?", "undo");
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
    // Bidirectionnel Gmail — avec rollback si échec
    if (email.gmailId && flag === "star") {
      fetch("/api/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail_id: email.gmailId, action: "star", value: !hasFlag }),
      }).catch(() => {
        // Rollback si Gmail échoue
        setEmails(prev => prev.map(m => m.id === id ? { ...m, flags: email.flags || [] } : m));
        if (sel?.id === id) setSel((prev: any) => prev ? { ...prev, flags: email.flags || [] } : prev);
        toast("Erreur synchronisation Gmail — réessayez", "err");
      });
    }
  };

  const toggleATraiter = (id: string) => {
    setEmails(prev => prev.map(m => m.id === id ? { ...m, aTraiter: !m.aTraiter } : m));
    if (sel?.id === id) setSel((prev: any) => prev ? { ...prev, aTraiter: !prev.aTraiter } : prev);
  };

  // ─── Archivage ──────────────────────────────────────────────────────────────
  const archiveEmail = (id: string) => {
    const email = emails.find(m => m.id === id);
    // Optimiste local
    setEmails(prev => prev.map(m => m.id === id ? { ...m, archived: true } : m));
    if (sel?.id === id) setSel(null);
    // Bidirectionnel Gmail — avec rollback si échec
    if (email?.gmailId) {
      fetch("/api/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail_id: email.gmailId, action: "archive" }),
      }).catch(() => {
        // Rollback si Gmail échoue
        setEmails(prev => prev.map(m => m.id === id ? { ...m, archived: false } : m));
        toast("Erreur archivage Gmail — réessayez", "err");
      });
    }
    toast("Email archivé — E pour archiver");
  };

  const unarchiveEmail = (id: string) => {
    setEmails(prev => prev.map(m => m.id === id ? { ...m, archived: false } : m));
    toast("Email restauré dans la boîte");
  };

  // ─── Transfert email ────────────────────────────────────────────────────────
  const forwardEmail = (em: any) => {
    const body = encodeURIComponent(
      `\n\n---------- Message transféré ----------\nDe : ${em.from} <${em.fromEmail}>\nDate : ${em.date}\nObjet : ${em.subject}\n\n${em.body || em.snippet || ""}`
    );
    const subject = encodeURIComponent(`Tr: ${em.subject || ""}`);
    window.open(`https://mail.google.com/mail/?view=cm&su=${subject}&body=${body}`, "_blank");
  };

  // ─── Ouvrir l'éditeur de réponse manuelle ───────────────────────────────────
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
    // Pré-remplir avec la citation de l'email original
    const sig = `\n\n--\nCordialement,\nL'équipe ${nomEtab}${adresseEtab ? "\n" + adresseEtab : ""}${emailEtab ? "\n" + emailEtab : ""}`;
    const citation = `\n\n\n─── Message original ───\nDe : ${sel.from} <${sel.fromEmail}>\nDate : ${sel.date}\nObjet : ${sel.subject}\n\n${sel.body?.slice(0, 2000) || sel.snippet || ""}`;
    setReplyEditorText(sig + citation);
    setShowReplyEditor(true);
  };

  // ─── Envoi réel via /api/gmail/send ─────────────────────────────────────────
  const sendReply = async () => {
    if (!sel || !replyEditorTo.trim() || !replyEditorText.trim()) return;
    setSending(true);
    try {
      const subject = replyEditorMode === "forward"
        ? `Tr: ${sel.subject || ""}`
        : sel.subject?.startsWith("Re:") ? sel.subject : `Re: ${sel.subject || ""}`;
      const r = await fetch("/api/gmail/send", {
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
      toast("Email envoyé ✓");
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setSending(false);
  };

  // ─── Envoi nouveau mail ──────────────────────────────────────────────────────
  const sendNewMail = async () => {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) return;
    setComposeSending(true);
    try {
      const r = await fetch("/api/gmail/send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody, threadId: null }),
      });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      setShowCompose(false);
      setComposeTo(""); setComposeSubject(""); setComposeBody("");
      toast("Email envoyé ✓");
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setComposeSending(false);
  };

  // ─── Sauvegarde brouillon local ──────────────────────────────────────────────
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

    // Fix #6 — Créer le brouillon dans Gmail réel (en parallèle du stockage local)
    try {
      const res = await fetch("/api/gmail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      if (res.ok) {
        toast("Brouillon créé dans Gmail ✓");
      } else {
        // Fallback : stockage local si Gmail échoue
        const updated = [...localDrafts, draft];
        setLocalDrafts(updated);
        saveToSupabase({ replies_cache: JSON.stringify(updated) });
        toast("Brouillon sauvegardé localement ✓");
      }
    } catch {
      // Fallback hors ligne
      const updated = [...localDrafts, draft];
      setLocalDrafts(updated);
      saveToSupabase({ replies_cache: JSON.stringify(updated) });
      toast("Brouillon sauvegardé ✓");
    }

    setShowReplyEditor(false);
    setShowCompose(false);
  };

  // ─── Snooze ─────────────────────────────────────────────────────────────────
  const snoozeEmail = (id: string, until: string) => {
    const upd = emails.map(m => m.id === id ? { ...m, snoozedUntil: until } : m);
    saveEmails(upd);
    if (sel?.id === id) setSel(null);
    toast("Email reporté ⏰");
  };
  // Réveil des emails snoozés
  useEffect(() => {
    const now = new Date().toISOString();
    const toWake = emails.filter(m => m.snoozedUntil && m.snoozedUntil <= now);
    if (toWake.length > 0) {
      const upd = emails.map(m => m.snoozedUntil && m.snoozedUntil <= now ? { ...m, snoozedUntil: null, unread: true } : m);
      saveEmails(upd);
      toast(`${toWake.length} email${toWake.length > 1 ? "s" : ""} reporté${toWake.length > 1 ? "s" : ""} reveillé${toWake.length > 1 ? "s" : ""} ⏰`);
    }
  }, []);

  // ─── Sélection multiple ─────────────────────────────────────────────────────
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
    saveEmails(upd); clearSelection(); toast(`${selectedIds.size} email(s) marqués lus`);
  };
  const bulkMarkUnread = () => {
    const upd = emails.map(m => selectedIds.has(m.id) ? { ...m, unread: true } : m);
    saveEmails(upd); clearSelection(); toast(`${selectedIds.size} email(s) marqués non lus`);
  };
  const bulkArchive = () => {
    const upd = emails.map(m => selectedIds.has(m.id) ? { ...m, archived: true } : m);
    saveEmails(upd); clearSelection(); toast(`${selectedIds.size} email(s) archivé(s)`);
  };
  const bulkDelete = () => {
    const upd = emails.filter(m => !selectedIds.has(m.id));
    saveEmails(upd); clearSelection(); setSel(null); toast(`${selectedIds.size} email(s) supprimé(s)`);
  };
  const bulkATraiter = () => {
    const upd = emails.map(m => selectedIds.has(m.id) ? { ...m, aTraiter: true } : m);
    saveEmails(upd); clearSelection(); toast(`${selectedIds.size} email(s) marqués à traiter`);
  };

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    let res = emails.filter(m => {
      // Archivés/snoozés
      if (m.snoozedUntil && m.snoozedUntil > new Date().toISOString()) return false;
      if (showArchived) return !!m.archived;
      if (m.archived) return false;
      // 3 — Filtre par tag personnalisé
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
    // Tri — utilise rawDate (ISO) pour un ordre chronologique exact
    res = [...res].sort((a, b) => {
      if (sortOrder === "date_asc")  return (a.rawDate||a.date||"").localeCompare(b.rawDate||b.date||"");
      if (sortOrder === "from")      return (a.from||"").localeCompare(b.from||"");
      if (sortOrder === "subject")   return (a.subject||"").localeCompare(b.subject||"");
      return (b.rawDate||b.date||"").localeCompare(a.rawDate||a.date||""); // date_desc par défaut
    });
    return res;
  }, [emails, search, mailFilter, sortOrder, showArchived]);

  // Synchroniser le ref à chaque render (avant les effects)
  filteredRef.current = filtered;

  // ─── Vue Envoyés ─────────────────────────────────────────────────────────────
  // Fix : emails SENT depuis emails_cache (vrais emails Gmail envoyés)
  const [sentEmails, setSentEmails] = React.useState<any[]>([]);
  const [loadingSent, setLoadingSent] = React.useState(false);

  // Charger les emails SENT depuis le backend quand on passe sur cette vue
  React.useEffect(() => {
    if (mailFilter !== "envoyes") return;
    setLoadingSent(true);
    fetch("/api/emails?filter=sent&limit=100")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        const data = Array.isArray(d) ? d : (d?.emails || []);
        setSentEmails(data.map((m: any) => mapEmail(m)));
      })
      .catch(() => {})
      .finally(() => setLoadingSent(false));
  }, [mailFilter]);

  const sentList = React.useMemo(() => {
    // Fusionner les emails SENT Gmail + les réponses envoyées depuis ARCHANGE
    const fromCache = sentEmails;
    const fromReplies = Object.entries(sentReplies)
      .map(([emailId, s]) => ({ _sentId: emailId, from: "Moi", fromEmail: "", subject: s.subject, date: s.date, body: s.text, snippet: s.text.slice(0,120), unread: false, flags: [], attachments: [], id: "sent_"+emailId, rawDate: s.date }));
    // Fusionner sans doublons (prefer cache)
    const cacheIds = new Set(fromCache.map((m: any) => m.id));
    const merged = [...fromCache, ...fromReplies.filter(r => !cacheIds.has(r.id))];
    return merged.sort((a: any, b: any) => (b.rawDate||"").localeCompare(a.rawDate||""));
  }, [sentEmails, sentReplies]);

  // ─── Vue Brouillons ───────────────────────────────────────────────────────────
  const draftList = React.useMemo(() => {
    return localDrafts.map(d => ({...d, from: "Brouillon", fromEmail: d.to, snippet: d.body.slice(0,120), unread: false, flags: [], attachments: [], id: d.id, rawDate: d.date}))
      .sort((a,b) => b.rawDate.localeCompare(a.rawDate));
  }, [localDrafts]);

  const handleSel = async (emailArg: any) => {
    let email = emailArg;
    setMailOrigine(null);

    // Fix 5 — Sauvegarder le brouillon de réponse en cours avant de changer d'email
    if (sel && sel.id !== email.id && showReplyEditor && replyEditorText.trim()) {
      // Sauvegarder comme brouillon lié à l'email précédent
      const draftKey = `draft_reply_${sel.id}`;
      try { localStorage.setItem(draftKey, replyEditorText); } catch {}
    }
    // Réinitialiser l'éditeur de réponse (isolation par email)
    setShowReplyEditor(false);
    setReplyEditorText("");
    // Restaurer un brouillon éventuel pour le nouvel email
    if (email.id) {
      try {
        const saved = localStorage.getItem(`draft_reply_${email.id}`);
        if (saved) { setReplyEditorText(saved); setShowReplyEditor(true); }
      } catch {}
    }

    // Marquer comme lu — optimiste puis sync Gmail via PATCH
    if (email.unread) {
      email = { ...email, unread: false };
      setEmails(prev => prev.map(m => m.id === email.id ? { ...m, unread: false } : m));
      if (email.gmailId) {
        fetch("/api/emails", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail_id: email.gmailId, action: "read" }),
        }).catch(() => {});
      }
    }

    // Restaurer la réponse mise en cache
    const cached = repliesCache[email.id];
    setReply(cached?.reply || "");
    setEditReply(cached?.editReply || "");
    setExtracted(cached?.extracted || null);
    setEditing(false); setShowPlanForm(false);
    setSel(email);

    // Charger le corps complet à la demande (format=full) si pas encore en cache
    if (email.gmailId && !email.bodyLoaded) {
      try {
        const res = await fetch(`/api/emails?gmail_id=${encodeURIComponent(email.gmailId)}`);
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
        console.warn("Chargement corps email échoué:", e);
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
      // ── Construire le planning temps réel ─────────────────────────────────
      const planningCtx = "\n\n=== PLANNING EN COURS ===\n" + (
        resas.length > 0
          ? resas.map(r => {
              const espace = ESPACES.find(e => e.id === r.espaceId)?.nom || r.espaceId;
              const statut = statuts.find(s => s.id === (r.statut || "nouveau"))?.label || r.statut;
              return `- ${espace} | ${r.dateDebut || "date?"} ${r.heureDebut || ""}→${r.heureFin || ""} | ${r.nombrePersonnes || "?"} pers. | ${r.typeEvenement || ""} | ${r.nom || ""} | Statut: ${statut}`;
            }).join("\n")
          : "Aucune réservation enregistrée."
      );

      // ── Construire le contexte complet — sections structurées ─────────────
      const linkCtx = Object.values(linksFetched).filter(Boolean)
        .map((l: any) => (l.summary || "").slice(0, 500)).join("\n\n");

      // ── Historique échanges avec cet expéditeur (emails envoyés) ─────────
      const emailsEnvoyesAuClient = Object.entries(sentReplies)
        .filter(([eId]: [string, any]) => {
          const emailSrc = emails.find(m => m.id === eId);
          return emailSrc?.fromEmail?.toLowerCase() === sel.fromEmail?.toLowerCase();
        })
        .map(([, sr]: [string, any]) => sr)
        .sort((a: any, b: any) => b.date.localeCompare(a.date))
        .slice(0, 5);

      const historiqueCtx = emailsEnvoyesAuClient.length > 0
        ? "\n\n=== HISTORIQUE DES ÉCHANGES PRÉCÉDENTS ===\n" +
          emailsEnvoyesAuClient.map((sr: any) =>
            `[${sr.date}] Réponse envoyée (${sr.subject}):\n${(sr.text || "").slice(0, 800)}`
          ).join("\n\n---\n\n")
        : "";

      const sys = buildSystemPrompt({nomEtab, adresseEtab, emailEtab, telEtab, espacesDyn})
        + (menusCtx      ? "\n\n=== MENUS & TARIFS ===\n"          + menusCtx.slice(0, 3000)      : "")
        + (conditionsCtx ? "\n\n=== CONDITIONS & POLITIQUE ===\n"  + conditionsCtx.slice(0, 2000) : "")
        + (espacesCtx    ? "\n\n=== ESPACES & CAPACITÉS ===\n"     + espacesCtx.slice(0, 2000)    : "")
        + (tonCtx        ? "\n\n=== RÈGLES & TON IA ===\n"         + tonCtx.slice(0, 1500)        : "")
        + (customCtx     ? "\n\n=== CONTEXTE SUPPLÉMENTAIRE ===\n" + customCtx.slice(0, 1000)     : "")
        + (linkCtx       ? "\n\n=== INFOS WEB ANALYSÉES ===\n"     + linkCtx                      : "")
        + planningCtx
        + historiqueCtx;

      // ── Prompt email — corps tronqué à 3000 chars ─────────────────────────
      const bodyTronque = (sel.body || sel.snippet || "").slice(0, 3000);
      const prompt = `Email reçu:\nDe: ${sel.from} <${sel.fromEmail}>\nObjet: ${sel.subject}\n\n${bodyTronque}${(sel.body||"").length > 3000 ? "\n[…message tronqué]" : ""}${historiqueCtx ? "\n\n[Tiens compte de l'historique des échanges fourni dans le contexte système]" : ""}\n\nRédige une réponse professionnelle.`;

      const [reponse, infoRaw] = await Promise.allSettled([
        callClaude(prompt, sys, null),
        callClaude(
          `Email:\nDe: ${sel.from} <${sel.fromEmail}>\nObjet: ${sel.subject}\n\n${sel.body || sel.snippet || ""}`,
          buildExtractPrompt(nomEtab, espacesDyn), null
        ),
      ]);

      let newReply = "";
      let newExtracted: any = null;

      // Abandonner si l'utilisateur a changé d'email pendant la génération
      if (genReplyForEmailId.current !== emailId) { setGenReply(false); return; }

      if (reponse.status === "fulfilled" && reponse.value) {
        newReply = reponse.value;
        setReply(newReply); setEditReply(newReply);
      } else {
        const msg = reponse.status === "rejected" ? (reponse.reason?.message || "Erreur IA") : "Réponse vide";
        toast("ARCHANGE n'a pas pu rédiger la réponse. " + humanError({message: msg}), "err");
      }

      if (infoRaw.status === "fulfilled") {
        try {
          newExtracted = JSON.parse(infoRaw.value.replace(/```json|```/g, "").trim());
          setExtracted(newExtracted);
        } catch { /* extraction silencieuse */ }
      }

      // Mettre en cache la réponse pour cet email + persister en Supabase
      if (newReply) {
        setRepliesCache(prev => {
          const dateGen = new Date().toLocaleDateString("fr-FR");
          const updated = {
            ...prev,
            [sel.id]: { reply: newReply, editReply: newReply, extracted: newExtracted, dateGen }
          };
          // Persister les replies en Supabase (uniquement reply+editReply, extracted est déjà sauvegardé)
          const repliesToSave: Record<string,{reply:string,editReply:string,dateGen:string}> = {};
          Object.entries(updated).forEach(([id, v]: [string, any]) => {
            if (v.reply) repliesToSave[id] = { reply: v.reply, editReply: v.editReply || v.reply, dateGen: v.dateGen || "" };
          });
          saveToSupabase({ replies_cache: JSON.stringify(repliesToSave) });
          return updated;
        });
      }

      // ── Association IA email ↔ événement ────────────────────────────────────
      // Si des événements existent et que le lien n'est pas déjà établi
      if (resas.length > 0 && !emailResaLinks[sel.id]) {
        try {
          const resaList = resas.map(r =>
            `- ID:${r.id} | Nom:${r.nom || "?"} | Entreprise:${r.entreprise || "?"} | Email:${r.email || "?"} | Type:${r.typeEvenement || "?"} | Date:${r.dateDebut || "?"} | Personnes:${r.nombrePersonnes || "?"}`
          ).join("\n");

          const matchPrompt = `Analyse cet email et détermine à quel événement il correspond parmi la liste ci-dessous.

EMAIL REÇU :
De: ${sel.from} <${sel.fromEmail}>
Objet: ${sel.subject}
Corps: ${(sel.body || sel.snippet || "").substring(0, 800)}

ÉVÉNEMENTS EN COURS :
${resaList}

Réponds UNIQUEMENT avec un JSON valide et rien d'autre :
{"resaId": "ID_DE_L_EVENEMENT_ou_null", "confiance": "haute|moyenne|faible", "raison": "explication courte"}

Critères de matching (par ordre de priorité) :
1. Email de l'expéditeur correspond à l'email de l'événement
2. Nom de l'expéditeur correspond au nom du contact de l'événement
3. Entreprise mentionnée dans le mail correspond à l'entreprise de l'événement
4. Date ou type d'événement mentionné correspond
5. Si aucune correspondance évidente → resaId: null`;

          const matchResult = await callClaude(matchPrompt, "Tu es un assistant qui analyse des emails pour les associer aux bons événements. Réponds uniquement en JSON valide.", null);
          const match = JSON.parse(matchResult.replace(/```json|```/g, "").trim());

          if (match.resaId && match.confiance !== "faible") {
            const resaExists = resas.find(r => r.id === match.resaId);
            if (resaExists) {
              const newLinks = { ...emailResaLinks, [sel.id]: match.resaId };
              saveEmailResaLinks(newLinks);

              // ── Détecter les modifications sur la fiche événement ──────────
              try {
                const ficheActuelle = { ...resaExists };
                delete ficheActuelle.id; // on ne modifie pas l'id

                // Labels lisibles pour chaque champ (extensible automatiquement)
                const LABELS_CHAMPS: Record<string,string> = {
                  nom: "Nom du contact", email: "Email", telephone: "Téléphone",
                  entreprise: "Entreprise", typeEvenement: "Type d'événement",
                  nombrePersonnes: "Nombre de personnes", espaceId: "Espace",
                  dateDebut: "Date", heureDebut: "Heure de début", heureFin: "Heure de fin",
                  statut: "Statut", notes: "Notes", budget: "Budget",
                  noteDirecteur: "Note directeur",
                };

                const modifPrompt = `Tu es un assistant qui analyse un email pour détecter si le client communique des informations modifiant sa réservation.

FICHE ÉVÉNEMENT ACTUELLE :
${JSON.stringify(ficheActuelle, null, 2)}

EMAIL REÇU :
De: ${sel.from} <${sel.fromEmail}>
Objet: ${sel.subject}
${sel.body || sel.snippet || ""}

INSTRUCTIONS :
- Analyse uniquement les informations EXPLICITEMENT mentionnées dans l'email
- Ne propose une modification que si l'email contient clairement une nouvelle valeur différente de l'actuelle
- Pour le statut, utilise uniquement ces valeurs : nouveau, en_cours, en_attente, confirme, annule
- Si aucune modification n'est détectée, retourne {"modifications": []}
- Pour les champs absents de la fiche actuelle mais mentionnés dans l'email, inclus-les quand même

Retourne UNIQUEMENT ce JSON valide :
{"modifications": [{"champ": "nomDuChamp", "ancienne": "valeurActuelle", "nouvelle": "nouvelleValeur", "raison": "explication courte en français"}]}`;

                const modifResult = await callClaude(modifPrompt, "Tu analyses des emails pour détecter des modifications de réservation. Réponds uniquement en JSON valide.", null);
                const modifData = JSON.parse(modifResult.replace(/```json|```/g, "").trim());

                if (modifData.modifications && modifData.modifications.length > 0) {
                  const suggestions: SuggestionModif[] = modifData.modifications.map((m: any) => ({
                    champ: m.champ,
                    label: LABELS_CHAMPS[m.champ] || m.champ,
                    ancienne: m.ancienne,
                    nouvelle: m.nouvelle,
                    raison: m.raison,
                    selectionnee: true, // cochée par défaut
                  }));
                  setPendingSuggestions({ resaId: resaExists.id, emailId: sel.id, suggestions });
                }
              } catch { /* détection silencieuse */ }
            }
          }
        } catch { /* matching silencieux — ne bloque pas la génération */ }
      }
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setGenReply(false);
  };

  // P7 — Autosave du formulaire de réservation en cours
  const updatePlanForm = (updates: any) => {
    const next = { ...planForm, ...updates };
    setPlanForm(next);
    try { localStorage.setItem("arc_draft_planform", JSON.stringify(next)); } catch {}
  };

  const openPlanForm = () => {
    const pers = parseInt(String(extracted?.nombrePersonnes || "0"), 10);
    // Attribution dynamique selon type d'événement (assis vs debout) et nombre de personnes
    const getEspaceAuto = () => {
      if (extracted?.espaceDetecte) return extracted.espaceDetecte;
      if (espacesDyn.length === 0) return "";
      if (pers === 0) return espacesDyn[0].id;
      // Détecter si l'événement est debout (cocktail, afterwork, standing…)
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
    const fourchette = (min && max && min !== max) ? `Fourchette : ${min}–${max} personnes. ` : "";
    const f = {
      nom:            extracted?.nom            || sel?.from      || "",
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
    // P7 — Proposer de restaurer un brouillon si disponible pour ce même email
    try {
      const draft = JSON.parse(localStorage.getItem("arc_draft_planform") || "null");
      if (draft && draft._emailId === sel?.id && draft.nom && window.confirm(`Un brouillon existe pour "${draft.nom}". Restaurer ?`)) {
        setPlanForm(draft); setPlanErrors({}); setShowPlanForm(true); return;
      }
    } catch {}
    setPlanForm(f); setPlanErrors({}); setShowPlanForm(true);
    try { localStorage.setItem("arc_draft_planform", JSON.stringify(f)); } catch {}
  };

  const submitPlanForm = () => {
    const errs: Record<string, string> = {};
    if (!planForm.nom?.trim())            errs.nom            = "Nom obligatoire";
    if (!planForm.dateDebut)              errs.dateDebut      = "Date obligatoire";
    if (!planForm.nombrePersonnes)        errs.nombrePersonnes= "Nombre de personnes obligatoire";
    if (!planForm.heureDebut)             errs.heureDebut     = "Heure de début obligatoire";
    if (!planForm.heureFin)               errs.heureFin       = "Heure de fin obligatoire";
    if (Object.keys(errs).length > 0)    { setPlanErrors(errs); return; }
    const pers = parseInt(String(planForm.nombrePersonnes), 10);
    const r = { ...planForm, id: "r" + Date.now(), nombrePersonnes: isNaN(pers) ? planForm.nombrePersonnes : pers };
    saveResas([...resas, r]);
    try { localStorage.removeItem("arc_draft_planform"); } catch {} // P7 — effacer le draft
    // Lier l'email source à la réservation créée et persister en Supabase
    if (sel?.id) saveEmailResaLinks({ ...emailResaLinks, [sel.id]: r.id });
    toast("Réservation ajoutée au planning !");
    setShowPlanForm(false); setExtracted(null);
    // 2D — Proposer de voir la fiche événement créée (setTimeout pour laisser resas se mettre à jour)
    setTimeout(() => {
      if (window.confirm(`Événement créé pour ${r.nom}. Ouvrir la fiche ?`)) {
        setSelResaGeneral(r);
        setView("general");
      }
    }, 100);
  };

  const fetchLink = async (url: string, key: string) => {
    if (!url?.trim()) return;
    setFetchingLink(key);
    try {
      const prompt = `Recherche et analyse ce site web pour ${nomEtab} : ${url}\nRésume en 200 mots max : ce que fait ce site, ses services, son ambiance, pour aider à répondre à des emails professionnels.`;
      const sys = "Tu es un assistant qui analyse des sites web pour une brasserie parisienne. Réponds en français, de façon concise et utile.";
      const txt = await callClaude(prompt, sys, null);
      const upd = { ...linksFetched, [key]: { url, summary: txt || "Analyse effectuée.", fetchedAt: new Date().toLocaleDateString("fr-FR") } };
      setLinksFetched(upd);
      saveToSupabase({ links_fetched: JSON.stringify(upd) });
      toast("Analysé !");
    } catch (e: any) {
      toast(humanError(e), "err");
    }
    setFetchingLink(null);
  };

  const genRelanceIAFn = async (resa: any) => {
    setRelanceIAText(""); setGenRelanceIA(true);
    try {
      const linkedMails = getLinkedEmails(resa);
      // Garder les 3 emails les plus récents, corps tronqué à 800 chars chacun
      const mailsRecents = linkedMails.slice(0, 3);
      const hist = mailsRecents.length > 0
        ? mailsRecents.map(m => {
            const corps = (m.body || m.snippet || "").slice(0, 800);
            return `---\nDe: ${m.from}\nDate: ${m.date}\nObjet: ${m.subject}\n${corps}${(m.body||"").length > 800 ? "\n[…tronqué]" : ""}`;
          }).join("\n\n")
        : "Aucun échange précédent.";

      // Calculer le dernier contact
      const dernierMail = linkedMails.length > 0 ? linkedMails[0] : null;
      const dernierContact = dernierMail
        ? `${dernierMail.date} — "${dernierMail.subject}"`
        : "Aucun échange précédent";

      // Date du jour et délai avant événement
      const today = new Date().toLocaleDateString("fr-FR", {day:"2-digit", month:"2-digit", year:"numeric"});
      const statutLabel = statuts.find(s => s.id === (resa.statut || "nouveau"))?.label || resa.statut || "Nouveau";
      const espaceName = ESPACES.find(e => e.id === resa.espaceId)?.nom || "—";

      // Motif final — personnalisé ou sélectionné
      const motifFinal = motifSelectionne === "Autre"
        ? (motifPersonnalise || "Relance générale")
        : (motifSelectionne || "Relance sans motif spécifique");

      const sys = buildSystemPrompt({nomEtab, adresseEtab, emailEtab, telEtab, espacesDyn});

      const prompt = `Tu dois rédiger un email de relance pour ${nomEtab}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOSSIER ÉVÉNEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Client : ${resa.nom || "—"}${resa.entreprise ? " (" + resa.entreprise + ")" : ""}
Email : ${resa.email || "—"}
Type : ${resa.typeEvenement || "—"} | Espace : ${espaceName}
Date événement : ${resa.dateDebut || "non définie"} | Horaires : ${resa.heureDebut || "—"} → ${resa.heureFin || "—"}
Personnes : ${resa.nombrePersonnes || "—"} | Budget : ${resa.budget || "non mentionné"}
Statut actuel : ${statutLabel}
Notes internes : ${resa.notes || "—"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MISSION PRÉALABLE — ANALYSE DU DOSSIER (silencieuse)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avant de rédiger, analyse silencieusement :
1. Le statut actuel du dossier : ${statutLabel}
2. Le dernier échange : ${dernierContact}
3. Ce qui est en suspens dans les échanges (réponse non reçue, validation attendue, acompte non confirmé, détail non résolu)
4. Le délai restant avant l'événement (${resa.dateDebut || "date inconnue"} vs date du jour ${today})

Le directeur a identifié le motif suivant : ${motifFinal}
Base ta relance principalement sur ce motif.

En complément, si ton analyse révèle d'autres points en suspens importants non couverts par ce motif, mentionne-les subtilement dans l'email sans les imposer. Cela sert de double vérification bienveillante.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HISTORIQUE DES ÉCHANGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${hist}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCTIONS DE RÉDACTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Rédige un email de relance complet
- Première ligne obligatoirement : Objet: [objet du mail]
- Puis le corps du mail
- Ton chaleureux, professionnel, jamais insistant
- Personnalise selon le profil et l'historique du client
- Appel à l'action clair en fin de mail
- Signature : L'équipe ${nomEtab}${adresseEtab ? "\n" + adresseEtab : ""}${emailEtab ? "\n" + emailEtab : ""}${telEtab ? "\n" + telEtab : ""}`;

      // Docs exclus volontairement — non nécessaires pour une relance et trop lourds (PDFs base64)
      const txt = await callClaude(prompt, sys, null);
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
        : "Aucun échange email trouvé pour cet événement.";
      const espaceName = ESPACES.find(e => e.id === resa.espaceId)?.nom || "—";
      const statutLabel = statuts.find(s => s.id === (resa.statut || "nouveau"))?.label || resa.statut || "—";
      const prompt = `DOSSIER ÉVÉNEMENT :
Nom : ${resa.nom || "—"}${resa.entreprise ? " (" + resa.entreprise + ")" : ""}
Email : ${resa.email || "—"} | Tél : ${resa.telephone || "—"}
Type : ${resa.typeEvenement || "—"} | Date : ${resa.dateDebut || "—"} | Horaires : ${resa.heureDebut || "—"} → ${resa.heureFin || "—"}
Espace : ${espaceName} | Personnes : ${resa.nombrePersonnes || "—"} | Budget : ${resa.budget || "—"}
Statut : ${statutLabel}
Notes internes : ${resa.notes || "—"}

ÉCHANGES EMAILS :
${hist}`;

      const sys = `Tu es un coordinateur événementiel senior chez ${nomEtab}, expert dans la lecture et l'analyse d'échanges clients. Tu as lu l'intégralité des emails de ce dossier.

Rédige une note de briefing destinée au directeur de ${nomEtab}. Cette note a deux niveaux de lecture distincts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NIVEAU 1 — FICHE ÉVÉNEMENT (faits bruts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Synthétise les informations factuelles confirmées :
- Interlocuteur : nom, email, téléphone, entreprise si applicable
- Type d'événement
- Date et horaires (arrivée / fin)
- Espace réservé
- Nombre de personnes (min / max si fourchette)
- Prestations demandées (restauration, sono, décoration, etc.)
- Budget mentionné ou budget indicatif
- Statut actuel du dossier

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NIVEAU 2 — ANALYSE PERSONNALISÉE ⚠️ PRIORITÉ HAUTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

C'est la partie la plus importante de cette note. Elle ne se substitue pas aux faits — elle les dépasse.

Analyse les échanges en profondeur et réponds à ces questions :

PROFIL CLIENT
→ Quel type de client est-ce ? (professionnel aguerri, particulier stressé, client exigeant, organisateur expérimenté, premier événement, etc.)
→ Quel est son niveau d'implication et d'exigence perçu dans les échanges ?
→ Y a-t-il des signaux d'inquiétude, d'hésitation ou au contraire de grande confiance ?

DEMANDES PARTICULIÈRES & HORS CADRE
→ Quelles sont les demandes qui sortent du cadre standard de ${nomEtab} ? (décoration, contraintes alimentaires, exigences techniques, flexibilité horaires, etc.)
→ Y a-t-il des points non résolus ou en attente de confirmation dans les échanges ?
→ Des promesses ou engagements ont-ils été pris dans les emails ? Lesquels exactement ?

POINTS DE VIGILANCE
→ Quels sont les risques ou points de friction potentiels ? (malentendu sur un tarif, attente irréaliste, délai serré, détail oublié)
→ Y a-t-il des non-dits ou des sous-entendus importants à interpréter ?

INFORMATIONS MANQUANTES
→ Liste explicitement les informations cruciales absentes des échanges et à obtenir impérativement avant de confirmer (budget, date définitive, nombre exact de personnes, choix du menu, acompte, etc.)

RECOMMANDATION DIRECTEUR
→ En 2-3 phrases maximum : ce que le directeur doit absolument savoir avant de rencontrer ou recontacter ce client. Le ton, l'état d'esprit, ce qui compte vraiment pour lui.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Bullet points pour le Niveau 1
- Paragraphes courts et directs pour le Niveau 2
- Pas de formules de politesse
- Pas d'informations inventées : si un élément est absent des échanges, indique "non mentionné" plutôt que de supposer
- Longueur totale : aussi longue que nécessaire pour le Niveau 2 — ne sacrifie jamais la profondeur d'analyse par souci de concision`;
      const txt = await callClaude(prompt, sys, null);
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
      const bodyTronque = (m.body || m.snippet || "").slice(0, 3000);
      const prompt = `Email reçu:\nDe: ${m.from} <${m.fromEmail}>\nObjet: ${m.subject}\n\n${bodyTronque}\n\nRédige une réponse professionnelle pour ${nomEtab}.`;
      const sys = buildSystemPrompt({nomEtab, adresseEtab, emailEtab, telEtab, espacesDyn})
        + (menusCtx      ? "\n\n=== MENUS & TARIFS ===\n"          + menusCtx.slice(0,3000)      : "")
        + (conditionsCtx ? "\n\n=== CONDITIONS & POLITIQUE ===\n"  + conditionsCtx.slice(0,2000) : "")
        + (espacesCtx    ? "\n\n=== ESPACES & CAPACITÉS ===\n"     + espacesCtx.slice(0,2000)    : "")
        + (tonCtx        ? "\n\n=== RÈGLES & TON IA ===\n"         + tonCtx.slice(0,1500)        : "");
      const rep = await callClaude(prompt, sys, null);
      setRadarReplyText(rep || "");
    } catch(e: any) {
      toast(humanError(e), "err");
    }
    setRadarReplyLoading(false);
  };

  const openSendMail = (resa) => {
    setShowSendMail(resa);
    setSendMailSubject(`Votre événement chez ${nomEtab} — ${resa.typeEvenement||""}`);
    setSendMailBody("");
  };

  const fmt = s => s>1048576?(s/1048576).toFixed(1)+" Mo":Math.round(s/1024)+" Ko";

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
    // Bidirectionnel Gmail — avec rollback si échec
    if (email.gmailId) {
      fetch("/api/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail_id: email.gmailId, action: newUnread ? "unread" : "read" }),
      }).catch(() => {
        // Rollback si Gmail échoue
        setEmails(prev => prev.map(m => m.id === id ? { ...m, unread: email.unread } : m));
        if (sel?.id === id) setSel((prev: any) => prev ? { ...prev, unread: email.unread } : prev);
        toast("Erreur synchronisation Gmail — réessayez", "err");
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

  // ─── Icônes SVG Céleste pour la navigation ──────────────────────────────────
  const NavIcon = ({id, active}: {id:string, active:boolean}) => {
    const c = active ? "#1A1A1E" : "#6B6E7E";
    const icons: Record<string, JSX.Element> = {
      // Événements — calendrier avec étoile
      general: <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="12" rx="1" stroke={c} strokeWidth="1.1"/>
        <path d="M1.5 6h13" stroke={c} strokeWidth="1.1"/>
        <path d="M5 1v3M11 1v3" stroke={c} strokeWidth="1.1" strokeLinecap="round"/>
        <path d="M8 9l.8 1.6L11 11l-1.5 1.4.3 2L8 13.5l-1.8.9.3-2L5 11l2.2-.4L8 9z" fill={active?"#B8924F":"none"} stroke="#B8924F" strokeWidth="0.8"/>
      </svg>,
      // Mails — enveloppe avec sceau
      mails: <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="3.5" width="13" height="9" rx="1" stroke={c} strokeWidth="1.1"/>
        <path d="M1.5 4.5l6.5 5 6.5-5" stroke={c} strokeWidth="1.1" strokeLinecap="round"/>
      </svg>,
      // Planning — grille semaine
      planning: <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="1.5" width="6" height="6" rx="0.8" stroke={c} strokeWidth="1.1"/>
        <rect x="8.5" y="1.5" width="6" height="6" rx="0.8" stroke={c} strokeWidth="1.1"/>
        <rect x="1.5" y="8.5" width="6" height="6" rx="0.8" stroke={c} strokeWidth="1.1"/>
        <rect x="8.5" y="8.5" width="6" height="6" rx="0.8" stroke={active?"#B8924F":c} strokeWidth="1.1" fill={active?"rgba(184,146,79,0.1)":"none"}/>
      </svg>,
      // Stats — lignes ascendantes
      stats: <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M2 12l3.5-4 3 2 3-5 2.5 3" stroke={active?"#B8924F":c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 14h12" stroke={c} strokeWidth="1.1" strokeLinecap="round"/>
      </svg>,
      // Sources IA — sceau Archange miniature
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
    {id:"general",  label:"Événements", badge:resas.filter(r=>r.statut==="nouveau"||!r.statut).length||null},
    {id:"mails",    label:"Mails",       badge:emails.filter(m=>m.unread).length||null},
    {id:"planning", label:"Planning"},
    {id:"stats",    label:"Stats"},
    {id:"sources",  label:"Sources IA",  badge:(!menusCtx&&!conditionsCtx&&!tonCtx&&!espacesCtx)?"!":null},
  ];

  const inp = {padding:"8px 12px",borderRadius:3,border:"1px solid #EBEAE5",background:"#F5F4F0",color:"#1A1A1E",fontSize:13,width:"100%",outline:"none",transition:"border-color .15s",fontFamily:"'Geist','system-ui',sans-serif"};
  const inpLight = {padding:"8px 12px",borderRadius:3,border:"1px solid #EBEAE5",background:"#FAFAF7",color:"#1A1A1E",fontSize:13,width:"100%",fontFamily:"'Geist','system-ui',sans-serif"};
  const gold = {padding:"8px 18px",borderRadius:3,border:"none",background:"#1A1A1E",color:"#F5F4F0",fontWeight:500,fontSize:12,cursor:"pointer",letterSpacing:"0.04em",fontFamily:"'Geist','system-ui',sans-serif"};
  const out  = {padding:"7px 14px",borderRadius:3,border:"1px solid #EBEAE5",background:"transparent",color:"#4A4A52",fontSize:12,cursor:"pointer",letterSpacing:"0.02em",fontFamily:"'Geist','system-ui',sans-serif"};
  const outLight = {padding:"7px 14px",borderRadius:3,border:"1px solid #EBEAE5",background:"transparent",color:"#4A4A52",fontSize:12,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif"};

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",fontFamily:"'Geist','system-ui',sans-serif",background:"#F5F4F0"}}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Geist:wght@300;400;500;600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#E0DED7;border-radius:10px;}::-webkit-scrollbar-thumb:hover{background:#B8924F;}.mail-row:hover .mail-actions{opacity:1!important}.mail-row:hover .mail-checkbox{opacity:1!important}.celeste-nav-btn:hover{background:#EBEAE5!important;}.fade-in{animation:fadeIn .25s ease}@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}.snooze-wrap:hover .snooze-menu{display:block!important}.snooze-menu button:hover{background:#FAFAF7!important}.celeste-email-item:hover{background:#FAFAF7!important}@keyframes celesteBlink{0%,50%{opacity:1}51%,100%{opacity:0}}"}</style>

      {/* Écran de chargement initial */}
      {initializing && (
        <div style={{position:"fixed",inset:0,background:"#1A1A1E",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,zIndex:9999}}>
          <div style={{fontSize:11,fontWeight:700,color:"#1A1A1E",letterSpacing:"0.28em",textTransform:"uppercase"}}>ARCHANGE</div>
          <div style={{fontSize:8,color:"#6B6E7E",letterSpacing:"0.18em",textTransform:"uppercase",marginTop:-8}}>{nomEtab} · AGENT IA</div>
          <Spin s={18}/>
          <div style={{fontSize:11,color:"#6B6E7E",letterSpacing:"0.08em"}}>Chargement en cours…</div>
        </div>
      )}

      {notif && <div style={{position:"fixed",bottom:32,left:"50%",transform:"translateX(-50%)",zIndex:9999,padding:"12px 24px",borderRadius:12,background:notif.type==="err"?"#2D0A0A":notif.type==="undo"?"#1A1A1E":"#1F2E1A",color:notif.type==="err"?"#FCA5A5":notif.type==="undo"?"#E0DED7":"#6EE7B7",fontSize:13,fontWeight:500,whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,.25)",letterSpacing:"0.01em",border:notif.type==="err"?"1px solid rgba(239,68,68,.2)":notif.type==="undo"?"1px solid rgba(209,196,178,.2)":"1px solid rgba(52,211,153,.2)",display:"flex",alignItems:"center",gap:12}}>
        <span>{notif.msg}</span>
        {notif.type==="undo"&&undoDelete&&<button onClick={()=>{
          if(undoDelete.timer) clearTimeout(undoDelete.timer);
          saveEmails([undoDelete.email,...emails]);
          setUndoDelete(null); setNotif(null);
          toast("Email restauré ✓");
        }} style={{fontSize:12,fontWeight:700,color:"#B8924F",background:"none",border:"1px solid rgba(184,146,79,.4)",borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>Annuler</button>}
      </div>}

      {/* ── Modal raccourcis clavier ── */}
      {showKeyHelp&&(
        <div onClick={()=>setShowKeyHelp(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:9990,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",borderRadius:16,padding:"28px 32px",minWidth:340,boxShadow:"0 24px 64px rgba(0,0,0,.2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700,color:"#1A1A1E"}}>⌨️ Raccourcis clavier</div>
              <button onClick={()=>setShowKeyHelp(false)} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#6B6E7E"}}>×</button>
            </div>
            {[
              ["/","Rechercher"],["J / K","Email suivant / précédent"],["R","Répondre"],
              ["F","Transférer"],["E","Archiver"],["U","Marquer lu / non lu"],
              ["S","Étoile"],["#","Supprimer"],["Del","Supprimer"],["?","Afficher cette aide"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #F5F4F0"}}>
                <span style={{fontSize:12,color:"#6B6E7E"}}>{v}</span>
                <kbd style={{fontSize:11,background:"#F5F4F0",border:"1px solid #EBEAE5",borderRadius:5,padding:"2px 8px",color:"#1A1A1E",fontFamily:"monospace",fontWeight:600}}>{k}</kbd>
              </div>
            ))}
            <div style={{fontSize:11,color:"#6B6E7E",marginTop:12,textAlign:"center"}}>Appuie sur ? ou Échap pour fermer</div>
          </div>
        </div>
      )}

      {/* ── Indicateur de sauvegarde ── */}
      {saveIndicator&&<div style={{position:"fixed",top:12,right:16,zIndex:9998,padding:"5px 12px",borderRadius:20,background:"#1F2E1A",color:"#6EE7B7",fontSize:11,fontWeight:600,letterSpacing:"0.04em",border:"1px solid rgba(52,211,153,.2)",pointerEvents:"none"}}>✓ Sauvegardé</div>}
      {Object.keys(offlineQueue).length>0&&<div style={{position:"fixed",top:12,right:16,zIndex:9998,padding:"5px 12px",borderRadius:20,background:"#431407",color:"#FED7AA",fontSize:11,fontWeight:600,letterSpacing:"0.04em",border:"1px solid rgba(251,146,60,.2)",cursor:"default"}} title="Les modifications seront sauvegardées dès le retour de connexion">⚠ Non sauvegardé</div>}

      {/* bandeau alerteUrgente supprimé */}

      {/* Nav principale — Céleste */}
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
          <button onClick={()=>setNavCollapsed(v=>!v)} title={navCollapsed?"Agrandir":"Réduire"} style={{width:20,height:20,borderRadius:2,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:navCollapsed?0:6}}>
            {navCollapsed?"›":"‹"}
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
              <button onClick={()=>signOut({callbackUrl:"/"})} style={{fontSize:9.5,color:"#6B6E7E",background:"none",border:"none",cursor:"pointer",padding:0,letterSpacing:"0.05em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>⎋ Déconnexion</button>
            </div>
          </div>
        </div>}
      </aside>

      <main style={{flex:1,display:"flex",overflow:"hidden",minWidth:0}}>

        {/* ══ GÉNÉRAL ══ */}
        {view==="general" && (
          <div style={{display:"flex",flex:1,overflow:"hidden"}}>
            {/* Sidebar filtres statuts — collapsible */}
            <div style={{width:subCollapsed?44:210,background:"#FAFAF7",display:"flex",flexDirection:"column",flexShrink:0,borderRight:"1px solid #EBEAE5",transition:"width .2s ease",overflow:"hidden"}}>
              <div style={{padding:subCollapsed?"10px 6px":"16px 12px 10px",display:"flex",alignItems:"center",justifyContent:subCollapsed?"center":"space-between",flexShrink:0}}>
                {!subCollapsed&&<div style={{fontSize:11,fontWeight:700,color:"#1A1A1E",letterSpacing:"0.1em",textTransform:"uppercase"}}>Filtrer</div>}
                <button onClick={()=>setSubCollapsed(v=>!v)} title={subCollapsed?"Agrandir":"Réduire"} style={{width:22,height:22,borderRadius:5,border:"none",background:"#EBEAE5",color:"#6B6E7E",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {subCollapsed?"›":"‹"}
                </button>
              </div>
              {subCollapsed?(
                <div style={{padding:"4px 6px",display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>
                  <button onClick={()=>setGeneralFilter("all")} title="Tous" style={{width:32,height:32,borderRadius:8,border:"none",background:generalFilter==="all"?"rgba(201,168,118,0.15)":"transparent",color:generalFilter==="all"?"#B8924F":"#6B6E7E",cursor:"pointer",fontSize:14}}>🗂</button>
                  {statuts.map(s=>(
                    <button key={s.id} onClick={()=>setGeneralFilter(s.id)} title={s.label} style={{width:32,height:32,borderRadius:8,border:"none",background:generalFilter===s.id?"rgba(201,168,118,0.15)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.color}}/>
                    </button>
                  ))}
                  <button onClick={()=>setGeneralFilter("arelancer")} title="À relancer" style={{width:32,height:32,borderRadius:8,border:"none",background:generalFilter==="arelancer"?"rgba(201,168,118,0.15)":"transparent",cursor:"pointer",fontSize:14}}>⏰</button>
                </div>
              ):(
                <>
                  <div style={{padding:"0 12px 10px",flex:1,overflowY:"auto"}}>
                    <button onClick={()=>setGeneralFilter("all")} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"9px 10px",borderRadius:8,border:"none",background:generalFilter==="all"?"#F5F4F0":"transparent",color:generalFilter==="all"?"#1A1A1E":"#4A4A52",fontSize:13,textAlign:"left",cursor:"pointer",marginBottom:2,fontWeight:generalFilter==="all"?600:400}}>
                      <span>🗂 Tous</span>
                      <span style={{fontSize:11,color:generalFilter==="all"?"#B8924F":"#6B6E7E"}}>{resas.length}</span>
                    </button>

                    {/* Statuts draggables */}
                    {statuts.map((s,idx)=>{
                      const count=resas.filter(r=>(r.statut||"nouveau")===s.id).length;
                      return (
                        <div key={s.id}
                          draggable
                          onDragStart={()=>setDragStatutIdx(idx)}
                          onDragOver={e=>{e.preventDefault();}}
                          onDrop={e=>{
                            e.preventDefault();
                            if(dragStatutIdx===null||dragStatutIdx===idx) return;
                            const arr=[...statuts];
                            const [moved]=arr.splice(dragStatutIdx,1);
                            arr.splice(idx,0,moved);
                            saveStatuts(arr); setDragStatutIdx(null);
                          }}
                          style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"7px 10px",borderRadius:8,background:generalFilter===s.id?"#F5F4F0":"transparent",marginBottom:2,cursor:"grab",userSelect:"none",opacity:dragStatutIdx===idx?0.4:1}}
                        >
                          <button onClick={()=>setGeneralFilter(s.id)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",color:generalFilter===s.id?"#1A1A1E":"#4A4A52",fontSize:13,textAlign:"left",cursor:"pointer",flex:1,padding:0,fontWeight:generalFilter===s.id?600:400}}>
                            <span style={{fontSize:10,opacity:.3,marginRight:1,color:"#6B6E7E"}}>⠿</span>
                            <div style={{width:9,height:9,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                            <span>{s.label}</span>
                          </button>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            {count>0&&<span style={{fontSize:11,color:generalFilter===s.id?"#B8924F":"#6B6E7E"}}>{count}</span>}
                            <button onClick={e=>{e.stopPropagation();const ok=window.confirm('Supprimer "'+s.label+'" ? Les événements avec ce statut passeront à "Nouveau".');if(!ok) return;const arr=statuts.filter(x=>x.id!==s.id);saveStatuts(arr);if(generalFilter===s.id)setGeneralFilter("all");toast("Statut supprimé");}} title="Supprimer ce statut" style={{width:16,height:16,borderRadius:4,border:"none",background:"transparent",color:"rgba(27,30,43,0.2)",cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1,flexShrink:0}} onMouseEnter={e=>(e.currentTarget.style.color="rgba(239,68,68,0.8)")} onMouseLeave={e=>(e.currentTarget.style.color="rgba(255,255,255,0.2)")}>✕</button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Séparateur + À relancer */}
                    <div style={{height:1,background:"#EBEAE5",margin:"12px 0"}}/>
                    <button onClick={()=>setGeneralFilter("arelancer")} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"9px 10px",borderRadius:8,border:"none",background:generalFilter==="arelancer"?"#F5F4F0":"transparent",color:generalFilter==="arelancer"?"#1A1A1E":"#4A4A52",fontSize:13,textAlign:"left",cursor:"pointer",fontWeight:generalFilter==="arelancer"?600:400}}>
                      <span>⏰ À relancer</span>
                      {relances.length>0&&<span style={{fontSize:11,color:generalFilter==="arelancer"?"#B8924F":"#6B6E7E"}}>{relances.length}</span>}
                    </button>
                  </div>

                  <div style={{padding:"10px 12px",borderTop:"1px solid #EBEAE5"}}>
                    {showCreateStatut?(
                      <div>
                        <div style={{fontSize:11,color:"#6B6E7E",marginBottom:8}}>Nouveau statut</div>
                        <input value={newStatutLabel} onChange={e=>setNewStatutLabel(e.target.value)} placeholder="Nom du statut…" style={{width:"100%",padding:"6px 9px",borderRadius:7,border:"1px solid #EBEAE5",background:"#F5F4F0",color:"#1A1A1E",fontSize:12,marginBottom:8,outline:"none"}}/>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <span style={{fontSize:11,color:"#6B6E7E"}}>Couleur</span>
                          <input type="color" value={newStatutColor} onChange={e=>setNewStatutColor(e.target.value)} style={{width:32,height:24,borderRadius:5,border:"none",cursor:"pointer",background:"transparent"}}/>
                          <div style={{width:16,height:16,borderRadius:"50%",background:newStatutColor}}/>
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>{
                            if(!newStatutLabel.trim()) return;
                            const hex=newStatutColor;
                            const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
                            const bg=`rgba(${r},${g},${b},0.12)`;
                            const ns:StatutDef={id:"s_"+Date.now(),label:newStatutLabel.trim(),bg,color:hex};
                            saveStatuts([...statuts,ns]);
                            setNewStatutLabel("");setNewStatutColor("#6366f1");setShowCreateStatut(false);
                            toast("Statut créé !");
                          }} style={{flex:1,padding:"6px",borderRadius:7,border:"none",background:"#1A1A1E",color:"#F5F4F0",fontSize:11,fontWeight:600,cursor:"pointer"}}>Créer</button>
                          <button onClick={()=>{setShowCreateStatut(false);setNewStatutLabel("");}} style={{padding:"6px 8px",borderRadius:7,border:"1px solid rgba(255,255,255,0.12)",background:"transparent",color:"#6B6E7E",fontSize:11,cursor:"pointer"}}>✕</button>
                        </div>
                      </div>
                    ):(
                      <button onClick={()=>setShowCreateStatut(true)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px dashed #EBEAE5",background:"transparent",color:"#6B6E7E",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                        <span>+</span> Créer un statut
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Liste des réservations */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"#F5F4F0"}}>
              <div style={{padding:"20px 24px 0",flexShrink:0,display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:22,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",letterSpacing:"0.01em"}}>Événements</div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:3}}>
                    {generalFilter==="all"?`${resas.length} demande${resas.length!==1?"s":""}`:
                    `${resas.filter(r=>(r.statut||"nouveau")===generalFilter).length} demande${resas.filter(r=>(r.statut||"nouveau")===generalFilter).length!==1?"s":""} · ${statuts.find(s=>s.id===generalFilter)?.label||""}`}
                  </div>
                </div>
                <button onClick={()=>{ setNewEvent({...EMPTY_RESA, espaceId: espacesDyn[0]?.id || ""}); setNewEventErrors({}); setShowNewEvent(true); }} style={{...gold}}>+ Nouvelle demande</button>
              </div>
              <div style={{padding:"12px 24px",flexShrink:0,position:"relative"}}>
                <span style={{position:"absolute",left:36,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#6B6E7E",pointerEvents:"none"}}>🔍</span>
                <input value={searchEvt} onChange={e=>setSearchEvt(e.target.value)} placeholder="Rechercher par nom, entreprise, type, date…" style={{...inp,paddingLeft:32,paddingRight:searchEvt?28:12}} />
                {searchEvt&&<button onClick={()=>setSearchEvt("")} style={{position:"absolute",right:36,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6B6E7E",cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 4px"}}>×</button>}
              </div>

              {/* ── Barre de filtre pills par statut ── */}
              <div style={{padding:"0 24px 12px",flexShrink:0,display:"flex",gap:6,flexWrap:"wrap"}}>
                {/* Tous */}
                <button onClick={()=>setGeneralFilter("all")} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${generalFilter==="all"?"#B8924F":"#EBEAE5"}`,background:generalFilter==="all"?"#B8924F":"transparent",color:generalFilter==="all"?"#1A1A1E":"#6B6B72",fontSize:11,fontWeight:generalFilter==="all"?600:400,cursor:"pointer",whiteSpace:"nowrap"}}>
                  Tous ({resas.length})
                </button>
                {/* Un pill par statut */}
                {statuts.map(s=>{
                  const count=resas.filter(r=>(r.statut||"nouveau")===s.id).length;
                  const active=generalFilter===s.id;
                  return (
                    <button key={s.id} onClick={()=>setGeneralFilter(s.id)} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${active?s.color:s.color+"55"}`,background:active?s.bg:"transparent",color:active?s.color:s.color,fontSize:11,fontWeight:active?600:400,cursor:"pointer",whiteSpace:"nowrap",opacity:count===0?0.4:1}}>
                      {s.label} ({count})
                    </button>
                  );
                })}
                {/* Sans statut */}
                {(()=>{const c=resas.filter(r=>!r.statut||!statuts.find(s=>s.id===r.statut)).length;const active=generalFilter==="__none__";return c>0&&(
                  <button onClick={()=>setGeneralFilter("__none__")} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${active?"#A5A4A0":"#EBEAE5"}`,background:active?"#F1EFE8":"transparent",color:active?"#3D3530":"#A5A4A0",fontSize:11,fontWeight:active?600:400,cursor:"pointer",whiteSpace:"nowrap"}}>
                    Sans statut ({c})
                  </button>
                );})()}
                {/* À relancer */}
                {(()=>{const active=generalFilter==="arelancer";return(
                  <button onClick={()=>setGeneralFilter("arelancer")} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${active?"#F59E0B":"#EBEAE5"}`,background:active?"#FFFBEB":"transparent",color:active?"#92400E":"#A5A4A0",fontSize:11,fontWeight:active?600:400,cursor:"pointer",whiteSpace:"nowrap"}}>
                    ⏰ Relances ({relances.length})
                  </button>
                );})()}
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"0 24px 20px"}}>

              {/* Vue À relancer */}
              {generalFilter==="arelancer"&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                    <span style={{fontSize:16,fontWeight:600,color:"#1A1A1E"}}>⏰ À relancer</span>
                    <span style={{fontSize:12,color:"#6B6E7E"}}>{relances.length} relance{relances.length!==1?"s":""}</span>
                  </div>
                  {relances.length===0?(
                    <div style={{textAlign:"center",padding:"60px 24px",color:"#6B6E7E"}}>
                      <div style={{fontSize:36,marginBottom:10}}>⏰</div>
                      <div style={{fontSize:14}}>Aucune relance programmée</div>
                      <div style={{fontSize:12,marginTop:4}}>Ouvrez un événement et cliquez sur "Relance date"</div>
                    </div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {relances.sort((a,b)=>a.date.localeCompare(b.date)).map(rel=>{
                        const resa=resas.find(r=>r.id===rel.resaId);
                        const st=resa?statuts.find(s=>s.id===(resa.statut||"nouveau"))||statuts[0]:null;
                        const isOverdue=rel.date<new Date().toISOString().slice(0,10);
                        return (
                          <div key={rel.id} onClick={()=>resa&&setSelResaGeneral(resa)} style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5",padding:"14px 18px",cursor:resa?"pointer":"default",display:"flex",alignItems:"center",gap:14,borderLeft:`3px solid ${isOverdue?"#DC2626":"#F59E0B"}`}}>
                            <div style={{width:36,height:36,borderRadius:"50%",background:isOverdue?"#FEE2E2":"#FFFBEB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>⏰</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",marginBottom:3}}>{rel.resaNom||"—"}</div>
                              <div style={{fontSize:12,color:isOverdue?"#DC2626":"#92400E",fontWeight:isOverdue?600:400}}>{isOverdue?"En retard · ":""}{rel.date}{rel.heure&&` à ${rel.heure}`}</div>
                              {rel.note&&<div style={{fontSize:11,color:"#6B6E7E",marginTop:2}}>{rel.note}</div>}
                            </div>
                            <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end",flexShrink:0}}>
                              {st&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:100,background:st.bg,color:st.color,fontWeight:600}}>{st.label}</span>}
                              <button onClick={e=>{e.stopPropagation();saveRelances(relances.filter(r=>r.id!==rel.id));}} style={{fontSize:10,color:"#DC2626",background:"none",border:"none",cursor:"pointer",padding:0}}>Supprimer</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Groupes par statut */}
              {generalFilter!=="arelancer"&&(()=>{
                const q=searchEvt.toLowerCase();
                if(generalFilter==="__none__") {
                  const group=resas.filter(r=>(!r.statut||!statuts.find(s=>s.id===r.statut))&&(!q||r.nom?.toLowerCase().includes(q)||r.entreprise?.toLowerCase().includes(q)||r.typeEvenement?.toLowerCase().includes(q)||r.email?.toLowerCase().includes(q)||r.dateDebut?.includes(q)));
                  return group.length===0
                    ? <div style={{textAlign:"center",padding:"60px 0",color:"#6B6E7E",fontSize:13}}>Aucun événement sans statut</div>
                    : <div style={{display:"flex",flexDirection:"column",gap:8}}>{group.map(r=>{
                        const st=statuts[0]||{bg:"#F3F4F6",color:"#6B7280",label:"—"};
                        return <div key={r.id} onClick={()=>setSelResaGeneral(r)} style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,borderLeft:"3px solid #EBEAE5",boxShadow:selResaGeneral?.id===r.id?"0 2px 10px rgba(26,26,30,.07)":"0 1px 3px rgba(26,26,30,.04)"}}>
                          <Avatar name={r.nom||"?"} size={36}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",marginBottom:3}}>{r.nom||"—"}</div>
                            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                              {r.typeEvenement&&<span style={{fontSize:11,color:"#6B6E7E"}}>{r.typeEvenement}</span>}
                              {r.dateDebut&&<span style={{fontSize:11,color:"#6B6E7E"}}>📅 {fmtDateFr(r.dateDebut)}</span>}
                              {r.nombrePersonnes&&<span style={{fontSize:11,color:"#6B6E7E"}}>👥 {r.nombrePersonnes}</span>}
                            </div>
                          </div>
                        </div>;
                      })}</div>;
                }
                return (generalFilter==="all"?statuts:[statuts.find(s=>s.id===generalFilter)].filter(Boolean)).map(statut=>{
                const q=searchEvt.toLowerCase();
                const group=resas.filter(r=>(r.statut||"nouveau")===statut.id&&(!q||r.nom?.toLowerCase().includes(q)||r.entreprise?.toLowerCase().includes(q)||r.typeEvenement?.toLowerCase().includes(q)||r.email?.toLowerCase().includes(q)||r.dateDebut?.includes(q)));
                if(group.length===0) return null;
                return (
                  <div key={statut.id} style={{marginBottom:24}}>
                    {generalFilter==="all"&&(
                      <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10,marginTop:4}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:statut.color}}/>
                        <span style={{fontSize:9,fontWeight:700,color:"#6B6E7E",textTransform:"uppercase",letterSpacing:"0.14em"}}>{statut.label}</span>
                        <span style={{fontSize:10,color:"#6B6E7E",background:"#EBEAE5",padding:"2px 7px",borderRadius:100}}>{group.length}</span>
                        <div style={{flex:1,height:1,background:"#EBEAE5"}}/>
                      </div>
                    )}
                    {group.length===0&&generalFilter!=="all"&&(
                      <div style={{textAlign:"center",padding:"48px 24px",color:"#6B6E7E",fontSize:13}}>
                        <div style={{fontSize:32,marginBottom:8}}>📭</div>
                        Aucune demande avec ce statut
                      </div>
                    )}
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {group.map(r=>{
                        const st=statuts.find(s=>s.id===(r.statut||"nouveau"))||statuts[0];
                        const linkedEmails=getLinkedEmails(r);
                        return (
                          <div key={r.id} onClick={()=>setSelResaGeneral(r)} style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,borderLeft:`3px solid ${st.color}`,boxShadow:selResaGeneral?.id===r.id?"0 2px 10px rgba(26,26,30,.07)":"0 1px 3px rgba(26,26,30,.04)"}}>
                            <Avatar name={r.nom||"?"} size={34}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                {r.nom||"—"}{r.entreprise&&<span style={{fontSize:12,fontWeight:400,color:"#6B6E7E"}}> · {r.entreprise}</span>}
                              </div>
                              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                                {r.typeEvenement&&<span style={{fontSize:11,color:"#6B6E7E"}}>🎉 {r.typeEvenement}</span>}
                                {r.dateDebut&&<span style={{fontSize:11,color:"#6B6E7E"}}>📅 {r.dateDebut}</span>}
                                {(r.heureDebut||r.heureFin)&&<span style={{fontSize:11,color:"#6B6E7E"}}>🕐 {r.heureDebut}{r.heureFin?" → "+r.heureFin:""}</span>}
                                {r.nombrePersonnes&&<span style={{fontSize:11,color:"#6B6E7E"}}>👥 {r.nombrePersonnes} pers.</span>}
                              </div>
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                              <span style={{fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:5,background:st.bg,color:st.color,letterSpacing:"0.03em"}}>{st.label}</span>
                              {linkedEmails.length>0&&<span style={{fontSize:10,color:"#B0AAA2"}}>✉ {linkedEmails.length} mail{linkedEmails.length>1?"s":""}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
              })()}
              {resas.length===0?(
                <div style={{textAlign:"center",padding:"80px 24px",color:"#6B6E7E"}}>
                  <div style={{fontSize:40,marginBottom:12}}>📭</div>
                  <div style={{fontSize:14}}>Aucune demande de réservation</div>
                  <div style={{fontSize:12,marginTop:4}}>Les demandes détectées dans vos mails apparaîtront ici.</div>
                </div>
              ):searchEvt&&resas.filter(r=>{const q=searchEvt.toLowerCase();return r.nom?.toLowerCase().includes(q)||r.entreprise?.toLowerCase().includes(q)||r.typeEvenement?.toLowerCase().includes(q)||r.email?.toLowerCase().includes(q)||r.dateDebut?.includes(q);}).length===0?(
                <div style={{textAlign:"center",padding:"60px 24px",color:"#6B6E7E"}}>
                  <div style={{fontSize:32,marginBottom:10}}>🔍</div>
                  <div style={{fontSize:14}}>Aucun résultat pour "{searchEvt}"</div>
                  <button onClick={()=>setSearchEvt("")} style={{marginTop:12,background:"none",border:"none",color:"#B8924F",fontSize:12,cursor:"pointer",fontWeight:600}}>Effacer la recherche</button>
                </div>
              ):null}
              </div>
            </div>

            {/* Panel détail réservation (général) — ouvert comme modale via selResaGeneral */}
          </div>
        )}

        {/* ══ MAILS ══ */}
        {view==="mails" && (
          <>
            {/* Sidebar catégories mails — collapsible */}
            <div style={{width:subCollapsed?44:160,background:"#FAFAF7",display:"flex",flexDirection:"column",flexShrink:0,borderRight:"1px solid #EBEAE5",transition:"width .2s ease",overflow:"hidden"}}>
              {/* Barre de progression synchronisation */}
              {!subCollapsed&&syncStatus==="running"&&(
                <div style={{padding:"6px 10px",background:"rgba(184,146,79,0.08)",borderBottom:"1px solid #EBEAE5",flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                    <Spin s={9}/>
                    <span style={{fontSize:9,color:"#B8924F",letterSpacing:"0.06em",fontFamily:"'Geist','system-ui',sans-serif"}}>Synchronisation…</span>
                  </div>
                  <div style={{height:2,background:"#EBEAE5",borderRadius:1,overflow:"hidden"}}>
                    <div style={{height:"100%",background:"#B8924F",borderRadius:1,width:syncProgress.total>0?`${Math.min(100,syncProgress.synced/syncProgress.total*100)}%`:"30%",transition:"width .5s ease"}}/>
                  </div>
                  {syncProgress.total>0&&<div style={{fontSize:8,color:"#6B6E7E",marginTop:3,fontFamily:"'Geist','system-ui',sans-serif"}}>{syncProgress.synced.toLocaleString('fr')} / {syncProgress.total.toLocaleString('fr')}</div>}
                </div>
              )}
              {!subCollapsed&&syncStatus==="done"&&(
                <div style={{padding:"4px 10px",borderBottom:"1px solid #EBEAE5",flexShrink:0,display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:9,color:"#059669",fontFamily:"'Geist','system-ui',sans-serif"}}>✓ Synchronisé</span>
                  {syncLastDate&&<span style={{fontSize:8,color:"#6B6E7E"}}>{new Date(syncLastDate).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</span>}
                </div>
              )}
              <div style={{padding:subCollapsed?"10px 6px":"10px 10px 8px",display:"flex",alignItems:"center",justifyContent:subCollapsed?"center":"space-between",flexShrink:0,gap:6}}>
                {!subCollapsed&&<>
                  <button onClick={()=>{setShowCompose(true);setComposeTo("");setComposeSubject("");setComposeBody(`\n\n--\nCordialement,\nL'équipe ${nomEtab}`);}} style={{...gold,flex:1,fontSize:10,padding:"7px 8px",display:"flex",alignItems:"center",justifyContent:"center",gap:5,letterSpacing:"0.06em"}}>
                    ✏ Nouveau mail
                  </button>
                  <button onClick={()=>loadEmailsFromApi(true)} title="Actualiser" style={{width:28,height:28,borderRadius:6,border:"1px solid rgba(209,196,178,0.2)",background:"rgba(201,168,118,0.08)",color:"#C9A876",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {loadingMail?<Spin s={10}/>:"↺"}
                  </button>
                </>}
                {subCollapsed&&<button onClick={()=>loadEmailsFromApi(true)} title="Actualiser" style={{width:32,height:32,borderRadius:8,border:"none",background:"rgba(201,168,118,0.1)",color:"#C9A876",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>{loadingMail?<Spin s={10}/>:"↺"}</button>}
                <button onClick={()=>setSubCollapsed(v=>!v)} title={subCollapsed?"Agrandir":"Réduire"} style={{width:22,height:22,borderRadius:5,border:"none",background:"#EBEAE5",color:"#6B6E7E",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {subCollapsed?"›":"‹"}
                </button>
              </div>
              {subCollapsed?(
                <div style={{padding:"4px 6px",display:"flex",flexDirection:"column",gap:4,alignItems:"center",height:"100%"}}>
                  <button onClick={()=>loadEmailsFromApi(true)} title="Actualiser" style={{width:32,height:32,borderRadius:8,border:"none",background:"rgba(201,168,118,0.1)",color:"#C9A876",cursor:"pointer",fontSize:13}}>↺</button>
                  {/* Radar ARCHANGE — en premier */}
                  <button onClick={()=>setMailFilter("priorites")} title="Radar ARCHANGE" style={{width:32,height:32,borderRadius:8,border:`1px solid ${mailFilter==="priorites"?"rgba(184,146,79,0.5)":"rgba(184,146,79,0.2)"}`,background:mailFilter==="priorites"?"rgba(184,146,79,0.15)":"rgba(184,146,79,0.06)",cursor:"pointer",fontSize:12,color:"#B8924F",fontWeight:700,position:"relative"}}>
                    ◆
                    {prioritesArchange.length>0&&<span style={{position:"absolute",top:1,right:1,width:8,height:8,borderRadius:"50%",background:"#A84B45"}}/>}
                  </button>
                  <button onClick={()=>setMailFilter("all")} title="Tous les mails" style={{width:32,height:32,borderRadius:8,border:"none",background:mailFilter==="all"?"rgba(201,168,118,0.1)":"transparent",cursor:"pointer",fontSize:14}}>📬</button>
                  {MAIL_CATS.map(c=>(
                    <button key={c.id} onClick={()=>setMailFilter(c.id)} title={c.label} style={{width:32,height:32,borderRadius:8,border:"none",background:mailFilter===c.id?"rgba(201,168,118,0.1)":"transparent",cursor:"pointer",fontSize:14}}>
                      {c.icon}
                    </button>
                  ))}
                </div>
              ):(
                <div style={{padding:"10px 10px",flex:1,display:"flex",flexDirection:"column"}}>
                  {/* Radar ARCHANGE — en premier, hero */}
                  <div style={{paddingBottom:10,marginBottom:8,borderBottom:"1px solid #EBEAE5"}}>
                    {analysing&&(
                      <div style={{display:"flex",alignItems:"center",gap:7,padding:"4px 11px",marginBottom:5}}>
                        <Spin s={10}/>
                        <span style={{fontSize:11,color:"#6B6E7E",fontFamily:"'Geist','system-ui',sans-serif"}}>Analyse {analysingProgress}…</span>
                      </div>
                    )}
                    <button onClick={()=>setMailFilter("priorites")} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 12px",borderRadius:10,border:`1px solid ${mailFilter==="priorites"?"rgba(184,146,79,0.45)":"rgba(184,146,79,0.25)"}`,background:mailFilter==="priorites"?"linear-gradient(180deg, rgba(184,146,79,0.14) 0%, rgba(184,146,79,0.08) 100%)":"linear-gradient(180deg, rgba(184,146,79,0.08) 0%, rgba(184,146,79,0.04) 100%)",textAlign:"left",cursor:"pointer",transition:"all .15s ease",position:"relative",overflow:"hidden",fontFamily:"'Geist','system-ui',sans-serif"}}>
                      <span style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:"#B8924F"}}/>
                      <span style={{fontSize:14,color:"#B8924F",lineHeight:1,flexShrink:0}}>✦</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:12.5,color:"#B8924F",letterSpacing:"-0.005em"}}>Radar ARCHANGE</div>
                        <div style={{fontSize:11,color:"#6B6E7E",marginTop:1,fontVariantNumeric:"tabular-nums"}}>{analysing?"Analyse en cours…":`${prioritesArchange.length} demande${prioritesArchange.length!==1?"s":""}`}</div>
                      </div>
                      {prioritesArchange.length>0&&<span style={{fontSize:11,background:"#A84B45",color:"#fff",padding:"2px 8px",borderRadius:100,fontWeight:600,flexShrink:0,fontVariantNumeric:"tabular-nums",minWidth:22,textAlign:"center"}}>{prioritesArchange.length}</span>}
                    </button>
                  </div>
                  {/* Catégories standard */}
                  {[
                    {id:"all", label:"Tous les mails", count:emails.filter(m=>m.unread&&!m.archived).length||null,
                      icon:<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M1 4l6 4.5L13 4" stroke="currentColor" strokeWidth="1.1"/></svg>},
                  ].map(item=>(
                    <button key={item.id} onClick={()=>{setMailFilter("all");setShowArchived(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:mailFilter==="all"&&!showArchived?"#F5F4F0":"transparent",color:mailFilter==="all"&&!showArchived?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:mailFilter==="all"&&!showArchived?500:400,transition:"background .12s ease"}}>
                      <span style={{color:mailFilter==="all"&&!showArchived?"#1A1A1E":"#6B6E7E",display:"inline-flex"}}>{item.icon}</span>
                      <span style={{flex:1}}>{item.label}</span>
                      <span style={{fontSize:11,color:mailFilter==="all"&&!showArchived?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{item.count||""}</span>
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
                  {/* Séparateur */}
                  <div style={{height:1,background:"#EBEAE5",margin:"10px 4px"}}/>
                  {/* Archivés */}
                  <button onClick={()=>setShowArchived(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:showArchived?"#F5F4F0":"transparent",color:showArchived?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:showArchived?500:400,transition:"background .12s ease"}}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{color:showArchived?"#1A1A1E":"#6B6E7E"}}><rect x="1" y="2.5" width="12" height="3" rx="0.8" stroke="currentColor" strokeWidth="1"/><rect x="2" y="5.5" width="10" height="7" rx="0.8" stroke="currentColor" strokeWidth="1"/></svg>
                    <span style={{flex:1}}>Archivés</span>
                    <span style={{fontSize:11,color:showArchived?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{emails.filter(m=>m.archived).length||""}</span>
                  </button>
                  {/* Envoyés */}
                  <button onClick={()=>{setMailFilter("envoyes");setShowArchived(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:mailFilter==="envoyes"&&!showArchived?"#F5F4F0":"transparent",color:mailFilter==="envoyes"&&!showArchived?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:mailFilter==="envoyes"&&!showArchived?500:400,transition:"background .12s ease"}}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{color:mailFilter==="envoyes"&&!showArchived?"#1A1A1E":"#6B6E7E"}}><path d="M1 7L13 1L9.5 13L7 8L1 7z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
                    <span style={{flex:1}}>Envoyés</span>
                  </button>
                  {/* Brouillons */}
                  <button onClick={()=>{setMailFilter("brouillons");setShowArchived(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 11px",borderRadius:8,border:"none",background:mailFilter==="brouillons"&&!showArchived?"#F5F4F0":"transparent",color:mailFilter==="brouillons"&&!showArchived?"#1A1A1E":"#4A4A52",fontSize:12.5,textAlign:"left",cursor:"pointer",marginBottom:2,fontFamily:"'Geist','system-ui',sans-serif",fontWeight:mailFilter==="brouillons"&&!showArchived?500:400,transition:"background .12s ease"}}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{color:mailFilter==="brouillons"&&!showArchived?"#1A1A1E":"#6B6E7E"}}><path d="M2 11l1-3 7-7 2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 3l2 2" stroke="currentColor" strokeWidth="1.1"/></svg>
                    <span style={{flex:1}}>Brouillons</span>
                    <span style={{fontSize:11,color:localDrafts.length>0?"#B8924F":"#A5A4A0",fontVariantNumeric:"tabular-nums"}}>{localDrafts.length||""}</span>
                  </button>
                  {/* 3 — Filtres par tag personnalisé */}
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

            {/* ══ VUE RADAR ARCHANGE ══ */}
            {mailFilter==="priorites" && (
              <div style={{flex:sel?undefined:1,width:sel?560:undefined,display:"flex",overflow:"hidden",flexShrink:0}}>

                {/* ── Panel gauche — liste des cartes ── */}
                <div style={{flex:1,overflowY:"auto",background:"#F5F4F0",padding:"20px 20px",borderRight:sel?"1px solid #EBEAE5":"none"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                    <div>
                      <div style={{fontSize:18,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",letterSpacing:"0.01em"}}>Radar ARCHANGE</div>
                      <div style={{fontSize:12,color:"#6B6E7E",marginTop:2}}>{prioritesArchange.length} demande{prioritesArchange.length!==1?"s":""} en attente</div>
                    </div>
                  </div>

                  {prioritesArchange.length===0?(
                    <div style={{textAlign:"center",padding:"60px 24px",color:"#6B6E7E"}}>
                      <div style={{fontSize:36,marginBottom:12}}>◆</div>
                      <div style={{fontSize:14,color:"#1A1A1E",marginBottom:6}}>Aucune demande en attente</div>
                      <div style={{fontSize:12}}>Les demandes de réservation détectées par l'IA apparaîtront ici</div>
                    </div>
                  ):(()=>{
                    let lastType: string|null = null;
                    const sectionLabels: Record<string,string> = {
                      rouge: "Urgences",
                      or: "Leads confirmés",
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

                      const nom = ext.nom || m.from || "—";
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
                      const statutLabel = hasResa ? "Réservation créée" : hasDraft ? "Réponse rédigée" : "Nouveau";
                      const statutBg = hasResa ? "#D1FAE5" : hasDraft ? "#DBEAFE" : "#F1EFE8";
                      const statutCol = hasResa ? "#3F5B32" : hasDraft ? "#1D4ED8" : "#5F5E5A";

                      const today = new Date(); today.setHours(0,0,0,0);
                      let badgeLabel = isRouge ? (dateStr && new Date(dateStr+"T12:00:00") < new Date(today.getTime()+2*86400000) ? "⚡ Demain" : "⚡ Urgent") : isOr ? `💰 ${budget}` : "Nouveau";
                      if(isRouge && (m.flags||[]).includes("flag")) badgeLabel = "⚡ Relance";

                      const cells: [string,string][] = [
                        ["Type", type_evt||"—"],
                        ["Date", dateStr ? fmtDateFr(dateStr) : "—"],
                        ["Personnes", nbPers ? `${nbPers} pers.` : "—"],
                        ["Budget", budget||"—"],
                        ...(heureDebut ? [["Horaires", heureDebut+(heureFin?` → ${heureFin}`:"")]] : [["Horaires","—"]]),
                        ...(espaceNom ? [["Espace", espaceNom]] : [["Espace","—"]]),
                      ];

                      return (
                        <div key={m.id}>
                          {showSection&&<div style={{fontSize:10,fontWeight:500,color:"#6B6E7E",letterSpacing:"0.1em",textTransform:"uppercase",margin:idx===0?"0 0 10px":"20px 0 10px"}}>{sectionLabels[type]}</div>}
                          <div
                            onClick={()=>{
                              // Fix 8 — Ouvrir le lecteur complet à droite du Radar (split view)
                              // handleSel charge le corps et marque lu, sans naviguer ailleurs
                              setMailOrigine({type:'radar', resaId: resa?.id||'', nom: 'Radar ARCHANGE'});
                              setRadarReplyModal(null); setRadarReplyText("");
                              handleSel(m);
                            }}
                            style={{background:"#FFFFFF",borderRadius:12,border:`1.5px solid ${borderCol}`,overflow:"hidden",marginBottom:8,boxShadow:isSelected?"0 0 0 3px rgba(184,146,79,0.2)":isHovered?"0 4px 16px rgba(0,0,0,.08)":"none",transition:"box-shadow .15s, border-color .15s",cursor:"pointer"}}
                            onMouseEnter={()=>setRadarHoverId(m.id)}
                            onMouseLeave={()=>setRadarHoverId(null)}>

                            {/* Header — nom, email, téléphone */}
                            <div style={{padding:"10px 14px",background:headerBg,display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:34,height:34,borderRadius:"50%",background:avBg,color:avCol,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,flexShrink:0}}>{initiales}</div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,fontWeight:600,color:nameCol,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nom}{entreprise?` — ${entreprise}`:""}</div>
                                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2,flexWrap:"wrap"}}>
                                  <span style={{fontSize:11,color:contactCol}}>{m.fromEmail}</span>
                                  {telephone&&<span style={{fontSize:11,color:contactCol,display:"flex",alignItems:"center",gap:3}}>· 📞 {telephone}</span>}
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
                                  <div style={{fontSize:10,color:"#6B6E7E",marginBottom:2}}>{lbl}</div>
                                  <div style={{fontSize:12,fontWeight:val==="—"?400:500,color:val==="—"?"#C5C3BE":"#1A1A1E",fontStyle:val==="—"?"italic":"normal"}}>{val}</div>
                                </div>
                              ))}
                            </div>

                            {resume && (
                              <div style={{padding:"8px 14px",borderTop:"0.5px solid #EBEAE5",background:"#FFFFFF"}}>
                                <div style={{fontSize:12,color:"#6B6E7E",fontStyle:"italic",lineHeight:1.6}}>{resume}</div>
                              </div>
                            )}

                            <div style={{padding:"8px 12px",borderTop:"0.5px solid #EBEAE5",display:"flex",alignItems:"center",gap:6,background:"#FAFAF9"}}>
                              <button onClick={e=>{e.stopPropagation(); setRadarResaModal({ nom: ext.nom||m.from||"", email: ext.email||m.fromEmail||"", telephone: ext.telephone||"", entreprise: ext.entreprise||"", typeEvenement: ext.typeEvenement||"", nombrePersonnes: ext.nombrePersonnes||"", espaceId: ext.espaceDetecte||resa?.espaceId||espacesDyn[0]?.id||"", dateDebut: ext.dateDebut||resa?.dateDebut||"", heureDebut: ext.heureDebut||resa?.heureDebut||"", heureFin: ext.heureFin||resa?.heureFin||"", budget: ext.budget||resa?.budget||"", notes: ext.notes||"", statut: ext.statutSuggere||"nouveau", _emailId: m.id, });}} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",fontSize:11,fontWeight:500,cursor:"pointer"}}>
                                📅 Créer réservation
                              </button>
                              <button onClick={e=>{e.stopPropagation();
                                // Ouvrir le lecteur complet (panel droit) plutôt qu'une modale séparée
                                // genererReponse sera accessible depuis le lecteur avec tout le contexte
                                setMailOrigine({type:'radar', resaId: resa?.id||'', nom: 'Radar ARCHANGE'});
                                handleSel(m);
                                setRadarSelEmail(m);
                              }} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",fontSize:11,fontWeight:500,cursor:"pointer"}}>
                                ✨ Générer réponse
                              </button>
                              <button onClick={e=>{e.stopPropagation(); saveRadarTraites(new Set([...radarTraites,m.id])); toast("Demande archivée du Radar");}} style={{marginLeft:"auto",padding:"5px 11px",borderRadius:7,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",fontSize:11,cursor:"pointer"}} title="Archiver cette carte">
                                ✓ Traité
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* ── Panel droit — lecteur email (même rendu que la boîte mail, via sel) ── */}
                {/* Lecteur standard partagé — affiché via la zone ci-dessous */}
              </div>
            )}

            {/* Liste emails standard */}
            {mailFilter!=="priorites" && (
            <div style={{width:330,borderRight:"1px solid #EBEAE5",background:"#F5F4F0",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>

              {/* ── Vues Envoyés / Brouillons ── */}
              {(mailFilter==="envoyes"||mailFilter==="brouillons")&&(
                <div style={{flex:1,overflowY:"auto"}}>
                  <div style={{padding:"16px 18px 10px",borderBottom:"1px solid #EBEAE5"}}>
                    <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:22,fontWeight:500,color:"#1A1A1E"}}>
                      {mailFilter==="envoyes"?"Envoyés":"Brouillons"}
                    </div>
                  </div>
                  {(mailFilter==="envoyes"?sentList:draftList).length===0&&(
                    <div style={{padding:"40px 16px",textAlign:"center",color:"#6B6E7E",fontSize:12}}>
                      {mailFilter==="envoyes"?"Aucun email envoyé depuis ARCHANGE":"Aucun brouillon sauvegardé"}
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
                        <button onClick={e=>{e.stopPropagation();const d=em as any;setComposeTo(d.to);setComposeSubject(d.subject);setComposeBody(d.body);setShowCompose(true);setLocalDrafts(prev=>prev.filter(x=>x.id!==d.id));}} style={{marginTop:6,fontSize:10,padding:"3px 10px",borderRadius:2,border:"1px solid #B8924F",background:"transparent",color:"#B8924F",cursor:"pointer",letterSpacing:"0.04em"}}>Reprendre →</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Vue standard ── */}
              {mailFilter!=="envoyes"&&mailFilter!=="brouillons"&&<>
              {/* Header liste */}
              <div style={{padding:"16px 18px 10px",borderBottom:"1px solid #EBEAE5",flexShrink:0}}>
                <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:12}}>
                  <h2 style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:22,fontWeight:500,letterSpacing:"-0.2px",color:"#1A1A1E",margin:0}}>
                    {showArchived?"Archives":mailFilter==="nonlus"?"Non lus":mailFilter==="atraiter"?"À traiter":mailFilter==="star"?"Favoris":mailFilter==="flag"?"Flaggés":"Réception"}
                  </h2>
                  <span style={{fontSize:10,letterSpacing:"1.2px",textTransform:"uppercase",color:"#6B6E7E",fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic"}}>{filtered.length} message{filtered.length!==1?"s":""}</span>
                </div>
                {/* Recherche style Céleste */}
                <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 10px",background:"#FAFAF7",border:"1px solid #EBEAE5",borderRadius:2,marginBottom:search&&filtered.length===0?4:8}}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#6B6E7E" strokeWidth="1.3"><circle cx="5" cy="5" r="3.5"/><path d="M8 8l3 3"/></svg>
                  <input value={search} onChange={e=>{setSearch(e.target.value);setDeepResults([]);}} placeholder="Rechercher un contact, une date…" style={{border:"none",background:"transparent",outline:"none",fontSize:12,color:"#1A1A1E",width:"100%",fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic"}}/>
                  {search&&<button onClick={()=>{setSearch("");setDeepResults([]);}} style={{background:"none",border:"none",color:"#6B6E7E",cursor:"pointer",fontSize:13,padding:0}}>×</button>}
                </div>
                {/* Proposition recherche approfondie Gmail */}
                {search&&filtered.length===0&&deepResults.length===0&&!deepSearching&&(
                  <div style={{padding:"6px 0 8px",display:"flex",alignItems:"center",gap:6}}>
                    <button onClick={()=>lancerDeepSearch(search)} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,padding:"4px 10px",borderRadius:2,border:"1px solid #EBEAE5",background:"transparent",color:"#B8924F",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif"}}>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#B8924F" strokeWidth="1.3"><circle cx="5" cy="5" r="3.5"/><path d="M8 8l3 3"/></svg>
                      Chercher dans tout Gmail
                    </button>
                  </div>
                )}
                {deepSearching&&(
                  <div style={{padding:"6px 0 8px",display:"flex",alignItems:"center",gap:6}}>
                    <Spin s={10}/>
                    <span style={{fontSize:10,color:"#6B6E7E",fontFamily:"'Geist','system-ui',sans-serif",fontStyle:"italic"}}>Recherche dans tous vos emails…</span>
                  </div>
                )}
                {/* Contrôles */}
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <select value={sortOrder} onChange={e=>setSortOrder(e.target.value as any)} style={{fontSize:10,border:"1px solid #EBEAE5",borderRadius:2,padding:"3px 6px",background:"#F5F4F0",color:"#6B6E7E",cursor:"pointer",flex:1,fontFamily:"'Geist','system-ui',sans-serif"}}>
                    <option value="date_desc">↓ Plus récents</option>
                    <option value="date_asc">↑ Plus anciens</option>
                    <option value="from">A→Z Expéditeur</option>
                    <option value="subject">A→Z Objet</option>
                  </select>
                  <button onClick={()=>setShowArchived(v=>!v)} style={{fontSize:10,padding:"3px 8px",borderRadius:2,border:`1px solid ${showArchived?"#B8924F":"#EBEAE5"}`,background:showArchived?"rgba(184,146,79,0.1)":"transparent",color:showArchived?"#B8924F":"#6B6E7E",cursor:"pointer",whiteSpace:"nowrap"}}>📦</button>
                  <button onClick={selectedIds.size>0?clearSelection:selectAll} style={{fontSize:10,padding:"3px 8px",borderRadius:2,border:`1px solid ${selectedIds.size>0?"#7BA8C4":"#EBEAE5"}`,background:selectedIds.size>0?"rgba(123,168,196,0.1)":"transparent",color:selectedIds.size>0?"#3B6FCC":"#6B6E7E",cursor:"pointer",whiteSpace:"nowrap"}}>
                    {selectedIds.size>0?`✓ ${selectedIds.size}`:"Tous"}
                  </button>
                </div>
                {selectedIds.size>0&&(
                  <div style={{display:"flex",gap:4,paddingTop:6,flexWrap:"wrap"}}>
                    <button onClick={bulkMarkRead} style={{fontSize:10,padding:"2px 7px",borderRadius:2,border:"1px solid #EBEAE5",background:"#F5F4F0",color:"#4A4A52",cursor:"pointer"}}>● Lu</button>
                    <button onClick={bulkMarkUnread} style={{fontSize:10,padding:"2px 7px",borderRadius:2,border:"1px solid #EBEAE5",background:"#F5F4F0",color:"#4A4A52",cursor:"pointer"}}>○ Non lu</button>
                    <button onClick={bulkATraiter} style={{fontSize:10,padding:"2px 7px",borderRadius:2,border:"1px solid #EBEAE5",background:"#F5F4F0",color:"#4A4A52",cursor:"pointer"}}>📋</button>
                    <button onClick={bulkArchive} style={{fontSize:10,padding:"2px 7px",borderRadius:2,border:"1px solid #EBEAE5",background:"#F5F4F0",color:"#4A4A52",cursor:"pointer"}}>📦</button>
                    <button onClick={bulkDelete} style={{fontSize:10,padding:"2px 7px",borderRadius:2,border:"1px solid #FCA5A5",background:"transparent",color:"#DC2626",cursor:"pointer"}}>✕</button>
                  </div>
                )}
              </div>
              <div ref={mailListRef} style={{flex:1,overflowY:"auto"}}>
                {filtered.length===0&&(
                  <div style={{padding:"32px 16px",textAlign:"center",color:"#6B6E7E"}}>
                    <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:32,marginBottom:8,opacity:.3}}>✦</div>
                    <div style={{fontSize:12,fontWeight:500,marginBottom:4}}>
                      {mailFilter==="nonlus"?"Aucun email non lu":mailFilter==="atraiter"?"Aucun email à traiter":mailFilter==="star"?"Aucun favori":mailFilter==="flag"?"Aucun email flaggé":search?"Aucun résultat":"Aucun email"}
                    </div>
                    {mailFilter!=="all"&&<button onClick={()=>{setMailFilter("all");setSearch("");}} style={{fontSize:11,color:"#B8924F",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Voir tous les mails</button>}
                  </div>
                )}
                {filtered.map(em=>{
                  // Tags Céleste : statut IA + espace + état fonctionnel
                  const ext = repliesCache[em.id]?.extracted;
                  const isActive = sel?.id===em.id;
                  const isSelected = selectedIds.has(em.id);
                  // Trouver le statut resa lié
                  const linkedResa = resas.find(r=>emailResaLinks[em.id]===r.id);
                  const linkedStatut = linkedResa ? (statuts.find(s=>s.id===(linkedResa.statut||"nouveau"))||statuts[0]) : null;
                  // Espace détecté
                  const detectedEspace = ext?.espaceDetecte ? espacesDyn.find(e=>e.id===ext.espaceDetecte) : null;

                  return (
                  <div key={em.id} className="mail-row celeste-email-item"
                    style={{position:"relative",margin:"2px 8px",borderRadius:10,cursor:"pointer",
                      background:isSelected?"#EEF2FF":isActive?"#FAFAF7":"transparent",
                      boxShadow:isActive?"0 1px 2px rgba(15,15,20,0.05), 0 0 0 1px rgba(184,146,79,0.18)":"none",
                      transition:"background .12s ease, box-shadow .12s ease"}}>
                    {/* Checkbox sélection */}
                    <div className="mail-checkbox" onClick={e=>{e.stopPropagation();toggleSelect(em.id);}} style={{position:"absolute",top:14,left:8,width:16,height:16,borderRadius:4,border:`1.5px solid ${isSelected?"#7BA8C4":"#E0DED7"}`,background:isSelected?"#7BA8C4":"transparent",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2,opacity:isSelected?1:0,transition:"opacity .1s",cursor:"pointer"}}>
                      {isSelected&&<span style={{color:"#fff",fontSize:10,lineHeight:1}}>✓</span>}
                    </div>
                    {/* Corps de la carte */}
                    <div onClick={()=>handleSel(em)} style={{padding:"14px 14px 12px 14px"}}>
                      {/* Ligne 1 — expéditeur + date */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3,gap:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                          {em.unread&&<div style={{width:6,height:6,borderRadius:"50%",background:"#B8924F",flexShrink:0}}/>}
                          <span style={{fontSize:13,fontWeight:em.unread?600:500,color:"#1A1A1E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",letterSpacing:"-0.005em"}}>{em.from||"(inconnu)"}</span>
                        </div>
                        <span style={{fontSize:11,color:"#6B6E7E",flexShrink:0,fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums"}}>{em.date}</span>
                      </div>
                      {/* Ligne 2 — objet en serif */}
                      <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14.5,fontWeight:em.unread?500:400,color:"#1A1A1E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:5,lineHeight:1.25,letterSpacing:"-0.01em"}}>{em.subject||"(sans objet)"}</div>
                      {/* Ligne 3 — snippet */}
                      <div style={{fontSize:12,color:"#6B6E7E",overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",lineHeight:1.5,marginBottom:9}}>{em.snippet}</div>
                      {/* Tags enrichis Céleste */}
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        {/* Statut resa */}
                        {linkedStatut&&(
                          <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"2px 9px",borderRadius:100,fontSize:10,letterSpacing:"0.04em",textTransform:"uppercase",color:"#4A4A52",background:"#F5F4F0",border:"1px solid #EBEAE5",fontWeight:500}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:linkedStatut.color,flexShrink:0}}/>
                            {linkedStatut.label}
                          </span>
                        )}
                        {/* Espace détecté */}
                        {detectedEspace&&(
                          <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"2px 9px",borderRadius:100,fontSize:10,letterSpacing:"0.04em",textTransform:"uppercase",color:"#4A4A52",background:"#F5F4F0",border:"1px solid #EBEAE5",fontWeight:500}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:detectedEspace.color,flexShrink:0}}/>
                            {detectedEspace.nom}
                          </span>
                        )}
                        {/* Personnes + type */}
                        {ext?.nombrePersonnes&&(
                          <span style={{fontSize:11,color:"#6B6E7E",fontFamily:"'Geist','system-ui',sans-serif",fontVariantNumeric:"tabular-nums"}}>
                            <strong style={{fontWeight:500,color:"#1A1A1E"}}>{ext.nombrePersonnes} pers.</strong>{ext.typeEvenement?` · ${ext.typeEvenement}`:""}
                          </span>
                        )}
                        {/* Flags fonctionnels */}
                        {em.aTraiter&&<span style={{fontSize:9.5,padding:"2px 8px",borderRadius:100,background:"rgba(184,146,79,0.1)",color:"#B8924F",border:"1px solid rgba(184,146,79,0.25)",letterSpacing:"0.05em",textTransform:"uppercase",fontWeight:600}}>À traiter</span>}
                        {(em.flags||[]).includes("star")&&<span style={{fontSize:12,color:"#B8924F"}}>✦</span>}
                        {em.snoozedUntil&&<span style={{fontSize:11,color:"#7C3AED"}}>⏰</span>}
                        {/* 5 — Indicateur brouillon de réponse en cours */}
                        {(()=>{try{return localStorage.getItem(`draft_reply_${em.id}`);}catch{return null;}})()&&<span style={{fontSize:9.5,padding:"2px 8px",borderRadius:100,background:"#EFF6FF",color:"#3B82F6",border:"1px solid #BFDBFE",letterSpacing:"0.04em",textTransform:"uppercase",fontWeight:600}}>Brouillon</span>}
                        {/* 3 — Badges tags personnalisés */}
                        {(emailTags[em.id]||[]).map((tid:string)=>{const t=customTags.find(x=>x.id===tid);return t?<span key={tid} style={{fontSize:9.5,padding:"2px 8px",borderRadius:100,background:t.color+"1A",color:t.color,border:`1px solid ${t.color}40`,fontWeight:600,letterSpacing:"0.03em"}}>{t.label}</span>:null;})}
                      </div>
                    </div>
                    {/* Barre d'actions au survol */}
                    <div className="mail-actions" style={{display:"flex",gap:2,opacity:0,transition:"opacity .15s",borderTop:"1px solid #EBEAE5",padding:"4px 10px",background:isActive?"rgba(245,244,240,0.6)":"rgba(250,250,247,0.6)",justifyContent:"flex-end",alignItems:"center",borderRadius:"0 0 10px 10px"}}>
                      <button onClick={e=>{e.stopPropagation();toggleFlag(em.id,"star");}} title="Favori" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:(em.flags||[]).includes("star")?1:0.4,padding:"4px 6px",borderRadius:6}}>✦</button>
                      <button onClick={e=>{e.stopPropagation();toggleATraiter(em.id);}} title="À traiter" style={{background:"none",border:"none",cursor:"pointer",fontSize:12,opacity:em.aTraiter?1:0.4,padding:"4px 6px",borderRadius:6}}>📋</button>
                      <button onClick={e=>{e.stopPropagation();toggleUnread(em.id);}} title="Lu/Non lu" style={{background:"none",border:"none",cursor:"pointer",fontSize:11,opacity:0.45,padding:"4px 6px",borderRadius:6,color:"#1A1A1E"}}>●</button>
                      <button onClick={e=>{e.stopPropagation();archiveEmail(em.id);}} title="Archiver" style={{background:"none",border:"none",cursor:"pointer",fontSize:12,opacity:0.55,padding:"4px 6px",borderRadius:6}}>📦</button>
                      <div style={{position:"relative"}} className="snooze-wrap">
                        <button onClick={e=>{e.stopPropagation(); const el=e.currentTarget.nextElementSibling as HTMLElement; if(el) el.style.display=el.style.display==="block"?"none":"block";}} title="Reporter" style={{background:"none",border:"none",cursor:"pointer",fontSize:12,opacity:0.55,padding:"4px 6px",borderRadius:6}}>⏰</button>
                        <div className="snooze-menu" style={{display:"none",position:"absolute",bottom:"100%",right:0,background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:8,boxShadow:"0 4px 16px rgba(15,15,20,0.08)",zIndex:100,minWidth:150,padding:5}}>
                          {[{label:"Dans 1 heure",hours:1},{label:"Ce soir 18h",tonight:18},{label:"Demain matin",days:1},{label:"Dans 3 jours",days:3},{label:"Dans 1 semaine",days:7}].map(opt=>{
                            const d = new Date();
                            if(opt.hours) d.setHours(d.getHours()+opt.hours);
                            else if(opt.tonight) { d.setDate(d.getDate()+(d.getHours()>=opt.tonight?1:0)); d.setHours(opt.tonight,0,0,0); }
                            else if(opt.days) { d.setDate(d.getDate()+opt.days); d.setHours(8,0,0,0); }
                            return <button key={opt.label} onClick={e=>{e.stopPropagation();snoozeEmail(em.id,d.toISOString());}} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 11px",fontSize:12,color:"#4A4A52",background:"none",border:"none",cursor:"pointer",borderRadius:5}}>{opt.label}</button>;
                          })}
                        </div>
                      </div>
                      <div style={{flex:1}}/>
                      <button onClick={e=>{e.stopPropagation();deleteEmailWithUndo(em);}} title="Supprimer" style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#A84B45",padding:"4px 7px",borderRadius:6,opacity:0.75}}>✕</button>
                    </div>
                  </div>
                );})}

                {/* ── Fix #4 — Charger plus d'emails ── */}
                {!search && emails.length > 0 && emails.length % 100 === 0 && (
                  <div style={{padding:"12px 16px",textAlign:"center",borderTop:"1px solid #EBEAE5"}}>
                    <button
                      onClick={chargerPlusEmails}
                      disabled={loadingMore}
                      style={{fontSize:11,padding:"6px 18px",borderRadius:2,border:"1px solid #EBEAE5",background:"transparent",color:"#B8924F",cursor:loadingMore?"wait":"pointer",display:"inline-flex",alignItems:"center",gap:6,fontFamily:"'Geist','system-ui',sans-serif",letterSpacing:"0.04em"}}
                    >
                      {loadingMore ? <><Spin s={10}/> Chargement…</> : `↓ Charger plus (${emails.length} chargés)`}
                    </button>
                  </div>
                )}
                {/* ── Résultats recherche approfondie Gmail ── */}
                {deepResults.length>0&&(
                  <>
                    <div style={{padding:"8px 14px 4px",display:"flex",alignItems:"center",gap:6,borderTop:"1px solid #EBEAE5",marginTop:4}}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#B8924F" strokeWidth="1.3"><circle cx="5" cy="5" r="3.5"/><path d="M8 8l3 3"/></svg>
                      <span style={{fontSize:10,color:"#B8924F",fontWeight:500,letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>RÉSULTATS GMAIL ({deepResults.length})</span>
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

            {/* Zone lecture — Céleste */}
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
                  <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:15,fontStyle:"italic",color:"#6B6E7E"}}>Sélectionnez un email</div>
                </div>
              ) : (
                <div style={{maxWidth:720,margin:"0 auto",padding:"20px 28px 80px"}}>

                  {/* ── Fil d'Ariane retour événement ou Radar ── */}
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
                        {mailOrigine.type==="radar" ? "← Retour au Radar" : `Retour à ${mailOrigine.nom}`}
                      </button>
                    </div>
                  )}

                  {/* ── Barre d'actions Reader v3 — icon buttons sobres ── */}
                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:0,padding:"10px 18px",background:"rgba(255,255,255,0.72)",backdropFilter:"saturate(180%) blur(8px)",WebkitBackdropFilter:"saturate(180%) blur(8px)",borderBottom:"1px solid #EBEAE5",flexWrap:"wrap"}}>
                    {/* Action principale : Répondre */}
                    <button onClick={()=>openReplyEditor("reply")} title="Répondre (R)" style={{fontSize:13,padding:"7px 13px",borderRadius:8,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",cursor:"pointer",fontWeight:500,display:"inline-flex",alignItems:"center",gap:7,letterSpacing:"-0.005em",fontFamily:"'Geist','system-ui',sans-serif",transition:"all .14s ease"}}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M12 10L8 6l4-4M2 2v4a3 3 0 003 3h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Répondre
                    </button>
                    {sel.cc?.length>0&&(
                      <button onClick={()=>openReplyEditor("replyAll")} title="Répondre à tous" style={{fontSize:12,padding:"7px 11px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,transition:"all .14s ease"}}>À tous</button>
                    )}
                    <button onClick={()=>openReplyEditor("forward")} title="Transférer" style={{fontSize:12,padding:"7px 11px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,display:"inline-flex",alignItems:"center",gap:5,transition:"all .14s ease"}}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 10l4-4L2 2M12 2v4a3 3 0 01-3 3H3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Transférer
                    </button>
                    {/* C1 — Raccourci + Planning si l'IA a détecté une réservation */}
                    {extracted?.isReservation && !emailResaLinks[sel.id] && (
                      <button onClick={openPlanForm} title="Créer un événement pré-rempli par ARCHANGE" style={{fontSize:12,padding:"7px 11px",borderRadius:8,border:"1px solid rgba(184,146,79,0.4)",background:"rgba(184,146,79,0.08)",color:"#B8924F",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,display:"inline-flex",alignItems:"center",gap:5,transition:"all .14s ease"}}>
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1.5 5.5h11M4.5 1v2.5M9.5 1v2.5M7 8v3M5.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                        Planning
                      </button>
                    )}
                    {extracted?.isReservation && emailResaLinks[sel.id] && (
                      <button onClick={()=>{const r=resas.find(x=>x.id===emailResaLinks[sel.id]);if(r){setSelResaGeneral(r);setView("general");}}} title="Ouvrir l'événement lié" style={{fontSize:12,padding:"7px 11px",borderRadius:8,border:"1px solid rgba(107,138,91,0.35)",background:"rgba(107,138,91,0.08)",color:"#3F5B32",cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,display:"inline-flex",alignItems:"center",gap:5,transition:"all .14s ease"}}>
                        <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Événement lié
                      </button>
                    )}
                    <div style={{width:1,height:20,background:"#EBEAE5",margin:"0 4px"}}/>
                    {/* Toggles d'état — icon buttons 30x30 */}
                    <button onClick={()=>toggleFlag(sel.id,"star")} title={(sel.flags||[]).includes("star")?"Retirer des favoris":"Ajouter aux favoris"} style={{width:30,height:30,borderRadius:6,border:"none",background:"transparent",color:(sel.flags||[]).includes("star")?"#B8924F":"#A5A4A0",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease, color .12s ease"}}>✦</button>
                    <button onClick={()=>toggleUnread(sel.id)} title={sel.unread?"Marquer comme lu":"Marquer comme non lu"} style={{width:30,height:30,borderRadius:6,border:"none",background:sel.unread?"rgba(184,146,79,0.1)":"transparent",color:sel.unread?"#B8924F":"#A5A4A0",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>●</button>
                    <button onClick={()=>toggleATraiter(sel.id)} title={sel.aTraiter?"Retirer de À traiter":"Marquer À traiter"} style={{width:30,height:30,borderRadius:6,border:"none",background:sel.aTraiter?"rgba(184,146,79,0.1)":"transparent",color:sel.aTraiter?"#B8924F":"#6B6E7E",cursor:"pointer",fontSize:13,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>📋</button>
                    <button onClick={()=>archiveEmail(sel.id)} title={sel.archived?"Archivé":"Archiver"} style={{width:30,height:30,borderRadius:6,border:"none",background:"transparent",color:sel.archived?"#B8924F":"#6B6E7E",cursor:"pointer",fontSize:13,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>📦</button>
                    <div style={{flex:1}}/>
                    {/* 3 — Bouton tag personnalisé */}
                    <div style={{position:"relative"}}>
                      <button onClick={()=>setShowTagMenu(showTagMenu===sel.id?null:sel.id)} title="Tags" style={{width:30,height:30,borderRadius:6,border:"none",background:showTagMenu===sel.id?"rgba(184,146,79,0.1)":"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:13,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>🏷️</button>
                      {showTagMenu===sel.id&&(
                        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:300,background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:10,boxShadow:"0 8px 24px rgba(15,15,20,0.10)",minWidth:200,padding:8}}>
                          {customTags.length===0&&<div style={{fontSize:11.5,color:"#A5A4A0",padding:"6px 10px"}}>Aucun tag — créez-en dans Sources IA</div>}
                          {customTags.map(t=>{const applied=(emailTags[sel.id]||[]).includes(t.id);return(
                            <div key={t.id} onClick={()=>{const cur=emailTags[sel.id]||[];saveEmailTags({...emailTags,[sel.id]:applied?cur.filter((x:string)=>x!==t.id):[...cur,t.id]});}} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 10px",borderRadius:6,cursor:"pointer",background:applied?"rgba(184,146,79,0.08)":"transparent",transition:"background .12s ease"}}>
                              <span style={{width:10,height:10,borderRadius:"50%",background:t.color,flexShrink:0,boxShadow:applied?"0 0 0 2px #1A1A1E":undefined}}/>
                              <span style={{fontSize:12.5,flex:1,color:"#1A1A1E"}}>{t.label}</span>
                              {applied&&<span style={{fontSize:11,color:"#B8924F"}}>✓</span>}
                            </div>);
                          })}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>deleteEmailWithUndo(sel)} title="Supprimer" style={{width:30,height:30,borderRadius:6,border:"none",background:"transparent",color:"#A84B45",cursor:"pointer",fontSize:13,display:"inline-flex",alignItems:"center",justifyContent:"center",opacity:0.75,transition:"background .12s ease, opacity .12s ease"}}>✕</button>
                  </div>

                  {/* ── En-tête éditorial Reader v3 — sujet display ── */}
                  <div style={{padding:"24px 32px 20px",borderBottom:"1px solid #EBEAE5"}}>
                    {(()=>{const ext=repliesCache[sel.id]?.extracted; return ext&&(
                      <div style={{fontSize:10.5,letterSpacing:"0.08em",textTransform:"uppercase",color:"#B8924F",marginBottom:10,fontWeight:500,display:"flex",alignItems:"center",gap:8,fontFamily:"'Geist','system-ui',sans-serif"}}>
                        {ext.statutSuggere&&<span>{ext.statutSuggere.replace(/_/g," ")}</span>}
                        {ext.typeEvenement&&<><span style={{color:"#E0DED7"}}>·</span><span>{ext.typeEvenement}</span></>}
                        {ext.nombrePersonnes&&<><span style={{color:"#E0DED7"}}>·</span><span style={{fontVariantNumeric:"tabular-nums"}}>{ext.nombrePersonnes} personnes</span></>}
                      </div>
                    );})()}
                    {/* Sujet en grand */}
                    <h1 style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:28,fontWeight:400,letterSpacing:"-0.02em",lineHeight:1.2,color:"#1A1A1E",margin:"0 0 14px",wordBreak:"break-word"}}>{sel.subject||"(sans objet)"}</h1>
                    {/* Ligne expéditeur */}
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

                  {/* ── Corps email — Reader v3 ── */}
                  {/* 1a — Bandeau résumé IA ARCHANGE (si extraction dispo et isReservation) */}
                  {(()=>{const ext=repliesCache[sel.id]?.extracted; return ext?.isReservation&&ext?.resume&&(
                    <div style={{margin:"18px 32px 0",padding:"12px 16px",background:"rgba(107,138,91,0.06)",border:"1px solid rgba(107,138,91,0.18)",borderRadius:10,display:"flex",gap:10,alignItems:"flex-start"}}>
                      <span style={{fontSize:13,flexShrink:0,marginTop:1,color:"#3F5B32"}}>✦</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,fontWeight:500,color:"#3F5B32",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3,fontFamily:"'Geist','system-ui',sans-serif"}}>Résumé ARCHANGE</div>
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

                    {/* Pièces jointes */}
                    {(sel.attachments||[]).length > 0 && (
                      <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid #EBEAE5"}}>
                        <div style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"#6B6E7E",marginBottom:8,fontFamily:"'Geist','system-ui',sans-serif"}}>Pièces jointes · {sel.attachments.length}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                          {sel.attachments.map((att: any, i: number) => {
                            const ext = (att.filename||att.name||"").split(".").pop()?.toLowerCase() || "";
                            const icons: Record<string,string> = {pdf:"📄",doc:"📝",docx:"📝",xls:"📊",xlsx:"📊",ppt:"📋",pptx:"📋",jpg:"🖼",jpeg:"🖼",png:"🖼",gif:"🖼",webp:"🖼",zip:"🗜",csv:"📊",txt:"📃"};
                            const icon = icons[ext] || "📎";
                            const size = att.size ? (att.size > 1048576 ? (att.size/1048576).toFixed(1)+" Mo" : Math.round(att.size/1024)+" Ko") : "";
                            return (
                              <div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 10px",background:"#FAFAF7",borderRadius:2,border:"1px solid #EBEAE5",cursor:"pointer"}} onClick={async()=>{
                                if (att.id && sel?.gmailId) {
                                  // Téléchargement via /api/gmail/attachment
                                  try {
                                    const url = `/api/gmail/attachment?gmailId=${encodeURIComponent(sel.gmailId)}&attachmentId=${encodeURIComponent(att.id)}&filename=${encodeURIComponent(att.filename||att.name||"attachment")}`;
                                    const a = document.createElement("a");
                                    a.href = url; a.download = att.filename||att.name||"attachment";
                                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                  } catch { toast("Erreur téléchargement", "err"); }
                                } else if (att.url) {
                                  window.open(att.url, "_blank");
                                }
                              }}>
                                <span style={{fontSize:14}}>{icon}</span>
                                <div>
                                  <div style={{fontSize:11,fontWeight:500,color:"#1A1A1E",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{att.filename||att.name||"Pièce jointe"}</div>
                                  {size&&<div style={{fontSize:9.5,color:"#6B6E7E"}}>{size}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Encart Lecture par Archange — v3 Apple Mail 2026 ── */}
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
                        {/* En-tête — Réservation détectée + confiance en bars */}
                        <div style={{padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid rgba(107,138,91,0.15)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:10.5,fontWeight:500,color:"#3F5B32",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Geist','system-ui',sans-serif"}}>
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="2.5" width="12" height="10" rx="1.2" stroke="#3F5B32" strokeWidth="1.1"/><path d="M1 6h12M4.5 1v2.5M9.5 1v2.5" stroke="#3F5B32" strokeWidth="1.1" strokeLinecap="round"/></svg>
                            Réservation détectée
                          </div>
                          {extracted.confiance&&(()=>{
                            const conf = extracted.confiance;
                            const isHaute = conf === "haute";
                            const isFaible = conf === "faible";
                            const nbBars = isHaute ? 4 : isFaible ? 2 : 3;
                            const barColor = isFaible ? "#A84B45" : "#6B8A5B";
                            const tip = isFaible
                              ? "ARCHANGE a extrait ces informations avec incertitude. Vérifiez chaque champ avant de créer l'événement."
                              : isHaute
                              ? "ARCHANGE a extrait ces informations avec une bonne certitude."
                              : "ARCHANGE a extrait ces informations partiellement. Vérifiez les champs importants.";
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
                        {/* Grille infos — 3 colonnes aérées */}
                        <div style={{padding:"18px 22px",display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:"14px 20px"}}>
                          {extracted.nom&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Client</span>
                              <span style={valueStyle}>{extracted.nom}{extracted.entreprise?` — ${extracted.entreprise}`:""}</span>
                            </div>
                          )}
                          {extracted.typeEvenement&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Événement</span>
                              <span style={valueStyle}>{extracted.typeEvenement}</span>
                            </div>
                          )}
                          {extracted.nombrePersonnes&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Convives</span>
                              <span style={valueStyle}>{extracted.nombrePersonnesMin&&extracted.nombrePersonnesMin!==extracted.nombrePersonnes?`${extracted.nombrePersonnesMin}–${extracted.nombrePersonnes}`:extracted.nombrePersonnes} personnes</span>
                            </div>
                          )}
                          {extracted.dateDebut&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Date</span>
                              <span style={valueStyle}>{extracted.dateDebut}{extracted.heureDebut?` · ${extracted.heureDebut}${extracted.heureFin?` → ${extracted.heureFin}`:""}`:""}</span>
                            </div>
                          )}
                          {espace&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Espace suggéré</span>
                              <span style={{...valueStyle,color:"#B8924F"}}>{espace.nom} · disponible</span>
                            </div>
                          )}
                          {extracted.budget&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span style={labelStyle}>Budget</span>
                              <span style={valueStyle}>{extracted.budget}</span>
                            </div>
                          )}
                        </div>
                        {/* Footer — action unique "Ajouter au planning" */}
                        <div style={{padding:"14px 18px",borderTop:"1px solid rgba(107,138,91,0.12)",background:"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",gap:10}}>
                          {!alreadyIn&&(
                            <button onClick={openPlanForm} style={{padding:"9px 14px",borderRadius:10,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,letterSpacing:"-0.005em",transition:"all .14s ease"}}>
                              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1.5 5.5h11M4.5 1v2.5M9.5 1v2.5M7 8v3M5.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                              Ajouter au planning
                            </button>
                          )}
                          {alreadyIn&&(
                            <button onClick={()=>{setSelResaGeneral(alreadyIn);setView("general");}} style={{padding:"9px 14px",borderRadius:10,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,transition:"all .14s ease"}}>
                              Voir l'événement →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Formulaire planning */}
                  {showPlanForm && (
                    <div style={{background:"#FFFFFF",border:"1px solid #EBEAE5",borderRadius:14,padding:"20px",marginBottom:16}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",letterSpacing:"-0.01em"}}>📅 Ajouter au planning</div>
                        <button onClick={()=>setShowPlanForm(false)} style={{background:"none",border:"none",color:"#6B6E7E",cursor:"pointer",fontSize:18}}>×</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                        {/* Champs obligatoires */}
                        {[
                          ["dateDebut","📅 Date de l'événement *","date",true],
                          ["heureDebut","🕐 Heure de début *","time",true],
                          ["heureFin","🕕 Heure de fin *","time",true],
                        ].map(([k,l,type,required])=>(
                          <div key={k}>
                            <label style={{fontSize:11,color:planErrors[k]?"#DC2626":"#A5A4A0",display:"block",marginBottom:4,fontWeight:planErrors[k]?600:400}}>{l}</label>
                            {type==="date"?<DatePicker value={planForm[k]||""} onChange={v=>setPlanForm({...planForm,[k]:v})}/>:<TimePicker value={planForm[k]||""} onChange={v=>setPlanForm({...planForm,[k]:v})} placeholder={l.replace(" *","")}/>}
                            {planErrors[k]&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {planErrors[k]}</div>}
                          </div>
                        ))}
                        {/* Nombre de personnes — champ numérique libre */}
                        <div>
                          <label style={{fontSize:11,color:planErrors["nombrePersonnes"]?"#DC2626":"#A5A4A0",display:"block",marginBottom:4,fontWeight:planErrors["nombrePersonnes"]?600:400}}>👥 Nombre de personnes *</label>
                          <input type="number" min="1" value={planForm.nombrePersonnes||""} onChange={e=>setPlanForm({...planForm,nombrePersonnes:e.target.value})} placeholder="Ex: 50" style={{...inp}}/>
                          {planErrors["nombrePersonnes"]&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {planErrors["nombrePersonnes"]}</div>}
                        </div>
                        {/* Champs optionnels */}
                        <div>
                          <label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>🎉 Type d'événement</label>
                          <input value={planForm.typeEvenement||""} onChange={e=>setPlanForm({...planForm,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, Dîner…" style={{...inp}}/>
                        </div>
                        <div>
                          <label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>💰 Budget client</label>
                          <input value={planForm.budget||""} onChange={e=>setPlanForm({...planForm,budget:e.target.value})} placeholder="Ex: 5 000€, 45€/pers…" style={{...inp}}/>
                        </div>
                        <div>
                          <label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>📍 Espace</label>
                          <select value={planForm.espaceId||espacesDyn[0]?.id||""} onChange={e=>setPlanForm({...planForm,espaceId:e.target.value})} style={{...inp}}>{ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select>
                        </div>
                        <div style={{gridColumn:"1/-1"}}>
                          <label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>📝 Notes</label>
                          <input value={planForm.notes||""} onChange={e=>setPlanForm({...planForm,notes:e.target.value})} style={{...inp}}/>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:16}}>
                        <button onClick={submitPlanForm} style={{...gold,flex:1,padding:"10px"}}>Confirmer et ajouter</button>
                        <button onClick={()=>setShowPlanForm(false)} style={{...out}}>Annuler</button>
                      </div>
                    </div>
                  )}


                  {/* ── Éditeur de réponse manuelle Reader v3 ── */}
                  {showReplyEditor&&(
                    <div style={{background:"#FFFFFF",borderRadius:14,border:"1px solid #EBEAE5",overflow:"hidden",marginBottom:18,boxShadow:"0 1px 3px rgba(15,15,20,0.04)"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d={replyEditorMode==="forward"?"M2 10l4-4L2 2M12 2v4a3 3 0 01-3 3H3":"M12 10L8 6l4-4M2 2v4a3 3 0 003 3h6"} stroke="#1A1A1E" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          <span style={{fontSize:12,fontWeight:500,color:"#1A1A1E",fontFamily:"'Geist','system-ui',sans-serif",letterSpacing:"-0.005em"}}>
                            {replyEditorMode==="reply"?"Répondre":replyEditorMode==="replyAll"?"Répondre à tous":"Transférer"}
                          </span>
                        </div>
                        <button onClick={()=>{if(replyEditorText.trim()&&!window.confirm("Fermer ?"))return;setShowReplyEditor(false);setReplyEditorText("");}} title="Fermer" style={{width:28,height:28,borderRadius:6,border:"none",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:16,display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"background .12s ease"}}>×</button>
                      </div>
                      <div style={{padding:"10px 18px",borderBottom:"1px solid #EBEAE5",display:"flex",alignItems:"center",gap:9,background:"#FFFFFF"}}>
                        <span style={{fontSize:11,color:"#A5A4A0",fontWeight:500,flexShrink:0,fontFamily:"'Geist','system-ui',sans-serif"}}>À</span>
                        <input value={replyEditorTo} onChange={e=>setReplyEditorTo(e.target.value)} style={{flex:1,border:"none",outline:"none",fontSize:13,color:"#1A1A1E",background:"transparent",fontFamily:"'Geist','system-ui',sans-serif"}} placeholder="destinataire@exemple.com"/>
                      </div>
                      <textarea value={replyEditorText} onChange={e=>setReplyEditorText(e.target.value)} style={{width:"100%",minHeight:200,padding:"16px 18px",fontFamily:"'Geist','system-ui',sans-serif",fontSize:14,color:"#1A1A1E",lineHeight:1.65,border:"none",outline:"none",resize:"vertical",background:"transparent"}} placeholder="Votre réponse…" autoFocus/>
                      <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 18px",borderTop:"1px solid #EBEAE5",background:"#FAFAF7"}}>
                        <button onClick={sendReply} disabled={sending||!replyEditorTo.trim()||!replyEditorText.trim()} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",fontSize:13,fontWeight:500,cursor:sending?"wait":"pointer",display:"inline-flex",alignItems:"center",gap:6,opacity:sending||!replyEditorTo.trim()||!replyEditorText.trim()?0.5:1,letterSpacing:"-0.005em",fontFamily:"'Geist','system-ui',sans-serif",transition:"all .14s ease"}}>
                          {sending?<><Spin s={11}/> Envoi…</>:<><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 7L13 1L9.5 13L7 8L1 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> Envoyer</>}
                        </button>
                        <button onClick={saveDraft} style={{padding:"8px 13px",borderRadius:8,border:"1px solid #E0DED7",background:"#FFFFFF",color:"#1A1A1E",fontSize:12.5,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",fontWeight:500,transition:"all .14s ease"}}>Brouillon</button>
                        <div style={{flex:1}}/>
                        <button onClick={()=>{if(replyEditorText.trim()&&!window.confirm("Fermer ?"))return;setShowReplyEditor(false);setReplyEditorText("");}} style={{padding:"8px 12px",borderRadius:8,border:"none",background:"transparent",color:"#6B6E7E",fontSize:12.5,cursor:"pointer",fontFamily:"'Geist','system-ui',sans-serif",transition:"color .14s ease"}}>Annuler</button>
                      </div>
                    </div>
                  )}

                  {/* ── Réponse ARCHANGE Reader v3 — palette dorée subtile ── */}
                  <div style={{background:"linear-gradient(180deg, rgba(184,146,79,0.04) 0%, #FFFFFF 50%)",borderRadius:14,border:"1px solid rgba(184,146,79,0.22)",overflow:"hidden",boxShadow:"0 2px 6px rgba(184,146,79,0.06)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",borderBottom:"1px solid rgba(184,146,79,0.15)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14,color:"#B8924F",lineHeight:1}}>✦</span>
                        <span style={{fontSize:10.5,fontWeight:500,color:"#B8924F",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Geist','system-ui',sans-serif"}}>Réponse ARCHANGE</span>
                        {genReply&&<Spin s={11}/>}
                      </div>
                      {srcActives>0&&(
                        <span style={{fontSize:11,color:"#6B6E7E",fontFamily:"'Geist','system-ui',sans-serif",display:"inline-flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:12}}>🧠</span>
                          <span><strong style={{fontWeight:500,color:"#1A1A1E",fontVariantNumeric:"tabular-nums"}}>{srcActives}</strong> source{srcActives>1?"s":""}</span>
                        </span>
                      )}
                    </div>
                    {genReply
                      ? <div style={{padding:"24px",fontSize:13,color:"#6B6E7E",display:"flex",alignItems:"center",gap:10,fontFamily:"'Geist','system-ui',sans-serif",justifyContent:"center"}}><Spin/> Archange rédige…</div>
                      : !reply
                        ? <div style={{padding:"28px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
                            <div style={{fontSize:13,color:"#6B6E7E",textAlign:"center",fontFamily:"'Geist','system-ui',sans-serif",lineHeight:1.5,maxWidth:320}}>Cliquez pour qu'Archange rédige une réponse adaptée au contexte de cet email.</div>
                            <button onClick={genererReponse} disabled={genReply} style={{padding:"9px 18px",borderRadius:10,border:"1px solid #B8924F",background:"#B8924F",color:"#FFFFFF",fontSize:13,fontWeight:500,cursor:"pointer",letterSpacing:"-0.005em",display:"inline-flex",alignItems:"center",gap:7,fontFamily:"'Geist','system-ui',sans-serif",transition:"all .14s ease",boxShadow:"0 1px 2px rgba(184,146,79,0.2)"}}>
                              {genReply?<><Spin s={11}/> Génération…</>:<>✦ Générer une réponse</>}
                            </button>
                          </div>
                        : editing
                          ? <textarea value={editReply} onChange={e=>setEditReply(e.target.value)} style={{width:"100%",padding:"18px 22px",fontFamily:"'Geist','system-ui',sans-serif",fontSize:14,color:"#1A1A1E",lineHeight:1.65,border:"none",outline:"none",resize:"vertical",background:"transparent",minHeight:200}}/>
                          : <div style={{padding:"20px 22px",fontFamily:"'Fraunces',Georgia,serif",fontSize:15,color:"#1A1A1E",lineHeight:1.75,whiteSpace:"pre-wrap"}}>
                              {reply}
                              {repliesCache[sel?.id]?.dateGen&&<div style={{marginTop:14,fontSize:11,color:"#A5A4A0",fontFamily:"'Geist','system-ui',sans-serif"}}>Générée le <span style={{fontVariantNumeric:"tabular-nums"}}>{repliesCache[sel.id].dateGen}</span></div>}
                            </div>
                    }
                    <div style={{display:"flex",gap:8,padding:"12px 18px",borderTop:"1px solid rgba(184,146,79,0.15)",background:"rgba(255,255,255,0.6)",flexWrap:"wrap"}}>
                      {reply && <><button onClick={async()=>{
                        const replyText = editing ? editReply : reply;
                        const subject = sel.subject?.startsWith("Re:") ? sel.subject : `Re: ${sel.subject||""}`;
                        // Fix #6 — appel direct /api/gmail/draft
                        try {
                          const res = await fetch("/api/gmail/draft", {
                            method:"POST",
                            headers:{"Content-Type":"application/json"},
                            body: JSON.stringify({ to: sel.fromEmail, subject, body: replyText })
                          });
                          if (res.ok) toast("Brouillon créé dans Gmail ✓");
                          else toast("Erreur création brouillon", "err");
                        } catch { toast(humanError(new Error("network")), "err"); }
                        setDrafted(p=>new Set([...p,sel.id]));
                        const upd = { ...sentReplies, [sel.id]: { text: replyText, date: new Date().toLocaleDateString("fr-FR"), subject: sel.subject||"", toEmail: sel.fromEmail||"" }};
                        saveSentReplies(upd);
                      }} disabled={genReply} style={{...gold}}>Créer le brouillon</button>
                      {sel?.fromEmail&&<button onClick={()=>{
                        const replyText = editing ? editReply : reply;
                        const subject = sel.subject?.startsWith("Re:") ? sel.subject : `Re: ${sel.subject||""}`;
                        const body = encodeURIComponent(replyText);
                        window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(sel.fromEmail)}&su=${encodeURIComponent(subject)}&body=${body}`, "_blank");
                        setDrafted(p=>new Set([...p,sel.id]));
                        // Sauvegarder la réponse dans l'historique
                        const upd = { ...sentReplies, [sel.id]: { text: replyText, date: new Date().toLocaleDateString("fr-FR"), subject: subject, toEmail: sel.fromEmail||"" }};
                        saveSentReplies(upd);
                        toast("Gmail ouvert ✓");
                      }} disabled={genReply} style={{...gold,background:"#1a73e8",color:"#fff",boxShadow:"0 2px 8px rgba(26,115,232,.3)"}}>✉ Ouvrir dans Gmail</button>}
                      <button onClick={()=>{ if(editing){setReply(editReply);setEditing(false);if(sel)setRepliesCache(prev=>({...prev,[sel.id]:{...prev[sel.id],reply:editReply,editReply}}));}else{setEditing(true);setEditReply(reply);} }} disabled={genReply} style={{...out}}>{editing?"Valider":"Modifier"}</button>
                      <button onClick={genererReponse} disabled={genReply} style={{...out,color:"#6B6E7E",display:"flex",alignItems:"center",gap:5}}>{genReply?<><Spin s={11}/> En cours…</>:"↻ Regénérer"}</button></>}
                    </div>
                  </div>
                </div>
              )}
            </div>}
          </>
        )}

        {/* ══ PLANNING ══ */}
        {view==="planning" && (()=>{
          const today = new Date();
          const todayStr = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");

          // Week helpers
          const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(calWeekStart); d.setDate(d.getDate()+i); return d; });
          const fmtDate = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
          // Filtre planning — appliqué à toutes les vues
          const resasForDate = (ds:string) => resas.filter(r => {
            if(r.dateDebut!==ds) return false;
            if(planFilter==="all") return true;
            if(planFilter==="__none__") return !r.statut||!statuts.find(s=>s.id===r.statut);
            return (r.statut||"nouveau")===planFilter;
          });

          // Day view
          const calDayStr = fmtDate(calDate);
          const dayResas = resasForDate(calDayStr);

          return (
            <div style={{display:"flex",flex:1,overflow:"hidden"}}>
              <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

                {/* Toolbar */}
                <div style={{padding:"14px 20px",borderBottom:"1px solid #EBEAE5",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:"#FFFFFF"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={()=>{ const n=new Date(); setCalDate(new Date(n.getFullYear(),n.getMonth(),n.getDate())); const w=new Date(n); w.setDate(w.getDate()-((w.getDay()+6)%7)); w.setHours(0,0,0,0); setCalWeekStart(w); }} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",fontSize:12,fontWeight:600,cursor:"pointer"}}>Aujourd'hui</button>
                    <button onClick={()=>{
                      if(calView==="mois") setCalDate(new Date(calDate.getFullYear(),calDate.getMonth()-1,1));
                      else if(calView==="semaine"){ const d=new Date(calWeekStart); d.setDate(d.getDate()-7); setCalWeekStart(d); }
                      else { const d=new Date(calDate); d.setDate(d.getDate()-1); setCalDate(d); }
                    }} style={{width:30,height:30,borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                    <button onClick={()=>{
                      if(calView==="mois") setCalDate(new Date(calDate.getFullYear(),calDate.getMonth()+1,1));
                      else if(calView==="semaine"){ const d=new Date(calWeekStart); d.setDate(d.getDate()+7); setCalWeekStart(d); }
                      else { const d=new Date(calDate); d.setDate(d.getDate()+1); setCalDate(d); }
                    }} style={{width:30,height:30,borderRadius:7,border:"1px solid #EBEAE5",background:"#FFFFFF",color:"#1A1A1E",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                    <span style={{fontSize:16,fontWeight:600,color:"#1A1A1E",marginLeft:4}}>
                      {calView==="mois" && `${MOIS[calDate.getMonth()]} ${calDate.getFullYear()}`}
                      {calView==="semaine" && `${weekDays[0].getDate()} ${MOIS[weekDays[0].getMonth()].slice(0,3)} – ${weekDays[6].getDate()} ${MOIS[weekDays[6].getMonth()].slice(0,3)} ${weekDays[6].getFullYear()}`}
                      {calView==="jour" && `${calDate.getDate()} ${MOIS[calDate.getMonth()]} ${calDate.getFullYear()}`}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    {/* Filtre par statut */}
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <select
                        value={planFilter}
                        onChange={e=>setPlanFilter(e.target.value)}
                        style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${planFilter!=="all"?"#B8924F":"#EBEAE5"}`,background:planFilter!=="all"?"#FEF9EE":"#FFFFFF",color:planFilter!=="all"?"#854F0B":"#3D3530",fontSize:12,cursor:"pointer",outline:"none",fontWeight:planFilter!=="all"?600:400}}>
                        <option value="all">Tous les statuts</option>
                        {statuts.map(s=>(
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                        <option value="__none__">Sans statut</option>
                      </select>
                      {planFilter!=="all"&&(
                        <button onClick={()=>setPlanFilter("all")} title="Réinitialiser le filtre" style={{width:22,height:22,borderRadius:6,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                      )}
                    </div>
                    {/* Vue toggle */}
                    <div style={{display:"flex",background:"#F5F4F0",borderRadius:8,padding:2,border:"1px solid #EBEAE5"}}>
                      {(["mois","semaine","jour"] as const).map(v=>(
                        <button key={v} onClick={()=>setCalView(v)} style={{padding:"5px 12px",borderRadius:6,border:"none",background:calView===v?"#FFFFFF":"transparent",color:calView===v?"#1A1A1E":"#A5A4A0",fontSize:12,fontWeight:calView===v?600:400,cursor:"pointer",textTransform:"capitalize"}}>{v.charAt(0).toUpperCase()+v.slice(1)}</button>
                      ))}
                    </div>
                    <button onClick={()=>{setSelResaGeneral({...EMPTY_RESA, espaceId: espacesDyn[0]?.id || ""}); setEditResaPanel({...EMPTY_RESA, espaceId: espacesDyn[0]?.id || ""});}} style={{...gold,fontSize:12,padding:"7px 14px"}}>+ Réservation</button>
                  </div>
                </div>

                {/* ── VUE MOIS ── */}
                {calView==="mois" && (
                  <div style={{flex:1,overflowY:"auto",padding:16}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:0,marginBottom:0,border:"1px solid #EBEAE5",borderRadius:12,overflow:"hidden"}}>
                      {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d=>(
                        <div key={d} style={{textAlign:"center",fontSize:11,color:"#6B6E7E",padding:"8px 0",fontWeight:600,background:"#F5F4F0",borderBottom:"1px solid #EBEAE5"}}>{d}</div>
                      ))}
                      {Array.from({length:firstDay(calDate)}).map((_,i)=>(
                        <div key={"p"+i} style={{minHeight:100,background:"#EEEAE4",borderRight:"1px solid #EBEAE5",borderBottom:"1px solid #EBEAE5"}}/>
                      ))}
                      {Array.from({length:daysInMonth(calDate)}).map((_,i)=>{
                        const day=i+1;
                        const ds=calDate.getFullYear()+"-"+String(calDate.getMonth()+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
                        const dr=resasForDate(ds);
                        const isToday=ds===todayStr;
                        const col=(firstDay(calDate)+i)%7;
                        return (
                          <div key={day} style={{minHeight:100,borderRight:col<6?"1px solid #EBEAE5":"none",borderBottom:"1px solid #EBEAE5",padding:"6px 6px 4px",background:isToday?"rgba(184,146,79,0.05)":"#FFFFFF",position:"relative"}}>
                            <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>
                              <span style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:isToday?700:400,background:isToday?"#B8924F":"transparent",color:isToday?"#FFFFFF":"#9E9890"}}>{day}</span>
                            </div>
                            {dr.slice(0,3).map(r=>{ const st=getStatut(r); const espace=ESPACES.find(e=>e.id===r.espaceId); return (
                              <div key={r.id} onClick={()=>{ setSelResaGeneral(r); setResaOnglet("infos"); }} style={{fontSize:10,background:st.bg,color:st.color,padding:"2px 6px",borderRadius:4,marginBottom:2,cursor:"pointer",overflow:"hidden",fontWeight:500,borderLeft:`2px solid ${st.color}`}}>
                                <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                  {r.heureDebut&&<span style={{opacity:.7,marginRight:3}}>{r.heureDebut}{r.heureFin&&`→${r.heureFin}`}</span>}{r.nom}
                                </div>
                                {(r.entreprise||espace)&&<div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",opacity:.7,fontSize:9}}>{[r.entreprise,espace?.nom].filter(Boolean).join(" · ")}</div>}
                              </div>
                            );})}
                            {dr.length>3&&<div style={{fontSize:10,color:"#6B6E7E",paddingLeft:4,cursor:"pointer"}} onClick={()=>setCalView("jour")}>+{dr.length-3} autre{dr.length-3>1?"s":""}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── VUE SEMAINE ── */}
                {calView==="semaine" && (
                  <div style={{flex:1,overflowY:"auto"}}>
                    <div style={{display:"grid",gridTemplateColumns:"48px repeat(7,1fr)",borderBottom:"1px solid #EBEAE5"}}>
                      <div/>
                      {weekDays.map(d=>{ const ds=fmtDate(d); const isTd=ds===todayStr; return (
                        <div key={ds} style={{textAlign:"center",padding:"10px 4px",borderLeft:"1px solid #EBEAE5",background:"#FFFFFF"}}>
                          <div style={{fontSize:11,color:isTd?"#C9A876":"#A5A4A0",fontWeight:600,textTransform:"uppercase"}}>{["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"][d.getDay()===0?6:d.getDay()-1]}</div>
                          <div style={{width:28,height:28,borderRadius:"50%",background:isTd?"#C9A876":"transparent",color:isTd?"#0F0F0F":"#1A1A1E",fontSize:14,fontWeight:isTd?700:500,display:"flex",alignItems:"center",justifyContent:"center",margin:"4px auto 0"}}>{d.getDate()}</div>
                        </div>
                      );})}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"48px repeat(7,1fr)"}}>
                      <div/>
                      {weekDays.map(d=>{ const ds=fmtDate(d); const dr=resasForDate(ds); const isTd=ds===todayStr; return (
                        <div key={ds} style={{borderLeft:"1px solid #EBEAE5",minHeight:300,padding:"6px 4px",background:isTd?"rgba(201,168,118,0.03)":"transparent"}}>
                          {dr.map(r=>{ const st=getStatut(r); const espace=ESPACES.find(e=>e.id===r.espaceId); return (
                            <div key={r.id} onClick={()=>{ setSelResaGeneral(r); setResaOnglet("infos"); }} style={{background:st.bg,borderLeft:`3px solid ${st.color}`,borderRadius:"0 6px 6px 0",padding:"5px 7px",marginBottom:4,cursor:"pointer",fontSize:11}}>
                              <div style={{fontWeight:600,color:st.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.nom}</div>
                              {r.heureDebut&&<div style={{fontSize:10,color:st.color,opacity:.8}}>{r.heureDebut}{r.heureFin&&` → ${r.heureFin}`}</div>}
                              {(r.entreprise||espace)&&<div style={{fontSize:9,color:st.color,opacity:.65,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{[r.entreprise,espace?.nom].filter(Boolean).join(" · ")}</div>}
                            </div>
                          );})}
                        </div>
                      );})}
                    </div>
                  </div>
                )}

                {/* ── VUE JOUR ── */}
                {calView==="jour" && (
                  <div style={{flex:1,overflowY:"auto",padding:20}}>
                    {dayResas.length===0?(
                      <div style={{textAlign:"center",padding:"60px 0",color:"#6B6E7E"}}>
                        <div style={{fontSize:36,marginBottom:10}}>📅</div>
                        <div style={{fontSize:14}}>Aucun événement ce jour</div>
                        <button onClick={()=>{setSelResaGeneral({...EMPTY_RESA,dateDebut:calDayStr}); setEditResaPanel({...EMPTY_RESA,dateDebut:calDayStr});}} style={{...gold,marginTop:16,fontSize:12}}>+ Ajouter un événement</button>
                      </div>
                    ):(
                      <div style={{display:"flex",flexDirection:"column",gap:12}}>
                        {dayResas.map(r=>{ const st=getStatut(r); return (
                          <div key={r.id} onClick={()=>{ setSelResaGeneral(r); setResaOnglet("infos"); }} style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5",borderLeft:`4px solid ${st.color}`,padding:"16px 18px",cursor:"pointer"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                              <div>
                                <div style={{fontSize:15,fontWeight:600,color:"#1A1A1E"}}>{r.nom}</div>
                                {r.entreprise&&<div style={{fontSize:12,color:"#6B6E7E",marginTop:1}}>{r.entreprise}</div>}
                              </div>
                              <span style={{fontSize:11,padding:"3px 10px",borderRadius:100,background:st.bg,color:st.color,fontWeight:600,flexShrink:0,marginLeft:8}}>{st.label}</span>
                            </div>
                            <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:8}}>
                              {r.heureDebut&&<span style={{fontSize:12,color:"#6B6E7E"}}>🕐 {r.heureDebut}{r.heureFin&&` → ${r.heureFin}`}</span>}
                              {r.typeEvenement&&<span style={{fontSize:12,color:"#6B6E7E"}}>🎉 {r.typeEvenement}</span>}
                              {r.nombrePersonnes&&<span style={{fontSize:12,color:"#6B6E7E"}}>👥 {r.nombrePersonnes} pers.</span>}
                              {r.espaceId&&<span style={{fontSize:12,color:"#6B6E7E"}}>📍 {ESPACES.find(e=>e.id===r.espaceId)?.nom}</span>}
                            </div>
                          </div>
                        );})}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Panel détail */}
            </div>
          );
        })()}

        {/* ══ STATS ══ */}
        {view==="stats" && (
          <div style={{flex:1,overflowY:"auto",padding:24}}>
            <div style={{fontSize:24,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",letterSpacing:"0.02em",marginBottom:24}}>Vue d'ensemble</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:28}}>
              {[["Demandes totales",total,"#6B7280"],["Confirmées",conf,"#059669"],["En attente",att,"#D97706"],["Taux de conversion",taux+"%","#2563EB"]].map(([l,v,c])=>(
                <div key={l} style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5",boxShadow:"0 1px 4px rgba(26,26,30,.04)",padding:"16px 18px"}}>
                  <div style={{fontSize:11,color:"#6B6E7E",marginBottom:8,textTransform:"uppercase",letterSpacing:".05em"}}>{l}</div>
                  <div style={{fontSize:28,fontWeight:700,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5",boxShadow:"0 1px 4px rgba(26,26,30,.04)",padding:20}}>
                <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",letterSpacing:"-0.01em",marginBottom:20}}>Par espace</div>
                {parEspace.map(e=>(
                  <div key={e.id} style={{marginBottom:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:13,color:"#1A1A1E",fontWeight:500}}>{e.nom}</span>
                      <span style={{fontSize:12,color:"#6B6E7E"}}>{e.c}/{e.n}</span>
                    </div>
                    <div style={{height:8,background:"#F5F4F0",borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",width:Math.round(e.n/maxN*100)+"%",background:e.color,borderRadius:4}}/>
                    </div>
                    <div style={{fontSize:11,color:"#6B6E7E",marginTop:4}}>{e.n>0?Math.round(e.c/e.n*100)+"% confirmés":"Aucune demande"}</div>
                  </div>
                ))}
              </div>
              <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5",boxShadow:"0 1px 4px rgba(26,26,30,.04)",padding:20}}>
                <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",letterSpacing:"-0.01em",marginBottom:16}}>Types d'événements</div>
                {parType.length===0&&<div style={{fontSize:13,color:"#6B6E7E"}}>Aucune donnée</div>}
                {parType.map((t,i)=>(
                  <div key={t.t} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<parType.length-1?"1px solid #EBEAE5":"none"}}>
                    <div style={{flex:1,fontSize:13,color:"#6B6E7E"}}>{t.t}</div>
                    <div style={{width:60,height:6,background:"#F5F4F0",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:Math.round(t.n/parType[0].n*100)+"%",background:"#C9A876",borderRadius:3}}/></div>
                    <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E",minWidth:16}}>{t.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

                {/* ══ SOURCES IA ══ */}
        {view==="sources" && (
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"#F5F4F0"}}>

            {/* ── Header fixe — titre + stats ── */}
            <div style={{padding:"24px 28px 16px",flexShrink:0,borderBottom:"1px solid #EBEAE5",background:"#F5F4F0"}}>
              <div style={{fontSize:22,fontWeight:300,color:"#1A1A1E",fontFamily:"'Fraunces',Georgia,serif",letterSpacing:"0.02em"}}>Sources IA</div>
              <div style={{fontSize:12,color:"#6B6E7E",marginTop:4,marginBottom:14}}>Tout ce que vous écrivez ici est transmis à ARCHANGE à chaque génération.</div>

              {/* C4 — Bandeau onboarding si aucune source n'est configurée */}
              {!menusCtx && !conditionsCtx && !tonCtx && !espacesCtx && (
                <div style={{marginBottom:14,padding:"12px 16px",background:"rgba(184,146,79,0.08)",border:"1px solid rgba(184,146,79,0.3)",borderLeft:"3px solid #B8924F",borderRadius:"0 6px 6px 0",display:"flex",alignItems:"flex-start",gap:12}}>
                  <span style={{fontSize:18,flexShrink:0}}>✨</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",marginBottom:3}}>Personnalisez ARCHANGE pour votre établissement</div>
                    <div style={{fontSize:12,color:"#6B6E7E",lineHeight:1.5}}>
                      Aucune source n'est encore configurée. En renseignant vos menus, conditions et règles de ton, ARCHANGE rédigera des réponses parfaitement adaptées à votre brasserie — et non des réponses génériques.
                    </div>
                    <div style={{fontSize:11,color:"#B8924F",marginTop:6,fontWeight:500}}>👇 Commencez par "Menus & Tarifs" ci-dessous</div>
                  </div>
                </div>
              )}

              <div style={{display:"flex",background:"#FFFFFF",borderRadius:10,border:"1px solid #EBEAE5",overflow:"hidden"}}>
                {[
                  ["Menus", menusCtx?"Actif":"—","🍽️"],
                  ["Conditions", conditionsCtx?"Actif":"—","📜"],
                  ["Ton & Règles", tonCtx?"Actif":"—","✏️"],
                  ["Liens web", Object.values(linksFetched).filter(Boolean).length||"—","🔗"],
                ].map(([l,v,icon],i,arr)=>(
                  <div key={String(l)} style={{flex:1,padding:"10px 12px",borderRight:i<arr.length-1?"1px solid #EBEAE5":"none",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#6B6E7E",fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3}}>{icon} {l}</div>
                    <div style={{fontSize:13,fontWeight:600,color:v==="—"?"#C5C3BE":"#1A1A1E"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Zone scrollable ── */}
            <div style={{flex:1,overflowY:"scroll",padding:"16px 28px 28px",display:"flex",flexDirection:"column",gap:12,minHeight:0}}>

            {/* ── Section Établissement ── */}
            <div style={{background:"#FFFFFF",borderRadius:12,border:"2px solid #B8924F"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FDF8EF",borderBottom:srcSections["etablissement"]?"1px solid #EBEAE5":"none",cursor:"pointer",borderRadius:srcSections["etablissement"]?"12px 12px 0 0":"12px"}} onClick={()=>setSrcSections(s=>({...s,etablissement:!s["etablissement"]}))}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>🏠</span>
                    <span style={{fontSize:13,fontWeight:700,color:"#1A1A1E"}}>Identité de l'établissement</span>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"#FEF3C7",color:"#92400E",fontWeight:600}}>Multi-compte</span>
                  </div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>Nom, adresse, email — personnalise toute l'IA et la sidebar</div>
                </div>
                <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections["etablissement"]?"▲":"▼"}</span>
              </div>
              {srcSections["etablissement"]&&(
                <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>🏷 Nom de l'établissement</label>
                    <input value={nomEtab} onChange={e=>setNomEtab(e.target.value)} onBlur={()=>saveNomEtab(nomEtab)} placeholder="Ex : Brasserie RÊVA, Le Comptoir du Port…" style={{...inp,fontSize:14,fontWeight:600}}/>
                    <div style={{fontSize:11,color:"#6B6E7E",marginTop:4}}>Utilisé dans tous les prompts IA et la signature email</div>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>📍 Adresse</label>
                    <input value={adresseEtab} onChange={e=>setAdresseEtab(e.target.value)} onBlur={()=>saveAdresseEtab(adresseEtab)} placeholder="Ex : 133 avenue de France, 75013 Paris" style={{...inp}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>📧 Email de contact</label>
                    <input value={emailEtab} onChange={e=>setEmailEtab(e.target.value)} onBlur={()=>saveEmailEtab(emailEtab)} placeholder="Ex : contact@brasserie-reva.fr" style={{...inp}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#6B6E7E",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>📞 Téléphone</label>
                    <input value={telEtab} onChange={e=>setTelEtab(e.target.value)} onBlur={()=>saveTelEtab(telEtab)} placeholder="Ex : +33 1 23 45 67 89" style={{...inp}}/>
                  </div>
                </div>
              )}
            </div>

            {/* ── Section Espaces dynamiques ── */}
            <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FAFAF7",borderBottom:srcSections["espacesDyn"]?"1px solid #EBEAE5":"none",cursor:"pointer"}} onClick={()=>setSrcSections(s=>({...s,espacesDyn:!s["espacesDyn"]}))}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>🏛️</span>
                    <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>Espaces de l'établissement</span>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"#D1FAE5",color:"#3F5B32",fontWeight:600}}>{espacesDyn.length} espace{espacesDyn.length>1?"s":""}</span>
                  </div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>Salles, capacités, descriptions — remplacent les espaces codés en dur</div>
                </div>
                <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections["espacesDyn"]?"▲":"▼"}</span>
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
                          <button onClick={()=>saveEspacesDyn(espacesDyn.filter((_,i)=>i!==idx))} title="Supprimer" style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:16,padding:"4px",flexShrink:0}}>✕</button>
                        )}
                      </div>

                      {/* Ligne 2 : capacités assis / debout */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        {/* Assis */}
                        <div style={{background:"#FFFFFF",borderRadius:8,padding:"10px 12px",border:"1px solid #EBEAE5"}}>
                          <div style={{fontSize:11,fontWeight:600,color:"#6B6E7E",marginBottom:8,display:"flex",alignItems:"center",gap:5}}>
                            🪑 Assis
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:"#6B6E7E",marginBottom:3}}>Min</div>
                              <input
                                type="number" min="0"
                                value={esp.assisMin}
                                onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],assisMin:e.target.value}; setEspacesDyn(u);}}
                                onBlur={()=>saveEspacesDyn(espacesDyn)}
                                placeholder="—"
                                style={{...inp,textAlign:"center",padding:"6px 8px"}}
                              />
                            </div>
                            <span style={{color:"#C5C3BE",fontSize:13,marginTop:16}}>→</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:"#6B6E7E",marginBottom:3}}>Max</div>
                              <input
                                type="number" min="0"
                                value={esp.assisMax}
                                onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],assisMax:e.target.value}; setEspacesDyn(u);}}
                                onBlur={()=>saveEspacesDyn(espacesDyn)}
                                placeholder="—"
                                style={{...inp,textAlign:"center",padding:"6px 8px"}}
                              />
                            </div>
                            <span style={{fontSize:10,color:"#6B6E7E",marginTop:16,flexShrink:0}}>pers.</span>
                          </div>
                        </div>

                        {/* Debout */}
                        <div style={{background:"#FFFFFF",borderRadius:8,padding:"10px 12px",border:"1px solid #EBEAE5"}}>
                          <div style={{fontSize:11,fontWeight:600,color:"#6B6E7E",marginBottom:8,display:"flex",alignItems:"center",gap:5}}>
                            🥂 Debout / Cocktail
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:"#6B6E7E",marginBottom:3}}>Min</div>
                              <input
                                type="number" min="0"
                                value={esp.deboutMin}
                                onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],deboutMin:e.target.value}; setEspacesDyn(u);}}
                                onBlur={()=>saveEspacesDyn(espacesDyn)}
                                placeholder="—"
                                style={{...inp,textAlign:"center",padding:"6px 8px"}}
                              />
                            </div>
                            <span style={{color:"#C5C3BE",fontSize:13,marginTop:16}}>→</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:"#6B6E7E",marginBottom:3}}>Max</div>
                              <input
                                type="number" min="0"
                                value={esp.deboutMax}
                                onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],deboutMax:e.target.value}; setEspacesDyn(u);}}
                                onBlur={()=>saveEspacesDyn(espacesDyn)}
                                placeholder="—"
                                style={{...inp,textAlign:"center",padding:"6px 8px"}}
                              />
                            </div>
                            <span style={{fontSize:10,color:"#6B6E7E",marginTop:16,flexShrink:0}}>pers.</span>
                          </div>
                        </div>
                      </div>

                      {/* Ligne 3 : description */}
                      <input value={esp.description} onChange={e=>{const u=[...espacesDyn]; u[idx]={...u[idx],description:e.target.value}; setEspacesDyn(u);}} onBlur={()=>saveEspacesDyn(espacesDyn)} placeholder="Description courte (vue, surface, ambiance, équipements…)" style={{...inp,width:"100%"}}/>
                    </div>
                  ))}
                  <button onClick={()=>saveEspacesDyn([...espacesDyn,{id:"esp_"+Date.now(),nom:"Nouvel espace",color:"#8B5CF6",assisMin:"",assisMax:"",deboutMin:"",deboutMax:"",description:""}])} style={{padding:"10px",borderRadius:8,border:"2px dashed #EBEAE5",background:"transparent",color:"#6B6E7E",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    + Ajouter un espace
                  </button>

                  {/* Notes complémentaires — remplace l'ancien textarea "Espaces & Capacités" */}
                  <div style={{marginTop:4}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#6B6E7E",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>📝 Notes complémentaires sur les espaces</div>
                    <textarea
                      value={espacesCtx}
                      onChange={e=>setEspacesCtx(e.target.value)}
                      onBlur={()=>saveEspacesCtx(espacesCtx)}
                      placeholder={"Équipements disponibles, accès PMR, parking, matériel sonorisation, contraintes techniques, règles d'accès, horaires d'ouverture des espaces…"}
                      rows={5}
                      style={{...inp,lineHeight:1.75,resize:"vertical",width:"100%",fontFamily:"inherit",fontSize:12}}
                    />
                    <div style={{fontSize:11,color:"#6B6E7E",marginTop:4}}>Ces informations complètent les espaces ci-dessus — équipements, accès, contraintes non structurées.</div>
                  </div>

                  <div style={{fontSize:11,color:"#6B6E7E",padding:"8px 12px",background:"#F5F4F0",borderRadius:8}}>
                    💡 Les espaces ci-dessus remplacent les salles codées en dur. L'IA les utilisera pour les attributions et les réponses.
                  </div>
                </div>
              )}
            </div>

            {/* Composant réutilisable pour chaque section texte */}
            {([
              ["menus",      "🍽️", "Menus & Tarifs",        "Collez ici vos menus, formules, tarifs par personne, options boissons…",            menusCtx,      saveMenusCtx],
              ["conditions", "📜", "Conditions & Politique", "Politique d'annulation, acomptes, délais de confirmation, horaires d'accès…",       conditionsCtx, saveConditionsCtx],
              ["ton",        "✏️", "Règles & Ton IA",        "Ex: Toujours proposer une visite. Ne pas mentionner les prix avant une demande de devis. Signature personnalisée…", tonCtx, saveTonCtx],
            ]).map(([key, icon, title, ph, val, save]) => (
              <div key={key} style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#FAFAF7",borderBottom:srcSections[key]?"1px solid #EBEAE5":"none",cursor:"pointer"}} onClick={()=>setSrcSections(s=>({...s,[key]:!s[key]}))}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>{icon}</span>
                      <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>{title}</span>
                      {val&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:100,background:"#D1FAE5",color:"#3F5B32",fontWeight:600}}>Actif</span>}
                    </div>
                    <div style={{fontSize:11,color:"#6B6E7E",marginTop:3,paddingLeft:24}}>{ph.slice(0,60)}…</div>
                  </div>
                  <span style={{fontSize:12,color:"#6B6E7E",flexShrink:0,marginLeft:12}}>{srcSections[key]?"▲":"▼"}</span>
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
                      <span style={{fontSize:11,color:"#6B6E7E"}}>{val.length} caractères</span>
                      {val&&<button onClick={()=>save("")} style={{fontSize:11,color:"#DC2626",background:"none",border:"none",cursor:"pointer"}}>Vider ×</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Liens web — section existante conservée */}
            <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
              <button onClick={()=>setSrcSections(s=>({...s,liens:!s.liens}))} style={{width:"100%",padding:"14px 20px",background:"#FAFAF7",border:"none",borderBottom:srcSections.liens?"1px solid #EBEAE5":"none",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>🔗 Liens web analysés</div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:2}}>Site internet, Instagram, Facebook — ARCHANGE analyse le contenu.</div>
                </div>
                <span style={{fontSize:12,color:"#6B6E7E"}}>{srcSections.liens?"▲":"▼"}</span>
              </button>
              {srcSections.liens&&(
                <div style={{padding:20,display:"flex",flexDirection:"column",gap:16}}>
                  {[["website","🌐","Site internet","https://..."],["instagram","📸","Instagram","https://instagram.com/..."],["facebook","👍","Facebook","https://facebook.com/..."],["other","🔗","Autre lien","https://..."]].map(([key,icon,label,ph])=>(
                    <div key={key}>
                      <label style={{fontSize:11,color:"#7A736A",display:"block",marginBottom:6,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>{icon} {label}</label>
                      <div style={{display:"flex",gap:8}}>
                        <input value={links[key]||""} onChange={e=>setLinks({...links,[key]:e.target.value})} onBlur={()=>saveLinks(links)} placeholder={ph} style={{...inp,flex:1}}/>
                        <button onClick={()=>fetchLink(links[key],key)} disabled={!links[key]||fetchingLink===key} style={{padding:"9px 16px",borderRadius:8,border:"none",background:linksFetched[key]?"#E8F5EE":!links[key]||fetchingLink===key?"#E8E4DE":"#B8924F",color:linksFetched[key]?"#2D6A4F":!links[key]||fetchingLink===key?"#A09890":"#1A1A1E",fontSize:12,fontWeight:600,cursor:links[key]&&fetchingLink!==key?"pointer":"default",display:"flex",alignItems:"center",gap:6,flexShrink:0,whiteSpace:"nowrap"}}>
                          {fetchingLink===key?<><Spin s={12}/> Analyse…</>:linksFetched[key]?"✓ Analysé":"Analyser"}
                        </button>
                      </div>
                      {linksFetched[key]&&(
                        <div style={{marginTop:8,padding:"12px 14px",background:"#EDF5F0",border:"1px solid #C3DDD0",borderRadius:8}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                            <div style={{fontSize:10,color:"#2D6A4F",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>Résumé · {linksFetched[key].fetchedAt}</div>
                            <button onClick={()=>{ const u={...linksFetched}; delete u[key]; setLinksFetched(u); saveToSupabase({links_fetched:JSON.stringify(u)}); }} style={{background:"none",border:"none",color:"#A0522D",fontSize:11,cursor:"pointer",padding:0}}>Supprimer ×</button>
                          </div>
                          <div style={{fontSize:12,color:"#2D4A3A",lineHeight:1.7}}>{linksFetched[key].summary||""}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3 — Tags personnalisés */}
            <div style={{background:"#FFFFFF",borderRadius:3,border:"1px solid #EBEAE5"}}>
              <div style={{padding:"14px 20px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>🏷️ Tags personnalisés</div>
                  <div style={{fontSize:11,color:"#6B6E7E",marginTop:2}}>Créez des tags pour classifier vos emails et filtrer rapidement.</div>
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
                          if (!window.confirm(`Supprimer le tag "${t.label}" ? Il sera retiré de tous les emails.`)) return;
                          const newTags = customTags.filter(x=>x.id!==t.id);
                          saveCustomTags(newTags);
                          // Retirer le tag de tous les emails
                          const newEmailTags: Record<string,string[]> = {};
                          Object.entries(emailTags).forEach(([eid,ids])=>{
                            const filtered = (ids as string[]).filter(x=>x!==t.id);
                            if (filtered.length>0) newEmailTags[eid]=filtered;
                          });
                          saveEmailTags(newEmailTags);
                          toast("Tag supprimé");
                        }} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:14,padding:"2px 4px",borderRadius:4,lineHeight:1}}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Créer un nouveau tag */}
                <div style={{display:"flex",flexDirection:"column",gap:10,padding:"12px",background:"#F9F8F6",borderRadius:6,border:"1px dashed #EBEAE5"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#6B6E7E",letterSpacing:"0.06em",textTransform:"uppercase"}}>Créer un tag</div>
                  <input value={newTagLabel} onChange={e=>setNewTagLabel(e.target.value)} placeholder="Nom du tag…" style={{padding:"8px 10px",borderRadius:6,border:"1px solid #EBEAE5",fontSize:13,background:"#FFF",color:"#1A1A1E",outline:"none"}}/>
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
                    toast("Tag créé !");
                  }} disabled={!newTagLabel.trim()} style={{padding:"8px 16px",borderRadius:6,border:"none",background:newTagLabel.trim()?"#1A1A1E":"#EBEAE5",color:newTagLabel.trim()?"#F5F4F0":"#9CA3AF",fontSize:12,fontWeight:600,cursor:newTagLabel.trim()?"pointer":"default",textAlign:"center"}}>
                    + Créer ce tag
                  </button>
                </div>
              </div>
            </div>

            </div>
          </div>
        )}
      </main>

      {/* ══ MODAL FICHE ÉVÉNEMENT depuis le Planning ══ */}
      {/* Affiche la fiche complète en overlay sans quitter la vue Planning */}
      {/* ══ FICHE ÉVÉNEMENT UNIFIÉE ══
           UN seul composant — ouvert depuis Événements, Planning ou Mails
           Toujours en modale slide-in (position:fixed), 4 onglets identiques partout */}
      {selResaGeneral && !editResaPanel && (
        <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"stretch",justifyContent:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget){setSelResaGeneral(null);setResaOnglet("infos");}}}>
          <div style={{position:"absolute",inset:0,background:"rgba(27,30,43,0.45)"}}/>
          <div style={{position:"relative",width:580,maxWidth:"95vw",height:"100vh",background:"#FFFFFF",display:"flex",flexDirection:"column",boxShadow:"-8px 0 40px rgba(0,0,0,0.15)",borderLeft:"1px solid #EBEAE5"}}>

            {/* Header */}
            <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #EBEAE5",flexShrink:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14}}>
                <div style={{display:"flex",gap:14,alignItems:"flex-start",flex:1,minWidth:0}}>
                  <Avatar name={selResaGeneral.nom||"?"} size={48}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:18,fontWeight:600,color:"#1A1A1E",letterSpacing:"-0.01em",marginBottom:5}}>{selResaGeneral.nom}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                      {selResaGeneral.entreprise&&<span style={{fontSize:12,color:"#6B6E7E"}}>🏢 {selResaGeneral.entreprise}</span>}
                      {selResaGeneral.email&&<span style={{fontSize:12,color:"#6B6E7E"}}>📧 {selResaGeneral.email}</span>}
                      {selResaGeneral.telephone&&<span style={{fontSize:12,color:"#6B6E7E"}}>📞 {selResaGeneral.telephone}</span>}
                    </div>
                  </div>
                </div>
                <button onClick={()=>{setSelResaGeneral(null);setResaOnglet("infos");}} style={{width:26,height:26,borderRadius:6,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
              </div>
            </div>

            {/* Onglets — 4 onglets identiques peu importe l'origine */}
            <div style={{display:"flex",borderBottom:"1px solid #EBEAE5",flexShrink:0}}>
              {([["infos","📋 Infos"],["mails","📧 Mails "+(getLinkedEmails(selResaGeneral).length>0?"("+getLinkedEmails(selResaGeneral).length+")":"")],["noteIA","✨ Note IA"],["relances","⏰ Relances"]]).map(([tab,label])=>(
                <button key={tab} onClick={()=>setResaOnglet(tab as any)} style={{flex:1,padding:"10px 0",fontSize:11,fontWeight:resaOnglet===tab?600:400,color:resaOnglet===tab?"#1A1A1E":"#6B6E7E",background:"transparent",border:"none",borderBottom:`2px solid ${resaOnglet===tab?"#1A1A1E":"transparent"}`,cursor:"pointer",whiteSpace:"nowrap"}}>
                  {label}
                </button>
              ))}
            </div>

            {/* Corps scrollable */}
            <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>

              {/* ── Onglet INFOS ── */}
              {resaOnglet==="infos"&&(
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {/* Statuts */}
                  <div>
                    <div style={{fontSize:9,fontWeight:700,color:"#6B6E7E",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:9}}>Statut</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                      {statuts.map(s=>(
                        <button key={s.id} onClick={()=>{const upd=resas.map(r=>r.id===selResaGeneral.id?{...r,statut:s.id}:r);saveResas(upd);setSelResaGeneral({...selResaGeneral,statut:s.id});}} style={{padding:"6px 15px",borderRadius:100,border:"none",background:(selResaGeneral.statut||"nouveau")===s.id?s.bg:"#F5F4F0",color:(selResaGeneral.statut||"nouveau")===s.id?s.color:"#6B6E7E",fontSize:12,fontWeight:(selResaGeneral.statut||"nouveau")===s.id?700:500,cursor:"pointer"}}>{s.label}</button>
                      ))}
                    </div>
                  </div>
                  {/* Grille infos */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {([["🎉","Type",selResaGeneral.typeEvenement],["👥","Personnes",selResaGeneral.nombrePersonnes?selResaGeneral.nombrePersonnes+" pers.":null],["📅","Date",fmtDateFr(selResaGeneral.dateDebut)],["🕐","Horaires",selResaGeneral.heureDebut+(selResaGeneral.heureFin?" → "+selResaGeneral.heureFin:"")],["📍","Espace",ESPACES.find(e=>e.id===selResaGeneral.espaceId)?.nom],["💰","Budget",selResaGeneral.budget]]).map(([icon,k,v])=>(
                      <div key={k} style={{background:"#F5F4F0",borderRadius:10,padding:"13px 15px"}}>
                        <div style={{fontSize:10,color:"#6B6E7E",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.04em"}}>{icon} {k}</div>
                        <div style={{fontSize:14,fontWeight:500,color:v?"#1A1A1E":"#C5C3BE",fontStyle:v?"normal":"italic"}}>{v||"Non renseigné"}</div>
                      </div>
                    ))}
                  </div>
                  {/* Notes */}
                  {selResaGeneral.notes&&(
                    <div style={{background:"#F5F4F0",borderRadius:10,padding:"13px 15px"}}>
                      <div style={{fontSize:10,color:"#6B6E7E",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>📝 Notes</div>
                      <div style={{fontSize:13,color:"#6B6E7E",lineHeight:1.65}}>{selResaGeneral.notes}</div>
                    </div>
                  )}
                  {/* Note directeur */}
                  <div style={{borderRadius:10,border:"1px solid #EBEAE5",overflow:"hidden"}}>
                    <div style={{padding:"11px 15px",background:"#FAFAF7",borderBottom:"1px solid #EBEAE5"}}>
                      <div style={{fontSize:11,fontWeight:600,color:"#1A1A1E",display:"flex",alignItems:"center",gap:6}}><span>📝</span> Note directeur</div>
                    </div>
                    <div style={{padding:"12px 15px",background:"#FFFFFF"}}>
                      <textarea value={selResaGeneral.noteDirecteur||""} onChange={e=>{const upd=resas.map(r=>r.id===selResaGeneral.id?{...r,noteDirecteur:e.target.value}:r);saveResas(upd);setSelResaGeneral({...selResaGeneral,noteDirecteur:e.target.value});}} placeholder="Note confidentielle réservée à la direction…" rows={3} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #EBEAE5",background:"#F5F4F0",color:"#1A1A1E",fontSize:12,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:"inherit"}}/>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Onglet MAILS ── */}
              {resaOnglet==="mails"&&(()=>{
                const linked = getLinkedEmails(selResaGeneral);
                const replies = Object.entries(sentReplies).filter(([id])=>emailResaLinks[id]===selResaGeneral.id||linked.some(m=>m.id===id)).map(([id,r])=>({...r,id,isSent:true}));
                return linked.length===0&&replies.length===0?(
                  <div style={{textAlign:"center",padding:"40px 16px",color:"#6B6E7E"}}>
                    <div style={{fontSize:32,marginBottom:10}}>✉</div>
                    <div style={{fontSize:13}}>Aucun mail associé</div>
                    <div style={{fontSize:11,marginTop:4}}>à l'adresse {selResaGeneral.email}</div>
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {linked.map(m=>(
                      <div key={m.id}>
                        <div style={{background:"#F5F4F0",borderRadius:10,padding:"13px 15px",border:"1px solid #EBEAE5"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:11,background:"#EFF6FF",color:"#1D4ED8",padding:"2px 7px",borderRadius:100,fontWeight:600}}>📥 Reçu</span>
                              <span style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>{m.from}</span>
                            </div>
                            <span style={{fontSize:11,color:"#6B6E7E",flexShrink:0}}>{m.date}</span>
                          </div>
                          <div style={{fontSize:12,color:"#6B6E7E",lineHeight:1.5,marginBottom:10}}>{(m.snippet||"").slice(0,120)}{(m.snippet||"").length>120?"…":""}</div>
                          <button onClick={()=>{ouvrirMailDepuisEvenement(m,selResaGeneral);}} style={{width:"100%",padding:"7px",borderRadius:7,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",fontSize:12,cursor:"pointer"}}>Ouvrir le mail →</button>
                        </div>
                        {sentReplies[m.id]&&(
                          <div style={{marginLeft:20,marginTop:4,background:"#F0FDF4",borderRadius:10,padding:"11px 14px",border:"1px solid #BBF7D0"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <span style={{fontSize:11,background:"#D1FAE5",color:"#3F5B32",padding:"2px 7px",borderRadius:100,fontWeight:600}}>📤 Vous</span>
                              <span style={{fontSize:11,color:"#6B6E7E"}}>{sentReplies[m.id].date}</span>
                            </div>
                            <div style={{fontSize:12,color:"#374151",lineHeight:1.5,whiteSpace:"pre-wrap"}}>{sentReplies[m.id].text.slice(0,200)}{sentReplies[m.id].text.length>200?"…":""}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── Onglet NOTE IA ── */}
              {resaOnglet==="noteIA"&&(
                <div>
                  {noteIA[selResaGeneral.id]
                    ? <div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                          <span style={{fontSize:11,color:"#9CA3AF",fontStyle:"italic"}}>Générée le {noteIA[selResaGeneral.id].date}</span>
                          <button onClick={()=>generateNoteIA(selResaGeneral)} disabled={!!genNoteIA} style={{fontSize:11,padding:"5px 12px",borderRadius:6,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:genNoteIA?"wait":"pointer"}}>↺ Régénérer</button>
                        </div>
                        <div style={{fontSize:13,color:"#1A1A1E",lineHeight:1.75,whiteSpace:"pre-wrap"}}>{noteIA[selResaGeneral.id].text}</div>
                      </div>
                    : <div style={{textAlign:"center",padding:"40px 0"}}>
                        <div style={{fontSize:32,marginBottom:10}}>✨</div>
                        <div style={{fontSize:13,color:"#6B6E7E",marginBottom:16}}>Générez une note de briefing basée sur les échanges emails</div>
                        <button onClick={()=>generateNoteIA(selResaGeneral)} disabled={!!genNoteIA} style={{padding:"10px 20px",borderRadius:8,border:"none",background:"#1A1A1E",color:"#B8924F",fontSize:12,fontWeight:600,cursor:genNoteIA?"wait":"pointer",display:"flex",alignItems:"center",gap:8,margin:"0 auto"}}>
                          {genNoteIA?<><Spin s={12}/> Génération…</>:"✨ Générer la note"}
                        </button>
                      </div>
                  }
                </div>
              )}

              {/* ── Onglet RELANCES ── */}
              {resaOnglet==="relances"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E"}}>Relances planifiées</div>
                    <button onClick={()=>setShowRelanceForm(selResaGeneral.id)} style={{fontSize:11,padding:"6px 12px",borderRadius:6,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer"}}>+ Ajouter</button>
                  </div>
                  {relances.filter(r=>r.resaId===selResaGeneral.id).length===0
                    ? <div style={{textAlign:"center",padding:"30px 0",color:"#9CA3AF",fontSize:13}}>Aucune relance planifiée</div>
                    : [...relances.filter(r=>r.resaId===selResaGeneral.id)].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(rel=>(
                        <div key={rel.id} style={{padding:"10px 14px",background:"#F5F4F0",borderRadius:8,border:"1px solid #EBEAE5",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:12,fontWeight:600,color:"#1A1A1E"}}>{rel.date}{rel.heure&&` à ${rel.heure}`}</div>
                            {rel.note&&<div style={{fontSize:11,color:"#6B6E7E"}}>{rel.note}</div>}
                          </div>
                          <button onClick={()=>saveRelances(relances.filter(r=>r.id!==rel.id))} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:14,padding:"2px 4px"}}>✕</button>
                        </div>
                      ))
                  }
                  {/* Formulaire ajout relance */}
                  {showRelanceForm===selResaGeneral.id&&(
                    <div style={{background:"#F5F4F0",borderRadius:10,padding:"16px",border:"1px solid #EBEAE5",marginTop:12}}>
                      <div style={{fontSize:13,fontWeight:600,color:"#1A1A1E",marginBottom:12}}>⏰ Programmer une relance</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div><label style={{fontSize:10,color:"#6B6E7E",display:"block",marginBottom:4}}>Date</label><DatePicker value={relanceDate} onChange={v=>setRelanceDate(v)}/></div>
                        <div><label style={{fontSize:10,color:"#6B6E7E",display:"block",marginBottom:4}}>Heure</label><TimePicker value={relanceHeure} onChange={v=>setRelanceHeure(v)} placeholder="Heure"/></div>
                      </div>
                      <div style={{marginBottom:12}}><label style={{fontSize:10,color:"#6B6E7E",display:"block",marginBottom:4}}>Note (optionnel)</label><input value={relanceNote} onChange={e=>setRelanceNote(e.target.value)} placeholder="Ex: Rappeler pour le devis…" style={{...inp}}/></div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{if(!relanceDate)return;const rel={id:"rel_"+Date.now(),resaId:selResaGeneral.id,resaNom:selResaGeneral.nom,resaEmail:selResaGeneral.email,date:relanceDate,heure:relanceHeure,note:relanceNote};saveRelances([...relances,rel]);setShowRelanceForm(null);setRelanceDate("");setRelanceHeure("");setRelanceNote("");toast("Relance programmée !");}} style={{...gold,fontSize:12,padding:"8px 16px"}}>Confirmer</button>
                        <button onClick={()=>setShowRelanceForm(null)} style={{...out,fontSize:12}}>Annuler</button>
                      </div>
                    </div>
                  )}
                  <button onClick={()=>{setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");setShowRelanceIA(selResaGeneral);}} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:"#1A1A1E",color:"#B8924F",fontSize:12,fontWeight:600,cursor:"pointer",marginTop:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>✨ Générer une relance IA</button>
                </div>
              )}
            </div>

            {/* Actions bas — identiques peu importe l'origine */}
            <div style={{padding:"14px 24px",borderTop:"1px solid #EBEAE5",display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={()=>setEditResaPanel({...selResaGeneral})} style={{...out,fontSize:12,padding:"9px",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>✏️ Modifier</button>
                <button onClick={()=>setShowRelanceForm(selResaGeneral.id)} style={{padding:"9px",borderRadius:8,border:"1px solid #FDE68A",background:"#FFFBEB",color:"#92400E",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>⏰ Relance date</button>
                <button onClick={()=>{setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");setShowRelanceIA(selResaGeneral);}} style={{padding:"9px",borderRadius:8,border:"none",background:"#1A1A1E",color:"#B8924F",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>✨ Mail relance IA</button>
                <button onClick={()=>openSendMail(selResaGeneral)} style={{...gold,fontSize:12,padding:"9px",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>📤 Envoyer mail</button>
              </div>
              <button onClick={()=>{if(!window.confirm(`Supprimer l'événement de ${selResaGeneral.nom||"ce client"} ? Cette action est irréversible.`))return;saveResas(resas.filter(r=>r.id!==selResaGeneral.id));setSelResaGeneral(null);toast("Supprimé");}} style={{width:"100%",padding:"9px",borderRadius:8,border:"1px solid #FCA5A5",background:"transparent",color:"#DC2626",fontSize:12,cursor:"pointer"}}>Supprimer l'événement</button>
            </div>
          </div>
        </div>
      )}

      {/* Formulaire modification événement (inline dans la modale) */}
      {editResaPanel&&selResaGeneral&&(
        <div style={{position:"fixed",inset:0,zIndex:601,display:"flex",alignItems:"stretch",justifyContent:"flex-end"}}>
          <div style={{position:"absolute",inset:0,background:"rgba(27,30,43,0.55)"}}/>
          <div style={{position:"relative",width:420,maxWidth:"95vw",height:"100vh",background:"#FFFFFF",display:"flex",flexDirection:"column",overflowY:"auto",boxShadow:"-8px 0 40px rgba(0,0,0,0.2)",borderLeft:"1px solid #EBEAE5"}}>
            <div style={{padding:"16px 18px 12px",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:600,color:"#1A1A1E"}}>✏️ Modifier l'événement</div>
              <button onClick={()=>setEditResaPanel(null)} style={{width:28,height:28,borderRadius:6,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{padding:18,display:"flex",flexDirection:"column",gap:10,overflowY:"auto",flex:1}}>
              {([["nom","👤 Nom"],["email","📧 Email"],["telephone","📞 Téléphone"],["entreprise","🏢 Entreprise"],["nombrePersonnes","👥 Nb personnes"]]).map(([k,l])=>(
                <div key={k}><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>{l}</label><input value={editResaPanel[k]||""} onChange={e=>setEditResaPanel({...editResaPanel,[k]:e.target.value})} style={{...inp}}/></div>
              ))}
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>📅 Date</label><DatePicker value={editResaPanel.dateDebut||""} onChange={v=>setEditResaPanel({...editResaPanel,dateDebut:v})}/></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>🕐 Heure début</label><TimePicker value={editResaPanel.heureDebut||""} onChange={v=>setEditResaPanel({...editResaPanel,heureDebut:v})} placeholder="Heure début"/></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>🕕 Heure fin</label><TimePicker value={editResaPanel.heureFin||""} onChange={v=>setEditResaPanel({...editResaPanel,heureFin:v})} placeholder="Heure fin"/></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>📍 Espace</label><select value={editResaPanel.espaceId||espacesDyn[0]?.id||""} onChange={e=>setEditResaPanel({...editResaPanel,espaceId:e.target.value})} style={{...inp}}>{ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>🎉 Type</label><input value={editResaPanel.typeEvenement||""} onChange={e=>setEditResaPanel({...editResaPanel,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, Dîner…" style={{...inp}}/></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>💰 Budget</label><input value={editResaPanel.budget||""} onChange={e=>setEditResaPanel({...editResaPanel,budget:e.target.value})} placeholder="Ex: 5 000€…" style={{...inp}}/></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>🏷 Statut</label><select value={editResaPanel.statut||"nouveau"} onChange={e=>setEditResaPanel({...editResaPanel,statut:e.target.value})} style={{...inp}}>{statuts.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:4}}>📝 Notes</label><textarea value={editResaPanel.notes||""} onChange={e=>setEditResaPanel({...editResaPanel,notes:e.target.value})} rows={3} style={{...inp,resize:"vertical",lineHeight:1.6}}/></div>
              <div style={{display:"flex",gap:8,paddingTop:4}}>
                <button onClick={()=>{if(!editResaPanel.nom)return;const upd=resas.map(r=>r.id===editResaPanel.id?editResaPanel:r);saveResas(upd);setSelResaGeneral(editResaPanel);setEditResaPanel(null);toast("Mis à jour !");}} style={{flex:1,...gold,padding:"10px"}}>Enregistrer</button>
                <button onClick={()=>setEditResaPanel(null)} style={{...out}}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODALE RADAR — CRÉER RÉSERVATION ══ */}
      {radarResaModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99998,padding:24}}>
          <div style={{background:"#FFFFFF",borderRadius:16,width:"min(540px,100%)",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 32px 80px rgba(0,0,0,.3)"}}>
            <div style={{padding:"18px 22px",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:600,color:"#1A1A1E"}}>📅 Créer la réservation</div>
              <button onClick={()=>setRadarResaModal(null)} style={{width:30,height:30,borderRadius:7,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{background:"#FEF9EE",borderRadius:9,padding:"9px 13px",fontSize:12,color:"#854F0B"}}>Données pré-remplies par ARCHANGE — vérifiez avant de valider.</div>
              {[["nom","👤 Nom"],["email","📧 Email"],["telephone","📞 Téléphone"],["entreprise","🏢 Entreprise"],["nombrePersonnes","👥 Nb personnes"],["budget","💰 Budget"]].map(([k,l])=>(
                <div key={k}><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>{l}</label><input value={radarResaModal[k]||""} onChange={e=>setRadarResaModal({...radarResaModal,[k]:e.target.value})} style={{...inp}}/></div>
              ))}
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>📅 Date</label><DatePicker value={radarResaModal.dateDebut||""} onChange={v=>setRadarResaModal({...radarResaModal,dateDebut:v})}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>🕐 Heure début</label><TimePicker value={radarResaModal.heureDebut||""} onChange={v=>setRadarResaModal({...radarResaModal,heureDebut:v})} placeholder="Heure début"/></div>
                <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>🕕 Heure fin</label><TimePicker value={radarResaModal.heureFin||""} onChange={v=>setRadarResaModal({...radarResaModal,heureFin:v})} placeholder="Heure fin"/></div>
              </div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>🎉 Type d'événement</label><input value={radarResaModal.typeEvenement||""} onChange={e=>setRadarResaModal({...radarResaModal,typeEvenement:e.target.value})} style={{...inp}}/></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>📍 Espace</label><select value={radarResaModal.espaceId||espacesDyn[0]?.id||""} onChange={e=>setRadarResaModal({...radarResaModal,espaceId:e.target.value})} style={{...inp}}>{ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select></div>
              <div><label style={{fontSize:11,color:"#6B6E7E",display:"block",marginBottom:3,fontWeight:500}}>📝 Notes</label><textarea value={radarResaModal.notes||""} onChange={e=>setRadarResaModal({...radarResaModal,notes:e.target.value})} rows={3} style={{...inp,resize:"vertical",lineHeight:1.6}}/></div>
            </div>
            <div style={{padding:"14px 20px",borderTop:"1px solid #EBEAE5",display:"flex",gap:8,flexShrink:0}}>
              <button onClick={()=>{
                if(!radarResaModal.nom?.trim()){toast("Le nom est requis","err");return;}
                const newResa={...EMPTY_RESA,...radarResaModal,id:Date.now()};
                const updated=[...resas,newResa]; saveResas(updated);
                if(radarResaModal._emailId) saveEmailResaLinks({...emailResaLinks,[radarResaModal._emailId]:newResa.id});
                setRadarTraites(prev=>new Set([...prev,radarResaModal._emailId]));
                setRadarResaModal(null); toast("Réservation créée !");
              }} style={{flex:1,...gold,padding:"10px"}}>Créer la réservation</button>
              <button onClick={()=>setRadarResaModal(null)} style={{...out}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODALE RADAR — GÉNÉRER RÉPONSE ══ */}
      {radarReplyModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99998,padding:24}}>
          <div style={{background:"#FFFFFF",borderRadius:16,width:"min(600px,100%)",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 32px 80px rgba(0,0,0,.3)"}}>
            <div style={{padding:"18px 22px",borderBottom:"1px solid #EBEAE5",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:"#1A1A1E"}}>✨ Réponse ARCHANGE</div>
                <div style={{fontSize:12,color:"#6B6E7E",marginTop:2}}>{radarReplyModal.m?.from}</div>
              </div>
              <button onClick={()=>{setRadarReplyModal(null);setRadarReplyText("");}} style={{width:30,height:30,borderRadius:7,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:20}}>
              {radarReplyLoading
                ? <div style={{display:"flex",alignItems:"center",gap:10,color:"#6B6E7E",padding:"40px 0",justifyContent:"center"}}><Spin s={16}/> Génération en cours…</div>
                : radarReplyText
                  ? <textarea value={radarReplyText} onChange={e=>setRadarReplyText(e.target.value)} rows={14} style={{...inp,lineHeight:1.75,resize:"vertical",fontFamily:"inherit"}}/>
                  : <div style={{color:"#6B6E7E",textAlign:"center",padding:"40px 0",fontSize:13}}>La réponse apparaîtra ici…</div>
              }
            </div>
            <div style={{padding:"14px 20px",borderTop:"1px solid #EBEAE5",display:"flex",gap:8,flexShrink:0}}>
              <button onClick={()=>{navigator.clipboard.writeText(radarReplyText);toast("Copié !");}} disabled={!radarReplyText||radarReplyLoading} style={{flex:1,...out,padding:"10px",opacity:!radarReplyText||radarReplyLoading?0.5:1}}>Copier</button>
              <button onClick={()=>{if(radarReplyModal?.m) {setDrafted(prev=>new Set([...prev,radarReplyModal.m.id]));} setRadarReplyModal(null);setRadarReplyText("");toast("Brouillon marqué !");}} disabled={!radarReplyText||radarReplyLoading} style={{flex:1,...gold,padding:"10px",opacity:!radarReplyText||radarReplyLoading?0.5:1}}>Marquer brouillon</button>
              <button onClick={()=>{setRadarReplyModal(null);setRadarReplyText("");}} style={{...out}}>Fermer</button>
            </div>
          </div>
        </div>
      )}
      {showNewEvent&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#111111",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99999,padding:32}}>
          <div style={{background:"#FFFFFF",borderRadius:16,width:"min(560px,100%)",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 32px 100px rgba(0,0,0,.4)",border:"1px solid #D1D5DB"}}>
            <div style={{padding:"20px 24px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{fontSize:16,fontWeight:700,color:"#111111"}}>🗂 Nouvel événement</div>
              <button onClick={()=>setShowNewEvent(false)} style={{width:32,height:32,borderRadius:8,border:"1px solid #D1D5DB",background:"#F3F4F6",color:"#111111",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",gap:14}}>
              {/* Champs obligatoires */}
              <div style={{background:"#EFF6FF",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#1D4ED8"}}>
                Les champs marqués <strong>*</strong> sont obligatoires
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{fontSize:11,color:newEventErrors.nom?"#DC2626":"#A5A4A0",display:"block",marginBottom:4,fontWeight:600}}>👤 Prénom / Nom *</label>
                  <input value={newEvent.nom||""} onChange={e=>setNewEvent({...newEvent,nom:e.target.value})} style={{...inpLight,borderColor:newEventErrors.nom?"#FCA5A5":"#EBEAE5"}} placeholder="Ex: Jean Dupont"/>
                  {newEventErrors.nom&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {newEventErrors.nom}</div>}
                </div>
                <div>
                  <label style={{fontSize:11,color:newEventErrors.dateDebut?"#DC2626":"#A5A4A0",display:"block",marginBottom:4,fontWeight:600}}>📅 Date de l'événement *</label>
                  <DatePicker value={newEvent.dateDebut||""} onChange={v=>setNewEvent({...newEvent,dateDebut:v})} light={true}/>
                  {newEventErrors.dateDebut&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {newEventErrors.dateDebut}</div>}
                </div>
                <div>
                  <label style={{fontSize:11,color:newEventErrors.heureDebut?"#DC2626":"#A5A4A0",display:"block",marginBottom:4,fontWeight:600}}>🕐 Heure de début *</label>
                  <TimePicker value={newEvent.heureDebut||""} onChange={v=>setNewEvent({...newEvent,heureDebut:v})} placeholder="Heure début" light={true}/>
                  {newEventErrors.heureDebut&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {newEventErrors.heureDebut}</div>}
                </div>
                <div>
                  <label style={{fontSize:11,color:newEventErrors.heureFin?"#DC2626":"#A5A4A0",display:"block",marginBottom:4,fontWeight:600}}>🕕 Heure de fin *</label>
                  <TimePicker value={newEvent.heureFin||""} onChange={v=>setNewEvent({...newEvent,heureFin:v})} placeholder="Heure fin" light={true}/>
                  {newEventErrors.heureFin&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {newEventErrors.heureFin}</div>}
                </div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>📧 Email</label><input value={newEvent.email||""} onChange={e=>setNewEvent({...newEvent,email:e.target.value})} style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>📞 Téléphone</label><input value={newEvent.telephone||""} onChange={e=>setNewEvent({...newEvent,telephone:e.target.value})} style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>🏢 Entreprise</label><input value={newEvent.entreprise||""} onChange={e=>setNewEvent({...newEvent,entreprise:e.target.value})} style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>👥 Nb personnes</label><input type="number" value={newEvent.nombrePersonnes||""} onChange={e=>setNewEvent({...newEvent,nombrePersonnes:e.target.value})} style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>🎉 Type d'événement</label><input value={newEvent.typeEvenement||""} onChange={e=>setNewEvent({...newEvent,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, Dîner…" style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>💰 Budget client</label><input value={newEvent.budget||""} onChange={e=>setNewEvent({...newEvent,budget:e.target.value})} placeholder="Ex: 5 000€…" style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>📍 Espace</label><select value={newEvent.espaceId||espacesDyn[0]?.id||""} onChange={e=>setNewEvent({...newEvent,espaceId:e.target.value})} style={{...inpLight}}>{ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select></div>
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>📝 Notes</label><textarea value={newEvent.notes||""} onChange={e=>setNewEvent({...newEvent,notes:e.target.value})} rows={3} style={{...inpLight,resize:"none",lineHeight:1.6}}/></div>
              </div>
            </div>
            <div style={{padding:"16px 24px",borderTop:"1px solid #EBEAE5",display:"flex",gap:8,flexShrink:0}}>
              <button onClick={()=>{
                const errs:any={};
                if(!newEvent.nom?.trim()) errs.nom="Le prénom/nom est obligatoire";
                if(!newEvent.dateDebut) errs.dateDebut="La date est obligatoire";
                if(!newEvent.heureDebut) errs.heureDebut="L'heure de début est obligatoire";
                if(!newEvent.heureFin) errs.heureFin="L'heure de fin est obligatoire";
                if(Object.keys(errs).length>0){ setNewEventErrors(errs); return; }
                const r={...newEvent,id:"r"+Date.now(),statut:"nouveau",nombrePersonnes:parseInt(newEvent.nombrePersonnes)||newEvent.nombrePersonnes};
                saveResas([...resas,r]); setShowNewEvent(false); setNewEvent({...EMPTY_RESA, espaceId: espacesDyn[0]?.id || ""}); setNewEventErrors({}); toast("Événement créé !");
              }} style={{flex:1,...gold,padding:"11px",fontSize:13}}>✅ Créer l'événement</button>
              <button onClick={()=>setShowNewEvent(false)} style={{...out,padding:"11px 18px",fontSize:13}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      {/* ══ MODALE SUGGESTIONS MODIFICATIONS IA ══ */}
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
                  <span style={{fontSize:20}}>⚡</span>
                  <div style={{fontSize:15,fontWeight:700,color:"#1A1A1E"}}>Modifications détectées</div>
                </div>
                <div style={{fontSize:12,color:"#6B6E7E"}}>
                  ARCHANGE a détecté des changements dans l'email de <strong>{resa.nom || "ce contact"}</strong>. Validez les modifications à appliquer.
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
                      {s.selectionnee&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}
                    </div>
                    {/* Contenu */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#1A1A1E",marginBottom:4}}>{s.label}</div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:"#6B6E7E",background:"#FAFAF7",padding:"2px 8px",borderRadius:6,textDecoration:"line-through"}}>
                          {s.ancienne !== null && s.ancienne !== "" ? String(s.ancienne) : "(vide)"}
                        </span>
                        <span style={{fontSize:12,color:"#6B6E7E"}}>→</span>
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
                    // Mettre à jour selResaGeneral si c'est l'événement ouvert
                    if (selResaGeneral?.id === pendingSuggestions.resaId) setSelResaGeneral((prev:any) => ({...prev, ...patch}));
                    setPendingSuggestions(null);
                    toast(`${selected.length} modification${selected.length>1?"s":""} appliquée${selected.length>1?"s":""}  ✓`);
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

      {/* ── Modal Composer — Nouveau mail ── */}
      {showCompose&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:9980,display:"flex",alignItems:"flex-end",justifyContent:"flex-end",padding:"0 24px 24px"}}>
          <div style={{background:"#FFFFFF",borderRadius:16,boxShadow:"0 24px 80px rgba(0,0,0,.25)",width:540,maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* En-tête */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:"#1A1A1E",borderRadius:"16px 16px 0 0"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#B8924F",letterSpacing:"0.06em"}}>✏ Nouveau message</span>
              <button onClick={()=>{if((composeBody.trim()||composeTo.trim())&&!window.confirm("Fermer sans sauvegarder ?"))return;setShowCompose(false);}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:18}}>×</button>
            </div>
            {/* Champs */}
            <div style={{padding:"12px 16px",borderBottom:"1px solid #EBEAE5"}}>
              <input value={composeTo} onChange={e=>setComposeTo(e.target.value)} placeholder="À : destinataire@exemple.com" style={{width:"100%",border:"none",borderBottom:"1px solid #EBEAE5",outline:"none",fontSize:13,color:"#1A1A1E",padding:"6px 0",marginBottom:8,background:"transparent"}}/>
              <input value={composeSubject} onChange={e=>setComposeSubject(e.target.value)} placeholder="Objet" style={{width:"100%",border:"none",borderBottom:"1px solid #EBEAE5",outline:"none",fontSize:13,color:"#1A1A1E",padding:"6px 0",background:"transparent"}}/>
            </div>
            {/* Corps */}
            <textarea
              value={composeBody}
              onChange={e=>setComposeBody(e.target.value)}
              placeholder="Rédigez votre message…"
              style={{flex:1,padding:"14px 16px",fontSize:13,color:"#1A1A1E",lineHeight:1.8,border:"none",outline:"none",resize:"none",fontFamily:"inherit",minHeight:220}}
              autoFocus
            />
            {/* Actions */}
            <div style={{display:"flex",gap:8,padding:"10px 16px",borderTop:"1px solid #EBEAE5",background:"#F5F4F0"}}>
              <button onClick={sendNewMail} disabled={composeSending||!composeTo.trim()||!composeSubject.trim()||!composeBody.trim()} style={{padding:"9px 22px",borderRadius:8,border:"none",background:"#1A1A1E",color:"#B8924F",fontSize:13,fontWeight:700,cursor:composeSending?"wait":"pointer",display:"flex",alignItems:"center",gap:6,opacity:composeSending||!composeTo.trim()||!composeSubject.trim()||!composeBody.trim()?0.5:1}}>
                {composeSending?<><Spin s={12}/> Envoi…</>:"✉ Envoyer"}
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
                <div style={{fontSize:16,fontWeight:700,color:"#111111"}}>✨ Mail de relance IA</div>
                <div style={{fontSize:12,color:"#9CA3AF",marginTop:3}}>{showRelanceIA.nom}{showRelanceIA.email ? " · " + showRelanceIA.email : ""}</div>
              </div>
              <button onClick={()=>{setShowRelanceIA(null);setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");}} style={{width:32,height:32,borderRadius:8,border:"1px solid #D1D5DB",background:"#F3F4F6",color:"#111111",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:300}}>×</button>
            </div>

            {/* Sélecteur de motif */}
            <div style={{padding:"14px 24px",borderBottom:"1px solid #EBEAE5",flexShrink:0,background:"#FAFAFA"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B6E7E",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:9}}>Motif de la relance</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
                {motifsRelance.map((m, i) => (
                  <div key={i} style={{display:"flex",alignItems:"center",borderRadius:100,border:`1.5px solid ${motifSelectionne===m?"#B8924F":"#EBEAE5"}`,background:motifSelectionne===m?"#FEF3C7":"#FFFFFF",overflow:"hidden"}}>
                    <button onClick={()=>setMotifSelectionne(motifSelectionne===m?"":m)} style={{padding:"5px 10px",fontSize:11,fontWeight:motifSelectionne===m?600:400,color:motifSelectionne===m?"#92400E":"#6B6B72",background:"transparent",border:"none",cursor:"pointer"}}>{m}</button>
                    <button onClick={()=>{const upd=motifsRelance.filter((_,j)=>j!==i);saveMotifsRelance(upd);if(motifSelectionne===m)setMotifSelectionne("");}} title="Supprimer" style={{padding:"5px 8px 5px 0",fontSize:10,color:"#C5C3BE",background:"transparent",border:"none",cursor:"pointer"}} onMouseEnter={e=>(e.currentTarget.style.color="#DC2626")} onMouseLeave={e=>(e.currentTarget.style.color="#C5C3BE")}>×</button>
                  </div>
                ))}
                {showAddMotif?(
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <input autoFocus value={newMotifLabel} onChange={e=>setNewMotifLabel(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newMotifLabel.trim()){const upd=[...motifsRelance,newMotifLabel.trim()];saveMotifsRelance(upd);setNewMotifLabel("");setShowAddMotif(false);}if(e.key==="Escape"){setShowAddMotif(false);setNewMotifLabel("");}}} placeholder="Nouveau motif…" style={{padding:"5px 10px",fontSize:11,borderRadius:100,border:"1.5px solid #B8924F",outline:"none",width:150}}/>
                    <button onClick={()=>{if(newMotifLabel.trim()){const upd=[...motifsRelance,newMotifLabel.trim()];saveMotifsRelance(upd);setNewMotifLabel("");setShowAddMotif(false);}}} style={{padding:"5px 10px",fontSize:11,borderRadius:100,border:"none",background:"#B8924F",color:"#1A1A1E",cursor:"pointer",fontWeight:600}}>+</button>
                    <button onClick={()=>{setShowAddMotif(false);setNewMotifLabel("");}} style={{padding:"5px 8px",fontSize:11,borderRadius:100,border:"1px solid #EBEAE5",background:"transparent",color:"#6B6E7E",cursor:"pointer"}}>✕</button>
                  </div>
                ):(
                  <button onClick={()=>setShowAddMotif(true)} style={{padding:"5px 12px",fontSize:11,borderRadius:100,border:"1.5px dashed #B8924F",background:"transparent",color:"#B8924F",cursor:"pointer",fontWeight:500}}>+ Ajouter</button>
                )}
              </div>
              {motifSelectionne==="Autre"&&<input value={motifPersonnalise} onChange={e=>setMotifPersonnalise(e.target.value)} placeholder="Précisez le motif…" style={{width:"100%",padding:"7px 12px",fontSize:12,borderRadius:8,border:"1px solid #B8924F",outline:"none",marginTop:4}}/>}
              {!motifSelectionne&&<div style={{fontSize:11,color:"#B0AAA2",fontStyle:"italic",marginTop:2}}>Optionnel — guide la rédaction</div>}
            </div>

            {/* Corps */}
            <div style={{flex:1,overflow:"hidden",padding:24,display:"flex",flexDirection:"column"}}>
              {genRelanceIA?(
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,color:"#9CA3AF"}}>
                  <Spin s={32}/>
                  <div style={{fontSize:14,fontWeight:500}}>Rédaction en cours…</div>
                  <div style={{fontSize:12,opacity:.6}}>Analyse de l'historique et du motif sélectionné</div>
                </div>
              ):relanceIAText?(
                <textarea value={relanceIAText} onChange={e=>setRelanceIAText(e.target.value)} style={{flex:1,width:"100%",padding:"16px 18px",fontSize:13,color:"#111111",lineHeight:1.9,border:"1px solid #D1D5DB",borderRadius:12,background:"#F3F4F6",resize:"none",outline:"none",fontFamily:"inherit"}}/>
              ):(
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:"#9CA3AF"}}>
                  <div style={{fontSize:36}}>✨</div>
                  <div style={{fontSize:13,textAlign:"center",maxWidth:280}}>{motifSelectionne?`Motif sélectionné : "${motifSelectionne==="Autre"?motifPersonnalise||"Autre":motifSelectionne}"` : "Sélectionnez un motif ou générez directement"}</div>
                  <button onClick={()=>genRelanceIAFn(showRelanceIA)} style={{...gold,fontSize:12,padding:"9px 20px"}}>✨ Générer le mail</button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{padding:"16px 24px",borderTop:"1px solid #EBEAE5",display:"flex",gap:8,flexShrink:0}}>
              <button onClick={()=>{if(!relanceIAText) return;window.sendPrompt("CREATE_DRAFT|"+showRelanceIA.email+"|Relance — "+showRelanceIA.nom+"|"+relanceIAText);toast("Brouillon créé !");setShowRelanceIA(null);setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");}} disabled={!relanceIAText||genRelanceIA} style={{...gold,flex:1,padding:"11px",fontSize:13,opacity:(!relanceIAText||genRelanceIA)?0.4:1,cursor:(!relanceIAText||genRelanceIA)?"not-allowed":"pointer"}}>📧 Créer le brouillon</button>
              <button onClick={()=>genRelanceIAFn(showRelanceIA)} disabled={genRelanceIA} style={{...out,padding:"11px 18px",fontSize:13,opacity:genRelanceIA?0.4:1,display:"flex",alignItems:"center",gap:6}}>{genRelanceIA?<Spin s={12}/>:"↻"} {relanceIAText?"Regénérer":"Générer"}</button>
              <button onClick={()=>{setShowRelanceIA(null);setRelanceIAText("");setMotifSelectionne("");setMotifPersonnalise("");}} style={{...out,padding:"11px 18px",fontSize:13}}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ENVOYER MAIL ══ */}
      {showSendMail&&(
        <div style={{position:"fixed",inset:0,background:"#111111",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99999,padding:24,backdropFilter:"blur(2px)"}}>
          <div style={{background:"#FFFFFF",borderRadius:18,width:"100%",maxWidth:540,maxHeight:"88vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>
            <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:"#111111"}}>📤 Envoyer un mail</div>
                <div style={{fontSize:12,color:"#9CA3AF",marginTop:3}}>À : <strong>{showSendMail.nom}</strong> · {showSendMail.email}</div>
              </div>
              <button onClick={()=>setShowSendMail(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid #D1D5DB",background:"transparent",color:"#9CA3AF",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
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
                <textarea value={sendMailBody} onChange={e=>setSendMailBody(e.target.value)} placeholder="Rédigez votre message…" rows={9} style={{...inpLight,resize:"none",lineHeight:1.8,flex:1,fontFamily:"inherit"}}/>
              </div>
            </div>
            <div style={{padding:"16px 24px",borderTop:"1px solid #EBEAE5",display:"flex",gap:8,flexShrink:0,background:"#F3F4F6"}}>
              <button onClick={()=>{ window.sendPrompt("CREATE_DRAFT|"+showSendMail.email+"|"+sendMailSubject+"|"+sendMailBody); toast("Brouillon créé !"); setShowSendMail(null); }} disabled={!sendMailBody||!sendMailSubject} style={{...gold,flex:1,padding:"11px",fontSize:13,opacity:!sendMailBody||!sendMailSubject?0.4:1,cursor:!sendMailBody||!sendMailSubject?"not-allowed":"pointer"}}>📧 Créer le brouillon Gmail</button>
              <button onClick={()=>setShowSendMail(null)} style={{...out,fontSize:12,padding:"11px 16px"}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
