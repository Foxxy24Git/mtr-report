import { describe, it, expect } from "vitest";
import { activityMatchWindow } from "../shiftReportWindow";

// `lib/shiftReportQueries.ts` punya `import "server-only"` dan seluruh fungsi
// lainnya query Prisma langsung — tidak ada pola test-dengan-DB untuk file
// ini di repo. `activityMatchWindow` dipindah ke modul murni terpisah
// (lib/shiftReportWindow.ts, pola yang sama dengan lib/shiftReportApproval.ts)
// justru supaya bisa diuji di sini tanpa Prisma maupun "server-only".
describe("activityMatchWindow", () => {
  it("menghasilkan start = T - 30 menit, end = T + 30 menit", () => {
    const T = new Date("2026-08-05T02:00:00Z");
    const { start, end } = activityMatchWindow(T);
    const toleransiMs = 30 * 60 * 1000;
    expect(start.getTime()).toBe(T.getTime() - toleransiMs);
    expect(end.getTime()).toBe(T.getTime() + toleransiMs);
  });
});
