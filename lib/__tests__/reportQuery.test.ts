import { describe, it, expect } from "vitest";
import {
  buildReportTicketWhere,
  isNativeToShiftReport,
  resolveReportDateWindow,
  resolveShiftReportSegment,
  resolveWaktuSelesaiForShiftReport,
  stripClosingMarker,
} from "../reportQuery";

describe("resolveReportDateWindow", () => {
  it("useShiftSession=false, tanpa shift -> hari kalender penuh (perilaku lama)", () => {
    expect(resolveReportDateWindow("2026-08-03", null, false)).toEqual({
      startWib: new Date("2026-08-03T00:00:00+07:00"),
      endWib: new Date("2026-08-04T00:00:00+07:00"),
    });
  });

  it("REGRESI Weekly ZIP: useShiftSession=false + shift 'C' -> TETAP hari kalender penuh", () => {
    // Test paling penting: flag mati harus MENANG walau shift malam diisi.
    // Download Weekly ZIP & mode=user tidak mengirim useShiftSessionWindow,
    // jadi jendelanya wajib persis sama seperti sebelum perbaikan ini.
    expect(resolveReportDateWindow("2026-08-03", "C", false)).toEqual({
      startWib: new Date("2026-08-03T00:00:00+07:00"),
      endWib: new Date("2026-08-04T00:00:00+07:00"),
    });
  });

  it("useShiftSession=true tanpa shift -> hari kalender penuh (fallback aman)", () => {
    expect(resolveReportDateWindow("2026-08-03", null, true)).toEqual({
      startWib: new Date("2026-08-03T00:00:00+07:00"),
      endWib: new Date("2026-08-04T00:00:00+07:00"),
    });
  });

  it("shift A (07:00-15:00, tidak lewat tengah malam) -> jendela di hari yang sama", () => {
    expect(resolveReportDateWindow("2026-08-03", "A", true)).toEqual({
      startWib: new Date("2026-08-03T07:00:00+07:00"),
      endWib: new Date("2026-08-03T15:00:00+07:00"),
    });
  });

  it("shift B (15:00-23:00) -> jendela di hari yang sama, berakhir sebelum tengah malam", () => {
    expect(resolveReportDateWindow("2026-08-03", "B", true)).toEqual({
      startWib: new Date("2026-08-03T15:00:00+07:00"),
      endWib: new Date("2026-08-03T23:00:00+07:00"),
    });
  });

  it("shift D (07:00-19:00, lembur pagi) -> jendela di hari yang sama", () => {
    expect(resolveReportDateWindow("2026-08-03", "D", true)).toEqual({
      startWib: new Date("2026-08-03T07:00:00+07:00"),
      endWib: new Date("2026-08-03T19:00:00+07:00"),
    });
  });

  it("REGRESI UTAMA: shift C (23:00-07:00) -> SATU sesi melewati tengah malam", () => {
    // Bug: satu sesi shift C terpecah jadi dua laporan karena jendelanya
    // dipatok hari kalender. Kegiatan jam 00:00-07:00 masih sesi yang SAMA.
    expect(resolveReportDateWindow("2026-08-03", "C", true)).toEqual({
      startWib: new Date("2026-08-03T23:00:00+07:00"),
      endWib: new Date("2026-08-04T07:00:00+07:00"),
    });
  });

  it("shift E (19:00-07:00, lembur malam) -> pola sama, melewati tengah malam", () => {
    expect(resolveReportDateWindow("2026-08-03", "E", true)).toEqual({
      startWib: new Date("2026-08-03T19:00:00+07:00"),
      endWib: new Date("2026-08-04T07:00:00+07:00"),
    });
  });

  it("lintas bulan: shift C pada 31 Juli -> endWib jatuh di 1 Agustus", () => {
    expect(resolveReportDateWindow("2026-07-31", "C", true)).toEqual({
      startWib: new Date("2026-07-31T23:00:00+07:00"),
      endWib: new Date("2026-08-01T07:00:00+07:00"),
    });
  });

  it("lintas tahun: shift E pada 31 Desember -> endWib jatuh di 1 Januari tahun berikutnya", () => {
    expect(resolveReportDateWindow("2026-12-31", "E", true)).toEqual({
      startWib: new Date("2026-12-31T19:00:00+07:00"),
      endWib: new Date("2027-01-01T07:00:00+07:00"),
    });
  });

  it("sesi shift malam berurutan tidak tumpang tindih (endWib eksklusif)", () => {
    // Sesi 03-08 berakhir tepat saat sesi berikutnya belum mulai; sesi 04-08
    // mulai 04-08 23:00. Tidak ada instant yang masuk ke DUA jendela sekaligus.
    const sesi1 = resolveReportDateWindow("2026-08-03", "C", true);
    const sesi2 = resolveReportDateWindow("2026-08-04", "C", true);
    expect(sesi1.endWib.getTime()).toBeLessThanOrEqual(sesi2.startWib.getTime());
  });

  it("tanggalLabel: endWib-1ms = tanggal SELESAI sesi, dan identik dgn perilaku lama pada mode hari penuh", () => {
    // Membuktikan rumus fmtTglLabel(endWib - 1ms) di lib/reportData.ts aman
    // dipakai seragam untuk KEDUA mode, tanpa if/else.
    const tglWIB = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(d);

    const hariPenuh = resolveReportDateWindow("2026-08-03", "C", false);
    // Mode lama: hasil rumus baru HARUS sama dengan rumus lama fmtTglLabel(startWib).
    expect(tglWIB(new Date(hariPenuh.endWib.getTime() - 1))).toBe("2026-08-03");
    expect(tglWIB(hariPenuh.startWib)).toBe("2026-08-03");
    // Memformat endWib mentah pada mode lama JUSTRU meleset ke hari berikutnya.
    expect(tglWIB(hariPenuh.endWib)).toBe("2026-08-04");

    // Mode sesi shift malam: tanggal selesai sesi = 04 Agustus (lembar manual).
    const sesiC = resolveReportDateWindow("2026-08-03", "C", true);
    expect(tglWIB(sesiC.startWib)).toBe("2026-08-03"); // header "Hari / Tgl"
    expect(tglWIB(new Date(sesiC.endWib.getTime() - 1))).toBe("2026-08-04"); // "Padang, ..."

    // Shift siang: mulai == selesai, pola tetap konsisten.
    const sesiA = resolveReportDateWindow("2026-08-03", "A", true);
    expect(tglWIB(new Date(sesiA.endWib.getTime() - 1))).toBe("2026-08-03");
  });
});

