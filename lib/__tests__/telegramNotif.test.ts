import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  bolehKirimNotif,
  buildReminderMessage,
  sendReportReminder,
  sendPendingReminders,
  type PendingReportNotif,
} from "../telegramNotif";

const TOKEN = "123456:ABC-TEST-TOKEN";

const baseReport: PendingReportNotif = {
  shiftLabel: "Shift Pagi (07:00–15:00)",
  tanggal: new Date("2026-06-08T01:00:00Z"),
  ownerUser: { nama: "Budi" },
  supervisi: { nama: "Tio Rahmayunda", telegramChatId: "555" },
};

describe("bolehKirimNotif (jadwal WIB Senin–Jumat 07:00–18:00)", () => {
  it("true di hari kerja dalam jam kerja WIB (Senin 08:00)", () => {
    expect(bolehKirimNotif(new Date("2026-06-08T01:00:00Z"))).toBe(true);
  });

  it("true tepat di batas akhir (Jumat 17:00 WIB)", () => {
    expect(bolehKirimNotif(new Date("2026-06-12T10:00:00Z"))).toBe(true);
  });

  it("false tepat di jam 18:00 WIB (Jumat)", () => {
    expect(bolehKirimNotif(new Date("2026-06-12T11:00:00Z"))).toBe(false);
  });

  it("false sebelum jam 07:00 WIB (Selasa 06:00)", () => {
    expect(bolehKirimNotif(new Date("2026-06-08T23:00:00Z"))).toBe(false);
  });

  it("false di akhir pekan (Sabtu 10:00 WIB)", () => {
    expect(bolehKirimNotif(new Date("2026-06-13T03:00:00Z"))).toBe(false);
  });

  it("memakai jam dinding WIB, bukan UTC (Minggu 22:00 UTC = Senin 05:00 WIB → false)", () => {
    expect(bolehKirimNotif(new Date("2026-06-07T22:00:00Z"))).toBe(false);
  });
});

describe("buildReminderMessage", () => {
  it("memuat label shift, nama supervisi, dan nama petugas", () => {
    const msg = buildReminderMessage(baseReport);
    expect(msg).toContain("Shift Pagi (07:00–15:00)");
    expect(msg).toContain("Tio Rahmayunda");
    expect(msg).toContain("Budi");
    expect(msg).toContain("menunggu persetujuan");
  });
});

describe("sendReportReminder", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("mengirim ke telegramChatId supervisi dengan pesan reminder", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const ok = await sendReportReminder(baseReport);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe("555");
    expect(body.text).toContain("Shift Pagi (07:00–15:00)");
  });

  it("tidak mengirim bila supervisi tanpa telegramChatId", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const ok = await sendReportReminder({
      ...baseReport,
      supervisi: { nama: "Tanpa Chat", telegramChatId: null },
    });

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendPendingReminders", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("mengirim ke setiap laporan ber-chatId saat dalam jadwal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const reports: PendingReportNotif[] = [
      baseReport,
      { ...baseReport, supervisi: { nama: "X", telegramChatId: "777" } },
      { ...baseReport, supervisi: { nama: "Y", telegramChatId: null } }, // dilewati
    ];

    const sent = await sendPendingReminders(
      reports,
      new Date("2026-06-08T01:00:00Z")
    );

    expect(sent).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tidak mengirim apa pun di luar jadwal (akhir pekan)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendPendingReminders(
      [baseReport],
      new Date("2026-06-13T03:00:00Z")
    );

    expect(sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
