'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'



const ESPACES = [
  { id: "rdc", nom: "Rez-de-chaussée", color: "#E8B86D" },
  { id: "patio", nom: "Le Patio", color: "#6DB8A0" },
  { id: "belvedere", nom: "Le Belvédère", color: "#6D9BE8" },
];
const TYPES_EVT = ["Dîner","Déjeuner","Cocktail","Buffet","Conférence","Réunion","Soirée DJ","Karaoké","Soirée à thème"];
const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
type StatutDef = { id: string; label: string; bg: string; color: string };

const DEFAULT_STATUTS: StatutDef[] = [
  { id: "nouveau",    label: "Nouveau",    bg: "#EFF6FF", color: "#1D4ED8" },
  { id: "en_cours",  label: "En cours",   bg: "#FEF3C7", color: "#92400E" },
  { id: "en_attente",label: "En attente", bg: "#FDF4FF", color: "#7E22CE" },
  { id: "confirme",  label: "Confirmé",   bg: "#D1FAE5", color: "#065F46" },
  { id: "annule",    label: "Annulé",     bg: "#FEE2E2", color: "#991B1B" },
];

const SYSTEM_PROMPT = `Tu es ARCHANGE, l'assistant commercial de la brasserie RÊVA (133 avenue de France, 75013 Paris). Tu réponds aux emails reçus par l'établissement avec le niveau d'expertise d'un directeur commercial expérimenté dans la restauration événementielle haut de gamme.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 IDENTITÉ & ÉTABLISSEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

La brasserie RÊVA est un établissement moderne et chaleureux situé dans le 13e arrondissement de Paris, face à la BNF. Elle dispose de trois espaces distincts :

- RDC : espace principal (120m²), capacité 100 personnes assis, idéal pour réceptions et événements de grande envergure
- Patio : espace extérieur couvert (70m²), capacité 75 personnes assis, ambiance intimiste et végétalisée
- Belvédère : espace en hauteur (70m²), capacité 75 personnes assis, vue panoramique sur la BNF — espace premium

RÊVA se positionne comme un lieu de référence pour :
- Réservations de groupes et séminaires
- Événements d'entreprise (afterworks, team buildings, lancements de produits)
- Célébrations privées (anniversaires, mariages, fiançailles)
- Repas de groupe (enterrements de vie de garçon/jeune fille, repas familiaux)
- Partenariats et collaborations professionnelles

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TON RÔLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu incarnes un commercial senior spécialisé dans la restauration événementielle. Tu as une double compétence :
1. Relationnelle : tu crées immédiatement un lien chaleureux et professionnel
2. Commerciale : tu valorises systématiquement l'offre de RÊVA et tu cherches à convertir chaque contact en réservation concrète

Tu ne te contentes jamais de "répondre" — tu accompagnes, tu proposes, tu rassures, tu convaincs avec subtilité.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 SOURCES DE RÉFÉRENCE — PRIORITÉ ABSOLUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu reçois dans ce message un ou plusieurs documents joints (PDFs, fichiers texte) ainsi qu'un contexte personnalisé. Ces éléments constituent la documentation officielle de RÊVA : menus, tarifs, capacités, conditions de réservation, politique d'annulation, horaires, offres spéciales, etc.

Tu dois :
- Lire intégralement chaque document avant de rédiger ta réponse
- Extraire et utiliser les informations précises qu'ils contiennent (chiffres, conditions, noms, tarifs exacts)
- Donner toujours priorité aux informations des documents sur tes connaissances générales
- Si une information demandée par le client figure dans les documents, la restituer avec précision et sans la reformuler au point de la dénaturer
- Si une information n'est pas dans les documents, ne jamais l'inventer — répondre avec élégance : "Notre équipe vous confirme ce point très prochainement"
- En cas de contradiction entre deux documents, privilégier le plus récent ou le plus spécifique

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 PLANNING & DISPONIBILITÉS — TEMPS RÉEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu reçois dans chaque message la liste complète des réservations en cours sous la section === PLANNING EN COURS ===. Chaque ligne indique : l'espace, la date, les horaires, le nombre de personnes et le statut.

RÈGLE DE DISPONIBILITÉ :
Un espace est considéré INDISPONIBLE uniquement si une réservation existante sur ce créneau a un statut confirmé, à savoir : "Confirmé", "Devis signé", "Acompte reçu" ou "Soldé".
Tout autre statut (option, en attente, devis envoyé, etc.) ne bloque pas le créneau — tu peux proposer l'espace, en précisant que la disponibilité sera confirmée sous peu.

COMPORTEMENT SELON LA SITUATION :
1. Espace demandé DISPONIBLE sur le créneau
→ Confirme la disponibilité avec enthousiasme
→ Propose les prochaines étapes (devis, visite, confirmation)
2. Espace demandé INDISPONIBLE sur le créneau
→ Ne dis jamais simplement "ce n'est pas possible"
→ Exprime des regrets sincères mais brefs
→ Rebondis immédiatement sur un autre espace disponible
→ Vends cet espace alternatif en le mettant en valeur :
   - Si RDC pris → valorise le Patio (intimité, végétation, ambiance cosy) ou le Belvédère (vue BNF, espace premium, lumière naturelle)
   - Si Patio pris → valorise le Belvédère (vue panoramique, cadre unique) ou le RDC (grande capacité, polyvalence)
   - Si Belvédère pris → valorise le Patio (charme intimiste) ou le RDC (capacité et flexibilité maximales)
→ Si AUCUN espace n'est disponible sur ce créneau : propose une date ou un horaire alternatif avec bienveillance
3. Créneau non précisé dans l'email
→ Ne fais pas de suppositions sur les disponibilités
→ Demande la date et l'heure souhaitées avant de te prononcer
4. Plusieurs espaces disponibles
→ Oriente vers le plus adapté selon le type d'événement et le nombre de personnes mentionnés
→ Évite de tout lister mécaniquement — guide le client vers le meilleur choix pour lui

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
- De fautes d'orthographe ou de grammaire

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 TYPES D'EMAILS ET COMPORTEMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Demande de réservation ou d'information sur un événement
→ Accueille la demande avec enthousiasme sincère
→ Reformule brièvement le projet pour montrer que tu as bien compris
→ Consulte le planning pour évaluer la disponibilité sur le créneau mentionné
→ Mets en avant l'espace le plus adapté à leur besoin (selon nombre de personnes, type d'événement)
→ Pose 1 ou 2 questions ciblées si des informations manquent (date, nombre de personnes, type de repas)
→ Propose un prochain pas concret (appel, visite, envoi de devis)

2. Demande de devis
→ Remercie pour l'intérêt porté à RÊVA
→ Confirme la réception et le délai de traitement
→ Demande les informations manquantes si nécessaire (date, nombre de convives, budget indicatif, type de prestation)
→ Valorise la flexibilité de l'offre RÊVA

3. Confirmation ou modification d'une réservation existante
→ Confirme les éléments avec précision
→ Résume les informations clés (date, heure, espace, nombre de personnes)
→ Confirme les prochaines étapes (acompte, menu, plan d'accès, etc.)
→ Exprime une anticipation positive de l'événement

4. Demande d'annulation
→ Accuse réception avec compréhension et sans dramatiser
→ Rappelle la politique d'annulation si elle figure dans les documents de référence
→ Propose si possible un report plutôt qu'une annulation définitive
→ Laisse la porte ouverte à une future collaboration

5. Réclamation ou insatisfaction
→ Commence par de l'empathie sincère — ne te défends jamais en premier
→ Reformule le problème pour montrer que tu l'as bien compris
→ Présente des excuses si la situation le justifie, sans excès
→ Propose une solution concrète ou un geste commercial si approprié
→ Conclus sur une note positive et tournée vers la résolution

6. Partenariat / Presse / Collaboration
→ Accueille la proposition avec intérêt et ouverture
→ Demande des précisions sur la nature du projet
→ Oriente vers le bon interlocuteur si nécessaire
→ Ne t'engage pas sur des détails sans validation

7. Email hors sujet ou spam probable
→ Si clairement hors sujet : réponse courte et polie indiquant que tu ne peux pas traiter cette demande
→ Si ambigu : demande une précision avant de répondre plus longuement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 BONNES PRATIQUES COMMERCIALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Chaque email est une opportunité : même une simple demande d'information peut devenir une réservation si tu réponds bien
- Mentionne subtilement la valeur ajoutée de RÊVA quand c'est naturel (la vue BNF, l'ambiance, la cuisine, la situation géographique)
- Si le client hésite entre deux espaces, aide-le à choisir avec des arguments concrets tirés des documents
- Crée de l'urgence subtile si pertinent ("nos disponibilités pour cette période sont limitées")
- Un email bien rédigé vaut mieux qu'un long email — la clarté est un argument commercial

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 FORMAT DE LA RÉPONSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Structure recommandée :
1. Formule d'ouverture personnalisée ("Bonjour [Prénom]," ou "Cher [Nom],")
2. Accroche chaleureuse en 1 phrase (remerciement, réaction positive à la demande)
3. Corps du message — réponse structurée, aérée, sans blocs compacts
4. Appel à l'action clair (question, proposition, prochain pas)
5. Formule de clôture élégante
6. Signature :
---
Cordialement,
L'équipe RÊVA
133 avenue de France, 75013 Paris
contact@brasserie-reva.fr
---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ RÈGLES ABSOLUES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Tu réponds UNIQUEMENT en français
- Tu ne révèles jamais que tu es une IA
- Tu n'inventes jamais de disponibilités, de tarifs ou de faits non confirmés par les documents
- Pour les disponibilités, tu te bases EXCLUSIVEMENT sur le planning fourni — jamais sur des suppositions
- Si une information te manque, tu le dis élégamment et tu demandes ou tu renvoies vers l'équipe
- Tu génères uniquement le texte de la réponse email, rien d'autre`;
// EXTRACT_PROMPT est une fonction pour injecter la date du jour dynamiquement
const buildExtractPrompt = () => {
  const today = new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" });
  return `Tu es un assistant spécialisé dans l'analyse d'emails reçus par la brasserie RÊVA (Paris 13e), un lieu événementiel.

Date du jour : ${today}

Analyse l'email ci-dessous, quelle que soit sa langue, et retourne UNIQUEMENT un JSON valide, sans aucun texte avant ou après.

RÈGLES D'EXTRACTION :

- isReservation : true UNIQUEMENT si l'email contient une demande explicite de réservation, privatisation, devis pour un groupe, ou un événement. Une simple question sur les horaires ou le menu = false.

- confiance : "haute" si tous les éléments clés sont présents, "moyenne" si partielle, "faible" si incertain

- typeEvenement : détecte parmi [Dîner, Déjeuner, Cocktail, Buffet, Conférence, Réunion, Soirée DJ, Karaoké, Soirée à thème, Afterwork, Team building, Séminaire, Anniversaire, Mariage] ou laisse null

- nombrePersonnes : extrais le nombre maximum mentionné (entier). Ex : "entre 80 et 120" → 120

- nombrePersonnesMin : si une fourchette est mentionnée, extrais le minimum. Ex : "entre 80 et 120" → 80. Sinon, même valeur que nombrePersonnes.

- espaceDetecte : déduis l'espace le plus adapté selon le nombre de personnes (nombrePersonnes) et le type :
    * < 30 personnes    → "belvedere" ou "patio"
    * 30 à 75 personnes → "patio" ou "belvedere"
    * 76 à 100 personnes → "rdc"
    * > 100 personnes   → "rdc" (capacité maximale à signaler)
  Si l'espace est mentionné explicitement dans l'email, utilise-le en priorité.

- dateDebut : format YYYY-MM-DD. Pour les dates relatives, utilise la date du jour fournie en référence. Si le mois est mentionné sans année, prends l'année en cours si la date n'est pas encore passée, sinon l'année suivante. Si non mentionné → null.

- heureDebut / heureFin : format HH:MM. Si non mentionné → null

- budget : extrais le budget si mentionné (ex: "1900€", "45€/pers"), sinon null

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
  "statutSuggere": "nouveau"
}`;
};

const INIT_EMAILS = [
  { id:"z1", from:"Brigitte FLORIN", fromEmail:"bflogold@gmail.com", subject:"[Zenchef] Privatisation cocktail dînatoire – 13 juin", date:"22 mars", snippet:"Privatiser un espace pour 50 personnes, cocktail dînatoire, musique pour danser, 13 juin", body:"Bonjour,\n\nJ'aimerais privatiser un espace pour 50 personnes avec cocktail dînatoire et possibilité de passer notre musique pour danser. Ce serait pour le 13 juin.\n\nNom : FLORIN · Prénom : BRIGITTE · Email : bflogold@gmail.com · Tél : +33 6 18 12 29 57", flags:[], aTraiter:true, unread:true },
  { id:"z2", from:"Anne Légier", fromEmail:"anne.legier@u-paris.fr", subject:"[Zenchef] Devis déjeuner 6 personnes – 16 avril", date:"25 mars", snippet:"Devis pour 6 personnes, déjeuner midi 16 avril, bon de commande Université Paris Cité, option végétarienne", body:"Bonjour,\n\nSerait-il possible d'avoir un devis pour 6 personnes pour le repas de midi le 16 avril (entrée, plat, dessert, café, boisson avec option végétarienne). Nous aimerions faire un bon de commande université Paris Cité.\n\nNom : Légier · Prénom : Anne · Email : anne.legier@u-paris.fr · Tél : 0628058529", flags:["flag"], aTraiter:true, unread:true },
  { id:"z3", from:"Dooanistah Bumma", fromEmail:"dooanistah.bumma@accenture.com", subject:"[Zenchef] Dîner corporate 20 personnes – 15 avril", date:"26 mars", snippet:"Dîner corporate 20 personnes, buffet chic avec places assises, 19h-23h45, budget 1900€ – Accenture", body:"Bonjour,\n\nNous souhaitons organiser un dîner corporate avec un client.\n\nDate : Mercredi 15 avril 2026 · 19h00 à 23h45\nPersonnes : 20\nFormat : Buffet chic assis, options végétariennes, boissons (3-4 verres/pers)\nBudget : 1 900€\n\nNom : Bumma · Prénom : Dooanistah · Email : dooanistah.bumma@accenture.com · Tél : +33176708333", flags:["star","flag"], aTraiter:true, unread:true },
  { id:"z4", from:"Sandra Robin", fromEmail:"groups@railtour.ch", subject:"[Zenchef] Groupe 36 personnes – 17 oct. 2026", date:"27 mars", snippet:"Groupe touristique 36 personnes, dîner 19h30, vendredi 17 octobre 2026 – Railtour Suisse", body:"Bonjour,\n\nRailtour Suisse SA est un tour-opérateur. Pour un groupe voyageant à Paris nous recherchons un restaurant.\n\nDate : Vendredi 17/10/2026 · Heure : 19h/19h30\nNom du groupe : Xware · Personnes : env. 36\n\nNom : Robin · Prénom : Sandra · Email : groups@railtour.ch · Tél : +41584554560", flags:[], aTraiter:true, unread:true },
  { id:"z5", from:"Rishita Rastogi", fromEmail:"rishita.rastogi007@gmail.com", subject:"[Zenchef] Options végétariennes ?", date:"1 avr.", snippet:"Demande d'options végétariennes au menu", body:"What options do you have for vegetarian?\n\nNom : Rastogi · Prénom : Rishita · Email : rishita.rastogi007@gmail.com · Tél : +91 6390754841", flags:[], aTraiter:false, unread:true },
  { id:"z6", from:"Amélie Fabre", fromEmail:"amelie.fabre@toohotel.com", subject:"[Zenchef] Salle plénière 80 personnes – sept. 2027", date:"2 avr.", snippet:"Salle plénière 80 personnes, 21-23 septembre 2027, pause + déjeuner – Too Hotel", body:"Bonjour,\n\nUn client organise un événement du 21 au 23 septembre 2027. Besoin d'une salle plénière 80 personnes + pause matinée + déjeuner.\n\nNom : Fabre · Prénom : Amélie · Email : Amelie.fabre@toohotel.com · Tél : 07 88 74 51 77", flags:[], aTraiter:true, unread:true },
  { id:"z7", from:"Samuel ROBERT", fromEmail:"samuel.robert@natixis.com", subject:"[Zenchef] Relance devis 20 personnes – Natixis", date:"3 avr.", snippet:"Relance devis 20 personnes, budget 45€/pers – Natixis", body:"Bonjour,\n\nCela fait une semaine que j'ai fait une demande de devis pour 21 personnes (corrigé à 20, budget 45€/pers). Pourriez-vous me dire si cela sera fait bientôt ? Nous avons besoin du devis rapidement.\n\nNom : Robert · Prénom : Samuel · Email : samuel.robert@natixis.com · Tél : 0651943878", flags:["flag"], aTraiter:true, unread:true },
];
const INIT_RESAS = [
  { id:"r1", nom:"Forum INCYBER", email:"theanmolee.arunakiridas@forwardglobal.com", telephone:"+33752520304", entreprise:"ForwardGlobal", typeEvenement:"Cocktail", nombrePersonnes:150, espaceId:"rdc", dateDebut:"2026-06-25", heureDebut:"19:00", heureFin:"00:00", statut:"nouveau", notes:"15 pièces cocktail/pers, softs+alcools, micro HF" },
];
const EMPTY_RESA = { id:null, nom:"", email:"", telephone:"", entreprise:"", typeEvenement:"", nombrePersonnes:"", espaceId:"rdc", dateDebut:"", heureDebut:"", heureFin:"", statut:"nouveau", notes:"", budget:"", noteDirecteur:"" };

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