describe("buildReportTicketWhere", () => {
  const startWib = new Date("2026-06-01T00:00:00+07:00");
  const endWib = new Date("2026-06-02T00:00:00+07:00");

  it("memfilter shift via openShiftKode (shift asal), bukan shiftKode current", () => {
    // Inti FIX: laporan shift A harus tetap memuat tiket yang di-open pada
    // shift A walau current shiftKode tiket sudah berubah (mis. B) setelah
    // serah terima. openShiftKode bersifat immutable → kriteria yang benar.
    const where = buildReportTicketWhere({ startWib, endWib, shift: "A" });
    expect(where.openShiftKode).toBe("A");
    expect(where).not.toHaveProperty("shiftKode");
  });

  it("selalu membatasi rentang tanggal via waktuOpen", () => {
    const where = buildReportTicketWhere({ startWib, endWib });
    expect(where.waktuOpen).toEqual({ gte: startWib, lt: endWib });
  });

  it("tanpa shift → tidak memfilter shift sama sekali", () => {
    const where = buildReportTicketWhere({ startWib, endWib });
    expect(where).not.toHaveProperty("openShiftKode");
    expect(where).not.toHaveProperty("shiftKode");
  });

  it("memfilter owner hanya bila ownerUserId diberikan", () => {
    expect(
      buildReportTicketWhere({ startWib, endWib, shift: "A", ownerUserId: "u1" })
        .ownerUserId
    ).toBe("u1");
    expect(
      buildReportTicketWhere({ startWib, endWib, shift: "A" })
    ).not.toHaveProperty("ownerUserId");
  });

  it("includeCarryOver tanpa shift tidak mengubah apa pun (perilaku lama)", () => {
    const where = buildReportTicketWhere({ startWib, endWib, includeCarryOver: true });
    expect(where).not.toHaveProperty("OR");
    expect(where).not.toHaveProperty("openShiftKode");
    expect(where).not.toHaveProperty("shiftKode");
    expect(where.waktuOpen).toEqual({ gte: startWib, lt: endWib });
  });

  describe("includeCarryOver: true (Download Harian — warisan tindak lanjut)", () => {
    it("menghasilkan where.OR dengan 4 klausa: tiket asli shift + warisan tindak lanjut (proses) + warisan diselesaikan shift ini + jejak aktivitas shift ini", () => {
      const where = buildReportTicketWhere({
        startWib,
        endWib,
        shift: "A",
        includeCarryOver: true,
      });
      expect(where).not.toHaveProperty("openShiftKode");
      expect(where).not.toHaveProperty("waktuOpen");
      expect(Array.isArray(where.OR)).toBe(true);
      const or = where.OR as Record<string, unknown>[];
      expect(or).toHaveLength(4);

      // Klausa pertama: tiket asli shift ini (perilaku lama), dengan rentang waktuOpen.
      expect(or[0]).toEqual({
        waktuOpen: { gte: startWib, lt: endWib },
        openShiftKode: "A",
      });

      // Klausa kedua: warisan tindak lanjut MASIH PROSES, dengan batas waktu
      // pada marker isTindakLanjutFlag (REGRESI BN-SM23WBU0 — tanpa batas ini,
      // tiket apa pun yang PERNAH punya marker di riwayatnya bisa lolos hanya
      // karena shiftKode current-nya kebetulan sama dengan shift laporan).
      expect(or[1]).toEqual({
        shiftKode: "A",
        status: "proses",
        activities: {
          some: { isTindakLanjutFlag: true, waktu: { gte: startWib, lt: endWib } },
        },
      });

      // Klausa ketiga: warisan tindak lanjut yang DISELESAIKAN shift ini pada
      // hari laporan (batas waktuSelesai WAJIB ada, shiftKode dipakai ulang
      // tiap hari).
      expect(or[2]).toEqual({
        shiftKode: "A",
        status: "selesai",
        waktuSelesai: { gte: startWib, lt: endWib },
        activities: { some: { isTindakLanjutFlag: true } },
      });

      // Klausa keempat: jejak permanen di ticket_activities — tiket yang
      // pernah dikerjakan/ditutup shift ini pada hari laporan. Klausa 2 & 3
      // memakai shiftKode current yang dimutasi tiap serah terima, jadi tanpa
      // klausa ini tiket HILANG begitu shift ini menyerahkannya lagi.
      // Batas `waktu` pada rentang hari WAJIB ada (kode shift dipakai ulang).
      expect(or[3]).toEqual({
        activities: {
          some: { shiftKode: "A", waktu: { gte: startWib, lt: endWib } },
        },
      });
    });

    it("menyertakan ownerUserId di keempat klausa OR bila diberikan", () => {
      const where = buildReportTicketWhere({
        startWib,
        endWib,
        shift: "A",
        ownerUserId: "u1",
        includeCarryOver: true,
      });
      const or = where.OR as Record<string, unknown>[];
      expect(or).toHaveLength(4);
      expect(or[0]).toMatchObject({ ownerUserId: "u1" });
      expect(or[1]).toMatchObject({ ownerUserId: "u1" });
      expect(or[2]).toMatchObject({ ownerUserId: "u1" });
      expect(or[3]).toMatchObject({ ownerUserId: "u1" });
    });

    it("REGRESI BN-SM23WBU0: klausa kedua membatasi marker isTindakLanjutFlag ke rentang waktu laporan", () => {
      // Kejadian nyata: tiket BN-SM23WBU0 (ATM MUARO PEITI) dibuka 2026-08-04
      // 07:29 WIB dengan open_shift_kode A, tapi shift_kode CURRENT-nya
      // kebetulan B. Query laporan 2026-08-03 shift B meloloskannya lewat
      // klausa kedua (lama, tanpa batas waktu) walau tiket itu belum ada pada
      // 2026-08-03. Fix: marker isTindakLanjutFlag WAJIB berada di dalam
      // rentang [startWib, endWib) laporan.
      const where = buildReportTicketWhere({
        startWib,
        endWib,
        shift: "B",
        includeCarryOver: true,
      });
      const or = where.OR as Record<string, unknown>[];
      expect(or[1]).toEqual({
        shiftKode: "B",
        status: "proses",
        activities: {
          some: { isTindakLanjutFlag: true, waktu: { gte: startWib, lt: endWib } },
        },
      });
    });
  });
});

