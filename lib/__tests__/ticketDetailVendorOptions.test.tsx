import { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getTicketDetail: vi.fn(),
  lookupFindMany: vi.fn(),
  vendorFindMany: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/ticketQueries", () => ({
  getTicketDetail: mocks.getTicketDetail,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    masterLookup: { findMany: mocks.lookupFindMany },
    vendorMaster: { findMany: mocks.vendorFindMany },
  },
}));

import DailyTicketDetailPage from "@/app/(app)/daily-monitoring/[id]/page";
import WeeklyTicketDetailPage from "@/app/(app)/weekly-monitoring/[id]/page";

type PageResult = ReactElement<{ opsi: { vendor: string[] } }>;

describe("opsi Vendor Master pada halaman detail tiket", () => {
  beforeEach(() => {
    mocks.requireSession.mockResolvedValue({
      role: "user",
      sub: "user-1",
      shift: "1",
    });
    mocks.getTicketDetail.mockResolvedValue({ id: "ticket-1" });
    mocks.lookupFindMany.mockResolvedValue([]);
    mocks.vendorFindMany.mockResolvedValue([
      { nama: "Artajasa" },
      { nama: "Bringin" },
    ]);
  });

  it.each([
    ["Daily Monitoring", DailyTicketDetailPage],
    ["Weekly Monitoring", WeeklyTicketDetailPage],
  ])("meneruskan vendor master di halaman %s", async (_name, renderPage) => {
    const result = (await renderPage({
      params: Promise.resolve({ id: "ticket-1" }),
    })) as PageResult;

    expect(result.props.opsi.vendor).toEqual(["Artajasa", "Bringin"]);
  });
});
