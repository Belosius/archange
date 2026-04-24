'use client'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useSession, signOut, signIn } from 'next-auth/react'
import { apiFetch } from '@/lib/api-fetch'
import { useRouter } from 'next/navigation'

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// CONSTANTES â partagÃ©es avec la version desktop (mÃªmes tables Supabase)
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
interface EspaceDyn {
  id: string; nom: string; color: string; description: string;
  assisMin: string; assisMax: string;
  deboutMin: string; deboutMax: string;
  capacite?: string;
}
const DEFAULT_ESPACES_DYN: EspaceDyn[] = [
  { id: "rdc",       nom: "Rez-de-chaussÃ©e", color: "#C9A876", assisMin: "80",  assisMax: "100", deboutMin: "100", deboutMax: "150", description: "" },
  { id: "patio",     nom: "Le Patio",         color: "#6DB8A0", assisMin: "40",  assisMax: "75",  deboutMin: "60",  deboutMax: "100", description: "" },
  { id: "belvedere", nom: "Le BelvÃ©dÃ¨re",     color: "#6D9BE8", assisMin: "40",  assisMax: "75",  deboutMin: "60",  deboutMax: "100", description: "" },
];
const TYPES_EVT = ["DÃ®ner","DÃ©jeuner","Cocktail","Buffet","ConfÃ©rence","RÃ©union","SoirÃ©e DJ","KaraokÃ©","SoirÃ©e Ã  thÃ¨me"];
const MOIS = ["Janvier","FÃ©vrier","Mars","Avril","Mai","Juin","Juillet","AoÃ»t","Septembre","Octobre","Novembre","DÃ©cembre"];
const JOURS_COURT = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
const JOURS_LONG = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];

type StatutDef = { id: string; label: string; bg: string; color: string };
const DEFAULT_STATUTS: StatutDef[] = [
  { id: "nouveau",    label: "Nouveau",    bg: "#EDF2E8", color: "#6B8A5B" },
  { id: "en_cours",   label: "En cours",   bg: "#F7EDD8", color: "#B17D2E" },
  { id: "en_attente", label: "En attente", bg: "#EFEAF5", color: "#6F56A8" },
  { id: "confirme",   label: "ConfirmÃ©",   bg: "#EDF2E8", color: "#3F5B32" },
  { id: "annule",     label: "AnnulÃ©",     bg: "#FAEDEB", color: "#A84B45" },
];

const EMPTY_RESA = { id:null, prenom:"", nom:"", email:"", telephone:"", entreprise:"", typeEvenement:"", nombrePersonnes:"", espaceId:"", dateDebut:"", heureDebut:"", heureFin:"", statut:"nouveau", notes:"", budget:"", noteDirecteur:"" };

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// HELPERS
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const fmtDateFr = (s: string) => {
  if(!s) return "";
  try { const d = new Date(s); return `${JOURS_COURT[d.getDay()]}. ${d.getDate()} ${MOIS[d.getMonth()].toLowerCase()}`; } catch { return s; }
};
const fmtDateLongue = (s: string) => {
  if(!s) return "";
  try { const d = new Date(s); return `${JOURS_LONG[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`; } catch { return s; }
};
const fmtISO = (d: Date) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const firstDay = (date: Date) => { const d = new Date(date.getFullYear(), date.getMonth(), 1); return (d.getDay()+6)%7; };
const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth()+1, 0).getDate();

// Split nom/prenom pour rÃ©trocompat (rÃ©sas anciennes sans prenom)
const splitNomPrenom = (r: any) => {
  if (r?.prenom) return { prenom: r.prenom, nom: r.nom || "" };
  const full = (r?.nom || "").trim();
  if (!full) return { prenom: "", nom: "" };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { prenom: "", nom: parts[0] };
  return { prenom: parts[0], nom: parts.slice(1).join(" ") };
};
const displayNom = (r: any) => {
  const { prenom, nom } = splitNomPrenom(r);
  return [prenom, nom].filter(Boolean).join(" ") || "â";
};
const initials = (name: string) => {
  if(!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]?.toUpperCase()||"").join("") || "?";
};