describe("isNativeToShiftReport", () => {
  const startWib = new Date("2026-08-04T00:00:00+07:00");
  const endWib = new Date("2026-08-05T00:00:00+07:00");
  const range = { startWib, endWib };

  it("openShiftKode cocok + waktuOpen di dalam hari laporan → tiket asli", () => {
    const t = { openShiftKode: "B" as const, waktuOpen: new Date("2026-08-04T16:00:00+07:00") };
    expect(isNativeToShiftReport(t, { ...range, shift: "B" })).toBe(true);
  });

  it("openShiftKode beda (A) walau waktuOpen di hari laporan → bukan tiket asli", () => {
    const t = { openShiftKode: "A" as const, waktuOpen: new Date("2026-08-04T16:00:00+07:00") };
    expect(isNativeToShiftReport(t, { ...range, shift: "B" })).toBe(false);
  });

  it("REGRESI BN-T8OU128J: openShiftKode B tapi di-open HARI SEBELUMNYA → bukan tiket asli", () => {
    // Kode shift A-E dipakai ulang tiap hari. Tiket ini di-open 03-08 17:24 pada
    // shift B, lalu dirotasi B→C→A→B sehingga shiftKode current kembali ke B dan
    // ikut terjaring klausa OR carry-over pada laporan 04-08 shift B. Tanpa cek
    // rentang hari, `openShiftKode === shift` keliru menandainya tiket asli →
    // log kegiatan tidak dipangkas & owner-nya salah dipakai sebagai Penyerah.
    const t = { openShiftKode: "B" as const, waktuOpen: new Date("2026-08-03T17:24:00+07:00") };
    expect(isNativeToShiftReport(t, { ...range, shift: "B" })).toBe(false);
  });

  it("tanpa shift (laporan lintas shift) → semua tiket dianggap asli", () => {
    const dalam = { openShiftKode: "A" as const, waktuOpen: new Date("2026-08-04T16:00:00+07:00") };
    const luar = { openShiftKode: "C" as const, waktuOpen: new Date("2026-08-03T17:24:00+07:00") };
    expect(isNativeToShiftReport(dalam, { ...range, shift: null })).toBe(true);
    expect(isNativeToShiftReport(luar, { ...range, shift: null })).toBe(true);
    expect(isNativeToShiftReport(luar, { ...range, shift: undefined })).toBe(true);
    expect(isNativeToShiftReport(luar, range)).toBe(true);
  });

  it("batas rentang: waktuOpen == startWib → true, waktuOpen == endWib → false ([gte, lt))", () => {
    const awal = { openShiftKode: "B" as const, waktuOpen: new Date(startWib) };
    const akhir = { openShiftKode: "B" as const, waktuOpen: new Date(endWib) };
    expect(isNativeToShiftReport(awal, { ...range, shift: "B" })).toBe(true);
    expect(isNativeToShiftReport(akhir, { ...range, shift: "B" })).toBe(false);
  });
});

