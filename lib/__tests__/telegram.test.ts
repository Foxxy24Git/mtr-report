import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendTelegramMessage } from "../telegram";

const TOKEN = "123456:ABC-TEST-TOKEN";

describe("sendTelegramMessage", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("menolak bila token belum diset (tanpa memanggil fetch)", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendTelegramMessage("999", "halo");

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("token/chatId kosong");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("menolak bila chatId kosong (tanpa memanggil fetch)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendTelegramMessage("", "halo");

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("token/chatId kosong");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("memanggil Telegram sendMessage dengan parse_mode HTML dan mengembalikan ok dari respons", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { message_id: 7 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendTelegramMessage("999", "pesan uji");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      chat_id: "999",
      text: "pesan uji",
      parse_mode: "HTML",
    });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true, result: { message_id: 7 } });
  });

  it("meneruskan ok:false dari Telegram (mis. chat_id salah)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, description: "chat not found" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendTelegramMessage("999", "pesan");

    expect(res.ok).toBe(false);
    expect(res.data).toEqual({ ok: false, description: "chat not found" });
  });

  it("menangkap error jaringan dan mengembalikan alasannya", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendTelegramMessage("999", "pesan");

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("network down");
  });
});
