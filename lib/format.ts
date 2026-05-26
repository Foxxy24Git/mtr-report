// Format tanggal/waktu — WIB (Asia/Jakarta), Bahasa Indonesia.
const TZ = "Asia/Jakarta";

function toDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

export function fmtDateTime(d: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TZ,
  }).format(toDate(d));
}

export function fmtDate(d: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: TZ,
  }).format(toDate(d));
}

export function fmtTime(d: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(toDate(d));
}

/** Kunci tanggal YYYY-MM-DD di zona WIB (untuk pengelompokan kalender). */
export function fmtDateKey(d: Date | string): string {
  // en-CA menghasilkan format YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(toDate(d));
}