describe("resolveShiftReportSegment", () => {
  const startWib = new Date("2026-08-04T00:00:00+07:00");
  const endWib = new Date("2026-08-05T00:00:00+07:00");
  const range = { startWib, endWib };
  const t = (h: number, m: number) =>
    new Date(`2026-08-04T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`);
  const a = (h: number, m: number, isTindakLanjutFlag: boolean, shiftKode: string) => ({
    waktu: t(h, m),
    isTindakLanjutFlag,
    shiftKode,
  });

  // Satu tiket berpindah 3 tangan pada 04-08-2026:
  //   09:15 mtr5 (shift A) buka + tulis kegiatan
  //   15:34 serah terima A->B (marker ditulis shift A)
  //   16:10 mtr2 (shift B) tulis kegiatan
  //   23:11 serah terima B->C (marker ditulis shift B)
  //   23:40 mtr3 (shift C) tulis kegiatan
  const tigaTangan = [
    a(9, 15, false, "A"),
    a(15, 34, true, "A"),
    a(16, 10, false, "B"),
    a(23, 11, true, "B"),
    a(23, 40, false, "C"),
  ];

  it("3 tangan — shift A (asli): segmen [09:15 .. marker 15:34 miliknya]", () => {
    expect(
      resolveShiftReportSegment(tigaTangan, { ...range, shift: "A", isNative: true })
    ).toEqual([tigaTangan[0], tigaTangan[1]]);
  });

  it("REGRESI UTAMA — shift B tetap dapat segmennya SETELAH menyerahkan ke shift C", () => {
    // Bug lama: pemotongan memakai "ambil dari marker TERAKHIR", yang hanya
    // benar selama shift B masih memegang tiket. Begitu B menyerahkan ke C,
    // laporan B justru menampilkan kegiatan C (23:40) dan menyembunyikan
    // kerja B sendiri (16:10). Segmen B = marker masuk 15:34 (milik A, garis
    // pembuka) .. marker keluar 23:11 (milik B, garis penutup).
    expect(
      resolveShiftReportSegment(tigaTangan, { ...range, shift: "B", isNative: false })
    ).toEqual([tigaTangan[1], tigaTangan[2], tigaTangan[3]]);
  });

  it("3 tangan — shift C (pemegang saat ini): segmen [marker 23:11 .. 23:40]", () => {
    expect(
      resolveShiftReportSegment(tigaTangan, { ...range, shift: "C", isNative: false })
    ).toEqual([tigaTangan[3], tigaTangan[4]]);
  });

  it("REGRESI BN-SM23WBU0: tiket asli shift A -> 15:55 milik shift B TIDAK ikut", () => {
    // Tiket di-open mtr5 (shift A) 14:29, diserahkan ke shift B lewat marker
    // 15:34, lalu mtr2 menulis 15:55. Segmen shift A hanya boleh memuat
    // miliknya sendiri; marker 15:34 tetap ikut sebagai batas penutup LOGIKA
    // (dibuang untuk tampilan oleh stripClosingMarker).
    const activities = [
      a(14, 29, false, "A"),
      a(15, 34, true, "A"),
      a(15, 55, false, "B"),
    ];
    expect(
      resolveShiftReportSegment(activities, { ...range, shift: "A", isNative: true })
    ).toEqual([activities[0], activities[1]]);
  });

  it("simetri: array sama -> asli dapat segmen awal, carry-over dapat segmen akhir, marker batas ada di KEDUANYA", () => {
    const activities = [
      a(14, 29, false, "A"),
      a(15, 34, true, "A"), // garis batas
      a(15, 55, false, "B"),
    ];
    const asli = resolveShiftReportSegment(activities, {
      ...range,
      shift: "A",
      isNative: true,
    });
    const carry = resolveShiftReportSegment(activities, {
      ...range,
      shift: "B",
      isNative: false,
    });
    expect(asli).toEqual([activities[0], activities[1]]);
    expect(carry).toEqual([activities[1], activities[2]]);
    expect(asli[asli.length - 1]).toEqual(carry[0]);
    expect(asli.length + carry.length - 1).toBe(activities.length);
  });

  it("tanpa marker sama sekali (tiket tuntas di shift yang sama) -> segmen utuh", () => {
    const activities = [a(17, 10, false, "A"), a(17, 15, false, "A")];
    expect(
      resolveShiftReportSegment(activities, { ...range, shift: "A", isNative: true })
    ).toEqual(activities);
  });

  it("jejak shift ini di HARI LAIN tidak dihitung (kode shift A-E dipakai ulang)", () => {
    // Tiket dibuka shift B pada 03-08 dan diserahkan hari itu juga, lalu
    // dirotasi B→C→A→B sehingga kembali ke shift B pada 04-08. Tanpa batas
    // rentang hari pada pencarian jejak, segmen laporan 04-08 shift B akan
    // mengunci ke jejak KEMARIN (idx 0-1) dan kerja hari ini hilang.
    const kemarinKerja = {
      waktu: new Date("2026-08-03T20:00:00+07:00"),
      isTindakLanjutFlag: false,
      shiftKode: "B",
    };
    const kemarinMarker = {
      waktu: new Date("2026-08-03T23:00:00+07:00"),
      isTindakLanjutFlag: true,
      shiftKode: "B",
    };
    const activities = [
      kemarinKerja,
      kemarinMarker,
      a(2, 0, false, "C"),
      a(7, 0, true, "C"), // C -> A
      a(10, 0, false, "A"),
      a(15, 0, true, "A"), // A -> B (marker masuk milik shift A)
      a(16, 10, false, "B"), // kerja shift B hari ini
    ];
    expect(
      resolveShiftReportSegment(activities, { ...range, shift: "B", isNative: false })
    ).toEqual([activities[5], activities[6]]);
  });

  it("dua kegiatan berwaktu identik -> pemotongan pakai INDEX, tidak menyeret tetangga", () => {
    const activities = [
      a(15, 34, true, "A"), // marker masuk
      a(16, 10, false, "B"),
      a(16, 10, true, "B"), // marker keluar, waktu identik
      a(16, 10, false, "C"), // kerja shift C, waktu identik juga
    ];
    expect(
      resolveShiftReportSegment(activities, { ...range, shift: "B", isNative: false })
    ).toEqual([activities[0], activities[1], activities[2]]);
  });

  describe("fallback: shift ini tidak punya jejak aktivitas sama sekali", () => {
    it("asli tanpa jejak -> segmen pertama (s/d marker pertama)", () => {
      const activities = [a(8, 0, false, "A"), a(9, 0, true, "A"), a(10, 0, false, "B")];
      // Seolah-olah shift laporan tidak menulis apa pun (mis. data lama).
      expect(
        resolveShiftReportSegment(activities, { ...range, shift: "Z", isNative: true })
      ).toEqual([activities[0], activities[1]]);
    });

    it("carry-over baru diterima & belum ditulisi -> segmen mulai marker TERAKHIR", () => {
      const activities = [a(8, 0, false, "A"), a(9, 0, true, "A")];
      expect(
        resolveShiftReportSegment(activities, { ...range, shift: "B", isNative: false })
      ).toEqual([activities[1]]);
    });

    it("carry-over tanpa marker sama sekali -> kembalikan semua (fallback defensif)", () => {
      const activities = [a(17, 10, false, "A"), a(17, 15, false, "A")];
      expect(
        resolveShiftReportSegment(activities, { ...range, shift: "B", isNative: false })
      ).toEqual(activities);
    });
  });

  it("tanpa shift (laporan lintas shift) -> kembalikan activities apa adanya", () => {
    expect(
      resolveShiftReportSegment(tigaTangan, { ...range, shift: null, isNative: true })
    ).toEqual(tigaTangan);
    expect(
      resolveShiftReportSegment(tigaTangan, { ...range, shift: undefined, isNative: true })
    ).toEqual(tigaTangan);
  });

  it("activities kosong -> tetap kosong", () => {
    expect(
      resolveShiftReportSegment([], { ...range, shift: "A", isNative: true })
    ).toEqual([]);
  });
});

