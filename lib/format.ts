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

/** Nilai untuk <input type="datetime-local"> ("YYYY-MM-DDTHH:mm") dalam jam dinding WIB. */
export function toWibInputValue(d: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(toDate(d));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Ubah nilai datetime-local (dianggap WIB / UTC+7) menjadi ISO instant. */
export function wibInputToISO(v: string): string {
  return new Date(`${v}:00+07:00`).toISOString();
}
