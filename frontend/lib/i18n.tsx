"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Locale = "en" | "fr" | "ar";

const STORAGE_KEY = "q.locale";

export const dirFor: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  fr: "ltr",
  ar: "rtl",
};

const dict = {
  en: {
    "app.tagline": "Skip the line. Wait anywhere.",
    "join.title": "You're a tap away from your spot.",
    "join.name": "Name",
    "join.phone": "Phone",
    "join.optional": "(optional)",
    "join.submit": "Take my spot",
    "join.submitting": "Joining…",
    "join.closed": "This queue isn't open right now. Check back later.",
    "join.full": "This queue is full at the moment. Try again in a few minutes.",
    "status.waiting": "You're in line.",
    "status.called": "It's your turn.",
    "status.serving": "You're being served.",
    "status.completed": "All done.",
    "status.no_show": "We missed you.",
    "status.cancelled": "Cancelled.",
    "status.position": "Position",
    "status.live": "Live",
    "auth.login": "Log in",
    "auth.register": "Create account",
    "auth.businessName": "Business name",
    "auth.phone": "Phone",
    "auth.password": "Password",
    "auth.haveAccount": "Already have an account?",
    "auth.noAccount": "New here?",
    "dash.title": "Dashboard",
    "dash.callNext": "Call next",
    "dash.addWalkin": "Add walk-in",
    "dash.open": "Open queue",
    "dash.close": "Close queue",
    "dash.printQR": "Print QR",
    "dash.empty": "Nothing to do — line is empty.",
    "dash.complete": "Complete",
    "dash.noShow": "No-show",
    "queue.create": "Create a queue",
    "queue.name": "Queue name",
    "queue.maxCapacity": "Max capacity",
    "queue.unlimited": "Unlimited",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.signOut": "Sign out",
  },
  fr: {
    "app.tagline": "Plus de file. Attendez où vous voulez.",
    "join.title": "Une touche, et c'est à vous.",
    "join.name": "Nom",
    "join.phone": "Téléphone",
    "join.optional": "(facultatif)",
    "join.submit": "Prendre ma place",
    "join.submitting": "En cours…",
    "join.closed": "Cette file n'est pas ouverte. Revenez plus tard.",
    "join.full": "Cette file est complète. Réessayez dans quelques minutes.",
    "status.waiting": "Vous êtes dans la file.",
    "status.called": "C'est à vous.",
    "status.serving": "Vous êtes pris en charge.",
    "status.completed": "Terminé.",
    "status.no_show": "On vous a manqué.",
    "status.cancelled": "Annulé.",
    "status.position": "Position",
    "status.live": "Direct",
    "auth.login": "Se connecter",
    "auth.register": "Créer un compte",
    "auth.businessName": "Nom de l'établissement",
    "auth.phone": "Téléphone",
    "auth.password": "Mot de passe",
    "auth.haveAccount": "Déjà un compte ?",
    "auth.noAccount": "Pas de compte ?",
    "dash.title": "Tableau de bord",
    "dash.callNext": "Suivant",
    "dash.addWalkin": "Ajouter un client",
    "dash.open": "Ouvrir la file",
    "dash.close": "Fermer la file",
    "dash.printQR": "Imprimer le QR",
    "dash.empty": "Rien à faire — la file est vide.",
    "dash.complete": "Terminé",
    "dash.noShow": "Absent",
    "queue.create": "Créer une file",
    "queue.name": "Nom de la file",
    "queue.maxCapacity": "Capacité max.",
    "queue.unlimited": "Illimité",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.signOut": "Se déconnecter",
  },
  ar: {
    "app.tagline": "تخطَّ الطابور. انتظر أينما تريد.",
    "join.title": "ضغطة واحدة وأنت في الطابور.",
    "join.name": "الاسم",
    "join.phone": "الهاتف",
    "join.optional": "(اختياري)",
    "join.submit": "احجز مكاني",
    "join.submitting": "جارٍ…",
    "join.closed": "الطابور مغلق حاليًا. تحقق لاحقًا.",
    "join.full": "الطابور ممتلئ. حاول بعد دقائق.",
    "status.waiting": "أنت في الطابور.",
    "status.called": "حان دورك.",
    "status.serving": "تتم خدمتك الآن.",
    "status.completed": "تم.",
    "status.no_show": "لم نجدك.",
    "status.cancelled": "أُلغي.",
    "status.position": "الترتيب",
    "status.live": "مباشر",
    "auth.login": "تسجيل الدخول",
    "auth.register": "إنشاء حساب",
    "auth.businessName": "اسم النشاط",
    "auth.phone": "الهاتف",
    "auth.password": "كلمة المرور",
    "auth.haveAccount": "لديك حساب؟",
    "auth.noAccount": "حساب جديد؟",
    "dash.title": "لوحة التحكم",
    "dash.callNext": "التالي",
    "dash.addWalkin": "إضافة عميل",
    "dash.open": "فتح الطابور",
    "dash.close": "إغلاق الطابور",
    "dash.printQR": "طباعة الرمز",
    "dash.empty": "لا أحد بالانتظار.",
    "dash.complete": "إنهاء",
    "dash.noShow": "غائب",
    "queue.create": "إنشاء طابور",
    "queue.name": "اسم الطابور",
    "queue.maxCapacity": "السعة القصوى",
    "queue.unlimited": "بلا حد",
    "common.cancel": "إلغاء",
    "common.save": "حفظ",
    "common.signOut": "تسجيل الخروج",
  },
} as const;

export type StringKey = keyof (typeof dict)["en"];

interface I18nState {
  locale: Locale;
  t: (key: StringKey) => string;
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Locale | null) ?? null;
    if (stored && stored in dict) {
      setLocaleState(stored);
    } else {
      const nav = navigator.language.slice(0, 2);
      if (nav === "fr" || nav === "ar") setLocaleState(nav);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirFor[locale];
  }, [locale]);

  const setLocale = (l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLocaleState(l);
  };

  const t = (key: StringKey) => (dict[locale][key] ?? dict.en[key] ?? key) as string;

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