describe("resolveWaktuSelesaiForShiftReport", () => {
  const t = (h: number, m: number) =>
    new Date(`2026-08-04T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`);
  const a = (h: number, m: number, isTindakLanjutFlag: boolean, shiftKode: string) => ({
    waktu: t(h, m),
    isTindakLanjutFlag,
    shiftKode,
  });

  it("waktuSelesai null -> null", () => {
    const segment = [a(9, 0, false, "A")];
    expect(
      resolveWaktuSelesaiForShiftReport(null, segment, { shift: "A", isNative: true })
    ).toBeNull();
  });

  it("REGRESI BN-HCQA1E62: segmen ditutup marker MILIK shift ini -> HARUS null walau tiket sudah selesai di DB", () => {
    // mtr5 (shift A) open & tulis kegiatan 09:00, shift berakhir -> marker
    // TINDAK LANJUT 15:34 (tiket belum selesai, diteruskan ke shift B). mtr2
    // (shift B) baru menyelesaikannya 16:20. Laporan Harian shift A milik
    // mtr5 TIDAK BOLEH ikut menampilkan penyelesaian itu -- kolom N/O/P/Q/R
    // harus kosong karena saat shift A berakhir tiket ini masih proses.
    const segment = [a(9, 0, false, "A"), a(15, 34, true, "A")];
    expect(
      resolveWaktuSelesaiForShiftReport(t(16, 20), segment, { shift: "A", isNative: true })
    ).toBeNull();
  });

  it("3 tangan (selesai 23:50 oleh shift C): A -> null, B -> null, C -> 23:50", () => {
    const segmenA = [a(9, 15, false, "A"), a(15, 34, true, "A")];
    const segmenB = [a(15, 34, true, "A"), a(16, 10, false, "B"), a(23, 11, true, "B")];
    const segmenC = [a(23, 11, true, "B"), a(23, 40, false, "C")];
    const selesai = t(23, 50);
    expect(
      resolveWaktuSelesaiForShiftReport(selesai, segmenA, { shift: "A", isNative: true })
    ).toBeNull();
    // Segmen B ditutup marker MILIKNYA (23:11) -> saat shift B berakhir tiket
    // masih proses, walau kini sudah selesai di DB.
    expect(
      resolveWaktuSelesaiForShiftReport(selesai, segmenB, { shift: "B", isNative: false })
    ).toBeNull();
    expect(
      resolveWaktuSelesaiForShiftReport(selesai, segmenC, { shift: "C", isNative: false })
    ).toEqual(selesai);
  });

  it("native tanpa marker (tuntas dalam shift yang sama) -> kembalikan waktuSelesai apa adanya", () => {
    const segment = [a(9, 0, false, "A"), a(9, 30, false, "A")];
    expect(
      resolveWaktuSelesaiForShiftReport(t(9, 30), segment, { shift: "A", isNative: true })
    ).toEqual(t(9, 30));
  });

  it("carry-over, diselesaikan shift ini -> kembalikan waktuSelesai apa adanya", () => {
    const segment = [a(15, 34, true, "A"), a(16, 20, false, "B")];
    expect(
      resolveWaktuSelesaiForShiftReport(t(16, 20), segment, { shift: "B", isNative: false })
    ).toEqual(t(16, 20));
  });

  it("carry-over baru diterima & langsung diselesaikan TANPA kegiatan baru (hanya marker MILIK SHIFT LAIN) -> HARUS kembalikan waktuSelesai, bukan null", () => {
    // Segmen carry-over SELALU diawali marker milik shift SEBELUMNYA (garis
    // MASUK). Tanpa cek kepemilikan marker, kondisi normal ini keliru dibaca
    // sebagai "diserahkan belum selesai".
    const segment = [a(15, 34, true, "A")];
    expect(
      resolveWaktuSelesaiForShiftReport(t(16, 20), segment, { shift: "B", isNative: false })
    ).toEqual(t(16, 20));
  });

  it("carry-over dengan waktuSelesai SEBELUM marker masuk -> null", () => {
    const segment = [a(15, 34, true, "A"), a(16, 20, false, "B")];
    expect(
      resolveWaktuSelesaiForShiftReport(t(15, 0), segment, { shift: "B", isNative: false })
    ).toBeNull();
  });

  it("tanpa shift (laporan lintas shift): marker penutup milik siapa pun -> null", () => {
    const segment = [a(9, 0, false, "A"), a(15, 34, true, "A")];
    expect(
      resolveWaktuSelesaiForShiftReport(t(16, 20), segment, { shift: null, isNative: true })
    ).toBeNull();
  });
});

