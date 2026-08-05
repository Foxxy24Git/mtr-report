import "server-only";
import { ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SHIFT_LABELS } from "@/lib/constants";
import { SHIFT_RESUME_MAX_AGE_MS } from "@/lib/shift";
import { SERVERS } from "@/lib/suhuServer";
import {
  buildReportTicketWhere,
  isNativeToShiftReport,
  resolveReportDateWindow,
  resolveShiftReportSegment,
  resolveWaktuSelesaiForShiftReport,
  stripClosingMarker,
} from "@/lib/reportQuery";
import { resolveSender, resolveAcknowledger, resolveLeaderName } from "@/lib/reportSignatures";
import { resolveShiftReportSignatures } from "@/lib/shiftReport";
import { shiftPakaiSupervisiNext } from "@/lib/shiftReportApproval";
import { resolveReportLogoPath } from "@/lib/appSettings";
import type {
  ReportData,
  ReportTicket,
  ReportAcCheck,
  ReportServer,
  ReportSignatures,
} from "@/lib/excelReport";

const TZ = "Asia/Jakarta";
const SHIFTS = Object.values(ShiftKode) as string[];

export interface GatherParams {
  tanggal: string; // YYYY-MM-DD (WIB)
  shift?: string | null;
  ownerUserId?: string | null;
  /** Opt-in: ikut sertakan tiket warisan tindak lanjut shift sebelumnya (Download Harian). */
  includeCarryOver?: boolean;
  /** Opt-in: jendela satu SESI shift, bukan satu hari kalender (Download Harian). */
  useShiftSessionWindow?: boolean;
}

export interface GatherResult {
  data: ReportData;
  filename: string;
  count: number;
}

function fmtTimeWIB(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
}

function fmtHariTgl(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
}

function fmtTglLabel(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
}

function uniqueJoin(values: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  for (const v of values) {
    const s = (v ?? "").trim();
    if (s) seen.add(s);
  }
  return [...seen].join(" / ");
}

