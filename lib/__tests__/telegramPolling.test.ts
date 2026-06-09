import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isChatIdCommand,
  buildChatIdReply,
  fetchTelegramUpdates,
  processTelegramUpdates,
} from "../telegramPolling";

const TOKEN = "123456:ABC-TEST-TOKEN";

describe("isChatIdCommand", () => {
  it("mengenali /start dan /id (termasuk @bot, spasi, dan huruf besar)", () => {
    expect(isChatIdCommand("/start")).toBe(true);
    expect(isChatIdCommand("/id")).toBe(true);
    expect(isChatIdCommand("  /id  ")).toBe(true);
    expect(isChatIdCommand("/id@mtrReportBot")).toBe(true);
    expect(isChatIdCommand("/START")).toBe(true);
  });

  it("mengabaikan teks lain", () => {
    expect(isChatIdCommand("halo")).toBe(false);
    expect(isChatIdCommand("/identitas")).toBe(false);
    expect(isChatIdCommand("")).toBe(false);
    expect(isChatIdCommand(undefined)).toBe(false);
    expect(isChatIdCommand(null)).toBe(false);
  });
});

describe("buildChatIdReply", () => {
  it("menyertakan chat id dalam <code> dan instruksi ke Super Admin", () => {
    const msg = buildChatIdReply(12345);
    expect(msg).toContain("<code>12345</code>");
    expect(msg).toContain("Super Admin");
  });
});

describe("fetchTelegramUpdates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("memanggil getUpdates dengan offset dan mengembalikan result array", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: [{ update_id: 1 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchTelegramUpdates(TOKEN, 7);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(`/bot${TOKEN}/getUpdates`);
    expect(fetchMock.mock.calls[0][0]).toContain("offset=7");
    expect(r).toEqual([{ update_id: 1 }]);
  });

  it("mengembalikan [] saat jaringan error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await fetchTelegramUpdates(TOKEN, 0)).toEqual([]);
  });

  it("mengembalikan [] saat result bukan array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ ok: false }) })
    );
    expect(await fetchTelegramUpdates(TOKEN, 0)).toEqual([]);
  });
});

describe("processTelegramUpdates", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("membalas /id dengan chat_id dan memajukan offset (update_id + 1)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const next = await processTelegramUpdates(
      [{ update_id: 10, message: { chat: { id: 555 }, text: "/id" } }],
      0
    );

    expect(next).toBe(11);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe(555);
    expect(body.text).toContain("<code>555</code>");
  });

  it("mengabaikan teks non-perintah tetapi tetap memajukan offset", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const next = await processTelegramUpdates(
      [{ update_id: 20, message: { chat: { id: 9 }, text: "halo bot" } }],
      0
    );

    expect(next).toBe(21);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("memproses beberapa update dan memakai update_id tertinggi + 1", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const next = await processTelegramUpdates(
      [
        { update_id: 30, message: { chat: { id: 1 }, text: "/start" } },
        { update_id: 32, message: { chat: { id: 2 }, text: "lain" } },
        { update_id: 31, message: { chat: { id: 3 }, text: "/id" } },
      ],
      0
    );

    expect(next).toBe(33);
    expect(fetchMock).toHaveBeenCalledTimes(2); // hanya /start + /id
  });

  it("tidak mengubah offset bila tidak ada update", async () => {
    const next = await processTelegramUpdates([], 42);
    expect(next).toBe(42);
  });
});