describe("stripClosingMarker", () => {
  const t = (h: number, m: number) =>
    new Date(`2026-08-04T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`);
  const a = (h: number, m: number, isTindakLanjutFlag: boolean, shiftKode: string) => ({
    waktu: t(h, m),
    isTindakLanjutFlag,
    shiftKode,
  });

  const segmenA = [a(9, 15, false, "A"), a(15, 34, true, "A")];
  const segmenB = [a(15, 34, true, "A"), a(16, 10, false, "B"), a(23, 11, true, "B")];
  const segmenC = [a(23, 11, true, "B"), a(23, 40, false, "C")];

  it("shift penyerah: marker PENUTUP miliknya dibuang", () => {
    // Lembar manual: shift yang menyerahkan tidak menulis baris tindak lanjut
    // di akhir kegiatannya — penandanya kolom N/Q, bukan baris kegiatan.
    expect(stripClosingMarker(segmenA, "A")).toEqual([segmenA[0]]);
  });

  it("shift tengah: marker PEMBUKA (milik shift sebelumnya) dipertahankan, marker PENUTUP miliknya dibuang", () => {
    expect(stripClosingMarker(segmenB, "B")).toEqual([segmenB[0], segmenB[1]]);
  });

  it("shift pemegang saat ini (belum menyerahkan) -> tidak ada yang dibuang", () => {
    expect(stripClosingMarker(segmenC, "C")).toEqual(segmenC);
  });

  it("carry-over baru diterima & belum ditulisi -> marker PEMBUKA TIDAK dibuang", () => {
    const segment = [a(15, 34, true, "A")];
    expect(stripClosingMarker(segment, "B")).toEqual(segment);
  });

  it("tanpa marker sama sekali -> tidak mengubah apa pun", () => {
    const segment = [a(17, 10, false, "A"), a(17, 15, false, "A")];
    expect(stripClosingMarker(segment, "A")).toEqual(segment);
  });

  it("tanpa shift (laporan lintas shift) -> marker penutup milik siapa pun dibuang", () => {
    expect(stripClosingMarker(segmenA, null)).toEqual([segmenA[0]]);
    expect(stripClosingMarker(segmenA, undefined)).toEqual([segmenA[0]]);
  });

  it("segmen hanya berisi marker penutup miliknya -> boleh kosong (excelReport menangani dengan '-')", () => {
    const segment = [a(15, 34, true, "A")];
    expect(stripClosingMarker(segment, "A")).toEqual([]);
  });

  it("segmen kosong -> tetap kosong", () => {
    expect(stripClosingMarker([], "A")).toEqual([]);
  });
});