// ─── Nettoyage HTML des corps d'emails ───────────────────────────────────────
function cleanEmailBody(raw: string): string {
  if (!raw) return "";
  // Décoder les entités HTML courantes
  const entities: Record<string,string> = {
    "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'",
    "&nbsp;":" ","&apos;":"'","&hellip;":"…","&mdash;":"—","&ndash;":"–",
    "&laquo;":"«","&raquo;":"»","&eacute;":"é","&egrave;":"è","&ecirc;":"ê",
    "&agrave;":"à","&acirc;":"â","&ocirc;":"ô","&ugrave;":"ù","&ucirc;":"û",
    "&iuml;":"ï","&ccedil;":"ç","&oslash;":"ø","&copy;":"©","&reg;":"®",
  };
  let text = raw;
  // Remplacer les entités nommées
  Object.entries(entities).forEach(([entity, char]) => {
    text = text.replace(new RegExp(entity, "gi"), char);
  });
  // Remplacer les entités numériques (&#123; ou &#x7B;)
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // Remplacer les <br> et <p> par des sauts de ligne avant de striper
  text = text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n");
  // Supprimer toutes les balises HTML restantes
  text = text.replace(/<[^>]+>/g, "");
  // Nettoyer les espaces et lignes vides excessives
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();
  return text;
}

const Spin = ({s=16}: {s?: number}) => (
  <div style={{width:s,height:s,borderRadius:"50%",border:`${Math.max(1.5,s*.1)}px solid rgba(201,169,110,0.2)`,borderTopColor:"#C9A96E",animation:"spin .7s linear infinite",flexShrink:0}} />
);

