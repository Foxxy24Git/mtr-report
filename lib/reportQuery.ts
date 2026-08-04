import { TicketStatus, type ShiftKode } from "@prisma/client";

/**
 * Jam mulai/selesai NOMINAL tiap shift (WIB), untuk membentuk jendela SATU
 * SESI shift laporan harian — bukan satu hari kalender. Cerminan SHIFT_LABELS
 * di lib/constants.ts (mis. "23:00-07:00"), disalin sebagai data terstruktur
 * karena label itu string tampilan, bukan untuk dihitung.
 * PENTING: bila jadwal shift di SHIFT_LABELS berubah, tabel ini WAJIB ikut
 * diperbarui manual — keduanya sengaja tidak disatukan (parsing jam dari
 * string label lebih rapuh daripada duplikasi kecil eksplisit ini).
 */
const SHIFT_SESSION_HOURS: Record<ShiftKode, { startHour: number; endHour: number }> = {
  A: { startHour: 7, endHour: 15 },
  B: { startHour: 15, endHour: 23 },
  C: { startHour: 23, endHour: 7 }, // melewati tengah malam
  D: { startHour: 7, endHour: 19 },
  E: { startHour: 19, endHour: 7 }, // melewati tengah malam
};

export interface ReportDateWindow {
  startWib: Date;
  endWib: Date;
}

/**
 * Jendela waktu laporan harian.
 * - useShiftSession=false (perilaku lama): satu hari kalender penuh WIB
 *   [tanggal 00:00, tanggal+1 00:00). Dipakai Download Weekly ZIP &
 *   mode=user — TIDAK BOLEH berubah.
 * - useShiftSession=true DAN shift diisi: satu SESI shift sesuai jadwal
 *   nominalnya, mis. shift C tanggal=03-08 → [03-08 23:00, 04-08 07:00).
 *   shift null/kosong tetap jatuh ke hari kalender penuh (fallback aman).
 */
export function resolveReportDateWindow(
  tanggal: string,
  shift: ShiftKode | null,
  useShiftSession: boolean
): ReportDateWindow {
  const startOfDay = new Date(`${tanggal}T00:00:00+07:00`);
  const fullDay: ReportDateWindow = {
    startWib: startOfDay,
    endWib: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
  };
  if (!useShiftSession || !shift) return fullDay;

  const hours = SHIFT_SESSION_HOURS[shift];
  const startWib = new Date(startOfDay.getTime() + hours.startHour * 60 * 60 * 1000);
  const crossesMidnight = hours.endHour <= hours.startHour;
  const endWib = new Date(
    startOfDay.getTime() + (hours.endHour + (crossesMidnight ? 24 : 0)) * 60 * 60 * 1000
  );
  return { startWib, endWib };
}

export interface ReportTicketWhereParams {
  /** Awal hari (WIB) inklusif. */
  startWib: Date;
  /** Awal hari berikutnya (WIB) eksklusif. */
  endWib: Date;
  /** Shift laporan. Difilter via openShiftKode (shift asal, immutable). */
  shift?: ShiftKode | null;
  /** Batasi ke tiket milik satu user (laporan per-user). */
  ownerUserId?: string | null;
  /**
   * Ikut sertakan tiket warisan tindak lanjut dari shift sebelumnya (opt-in,
   * default OFF). Bila true DAN `shift` diisi, where menjadi OR antara tiket
   * asli shift ini (openShiftKode, perilaku lama) dan tiket proses yang masih
   * ditangani shift ini via handover (shiftKode current + isTindakLanjutFlag),
   * mirror pola lib/ticketQueries.ts listTickets() cabang dailyMonitoring.
   */
  includeCarryOver?: boolean;
}

/**
 * Bangun klausa `where` Prisma untuk query tiket laporan.
 *
 * PENTING (FIX serah terima shift): filter shift memakai `openShiftKode`
 * — shift tempat tiket pertama di-open — BUKAN `shiftKode` yang dimutasi
 * ke shift berikutnya saat serah terima. Dengan begitu laporan shift A tetap
 * memuat tiket yang di-open pada shift A walau ownership/shift current berpindah.
 */