// Parsing date relative ("Dans 2 jours", "Il y a 3 jours")
const relDate = (s: string) => {
  if(!s) return "";
  const d = new Date(s), now = new Date();
  d.setHours(0,0,0,0); now.setHours(0,0,0,0);
  const diff = Math.round((d.getTime()-now.getTime())/86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  if (diff > 0 && diff < 7) return `Dans ${diff} jours`;
  if (diff < 0 && diff > -7) return `Il y a ${Math.abs(diff)} jours`;
  return "";
};

// Humanise les erreurs API pour l'utilisateur
function humanError(e: any): string {
  const m = String(e?.message || e || "").toLowerCase();
  if (m.includes("network") || m.includes("failed to fetch")) return "Connexion internet perdue. RÃ©essayez.";
  if (m.includes("rate") || m.includes("429")) return "Trop de requÃªtes. Attendez quelques secondes.";
  if (m.includes("401") || m.includes("unauthorized")) return "Session expirÃ©e. Reconnectez-vous.";
  if (m.includes("timeout")) return "DÃ©lai dÃ©passÃ©. RÃ©essayez.";
  return "Une erreur est survenue. RÃ©essayez.";
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// TOKENS DESIGN â palette Apple Mail 2026 aÃ©rÃ©
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const T = {
  bgCanvas: "#FAFAF7",
  bgSurface: "#FFFFFF",
  bgSubtle: "#F5F4F0",
  bgHover: "#F0EFEB",
  borderHairline: "#EBEAE5",
  borderSoft: "#E0DED7",
  textPrimary: "#1A1A1E",
  textSecondary: "#6B6B72",
  textTertiary: "#A5A4A0",
  textQuat: "#C5C3BE",
  accent: "#B8924F",
  accentSubtle: "#F4EEDF",
  accentFaint: "rgba(184, 146, 79, 0.08)",
  accentRing: "rgba(184, 146, 79, 0.25)",
  sage: "#6B8A5B",
  sageSubtle: "#EDF2E8",
  sageTint: "#F6F9F3",
  sageDark: "#3F5B32",
  danger: "#A84B45",
  dangerSubtle: "#FAEDEB",
  warn: "#B17D2E",
  warnSubtle: "#F7EDD8",
  purple: "#6F56A8",
  purpleSubtle: "#EFEAF5",
  fontSans: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSerif: "'Fraunces', Georgia, serif",
};

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// COMPOSANT PRINCIPAL
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default function MobileApp() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Navigation globale entre onglets + sous-Ã©crans
  const [tab, setTab] = useState<"planning"|"mails"|"events"|"account">("planning");
  const [subScreen, setSubScreen] = useState<string|null>(null); // ex: "mail:read", "event:detail", "account:menus"
  const [subScreenData, setSubScreenData] = useState<any>(null);

  // ââââ Data partagÃ©e avec desktop (Supabase) ââââ
  const [resas, setResas] = useState<any[]>([]);
  const [statuts, setStatuts] = useState<StatutDef[]>(DEFAULT_STATUTS);
  const [espaces, setEspaces] = useState<EspaceDyn[]>(DEFAULT_ESPACES_DYN);
  const [emails, setEmails] = useState<any[]>([]);
  const [emailTags, setEmailTags] = useState<Record<string,string[]>>({});
  const [customTags, setCustomTags] = useState<any[]>([]);
  const [noteIA, setNoteIA] = useState<Record<string,any>>({});
  const [relances, setRelances] = useState<any[]>([]);
  const [repliesCache, setRepliesCache] = useState<Record<string,any>>({});

  // ââââ Sources ARCHANGE ââââ
  const [nomEtab, setNomEtab] = useState("");
  const [adresseEtab, setAdresseEtab] = useState("");
  const [emailEtab, setEmailEtab] = useState("");
  const [menusCtx, setMenusCtx] = useState("");
  const [conditionsCtx, setConditionsCtx] = useState("");
  const [tonCtx, setTonCtx] = useState("");

  // ââââ UI state ââââ
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{msg:string,type?:"ok"|"err"}|null>(null);
  const showToast = (msg: string, type: "ok"|"err" = "ok") => {
    setToast({msg, type});
    setTimeout(()=>setToast(null), 3000);
  };

  // Planning
  const [planView, setPlanView] = useState<"jour"|"semaine"|"mois">("jour");
  const [planDate, setPlanDate] = useState(new Date());
  const [planWeekStart, setPlanWeekStart] = useState(() => { const d=new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)); d.setHours(0,0,0,0); return d; });
  const [planMonthSelectedDay, setPlanMonthSelectedDay] = useState<string>(fmtISO(new Date()));

  // Mails
  const [mailFilter, setMailFilter] = useState<"all"|"unread"|"star"|"atraiter"|"snoozed"|"archived">("all");
  const [mailSearch, setMailSearch] = useState("");

  // ÃvÃ©nements
  const [eventsGroupBy, setEventsGroupBy] = useState<"urgency"|"status">("urgency");
  const [eventsStatusFilters, setEventsStatusFilters] = useState<string[]>([]);

  // Compose
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeInReplyTo, setComposeInReplyTo] = useState<any>(null);
  const [composeSending, setComposeSending] = useState(false);
  const [composeGenerating, setComposeGenerating] = useState(false);

  // Nouvelle demande
  const [newEvent, setNewEvent] = useState<any>({...EMPTY_RESA});
  const [newEventErrors, setNewEventErrors] = useState<Record<string,string>>({});

  // Edit Ã©vÃ©nement
  const [editEvent, setEditEvent] = useState<any>(null);

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // AUTH â redirect si non connectÃ©
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  useEffect(() => {
    if (status === "unauthenticated") {
      signIn("google", { callbackUrl: "/mobile" });
    }
  }, [status]);

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // CHARGEMENT INITIAL â mÃªme endpoint que desktop
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/user-data");
        if (!res.ok) throw new Error("Erreur chargement");
        const data = await res.json();
        if (cancelled) return;
        // Restauration (mÃªmes champs que desktop)
        try { setResas(JSON.parse(data.resas||"[]")); } catch {}
        try { const st = JSON.parse(data.statuts||"null"); if (Array.isArray(st) && st.length > 0) setStatuts(st); } catch {}
        try { const es = JSON.parse(data.espaces||"null"); if (Array.isArray(es) && es.length > 0) setEspaces(es); } catch {}
        try { setEmailTags(JSON.parse(data.email_tags||"{}")); } catch {}
        try { setCustomTags(JSON.parse(data.custom_tags||"[]")); } catch {}
        try { setNoteIA(JSON.parse(data.note_ia||"{}")); } catch {}
        try { setRelances(JSON.parse(data.relances||"[]")); } catch {}
        // Sources
        try { const ctx = JSON.parse(data.context||"{}"); setNomEtab(ctx.nomEtab||""); setAdresseEtab(ctx.adresseEtab||""); setEmailEtab(ctx.emailEtab||""); setMenusCtx(ctx.menus||""); setConditionsCtx(ctx.conditions||""); setTonCtx(ctx.ton||""); } catch {}

        // Charger les emails â format tolÃ©rant (accepte plusieurs structures de rÃ©ponse)
        const emRes = await apiFetch("/api/emails");
        if (emRes.ok) {
          const em = await emRes.json();
          if (!cancelled) {
            // TolÃ¨re : {messages:[...]}, {emails:[...]}, {data:[...]}, [...], ou autre
            const list = Array.isArray(em) ? em
              : Array.isArray(em?.messages) ? em.messages
              : Array.isArray(em?.emails) ? em.emails
              : Array.isArray(em?.data) ? em.data
              : Array.isArray(em?.items) ? em.items
              : Array.isArray(em?.results) ? em.results
              : [];
            console.log(`[ARCHANGE Mobile] Loaded ${list.length} emails (raw response keys: ${em && typeof em === 'object' ? Object.keys(em).join(',') : 'array'})`);
            setEmails(list);
          }
        } else {
          console.error("[ARCHANGE Mobile] /api/emails failed:", emRes.status, emRes.statusText);
          showToast(`Mails indisponibles (${emRes.status})`, "err");
        }
      } catch (e) {
        console.error(e);
        showToast(humanError(e), "err");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status]);

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // SAVE HELPERS â Ã©crivent dans Supabase (partagÃ© avec desktop)
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const saveToSupabase = async (patch: any) => {
    try {
      await apiFetch("/api/user-data", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(patch),
      });
    } catch (e) {
      console.error("Save error:", e);
    }
  };
  const saveResas = (r: any[]) => { setResas(r); saveToSupabase({resas: JSON.stringify(r)}); };
  const saveStatuts = (s: StatutDef[]) => { setStatuts(s); saveToSupabase({statuts: JSON.stringify(s)}); };
  const saveEmails = (e: any[]) => { setEmails(e); /* emails ne sont pas persistÃ©s â toujours rechargÃ©s depuis Gmail */ };
  const saveEmailTags = (t: Record<string,string[]>) => { setEmailTags(t); saveToSupabase({email_tags: JSON.stringify(t)}); };
  const saveNoteIA = (n: Record<string,any>) => { setNoteIA(n); saveToSupabase({note_ia: JSON.stringify(n)}); };
  const saveRelances = (r: any[]) => { setRelances(r); saveToSupabase({relances: JSON.stringify(r)}); };
  const saveSources = (patch: Partial<{nomEtab:string;adresseEtab:string;emailEtab:string;menus:string;conditions:string;ton:string}>) => {
    const ctx = {nomEtab, adresseEtab, emailEtab, menus: menusCtx, conditions: conditionsCtx, ton: tonCtx, ...patch};
    saveToSupabase({context: JSON.stringify(ctx)});
  };

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // DONNÃES DÃRIVÃES
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const todayISO = fmtISO(new Date());

  // âââ Planning âââ
  const resasForDate = (ds: string) => resas.filter(r => r.dateDebut === ds);
  const dayResas = useMemo(() => resasForDate(fmtISO(planDate)).sort((a,b)=>(a.heureDebut||"").localeCompare(b.heureDebut||"")), [resas, planDate]);

  const weekDays = useMemo(() => {
    const arr = [];
    for (let i=0;i<7;i++) { const d = new Date(planWeekStart); d.setDate(d.getDate()+i); arr.push(d); }
    return arr;
  }, [planWeekStart]);

  const planKPIs = useMemo(() => {
    const m = planDate.getMonth(), y = planDate.getFullYear();
    const monthResas = resas.filter(r => {
      if(!r.dateDebut) return false;
      try { const d = new Date(r.dateDebut); return d.getMonth()===m && d.getFullYear()===y; } catch { return false; }
    });
    const confirmed = monthResas.filter(r => {
      const st = statuts.find(s=>s.id===(r.statut||"nouveau"));
      return st && (st.label.toLowerCase().includes("confirm") || st.label.toLowerCase().includes("valid"));
    }).length;
    const uniqueDays = new Set(monthResas.map(r => r.dateDebut)).size;
    const daysInM = new Date(y, m+1, 0).getDate();
    const occupation = Math.round((uniqueDays / daysInM) * 100);
    const upcoming = resas
      .filter(r => r.dateDebut && r.dateDebut >= todayISO)
      .sort((a,b) => (a.dateDebut||"").localeCompare(b.dateDebut||"") || (a.heureDebut||"").localeCompare(b.heureDebut||""))[0];
    let totalBudget = 0;
    monthResas.forEach(r => {
      const st = statuts.find(s=>s.id===(r.statut||"nouveau"));
      const isValid = st && (st.label.toLowerCase().includes("confirm") || st.label.toLowerCase().includes("en cours") || st.label.toLowerCase().includes("devis"));
      if (!isValid) return;
      const match = String(r.budget||"").match(/(\d[\d\s]*)/);
      if (match) {
        const n = parseInt(match[1].replace(/\s/g,""), 10);
        if (!isNaN(n) && n > 0 && n < 1000000) totalBudget += n;
      }
    });
    return {total: monthResas.length, confirmed, uniqueDays, daysInM, occupation, upcoming, totalBudget};
  }, [resas, planDate, statuts, todayISO]);

  // âââ Dashboard Ã©vÃ©nements KPI âââ
  const eventKPIs = useMemo(() => {
    const in7 = new Date(); in7.setDate(in7.getDate()+7);
    const in7ISO = fmtISO(in7);
    const cetteSemaine = resas.filter(r => r.dateDebut && r.dateDebut >= todayISO && r.dateDebut <= in7ISO).length;
    const minus3 = new Date(); minus3.setDate(minus3.getDate()-3);
    const minus3ISO = fmtISO(minus3);
    const aRelancer = resas.filter(r => {
      const lastRel = relances.filter(x=>x.resaId===r.id).sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
      if (!lastRel) return false;
      return lastRel.date < minus3ISO;
    }).length;
    const nouvelles = resas.filter(r => (r.statut||"nouveau") === "nouveau").length;
    let prevBudget = 0;
    resas.filter(r => r.dateDebut && r.dateDebut >= todayISO).forEach(r => {
      const st = statuts.find(s=>s.id===(r.statut||"nouveau"));
      const isValid = st && (st.label.toLowerCase().includes("confirm") || st.label.toLowerCase().includes("en cours") || st.label.toLowerCase().includes("devis"));
      if (!isValid) return;
      const match = String(r.budget||"").match(/(\d[\d\s]*)/);
      if (match) {
        const n = parseInt(match[1].replace(/\s/g,""), 10);
        if (!isNaN(n) && n > 0 && n < 1000000) prevBudget += n;
      }
    });
    return {cetteSemaine, aRelancer, nouvelles, prevBudget};
  }, [resas, relances, statuts, todayISO]);

  // âââ ÃvÃ©nements filtrÃ©s âââ
  const filteredEvents = useMemo(() => {
    let list = [...resas];
    if (eventsStatusFilters.length > 0) {
      list = list.filter(r => eventsStatusFilters.includes(r.statut || "nouveau"));
    }
    return list;
  }, [resas, eventsStatusFilters]);

  // GroupÃ©s par urgence
  const eventsByUrgency = useMemo(() => {
    const in7 = new Date(); in7.setDate(in7.getDate()+7);
    const in7ISO = fmtISO(in7);
    const minus3 = new Date(); minus3.setDate(minus3.getDate()-3);
    const minus3ISO = fmtISO(minus3);

    const urgent: any[] = [];
    const relancer: any[] = [];
    const nouvelles: any[] = [];
    const autres: any[] = [];
    const hors: any[] = [];

    filteredEvents.forEach(r => {
      if (!r.dateDebut) { hors.push(r); return; }
      const lastRel = relances.filter(x=>x.resaId===r.id).sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
      if (r.dateDebut >= todayISO && r.dateDebut <= in7ISO) { urgent.push(r); return; }
      if (lastRel && lastRel.date < minus3ISO && (r.statut||"nouveau") !== "confirme") { relancer.push(r); return; }
      if ((r.statut||"nouveau") === "nouveau" && r.dateDebut && r.budget) { nouvelles.push(r); return; }
      if (!r.dateDebut || !r.budget) { autres.push(r); return; }
      autres.push(r);
    });

    return {urgent, relancer, nouvelles, autres, hors};
  }, [filteredEvents, relances, todayISO]);

  // GroupÃ©s par statut
  const eventsByStatus = useMemo(() => {
    const groups: Record<string, any[]> = {};
    statuts.forEach(s => { groups[s.id] = []; });
    filteredEvents.forEach(r => {
      const sid = r.statut || "nouveau";
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(r);
    });
    return groups;
  }, [filteredEvents, statuts]);

  // âââ Mails filtrÃ©s âââ
  const filteredMails = useMemo(() => {
    const now = new Date().toISOString();
    let list = emails.filter(m => {
      // SnoozÃ©s masquÃ©s sauf si filtre snoozed
      if (mailFilter === "snoozed") {
        if (!m.snoozedUntil || m.snoozedUntil <= now) return false;
        if (m.archived) return false;
      } else if (mailFilter === "archived") {
        if (!m.archived) return false;
      } else {
        if (m.snoozedUntil && m.snoozedUntil > now) return false;
        if (m.archived) return false;
      }
      // Search
      if (mailSearch) {
        const q = mailSearch.toLowerCase();
        if (!((m.from||"").toLowerCase().includes(q)
          || (m.subject||"").toLowerCase().includes(q)
          || (m.snippet||"").toLowerCase().includes(q)
          || (m.body||"").toLowerCase().includes(q))) return false;
      }
      if (mailFilter === "unread") return !!m.unread;
      if (mailFilter === "star") return (m.flags||[]).includes("star");
      if (mailFilter === "atraiter") return !!m.aTraiter;
      return true;
    });
    list.sort((a,b) => (b.rawDate||b.date||"").localeCompare(a.rawDate||a.date||""));
    return list;
  }, [emails, mailFilter, mailSearch]);

  // Count helpers
  const countUnread = emails.filter(m => m.unread && !m.archived && (!m.snoozedUntil || m.snoozedUntil <= new Date().toISOString())).length;
  const countATraiter = emails.filter(m => m.aTraiter && !m.archived && (!m.snoozedUntil || m.snoozedUntil <= new Date().toISOString())).length;
  const countSnoozed = emails.filter(m => m.snoozedUntil && m.snoozedUntil > new Date().toISOString() && !m.archived).length;

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // ACTIONS
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const openEventDetail = (resa: any) => {
    setSubScreenData(resa);
    setSubScreen("event:detail");
  };

  const openMailRead = (mail: any) => {
    setSubScreenData(mail);
    setSubScreen("mail:read");
    // Marquer comme lu
    if (mail.unread) {
      const upd = emails.map(m => m.id === mail.id ? {...m, unread: false} : m);
      saveEmails(upd);
    }
  };

  const openCompose = (inReplyTo?: any) => {
    if (inReplyTo) {
      setComposeInReplyTo(inReplyTo);
      setComposeTo(inReplyTo.fromEmail || inReplyTo.from || "");
      setComposeSubject((inReplyTo.subject||"").startsWith("Re:") ? inReplyTo.subject : `Re: ${inReplyTo.subject||""}`);
      setComposeBody("");
    } else {
      setComposeInReplyTo(null);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
    }
    setSubScreen("mail:compose");
  };

  const generateWithArchange = async () => {
    if (!composeInReplyTo) { showToast("Impossible de gÃ©nÃ©rer sans mail source", "err"); return; }
    setComposeGenerating(true);
    try {
      const system = `Tu es ARCHANGE, l'agent email de ${nomEtab || "notre Ã©tablissement"}.

${nomEtab ? `Nom : ${nomEtab}` : ""}
${adresseEtab ? `Adresse : ${adresseEtab}` : ""}
${emailEtab ? `Email : ${emailEtab}` : ""}

${menusCtx ? `MENUS & TARIFS :\n${menusCtx}\n` : ""}
${conditionsCtx ? `CONDITIONS & POLITIQUE :\n${conditionsCtx}\n` : ""}
${tonCtx ? `RÃGLES & TON :\n${tonCtx}\n` : ""}

RÃ©dige une rÃ©ponse chaleureuse et professionnelle au mail suivant. Signe "ARCHANGE".`;
      const msg = `Mail reÃ§u :
De : ${composeInReplyTo.from}
Objet : ${composeInReplyTo.subject}

${composeInReplyTo.body || composeInReplyTo.snippet}`;
      const res = await apiFetch("/api/claude", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({messages: [{role:"user",content:msg}], system}),
      });
      if (!res.ok) throw new Error("Erreur ARCHANGE");
      const data = await res.json();
      const reply = data.content?.[0]?.text || data.text || "";
      setComposeBody(reply);
    } catch (e) {
      showToast(humanError(e), "err");
    } finally {
      setComposeGenerating(false);
    }
  };

  const sendMail = async () => {
    if (!composeTo || !composeSubject || !composeBody) { showToast("Destinataire, objet et corps requis", "err"); return; }
    setComposeSending(true);
    try {
      const res = await apiFetch("/api/send-mail", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({to: composeTo, subject: composeSubject, body: composeBody, inReplyTo: composeInReplyTo?.id}),
      });
      if (!res.ok) throw new Error("Ãchec envoi");
      showToast("Mail envoyÃ©");
      setSubScreen(null);
      setComposeTo(""); setComposeSubject(""); setComposeBody(""); setComposeInReplyTo(null);
    } catch (e) {
      showToast(humanError(e), "err");
    } finally {
      setComposeSending(false);
    }
  };

  const toggleFlag = (mailId: string, flag: string) => {
    const upd = emails.map(m => {
      if (m.id !== mailId) return m;
      const flags = m.flags || [];
      return {...m, flags: flags.includes(flag) ? flags.filter((f:string)=>f!==flag) : [...flags, flag]};
    });
    saveEmails(upd);
  };
  const toggleATraiter = (mailId: string) => {
    const upd = emails.map(m => m.id === mailId ? {...m, aTraiter: !m.aTraiter} : m);
    saveEmails(upd);
  };
  const archiveMail = (mailId: string) => {
    const upd = emails.map(m => m.id === mailId ? {...m, archived: true} : m);
    saveEmails(upd);
    setSubScreen(null);
    showToast("Mail archivÃ©");
  };
  const snoozeMail = (mailId: string, until: string) => {
    const upd = emails.map(m => m.id === mailId ? {...m, snoozedUntil: until, unread: false} : m);
    saveEmails(upd);
    setSubScreen(null);
    showToast("Mail reportÃ©");
  };

  const createEvent = () => {
    const errs: Record<string,string> = {};
    if (!newEvent.prenom?.trim()) errs.prenom = "PrÃ©nom obligatoire";
    if (!newEvent.nom?.trim()) errs.nom = "Nom obligatoire";
    if (!newEvent.dateDebut) errs.dateDebut = "Date obligatoire";
    if (!newEvent.heureDebut) errs.heureDebut = "Heure de dÃ©but";
    if (!newEvent.heureFin) errs.heureFin = "Heure de fin";
    if (Object.keys(errs).length > 0) { setNewEventErrors(errs); return; }
    const r = {...newEvent, id: "r"+Date.now(), statut: newEvent.statut || "nouveau"};
    saveResas([...resas, r]);
    setSubScreen(null);
    setNewEvent({...EMPTY_RESA, espaceId: espaces[0]?.id || ""});
    setNewEventErrors({});
    showToast("Demande crÃ©Ã©e");
  };

  const saveEditEvent = () => {
    if (!editEvent) return;
    const upd = resas.map(r => r.id === editEvent.id ? editEvent : r);
    saveResas(upd);
    setSubScreenData(editEvent);
    setEditEvent(null);
    showToast("Mis Ã  jour");
  };

  const deleteEvent = (resa: any) => {
    if (!window.confirm(`Supprimer l'Ã©vÃ©nement de ${displayNom(resa)} ?`)) return;
    saveResas(resas.filter(r => r.id !== resa.id));
    setSubScreen(null);
    showToast("SupprimÃ©");
  };
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // RENDU
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  if (status === "loading" || loading) {
    return (
      <div style={{minHeight:"100vh",background:T.bgCanvas,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.fontSans}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontFamily:T.fontSerif,fontSize:40,color:T.accent,marginBottom:16}}>â¦</div>
          <div style={{fontSize:13,color:T.textSecondary}}>Chargementâ¦</div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div style={{minHeight:"100vh",background:T.bgCanvas,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.fontSans,padding:24}}>
        <div style={{textAlign:"center",maxWidth:280}}>
          <div style={{fontFamily:T.fontSerif,fontSize:48,color:T.accent,marginBottom:12}}>â¦</div>
          <div style={{fontFamily:T.fontSerif,fontSize:26,color:T.textPrimary,marginBottom:8,letterSpacing:"-0.02em"}}>ARCHANGE</div>
          <div style={{fontSize:14,color:T.textSecondary,marginBottom:24,lineHeight:1.5}}>Connectez-vous pour accÃ©der Ã  vos mails et votre planning.</div>
          <button onClick={()=>signIn("google", {callbackUrl:"/mobile"})} style={{width:"100%",padding:"12px 20px",borderRadius:11,border:"none",background:T.accent,color:"#FFFFFF",fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:T.fontSans}}>
            Se connecter avec Google
          </button>
        </div>
      </div>
    );
  }

  // âââââââ STYLES GLOBAUX âââââââ
  const frameStyle: any = {
    position:"fixed",top:0,left:0,right:0,bottom:0,
    background:T.bgCanvas,
    fontFamily:T.fontSans,
    color:T.textPrimary,
    WebkitFontSmoothing:"antialiased",
    display:"flex",flexDirection:"column",
    overflow:"hidden",
  };

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // SOUS-ÃCRANS (plein Ã©cran, couvrent toute l'app)
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  if (subScreen === "event:detail" && subScreenData && !editEvent) {
    return renderEventDetail(subScreenData);
  }
  if (subScreen === "event:detail" && editEvent) {
    return renderEventEdit();
  }
  if (subScreen === "event:new") {
    return renderNewEvent();
  }
  if (subScreen === "mail:read" && subScreenData) {
    return renderMailRead(subScreenData);
  }
  if (subScreen === "mail:compose") {
    return renderCompose();
  }
  if (subScreen?.startsWith("account:")) {
    return renderAccountSub(subScreen.substring(8));
  }

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // RENDU PRINCIPAL â bottom nav + onglet actif
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  // FAB selon l'onglet actif
  const fabAction = () => {
    if (tab === "planning") {
      setNewEvent({...EMPTY_RESA, espaceId: espaces[0]?.id || "", dateDebut: fmtISO(planDate)});
      setNewEventErrors({});
      setSubScreen("event:new");
    } else if (tab === "mails") {
      openCompose();
    } else if (tab === "events") {
      setNewEvent({...EMPTY_RESA, espaceId: espaces[0]?.id || ""});
      setNewEventErrors({});
      setSubScreen("event:new");
    }
  };
  const fabIcon = tab === "mails"
    ? <svg width="20" height="20" viewBox="0 0 14 14" fill="none"><path d="M2 11l1-3 7-7 2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 3l2 2" stroke="currentColor" strokeWidth="1.6"/></svg>
    : <svg width="20" height="20" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  const fabLabel = tab === "mails" ? "Nouveau mail" : tab === "events" ? "Nouvelle demande" : tab === "planning" ? "Nouvelle demande" : null;

  return (
    <div style={frameStyle}>
      <Toast toast={toast}/>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:90}}>
        {tab === "planning" && renderPlanning()}
        {tab === "mails" && renderMails()}
        {tab === "events" && renderEvents()}
        {tab === "account" && renderAccount()}
      </div>
      {fabLabel && (
        <button onClick={fabAction} aria-label={fabLabel} style={fabStyle()}>
          {fabIcon}
        </button>
      )}
      <BottomNav tab={tab} setTab={setTab} countUnread={countUnread} countATraiter={countATraiter}/>
    </div>
  );

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // PLANNING â Jour / Semaine / Mois
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderPlanning() {
    const headerSub =
      planView === "jour" ? `${fmtDateLongue(fmtISO(planDate))} Â· ${dayResas.length} Ã©vÃ©nement${dayResas.length>1?"s":""}` :
      planView === "semaine" ? `Semaine du ${weekDays[0].getDate()} au ${weekDays[6].getDate()} ${MOIS[weekDays[6].getMonth()].toLowerCase()}` :
      `${MOIS[planDate.getMonth()]} ${planDate.getFullYear()} Â· ${planKPIs.total} Ã©vÃ©nement${planKPIs.total>1?"s":""}`;

    const periodLabel =
      planView === "jour" ? fmtDateLongue(fmtISO(planDate)) :
      planView === "semaine" ? `${weekDays[0].getDate()} â ${weekDays[6].getDate()} ${MOIS[weekDays[6].getMonth()].slice(0,3)}` :
      `${MOIS[planDate.getMonth()]} ${planDate.getFullYear()}`;

    const periodSub =
      planView === "jour" ? (fmtISO(planDate)===todayISO ? "Aujourd'hui" : relDate(fmtISO(planDate)) || "") :
      planView === "semaine" ? (fmtISO(weekDays[0]) <= todayISO && fmtISO(weekDays[6]) >= todayISO ? "Cette semaine" : "") :
      (planDate.getMonth()===new Date().getMonth() && planDate.getFullYear()===new Date().getFullYear() ? "Ce mois" : "");

    return (
      <>
        {/* Header */}
        <div style={{padding:"6px 20px 14px",background:T.bgCanvas,borderBottom:`1px solid ${T.borderHairline}`}}>
          <div style={{fontFamily:T.fontSerif,fontSize:30,fontWeight:400,color:T.textPrimary,letterSpacing:"-0.025em",lineHeight:1.05}}>Planning</div>
          <div style={{fontSize:13,color:T.textSecondary,marginTop:4,fontVariantNumeric:"tabular-nums"}}>{headerSub}</div>
        </div>

        {/* Toggle 3 vues */}
        <div style={{display:"flex",background:T.bgSubtle,padding:3,borderRadius:9,margin:"14px 20px 0",gap:2}}>
          {(["jour","semaine","mois"] as const).map(v => (
            <button key={v} onClick={()=>setPlanView(v)} style={{flex:1,padding:"8px 0",border:"none",background:planView===v?T.bgSurface:"transparent",color:planView===v?T.textPrimary:T.textSecondary,fontFamily:T.fontSans,fontSize:13,fontWeight:500,borderRadius:7,cursor:"pointer",boxShadow:planView===v?"0 1px 2px rgba(15,15,20,0.04)":"none",textTransform:"capitalize"}}>
              {v === "jour" ? "Jour" : v === "semaine" ? "Semaine" : "Mois"}
            </button>
          ))}
        </div>

        {/* Nav date */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px 12px"}}>
          <button onClick={()=>{
            if (planView === "jour") { const d = new Date(planDate); d.setDate(d.getDate()-1); setPlanDate(d); }
            else if (planView === "semaine") { const d = new Date(planWeekStart); d.setDate(d.getDate()-7); setPlanWeekStart(d); }
            else { setPlanDate(new Date(planDate.getFullYear(), planDate.getMonth()-1, 1)); }
          }} style={{width:36,height:36,borderRadius:"50%",border:`1px solid ${T.borderHairline}`,background:T.bgSurface,color:T.textPrimary,display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div style={{textAlign:"center",flex:1}}>
            <div style={{fontFamily:T.fontSerif,fontSize:19,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.01em",lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{periodLabel}</div>
            {periodSub && <div style={{fontSize:11,color:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:2,fontWeight:500}}>{periodSub}</div>}
          </div>
          <button onClick={()=>{
            if (planView === "jour") { const d = new Date(planDate); d.setDate(d.getDate()+1); setPlanDate(d); }
            else if (planView === "semaine") { const d = new Date(planWeekStart); d.setDate(d.getDate()+7); setPlanWeekStart(d); }
            else { setPlanDate(new Date(planDate.getFullYear(), planDate.getMonth()+1, 1)); }
          }} style={{width:36,height:36,borderRadius:"50%",border:`1px solid ${T.borderHairline}`,background:T.bgSurface,color:T.textPrimary,display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        {/* KPI */}
        <div style={{padding:"0 20px 14px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div style={kpiCardStyle()}>
            <div style={kpiValStyle(T.textPrimary)}>{planView==="jour"?dayResas.length:planKPIs.total}</div>
            <div style={kpiLabelStyle()}>{planView==="jour"?"Ce jour":planView==="semaine"?"Cette sem.":"Ce mois"}</div>
          </div>
          <div style={kpiCardStyle()}>
            <div style={kpiValStyle(T.sageDark)}>{planView==="jour"?dayResas.reduce((s,r)=>s+(parseInt(r.nombrePersonnes)||0),0):planKPIs.confirmed}</div>
            <div style={kpiLabelStyle()}>{planView==="jour"?"InvitÃ©s":"ConfirmÃ©s"}</div>
          </div>
          <div style={kpiCardStyle()}>
            <div style={kpiValStyle(T.accent)}>{formatBudget(planKPIs.totalBudget)}</div>
            <div style={kpiLabelStyle()}>Budget</div>
          </div>
        </div>

        {/* Contenu */}
        {planView === "jour" && renderPlanningJour()}
        {planView === "semaine" && renderPlanningSemaine()}
        {planView === "mois" && renderPlanningMois()}

      </>
    );
  }

  function renderPlanningJour() {
    if (dayResas.length === 0) {
      return (
        <div style={{textAlign:"center",padding:"48px 20px",color:T.textTertiary}}>
          <svg width="40" height="40" viewBox="0 0 14 14" fill="none" style={{color:T.textQuat,marginBottom:12}}><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1"/><path d="M1.5 5.5h11M4.5 1v2.5M9.5 1v2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
          <div style={{fontSize:14,color:T.textSecondary}}>Aucun Ã©vÃ©nement ce jour</div>
          <div style={{fontSize:12,marginTop:4}}>Appuyez sur ï¼ pour ajouter une demande</div>
        </div>
      );
    }
    return (
      <div style={{padding:"4px 16px 0"}}>
        {dayResas.map(r => <EventCardDay key={r.id} r={r} statuts={statuts} espaces={espaces} onClick={()=>openEventDetail(r)}/>)}
      </div>
    );
  }

  function renderPlanningSemaine() {
    return (
      <div style={{padding:"4px 16px 0"}}>
        {weekDays.map(d => {
          const ds = fmtISO(d);
          const rs = resasForDate(ds).sort((a,b)=>(a.heureDebut||"").localeCompare(b.heureDebut||""));
          const isTd = ds === todayISO;
          const totalPers = rs.reduce((s,r)=>s+(parseInt(r.nombrePersonnes)||0),0);
          return (
            <div key={ds} style={{marginBottom:18}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8,padding:"8px 4px 10px",position:"sticky",top:0,background:T.bgCanvas,zIndex:2}}>
                <div style={{fontFamily:T.fontSerif,fontSize:26,fontWeight:500,color:isTd?T.accent:T.textPrimary,letterSpacing:"-0.03em",lineHeight:1,fontVariantNumeric:"tabular-nums",minWidth:32}}>{d.getDate()}</div>
                <div style={{fontSize:12.5,color:T.textSecondary,fontWeight:500,lineHeight:1.1}}>
                  <div style={{color:isTd?T.accent:T.textPrimary,fontSize:13.5,letterSpacing:"-0.005em",marginBottom:1,fontWeight:500}}>{JOURS_LONG[d.getDay()]}{isTd?" Â· Aujourd'hui":""}</div>
                  <span>{rs.length} Ã©vÃ©nement{rs.length!==1?"s":""}{totalPers?` Â· ${totalPers} pers.`:""}</span>
                </div>
                {rs.length > 0 && <div style={{marginLeft:"auto",fontSize:11,color:isTd?T.accent:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500,fontVariantNumeric:"tabular-nums"}}>{rs.length}</div>}
              </div>
              {rs.length === 0 ? (
                <div style={{padding:"10px 4px 0",fontSize:13,color:T.textTertiary}}>â</div>
              ) : (
                rs.map(r => <EventCardCompact key={r.id} r={r} statuts={statuts} espaces={espaces} onClick={()=>openEventDetail(r)}/>)
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderPlanningMois() {
    const fd = firstDay(planDate);
    const dim = daysInMonth(planDate);
    const prevDim = new Date(planDate.getFullYear(), planDate.getMonth(), 0).getDate();
    const totalCells = fd + dim;
    const fillNext = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);

    const selectedDayResas = resasForDate(planMonthSelectedDay).sort((a,b)=>(a.heureDebut||"").localeCompare(b.heureDebut||""));
    const selDate = new Date(planMonthSelectedDay);

    return (
      <>
        <div style={{padding:"0 16px 14px"}}>
          <div style={{background:T.bgSurface,border:`1px solid ${T.borderHairline}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
              {["L","M","M","J","V","S","D"].map((l,i) => (
                <div key={i} style={{textAlign:"center",padding:"9px 0 8px",fontSize:10,color:T.textTertiary,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderTop:`1px solid ${T.borderHairline}`}}>
              {/* Jours du mois prÃ©cÃ©dent */}
              {Array.from({length:fd}).map((_,i) => {
                const day = prevDim - fd + i + 1;
                return (
                  <div key={"p"+i} style={monthCellStyle(i, fd, true, false, false)}>
                    <span style={{...monthDayNumStyle(false, false), color: T.textTertiary}}>{day}</span>
                  </div>
                );
              })}
              {/* Jours du mois */}
              {Array.from({length:dim}).map((_,i) => {
                const day = i + 1;
                const ds = fmtISO(new Date(planDate.getFullYear(), planDate.getMonth(), day));
                const rs = resasForDate(ds);
                const isTd = ds === todayISO;
                const isSelected = ds === planMonthSelectedDay;
                const col = (fd + i) % 7;
                return (
                  <div key={day} onClick={()=>setPlanMonthSelectedDay(ds)} style={monthCellStyle(col, 7, false, isTd, isSelected)}>
                    <span style={monthDayNumStyle(isTd, isSelected)}>{day}</span>
                    <div style={{display:"flex",gap:2.5,justifyContent:"center",minHeight:5}}>
                      {rs.slice(0,3).map((r,idx) => {
                        const st = statuts.find(s=>s.id===(r.statut||"nouveau"));
                        return <div key={idx} style={{width:4.5,height:4.5,borderRadius:"50%",background:st?.color||T.textTertiary}}/>;
                      })}
                      {rs.length > 3 && <span style={{fontSize:8.5,color:T.textTertiary,fontWeight:500,marginLeft:1,lineHeight:1}}>+{rs.length-3}</span>}
                    </div>
                  </div>
                );
              })}
              {/* Jours du mois suivant */}
              {Array.from({length:fillNext}).map((_,i) => (
                <div key={"n"+i} style={monthCellStyle(i, fillNext, true, false, false)}>
                  <span style={{...monthDayNumStyle(false, false), color: T.textTertiary}}>{i+1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sheet du jour sÃ©lectionnÃ© */}
        <div style={{marginTop:14,background:T.bgSurface,borderTop:`1px solid ${T.borderHairline}`}}>
          <div style={{padding:"14px 20px 10px",display:"flex",alignItems:"baseline",justifyContent:"space-between",borderBottom:`1px solid ${T.borderHairline}`}}>
            <div style={{fontFamily:T.fontSerif,fontSize:18,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.015em"}}>{JOURS_LONG[selDate.getDay()]} {selDate.getDate()} {MOIS[selDate.getMonth()].toLowerCase()}</div>
            <div style={{fontSize:11,color:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500,fontVariantNumeric:"tabular-nums"}}>{selectedDayResas.length} Ã©vÃ©nement{selectedDayResas.length!==1?"s":""}</div>
          </div>
          <div style={{padding:"10px 16px 20px"}}>
            {selectedDayResas.length === 0 ? (
              <div style={{textAlign:"center",padding:"32px 16px 20px",color:T.textTertiary,fontSize:13}}>
                Aucun Ã©vÃ©nement ce jour
              </div>
            ) : (
              selectedDayResas.map(r => <EventCardCompact key={r.id} r={r} statuts={statuts} espaces={espaces} onClick={()=>openEventDetail(r)}/>)
            )}
          </div>
        </div>
      </>
    );
  }
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // MAILS â liste
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderMails() {
    return (
      <>
        <div style={{padding:"6px 20px 14px",background:T.bgCanvas,borderBottom:`1px solid ${T.borderHairline}`}}>
          <div style={{fontFamily:T.fontSerif,fontSize:30,fontWeight:400,color:T.textPrimary,letterSpacing:"-0.025em",lineHeight:1.05}}>Mails</div>
          <div style={{fontSize:13,color:T.textSecondary,marginTop:4,fontVariantNumeric:"tabular-nums"}}>{countUnread} non lu{countUnread!==1?"s":""} sur {emails.filter(m=>!m.archived).length}</div>
        </div>

        {/* Recherche */}
        <div style={{padding:"4px 16px 10px",background:T.bgCanvas,position:"relative"}}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{position:"absolute",left:28,top:"calc(50% - 5px)",color:T.textTertiary,pointerEvents:"none"}}><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          <input value={mailSearch} onChange={e=>setMailSearch(e.target.value)} placeholder="Rechercher un mailâ¦" style={{width:"100%",padding:"9px 14px 9px 36px",border:`1px solid ${T.borderHairline}`,borderRadius:10,background:T.bgSurface,fontFamily:T.fontSans,fontSize:14,color:T.textPrimary,outline:"none"}}/>
        </div>

        {/* Filtres chips */}
        <div style={{display:"flex",gap:7,padding:"0 16px 12px",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          {([
            ["all", "Tous", emails.filter(m=>!m.archived).length],
            ["unread", "Non lus", countUnread],
            ["star", "Favoris", null],
            ["atraiter", "Ã traiter", countATraiter],
            ["snoozed", "ReportÃ©s", countSnoozed],
            ["archived", "ArchivÃ©s", null],
          ] as const).map(([id,label,count]) => {
            const active = mailFilter === id;
            return (
              <button key={id} onClick={()=>setMailFilter(id as any)} style={{flexShrink:0,padding:"6px 13px",borderRadius:100,border:`1px solid ${active?T.accentRing:T.borderHairline}`,background:active?T.accentSubtle:T.bgSurface,color:active?T.accent:T.textSecondary,fontFamily:T.fontSans,fontSize:12.5,fontWeight:500,display:"inline-flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                {label}
                {count != null && count > 0 && <span style={{background:active?"rgba(184,146,79,0.15)":T.bgSubtle,color:active?T.accent:T.textTertiary,padding:"1px 6px",borderRadius:100,fontSize:10,fontVariantNumeric:"tabular-nums"}}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Liste */}
        <div style={{background:T.bgSurface}}>
          {filteredMails.length === 0 ? (
            <div style={{textAlign:"center",padding:"48px 20px",color:T.textTertiary}}>
              <svg width="40" height="40" viewBox="0 0 14 14" fill="none" style={{color:T.textQuat,marginBottom:12}}><path d="M1 4l6 4.5L13 4M1 3.5h12v7H1z" stroke="currentColor" strokeWidth="1"/></svg>
              <div style={{fontSize:14,color:T.textSecondary}}>Aucun mail</div>
            </div>
          ) : (
            filteredMails.map(m => <MailCard key={m.id} mail={m} emailTags={emailTags[m.id]||[]} customTags={customTags} onClick={()=>openMailRead(m)}/>)
          )}
        </div>
      </>
    );
  }

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // MAIL OUVERT (lecture)
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderMailRead(mail: any) {
    const starred = (mail.flags||[]).includes("star");
    const extracted = repliesCache[mail.id]?.extracted;
    const isReservation = extracted?.isReservation;

    return (
      <div style={frameStyle}>
        <Toast toast={toast}/>
        {/* Header */}
        <div style={{padding:"6px 12px 0",background:T.bgCanvas,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <button onClick={()=>setSubScreen(null)} style={backBtnStyle()}>
            <svg width="20" height="20" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div style={{fontSize:14,color:T.textSecondary,fontWeight:500,flex:1,textAlign:"center"}}>BoÃ®te de rÃ©ception</div>
          <button onClick={()=>toggleFlag(mail.id, "star")} style={{width:38,height:38,borderRadius:10,background:"transparent",border:"none",color:starred?T.accent:T.textSecondary,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="18" height="18" viewBox="0 0 14 14" fill={starred?"currentColor":"none"}><path d="M7 1.5l1.8 3.7 4 0.6-2.9 2.8 0.7 4L7 10.7l-3.6 1.9 0.7-4L1.2 5.8l4-0.6L7 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:90}}>
          {/* Sujet + sender */}
          <div style={{padding:"14px 20px 16px",background:T.bgCanvas,borderBottom:`1px solid ${T.borderHairline}`}}>
            <div style={{fontFamily:T.fontSerif,fontSize:20,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.015em",lineHeight:1.25,marginBottom:10}}>{mail.subject||"Sans objet"}</div>
            <div style={{display:"flex",gap:11,alignItems:"center"}}>
              <Avatar name={mail.from} size={42}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14.5,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.005em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{mail.from}</div>
                <div style={{fontSize:12.5,color:T.textSecondary,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{mail.fromEmail||""}</div>
              </div>
              <div style={{fontSize:11.5,color:T.textTertiary,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{mail.date||""}</div>
            </div>
          </div>

          {/* Card rÃ©sa dÃ©tectÃ©e (si applicable) */}
          {isReservation && (
            <div style={{margin:"14px 16px 0",background:T.sageSubtle,border:`1px solid rgba(107,138,91,0.25)`,borderRadius:12,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid rgba(107,138,91,0.15)"}}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{color:T.sageDark,opacity:0.8}}><path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div style={{fontSize:12,fontWeight:500,color:T.sageDark,textTransform:"uppercase",letterSpacing:"0.06em",flex:1}}>RÃ©servation dÃ©tectÃ©e par ARCHANGE</div>
                {extracted.confiance && <span style={{fontSize:10.5,color:T.sageDark,opacity:0.7,fontVariantNumeric:"tabular-nums",fontWeight:500}}>{extracted.confiance} %</span>}
              </div>
              <div style={{padding:"12px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {extracted.dateDebut && <ResaField label="Date" value={fmtDateFr(extracted.dateDebut) + (extracted.heureDebut ? ` Â· ${extracted.heureDebut}` : "")}/>}
                {extracted.nombrePersonnes && <ResaField label="Personnes" value={extracted.nombrePersonnes}/>}
                {extracted.espaceSuggere && <ResaField label="Espace" value={espaces.find(e=>e.id===extracted.espaceSuggere)?.nom || "â"}/>}
                {extracted.budget && <ResaField label="Budget" value={extracted.budget}/>}
              </div>
              <div style={{padding:"10px 14px 12px",borderTop:"1px solid rgba(107,138,91,0.15)"}}>
                <button onClick={()=>{
                  setNewEvent({
                    ...EMPTY_RESA,
                    prenom: extracted.prenom || "",
                    nom: extracted.nom || "",
                    email: mail.fromEmail || "",
                    entreprise: extracted.entreprise || "",
                    dateDebut: extracted.dateDebut || "",
                    heureDebut: extracted.heureDebut || "",
                    heureFin: extracted.heureFin || "",
                    nombrePersonnes: extracted.nombrePersonnes || "",
                    espaceId: extracted.espaceSuggere || espaces[0]?.id || "",
                    budget: extracted.budget || "",
                    typeEvenement: extracted.typeEvenement || "",
                    statut: extracted.statutSuggere || "nouveau",
                    notes: extracted.notes || "",
                  });
                  setSubScreen("event:new");
                }} style={{width:"100%",padding:"10px 14px",background:T.sageDark,color:"#FFFFFF",border:"none",borderRadius:10,fontFamily:T.fontSans,fontSize:13.5,fontWeight:500,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,cursor:"pointer",letterSpacing:"-0.005em"}}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  Ajouter au planning
                </button>
              </div>
            </div>
          )}

          {/* Corps */}
          <div style={{padding:"18px 20px 24px",fontSize:14.5,lineHeight:1.6,color:T.textPrimary,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
            {mail.body || mail.snippet || "Chargement du contenuâ¦"}
          </div>
        </div>

        {/* Actions sticky bottom */}
        <div style={{background:"rgba(255,255,255,0.96)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderTop:`1px solid ${T.borderHairline}`,padding:"10px 14px 26px",display:"flex",gap:8,flexShrink:0}}>
          <button onClick={()=>{ openCompose(mail); setTimeout(()=>generateWithArchange(), 100); }} style={{flex:1,padding:"12px 0",borderRadius:11,border:"1px solid #1A1A1E",background:"#1A1A1E",color:"#FFFFFF",fontFamily:T.fontSans,fontSize:13.5,fontWeight:500,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer"}}>
            <span style={{color:T.accent}}>â¦</span> RÃ©pondre avec ARCHANGE
          </button>
          <button onClick={()=>openCompose(mail)} style={{flex:0.7,padding:"12px 0",borderRadius:11,border:`1px solid ${T.borderSoft}`,background:T.bgSurface,color:T.textPrimary,fontFamily:T.fontSans,fontSize:13.5,fontWeight:500,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer"}}>
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M8 3H4a2 2 0 00-2 2v4M2 9l2 2M2 9l2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            RÃ©pondre
          </button>
        </div>
      </div>
    );
  }

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // COMPOSE (nouveau mail / rÃ©ponse)
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderCompose() {
    return (
      <div style={frameStyle}>
        <Toast toast={toast}/>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",padding:"6px 8px 10px",background:T.bgCanvas,borderBottom:`1px solid ${T.borderHairline}`,flexShrink:0}}>
          <button onClick={()=>setSubScreen(composeInReplyTo ? "mail:read" : null)} style={{padding:"8px 14px",background:"transparent",border:"none",fontFamily:T.fontSans,fontSize:14,color:T.textPrimary,fontWeight:500}}>Annuler</button>
          <div style={{flex:1,textAlign:"center",fontSize:15,fontWeight:500,color:T.textPrimary}}>{composeInReplyTo ? "RÃ©ponse" : "Nouveau mail"}</div>
          <button onClick={sendMail} disabled={composeSending||!composeTo||!composeBody} style={{padding:"8px 14px",background:composeSending||!composeTo||!composeBody?T.textQuat:T.accent,border:"none",color:"#FFFFFF",borderRadius:8,fontFamily:T.fontSans,fontSize:13,fontWeight:500,marginRight:8,opacity:composeSending||!composeTo||!composeBody?0.7:1}}>
            {composeSending ? "Envoiâ¦" : "Envoyer"}
          </button>
        </div>

        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
          {/* Champs */}
          <div style={{background:T.bgSurface,borderBottom:`1px solid ${T.borderHairline}`,flexShrink:0}}>
            <div style={composeRowStyle()}>
              <span style={composeLabelStyle()}>Ã</span>
              <input value={composeTo} onChange={e=>setComposeTo(e.target.value)} placeholder="destinataire@example.com" style={composeInputStyle()}/>
            </div>
            <div style={composeRowStyle()}>
              <span style={composeLabelStyle()}>Objet</span>
              <input value={composeSubject} onChange={e=>setComposeSubject(e.target.value)} placeholder="Sujet du mail" style={composeInputStyle()}/>
            </div>
          </div>

          {/* Bouton ARCHANGE */}
          {composeInReplyTo && (
            <div style={{padding:"14px 18px",background:T.bgCanvas,flexShrink:0}}>
              <button onClick={generateWithArchange} disabled={composeGenerating} style={{width:"100%",padding:"11px 14px",background:"linear-gradient(135deg, rgba(184,146,79,0.12) 0%, rgba(184,146,79,0.06) 100%)",border:"1px solid rgba(184,146,79,0.3)",borderRadius:11,color:T.accent,fontFamily:T.fontSans,fontSize:13.5,fontWeight:500,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,letterSpacing:"-0.005em",opacity:composeGenerating?0.6:1,cursor:composeGenerating?"wait":"pointer"}}>
                {composeGenerating ? (
                  <><span style={{fontSize:16}}>â¦</span> GÃ©nÃ©ration en coursâ¦</>
                ) : (
                  <><span style={{fontSize:16}}>â¦</span> GÃ©nÃ©rer une rÃ©ponse avec ARCHANGE</>
                )}
              </button>
            </div>
          )}

          {/* Corps */}
          <textarea value={composeBody} onChange={e=>setComposeBody(e.target.value)} placeholder="Ãcrivez votre messageâ¦" style={{flex:1,padding:"16px 18px",background:T.bgSurface,fontFamily:T.fontSans,fontSize:14.5,lineHeight:1.55,color:T.textPrimary,border:"none",outline:"none",resize:"none",width:"100%",minHeight:200}}/>
        </div>
      </div>
    );
  }

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // ÃVÃNEMENTS
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderEvents() {
    return (
      <>
        <div style={{padding:"6px 20px 14px",background:T.bgCanvas,borderBottom:`1px solid ${T.borderHairline}`}}>
          <div style={{fontFamily:T.fontSerif,fontSize:30,fontWeight:400,color:T.textPrimary,letterSpacing:"-0.025em",lineHeight:1.05}}>ÃvÃ©nements</div>
          <div style={{fontSize:13,color:T.textSecondary,marginTop:4,fontVariantNumeric:"tabular-nums"}}>{resas.length} demande{resas.length!==1?"s":""}{eventKPIs.aRelancer>0?` Â· ${eventKPIs.aRelancer} Ã  relancer`:""}</div>
        </div>

        {/* KPI */}
        <div style={{padding:"14px 20px 14px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:7}}>
          <div style={kpiCardStyle(true)}>
            <div style={{...kpiValStyle(T.sageDark),fontSize:20}}>{eventKPIs.cetteSemaine}</div>
            <div style={{...kpiLabelStyle(),fontSize:10}}>Cette sem.</div>
          </div>
          <div style={kpiCardStyle(true)}>
            <div style={{...kpiValStyle(T.danger),fontSize:20}}>{eventKPIs.aRelancer}</div>
            <div style={{...kpiLabelStyle(),fontSize:10}}>Ã relancer</div>
          </div>
          <div style={kpiCardStyle(true)}>
            <div style={{...kpiValStyle(T.textPrimary),fontSize:20}}>{eventKPIs.nouvelles}</div>
            <div style={{...kpiLabelStyle(),fontSize:10}}>Nouvelles</div>
          </div>
          <div style={kpiCardStyle(true)}>
            <div style={{...kpiValStyle(T.accent),fontSize:20}}>{formatBudget(eventKPIs.prevBudget)}</div>
            <div style={{...kpiLabelStyle(),fontSize:10}}>PrÃ©vi.</div>
          </div>
        </div>

        {/* Toggle groupBy */}
        <div style={{display:"flex",gap:7,padding:"0 16px 12px",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          {(["urgency","status"] as const).map(g => {
            const active = eventsGroupBy === g;
            return (
              <button key={g} onClick={()=>setEventsGroupBy(g)} style={{flexShrink:0,padding:"6px 13px",borderRadius:100,border:`1px solid ${active?T.accentRing:T.borderHairline}`,background:active?T.accentSubtle:T.bgSurface,color:active?T.accent:T.textSecondary,fontFamily:T.fontSans,fontSize:12.5,fontWeight:500,cursor:"pointer"}}>
                {g === "urgency" ? "Par urgence" : "Par statut"}
              </button>
            );
          })}
        </div>

        {/* Groupes */}
        {eventsGroupBy === "urgency" ? renderEventsByUrgency() : renderEventsByStatus()}
      </>
    );
  }

  function renderEventsByUrgency() {
    const groups: [string, string, any[]][] = [
      ["Dans â7 jours", T.danger, eventsByUrgency.urgent],
      ["Relances sans rÃ©ponse +3 jours", T.warn, eventsByUrgency.relancer],
      ["Nouvelles demandes avec date + budget", T.sage, eventsByUrgency.nouvelles],
      ["Nouvelles demandes sans date/budget", T.textTertiary, eventsByUrgency.autres],
      ["Hors rÃ©servation", T.textQuat, eventsByUrgency.hors],
    ];
    const hasAny = groups.some(([,,list]) => list.length > 0);
    if (!hasAny) {
      return <div style={{textAlign:"center",padding:"48px 20px",color:T.textTertiary,fontSize:14}}>Aucun Ã©vÃ©nement</div>;
    }
    return (
      <>
        {groups.map(([title, color, list]) => list.length === 0 ? null : (
          <div key={title} style={{marginTop:8}}>
            <div style={{padding:"14px 20px 8px",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:color,flexShrink:0}}/>
              <div style={{fontSize:11.5,fontWeight:500,color:T.textSecondary,textTransform:"uppercase",letterSpacing:"0.08em"}}>{title}</div>
              <div style={{fontSize:11.5,fontWeight:500,color:T.textTertiary,fontVariantNumeric:"tabular-nums",marginLeft:"auto"}}>{list.length}</div>
            </div>
            {list.map(r => <EventCardList key={r.id} r={r} statuts={statuts} espaces={espaces} onClick={()=>openEventDetail(r)}/>)}
          </div>
        ))}
      </>
    );
  }

  function renderEventsByStatus() {
    return (
      <>
        {statuts.map(s => {
          const list = eventsByStatus[s.id] || [];
          if (list.length === 0) return null;
          return (
            <div key={s.id} style={{marginTop:8}}>
              <div style={{padding:"14px 20px 8px",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                <div style={{fontSize:11.5,fontWeight:500,color:T.textSecondary,textTransform:"uppercase",letterSpacing:"0.08em"}}>{s.label}</div>
                <div style={{fontSize:11.5,fontWeight:500,color:T.textTertiary,fontVariantNumeric:"tabular-nums",marginLeft:"auto"}}>{list.length}</div>
              </div>
              {list.map(r => <EventCardList key={r.id} r={r} statuts={statuts} espaces={espaces} onClick={()=>openEventDetail(r)}/>)}
            </div>
          );
        })}
      </>
    );
  }
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // DÃTAIL ÃVÃNEMENT
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderEventDetail(resa: any) {
    const {prenom, nom} = splitNomPrenom(resa);
    const fullName = displayNom(resa);
    const st = statuts.find(s=>s.id===(resa.statut||"nouveau")) || statuts[0];
    const espaceNom = espaces.find(e=>e.id===resa.espaceId)?.nom || "";

    return (
      <div style={frameStyle}>
        <Toast toast={toast}/>

        <div style={{padding:"6px 12px 0",background:T.bgCanvas,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <button onClick={()=>setSubScreen(null)} style={backBtnStyle()}>
            <svg width="20" height="20" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div style={{fontSize:14,color:T.textSecondary,fontWeight:500,flex:1,textAlign:"center"}}>{resa.dateDebut ? fmtDateLongue(resa.dateDebut) : "ÃvÃ©nement"}</div>
          <button onClick={()=>deleteEvent(resa)} style={{width:38,height:38,borderRadius:10,background:"transparent",border:"none",color:T.danger,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M2.5 4h9M5.5 4V2.5h3V4M4 4l0.5 8a1 1 0 001 1h3a1 1 0 001-1L10 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:110}}>
          {/* Hero */}
          <div style={{padding:"14px 20px 18px",borderBottom:`1px solid ${T.borderHairline}`,background:T.bgCanvas}}>
            <Avatar name={fullName} size={60}/>
            <div style={{fontFamily:T.fontSerif,fontSize:24,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.022em",lineHeight:1.15,marginTop:14}}>{fullName}</div>
            {resa.entreprise && <div style={{fontSize:14,color:T.textSecondary,marginTop:4}}>{resa.entreprise}</div>}
            <div style={{display:"inline-flex",alignItems:"center",gap:7,marginTop:10}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:st.color}}/>
              <span style={{fontSize:12,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.06em",color:st.color}}>{st.label}</span>
            </div>
          </div>

          {/* Changer le statut */}
          <div style={{padding:"16px 16px 0"}}>
            <div style={{fontSize:11,fontWeight:500,color:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:9,paddingLeft:4}}>Changer le statut</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {statuts.map(s => {
                const active = (resa.statut||"nouveau") === s.id;
                return (
                  <button key={s.id} onClick={()=>{
                    const upd = resas.map(r => r.id === resa.id ? {...r, statut: s.id} : r);
                    saveResas(upd);
                    setSubScreenData({...resa, statut: s.id});
                  }} style={{padding:"7px 12px",borderRadius:100,border:active?`1px solid ${s.color}55`:"1px solid transparent",background:active?s.bg:T.bgSubtle,color:active?s.color:T.textSecondary,fontFamily:T.fontSans,fontSize:12,fontWeight:500,display:"inline-flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:s.color}}/>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Infos event */}
          <div style={settingsGroupStyle()}>
            <div style={settingsGroupTitleStyle()}>ÃvÃ©nement</div>
            <InfoRow icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 5.5h11" stroke="currentColor" strokeWidth="1.4"/></svg>} label="Date" value={resa.dateDebut ? fmtDateLongue(resa.dateDebut) : "â"}/>
            <InfoRow icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.4"/></svg>} label="Horaires" value={resa.heureDebut ? `${resa.heureDebut}${resa.heureFin ? " â "+resa.heureFin : ""}` : "â"}/>
            <InfoRow icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>} label="Personnes" value={resa.nombrePersonnes || "â"}/>
            <InfoRow icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M7 12.5s3.8-3.4 3.8-7A3.8 3.8 0 107 1.7c0 3.5 3.8 7 3.8 7z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>} label="Espace" value={espaceNom || "â"}/>
            <InfoRow icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M10 3H5a2 2 0 000 4h4a2 2 0 010 4H3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M6.5 1.5v11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>} label="Budget" value={resa.budget || "â"} valueColor={resa.budget ? T.accent : undefined}/>
            <InfoRow icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4"/></svg>} label="Type" value={resa.typeEvenement || "â"}/>
          </div>

          {/* Contact */}
          {(resa.email || resa.telephone) && (
            <div style={settingsGroupStyle()}>
              <div style={settingsGroupTitleStyle()}>Contact</div>
              {resa.email && (
                <a href={`mailto:${resa.email}`} style={{display:"flex",alignItems:"center",padding:"12px 16px",borderTop:`1px solid ${T.borderHairline}`,minHeight:52,textDecoration:"none",color:"inherit"}}>
                  <div style={{width:30,height:30,borderRadius:8,background:T.bgSubtle,color:T.textSecondary,display:"inline-flex",alignItems:"center",justifyContent:"center",marginRight:14,flexShrink:0}}>
                    <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M1 4l6 4.5L13 4M1 3.5h12v7H1z" stroke="currentColor" strokeWidth="1.4"/></svg>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,color:T.textTertiary,marginBottom:2}}>Email</div>
                    <div style={{fontSize:14,color:T.textPrimary,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{resa.email}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="none" style={{color:T.accent,flexShrink:0}}><path d="M9 3h3v3M12 3L7 8M11 8.5V11a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </a>
              )}
              {resa.telephone && (
                <a href={`tel:${resa.telephone}`} style={{display:"flex",alignItems:"center",padding:"12px 16px",borderTop:`1px solid ${T.borderHairline}`,minHeight:52,textDecoration:"none",color:"inherit"}}>
                  <div style={{width:30,height:30,borderRadius:8,background:T.bgSubtle,color:T.textSecondary,display:"inline-flex",alignItems:"center",justifyContent:"center",marginRight:14,flexShrink:0}}>
                    <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M2 2l2 0c0.5 0 0.9 0.3 1.1 0.8l0.7 2c0.2 0.5 0 1.1-0.4 1.4l-1 0.7c0.8 1.5 2 2.7 3.5 3.5l0.7-1c0.3-0.4 0.9-0.6 1.4-0.4l2 0.7c0.5 0.2 0.8 0.6 0.8 1.1l0 2c0 0.7-0.6 1.2-1.3 1.2C5.8 14 0 8.2 0 1.3 0 0.6 0.5 0 1.2 0L2 2z" stroke="currentColor" strokeWidth="1.3"/></svg>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,color:T.textTertiary,marginBottom:2}}>TÃ©lÃ©phone</div>
                    <div style={{fontSize:14,color:T.textPrimary,fontWeight:500,fontVariantNumeric:"tabular-nums"}}>{resa.telephone}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" style={{color:T.accent,flexShrink:0}}><path d="M2 2l2 0c0.5 0 0.9 0.3 1.1 0.8l0.7 2c0.2 0.5 0 1.1-0.4 1.4l-1 0.7c0.8 1.5 2 2.7 3.5 3.5l0.7-1c0.3-0.4 0.9-0.6 1.4-0.4l2 0.7c0.5 0.2 0.8 0.6 0.8 1.1l0 2c0 0.7-0.6 1.2-1.3 1.2C5.8 14 0 8.2 0 1.3 0 0.6 0.5 0 1.2 0L2 2z"/></svg>
                </a>
              )}
            </div>
          )}

          {/* Notes client */}
          {resa.notes && (
            <div style={{background:T.bgSurface,border:`1px solid ${T.borderHairline}`,borderRadius:12,padding:"14px 16px",margin:"12px 16px 0"}}>
              <div style={{fontSize:11,color:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:500,marginBottom:7}}>Notes du client</div>
              <div style={{fontSize:14,color:T.textPrimary,lineHeight:1.55,whiteSpace:"pre-wrap"}}>{resa.notes}</div>
            </div>
          )}

          {/* Note directeur */}
          <div style={{background:T.bgSurface,border:`1px solid ${T.borderHairline}`,borderRadius:12,margin:"12px 16px 0",overflow:"hidden"}}>
            <div style={{padding:"10px 14px",background:T.bgCanvas,borderBottom:`1px solid ${T.borderHairline}`,fontSize:11.5,fontWeight:500,color:T.textPrimary,display:"flex",alignItems:"center",gap:6}}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{color:T.accent}}><path d="M2 11l1-3 7-7 2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Note directeur
              <span style={{marginLeft:"auto",fontSize:10,color:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:500}}>PrivÃ©</span>
            </div>
            <textarea value={resa.noteDirecteur||""} onChange={e=>{
              const upd = resas.map(r => r.id === resa.id ? {...r, noteDirecteur: e.target.value} : r);
              saveResas(upd);
              setSubScreenData({...resa, noteDirecteur: e.target.value});
            }} placeholder="Note confidentielleâ¦" rows={3} style={{width:"100%",padding:"10px 14px",border:"none",background:T.bgSurface,fontFamily:T.fontSans,fontSize:13,lineHeight:1.6,color:T.textPrimary,outline:"none",resize:"vertical"}}/>
          </div>
        </div>

        {/* Actions bottom */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(255,255,255,0.96)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderTop:`1px solid ${T.borderHairline}`,padding:"10px 14px 26px",display:"flex",gap:8}}>
          <button onClick={()=>setEditEvent({...resa, ...splitNomPrenom(resa)})} style={btnActionStyle(false)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 11l1-3 7-7 2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Modifier
          </button>
          {resa.email && (
            <button onClick={()=>{
              openCompose({
                from: displayNom(resa),
                fromEmail: resa.email,
                subject: "Votre Ã©vÃ©nement du " + (resa.dateDebut ? fmtDateFr(resa.dateDebut) : ""),
              });
            }} style={btnActionStyle(true)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7L13 1L9.5 13L7 8L1 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
              Envoyer un mail
            </button>
          )}
        </div>
      </div>
    );
  }

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // FORMULAIRE NOUVELLE DEMANDE
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderNewEvent() {
    return (
      <div style={frameStyle}>
        <Toast toast={toast}/>

        <div style={{display:"flex",alignItems:"center",padding:"6px 8px 10px",background:T.bgCanvas,borderBottom:`1px solid ${T.borderHairline}`,flexShrink:0}}>
          <button onClick={()=>{setSubScreen(null);setNewEventErrors({});}} style={{padding:"8px 14px",background:"transparent",border:"none",fontFamily:T.fontSans,fontSize:14,color:T.textPrimary,fontWeight:500}}>Annuler</button>
          <div style={{flex:1,textAlign:"center",fontSize:15,fontWeight:500,color:T.textPrimary}}>Nouvelle demande</div>
          <button onClick={createEvent} style={{padding:"8px 14px",background:T.accent,border:"none",color:"#FFFFFF",borderRadius:8,fontFamily:T.fontSans,fontSize:13,fontWeight:500,marginRight:8}}>
            CrÃ©er
          </button>
        </div>

        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:40}}>
          {renderEventForm(newEvent, setNewEvent, newEventErrors)}
        </div>
      </div>
    );
  }

  function renderEventEdit() {
    if (!editEvent) return null;
    return (
      <div style={frameStyle}>
        <Toast toast={toast}/>

        <div style={{display:"flex",alignItems:"center",padding:"6px 8px 10px",background:T.bgCanvas,borderBottom:`1px solid ${T.borderHairline}`,flexShrink:0}}>
          <button onClick={()=>setEditEvent(null)} style={{padding:"8px 14px",background:"transparent",border:"none",fontFamily:T.fontSans,fontSize:14,color:T.textPrimary,fontWeight:500}}>Annuler</button>
          <div style={{flex:1,textAlign:"center",fontSize:15,fontWeight:500,color:T.textPrimary}}>Modifier</div>
          <button onClick={saveEditEvent} style={{padding:"8px 14px",background:T.accent,border:"none",color:"#FFFFFF",borderRadius:8,fontFamily:T.fontSans,fontSize:13,fontWeight:500,marginRight:8}}>
            Enregistrer
          </button>
        </div>

        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:40}}>
          {renderEventForm(editEvent, setEditEvent, {})}
          <div style={{padding:"16px 16px 0"}}>
            <FormLabel text="Statut"/>
            <select value={editEvent.statut||"nouveau"} onChange={e=>setEditEvent({...editEvent,statut:e.target.value})} style={{width:"100%",padding:"12px 14px",border:`1px solid ${T.borderHairline}`,borderRadius:10,background:T.bgSurface,fontFamily:T.fontSans,fontSize:15,color:T.textPrimary,outline:"none"}}>
              {statuts.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>
    );
  }

  function renderEventForm(val: any, setVal: any, errors: Record<string,string>) {
    const inp = (k: string, placeholder: string, type: string = "text") => (
      <input type={type} value={val[k]||""} onChange={e=>setVal({...val,[k]:e.target.value})} placeholder={placeholder} style={{width:"100%",padding:"12px 14px",border:`1px solid ${errors[k]?T.danger:T.borderHairline}`,borderRadius:10,background:T.bgSurface,fontFamily:T.fontSans,fontSize:15,color:T.textPrimary,outline:"none",fontVariantNumeric:type==="tel"||type==="number"||type==="time"||type==="date"?"tabular-nums":"normal"}}/>
    );
    return (
      <div style={{padding:"14px 16px 0"}}>
        {/* CLIENT */}
        <FormGroup>
          <FormLabel text="Client"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div>{inp("prenom","PrÃ©nom")}{errors.prenom&&<ErrMsg msg={errors.prenom}/>}</div>
            <div>{inp("nom","Nom")}{errors.nom&&<ErrMsg msg={errors.nom}/>}</div>
          </div>
          {inp("entreprise","SociÃ©tÃ© (optionnel)")}
        </FormGroup>

        {/* CONTACT */}
        <FormGroup>
          <FormLabel text="Contact"/>
          {inp("email","email@exemple.com","email")}
          <div style={{height:10}}/>
          {inp("telephone","+33 6 12 34 56 78","tel")}
        </FormGroup>

        {/* QUAND */}
        <FormGroup>
          <FormLabel text="Quand"/>
          {inp("dateDebut","Date","date")}
          {errors.dateDebut&&<ErrMsg msg={errors.dateDebut}/>}
          <div style={{height:10}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>{inp("heureDebut","DÃ©but","time")}{errors.heureDebut&&<ErrMsg msg={errors.heureDebut}/>}</div>
            <div>{inp("heureFin","Fin","time")}{errors.heureFin&&<ErrMsg msg={errors.heureFin}/>}</div>
          </div>
        </FormGroup>

        {/* INVITÃS */}
        <FormGroup>
          <FormLabel text="InvitÃ©s"/>
          {inp("nombrePersonnes","Nombre de personnes","number")}
          <div style={{height:10}}/>
          <select value={val.typeEvenement||""} onChange={e=>setVal({...val,typeEvenement:e.target.value})} style={{width:"100%",padding:"12px 14px",border:`1px solid ${T.borderHairline}`,borderRadius:10,background:T.bgSurface,fontFamily:T.fontSans,fontSize:15,color:T.textPrimary,outline:"none"}}>
            <option value="">Type d'Ã©vÃ©nement</option>
            {TYPES_EVT.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </FormGroup>

        {/* LIEU & BUDGET */}
        <FormGroup>
          <FormLabel text="Lieu & budget"/>
          <select value={val.espaceId||espaces[0]?.id||""} onChange={e=>setVal({...val,espaceId:e.target.value})} style={{width:"100%",padding:"12px 14px",border:`1px solid ${T.borderHairline}`,borderRadius:10,background:T.bgSurface,fontFamily:T.fontSans,fontSize:15,color:T.textPrimary,outline:"none"}}>
            {espaces.map(es=><option key={es.id} value={es.id}>{es.nom}</option>)}
          </select>
          <div style={{height:10}}/>
          {inp("budget","Budget (ex: 5 000â¬)")}
        </FormGroup>

        {/* NOTES */}
        <FormGroup>
          <FormLabel text="Notes"/>
          <textarea value={val.notes||""} onChange={e=>setVal({...val,notes:e.target.value})} rows={3} placeholder="Informations complÃ©mentairesâ¦" style={{width:"100%",padding:"12px 14px",border:`1px solid ${T.borderHairline}`,borderRadius:10,background:T.bgSurface,fontFamily:T.fontSans,fontSize:15,color:T.textPrimary,outline:"none",resize:"vertical",minHeight:80,lineHeight:1.5}}/>
        </FormGroup>
      </div>
    );
  }

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // COMPTE
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderAccount() {
    const name = session?.user?.name || "Utilisateur";
    const email = session?.user?.email || "";
    return (
      <>
        <div style={{padding:"6px 20px 8px",background:T.bgCanvas}}>
          <div style={{fontFamily:T.fontSerif,fontSize:30,fontWeight:400,color:T.textPrimary,letterSpacing:"-0.025em",lineHeight:1.05}}>Compte</div>
        </div>

        {/* Profil */}
        <div style={{padding:"8px 20px 24px",background:T.bgCanvas,textAlign:"center",borderBottom:`1px solid ${T.borderHairline}`}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:T.accentFaint,border:`1px solid ${T.accentRing}`,color:T.accent,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:500,marginBottom:14,letterSpacing:"-0.01em"}}>{initials(name)}</div>
          <div style={{fontFamily:T.fontSerif,fontSize:22,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.015em",lineHeight:1.2}}>{name}</div>
          <div style={{fontSize:13,color:T.textSecondary,marginTop:4}}>{email}</div>
        </div>

        {/* Ãtablissement */}
        <div style={settingsGroupStyle()}>
          <SettingsRow
            icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M2 12V5l5-3 5 3v7M5 12V8h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            iconColor="gold"
            title={nomEtab || "Ãtablissement"}
            subtitle="Profil Ã©tablissement"
            onClick={()=>setSubScreen("account:etab")}
          />
        </div>

        {/* Sources ARCHANGE */}
        <div style={settingsGroupStyle()}>
          <div style={settingsGroupTitleStyle()}>Sources ARCHANGE</div>
          <SettingsRow
            icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M4.5 5h5M4.5 7h5M4.5 9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            iconColor="sage"
            title="Menus & tarifs"
            subtitle="Formules, boissons, options"
            badge={menusCtx ? "Actif" : null}
            onClick={()=>setSubScreen("account:menus")}
          />
          <SettingsRow
            icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M3 2h6l3 3v7a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/><path d="M9 2v3h3M4.5 8h5M4.5 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            iconColor="sage"
            title="Conditions & politique"
            subtitle="Annulation, acomptes, dÃ©lais"
            badge={conditionsCtx ? "Actif" : null}
            onClick={()=>setSubScreen("account:conditions")}
          />
          <SettingsRow
            icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M2 11l1-3 7-7 2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 3l2 2" stroke="currentColor" strokeWidth="1.3"/></svg>}
            iconColor="sage"
            title="RÃ¨gles & ton ARCHANGE"
            subtitle="Signature, style de rÃ©ponse"
            badge={tonCtx ? "Actif" : null}
            onClick={()=>setSubScreen("account:ton")}
          />
          <SettingsRow
            icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M7 12.5s3.8-3.4 3.8-7A3.8 3.8 0 107 1.7c0 3.5 3.8 7 3.8 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7" cy="5.3" r="1.3" stroke="currentColor" strokeWidth="1.3"/></svg>}
            iconColor="purple"
            title="Espaces"
            subtitle={espaces.map(e=>e.nom).join(" Â· ")}
            onClick={()=>setSubScreen("account:espaces")}
          />
          <SettingsRow
            icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3" fill="currentColor"/></svg>}
            iconColor="purple"
            title="Statuts"
            subtitle={`${statuts.length} statuts configurÃ©s`}
            onClick={()=>setSubScreen("account:statuts")}
          />
        </div>

        {/* Application */}
        <div style={settingsGroupStyle()}>
          <div style={settingsGroupTitleStyle()}>Application</div>
          <SettingsRow
            icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><rect x="2" y="2.5" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M2 5.5h10M5 2.5v9" stroke="currentColor" strokeWidth="1.3"/></svg>}
            title="Version desktop"
            subtitle="Basculer vers l'ordinateur"
            onClick={()=>router.push("/mails")}
          />
          <SettingsRow
            icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M7 1v2M7 11v2M2.5 2.5l1.5 1.5M10 10l1.5 1.5M1 7h2M11 7h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            title="Ã propos d'ARCHANGE"
            subtitle="v1.0 Â· Anthropic"
            onClick={()=>{}}
          />
        </div>

        {/* DÃ©connexion */}
        <div style={{margin:"16px 16px 0",background:T.bgSurface,borderRadius:12,border:`1px solid ${T.borderHairline}`,overflow:"hidden"}}>
          <button onClick={()=>signOut({callbackUrl:"/"})} style={{width:"100%",padding:14,background:"transparent",border:"none",color:T.danger,fontFamily:T.fontSans,fontSize:15,fontWeight:500,letterSpacing:"-0.005em",cursor:"pointer"}}>
            Se dÃ©connecter
          </button>
        </div>

        <div style={{padding:"20px",textAlign:"center",fontSize:11,color:T.textTertiary,fontFamily:T.fontSerif,fontStyle:"italic"}}>
          ARCHANGE v1.0 Â· {nomEtab || "RÃVA"}
        </div>
      </>
    );
  }

  function renderAccountSub(key: string) {
    const configs: Record<string, {title:string, value:string, save:(v:string)=>void, placeholder:string}> = {
      menus: {title:"Menus & tarifs", value:menusCtx, save:(v)=>{setMenusCtx(v);saveSources({menus:v});}, placeholder:"Vos menus, formules, tarifs par personne, options boissonsâ¦"},
      conditions: {title:"Conditions & politique", value:conditionsCtx, save:(v)=>{setConditionsCtx(v);saveSources({conditions:v});}, placeholder:"Politique d'annulation, acomptes, dÃ©lais de confirmationâ¦"},
      ton: {title:"RÃ¨gles & ton ARCHANGE", value:tonCtx, save:(v)=>{setTonCtx(v);saveSources({ton:v});}, placeholder:"Ex: Toujours proposer une visite. Signature personnalisÃ©eâ¦"},
    };
    const cfg = configs[key];
    if (!cfg) {
      // Espaces / Statuts / Ãtablissement â pour simplifier en v1 on renvoie vers desktop
      return (
        <div style={frameStyle}>
          <Toast toast={toast}/>
          <div style={{padding:"6px 12px 0",background:T.bgCanvas,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <button onClick={()=>setSubScreen(null)} style={backBtnStyle()}>
              <svg width="20" height="20" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div style={{fontSize:14,color:T.textSecondary,fontWeight:500,flex:1,textAlign:"center"}}>Compte</div>
            <div style={{width:38}}/>
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center",flexDirection:"column"}}>
            <div style={{fontFamily:T.fontSerif,fontSize:22,color:T.textPrimary,marginBottom:10,letterSpacing:"-0.015em"}}>Disponible sur desktop</div>
            <div style={{fontSize:14,color:T.textSecondary,marginBottom:24,lineHeight:1.5,maxWidth:260}}>L'Ã©dition de {key === "espaces" ? "vos espaces" : key === "statuts" ? "vos statuts" : "votre profil Ã©tablissement"} est disponible sur la version desktop.</div>
            <button onClick={()=>router.push("/mails")} style={{padding:"11px 20px",background:T.accent,color:"#FFFFFF",border:"none",borderRadius:11,fontFamily:T.fontSans,fontSize:13.5,fontWeight:500}}>
              Ouvrir la version desktop
            </button>
          </div>
        </div>
      );
    }
    return (
      <div style={frameStyle}>
        <Toast toast={toast}/>
        <div style={{padding:"6px 12px 0",background:T.bgCanvas,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <button onClick={()=>setSubScreen(null)} style={backBtnStyle()}>
            <svg width="20" height="20" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div style={{fontSize:14,color:T.textSecondary,fontWeight:500,flex:1,textAlign:"center"}}>Compte</div>
          <div style={{width:38}}/>
        </div>
        <div style={{padding:"10px 20px 14px",background:T.bgCanvas,borderBottom:`1px solid ${T.borderHairline}`}}>
          <div style={{fontFamily:T.fontSerif,fontSize:24,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.02em"}}>{cfg.title}</div>
        </div>
        <div style={{flex:1,padding:"16px 16px 16px"}}>
          <textarea value={cfg.value} onChange={e=>cfg.save(e.target.value)} placeholder={cfg.placeholder} style={{width:"100%",height:"100%",minHeight:400,padding:"14px 16px",border:`1px solid ${T.borderHairline}`,borderRadius:12,background:T.bgSurface,fontFamily:T.fontSans,fontSize:14.5,lineHeight:1.6,color:T.textPrimary,outline:"none",resize:"none"}}/>
        </div>
      </div>
    );
  }
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// COMPOSANTS RÃUTILISABLES
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function BottomNav({tab, setTab, countUnread, countATraiter}: {tab:string,setTab:any,countUnread:number,countATraiter:number}) {
  const items = [
    {id:"planning", label:"Planning", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="4" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2.5 8h15M7 2v3M13 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, badge:null},
    {id:"mails", label:"Mails", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5l8 6 8-6M2 4.5h16v11H2z" stroke="currentColor" strokeWidth="1.5"/></svg>, badge:countUnread},
    {id:"events", label:"ÃvÃ©nements", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6 8h8M6 11h8M6 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, badge:null},
    {id:"account", label:"Compte", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5"/><path d="M3 17c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, badge:null},
  ];
  return (
    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(255,255,255,0.96)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderTop:`1px solid ${T.borderHairline}`,display:"flex",padding:"8px 8px 22px",zIndex:50}}>
      {items.map(item => {
        const active = tab === item.id;
        return (
          <button key={item.id} onClick={()=>setTab(item.id)} style={{flex:1,background:"none",border:"none",padding:"6px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:T.fontSans,fontSize:10.5,color:active?T.accent:T.textTertiary,fontWeight:500,cursor:"pointer",position:"relative"}}>
            <div style={{width:26,height:26,borderRadius:8,background:active?T.accentFaint:"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
              {item.icon}
              {item.badge != null && item.badge > 0 && (
                <span style={{position:"absolute",top:-2,right:-2,minWidth:16,height:16,padding:"0 4px",borderRadius:100,background:T.accent,color:"#FFFFFF",fontSize:9,fontWeight:600,display:"inline-flex",alignItems:"center",justifyContent:"center",fontVariantNumeric:"tabular-nums"}}>{item.badge > 9 ? "9+" : item.badge}</span>
              )}
            </div>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function Toast({toast}: {toast:{msg:string,type?:"ok"|"err"}|null}) {
  if (!toast) return null;
  const bg = toast.type === "err" ? T.danger : "#1A1A1E";
  return (
    <div style={{position:"fixed",top:"calc(env(safe-area-inset-top, 20px) + 12px)",left:"50%",transform:"translateX(-50%)",background:bg,color:"#FFFFFF",padding:"10px 18px",borderRadius:100,fontSize:13,fontWeight:500,fontFamily:T.fontSans,zIndex:9999,boxShadow:"0 4px 16px rgba(15,15,20,0.2)",maxWidth:"calc(100% - 32px)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
      {toast.msg}
    </div>
  );
}

function Avatar({name, size=40}: {name:string,size?:number}) {
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:T.accentFaint,border:`1px solid ${T.accentRing}`,color:T.accent,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:size*0.32,fontWeight:500,flexShrink:0,letterSpacing:"-0.005em"}}>
      {initials(name||"?")}
    </div>
  );
}

function EventCardDay({r, statuts, espaces, onClick}: any) {
  const st = statuts.find((s:any)=>s.id===(r.statut||"nouveau")) || statuts[0];
  const espaceNom = espaces.find((e:any)=>e.id===r.espaceId)?.nom || "";
  return (
    <div onClick={onClick} style={{background:T.bgSurface,border:`1px solid ${T.borderHairline}`,borderRadius:14,padding:"14px 14px",marginBottom:10,boxShadow:"0 1px 2px rgba(15,15,20,0.03)",cursor:"pointer"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:11,marginBottom:r.nombrePersonnes||espaceNom||r.budget?10:0}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",minWidth:52,flexShrink:0,paddingTop:2}}>
          <div style={{fontFamily:T.fontSerif,fontSize:20,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.02em",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{r.heureDebut||"?"}</div>
          {r.heureFin && <div style={{fontSize:12,color:T.textTertiary,marginTop:4,fontVariantNumeric:"tabular-nums"}}>â {r.heureFin}</div>}
        </div>
        <div style={{width:1,background:T.borderHairline,alignSelf:"stretch",margin:"2px 2px 2px 0"}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15.5,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.01em",lineHeight:1.25,marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{displayNom(r)}</div>
          {r.entreprise && <div style={{fontSize:13,color:T.textSecondary,lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.entreprise}</div>}
          <div style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:100,fontSize:11,fontWeight:500,letterSpacing:"0.02em",marginTop:6,background:st.bg,color:st.color}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:st.color}}/>
            {st.label}
          </div>
        </div>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{color:T.textTertiary,flexShrink:0,alignSelf:"center"}}><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      {(r.nombrePersonnes||espaceNom||r.budget) && (
        <div style={{display:"flex",flexWrap:"wrap",gap:6,paddingLeft:65,paddingTop:2}}>
          {r.nombrePersonnes && <Chip icon={<svg width="11" height="11" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>} text={`${r.nombrePersonnes} pers.`}/>}
          {espaceNom && <Chip icon={<svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M7 12.5s3.8-3.4 3.8-7A3.8 3.8 0 107 1.7c0 3.5 3.8 7 3.8 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>} text={espaceNom}/>}
          {r.budget && <Chip text={r.budget} money/>}
        </div>
      )}
    </div>
  );
}

function EventCardCompact({r, statuts, espaces, onClick}: any) {
  const st = statuts.find((s:any)=>s.id===(r.statut||"nouveau")) || statuts[0];
  const espaceNom = espaces.find((e:any)=>e.id===r.espaceId)?.nom || "";
  return (
    <div onClick={onClick} style={{background:T.bgSurface,border:`1px solid ${T.borderHairline}`,borderRadius:12,padding:"11px 12px",marginBottom:8,boxShadow:"0 1px 2px rgba(15,15,20,0.03)",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",minWidth:46,flexShrink:0}}>
        <div style={{fontFamily:T.fontSerif,fontSize:17,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.02em",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{r.heureDebut||"â"}</div>
        {r.heureFin && <div style={{fontSize:11,color:T.textTertiary,marginTop:3,fontVariantNumeric:"tabular-nums"}}>â {r.heureFin}</div>}
      </div>
      <div style={{width:1,background:T.borderHairline,alignSelf:"stretch",margin:"2px 1px"}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14.5,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.005em",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{displayNom(r)}</div>
        <div style={{fontSize:12,color:T.textSecondary,marginTop:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {[r.entreprise, r.nombrePersonnes ? `${r.nombrePersonnes} pers.` : null, espaceNom].filter(Boolean).join(" Â· ") || "â"}
        </div>
      </div>
      <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:100,fontSize:10.5,fontWeight:500,background:st.bg,color:st.color,flexShrink:0}}>
        <div style={{width:5,height:5,borderRadius:"50%",background:st.color}}/>
        {st.label}
      </div>
    </div>
  );
}

function EventCardList({r, statuts, espaces, onClick}: any) {
  const st = statuts.find((s:any)=>s.id===(r.statut||"nouveau")) || statuts[0];
  const espaceNom = espaces.find((e:any)=>e.id===r.espaceId)?.nom || "";
  const dateLabel = r.dateDebut ? fmtDateFr(r.dateDebut).replace(/\./,"").substring(0, 10) : "â";
  const dateSub = r.dateDebut ? (relDate(r.dateDebut) || "") : "";
  return (
    <div onClick={onClick} style={{margin:"0 16px 8px",background:T.bgSurface,border:`1px solid ${T.borderHairline}`,borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:11,cursor:"pointer"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",minWidth:62,flexShrink:0}}>
        <div style={{fontFamily:T.fontSerif,fontSize:14,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.01em",lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{dateLabel}</div>
        {dateSub && <div style={{fontSize:10.5,color:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500,marginTop:3}}>{dateSub}</div>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.005em",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{displayNom(r)}</div>
        <div style={{fontSize:12,color:T.textSecondary,marginTop:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {[r.entreprise, r.nombrePersonnes ? `${r.nombrePersonnes} pers.` : null, espaceNom].filter(Boolean).join(" Â· ") || "â"}
        </div>
      </div>
      <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:100,fontSize:10.5,fontWeight:500,background:st.bg,color:st.color,flexShrink:0}}>
        <div style={{width:5,height:5,borderRadius:"50%",background:st.color}}/>
        {st.label}
      </div>
    </div>
  );
}

function MailCard({mail, emailTags, customTags, onClick}: any) {
  const starred = (mail.flags||[]).includes("star");
  const tags = emailTags.map((id:string) => customTags.find((t:any)=>t.id===id)).filter(Boolean);
  return (
    <div onClick={onClick} style={{padding:"13px 18px",display:"flex",gap:12,alignItems:"flex-start",borderBottom:`1px solid ${T.borderHairline}`,background:T.bgSurface,position:"relative",cursor:"pointer"}}>
      {mail.unread && <div style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",width:6,height:6,borderRadius:"50%",background:T.accent}}/>}
      <Avatar name={mail.from||"?"} size={40}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:3}}>
          <div style={{fontSize:14,fontWeight:mail.unread?600:500,color:T.textPrimary,letterSpacing:"-0.005em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,minWidth:0}}>{mail.from||"(inconnu)"}</div>
          <div style={{fontSize:11.5,color:mail.unread?T.accent:T.textTertiary,flexShrink:0,fontVariantNumeric:"tabular-nums",fontWeight:mail.unread?500:400}}>{mail.date||""}</div>
        </div>
        <div style={{fontSize:13.5,color:T.textPrimary,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:2,letterSpacing:"-0.003em",fontWeight:mail.unread?500:400}}>{mail.subject||"(sans objet)"}</div>
        <div style={{fontSize:12.5,color:T.textSecondary,lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{mail.snippet||""}</div>
        {(starred||tags.length>0) && (
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6,alignItems:"center"}}>
            {starred && <svg width="12" height="12" viewBox="0 0 14 14" fill={T.accent}><path d="M7 1.5l1.8 3.7 4 0.6-2.9 2.8 0.7 4L7 10.7l-3.6 1.9 0.7-4L1.2 5.8l4-0.6L7 1.5z"/></svg>}
            {tags.map((t:any) => (
              <span key={t.id} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:100,fontSize:10.5,fontWeight:500,background:t.color?t.color+"22":T.bgSubtle,color:t.color||T.textSecondary}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:t.color||T.textTertiary}}/>
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({icon, text, money}: any) {
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 9px",background:money?T.accentSubtle:T.bgSubtle,borderRadius:7,fontSize:12,color:money?T.accent:T.textSecondary,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.005em",fontWeight:money?500:400}}>
      {icon && <span style={{opacity:0.65}}>{icon}</span>}
      {text}
    </span>
  );
}

function InfoRow({icon, label, value, valueColor}: any) {
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 16px",borderTop:`1px solid ${T.borderHairline}`,minHeight:52}}>
      <div style={{width:30,height:30,borderRadius:8,background:T.bgSubtle,color:T.textSecondary,display:"inline-flex",alignItems:"center",justifyContent:"center",marginRight:14,flexShrink:0}}>{icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,color:T.textTertiary,marginBottom:2}}>{label}</div>
        <div style={{fontSize:14,color:valueColor||T.textPrimary,fontWeight:500,letterSpacing:"-0.005em",fontVariantNumeric:"tabular-nums"}}>{value}</div>
      </div>
    </div>
  );
}

function SettingsRow({icon, iconColor, title, subtitle, badge, onClick}: any) {
  const iconBg = iconColor === "gold" ? T.accentSubtle : iconColor === "sage" ? T.sageSubtle : iconColor === "purple" ? T.purpleSubtle : T.bgSubtle;
  const iconFg = iconColor === "gold" ? T.accent : iconColor === "sage" ? T.sageDark : iconColor === "purple" ? T.purple : T.textSecondary;
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"center",padding:"12px 16px",borderTop:`1px solid ${T.borderHairline}`,minHeight:52,cursor:"pointer"}}>
      <div style={{width:30,height:30,borderRadius:8,background:iconBg,color:iconFg,display:"inline-flex",alignItems:"center",justifyContent:"center",marginRight:14,flexShrink:0}}>{icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:15,color:T.textPrimary,fontWeight:500,letterSpacing:"-0.005em"}}>{title}</div>
        <div style={{fontSize:12,color:T.textSecondary,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{subtitle}</div>
      </div>
      {badge && <span style={{fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:100,background:T.sageSubtle,color:T.sageDark,marginLeft:"auto",marginRight:8,flexShrink:0}}>{badge}</span>}
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{color:T.textTertiary,marginLeft:8,flexShrink:0}}><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  );
}

function ResaField({label, value}: {label:string,value:string}) {
  return (
    <div>
      <div style={{fontSize:10.5,color:T.sageDark,opacity:0.75,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500,marginBottom:2}}>{label}</div>
      <div style={{fontSize:13.5,color:T.sageDark,fontWeight:500,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.005em"}}>{value}</div>
    </div>
  );
}

function FormGroup({children}: any) {
  return <div style={{marginBottom:18}}>{children}</div>;
}
function FormLabel({text}: {text:string}) {
  return <div style={{fontSize:11,fontWeight:500,color:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,paddingLeft:4}}>{text}</div>;
}
function ErrMsg({msg}: {msg:string}) {
  return <div style={{fontSize:11,color:T.danger,marginTop:4,paddingLeft:4}}>â  {msg}</div>;
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// HELPERS STYLE
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function kpiCardStyle(small: boolean = false): any {
  return {background:T.bgSurface,border:`1px solid ${T.borderHairline}`,borderRadius:small?10:11,padding:small?"9px 9px":"10px 11px"};
}
function kpiValStyle(color: string): any {
  return {fontFamily:T.fontSerif,fontSize:22,fontWeight:500,color,letterSpacing:"-0.02em",lineHeight:1,fontVariantNumeric:"tabular-nums"};
}
function kpiLabelStyle(): any {
  return {fontSize:10.5,color:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500,marginTop:5,lineHeight:1.2};
}
function fabStyle(): any {
  return {position:"absolute",bottom:90,right:18,width:52,height:52,borderRadius:"50%",background:T.accent,color:"#FFFFFF",border:"none",boxShadow:"0 6px 18px rgba(184,146,79,0.4)",display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:40};
}
function backBtnStyle(): any {
  return {width:38,height:38,borderRadius:10,background:"transparent",border:"none",color:T.textPrimary,display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer"};
}
function monthCellStyle(col: number, colMax: number, out: boolean, today: boolean, selected: boolean): any {
  return {aspectRatio:"1",borderRight:col < 6 ? `1px solid ${T.borderHairline}` : "none",borderBottom:`1px solid ${T.borderHairline}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"5px 0 6px",position:"relative",cursor:"pointer",background:out?T.bgCanvas:selected?T.accentSubtle:T.bgSurface,opacity:out?0.45:1};
}
function monthDayNumStyle(today: boolean, selected: boolean): any {
  return {fontSize:15,color:today?"#FFFFFF":selected?T.accent:T.textPrimary,fontWeight:today||selected?500:400,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.01em",lineHeight:1,display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,background:today?T.accent:"transparent",borderRadius:"50%",boxShadow:today?"0 0 0 3px rgba(184,146,79,0.18)":"none"};
}
function settingsGroupStyle(): any {
  return {margin:"16px 16px 0",background:T.bgSurface,borderRadius:12,border:`1px solid ${T.borderHairline}`,overflow:"hidden"};
}
function settingsGroupTitleStyle(): any {
  return {fontSize:11,color:T.textTertiary,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:500,padding:"20px 16px 7px"};
}
function composeRowStyle(): any {
  return {display:"flex",alignItems:"center",padding:"12px 18px",borderBottom:`1px solid ${T.borderHairline}`,gap:14,minHeight:44};
}
function composeLabelStyle(): any {
  return {fontSize:13,color:T.textSecondary,fontWeight:500,width:35,flexShrink:0};
}
function composeInputStyle(): any {
  return {flex:1,fontSize:14,color:T.textPrimary,fontFamily:T.fontSans,border:"none",background:"transparent",outline:"none",letterSpacing:"-0.005em"};
}
function btnActionStyle(primary: boolean): any {
  return {flex:1,padding:"12px 0",borderRadius:11,border:primary?`1px solid ${T.accent}`:`1px solid ${T.borderSoft}`,background:primary?T.accent:T.bgSurface,color:primary?"#FFFFFF":T.textPrimary,fontFamily:T.fontSans,fontSize:13.5,fontWeight:500,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,letterSpacing:"-0.005em",cursor:"pointer",boxShadow:primary?"0 1px 2px rgba(184,146,79,0.2)":"none"};
}

function formatBudget(n: number): string {
  if (n === 0) return "â";
  if (n >= 1000) return `${Math.round(n/1000)}kâ¬`;
  return `${n}â¬`;
}