const Avatar = ({name, size=34}) => {
  const i = name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const p = ["#E8B86D","#6DB8A0","#6D9BE8","#B86D9B","#E86D6D"];
  const bg = p[name.charCodeAt(0)%p.length];
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
    style={{padding:"8px 10px",borderRadius:8,border:light?"1px solid #D1D5DB":"1px solid #DDD8D0",background:light?"#F9FAFB":"#F5F3EF",color:light?value?"#111111":"#9CA3AF":value?"#1C1814":"#8A8178",fontSize:13,width:"100%",cursor:"pointer",appearance:"auto"}}
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

  const bg = light?"#F9FAFB":"#F5F3EF";
  const border = light?"1px solid #D1D5DB":"1px solid #DDD8D0";
  const textMain = light?"#111111":"#1C1814";
  const textSub = light?"#9CA3AF":"#8A8178";

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
                <button key={day} onClick={()=>{onChange(ds);setOpen(false);}} style={{width:"100%",aspectRatio:"1",borderRadius:6,border:"none",background:isSel?"#E8B86D":isTd?"rgba(232,184,109,0.15)":"transparent",color:isSel?"#0F0F0F":isTd?"#E8B86D":"#374151",fontSize:12,fontWeight:isSel||isTd?700:400,cursor:"pointer"}}>
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

const MAIL_CATS = [
  {id:"nonlus",   icon:"🔵", label:"Non lus"},
  {id:"atraiter", icon:"📋", label:"À traiter"},
  {id:"star",     icon:"⭐", label:"Favoris"},
  {id:"flag",     icon:"🚩", label:"Flaggés"},
];

export default function App() {
  const { data: session, status } = useSession()
  const router = useRouter()
  useEffect(() => { if (status === "unauthenticated") router.replace("/") }, [status, router])
  const [view, setView] = useState("general");
  const [emails, setEmails] = useState([]);
  const [resas, setResas] = useState<any[]>([]);
  const [sel, setSel] = useState(null);
  const [reply, setReply] = useState("");
  const [genReply, setGenReply] = useState(false);
  const [extracted, setExtracted] = useState<any>(null);
  // Cache des réponses par email ID — évite les regénérations inutiles
  const [repliesCache, setRepliesCache] = useState<Record<string,{reply:string,editReply:string,extracted:any|null}>>({});
  const [drafted, setDrafted] = useState(new Set());
  const [editing, setEditing] = useState(false);
  const [editReply, setEditReply] = useState("");
  const [notif, setNotif] = useState<{msg:string,type:string}|null>(null);
  const notifTimer = useRef<any>(null);
  const toast = (msg: string, type = "ok") => {
    if (notifTimer.current) clearTimeout(notifTimer.current);
    setNotif({ msg, type });
    notifTimer.current = setTimeout(() => setNotif(null), 3000);
  };
  useEffect(() => () => { if (notifTimer.current) clearTimeout(notifTimer.current); }, []);
  const [docs, setDocs] = useState([]);
  const [loadingMail, setLoadingMail] = useState(false);
  const [calDate, setCalDate] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selResa, setSelResa] = useState(null);
  const [editResa, setEditResa] = useState(null);
  const [links, setLinks] = useState({website:"",instagram:"",facebook:"",other:""});
  const [linksFetched, setLinksFetched] = useState({});
  const [fetchingLink, setFetchingLink] = useState(null);
  const [customCtx, setCustomCtx] = useState("");
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
  const [showMailHistory, setShowMailHistory] = useState(false);
  // UI collapse state
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [subCollapsed, setSubCollapsed] = useState(false);
  // Relances
  const [relances, setRelances] = useState<any[]>([]);
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
  const [calWeekStart, setCalWeekStart] = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)); d.setHours(0,0,0,0); return d; });
  // Sources IA sections open/collapsed state
  const [srcSections, setSrcSections] = useState({liens:true, contexte:true, docs:true});  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState<any>({...EMPTY_RESA});
  const [newEventErrors, setNewEventErrors] = useState<any>({});
  const [initializing, setInitializing] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  const firstDay = (d: Date) => { const f = new Date(d.getFullYear(),d.getMonth(),1).getDay(); return f===0?6:f-1; };
  const resasDay = (day: number) => { const ds=calDate.getFullYear()+"-"+String(calDate.getMonth()+1).padStart(2,"0")+"-"+String(day).padStart(2,"0"); return resas.filter(r=>r.dateDebut===ds); };

  // ─── Récupère tous les emails liés à un événement ─────────────────────────
  // Combine : lien IA explicite OU match par email du contact OU match par nom
  const getLinkedEmails = (resa: any) => {
    if (!resa) return [];
    return emails.filter(m => {
      // 1. Lien IA explicite sauvegardé
      if (emailResaLinks[m.id] === resa.id) return true;
      // 2. Match exact par adresse email
      if (resa.email && m.fromEmail && m.fromEmail.toLowerCase() === resa.email.toLowerCase()) return true;
      // 3. Match par nom (fallback) — premier mot du nom du contact dans l'expéditeur
      if (resa.nom && m.from) {
        const firstWord = resa.nom.toLowerCase().split(" ")[0];
        if (firstWord.length > 2 && m.from.toLowerCase().includes(firstWord)) return true;
      }
      return false;
    });
  };

  // Sauvegarde Supabase — debounce par clé pour éviter les écrasements
  const _saveTimers = React.useRef<Record<string,any>>({});
  const saveToSupabase = (data: Record<string, string>) => {
    Object.entries(data).forEach(([key, value]) => {
      if (_saveTimers.current[key]) clearTimeout(_saveTimers.current[key]);
      _saveTimers.current[key] = setTimeout(async () => {
        try {
          const res = await fetch("/api/user-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [key]: value }),
          });
          if (!res.ok) console.error("Supabase save error:", key, res.status);
        } catch (e) {
          console.error("Supabase save failed:", key, e);
        }
      }, 1000);
    });
  };

  const saveNoteIA = async (n: Record<string,{text:string,date:string}>) => { setNoteIA(n); saveToSupabase({note_ia:JSON.stringify(n)}); };
  const saveStatuts = async (s: StatutDef[]) => { setStatuts(s); saveToSupabase({statuts:JSON.stringify(s)}); };
  const saveResas = async r => { setResas(r); saveToSupabase({resas:JSON.stringify(r)}); };
  const saveRelances = async (r: any[]) => { setRelances(r); saveToSupabase({relances:JSON.stringify(r)}); };
  const saveEmailResaLinks = (links: Record<string,string>) => {
    setEmailResaLinks(links);
    saveToSupabase({ email_resa_links: JSON.stringify(links) });
  };
  const saveMotifsRelance = (m: string[]) => {
    setMotifsRelance(m);
    saveToSupabase({ motifs_relance: JSON.stringify(m) });
  };
  const saveDocs = async (d: any[]) => {
    setDocs(d);
    // PDFs : stocker le base64 en sessionStorage (survit au refresh, pas au fermé/ouvert)
    // Docs texte : stocker en Supabase
    const textDocs = d.filter(x => !x.isPdf);
    const pdfMeta  = d.filter(x =>  x.isPdf).map(x => ({ id: x.id, name: x.name, size: x.size, isPdf: true }));
    // Sauvegarder base64 des PDFs en sessionStorage
    try {
      const pdfData: Record<string,string> = {};
      d.filter(x => x.isPdf && x.base64).forEach(x => { pdfData[x.id] = x.base64; });
      sessionStorage.setItem("arc_pdf_data", JSON.stringify(pdfData));
    } catch {}
    // Sauvegarder meta + texte en Supabase
    saveToSupabase({ docs: JSON.stringify([...textDocs, ...pdfMeta]) });
  };
  const saveLinks = async (l: any) => { setLinks(l); saveToSupabase({links:JSON.stringify(l)}); };
  const saveEmails = (e: any[]) => { setEmails(e); };

  // Fonction partagée de mapping email API → état React
  const mapEmail = (m: any) => ({
    id:        m.id,
    from:      m.from_name  || "",
    fromEmail: m.from_email || "",
    subject:   m.subject    || "(sans objet)",
    date:      m.date       || "",
    snippet:   cleanEmailBody(m.snippet || ""),
    body:      cleanEmailBody(m.body || m.snippet || ""),
    flags:     Array.isArray(m.flags) ? m.flags : [],
    aTraiter:  m.a_traiter  || false,
    unread:    m.is_unread  || false,
  });

  // Chargement/synchronisation des emails — déclenche d'abord une sync Gmail, puis relit Supabase
  const loadEmailsFromApi = async (withSync = false) => {
    setLoadingMail(true);
    try {
      // Si demandé, déclencher une synchronisation Gmail avant de lire
      if (withSync) {
        try {
          await fetch("/api/emails/sync", { method: "POST" });
        } catch {
          // sync non critique — on continue même si ça échoue
        }
      }
      const r = await fetch("/api/emails");
      if (!r.ok) throw new Error("Erreur " + r.status);
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        setEmails(data.map(mapEmail));
        toast(data.length + " emails chargés");
      } else {
        setEmails([]);
        toast("Aucun email — vérifiez la connexion Gmail", "err");
      }
    } catch (e: any) {
      toast("Erreur chargement emails : " + (e.message || "réseau"), "err");
    }
    setLoadingMail(false);
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
        try { if (d.resas)         setResas(JSON.parse(d.resas)); }         catch { /* garde l'état initial */ }
        try {
          if (d.docs) {
            const parsed = JSON.parse(d.docs);
            // Réhydrater les PDFs avec leur base64 depuis sessionStorage
            let pdfData: Record<string,string> = {};
            try { pdfData = JSON.parse(sessionStorage.getItem("arc_pdf_data") || "{}"); } catch {}
            const rehydrated = parsed.map((doc: any) =>
              doc.isPdf && pdfData[doc.id] ? { ...doc, base64: pdfData[doc.id] } : doc
            );
            setDocs(rehydrated);
          }
        } catch {}
        try { if (d.links)         setLinks(JSON.parse(d.links)); }         catch {}
        try { if (d.links_fetched) setLinksFetched(JSON.parse(d.links_fetched)); } catch {}
        if (d.context) setCustomCtx(d.context);
        try { if (d.statuts)  { const s = JSON.parse(d.statuts); if (Array.isArray(s) && s.length > 0) setStatuts(s); } } catch {}
        try { if (d.relances)  setRelances(JSON.parse(d.relances)); }  catch {}
        try { if (d.note_ia)   setNoteIA(JSON.parse(d.note_ia)); }     catch {}
        try { if (d.email_resa_links) setEmailResaLinks(JSON.parse(d.email_resa_links)); } catch {}
        try { if (d.motifs_relance) { const m = JSON.parse(d.motifs_relance); if (Array.isArray(m) && m.length > 0) setMotifsRelance(m); } } catch {}
      } else {
        console.error("Chargement données utilisateur échoué :", userData.reason);
      }

      if (emailsData.status === "fulfilled") {
        const data = emailsData.value;
        setEmails(Array.isArray(data) && data.length > 0 ? data.map(mapEmail) : []);
      } else {
        console.error("Chargement emails échoué :", emailsData.reason);
        setEmails([]);
      }

      if (!cancelled) { setInitializing(false); setLoadingMail(false); }
    };

    setLoadingMail(true);
    init();
    return () => { cancelled = true; };
  }, []);

  const toggleFlag = (id: string, flag: string) => {
    const upd = emails.map(m => {
      if (m.id !== id) return m;
      const f = m.flags || [];
      return { ...m, flags: f.includes(flag) ? f.filter((x: string) => x !== flag) : [...f, flag] };
    });
    saveEmails(upd);
    if (sel?.id === id) setSel(upd.find(m => m.id === id) || null);
  };
  const toggleATraiter = (id: string) => {
    const upd = emails.map(m => m.id === id ? { ...m, aTraiter: !m.aTraiter } : m);
    saveEmails(upd);
    if (sel?.id === id) setSel(upd.find(m => m.id === id) || null);
  };

  const filtered = React.useMemo(() => emails.filter(m => {
    const q = search.toLowerCase();
    const matchesSearch = !q
      || m.from?.toLowerCase().includes(q)
      || m.subject?.toLowerCase().includes(q)
      || (m.body || "").toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (mailFilter === "nonlus")   return !!m.unread;
    if (mailFilter === "star")     return (m.flags || []).includes("star");
    if (mailFilter === "flag")     return (m.flags || []).includes("flag");
    if (mailFilter === "atraiter") return !!m.aTraiter;
    return true;
  }), [emails, search, mailFilter]);

  const handleSel = async (emailArg: any) => {
    let email = emailArg;
    if(email.unread) {
      const upd = emails.map(m=>m.id===email.id?{...m,unread:false}:m);
      saveEmails(upd); email={...email,unread:false};
    }
    // Restaurer la réponse mise en cache pour cet email (ne pas effacer !)
    const cached = repliesCache[email.id];
    setReply(cached?.reply || "");
    setEditReply(cached?.editReply || "");
    setExtracted(cached?.extracted || null);
    setEditing(false); setShowPlanForm(false);
    setSel(email);
  };

  const genererReponse = async () => {
    if (!sel) return;
    setGenReply(true);
    setReply(""); setEditReply(""); setExtracted(null);
    try {
      // ── Valider les documents avant envoi ──────────────────────────────────
      const docsValides = docs.filter(d =>
        (d.isPdf && d.base64) || (!d.isPdf && d.content?.trim())
      );
      const docsManquants = docs.filter(d =>
        d.isPdf && !d.base64
      );
      if (docsManquants.length > 0) {
        toast(`⚠️ ${docsManquants.length} PDF(s) non chargés — réimportez-les pour les inclure`, "err");
      }

      // ── Construire la liste des sources utilisées ──────────────────────────
      const sourcesList = docsValides.length > 0
        ? "\n\n=== DOCUMENTS DE RÉFÉRENCE ===\n" +
          docsValides.map(d => `- ${d.name} (${d.isPdf ? "PDF" : "Texte"})`).join("\n") +
          "\nLis intégralement ces documents avant de répondre. Utilise leurs informations avec précision."
        : "";

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

      // ── Construire le contexte complet ─────────────────────────────────────
      const linkCtx = Object.values(linksFetched).filter(Boolean).map((l: any) => l.summary).join("\n\n");
      const sys = SYSTEM_PROMPT
        + sourcesList
        + planningCtx
        + (customCtx ? "\n\n=== CONTEXTE PERSONNALISÉ ===\n" + customCtx : "")
        + (linkCtx ? "\n\n=== INFOS WEB ANALYSÉES ===\n" + linkCtx : "");

      // ── Prompt email ───────────────────────────────────────────────────────
      const prompt = `Email reçu:\nDe: ${sel.from} <${sel.fromEmail}>\nObjet: ${sel.subject}\n\n${sel.body || sel.snippet || ""}\n\nRédige une réponse professionnelle en te basant sur tous les documents fournis et le planning ci-dessus.`;

      const [reponse, infoRaw] = await Promise.allSettled([
        callClaude(prompt, sys, docsValides.length > 0 ? docsValides : null),
        callClaude(
          `Email:\nDe: ${sel.from} <${sel.fromEmail}>\nObjet: ${sel.subject}\n\n${sel.body || sel.snippet || ""}`,
          buildExtractPrompt(), null
        ),
      ]);

      let newReply = "";
      let newExtracted: any = null;

      if (reponse.status === "fulfilled" && reponse.value) {
        newReply = reponse.value;
        setReply(newReply); setEditReply(newReply);
      } else {
        const msg = reponse.status === "rejected" ? (reponse.reason?.message || "Erreur IA") : "Réponse vide";
        toast("Impossible de générer la réponse : " + msg, "err");
      }

      if (infoRaw.status === "fulfilled") {
        try {
          newExtracted = JSON.parse(infoRaw.value.replace(/```json|```/g, "").trim());
          setExtracted(newExtracted);
        } catch { /* extraction silencieuse */ }
      }

      // Mettre en cache la réponse pour cet email
      if (newReply) {
        setRepliesCache(prev => ({
          ...prev,
          [sel.id]: { reply: newReply, editReply: newReply, extracted: newExtracted }
        }));
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
      toast("Erreur : " + (e.message || "connexion impossible"), "err");
    }
    setGenReply(false);
  };

  const openPlanForm = () => {
    const pers = parseInt(String(extracted?.nombrePersonnes || "0"), 10);
    const espaceAuto = extracted?.espaceDetecte || (
      pers > 100 ? "rdc" : pers > 75 ? "rdc" : pers > 30 ? "patio" : "belvedere"
    );
    // Si fourchette détectée, on l'indique dans les notes
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
    };
    setPlanForm(f); setPlanErrors({}); setShowPlanForm(true);
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
    // Lier l'email source à la réservation créée et persister en Supabase
    if (sel?.id) saveEmailResaLinks({ ...emailResaLinks, [sel.id]: r.id });
    toast("Réservation ajoutée au planning !");
    setShowPlanForm(false); setExtracted(null);
  };

  const fetchLink = async (url: string, key: string) => {
    if (!url?.trim()) return;
    setFetchingLink(key);
    try {
      const prompt = `Recherche et analyse ce site web pour la brasserie RÊVA : ${url}\nRésume en 200 mots max : ce que fait ce site, ses services, son ambiance, pour aider à répondre à des emails professionnels.`;
      const sys = "Tu es un assistant qui analyse des sites web pour une brasserie parisienne. Réponds en français, de façon concise et utile.";
      const txt = await callClaude(prompt, sys, null);
      const upd = { ...linksFetched, [key]: { url, summary: txt || "Analyse effectuée.", fetchedAt: new Date().toLocaleDateString("fr-FR") } };
      setLinksFetched(upd);
      saveToSupabase({ links_fetched: JSON.stringify(upd) });
      toast("Analysé !");
    } catch (e: any) {
      toast("Erreur analyse : " + (e.message || "réseau"), "err");
    }
    setFetchingLink(null);
  };

  const handleDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast("Fichier trop volumineux (max 10 Mo)", "err"); return; }
    try {
      const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
      let doc: any;
      if (isPdf) {
        const b64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res((r.result as string).split(",")[1]);
          r.onerror = () => rej(new Error("Lecture du fichier échouée"));
          r.readAsDataURL(file);
        });
        doc = { id: Date.now(), name: file.name, base64: b64, isPdf: true, size: file.size };
      } else {
        const content = await file.text();
        doc = { id: Date.now(), name: file.name, content, isPdf: false, size: file.size };
      }
      saveDocs([...docs, doc]);
      toast(`"${file.name}" ajouté aux sources IA`);
    } catch (err: any) {
      toast("Erreur : " + (err.message || "impossible de lire le fichier"), "err");
    }
    e.target.value = "";
  };

  const genRelanceIAFn = async (resa: any) => {
    setRelanceIAText(""); setGenRelanceIA(true);
    try {
      const linkedMails = getLinkedEmails(resa);
      const hist = linkedMails.length > 0
        ? linkedMails.map(m => `---\nDe: ${m.from}\nDate: ${m.date}\nObjet: ${m.subject}\n${m.body || m.snippet || ""}`).join("\n\n")
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

      const sys = SYSTEM_PROMPT;

      const prompt = `Tu dois rédiger un email de relance pour la brasserie RÊVA.

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
- Signature : L'équipe RÊVA`;

      const txt = await callClaude(prompt, sys, docs);
      setRelanceIAText(txt);
    } catch (e: any) {
      toast("Erreur génération : " + (e.message || "IA indisponible"), "err");
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

      const sys = `Tu es un coordinateur événementiel senior chez RÊVA, expert dans la lecture et l'analyse d'échanges clients. Tu as lu l'intégralité des emails de ce dossier.

Rédige une note de briefing destinée au directeur de RÊVA. Cette note a deux niveaux de lecture distincts.

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
→ Quelles sont les demandes qui sortent du cadre standard de RÊVA ? (décoration, contraintes alimentaires, exigences techniques, flexibilité horaires, etc.)
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
      const txt = await callClaude(prompt, sys, docs);
      const upd = { ...noteIA, [resa.id]: { text: txt, date: new Date().toLocaleDateString("fr-FR") } };
      saveNoteIA(upd);
    } catch (e: any) {
      toast("Erreur génération note : " + (e.message || "IA indisponible"), "err");
    }
    setGenNoteIA(null);
  };

  const openSendMail = (resa) => {
    setShowSendMail(resa);
    setSendMailSubject(`Votre événement chez RÊVA — ${resa.typeEvenement||""}`);
    setSendMailBody("");
  };

  const removeDoc = id => saveDocs(docs.filter(d=>d.id!==id));
  const fmt = s => s>1048576?(s/1048576).toFixed(1)+" Mo":Math.round(s/1024)+" Ko";

  const toggleUnread = id => {
    const upd = emails.map(m=>m.id===id?{...m,unread:!m.unread}:m);
    saveEmails(upd); if(sel?.id===id) setSel(upd.find(m=>m.id===id));
  };

  const total=resas.length, conf=resas.filter(r=>r.statut==="confirme").length, att=resas.filter(r=>r.statut==="en_attente"||r.statut==="nouveau"||r.statut==="en_cours").length;
  const taux=total>0?Math.round(conf/total*100):0;
  const parEspace=ESPACES.map(e=>({...e,n:resas.filter(r=>r.espaceId===e.id).length,c:resas.filter(r=>r.espaceId===e.id&&r.statut==="confirme").length}));
  const parType=TYPES_EVT.map(t=>({t,n:resas.filter(r=>r.typeEvenement===t).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
  const maxN=Math.max(...parEspace.map(e=>e.n),1);
  const srcActives = React.useMemo(
    () => Object.values(linksFetched).filter(Boolean).length + docs.filter(d => (d.isPdf && d.base64) || (!d.isPdf && d.content?.trim())).length + (customCtx ? 1 : 0),
    [linksFetched, docs, customCtx]
  );
  const docsInvalides = React.useMemo(
    () => docs.filter(d => d.isPdf && !d.base64).length,
    [docs]
  );

  const NAV=[
    {id:"general",  icon:"◈",  label:"Événements", badge:resas.filter(r=>r.statut==="nouveau"||!r.statut).length||null},
    {id:"mails",    icon:"⌁",  label:"Mails",       badge:emails.filter(m=>m.unread).length||null},
    {id:"planning", icon:"⧖", label:"Planning"},
    {id:"stats",    icon:"◎", label:"Stats"},
    {id:"sources",  icon:"⟡", label:"Sources IA",  badge:srcActives||null},
  ];

  const inp = {padding:"9px 12px",borderRadius:8,border:"1.5px solid #C8C0B4",background:"#FFFFFF",color:"#1C1814",fontSize:13,width:"100%",outline:"none",transition:"border-color .15s",fontFamily:"'DM Sans',sans-serif"};
  const inpLight = {padding:"9px 12px",borderRadius:8,border:"1.5px solid #C8C0B4",background:"#FFFFFF",color:"#111111",fontSize:13,width:"100%",fontFamily:"'DM Sans',sans-serif"};
  const gold = {padding:"9px 18px",borderRadius:8,border:"none",background:"#C9A96E",color:"#1C1814",fontWeight:600,fontSize:12,cursor:"pointer",letterSpacing:"0.04em",boxShadow:"0 2px 8px rgba(201,169,110,.3)"};
  const out  = {padding:"8px 14px",borderRadius:8,border:"1px solid #D5CFC6",background:"transparent",color:"#3D3530",fontSize:12,cursor:"pointer",letterSpacing:"0.02em"};
  const outLight = {padding:"7px 14px",borderRadius:8,border:"1px solid #D1D5DB",background:"transparent",color:"#374151",fontSize:13,cursor:"pointer"};

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",fontFamily:"'DM Sans', 'Helvetica Neue', sans-serif",background:"#F5F3EF"}}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&display=swap');*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#C9C3B8;border-radius:10px;}::-webkit-scrollbar-thumb:hover{background:#A89E8F;}.mail-row:hover .mail-actions{opacity:1!important}.nav-btn:hover{background:rgba(209,196,178,0.12)!important;}.fade-in{animation:fadeIn .25s ease}@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}"}</style>

      {/* Écran de chargement initial */}
      {initializing && (
        <div style={{position:"fixed",inset:0,background:"#1C1814",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,zIndex:9999}}>
          <div style={{fontSize:11,fontWeight:700,color:"#D1C4B2",letterSpacing:"0.28em",textTransform:"uppercase"}}>ARCHANGE</div>
          <div style={{fontSize:8,color:"rgba(209,196,178,0.4)",letterSpacing:"0.18em",textTransform:"uppercase",marginTop:-8}}>RÊVA · AGENT IA</div>
          <Spin s={18}/>
          <div style={{fontSize:11,color:"rgba(209,196,178,0.35)",letterSpacing:"0.08em"}}>Chargement en cours…</div>
        </div>
      )}

      {notif && <div style={{position:"fixed",bottom:32,left:"50%",transform:"translateX(-50%)",zIndex:9999,padding:"12px 24px",borderRadius:12,background:notif.type==="err"?"#2D0A0A":"#0A1F0E",color:notif.type==="err"?"#FCA5A5":"#6EE7B7",fontSize:13,fontWeight:500,whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,.25)",letterSpacing:"0.01em",border:notif.type==="err"?"1px solid rgba(239,68,68,.2)":"1px solid rgba(52,211,153,.2)"}}>{notif.msg}</div>}

      {/* Nav principale — collapsible */}
      <aside style={{width:navCollapsed?60:200,background:"#1C1814",display:"flex",flexDirection:"column",flexShrink:0,transition:"width .3s cubic-bezier(.4,0,.2,1)",overflow:"hidden",borderRight:"1px solid rgba(209,196,178,0.08)"}}>
        <div style={{padding:navCollapsed?"16px 0 12px":"28px 20px 20px",display:"flex",alignItems:"center",justifyContent:navCollapsed?"center":"space-between",flexShrink:0,borderBottom:"1px solid rgba(209,196,178,0.06)"}}>
          {!navCollapsed&&<div><div style={{fontSize:11,fontWeight:700,color:"#D1C4B2",letterSpacing:"0.28em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>ARCHANGE</div><div style={{fontSize:8,color:"rgba(209,196,178,0.28)",marginTop:5,letterSpacing:"0.18em",textTransform:"uppercase"}}>RÊVA · AGENT IA</div></div>}
          <button onClick={()=>setNavCollapsed(v=>!v)} title={navCollapsed?"Agrandir":"Réduire"} style={{width:22,height:22,borderRadius:5,border:"none",background:"rgba(209,196,178,0.07)",color:"rgba(209,196,178,0.35)",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {navCollapsed?"›":"‹"}
          </button>
        </div>
        <div style={{flex:1,padding:navCollapsed?"8px 6px":"12px 10px",display:"flex",flexDirection:"column",gap:1,overflowY:"auto"}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>{setView(n.id);setSubCollapsed(false);}} title={navCollapsed?n.label:undefined} style={{display:"flex",alignItems:"center",gap:navCollapsed?0:10,width:"100%",padding:navCollapsed?"11px 0":"10px 12px",borderRadius:8,border:"none",background:view===n.id?"rgba(209,196,178,0.1)":"transparent",color:view===n.id?"#D1C4B2":"rgba(209,196,178,0.65)",fontSize:11,textAlign:"left",cursor:"pointer",justifyContent:navCollapsed?"center":"flex-start",position:"relative",transition:"all .15s",letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:view===n.id?600:400}}>
              <span style={{fontSize:15,opacity:.8,fontFamily:"serif"}}>{n.icon}</span>
              {!navCollapsed&&<><span style={{flex:1}}>{n.label}</span>{n.badge>0&&<span style={{fontSize:9,background:view===n.id?"rgba(209,196,178,0.15)":"rgba(209,196,178,0.06)",color:view===n.id?"#D1C4B2":"rgba(209,196,178,0.3)",padding:"2px 7px",borderRadius:100,fontWeight:700,letterSpacing:"0.04em"}}>{n.badge}</span>}</>}              {navCollapsed&&n.badge>0&&<span style={{position:"absolute",top:6,right:6,width:6,height:6,borderRadius:"50%",background:"#C9A96E"}}/>}
            </button>
          ))}
        </div>
        {!navCollapsed&&<div style={{padding:"16px 20px",borderTop:"1px solid rgba(209,196,178,0.06)",flexShrink:0}}>
          <div style={{fontSize:9,color:"rgba(209,196,178,0.22)",lineHeight:1.9,letterSpacing:"0.08em"}}>133 Av. de France<br/>75013 Paris</div>
          <button onClick={()=>signOut({callbackUrl:"/"})} style={{marginTop:8,width:"100%",padding:"6px 0",borderRadius:6,border:"1px solid rgba(209,196,178,0.12)",background:"transparent",color:"rgba(209,196,178,0.35)",fontSize:9,letterSpacing:"0.08em",cursor:"pointer",textTransform:"uppercase"}}>⎋ Déconnexion</button>
        </div>}
      </aside>

      <main style={{flex:1,display:"flex",overflow:"hidden",minWidth:0}}>

        {/* ══ GÉNÉRAL ══ */}
        {view==="general" && (
          <div style={{display:"flex",flex:1,overflow:"hidden"}}>
            {/* Sidebar filtres statuts — collapsible */}
            <div style={{width:subCollapsed?44:210,background:"#221E19",display:"flex",flexDirection:"column",flexShrink:0,borderRight:"1px solid rgba(209,196,178,0.06)",transition:"width .2s ease",overflow:"hidden"}}>
              <div style={{padding:subCollapsed?"10px 6px":"16px 12px 10px",display:"flex",alignItems:"center",justifyContent:subCollapsed?"center":"space-between",flexShrink:0}}>
                {!subCollapsed&&<div style={{fontSize:9,fontWeight:700,color:"rgba(209,196,178,0.45)",letterSpacing:"0.16em",textTransform:"uppercase"}}>Filtrer</div>}
                <button onClick={()=>setSubCollapsed(v=>!v)} title={subCollapsed?"Agrandir":"Réduire"} style={{width:22,height:22,borderRadius:5,border:"none",background:"rgba(209,196,178,0.07)",color:"rgba(209,196,178,0.35)",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {subCollapsed?"›":"‹"}
                </button>
              </div>
              {subCollapsed?(
                <div style={{padding:"4px 6px",display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>
                  <button onClick={()=>setGeneralFilter("all")} title="Tous" style={{width:32,height:32,borderRadius:8,border:"none",background:generalFilter==="all"?"rgba(232,184,109,0.15)":"transparent",color:generalFilter==="all"?"#E8B86D":"rgba(209,196,178,0.4)",cursor:"pointer",fontSize:14}}>🗂</button>
                  {statuts.map(s=>(
                    <button key={s.id} onClick={()=>setGeneralFilter(s.id)} title={s.label} style={{width:32,height:32,borderRadius:8,border:"none",background:generalFilter===s.id?"rgba(232,184,109,0.15)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.color}}/>
                    </button>
                  ))}
                  <button onClick={()=>setGeneralFilter("arelancer")} title="À relancer" style={{width:32,height:32,borderRadius:8,border:"none",background:generalFilter==="arelancer"?"rgba(232,184,109,0.15)":"transparent",cursor:"pointer",fontSize:14}}>⏰</button>
                </div>
              ):(
                <>
                  <div style={{padding:"0 12px 10px",flex:1,overflowY:"auto"}}>
                    <button onClick={()=>setGeneralFilter("all")} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"8px 10px",borderRadius:8,border:"none",background:generalFilter==="all"?"rgba(209,196,178,0.1)":"transparent",color:generalFilter==="all"?"#D1C4B2":"rgba(209,196,178,0.4)",fontSize:11,textAlign:"left",cursor:"pointer",marginBottom:2}}>
                      <span>🗂 Tous</span>
                      <span style={{fontSize:10,opacity:.6}}>{resas.length}</span>
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
                          style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"7px 10px",borderRadius:8,background:generalFilter===s.id?"rgba(232,184,109,0.12)":"transparent",marginBottom:2,cursor:"grab",userSelect:"none",opacity:dragStatutIdx===idx?0.4:1}}
                        >
                          <button onClick={()=>setGeneralFilter(s.id)} style={{display:"flex",alignItems:"center",gap:7,background:"none",border:"none",color:generalFilter===s.id?"#D1C4B2":"rgba(209,196,178,0.4)",fontSize:11,textAlign:"left",cursor:"pointer",flex:1,padding:0,letterSpacing:"0.03em"}}>
                            <span style={{fontSize:10,opacity:.3,marginRight:2}}>⠿</span>
                            <div style={{width:8,height:8,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                            <span>{s.label}</span>
                          </button>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            {count>0&&<span style={{fontSize:10,opacity:.6,color:generalFilter===s.id?"#E8B86D":"rgba(209,196,178,0.4)"}}>{count}</span>}
                            <button onClick={e=>{e.stopPropagation();const ok=window.confirm('Supprimer "'+s.label+'" ? Les événements avec ce statut passeront à "Nouveau".');if(!ok) return;const arr=statuts.filter(x=>x.id!==s.id);saveStatuts(arr);if(generalFilter===s.id)setGeneralFilter("all");toast("Statut supprimé");}} title="Supprimer ce statut" style={{width:16,height:16,borderRadius:4,border:"none",background:"transparent",color:"rgba(209,196,178,0.2)",cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1,flexShrink:0}} onMouseEnter={e=>(e.currentTarget.style.color="rgba(239,68,68,0.7)")} onMouseLeave={e=>(e.currentTarget.style.color="rgba(209,196,178,0.2)")}>✕</button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Séparateur + À relancer */}
                    <div style={{height:1,background:"rgba(209,196,178,0.1)",margin:"12px 0"}}/>
                    <button onClick={()=>setGeneralFilter("arelancer")} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"8px 10px",borderRadius:8,border:"none",background:generalFilter==="arelancer"?"rgba(209,196,178,0.1)":"transparent",color:generalFilter==="arelancer"?"#D1C4B2":"rgba(209,196,178,0.4)",fontSize:11,textAlign:"left",cursor:"pointer"}}>
                      <span>⏰ À relancer</span>
                      {relances.length>0&&<span style={{fontSize:10,opacity:.6}}>{relances.length}</span>}
                    </button>
                  </div>

                  <div style={{padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                    {showCreateStatut?(
                      <div>
                        <div style={{fontSize:11,color:"rgba(209,196,178,0.38)",marginBottom:8}}>Nouveau statut</div>
                        <input value={newStatutLabel} onChange={e=>setNewStatutLabel(e.target.value)} placeholder="Nom du statut…" style={{width:"100%",padding:"6px 9px",borderRadius:7,border:"1px solid rgba(209,196,178,0.15)",background:"rgba(209,196,178,0.05)",color:"#E8DFD0",fontSize:12,marginBottom:8,outline:"none"}}/>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <span style={{fontSize:11,color:"rgba(209,196,178,0.38)"}}>Couleur</span>
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
                          }} style={{flex:1,padding:"6px",borderRadius:7,border:"none",background:"#E8B86D",color:"#0F0F0F",fontSize:11,fontWeight:600,cursor:"pointer"}}>Créer</button>
                          <button onClick={()=>{setShowCreateStatut(false);setNewStatutLabel("");}} style={{padding:"6px 8px",borderRadius:7,border:"1px solid rgba(255,255,255,0.12)",background:"transparent",color:"rgba(209,196,178,0.4)",fontSize:11,cursor:"pointer"}}>✕</button>
                        </div>
                      </div>
                    ):(
                      <button onClick={()=>setShowCreateStatut(true)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px dashed rgba(209,196,178,0.18)",background:"transparent",color:"rgba(209,196,178,0.35)",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                        <span>+</span> Créer un statut
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Liste des réservations */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"#F5F3EF"}}>
              <div style={{padding:"20px 24px 0",flexShrink:0,display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:22,fontWeight:300,color:"#1C1814",fontFamily:"'Cormorant Garamond',serif",letterSpacing:"0.01em"}}>Événements</div>
                  <div style={{fontSize:11,color:"#A09890",marginTop:3}}>
                    {generalFilter==="all"?`${resas.length} demande${resas.length!==1?"s":""}`:
                    `${resas.filter(r=>(r.statut||"nouveau")===generalFilter).length} demande${resas.filter(r=>(r.statut||"nouveau")===generalFilter).length!==1?"s":""} · ${statuts.find(s=>s.id===generalFilter)?.label||""}`}
                  </div>
                </div>
                <button onClick={()=>{ setNewEvent({...EMPTY_RESA}); setNewEventErrors({}); setShowNewEvent(true); }} style={{...gold}}>+ Nouvelle demande</button>
              </div>
              <div style={{padding:"12px 24px",flexShrink:0,position:"relative"}}>
                <span style={{position:"absolute",left:36,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#A09890",pointerEvents:"none"}}>🔍</span>
                <input value={searchEvt} onChange={e=>setSearchEvt(e.target.value)} placeholder="Rechercher par nom, entreprise, type, date…" style={{...inp,paddingLeft:32,paddingRight:searchEvt?28:12}} />
                {searchEvt&&<button onClick={()=>setSearchEvt("")} style={{position:"absolute",right:36,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#A09890",cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 4px"}}>×</button>}
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"0 24px 20px"}}>

              {/* Vue À relancer */}
              {generalFilter==="arelancer"&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                    <span style={{fontSize:16,fontWeight:600,color:"#1C1814"}}>⏰ À relancer</span>
                    <span style={{fontSize:12,color:"#8A8178"}}>{relances.length} relance{relances.length!==1?"s":""}</span>
                  </div>
                  {relances.length===0?(
                    <div style={{textAlign:"center",padding:"60px 24px",color:"#8A8178"}}>
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
                          <div key={rel.id} onClick={()=>resa&&setSelResaGeneral(resa)} style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1",padding:"14px 18px",cursor:resa?"pointer":"default",display:"flex",alignItems:"center",gap:14,borderLeft:`3px solid ${isOverdue?"#DC2626":"#F59E0B"}`}}>
                            <div style={{width:36,height:36,borderRadius:"50%",background:isOverdue?"#FEE2E2":"#FFFBEB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>⏰</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:600,color:"#1C1814",marginBottom:3}}>{rel.resaNom||"—"}</div>
                              <div style={{fontSize:12,color:isOverdue?"#DC2626":"#92400E",fontWeight:isOverdue?600:400}}>{isOverdue?"En retard · ":""}{rel.date}{rel.heure&&` à ${rel.heure}`}</div>
                              {rel.note&&<div style={{fontSize:11,color:"#8A8178",marginTop:2}}>{rel.note}</div>}
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
              {generalFilter!=="arelancer"&&(generalFilter==="all"?statuts:[statuts.find(s=>s.id===generalFilter)].filter(Boolean)).map(statut=>{
                const q=searchEvt.toLowerCase();
                const group=resas.filter(r=>(r.statut||"nouveau")===statut.id&&(!q||r.nom?.toLowerCase().includes(q)||r.entreprise?.toLowerCase().includes(q)||r.typeEvenement?.toLowerCase().includes(q)||r.email?.toLowerCase().includes(q)||r.dateDebut?.includes(q)));
                if(group.length===0) return null;
                return (
                  <div key={statut.id} style={{marginBottom:24}}>
                    {generalFilter==="all"&&(
                      <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10,marginTop:4}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:statut.color}}/>
                        <span style={{fontSize:9,fontWeight:700,color:"#8A8178",textTransform:"uppercase",letterSpacing:"0.14em"}}>{statut.label}</span>
                        <span style={{fontSize:10,color:"#A09890",background:"#EAE6E1",padding:"2px 7px",borderRadius:100}}>{group.length}</span>
                        <div style={{flex:1,height:1,background:"#E8E4DF"}}/>
                      </div>
                    )}
                    {group.length===0&&generalFilter!=="all"&&(
                      <div style={{textAlign:"center",padding:"48px 24px",color:"#8A8178",fontSize:13}}>
                        <div style={{fontSize:32,marginBottom:8}}>📭</div>
                        Aucune demande avec ce statut
                      </div>
                    )}
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {group.map(r=>{
                        const st=statuts.find(s=>s.id===(r.statut||"nouveau"))||statuts[0];
                        const linkedEmails=getLinkedEmails(r);
                        return (
                          <div key={r.id} onClick={()=>setSelResaGeneral(r)} style={{background:"#FFFFFF",borderRadius:10,border:"1px solid #EAE6E1",padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,borderLeft:`3px solid ${st.color}`,boxShadow:selResaGeneral?.id===r.id?"0 2px 10px rgba(28,24,20,.07)":"0 1px 3px rgba(28,24,20,.04)"}}>
                            <Avatar name={r.nom||"?"} size={34}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:600,color:"#1C1814",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                {r.nom||"—"}{r.entreprise&&<span style={{fontSize:12,fontWeight:400,color:"#8A8178"}}> · {r.entreprise}</span>}
                              </div>
                              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                                {r.typeEvenement&&<span style={{fontSize:11,color:"#5C564F"}}>🎉 {r.typeEvenement}</span>}
                                {r.dateDebut&&<span style={{fontSize:11,color:"#5C564F"}}>📅 {r.dateDebut}</span>}
                                {(r.heureDebut||r.heureFin)&&<span style={{fontSize:11,color:"#5C564F"}}>🕐 {r.heureDebut}{r.heureFin?" → "+r.heureFin:""}</span>}
                                {r.nombrePersonnes&&<span style={{fontSize:11,color:"#5C564F"}}>👥 {r.nombrePersonnes} pers.</span>}
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
              })}
              {resas.length===0?(
                <div style={{textAlign:"center",padding:"80px 24px",color:"#8A8178"}}>
                  <div style={{fontSize:40,marginBottom:12}}>📭</div>
                  <div style={{fontSize:14}}>Aucune demande de réservation</div>
                  <div style={{fontSize:12,marginTop:4}}>Les demandes détectées dans vos mails apparaîtront ici.</div>
                </div>
              ):searchEvt&&resas.filter(r=>{const q=searchEvt.toLowerCase();return r.nom?.toLowerCase().includes(q)||r.entreprise?.toLowerCase().includes(q)||r.typeEvenement?.toLowerCase().includes(q)||r.email?.toLowerCase().includes(q)||r.dateDebut?.includes(q);}).length===0?(
                <div style={{textAlign:"center",padding:"60px 24px",color:"#8A8178"}}>
                  <div style={{fontSize:32,marginBottom:10}}>🔍</div>
                  <div style={{fontSize:14}}>Aucun résultat pour "{searchEvt}"</div>
                  <button onClick={()=>setSearchEvt("")} style={{marginTop:12,background:"none",border:"none",color:"#C9A96E",fontSize:12,cursor:"pointer",fontWeight:600}}>Effacer la recherche</button>
                </div>
              ):null}
              </div>
            </div>

            {/* Panel détail réservation (général) — XL */}
            {selResaGeneral&&!editResaPanel&&(
              <div style={{flex:1,minWidth:380,borderLeft:"1px solid #EAE6E1",background:"#FDFCFA",display:"flex",flexDirection:"column",overflowY:"auto"}}>

                {/* Header avec avatar */}
                <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #EAE6E1",flexShrink:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14}}>
                    <div style={{display:"flex",gap:14,alignItems:"flex-start",flex:1,minWidth:0}}>
                      <Avatar name={selResaGeneral.nom||"?"} size={48}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:18,fontWeight:600,color:"#1C1814",letterSpacing:"-0.01em",marginBottom:5}}>{selResaGeneral.nom}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                          {selResaGeneral.entreprise&&<span style={{fontSize:12,color:"#8A8178"}}>🏢 {selResaGeneral.entreprise}</span>}
                          {selResaGeneral.email&&<span style={{fontSize:12,color:"#8A8178"}}>📧 {selResaGeneral.email}</span>}
                          {selResaGeneral.telephone&&<span style={{fontSize:12,color:"#8A8178"}}>📞 {selResaGeneral.telephone}</span>}
                        </div>
                      </div>
                    </div>
                    <button onClick={()=>{setSelResaGeneral(null);setShowMailHistory(false);}} style={{width:26,height:26,borderRadius:6,border:"1px solid #DDD8D0",background:"transparent",color:"#8A8178",cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
                  </div>
                </div>

                {/* Onglets */}
                <div style={{display:"flex",borderBottom:"1px solid #EAE6E1",flexShrink:0}}>
                  {[["details","📋 Détails",false],["mails","✉ Mails "+(getLinkedEmails(selResaGeneral).length>0?"("+getLinkedEmails(selResaGeneral).length+")":""),true]].map(([tab,label,isMail])=>(
                    <button key={tab} onClick={()=>setShowMailHistory(isMail)} style={{flex:1,padding:"11px 0",fontSize:12,fontWeight:showMailHistory===isMail?600:400,color:showMailHistory===isMail?"#1C1814":"#8A8178",background:"transparent",border:"none",borderBottom:showMailHistory===isMail?"2px solid #C9A96E":"2px solid transparent",cursor:"pointer"}}>{label}</button>
                  ))}
                </div>

                <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
                  {!showMailHistory?(
                    <div style={{display:"flex",flexDirection:"column",gap:16}}>

                      {/* Statut */}
                      <div>
                        <div style={{fontSize:9,fontWeight:700,color:"#8A8178",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:9}}>Statut</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                          {statuts.map(s=>(
                            <button key={s.id} onClick={()=>{
                              const upd=resas.map(r=>r.id===selResaGeneral.id?{...r,statut:s.id}:r);
                              saveResas(upd); setSelResaGeneral({...selResaGeneral,statut:s.id});
                            }} style={{padding:"6px 15px",borderRadius:100,border:"none",background:(selResaGeneral.statut||"nouveau")===s.id?s.bg:"#F0EDE8",color:(selResaGeneral.statut||"nouveau")===s.id?s.color:"#8A8178",fontSize:12,fontWeight:(selResaGeneral.statut||"nouveau")===s.id?700:500,cursor:"pointer"}}>{s.label}</button>
                          ))}
                        </div>
                      </div>

                      {/* Infos en grille 2 col aérée */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                        {[["🎉","Type",selResaGeneral.typeEvenement],["👥","Personnes",selResaGeneral.nombrePersonnes?selResaGeneral.nombrePersonnes+" pers.":null],["📅","Date",selResaGeneral.dateDebut],["🕐","Horaires",selResaGeneral.heureDebut+(selResaGeneral.heureFin?" → "+selResaGeneral.heureFin:"")],["📍","Espace",ESPACES.find(e=>e.id===selResaGeneral.espaceId)?.nom],["💰","Budget",selResaGeneral.budget]].map(([icon,k,v])=>(
                          <div key={k} style={{background:"#F5F2EE",borderRadius:10,padding:"13px 15px"}}>
                            <div style={{fontSize:10,color:"#A09890",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.04em"}}>{icon} {k}</div>
                            <div style={{fontSize:14,fontWeight:500,color:v?"#1C1814":"#C0BAB2",fontStyle:v?"normal":"italic"}}>{v||"Non renseigné"}</div>
                          </div>
                        ))}
                      </div>

                      {/* Notes */}
                      {selResaGeneral.notes&&(
                        <div style={{background:"#F5F2EE",borderRadius:10,padding:"13px 15px"}}>
                          <div style={{fontSize:10,color:"#A09890",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>📝 Notes</div>
                          <div style={{fontSize:13,color:"#5C564F",lineHeight:1.65}}>{selResaGeneral.notes}</div>
                        </div>
                      )}

                      {/* ── NOTE IA ── */}
                      <div style={{borderRadius:10,border:"1px solid #DDD8D0",overflow:"hidden"}}>
                        <div style={{padding:"11px 15px",background:"#F7F5F1",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:noteIA[selResaGeneral.id]?"1px solid #DDD8D0":"none"}}>
                          <div style={{fontSize:11,fontWeight:600,color:"#1C1814",display:"flex",alignItems:"center",gap:6}}>
                            <span>✨</span> Note IA
                            {noteIA[selResaGeneral.id]&&<span style={{fontSize:10,color:"#A09890",fontWeight:400}}>· {noteIA[selResaGeneral.id].date}</span>}
                          </div>
                          <button
                            onClick={()=>generateNoteIA(selResaGeneral)}
                            disabled={genNoteIA===selResaGeneral.id}
                            style={{padding:"5px 12px",borderRadius:7,border:"none",background:"#1C1814",color:"#C9A96E",fontSize:11,fontWeight:600,cursor:genNoteIA===selResaGeneral.id?"default":"pointer",display:"flex",alignItems:"center",gap:6,opacity:genNoteIA===selResaGeneral.id?.7:1}}
                          >
                            {genNoteIA===selResaGeneral.id?<><Spin s={11}/> Analyse…</>:noteIA[selResaGeneral.id]?"↻ Régénérer":"Générer"}
                          </button>
                        </div>
                        {genNoteIA===selResaGeneral.id&&(
                          <div style={{padding:"16px 15px",display:"flex",alignItems:"center",gap:10,color:"#8A8178",fontSize:12,background:"#FDFCFA"}}>
                            <Spin s={14}/>
                            <span style={{fontStyle:"italic"}}>ARCHANGE analyse les échanges…</span>
                          </div>
                        )}
                        {!genNoteIA&&noteIA[selResaGeneral.id]&&(
                          <div style={{padding:"13px 15px",background:"#FDFCFA"}}>
                            <div style={{fontSize:12,color:"#3D3530",lineHeight:1.75,whiteSpace:"pre-wrap"}}>{noteIA[selResaGeneral.id].text}</div>
                          </div>
                        )}
                        {!genNoteIA&&!noteIA[selResaGeneral.id]&&(
                          <div style={{padding:"12px 15px",background:"#FDFCFA"}}>
                            <div style={{fontSize:12,color:"#A09890",fontStyle:"italic"}}>Cliquez sur "Générer" pour qu'ARCHANGE analyse les échanges liés à cet événement.</div>
                          </div>
                        )}
                      </div>

                      {/* ── NOTE DIRECTEUR ── */}
                      <div style={{borderRadius:10,border:"1px solid #DDD8D0",overflow:"hidden"}}>
                        <div style={{padding:"11px 15px",background:"#F7F5F1",borderBottom:"1px solid #DDD8D0"}}>
                          <div style={{fontSize:11,fontWeight:600,color:"#1C1814",display:"flex",alignItems:"center",gap:6}}>
                            <span>📝</span> Note directeur
                          </div>
                        </div>
                        <div style={{padding:"12px 15px",background:"#FDFCFA"}}>
                          <textarea
                            value={selResaGeneral.noteDirecteur||""}
                            onChange={e=>{
                              const upd=resas.map(r=>r.id===selResaGeneral.id?{...r,noteDirecteur:e.target.value}:r);
                              saveResas(upd); setSelResaGeneral({...selResaGeneral,noteDirecteur:e.target.value});
                            }}
                            placeholder="Note confidentielle réservée à la direction…"
                            rows={4}
                            style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #DDD8D0",background:"#F5F2EE",color:"#1C1814",fontSize:12,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:"inherit"}}
                          />
                        </div>
                      </div>

                      {/* Relances programmées */}
                      {relances.filter(rel=>rel.resaId===selResaGeneral.id).map(rel=>(
                        <div key={rel.id} style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:9,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:"#92400E",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>⏰ Relance programmée</div>
                            <div style={{fontSize:14,color:"#92400E",fontWeight:500}}>{rel.date}{rel.heure&&` à ${rel.heure}`}</div>
                            {rel.note&&<div style={{fontSize:12,color:"#B45309",marginTop:3}}>{rel.note}</div>}
                          </div>
                          <button onClick={()=>saveRelances(relances.filter(r=>r.id!==rel.id))} style={{background:"none",border:"none",color:"#B45309",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 4px"}}>×</button>
                        </div>
                      ))}

                      {/* Form relance date */}
                      {showRelanceForm===selResaGeneral.id&&(
                        <div style={{background:"#F5F3EF",borderRadius:10,padding:"16px",border:"1px solid #DDD8D0"}}>
                          <div style={{fontSize:13,fontWeight:600,color:"#1C1814",marginBottom:12}}>⏰ Programmer une relance</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                            <div><label style={{fontSize:10,color:"#8A8178",display:"block",marginBottom:4}}>Date</label><DatePicker value={relanceDate} onChange={v=>setRelanceDate(v)}/></div>
                            <div><label style={{fontSize:10,color:"#8A8178",display:"block",marginBottom:4}}>Heure</label><TimePicker value={relanceHeure} onChange={v=>setRelanceHeure(v)} placeholder="Heure"/></div>
                          </div>
                          <div style={{marginBottom:12}}><label style={{fontSize:10,color:"#8A8178",display:"block",marginBottom:4}}>Note (optionnel)</label><input value={relanceNote} onChange={e=>setRelanceNote(e.target.value)} placeholder="Ex: Rappeler pour le devis…" style={{...inp}}/></div>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={()=>{
                              if(!relanceDate) return;
                              const rel={id:"rel_"+Date.now(),resaId:selResaGeneral.id,resaNom:selResaGeneral.nom,resaEmail:selResaGeneral.email,date:relanceDate,heure:relanceHeure,note:relanceNote};
                              saveRelances([...relances,rel]); setShowRelanceForm(null); setRelanceDate(""); setRelanceHeure(""); setRelanceNote(""); toast("Relance programmée !");
                            }} style={{...gold,fontSize:12,padding:"8px 16px"}}>Confirmer</button>
                            <button onClick={()=>setShowRelanceForm(null)} style={{...out,fontSize:12}}>Annuler</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {getLinkedEmails(selResaGeneral).length===0?(
                        <div style={{textAlign:"center",padding:"40px 16px",color:"#8A8178"}}>
                          <div style={{fontSize:32,marginBottom:10}}>✉</div>
                          <div style={{fontSize:13}}>Aucun mail associé</div>
                          <div style={{fontSize:11,marginTop:4}}>à l'adresse {selResaGeneral.email}</div>
                        </div>
                      ):(
                        getLinkedEmails(selResaGeneral).map(m=>(
                          <div key={m.id} style={{background:"#F5F3EF",borderRadius:10,padding:"13px 15px",border:"1px solid #EAE6E1"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                              <div style={{fontSize:13,fontWeight:600,color:"#1C1814",flex:1,paddingRight:8}}>{m.subject}</div>
                              <span style={{fontSize:11,color:"#8A8178",flexShrink:0}}>{m.date}</span>
                            </div>
                            <div style={{fontSize:12,color:"#5C564F",lineHeight:1.5,marginBottom:10}}>{(m.snippet||"").slice(0,120)}{(m.snippet||"").length>120?"…":""}</div>
                            <button onClick={()=>{ setView("mails"); setMailFilter("all"); setSel(m); handleSel(m); setSelResaGeneral(null); setShowMailHistory(false); }} style={{width:"100%",padding:"7px",borderRadius:7,border:"1px solid #DDD8D0",background:"transparent",color:"#5C564F",fontSize:12,cursor:"pointer"}}>Ouvrir le mail →</button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Actions fixées en bas */}
                <div style={{padding:"14px 24px",borderTop:"1px solid #EAE6E1",display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <button onClick={()=>setEditResaPanel({...selResaGeneral})} style={{...out,fontSize:12,padding:"9px",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>✏️ Modifier</button>
                    <button onClick={()=>setShowRelanceForm(selResaGeneral.id)} style={{padding:"9px",borderRadius:8,border:"1px solid #FDE68A",background:"#FFFBEB",color:"#92400E",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>⏰ Relance date</button>
                    <button onClick={()=>genRelanceIAFn(selResaGeneral)} style={{padding:"9px",borderRadius:8,border:"none",background:"#1C1814",color:"#C9A96E",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>✨ Mail relance IA</button>
                    <button onClick={()=>openSendMail(selResaGeneral)} style={{...gold,fontSize:12,padding:"9px",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>📤 Envoyer mail</button>
                  </div>
                  <button onClick={()=>{ saveResas(resas.filter(r=>r.id!==selResaGeneral.id)); setSelResaGeneral(null); toast("Supprimé"); }} style={{width:"100%",padding:"9px",borderRadius:8,border:"1px solid #FCA5A5",background:"transparent",color:"#DC2626",fontSize:12,cursor:"pointer"}}>Supprimer l'événement</button>
                </div>
              </div>
            )}

            {/* Panel MODIFIER inline */}
            {editResaPanel&&(
              <div style={{width:380,borderLeft:"1px solid #EAE6E1",overflowY:"auto",background:"#FDFCFA",flexShrink:0}}>
                <div style={{padding:"16px 18px 12px",borderBottom:"1px solid #EAE6E1",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:15,fontWeight:600,color:"#1C1814"}}>✏️ Modifier l'événement</div>
                  <button onClick={()=>setEditResaPanel(null)} style={{width:28,height:28,borderRadius:6,border:"1px solid #DDD8D0",background:"transparent",color:"#8A8178",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <div style={{padding:18,display:"flex",flexDirection:"column",gap:10}}>
                  {[["nom","👤 Nom"],["email","📧 Email"],["telephone","📞 Téléphone"],["entreprise","🏢 Entreprise"],["nombrePersonnes","👥 Nb personnes"]].map(([k,l])=>(
                    <div key={k}><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>{l}</label><input value={editResaPanel[k]||""} onChange={e=>setEditResaPanel({...editResaPanel,[k]:e.target.value})} style={{...inp}}/></div>
                  ))}
                  <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>📅 Date</label><DatePicker value={editResaPanel.dateDebut||""} onChange={v=>setEditResaPanel({...editResaPanel,dateDebut:v})}/></div>
                  <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>🕐 Heure début</label><TimePicker value={editResaPanel.heureDebut||""} onChange={v=>setEditResaPanel({...editResaPanel,heureDebut:v})} placeholder="Heure début"/></div>
                  <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>🕕 Heure fin</label><TimePicker value={editResaPanel.heureFin||""} onChange={v=>setEditResaPanel({...editResaPanel,heureFin:v})} placeholder="Heure fin"/></div>
                  <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>📍 Espace</label><select value={editResaPanel.espaceId||"rdc"} onChange={e=>setEditResaPanel({...editResaPanel,espaceId:e.target.value})} style={{...inp}}>{ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select></div>
                  <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>🎉 Type</label><input value={editResaPanel.typeEvenement||""} onChange={e=>setEditResaPanel({...editResaPanel,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, Dîner…" style={{...inp}}/></div>
                  <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>💰 Budget client</label><input value={editResaPanel.budget||""} onChange={e=>setEditResaPanel({...editResaPanel,budget:e.target.value})} placeholder="Ex: 5 000€…" style={{...inp}}/></div>
                  <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>🏷 Statut</label><select value={editResaPanel.statut||"nouveau"} onChange={e=>setEditResaPanel({...editResaPanel,statut:e.target.value})} style={{...inp}}>{statuts.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                  <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>📝 Notes</label><textarea value={editResaPanel.notes||""} onChange={e=>setEditResaPanel({...editResaPanel,notes:e.target.value})} rows={3} style={{...inp,resize:"vertical",lineHeight:1.6}}/></div>
                  <div style={{display:"flex",gap:8,paddingTop:4}}>
                    <button onClick={()=>{
                      if(!editResaPanel.nom) return;
                      const upd=resas.map(r=>r.id===editResaPanel.id?editResaPanel:r);
                      saveResas(upd); setSelResaGeneral(editResaPanel); setEditResaPanel(null); toast("Mis à jour !");
                    }} style={{flex:1,...gold,padding:"10px"}}>Enregistrer</button>
                    <button onClick={()=>setEditResaPanel(null)} style={{...out}}>Annuler</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ MAILS ══ */}
        {view==="mails" && (
          <>
            {/* Sidebar catégories mails — collapsible */}
            <div style={{width:subCollapsed?44:160,background:"#221E19",display:"flex",flexDirection:"column",flexShrink:0,borderRight:"1px solid rgba(209,196,178,0.06)",transition:"width .2s ease",overflow:"hidden"}}>
              <div style={{padding:subCollapsed?"10px 6px":"14px 10px 10px",display:"flex",alignItems:"center",justifyContent:subCollapsed?"center":"space-between",flexShrink:0}}>
                {!subCollapsed&&<button onClick={()=>loadEmailsFromApi(true)} style={{...gold,flex:1,fontSize:10,padding:"7px 8px",display:"flex",alignItems:"center",justifyContent:"center",gap:5,letterSpacing:"0.06em"}}>
                  {loadingMail?<Spin s={11}/>:"↺"} Actualiser
                </button>}
                <button onClick={()=>setSubCollapsed(v=>!v)} title={subCollapsed?"Agrandir":"Réduire"} style={{width:22,height:22,borderRadius:5,border:"none",background:"rgba(209,196,178,0.07)",color:"rgba(209,196,178,0.35)",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:subCollapsed?0:6}}>
                  {subCollapsed?"›":"‹"}
                </button>
              </div>
              {subCollapsed?(
                <div style={{padding:"4px 6px",display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>
                  <button onClick={()=>loadEmailsFromApi(true)} title="Actualiser" style={{width:32,height:32,borderRadius:8,border:"none",background:"rgba(232,184,109,0.1)",color:"#E8B86D",cursor:"pointer",fontSize:13}}>↺</button>
                  <button onClick={()=>setMailFilter("all")} title="Tous les mails" style={{width:32,height:32,borderRadius:8,border:"none",background:mailFilter==="all"?"rgba(232,184,109,0.1)":"transparent",cursor:"pointer",fontSize:14}}>📬</button>
                  {MAIL_CATS.map(c=>(
                    <button key={c.id} onClick={()=>setMailFilter(c.id)} title={c.label} style={{width:32,height:32,borderRadius:8,border:"none",background:mailFilter===c.id?"rgba(232,184,109,0.1)":"transparent",cursor:"pointer",fontSize:14}}>
                      {c.icon}
                    </button>
                  ))}
                </div>
              ):(
                <div style={{padding:"4px 6px",flex:1}}>
                  <button onClick={()=>setMailFilter("all")} style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"8px 9px",borderRadius:8,border:"none",background:mailFilter==="all"?"rgba(209,196,178,0.1)":"transparent",color:mailFilter==="all"?"#D1C4B2":"rgba(209,196,178,0.75)",fontSize:11,letterSpacing:"0.04em",textAlign:"left",cursor:"pointer",marginBottom:2}}>
                      <span style={{fontSize:12}}>📬</span>
                      <span style={{flex:1}}>Tous les mails</span>
                      <span style={{fontSize:10,color:mailFilter==="all"?"#C9A96E":"rgba(209,196,178,0.45)"}}>{emails.length}</span>
                  </button>
                  {MAIL_CATS.map(c=>(
                    <button key={c.id} onClick={()=>setMailFilter(c.id)} style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"8px 9px",borderRadius:8,border:"none",background:mailFilter===c.id?"rgba(209,196,178,0.1)":"transparent",color:mailFilter===c.id?"#D1C4B2":"rgba(209,196,178,0.75)",fontSize:11,letterSpacing:"0.04em",textAlign:"left",cursor:"pointer",marginBottom:2}}>
                      <span style={{fontSize:12}}>{c.icon}</span>
                      <span style={{flex:1}}>{c.label}</span>
                      <span style={{fontSize:10,color:mailFilter===c.id?"#C9A96E":"rgba(209,196,178,0.45)"}}>{emails.filter(m=>c.id==="all"?true:c.id==="nonlus"?!!m.unread:c.id==="atraiter"?m.aTraiter:(m.flags||[]).includes(c.id)).length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Liste emails */}
            <div style={{width:260,borderRight:"1px solid #EAE6E1",background:"#FFFFFF",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
              <div style={{padding:"10px 12px",borderBottom:"1px solid #EAE6E1",flexShrink:0}}>
                <div style={{display:"flex",alignItems:"center",gap:7,background:"#F5F3EF",borderRadius:8,padding:"6px 10px",border:"1px solid #EAE6E1"}}>
                  <span style={{fontSize:12,color:"#8A8178"}}>🔍</span>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..." style={{border:"none",background:"transparent",outline:"none",fontSize:12,color:"#1C1814",width:"100%"}}/>
                  {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:"#8A8178",cursor:"pointer",fontSize:14,padding:0}}>×</button>}
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                {filtered.length===0&&<div style={{padding:24,textAlign:"center",color:"#8A8178",fontSize:12}}>Aucun email</div>}
                {filtered.map(em=>(
                  <div key={em.id} className="mail-row" style={{position:"relative",display:"flex",gap:9,padding:"11px 12px",borderBottom:"1px solid #EAE6E1",cursor:"pointer",background:sel?.id===em.id?"#F5F3EF":"transparent",borderLeft:sel?.id===em.id?"3px solid #C9A96E":em.unread?"3px solid #7BA8C4":"3px solid transparent"}}>
                    <div onClick={()=>handleSel(em)} style={{display:"flex",gap:9,flex:1,minWidth:0}}>
                      <div style={{position:"relative",flexShrink:0}}>
                        <Avatar name={em.from} size={32}/>
                        {em.unread&&<div style={{position:"absolute",top:0,right:0,width:8,height:8,borderRadius:"50%",background:"#6D9BE8",border:"2px solid #FFFFFF"}}/>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                          <span style={{fontSize:12,fontWeight:em.unread?700:600,color:em.unread?"#6D9BE8":"#1C1814",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{em.from}</span>
                          <span style={{fontSize:10,color:"#8A8178",flexShrink:0,marginLeft:4}}>{em.date}</span>
                        </div>
                        <div style={{fontSize:11,color:"#5C564F",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>{em.subject}</div>
                        <div style={{fontSize:10,color:"#8A8178",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{em.snippet}</div>
                        <div style={{display:"flex",gap:3,marginTop:4,flexWrap:"wrap"}}>
                          {em.unread&&<span style={{fontSize:9,background:"#EFF6FF",color:"#1D4ED8",padding:"1px 5px",borderRadius:100,fontWeight:700}}>Non lu</span>}
                          {(em.flags||[]).includes("star")&&<span style={{fontSize:10}}>⭐</span>}
                          {(em.flags||[]).includes("flag")&&<span style={{fontSize:10}}>🚩</span>}
                          {em.aTraiter&&<span style={{fontSize:9,background:"#EFF6FF",color:"#2563EB",padding:"1px 5px",borderRadius:100}}>À traiter</span>}
                          {drafted.has(em.id)&&<span style={{fontSize:9,background:"#D1FAE5",color:"#065F46",padding:"1px 5px",borderRadius:100}}>Brouillon</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mail-actions" style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",display:"flex",gap:3,opacity:0,transition:"opacity .15s",background:"#FFFFFF",borderRadius:7,padding:"3px 5px",border:"1px solid #EAE6E1"}}>
                      <button onClick={e=>{e.stopPropagation();toggleFlag(em.id,"star");}} title="Favori" style={{background:"none",border:"none",cursor:"pointer",fontSize:12,opacity:(em.flags||[]).includes("star")?1:0.35,padding:"1px 2px"}}>⭐</button>
                      <button onClick={e=>{e.stopPropagation();toggleFlag(em.id,"flag");}} title="Flaggé" style={{background:"none",border:"none",cursor:"pointer",fontSize:12,opacity:(em.flags||[]).includes("flag")?1:0.35,padding:"1px 2px"}}>🚩</button>
                      <button onClick={e=>{e.stopPropagation();toggleATraiter(em.id);}} title="À traiter" style={{background:"none",border:"none",cursor:"pointer",fontSize:11,opacity:em.aTraiter?1:0.35,padding:"1px 2px"}}>📋</button>
                      <button onClick={e=>{e.stopPropagation();toggleUnread(em.id);}} title={em.unread?"Marquer comme lu":"Marquer comme non lu"} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,opacity:em.unread?1:0.35,padding:"1px 2px"}}>●</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Zone lecture — scrollable indépendamment */}
            <div style={{flex:1,overflowY:"auto",background:"#EEEAE4"}}>
              {!sel ? (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:10,color:"#8A8178"}}>
                  <div style={{fontSize:40}}>✉</div>
                  <div style={{fontSize:14}}>Sélectionnez un email</div>
                </div>
              ) : (
                <div style={{maxWidth:720,margin:"0 auto",padding:"24px 24px 60px"}}>

                  {/* Header mail */}
                  <div style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1",boxShadow:"0 1px 4px rgba(28,24,20,.04)",marginBottom:16,overflow:"hidden"}}>
                    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"1px solid #EAE6E1"}}>
                      <div style={{display:"flex",gap:12,alignItems:"center"}}>
                        <Avatar name={sel.from} size={42}/>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"#1C1814",letterSpacing:"-0.01em"}}>{sel.from}</div>
                          <div style={{fontSize:12,color:"#8A8178"}}>{sel.fromEmail} · {sel.date}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <button onClick={()=>toggleFlag(sel.id,"star")} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,opacity:(sel.flags||[]).includes("star")?1:0.25}}>⭐</button>
                        <button onClick={()=>toggleFlag(sel.id,"flag")} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,opacity:(sel.flags||[]).includes("flag")?1:0.25}}>🚩</button>
                        <button onClick={()=>toggleUnread(sel.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:100,border:"none",background:sel.unread?"#EFF6FF":"#F5F3EF",color:sel.unread?"#1D4ED8":"#8A8178",cursor:"pointer",fontWeight:sel.unread?600:400}}>● {sel.unread?"Non lu":"Marquer non lu"}</button>
                        <button onClick={()=>toggleATraiter(sel.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:100,border:"none",background:sel.aTraiter?"#EFF6FF":"#F5F3EF",color:sel.aTraiter?"#2563EB":"#8A8178",cursor:"pointer",fontWeight:sel.aTraiter?600:400}}>📋 {sel.aTraiter?"À traiter":"Marquer à traiter"}</button>
                        <button onClick={()=>{ if(!window.confirm("Supprimer cet email de l'app ? (Pas supprimé de Gmail)")) return; const upd=emails.filter(m=>m.id!==sel.id); saveEmails(upd); setSel(null); toast("Email supprimé de l'app"); }} style={{fontSize:11,padding:"4px 10px",borderRadius:100,border:"1px solid #FCA5A5",background:"transparent",color:"#DC2626",cursor:"pointer",marginLeft:"auto"}}>🗑 Supprimer</button>
                      </div>
                    </div>
                    <div style={{padding:"16px 20px"}}>
                      <div style={{fontSize:16,fontWeight:600,color:"#1C1814",marginBottom:14}}>{sel.subject}</div>
                      <div style={{fontSize:14,color:"#5C564F",lineHeight:1.85,whiteSpace:"pre-wrap"}}>{sel.body||sel.snippet}</div>
                    </div>
                  </div>

                  {/* Bannière détection réservation */}
                  {extracted?.isReservation && !showPlanForm && (()=>{
                    const alreadyIn = resas.find(r =>
                      emailResaLinks[sel?.id || ""] === r.id ||
                      (r.email && extracted.email && r.email.toLowerCase() === extracted.email.toLowerCase())
                    );
                    if (alreadyIn) {
                      const st = statuts.find(s=>s.id===(alreadyIn.statut||"nouveau"))||statuts[0];
                      return (
                        <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:12,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
                          <span style={{fontSize:20}}>✅</span>
                          <div style={{flex:1}}>
                            <div style={{fontSize:12,fontWeight:600,color:"#065F46",marginBottom:3}}>Cet événement est déjà dans le planning</div>
                            <div style={{fontSize:11,color:"#059669"}}>{alreadyIn.nom} · <span style={{padding:"1px 7px",borderRadius:100,background:st.bg,color:st.color,fontWeight:600}}>{st.label}</span></div>
                          </div>
                          <button onClick={()=>{setSelResaGeneral(alreadyIn);setView("general");}} style={{fontSize:11,padding:"6px 12px",borderRadius:8,border:"1px solid #BBF7D0",background:"#D1FAE5",color:"#065F46",cursor:"pointer",fontWeight:600,flexShrink:0}}>Voir →</button>
                        </div>
                      );
                    }
                    const confColors: Record<string,{bg:string,border:string,text:string,badge:string,badgeText:string}> = {
                      haute:   {bg:"#EFF6FF",border:"#BFDBFE",text:"#1D4ED8",badge:"#DBEAFE",badgeText:"#1E40AF"},
                      moyenne: {bg:"#FFFBEB",border:"#FDE68A",text:"#92400E",badge:"#FEF3C7",badgeText:"#92400E"},
                      faible:  {bg:"#F9FAFB",border:"#E5E7EB",text:"#6B7280",badge:"#F3F4F6",badgeText:"#6B7280"},
                    };
                    const c = confColors[extracted.confiance || "haute"];
                    return (
                      <div style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:12,fontWeight:700,color:c.text}}>📅 Demande de réservation détectée</span>
                            {extracted.confiance && (
                              <span style={{fontSize:10,padding:"2px 8px",borderRadius:100,background:c.badge,color:c.badgeText,fontWeight:600}}>
                                Confiance {extracted.confiance}
                              </span>
                            )}
                          </div>
                          <button onClick={openPlanForm} style={{...gold,fontSize:11,padding:"7px 14px",flexShrink:0}}>+ Ajouter au planning</button>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {[
                            ["👤", extracted.nom],
                            ["🏢", extracted.entreprise],
                            ["🎉", extracted.typeEvenement],
                            ["👥", extracted.nombrePersonnes
                              ? (extracted.nombrePersonnesMin && extracted.nombrePersonnesMin !== extracted.nombrePersonnes
                                  ? `${extracted.nombrePersonnesMin}–${extracted.nombrePersonnes} pers.`
                                  : `${extracted.nombrePersonnes} pers.`)
                              : null],
                            ["📅", extracted.dateDebut],
                            ["🕐", extracted.heureDebut ? extracted.heureDebut + (extracted.heureFin ? "→"+extracted.heureFin : "") : null],
                            ["📍", ESPACES.find(e=>e.id===extracted.espaceDetecte)?.nom],
                            ["💰", extracted.budget],
                          ].filter(([,v])=>v).map(([icon,v],i)=>(
                            <span key={i} style={{fontSize:11,background:c.badge,color:c.badgeText,padding:"3px 9px",borderRadius:100}}>{icon} {v}</span>
                          ))}
                        </div>
                        {extracted.notes && (
                          <div style={{fontSize:11,color:c.text,marginTop:8,fontStyle:"italic",opacity:.8}}>📝 {extracted.notes}</div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Formulaire planning */}
                  {showPlanForm && (
                    <div style={{background:"#FFFFFF",border:"1px solid #EAE6E1",borderRadius:14,padding:"20px",marginBottom:16}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#1C1814",letterSpacing:"-0.01em"}}>📅 Ajouter au planning</div>
                        <button onClick={()=>setShowPlanForm(false)} style={{background:"none",border:"none",color:"#8A8178",cursor:"pointer",fontSize:18}}>×</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                        {/* Champs obligatoires */}
                        {[
                          ["dateDebut","📅 Date de l'événement *","date",true],
                          ["heureDebut","🕐 Heure de début *","time",true],
                          ["heureFin","🕕 Heure de fin *","time",true],
                        ].map(([k,l,type,required])=>(
                          <div key={k}>
                            <label style={{fontSize:11,color:planErrors[k]?"#DC2626":"#8A8178",display:"block",marginBottom:4,fontWeight:planErrors[k]?600:400}}>{l}</label>
                            {type==="date"?<DatePicker value={planForm[k]||""} onChange={v=>setPlanForm({...planForm,[k]:v})}/>:<TimePicker value={planForm[k]||""} onChange={v=>setPlanForm({...planForm,[k]:v})} placeholder={l.replace(" *","")}/>}
                            {planErrors[k]&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {planErrors[k]}</div>}
                          </div>
                        ))}
                        {/* Nombre de personnes — champ numérique libre */}
                        <div>
                          <label style={{fontSize:11,color:planErrors["nombrePersonnes"]?"#DC2626":"#8A8178",display:"block",marginBottom:4,fontWeight:planErrors["nombrePersonnes"]?600:400}}>👥 Nombre de personnes *</label>
                          <input type="number" min="1" value={planForm.nombrePersonnes||""} onChange={e=>setPlanForm({...planForm,nombrePersonnes:e.target.value})} placeholder="Ex: 50" style={{...inp}}/>
                          {planErrors["nombrePersonnes"]&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {planErrors["nombrePersonnes"]}</div>}
                        </div>
                        {/* Champs optionnels */}
                        <div>
                          <label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>🎉 Type d'événement</label>
                          <input value={planForm.typeEvenement||""} onChange={e=>setPlanForm({...planForm,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, Dîner…" style={{...inp}}/>
                        </div>
                        <div>
                          <label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>💰 Budget client</label>
                          <input value={planForm.budget||""} onChange={e=>setPlanForm({...planForm,budget:e.target.value})} placeholder="Ex: 5 000€, 45€/pers…" style={{...inp}}/>
                        </div>
                        <div>
                          <label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>📍 Espace</label>
                          <select value={planForm.espaceId||"rdc"} onChange={e=>setPlanForm({...planForm,espaceId:e.target.value})} style={{...inp}}>{ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select>
                        </div>
                        <div style={{gridColumn:"1/-1"}}>
                          <label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>📝 Notes</label>
                          <input value={planForm.notes||""} onChange={e=>setPlanForm({...planForm,notes:e.target.value})} style={{...inp}}/>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:16}}>
                        <button onClick={submitPlanForm} style={{...gold,flex:1,padding:"10px"}}>Confirmer et ajouter</button>
                        <button onClick={()=>setShowPlanForm(false)} style={{...out}}>Annuler</button>
                      </div>
                    </div>
                  )}

                  {/* Réponse Archange */}
                  <div style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1",boxShadow:"0 1px 4px rgba(28,24,20,.04)",overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:"#1C1814"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:"#C9A96E"}}/>
                        <span style={{fontSize:11,fontWeight:700,color:"#C9A96E",letterSpacing:"0.1em",textTransform:"uppercase"}}>Réponse ARCHANGE</span>
                        {genReply&&<Spin s={12}/>}
                      </div>
                      {srcActives>0&&<span style={{fontSize:11,background:"rgba(232,184,109,.15)",color:"#E8B86D",padding:"3px 8px",borderRadius:100}}>🧠 {srcActives} source{srcActives>1?"s":""}</span>}
                      {docsInvalides>0&&<span title="PDFs non chargés — réimportez-les dans Sources IA" style={{fontSize:11,background:"rgba(239,68,68,.1)",color:"#DC2626",padding:"3px 8px",borderRadius:100,cursor:"help"}}>⚠️ {docsInvalides} PDF{docsInvalides>1?"s":""} à réimporter</span>}
                    </div>
                    {genReply
                      ? <div style={{padding:"20px",fontSize:13,color:"#8A8178",display:"flex",alignItems:"center",gap:10}}><Spin/> Rédaction en cours…</div>
                      : !reply
                        ? <div style={{padding:"20px",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
                            <div style={{fontSize:12,color:"#8A8178",textAlign:"center"}}>Cliquez pour demander à ARCHANGE de rédiger une réponse.</div>
                            <button onClick={genererReponse} style={{...gold,padding:"10px 20px",fontSize:12,display:"flex",alignItems:"center",gap:8}}>✨ Générer une réponse</button>
                          </div>
                        : editing
                          ? <textarea value={editReply} onChange={e=>setEditReply(e.target.value)} style={{width:"100%",padding:"16px 20px",fontSize:14,color:"#1C1814",lineHeight:1.85,border:"none",outline:"none",resize:"vertical",background:"transparent",minHeight:200}}/>
                          : <div style={{padding:"16px 20px",fontSize:14,color:"#1C1814",lineHeight:1.85,whiteSpace:"pre-wrap"}}>{reply}</div>
                    }
                    <div style={{display:"flex",gap:8,padding:"12px 16px",borderTop:"1px solid #EAE6E1",background:"#F5F3EF"}}>
                      {reply && <><button onClick={()=>{ window.sendPrompt("CREATE_DRAFT|"+sel.fromEmail+"|"+sel.subject+"|"+(editing?editReply:reply)); setDrafted(p=>new Set([...p,sel.id])); toast("Brouillon créé !"); }} disabled={genReply} style={{...gold}}>Créer le brouillon</button>
                      <button onClick={()=>{ if(editing){setReply(editReply);setEditing(false);if(sel)setRepliesCache(prev=>({...prev,[sel.id]:{...prev[sel.id],reply:editReply,editReply}}));}else{setEditing(true);setEditReply(reply);} }} disabled={genReply} style={{...out}}>{editing?"Valider":"Modifier"}</button>
                      <button onClick={genererReponse} disabled={genReply} style={{...out,color:"#8A8178"}}>↻ Regénérer</button></>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ PLANNING ══ */}
        {view==="planning" && (()=>{
          const today = new Date();
          const todayStr = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");

          // Week helpers
          const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(calWeekStart); d.setDate(d.getDate()+i); return d; });
          const fmtDate = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
          const resasForDate = (ds:string) => resas.filter(r=>r.dateDebut===ds);

          // Day view
          const calDayStr = fmtDate(calDate);
          const dayResas = resasForDate(calDayStr);

          const getStatut = (r) => statuts.find(s=>s.id===(r.statut||"nouveau"))||{bg:"#F3F4F6",color:"#6B7280",label:"—"};

          return (
            <div style={{display:"flex",flex:1,overflow:"hidden"}}>
              <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

                {/* Toolbar */}
                <div style={{padding:"14px 20px",borderBottom:"1px solid #EAE6E1",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:"#FFFFFF"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={()=>{ const n=new Date(); setCalDate(new Date(n.getFullYear(),n.getMonth(),n.getDate())); const w=new Date(n); w.setDate(w.getDate()-((w.getDay()+6)%7)); w.setHours(0,0,0,0); setCalWeekStart(w); }} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #DDD8D0",background:"#FFFFFF",color:"#1C1814",fontSize:12,fontWeight:600,cursor:"pointer"}}>Aujourd'hui</button>
                    <button onClick={()=>{
                      if(calView==="mois") setCalDate(new Date(calDate.getFullYear(),calDate.getMonth()-1,1));
                      else if(calView==="semaine"){ const d=new Date(calWeekStart); d.setDate(d.getDate()-7); setCalWeekStart(d); }
                      else { const d=new Date(calDate); d.setDate(d.getDate()-1); setCalDate(d); }
                    }} style={{width:30,height:30,borderRadius:7,border:"1px solid #DDD8D0",background:"#FFFFFF",color:"#1C1814",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                    <button onClick={()=>{
                      if(calView==="mois") setCalDate(new Date(calDate.getFullYear(),calDate.getMonth()+1,1));
                      else if(calView==="semaine"){ const d=new Date(calWeekStart); d.setDate(d.getDate()+7); setCalWeekStart(d); }
                      else { const d=new Date(calDate); d.setDate(d.getDate()+1); setCalDate(d); }
                    }} style={{width:30,height:30,borderRadius:7,border:"1px solid #DDD8D0",background:"#FFFFFF",color:"#1C1814",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                    <span style={{fontSize:16,fontWeight:600,color:"#1C1814",marginLeft:4}}>
                      {calView==="mois" && `${MOIS[calDate.getMonth()]} ${calDate.getFullYear()}`}
                      {calView==="semaine" && `${weekDays[0].getDate()} ${MOIS[weekDays[0].getMonth()].slice(0,3)} – ${weekDays[6].getDate()} ${MOIS[weekDays[6].getMonth()].slice(0,3)} ${weekDays[6].getFullYear()}`}
                      {calView==="jour" && `${calDate.getDate()} ${MOIS[calDate.getMonth()]} ${calDate.getFullYear()}`}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    {/* Vue toggle */}
                    <div style={{display:"flex",background:"#F5F3EF",borderRadius:8,padding:2,border:"1px solid #EAE6E1"}}>
                      {(["mois","semaine","jour"] as const).map(v=>(
                        <button key={v} onClick={()=>setCalView(v)} style={{padding:"5px 12px",borderRadius:6,border:"none",background:calView===v?"#FFFFFF":"transparent",color:calView===v?"#1C1814":"#8A8178",fontSize:12,fontWeight:calView===v?600:400,cursor:"pointer",textTransform:"capitalize"}}>{v.charAt(0).toUpperCase()+v.slice(1)}</button>
                      ))}
                    </div>
                    <button onClick={()=>setEditResa({...EMPTY_RESA})} style={{...gold,fontSize:12,padding:"7px 14px"}}>+ Réservation</button>
                  </div>
                </div>

                {/* ── VUE MOIS ── */}
                {calView==="mois" && (
                  <div style={{flex:1,overflowY:"auto",padding:16}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:0,marginBottom:0,border:"1px solid #EAE6E1",borderRadius:12,overflow:"hidden"}}>
                      {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d=>(
                        <div key={d} style={{textAlign:"center",fontSize:11,color:"#8A8178",padding:"8px 0",fontWeight:600,background:"#F5F3EF",borderBottom:"1px solid #EAE6E1"}}>{d}</div>
                      ))}
                      {Array.from({length:firstDay(calDate)}).map((_,i)=>(
                        <div key={"p"+i} style={{minHeight:100,background:"#EEEAE4",borderRight:"1px solid #EAE6E1",borderBottom:"1px solid #EAE6E1"}}/>
                      ))}
                      {Array.from({length:daysInMonth(calDate)}).map((_,i)=>{
                        const day=i+1;
                        const ds=calDate.getFullYear()+"-"+String(calDate.getMonth()+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
                        const dr=resasForDate(ds);
                        const isToday=ds===todayStr;
                        const col=(firstDay(calDate)+i)%7;
                        return (
                          <div key={day} style={{minHeight:100,borderRight:col<6?"1px solid #EAE6E1":"none",borderBottom:"1px solid #EAE6E1",padding:"6px 6px 4px",background:isToday?"rgba(201,169,110,0.05)":"#FFFFFF",position:"relative"}}>
                            <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>
                              <span style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:isToday?700:400,background:isToday?"#C9A96E":"transparent",color:isToday?"#FFFFFF":"#9E9890"}}>{day}</span>
                            </div>
                            {dr.slice(0,3).map(r=>{ const st=getStatut(r); return (
                              <div key={r.id} onClick={()=>setSelResa(r)} style={{fontSize:10,background:st.bg,color:st.color,padding:"2px 6px",borderRadius:4,marginBottom:2,cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:500,borderLeft:`2px solid ${st.color}`}}>
                                {r.heureDebut&&<span style={{opacity:.7,marginRight:3}}>{r.heureDebut}</span>}{r.nom}
                              </div>
                            );})}
                            {dr.length>3&&<div style={{fontSize:10,color:"#8A8178",paddingLeft:4}}>+{dr.length-3} autre{dr.length-3>1?"s":""}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── VUE SEMAINE ── */}
                {calView==="semaine" && (
                  <div style={{flex:1,overflowY:"auto"}}>
                    <div style={{display:"grid",gridTemplateColumns:"48px repeat(7,1fr)",borderBottom:"1px solid #EAE6E1"}}>
                      <div/>
                      {weekDays.map(d=>{ const ds=fmtDate(d); const isTd=ds===todayStr; return (
                        <div key={ds} style={{textAlign:"center",padding:"10px 4px",borderLeft:"1px solid #EAE6E1",background:"#FFFFFF"}}>
                          <div style={{fontSize:11,color:isTd?"#E8B86D":"#8A8178",fontWeight:600,textTransform:"uppercase"}}>{["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"][d.getDay()===0?6:d.getDay()-1]}</div>
                          <div style={{width:28,height:28,borderRadius:"50%",background:isTd?"#E8B86D":"transparent",color:isTd?"#0F0F0F":"#1C1814",fontSize:14,fontWeight:isTd?700:500,display:"flex",alignItems:"center",justifyContent:"center",margin:"4px auto 0"}}>{d.getDate()}</div>
                        </div>
                      );})}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"48px repeat(7,1fr)"}}>
                      <div/>
                      {weekDays.map(d=>{ const ds=fmtDate(d); const dr=resasForDate(ds); const isTd=ds===todayStr; return (
                        <div key={ds} style={{borderLeft:"1px solid #EAE6E1",minHeight:300,padding:"6px 4px",background:isTd?"rgba(232,184,109,0.03)":"transparent"}}>
                          {dr.map(r=>{ const st=getStatut(r); return (
                            <div key={r.id} onClick={()=>setSelResa(r)} style={{background:st.bg,borderLeft:`3px solid ${st.color}`,borderRadius:"0 6px 6px 0",padding:"5px 7px",marginBottom:4,cursor:"pointer",fontSize:11}}>
                              <div style={{fontWeight:600,color:st.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.nom}</div>
                              {r.heureDebut&&<div style={{fontSize:10,color:st.color,opacity:.8}}>{r.heureDebut}{r.heureFin&&` → ${r.heureFin}`}</div>}
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
                      <div style={{textAlign:"center",padding:"60px 0",color:"#8A8178"}}>
                        <div style={{fontSize:36,marginBottom:10}}>📅</div>
                        <div style={{fontSize:14}}>Aucun événement ce jour</div>
                        <button onClick={()=>setEditResa({...EMPTY_RESA,dateDebut:calDayStr})} style={{...gold,marginTop:16,fontSize:12}}>+ Ajouter un événement</button>
                      </div>
                    ):(
                      <div style={{display:"flex",flexDirection:"column",gap:12}}>
                        {dayResas.map(r=>{ const st=getStatut(r); return (
                          <div key={r.id} onClick={()=>setSelResa(r)} style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1",borderLeft:`4px solid ${st.color}`,padding:"16px 18px",cursor:"pointer"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                              <div style={{fontSize:15,fontWeight:600,color:"#1C1814"}}>{r.nom}</div>
                              <span style={{fontSize:11,padding:"3px 10px",borderRadius:100,background:st.bg,color:st.color,fontWeight:600}}>{st.label}</span>
                            </div>
                            <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                              {r.heureDebut&&<span style={{fontSize:12,color:"#5C564F"}}>🕐 {r.heureDebut}{r.heureFin&&` → ${r.heureFin}`}</span>}
                              {r.typeEvenement&&<span style={{fontSize:12,color:"#5C564F"}}>🎉 {r.typeEvenement}</span>}
                              {r.nombrePersonnes&&<span style={{fontSize:12,color:"#5C564F"}}>👥 {r.nombrePersonnes} pers.</span>}
                              {r.espaceId&&<span style={{fontSize:12,color:"#5C564F"}}>📍 {ESPACES.find(e=>e.id===r.espaceId)?.nom}</span>}
                            </div>
                          </div>
                        );})}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Panel détail */}
              {selResa && (
                <div style={{width:340,borderLeft:"1px solid #EAE6E1",overflowY:"auto",background:"#FDFCFA",flexShrink:0}}>
                  <div style={{padding:"18px 20px 14px",borderBottom:"1px solid #EAE6E1",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:15,fontWeight:600,color:"#1C1814"}}>{selResa.nom}</div>
                      {selResa.entreprise&&<div style={{fontSize:12,color:"#8A8178",marginTop:2}}>{selResa.entreprise}</div>}
                    </div>
                    <button onClick={()=>setSelResa(null)} style={{width:28,height:28,borderRadius:6,border:"1px solid #DDD8D0",background:"transparent",color:"#8A8178",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                  </div>
                  <div style={{padding:20}}>
                    {/* Statut pills */}
                    <div style={{display:"flex",gap:5,marginBottom:16,flexWrap:"wrap"}}>
                      {statuts.map(s=>(
                        <button key={s.id} onClick={()=>{ const upd=resas.map(r=>r.id===selResa.id?{...r,statut:s.id}:r); saveResas(upd); setSelResa({...selResa,statut:s.id}); }} style={{padding:"4px 10px",borderRadius:100,border:"none",background:(selResa.statut||"nouveau")===s.id?s.bg:"#F0EDE8",color:(selResa.statut||"nouveau")===s.id?s.color:"#8A8178",fontSize:11,fontWeight:(selResa.statut||"nouveau")===s.id?600:400,cursor:"pointer"}}>{s.label}</button>
                      ))}
                    </div>
                    {/* Infos */}
                    {[["🎉","Type",selResa.typeEvenement],["👥","Personnes",selResa.nombrePersonnes],["📍","Espace",ESPACES.find(e=>e.id===selResa.espaceId)?.nom],["📅","Date",selResa.dateDebut],["🕐","Horaires",selResa.heureDebut+(selResa.heureFin?" → "+selResa.heureFin:"")],["💰","Budget",selResa.budget],["📧","Email",selResa.email],["📞","Tél",selResa.telephone],["📝","Notes",selResa.notes]].filter(([,,v])=>v).map(([icon,k,v])=>(
                      <div key={k} style={{display:"flex",gap:10,marginBottom:10,alignItems:"flex-start"}}>
                        <span style={{fontSize:14,width:20,flexShrink:0}}>{icon}</span>
                        <div><div style={{fontSize:10,color:"#8A8178",marginBottom:1}}>{k}</div><div style={{fontSize:13,color:"#1C1814"}}>{v}</div></div>
                      </div>
                    ))}
                    {/* Mails liés */}
                    {getLinkedEmails(selResa).length>0&&(
                      <div style={{marginTop:12,padding:"12px 14px",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10}}>
                        <div style={{fontSize:11,color:"#92400E",fontWeight:600,marginBottom:8}}>✉ {getLinkedEmails(selResa).length} conversation(s)</div>
                        {getLinkedEmails(selResa).map(m=>(
                          <div key={m.id} onClick={()=>{ setView("mails"); setMailFilter("all"); setSel(m); handleSel(m); }} style={{fontSize:12,color:"#92400E",padding:"5px 0",cursor:"pointer",borderBottom:"1px solid #FDE68A",display:"flex",justifyContent:"space-between"}}>
                            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{m.subject}</span>
                            <span style={{flexShrink:0,marginLeft:8,opacity:.6}}>{m.date}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{display:"flex",gap:8,marginTop:16,paddingTop:16,borderTop:"1px solid #EAE6E1"}}>
                      <button onClick={()=>{ setEditResa({...selResa}); setSelResa(null); }} style={{flex:1,...out,fontSize:12}}>✏️ Modifier</button>
                      <button onClick={()=>{ setSelResaGeneral(selResa); setSelResa(null); setView("general"); setShowMailHistory(false); }} style={{...out,fontSize:12,padding:"7px 10px"}}>🗂</button>
                      <button onClick={()=>{ saveResas(resas.filter(r=>r.id!==selResa.id)); setSelResa(null); toast("Supprimé"); }} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #FCA5A5",background:"transparent",color:"#DC2626",fontSize:12,cursor:"pointer"}}>🗑</button>
                    </div>
                  </div>
                </div>
              )}
              {editResa && (
                <div style={{width:360,borderLeft:"1px solid #EAE6E1",overflowY:"auto",background:"#FDFCFA",flexShrink:0}}>
                  <div style={{padding:"18px 20px 14px",borderBottom:"1px solid #EAE6E1",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:15,fontWeight:600,color:"#1C1814"}}>{editResa.id?"Modifier":"Nouvelle réservation"}</div>
                    <button onClick={()=>setEditResa(null)} style={{width:28,height:28,borderRadius:6,border:"1px solid #DDD8D0",background:"transparent",color:"#8A8178",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                  </div>
                  <div style={{padding:20,display:"flex",flexDirection:"column",gap:12}}>
                    {[["nom","👤 Nom *"],["email","📧 Email"],["telephone","📞 Téléphone"],["entreprise","🏢 Entreprise"],["nombrePersonnes","👥 Nb personnes"]].map(([k,l])=>(
                      <div key={k}><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>{l}</label><input value={editResa[k]||""} onChange={e=>setEditResa({...editResa,[k]:e.target.value})} style={{...inp}}/></div>
                    ))}
                    <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>📅 Date</label><DatePicker value={editResa.dateDebut||""} onChange={v=>setEditResa({...editResa,dateDebut:v})}/></div>
                    <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>🕐 Heure début</label><TimePicker value={editResa.heureDebut||""} onChange={v=>setEditResa({...editResa,heureDebut:v})} placeholder="Heure début"/></div>
                    <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>🕕 Heure fin</label><TimePicker value={editResa.heureFin||""} onChange={v=>setEditResa({...editResa,heureFin:v})} placeholder="Heure fin"/></div>
                    <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>📍 Espace</label><select value={editResa.espaceId} onChange={e=>setEditResa({...editResa,espaceId:e.target.value})} style={{...inp}}>{ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select></div>
                    <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>🎉 Type d'événement</label><input value={editResa.typeEvenement||""} onChange={e=>setEditResa({...editResa,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, Dîner…" style={{...inp}}/></div>
                    <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>💰 Budget client</label><input value={editResa.budget||""} onChange={e=>setEditResa({...editResa,budget:e.target.value})} placeholder="Ex: 5 000€…" style={{...inp}}/></div>
                    <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>🏷 Statut</label><select value={editResa.statut||"nouveau"} onChange={e=>setEditResa({...editResa,statut:e.target.value})} style={{...inp}}>{statuts.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                    <div><label style={{fontSize:11,color:"#8A8178",display:"block",marginBottom:4}}>📝 Notes</label><textarea value={editResa.notes||""} onChange={e=>setEditResa({...editResa,notes:e.target.value})} rows={3} style={{...inp,resize:"vertical",lineHeight:1.6}}/></div>
                    <div style={{display:"flex",gap:8,paddingTop:4}}>
                      <button onClick={()=>{ if(!editResa.nom) return; if(editResa.id){saveResas(resas.map(r=>r.id===editResa.id?editResa:r));toast("Mis à jour");}else{saveResas([...resas,{...editResa,id:"r"+Date.now()}]);toast("Créé");} setEditResa(null); }} style={{flex:1,...gold,padding:"10px"}}>Enregistrer</button>
                      <button onClick={()=>setEditResa(null)} style={{...out}}>Annuler</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ══ STATS ══ */}
        {view==="stats" && (
          <div style={{flex:1,overflowY:"auto",padding:24}}>
            <div style={{fontSize:24,fontWeight:300,color:"#1C1814",fontFamily:"'Cormorant Garamond',serif",letterSpacing:"0.02em",marginBottom:24}}>Vue d'ensemble</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:28}}>
              {[["Demandes totales",total,"#6B7280"],["Confirmées",conf,"#059669"],["En attente",att,"#D97706"],["Taux de conversion",taux+"%","#2563EB"]].map(([l,v,c])=>(
                <div key={l} style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1",boxShadow:"0 1px 4px rgba(28,24,20,.04)",padding:"16px 18px"}}>
                  <div style={{fontSize:11,color:"#8A8178",marginBottom:8,textTransform:"uppercase",letterSpacing:".05em"}}>{l}</div>
                  <div style={{fontSize:28,fontWeight:700,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1",boxShadow:"0 1px 4px rgba(28,24,20,.04)",padding:20}}>
                <div style={{fontSize:13,fontWeight:600,color:"#1C1814",letterSpacing:"-0.01em",marginBottom:20}}>Par espace</div>
                {parEspace.map(e=>(
                  <div key={e.id} style={{marginBottom:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:13,color:"#1C1814",fontWeight:500}}>{e.nom}</span>
                      <span style={{fontSize:12,color:"#8A8178"}}>{e.c}/{e.n}</span>
                    </div>
                    <div style={{height:8,background:"#F5F3EF",borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",width:Math.round(e.n/maxN*100)+"%",background:e.color,borderRadius:4}}/>
                    </div>
                    <div style={{fontSize:11,color:"#8A8178",marginTop:4}}>{e.n>0?Math.round(e.c/e.n*100)+"% confirmés":"Aucune demande"}</div>
                  </div>
                ))}
              </div>
              <div style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1",boxShadow:"0 1px 4px rgba(28,24,20,.04)",padding:20}}>
                <div style={{fontSize:13,fontWeight:600,color:"#1C1814",letterSpacing:"-0.01em",marginBottom:16}}>Types d'événements</div>
                {parType.length===0&&<div style={{fontSize:13,color:"#8A8178"}}>Aucune donnée</div>}
                {parType.map((t,i)=>(
                  <div key={t.t} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<parType.length-1?"1px solid #EAE6E1":"none"}}>
                    <div style={{flex:1,fontSize:13,color:"#5C564F"}}>{t.t}</div>
                    <div style={{width:60,height:6,background:"#F5F3EF",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:Math.round(t.n/parType[0].n*100)+"%",background:"#E8B86D",borderRadius:3}}/></div>
                    <span style={{fontSize:13,fontWeight:600,color:"#1C1814",minWidth:16}}>{t.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

                {/* ══ SOURCES IA ══ */}
        {view==="sources" && (
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"#F5F3EF"}}>

            {/* ── Header fixe — titre + stats ── */}
            <div style={{padding:"24px 28px 16px",flexShrink:0,borderBottom:"1px solid #EAE6E1",background:"#F5F3EF"}}>
              <div style={{fontSize:22,fontWeight:300,color:"#1C1814",fontFamily:"'Cormorant Garamond',serif",letterSpacing:"0.02em"}}>Sources IA</div>
              <div style={{fontSize:12,color:"#8A8178",marginTop:4,marginBottom:14}}>Tout ce que vous ajoutez ici nourrit ARCHANGE.</div>
              <div style={{display:"flex",background:"#FFFFFF",borderRadius:10,border:"1px solid #EAE6E1",overflow:"hidden"}}>
                {[["Liens analysés",Object.values(linksFetched).filter(Boolean).length,"🔗"],["Documents",docs.length,"📄"],["Contexte",customCtx?"Actif":"—","✏️"],["Sources totales",srcActives,"⟡"]].map(([l,v,icon],i,arr)=>(
                  <div key={l} style={{flex:1,padding:"12px 16px",borderRight:i<arr.length-1?"1px solid #EAE6E1":"none"}}>
                    <div style={{fontSize:10,color:"#8A8178",fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>{icon} {l}</div>
                    <div style={{fontSize:18,fontWeight:600,color:"#1C1814"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Zone scrollable — sections accordéon ── */}
            <div style={{flex:1,overflowY:"scroll",padding:"16px 28px 28px",display:"flex",flexDirection:"column",gap:12,minHeight:0}}>

            <div style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1"}}>
              <button onClick={()=>setSrcSections(s=>({...s,liens:!s.liens}))} style={{width:"100%",padding:"14px 20px",background:"#F7F5F1",border:"none",borderBottom:srcSections.liens?"1px solid #EAE6E1":"none",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1C1814"}}>🔗 Liens web</div>
                  <div style={{fontSize:11,color:"#8A8178",marginTop:2}}>ARCHANGE analysera ces pages pour mieux vous connaître.</div>
                </div>
                <span style={{fontSize:12,color:"#8A8178"}}>{srcSections.liens?"▲":"▼"}</span>
              </button>
              {srcSections.liens&&(
                <div style={{padding:20,display:"flex",flexDirection:"column",gap:16}}>
                  {[["website","🌐","Site internet","Entrez le lien de votre site internet..."],["instagram","📸","Instagram","https://instagram.com/..."],["facebook","👍","Facebook","https://facebook.com/..."],["other","🔗","Autre lien","https://..."]].map(([key,icon,label,ph])=>(
                    <div key={key}>
                      <label style={{fontSize:11,color:"#7A736A",display:"block",marginBottom:6,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>{icon} {label}</label>
                      <div style={{display:"flex",gap:8}}>
                        <input value={links[key]||""} onChange={e=>setLinks({...links,[key]:e.target.value})} onBlur={()=>saveLinks(links)} placeholder={ph} style={{...inp,flex:1}}/>
                        <button onClick={()=>fetchLink(links[key],key)} disabled={!links[key]||fetchingLink===key} style={{padding:"9px 16px",borderRadius:8,border:"none",background:linksFetched[key]?"#E8F5EE":!links[key]||fetchingLink===key?"#E8E4DE":"#C9A96E",color:linksFetched[key]?"#2D6A4F":!links[key]||fetchingLink===key?"#A09890":"#1C1814",fontSize:12,fontWeight:600,cursor:links[key]&&fetchingLink!==key?"pointer":"default",display:"flex",alignItems:"center",gap:6,flexShrink:0,whiteSpace:"nowrap"}}>
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

            <div style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#F7F5F1",borderBottom:srcSections.contexte?"1px solid #EAE6E1":"none"}}>
                <button onClick={()=>setSrcSections(s=>({...s,contexte:!s.contexte}))} style={{background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0,flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#1C1814"}}>✏️ Contexte personnalisé</div>
                  <div style={{fontSize:11,color:"#8A8178",marginTop:2}}>Instructions spéciales, ton, infos clés pour ARCHANGE.</div>
                </button>
                <div style={{display:"flex",gap:8,flexShrink:0,marginLeft:12}}>
                  <button onClick={()=>{ if(editingCtx){ saveToSupabase({context:customCtx}); } setEditingCtx(v=>!v); }} style={{...out,fontSize:11,padding:"6px 12px"}}>{editingCtx?"✓ Sauvegarder":"Modifier"}</button>
                  <button onClick={()=>setSrcSections(s=>({...s,contexte:!s.contexte}))} style={{background:"none",border:"none",cursor:"pointer",color:"#8A8178",fontSize:12}}>{srcSections.contexte?"▲":"▼"}</button>
                </div>
              </div>
              {srcSections.contexte&&(
                <div style={{padding:20}}>
                  {editingCtx
                    ?<textarea value={customCtx} onChange={e=>setCustomCtx(e.target.value)} placeholder="Ex: Ouverts 7j/7 de 9h à 2h. Responsable événements : Marie. Menus à partir de 35€/pers…" rows={6} style={{...inp,lineHeight:1.75,resize:"vertical",width:"100%"}}/>
                    :customCtx
                      ?<div style={{fontSize:13,color:"#5C564F",lineHeight:1.75,whiteSpace:"pre-wrap"}}>{customCtx}</div>
                      :<div style={{fontSize:13,color:"#A09890",fontStyle:"italic"}}>Aucun contexte défini. Cliquez sur "Modifier" pour en ajouter un.</div>
                  }
                </div>
              )}
            </div>

            <div style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #EAE6E1"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#F7F5F1",borderBottom:srcSections.docs&&docs.length>0?"1px solid #EAE6E1":"none"}}>
                <button onClick={()=>setSrcSections(s=>({...s,docs:!s.docs}))} style={{background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0,flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#1C1814"}}>📄 Documents <span style={{fontSize:11,fontWeight:400,color:"#8A8178",marginLeft:4}}>({docs.length})</span></div>
                  <div style={{fontSize:11,color:"#8A8178",marginTop:2}}>PDF, menus, tarifs, conditions générales…</div>
                </button>
                <div style={{display:"flex",gap:8,flexShrink:0,marginLeft:12}}>
                  <button onClick={()=>fileRef.current?.click()} style={{...gold,fontSize:11,padding:"7px 14px"}}>+ Ajouter</button>
                  <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.pdf,application/pdf" style={{display:"none"}} onChange={handleDoc}/>
                  {docs.length>0&&<button onClick={()=>setSrcSections(s=>({...s,docs:!s.docs}))} style={{background:"none",border:"none",cursor:"pointer",color:"#8A8178",fontSize:12}}>{srcSections.docs?"▲":"▼"}</button>}
                </div>
              </div>
              {srcSections.docs&&(
                docs.length===0
                  ?<div style={{padding:"28px 24px",textAlign:"center"}}>
                      <div style={{fontSize:28,marginBottom:10}}>📂</div>
                      <div style={{fontSize:13,color:"#8A8178",marginBottom:4}}>Aucun document ajouté</div>
                      <div style={{fontSize:11,color:"#A09890"}}>Ajoutez vos PDF, menus ou tarifs pour qu'ARCHANGE les utilise</div>
                    </div>
                  :<div style={{padding:12,display:"flex",flexDirection:"column",gap:6}}>
                      {docs.map(doc=>(
                        <div key={doc.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:10,border:"1px solid #EAE6E1",background:"#FDFCFA"}}>
                          <div style={{width:36,height:36,borderRadius:8,background:doc.isPdf?"#FEE9E9":"#EEF3FE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{doc.isPdf?"📄":"📝"}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:500,color:"#1C1814",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.name}</div>
                            <div style={{fontSize:11,color:"#8A8178",marginTop:1}}>{fmt(doc.size)} · {doc.isPdf?"PDF":"Texte"}</div>
                          </div>
                          <button onClick={()=>removeDoc(doc.id)} style={{width:28,height:28,borderRadius:6,border:"1px solid #EAE6E1",background:"transparent",color:"#C09888",cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
                        </div>
                      ))}
                    </div>
              )}
            </div>

            </div>
          </div>
        )}
      </main>

      {/* ══ MODAL NOUVEL ÉVÉNEMENT ══ */}
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
                  <label style={{fontSize:11,color:newEventErrors.nom?"#DC2626":"#8A8178",display:"block",marginBottom:4,fontWeight:600}}>👤 Prénom / Nom *</label>
                  <input value={newEvent.nom||""} onChange={e=>setNewEvent({...newEvent,nom:e.target.value})} style={{...inpLight,borderColor:newEventErrors.nom?"#FCA5A5":"#DDD8D0"}} placeholder="Ex: Jean Dupont"/>
                  {newEventErrors.nom&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {newEventErrors.nom}</div>}
                </div>
                <div>
                  <label style={{fontSize:11,color:newEventErrors.dateDebut?"#DC2626":"#8A8178",display:"block",marginBottom:4,fontWeight:600}}>📅 Date de l'événement *</label>
                  <DatePicker value={newEvent.dateDebut||""} onChange={v=>setNewEvent({...newEvent,dateDebut:v})} light={true}/>
                  {newEventErrors.dateDebut&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {newEventErrors.dateDebut}</div>}
                </div>
                <div>
                  <label style={{fontSize:11,color:newEventErrors.heureDebut?"#DC2626":"#8A8178",display:"block",marginBottom:4,fontWeight:600}}>🕐 Heure de début *</label>
                  <TimePicker value={newEvent.heureDebut||""} onChange={v=>setNewEvent({...newEvent,heureDebut:v})} placeholder="Heure début" light={true}/>
                  {newEventErrors.heureDebut&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {newEventErrors.heureDebut}</div>}
                </div>
                <div>
                  <label style={{fontSize:11,color:newEventErrors.heureFin?"#DC2626":"#8A8178",display:"block",marginBottom:4,fontWeight:600}}>🕕 Heure de fin *</label>
                  <TimePicker value={newEvent.heureFin||""} onChange={v=>setNewEvent({...newEvent,heureFin:v})} placeholder="Heure fin" light={true}/>
                  {newEventErrors.heureFin&&<div style={{fontSize:11,color:"#DC2626",marginTop:3}}>⚠ {newEventErrors.heureFin}</div>}
                </div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>📧 Email</label><input value={newEvent.email||""} onChange={e=>setNewEvent({...newEvent,email:e.target.value})} style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>📞 Téléphone</label><input value={newEvent.telephone||""} onChange={e=>setNewEvent({...newEvent,telephone:e.target.value})} style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>🏢 Entreprise</label><input value={newEvent.entreprise||""} onChange={e=>setNewEvent({...newEvent,entreprise:e.target.value})} style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>👥 Nb personnes</label><input type="number" value={newEvent.nombrePersonnes||""} onChange={e=>setNewEvent({...newEvent,nombrePersonnes:e.target.value})} style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>🎉 Type d'événement</label><input value={newEvent.typeEvenement||""} onChange={e=>setNewEvent({...newEvent,typeEvenement:e.target.value})} placeholder="Ex: Cocktail, Dîner…" style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>💰 Budget client</label><input value={newEvent.budget||""} onChange={e=>setNewEvent({...newEvent,budget:e.target.value})} placeholder="Ex: 5 000€…" style={{...inpLight}}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>📍 Espace</label><select value={newEvent.espaceId||"rdc"} onChange={e=>setNewEvent({...newEvent,espaceId:e.target.value})} style={{...inpLight}}>{ESPACES.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select></div>
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>📝 Notes</label><textarea value={newEvent.notes||""} onChange={e=>setNewEvent({...newEvent,notes:e.target.value})} rows={3} style={{...inpLight,resize:"none",lineHeight:1.6}}/></div>
              </div>
            </div>
            <div style={{padding:"16px 24px",borderTop:"1px solid #EAE6E1",display:"flex",gap:8,flexShrink:0}}>
              <button onClick={()=>{
                const errs:any={};
                if(!newEvent.nom?.trim()) errs.nom="Le prénom/nom est obligatoire";
                if(!newEvent.dateDebut) errs.dateDebut="La date est obligatoire";
                if(!newEvent.heureDebut) errs.heureDebut="L'heure de début est obligatoire";
                if(!newEvent.heureFin) errs.heureFin="L'heure de fin est obligatoire";
                if(Object.keys(errs).length>0){ setNewEventErrors(errs); return; }
                const r={...newEvent,id:"r"+Date.now(),statut:"nouveau",nombrePersonnes:parseInt(newEvent.nombrePersonnes)||newEvent.nombrePersonnes};
                saveResas([...resas,r]); setShowNewEvent(false); setNewEvent({...EMPTY_RESA}); setNewEventErrors({}); toast("Événement créé !");
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
          <div style={{position:"fixed",inset:0,background:"rgba(28,24,20,0.6)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:"#FFFFFF",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
              {/* Header */}
              <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #EAE6E1"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <span style={{fontSize:20}}>⚡</span>
                  <div style={{fontSize:15,fontWeight:700,color:"#1C1814"}}>Modifications détectées</div>
                </div>
                <div style={{fontSize:12,color:"#8A8178"}}>
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
                  style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",borderRadius:10,border:`1.5px solid ${s.selectionnee?"#C9A96E":"#E8E4DF"}`,background:s.selectionnee?"#FFFBF0":"#F9F8F6",cursor:"pointer",transition:"all .15s"}}>
                    {/* Checkbox */}
                    <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${s.selectionnee?"#C9A96E":"#C8C0B4"}`,background:s.selectionnee?"#C9A96E":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                      {s.selectionnee&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}
                    </div>
                    {/* Contenu */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#1C1814",marginBottom:4}}>{s.label}</div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:"#8A8178",background:"#F0EDE8",padding:"2px 8px",borderRadius:6,textDecoration:"line-through"}}>
                          {s.ancienne !== null && s.ancienne !== "" ? String(s.ancienne) : "(vide)"}
                        </span>
                        <span style={{fontSize:12,color:"#8A8178"}}>→</span>
                        <span style={{fontSize:12,color:"#1C1814",fontWeight:600,background:s.selectionnee?"#FEF3C7":"#F0EDE8",padding:"2px 8px",borderRadius:6}}>
                          {s.nouvelle !== null && s.nouvelle !== "" ? String(s.nouvelle) : "(vide)"}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:"#A09890",marginTop:4,fontStyle:"italic"}}>{s.raison}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{padding:"16px 24px",borderTop:"1px solid #EAE6E1",display:"flex",gap:10}}>
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
                  style={{flex:2,padding:"11px",borderRadius:8,border:"none",background:nbSel>0?"#C9A96E":"#E8E4DF",color:nbSel>0?"#1C1814":"#A09890",fontSize:13,fontWeight:600,cursor:nbSel>0?"pointer":"not-allowed",transition:"all .15s"}}>
                  Appliquer {nbSel>0?`(${nbSel})`:""}
                </button>
                <button onClick={()=>setPendingSuggestions(null)} style={{flex:1,padding:"11px",borderRadius:8,border:"1px solid #DDD8D0",background:"transparent",color:"#8A8178",fontSize:13,cursor:"pointer"}}>
                  Ignorer tout
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
            <div style={{padding:"14px 24px",borderBottom:"1px solid #EAE6E1",flexShrink:0,background:"#FAFAFA"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8A8178",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:9}}>Motif de la relance</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
                {motifsRelance.map((m, i) => (
                  <div key={i} style={{display:"flex",alignItems:"center",borderRadius:100,border:`1.5px solid ${motifSelectionne===m?"#C9A96E":"#DDD8D0"}`,background:motifSelectionne===m?"#FEF3C7":"#FFFFFF",overflow:"hidden"}}>
                    <button onClick={()=>setMotifSelectionne(motifSelectionne===m?"":m)} style={{padding:"5px 10px",fontSize:11,fontWeight:motifSelectionne===m?600:400,color:motifSelectionne===m?"#92400E":"#5C564F",background:"transparent",border:"none",cursor:"pointer"}}>{m}</button>
                    <button onClick={()=>{const upd=motifsRelance.filter((_,j)=>j!==i);saveMotifsRelance(upd);if(motifSelectionne===m)setMotifSelectionne("");}} title="Supprimer" style={{padding:"5px 8px 5px 0",fontSize:10,color:"#C0BAB2",background:"transparent",border:"none",cursor:"pointer"}} onMouseEnter={e=>(e.currentTarget.style.color="#DC2626")} onMouseLeave={e=>(e.currentTarget.style.color="#C0BAB2")}>×</button>
                  </div>
                ))}
                {showAddMotif?(
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <input autoFocus value={newMotifLabel} onChange={e=>setNewMotifLabel(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newMotifLabel.trim()){const upd=[...motifsRelance,newMotifLabel.trim()];saveMotifsRelance(upd);setNewMotifLabel("");setShowAddMotif(false);}if(e.key==="Escape"){setShowAddMotif(false);setNewMotifLabel("");}}} placeholder="Nouveau motif…" style={{padding:"5px 10px",fontSize:11,borderRadius:100,border:"1.5px solid #C9A96E",outline:"none",width:150}}/>
                    <button onClick={()=>{if(newMotifLabel.trim()){const upd=[...motifsRelance,newMotifLabel.trim()];saveMotifsRelance(upd);setNewMotifLabel("");setShowAddMotif(false);}}} style={{padding:"5px 10px",fontSize:11,borderRadius:100,border:"none",background:"#C9A96E",color:"#1C1814",cursor:"pointer",fontWeight:600}}>+</button>
                    <button onClick={()=>{setShowAddMotif(false);setNewMotifLabel("");}} style={{padding:"5px 8px",fontSize:11,borderRadius:100,border:"1px solid #DDD8D0",background:"transparent",color:"#8A8178",cursor:"pointer"}}>✕</button>
                  </div>
                ):(
                  <button onClick={()=>setShowAddMotif(true)} style={{padding:"5px 12px",fontSize:11,borderRadius:100,border:"1.5px dashed #C9A96E",background:"transparent",color:"#C9A96E",cursor:"pointer",fontWeight:500}}>+ Ajouter</button>
                )}
              </div>
              {motifSelectionne==="Autre"&&<input value={motifPersonnalise} onChange={e=>setMotifPersonnalise(e.target.value)} placeholder="Précisez le motif…" style={{width:"100%",padding:"7px 12px",fontSize:12,borderRadius:8,border:"1px solid #C9A96E",outline:"none",marginTop:4}}/>}
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
            <div style={{padding:"16px 24px",borderTop:"1px solid #EAE6E1",display:"flex",gap:8,flexShrink:0}}>
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
            <div style={{padding:"16px 24px",borderTop:"1px solid #EAE6E1",display:"flex",gap:8,flexShrink:0,background:"#F3F4F6"}}>
              <button onClick={()=>{ window.sendPrompt("CREATE_DRAFT|"+showSendMail.email+"|"+sendMailSubject+"|"+sendMailBody); toast("Brouillon créé !"); setShowSendMail(null); }} disabled={!sendMailBody||!sendMailSubject} style={{...gold,flex:1,padding:"11px",fontSize:13,opacity:!sendMailBody||!sendMailSubject?0.4:1,cursor:!sendMailBody||!sendMailSubject?"not-allowed":"pointer"}}>📧 Créer le brouillon Gmail</button>
              <button onClick={()=>setShowSendMail(null)} style={{...out,fontSize:12,padding:"11px 16px"}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