export function buildReportTicketWhere(
  p: ReportTicketWhereParams
): Record<string, unknown> {
  if (p.shift && p.includeCarryOver) {
    const ownerFilter = p.ownerUserId ? { ownerUserId: p.ownerUserId } : {};
    return {
      OR: [
        {
          waktuOpen: { gte: p.startWib, lt: p.endWib },
          openShiftKode: p.shift,
          ...ownerFilter,
        },
        {
          // Warisan tindak lanjut yang BELUM ditulisi kegiatan apa pun oleh shift
          // ini (baru diterima via handover). Marker isTindakLanjutFlag WAJIB
          // dibatasi rentang waktu laporan: tanpa batas ini, tiket apa pun yang
          // PERNAH punya marker di riwayatnya bisa lolos hanya karena shiftKode
          // current-nya (kolom yang terus berpindah) kebetulan sama dengan shift
          // laporan -- termasuk tiket yang saat itu BELUM ADA. Kejadian nyata:
          // tiket BN-SM23WBU0 (ATM MUARO PEITI, dibuka 04-08) bocor ke laporan
          // 03-08 shift B karena shiftKode current-nya kebetulan B saat query
          // dijalankan, padahal tiket itu belum ada pada 03-08.
          shiftKode: p.shift,
          status: TicketStatus.proses,
          activities: {
            some: { isTindakLanjutFlag: true, waktu: { gte: p.startWib, lt: p.endWib } },
          },
          ...ownerFilter,
        },
        {
          // Tiket warisan yang DISELESAIKAN oleh shift ini pada hari laporan.
          // Batas waktuSelesai pada rentang hari WAJIB ada (pitfall kode shift
          // A-E dipakai ulang tiap hari): shiftKode tidak berubah lagi setelah
          // tiket selesai, jadi tanpa batas ini tiket lama dengan shiftKode
          // sama akan muncul terus di laporan hari mana pun.
          shiftKode: p.shift,
          status: TicketStatus.selesai,
          waktuSelesai: { gte: p.startWib, lt: p.endWib },
          activities: { some: { isTindakLanjutFlag: true } },
          ...ownerFilter,
        },
        {
          // Pernah dikerjakan ATAU ditutup oleh shift ini pada hari laporan —
          // jejak permanen di ticket_activities. Klausa 2 & 3 memakai
          // `shiftKode` (kolom "sekarang dipegang siapa") yang DIMUTASI tiap
          // serah terima, jadi tiket hilang dari laporan begitu shift ini
          // menyerahkannya lagi. ticket_activities.shift_kode = shift yang
          // MENULIS baris itu dan TIDAK PERNAH berubah, jadi inilah jejak yang
          // benar. Batas `waktu` pada rentang hari WAJIB ada: kode shift A-E
          // dipakai ulang tiap hari.
          activities: {
            some: { shiftKode: p.shift, waktu: { gte: p.startWib, lt: p.endWib } },
          },
          ...ownerFilter,
        },
      ],
    };
  }

  const where: Record<string, unknown> = {
    waktuOpen: { gte: p.startWib, lt: p.endWib },
  };
  if (p.shift) where.openShiftKode = p.shift;
  if (p.ownerUserId) where.ownerUserId = p.ownerUserId;
  return where;
}

export interface ReportTicketOriginLike {
  openShiftKode: ShiftKode;
  waktuOpen: Date;
}

/**
 * Apakah tiket ASLI milik laporan (shift + hari) ini? Cerminan PERSIS klausa
 * OR pertama buildReportTicketWhere: openShiftKode cocok DAN waktuOpen berada
 * di dalam rentang hari laporan. Cek rentang hari WAJIB ada karena kode shift
 * A-E dipakai ulang tiap hari — tanpa itu, tiket shift B kemarin yang dirotasi
 * kembali ke shift B hari ini keliru dianggap tiket asli. Tanpa `shift`
 * (laporan lintas shift) semua tiket dianggap asli (perilaku lama dipertahankan).
 */
export function isNativeToShiftReport(
  t: ReportTicketOriginLike,
  p: { shift?: ShiftKode | null; startWib: Date; endWib: Date }
): boolean {
  if (!p.shift) return true;
  return (
    t.openShiftKode === p.shift &&
    t.waktuOpen >= p.startWib &&
    t.waktuOpen < p.endWib
  );
}

export interface ReportTicketActivityLike {
  waktu: Date;
  isTindakLanjutFlag: boolean;
  /**
   * Shift yang MENULIS baris ini — tidak pernah berubah. Untuk marker serah
   * terima, ini shift yang MENYERAHKAN (fromShift).
   */
  shiftKode: string;
}

/**
 * Batasi log kegiatan ke SEGMEN milik shift laporan ini saja.
 *
 * Marker isTindakLanjutFlag=true adalah garis batas serah terima yang membelah
 * log jadi beberapa segmen, satu per sesi shift yang memegang tiket:
 *   [open .. marker1]     = sesi shift PEMBUKA (tiket asli)
 *   (marker1 .. marker2]  = sesi shift berikutnya
 *   (markerN .. akhir]    = sesi shift pemegang saat ini
 * Marker sengaja tampil di KEDUA sisi: jadi batas PENUTUP segmen shift yang
 * menyerahkan sekaligus batas PEMBUKA segmen shift yang menerima.
 *
 * Segmen ditentukan dari `shiftKode` tiap baris (jejak permanen), BUKAN dari
 * "ambil segmen terakhir" — heuristik itu hanya benar selama shift laporan
 * masih memegang tiketnya, dan langsung salah begitu tiket diserahkan lagi
 * (laporan shift B akan menampilkan kerja shift C dan menyembunyikan kerja B).
 *
 * Pemotongan pakai INDEX, bukan perbandingan waktu: bila dua activity punya
 * `waktu` identik, perbandingan waktu bisa ikut menyeret baris tetangga.
 * activities sudah terurut waktu ASC dari Prisma, jadi index = kronologis.
 *
 * CATATAN: hasilnya adalah segmen LOGIKA — marker PENUTUP milik shift ini
 * sengaja masih ikut karena itulah sinyal "diserahkan belum selesai" yang
 * dipakai resolveWaktuSelesaiForShiftReport. Pembuangannya untuk TAMPILAN
 * dilakukan terpisah oleh stripClosingMarker.
 */
