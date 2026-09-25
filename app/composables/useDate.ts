import { useHostLocale } from "./useHostI18n";

export const useDate = () => {
  const locale = useHostLocale();

  const getLang = (): string => {
    const current = locale.value;
    if (current.includes("fa")) return "fa";
    if (current.includes("ar")) return "ar";
    return "en";
  };

  const parseDate = (dateInput: string | Date): Date => {
    return typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  };

  const formatTime = (dateInput: string | Date): string => {
    const date = parseDate(dateInput);
    const lang = getLang();
    return new Intl.DateTimeFormat(lang, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  };

  const formatRelativeDate = (dateInput: string | Date): string => {
    const date = parseDate(dateInput);
    const lang = getLang();
    const now = new Date();

    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });

    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 3600) {
      const mins = Math.max(Math.floor(diffInSeconds / 60), 1);
      return rtf.format(-mins, "minute");
    }

    if (diffInSeconds < 86400) {
      const hrs = Math.floor(diffInSeconds / 3600);
      return rtf.format(-hrs, "hour");
    }

    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const diffInDays = Math.floor(
      (startOfToday.getTime() - startOfDate.getTime()) / 86400000,
    );

    if (diffInDays === 1) {
      return rtf.format(-1, "day");
    }

    const calendarLang = lang === "fa" ? "fa-IR-u-ca-persian" : lang;

    const isCurrentYear =
      lang === "fa"
        ? new Intl.DateTimeFormat("en-US-u-ca-persian", {
            year: "numeric",
          }).format(now) ===
          new Intl.DateTimeFormat("en-US-u-ca-persian", {
            year: "numeric",
          }).format(date)
        : now.getFullYear() === date.getFullYear();

    if (isCurrentYear) {
      return new Intl.DateTimeFormat(calendarLang, {
        day: "numeric",
        month: "long",
      }).format(date);
    } else {
      return new Intl.DateTimeFormat(calendarLang, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
    }
  };

  const formatDateShort = (dateInput: string | Date): string => {
    const date = parseDate(dateInput);
    const lang = getLang();
    const now = new Date();

    const calendarLang = lang === "fa" ? "fa-IR-u-ca-persian" : lang;

    const isCurrentYear =
      lang === "fa"
        ? new Intl.DateTimeFormat("en-US-u-ca-persian", {
            year: "numeric",
          }).format(now) ===
          new Intl.DateTimeFormat("en-US-u-ca-persian", {
            year: "numeric",
          }).format(date)
        : now.getFullYear() === date.getFullYear();

    return new Intl.DateTimeFormat(calendarLang, {
      day: "numeric",
      month: "long",
      year: isCurrentYear ? undefined : "numeric",
    }).format(date);
  };

  const getYearsPassed = (date: Date): number => {
    const today = new Date();
    let years = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < date.getDate())
    ) {
      years--;
    }
    return years;
  };

  return {
    formatRelativeDate,
    getYearsPassed,
    formatDateShort,
    formatTime,
  };
};