/** Gabung data laporan untuk satu tanggal (+ shift / owner opsional). */
export async function gatherReportData(p: GatherParams): Promise<GatherResult> {
  // URUTAN PENTING: `shift` dihitung DULU karena jendela waktunya bergantung
  // pada shift — shift malam (C/E) melewati tengah malam, jadi satu sesi kerja
  // BUKAN satu hari kalender.
  const shift = p.shift && SHIFTS.includes(p.shift) ? (p.shift as ShiftKode) : null;
  const { startWib, endWib } = resolveReportDateWindow(
    p.tanggal,
    shift,
    Boolean(p.useShiftSessionWindow)
  );

  // `tanggalDate` sengaja tetap dari p.tanggal MENTAH (kolom AcTempLog.tanggal
  // / ServerLog.tanggal bertipe @db.Date, bukan instant) — lihat blok Suhu AC
  // & Log Server di bawah. `jumlahHari` tidak berkaitan dengan jendela.
  const [y, m, d] = p.tanggal.split("-").map(Number);
  const jumlahHari = new Date(y, m, 0).getDate();
  const tanggalDate = new Date(Date.UTC(y, m - 1, d));

  // ----------------------- Tiket -----------------------
  const ticketRows = await prisma.ticket.findMany({
    // Filter shift via openShiftKode (shift asal, immutable) — bukan shiftKode
    // current yang dimutasi saat serah terima. Lihat lib/reportQuery.ts.
    where: buildReportTicketWhere({
      startWib,
      endWib,
      shift,
      ownerUserId: p.ownerUserId,
      includeCarryOver: p.includeCarryOver,
    }),
    orderBy: { waktuOpen: "asc" },
    include: {
      atm: { select: { kodeAtm: true, namaAtm: true } },
      owner: { select: { nama: true, ttdUrl: true } },
      approver: { select: { nama: true, ttdUrl: true } },
      pimpinanInfra: { select: { nama: true, tipe: true, namaPjs: true } },
      pimpinanDivisi: { select: { nama: true, tipe: true, namaPjs: true } },
      activities: { orderBy: { waktu: "asc" }, include: { user: { select: { nama: true } } } },
    },
  });

  // View point-in-time per tiket: waktuSelesai HARUS mencerminkan kondisi
  // tiket SAAT SHIFT INI BERAKHIR, bukan status terkini di database — kalau
  // tidak, laporan shift lama berubah retroaktif setiap tiket warisannya
  // akhirnya diselesaikan shift lain. Dihitung sebelum partisi karena partisi
  // "selesai dulu, lalu proses" di bawah wajib ikut nilai point-in-time ini
  // (kalau tidak, urutan barisnya tidak sinkron dengan isi kolom S).
  const rowViews = ticketRows.map((t) => {
    const isNative = isNativeToShiftReport(t, { shift, startWib, endWib });
    // 1. Segmen untuk LOGIKA — marker penutup milik shift ini masih ikut.
    const segment = resolveShiftReportSegment(t.activities, {
      shift,
      startWib,
      endWib,
      isNative,
    });
    // 2. Status point-in-time dihitung dari segmen LENGKAP: marker penutup
    //    itulah sinyal "diserahkan belum selesai".
    const waktuSelesai = resolveWaktuSelesaiForShiftReport(
      // Pertahankan guard status: tiket yang di-reopen superadmin bisa
      // berstatus proses walau kolom waktuSelesai lamanya masih terisi.
      t.status === "selesai" ? t.waktuSelesai : null,
      segment,
      { shift, isNative }
    );
    // 3. Baru dipangkas untuk TAMPILAN (konvensi lembar manual: shift yang
    //    menyerahkan tidak menulis baris tindak lanjut di akhir kegiatannya).
    //    URUTAN 2 SEBELUM 3 WAJIB — dibalik, sinyal di atas ikut terbuang.
    const visibleActivities = stripClosingMarker(segment, shift);
    return { t, visibleActivities, waktuSelesai };
  });

  // Urutan baris laporan (PRD §4.D revisi): tiket SELESAI (point-in-time)
  // tampil lebih dulu, lalu tiket DALAM PROSES (yang diteruskan ke shift
  // berikutnya) di bawah. Query sudah orderBy waktuOpen asc, jadi partisi
  // stabil ini menjaga urutan waktu_open ASC di dalam masing-masing kelompok.
  const orderedRows = [
    ...rowViews.filter((v) => v.waktuSelesai !== null),
    ...rowViews.filter((v) => v.waktuSelesai === null),
  ];

  // Tiket ASLI shift ini (openShiftKode COCOK *DAN* waktuOpen di dalam rentang
  // hari laporan), tanpa warisan carry-over — dipakai khusus resolusi Penyerah
  // (C26) agar tidak salah ambil owner shift lain saat includeCarryOver
  // menambahkan tiket warisan ke ticketRows. Cek rentang hari wajib karena kode
  // shift A-E dipakai ulang tiap hari: tiket shift B kemarin yang dirotasi
  // kembali ke shift B hari ini bukan tiket asli laporan ini. ticketRows sudah
  // orderBy waktuOpen asc, jadi urutan tetap terjaga setelah filter.
  const nativeTicketRows = ticketRows.filter((t) =>
    isNativeToShiftReport(t, { shift, startWib, endWib })
  );

  const tickets: ReportTicket[] = orderedRows.map((v, i) => {
    const t = v.t;
    const cp =
      t.cpTipe === "wag"
        ? "WAG"
        : t.cpTipe === "pic"
          ? `${t.cpNama ?? "-"}${t.cpTelp ? ` (${t.cpTelp})` : ""}`
          : "-";
    const unit = t.atm ? `${t.atm.kodeAtm} – ${t.atm.namaAtm}` : "-";
    return {
      no: i + 1,
      waktuKejadian: t.waktuOpen,
      // Lembar manual hanya mencetak TANGGAL di kolom C bila kejadiannya BEDA
      // HARI dari tanggal laporan. Patokannya murni tanggal — bukan
      // native/carry-over (tiket warisan yang dibuka hari yang sama pun cukup
      // menampilkan jam saja).
      tampilkanTanggal: !(t.waktuOpen >= startWib && t.waktuOpen < endWib),
      unitKerja: unit,
      waktuRespon: t.waktuResponInternal ? fmtTimeWIB(t.waktuResponInternal) : "-",
      contactPerson: cp,
      jenisGangguan: t.jenisGangguan ?? "-",
      sumberPenyebab: t.sumberPenyebab ?? "-",
      metodePenanganan: t.metodePenanganan ?? "-",
      vendor: t.vendor ?? "-",
      activities: v.visibleActivities.map((a) => ({
        waktu: a.waktu,
        teks: a.teks,
        isTindakLanjut: a.isTindakLanjutFlag,
      })),
      noTiketVendor: t.noTiketVendor ?? "-",
      waktuSelesai: v.waktuSelesai,
      keterangan: t.keterangan ?? "-",
    };
  });

  // ----------------------- Suhu AC & Log Server -----------------------
  let acChecks: ReportAcCheck[] = [];
  let servers: ReportServer[] = SERVERS.map((s) => ({ label: s.label, awal: "-", akhir: "-" }));

  if (shift) {
    const [acRows, serverRows] = await Promise.all([
      prisma.acTempLog.findMany({
        where: { tanggal: tanggalDate, shiftKode: shift },
        orderBy: { urutan: "asc" },
      }),
      prisma.serverLog.findMany({ where: { tanggal: tanggalDate, shiftKode: shift } }),
    ]);

    acChecks = acRows.map((a) => ({
      urutan: a.urutan,
      waktu: a.waktuPantau,
      room: a.suhuRoomServer ?? "",
      panel: a.suhuPanel ?? "",
      kiri: a.statusAktifKiri,
      kanan: a.statusAktifKanan,
      p12kiri: a.pantau12jamKiri ?? "",
      p12kanan: a.pantau12jamKanan ?? "",
    }));

    const awal = serverRows.find((s) => s.fase === "awal");
    const akhir = serverRows.find((s) => s.fase === "akhir");
    servers = SERVERS.map((s) => ({
      label: s.label,
      awal: (awal?.[s.key] as string | null) ?? "-",
      akhir: (akhir?.[s.key] as string | null) ?? "-",
    }));
  }

  // ----------------------- Tanda tangan -----------------------
  const approver = ticketRows.find((t) => t.statusSupervisi === "approved" && t.approver);

  // Pimpinan & supervisi penanda tangan dipilih saat serah terima shift
  // (PRD revisi §2): ambil handover terbaru shift ini pada tanggal laporan.
  const handover = shift
    ? await prisma.shiftHandover.findFirst({
        where: { fromShift: shift, at: { gte: startWib, lt: endWib } },
        orderBy: { at: "desc" },
        include: {
          pimpinanInfra: { select: { nama: true, tipe: true, namaPjs: true } },
          pimpinanDivisi: { select: { nama: true, tipe: true, namaPjs: true } },
          supervisi: { select: { nama: true, ttdUrl: true } },
          supervisiNext: { select: { nama: true, ttdUrl: true } },
          fromUser: { select: { nama: true, ttdUrl: true } },
          toUser: { select: { nama: true, ttdUrl: true } },
        },
      })
    : null;

  // PART 4: blok tanda tangan bersumber dari ShiftReport bila ada (paradigma
  // approval baru). Ambil laporan shift untuk (shift, hari, owner?) terbaru.
  const shiftReport = shift
    ? await prisma.shiftReport.findFirst({
        where: {
          shiftKode: shift,
          // Toleransi keterlambatan tutup shift (pola sama dgn matchShiftsForDate
          // di lib/reportShiftLookup.ts): ShiftReport.tanggal diisi new Date()
          // wall-clock saat DITUTUP, bukan jam nominal endWib. Shift yg ditutup
          // telat (mis. jam 07:20 utk shift C) jatuh di luar endWib ketat —
          // pakai jendela sama lebar dgn pemulihan sesi shift (16 jam).
          tanggal: {
            gte: startWib,
            lt: new Date(startWib.getTime() + SHIFT_RESUME_MAX_AGE_MS),
          },
          ...(p.ownerUserId ? { ownerUserId: p.ownerUserId } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          ownerUser: { select: { nama: true, ttdUrl: true } },
          receiverUser: { select: { nama: true, ttdUrl: true } },
          supervisi: { select: { nama: true, ttdUrl: true } },
          supervisiNext: { select: { nama: true, ttdUrl: true } },
          pimpinanInfra: { select: { nama: true, tipe: true, namaPjs: true } },
          pimpinanDivisi: { select: { nama: true, tipe: true, namaPjs: true } },
        },
      })
    : null;

  // Supervisi sudah approve jika ada tiket approved pada laporan (PRD revisi §4).
  const supervisiApproved = Boolean(approver);

  // Penyerah (C26): owner tiket PERTAMA shift (owner awal) — TTD selalu ikut
  // walau laporan diunduh sebelum serah terima. Fallback: fromUser handover →
  // gabungan nama owner. Pakai nativeTicketRows (bukan ticketRows gabungan)
  // agar carry-over dari shift lain tidak salah menggeser owner awal.
  const sender = resolveSender(
    nativeTicketRows[0]?.owner,
    handover?.fromUser,
    uniqueJoin(nativeTicketRows.map((t) => t.owner.nama))
  );

  let signatures: ReportSignatures;
  if (shiftReport) {
    // Paradigma baru (PART 4): seluruh blok tanda tangan dari ShiftReport.
    // Penyerah jatuh ke owner-pertama-tiket bila owner laporan tak bernama.
    const s = resolveShiftReportSignatures(shiftReport);
    signatures = {
      penyerah: s.penyerah || sender.nama,
      penyerahTtdPath: s.penyerah ? s.penyerahTtdPath : sender.ttdPath,
      penerima: s.penerima,
      penerimaTtdPath: s.penerimaTtdPath,
      supervisi: s.supervisi,
      supervisiApproved: s.supervisiApproved,
      supervisiTtdPath: s.supervisiTtdPath,
      showSupervisiNext: s.showSupervisiNext,
      supervisiNext: s.supervisiNext,
      supervisiNextApproved: s.supervisiNextApproved,
      supervisiNextTtdPath: s.supervisiNextTtdPath,
      pimpinanInfra: s.pimpinanInfra,
      pimpinanDivisi: s.pimpinanDivisi,
    };
  } else {
    // Fallback (data lama tanpa ShiftReport): logika handover/tiket lama.
    signatures = {
      penyerah: sender.nama,
      penyerahTtdPath: sender.ttdPath,
      // Penerima: petugas yang dipilih saat serah terima (to_user / receiver).
      penerima: handover?.toUser?.nama ?? "",
      penerimaTtdPath: handover?.toUser?.ttdUrl ?? null,
      supervisi:
        handover?.supervisi?.nama ||
        uniqueJoin(
          ticketRows
            .filter((t) => t.statusSupervisi === "approved")
            .map((t) => t.approver?.nama ?? null)
        ),
      supervisiApproved,
      // TTD supervisi hanya relevan setelah approve (excel meng-gate via flag).
      supervisiTtdPath: supervisiApproved
        ? handover?.supervisi?.ttdUrl ?? approver?.approver?.ttdUrl ?? null
        : null,
      // Data lama tanpa ShiftReport: nama dari handover, TTD selalu null —
      // tanpa record approval tidak ada dasar untuk menempelkan tanda tangan.
      showSupervisiNext: shift ? shiftPakaiSupervisiNext(shift) : false,
      supervisiNext: handover?.supervisiNext?.nama ?? "",
      supervisiNextApproved: false,
      supervisiNextTtdPath: null,
      // O26/R26: pimpinan pilihan handover → fallback pimpinan tingkat tiket.
      // Tanpa default — kosong sampai dipilih saat serah terima (PART 4).
      // Nama yang dicetak mengikuti tipe: PJS → nama_pjs (PART 5).
      pimpinanInfra: resolveAcknowledger(
        resolveLeaderName(handover?.pimpinanInfra),
        uniqueJoin(ticketRows.map((t) => resolveLeaderName(t.pimpinanInfra) || null))
      ),
      pimpinanDivisi: resolveAcknowledger(
        resolveLeaderName(handover?.pimpinanDivisi),
        uniqueJoin(ticketRows.map((t) => resolveLeaderName(t.pimpinanDivisi) || null))
      ),
    };
  }

  // ----------------------- Meta & nama file -----------------------
  const namaPetugas = signatures.penyerah || "-";
  const shiftLabel = shift ? SHIFT_LABELS[shift] ?? `Shift ${shift}` : "Semua Shift";

  const data: ReportData = {
    // Lembar manual Form OPS-001: baris "Hari / Tgl" di header memakai tanggal
    // MULAI sesi, sedangkan baris "Padang, ..." di blok tanda tangan memakai
    // tanggal SELESAI sesi. Untuk shift yang tidak melewati tengah malam
    // keduanya sama, jadi polanya baru terlihat pada shift C/E.
    hariTgl: fmtHariTgl(startWib),
    // endWib adalah batas EKSKLUSIF (awal slot berikutnya), jadi dikurangi 1ms
    // dulu. Rumus ini seragam untuk kedua mode: pada jalur hari-kalender-penuh
    // endWib jatuh TEPAT tengah malam sehingga memformatnya langsung akan
    // meleset ke hari berikutnya, sedangkan endWib-1ms tetap di hari yang
    // benar (identik dengan rumus lama fmtTglLabel(startWib)).
    tanggalLabel: fmtTglLabel(new Date(endWib.getTime() - 1)),
    namaPetugas,
    shiftLabel,
    jumlahHari,
    tickets,
    acChecks,
    servers,
    signatures,
    logoPath: (await resolveReportLogoPath()) ?? undefined,
  };

  const ownerSlug = p.ownerUserId ? `-user-${(namaPetugas || "user").replace(/\s+/g, "_")}` : "";
  const shiftSlug = shift ? `-Shift${shift}` : "";
  const filename = `Laporan-Harian-${p.tanggal}${shiftSlug}${ownerSlug}.xlsx`;

  return { data, filename, count: tickets.length };
}