export function resolveShiftReportSegment<T extends ReportTicketActivityLike>(
  activities: T[],
  p: { shift?: string | null; startWib: Date; endWib: Date; isNative: boolean }
): T[] {
  if (!p.shift || activities.length === 0) return activities;

  const own: number[] = [];
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    if (a.shiftKode === p.shift && a.waktu >= p.startWib && a.waktu < p.endWib) {
      own.push(i);
    }
  }

  let start: number;
  let end: number;

  if (own.length > 0) {
    start = p.isNative ? 0 : own[0];
    // Marker serah terima dari shift sebelumnya = garis pembuka segmen ini.
    if (!p.isNative && start > 0 && activities[start - 1].isTindakLanjutFlag) {
      start -= 1;
    }
    // Sesi berakhir pada marker MILIK shift ini; bila tidak ada, di jejak terakhir.
    end = own[own.length - 1];
    for (let i = start; i < activities.length; i++) {
      const a = activities[i];
      if (a.isTindakLanjutFlag && a.shiftKode === p.shift) {
        end = i;
        break;
      }
    }
  } else {
    // Tanpa jejak sama sekali: pertahankan perilaku lama.
    if (p.isNative) {
      const firstMarker = activities.findIndex((a) => a.isTindakLanjutFlag);
      start = 0;
      end = firstMarker === -1 ? activities.length - 1 : firstMarker;
    } else {
      let lastMarker = -1;
      for (let i = 0; i < activities.length; i++) {
        if (activities[i].isTindakLanjutFlag) lastMarker = i;
      }
      start = lastMarker === -1 ? 0 : lastMarker;
      end = activities.length - 1;
    }
  }
  return activities.slice(start, end + 1);
}

/**
 * Waktu selesai yang berlaku UNTUK LAPORAN SHIFT INI (point-in-time).
 * Segmen yang ditutup marker MILIK shift ini berarti tiket diserahkan dalam
 * keadaan belum selesai -> laporan shift itu harus tetap menampilkannya
 * sebagai proses, berapa pun status tiket sekarang.
 *
 * Kepemilikan marker WAJIB dicek: segmen carry-over selalu DIAWALI marker, dan
 * marker itu milik shift SEBELUMNYA (garis masuk, bukan garis keluar) — kalau
 * tidak dibedakan, tiket yang baru diterima lalu langsung diselesaikan tanpa
 * menulis kegiatan keliru dianggap "diserahkan belum selesai".
 *
 * `segment` HARUS hasil resolveShiftReportSegment (masih memuat marker
 * penutup), bukan t.activities mentah maupun hasil stripClosingMarker.
 */
export function resolveWaktuSelesaiForShiftReport<
  T extends ReportTicketActivityLike
>(
  waktuSelesai: Date | null,
  segment: T[],
  p: { shift?: string | null; isNative: boolean }
): Date | null {
  if (!waktuSelesai) return null;
  const akhir = segment[segment.length - 1];
  if (akhir?.isTindakLanjutFlag && (!p.shift || akhir.shiftKode === p.shift)) {
    return null;
  }
  const masuk = segment[0];
  if (!p.isNative && masuk && waktuSelesai < masuk.waktu) return null;
  return waktuSelesai;
}

/**
 * Buang marker PENUTUP milik shift ini dari segmen — khusus TAMPILAN.
 *
 * Konvensi lembar manual Form OPS-001: shift yang MENYERAHKAN tidak pernah
 * menulis baris "Tindak lanjut monitoring selanjutnya" di akhir kegiatannya.
 * Marker hanya muncul sebagai baris PEMBUKA di lembar shift PENERIMA; yang
 * menandakan "diserahkan" adalah kolom N/Q, bukan baris kegiatan.
 *
 * Hasilnya boleh kosong (tiket dibuka lalu langsung diserahkan tanpa kegiatan);
 * lib/excelReport.ts sudah menangani activities kosong dengan "-".
 */
export function stripClosingMarker<T extends ReportTicketActivityLike>(
  segment: T[],
  shift?: string | null
): T[] {
  const akhir = segment[segment.length - 1];
  if (akhir?.isTindakLanjutFlag && (!shift || akhir.shiftKode === shift)) {
    return segment.slice(0, -1);
  }
  return segment;
}
