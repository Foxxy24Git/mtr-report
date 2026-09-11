import {
  createElement,
  type MouseEvent,
  type ReactElement,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  TicketActivityItem,
  WeeklyTicketItem,
} from "@/lib/ticketQueries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
}));

import {
  toggleExpandedTicketId,
  WeeklyActivityPanel,
  WeeklyActivityToggle,
  WeeklyMonitoringClient,
} from "../WeeklyMonitoringClient";

describe("accordion kegiatan Weekly Monitoring", () => {
  it("membuka tiket yang dipilih dan menutupnya saat tombol yang sama diklik lagi", () => {
    expect(toggleExpandedTicketId(null, "ticket-1")).toBe("ticket-1");
    expect(toggleExpandedTicketId("ticket-1", "ticket-1")).toBeNull();
    expect(toggleExpandedTicketId("ticket-1", "ticket-2")).toBe("ticket-2");
  });

  it("menampilkan kegiatan penanganan beserta petugasnya di dalam tabel", () => {
    const activities: TicketActivityItem[] = [
      {
        id: "activity-1",
        waktu: new Date("2026-09-12T03:30:00.000Z"),
        teks: "Koordinasi dengan teknisi vendor",
        isTindakLanjutFlag: false,
        isSupervisiEntry: false,
        shiftKode: "A",
        userId: "user-1",
        userNama: "Afrinaldi",
        editedAt: null,
        editedByNama: null,
        revisi: null,
      },
    ];

    const html = renderToStaticMarkup(
      createElement(WeeklyActivityPanel, { loading: false, activities })
    );

    expect(html).toContain("Kegiatan Penanganan Gangguan");
    expect(html).toContain("Koordinasi dengan teknisi vendor");
    expect(html).toContain("Afrinaldi");
  });

  it("tombol Lihat Gangguan tidak menjalankan navigasi pada baris", () => {
    let propagationStopped = false;
    let toggleCount = 0;
    const element = WeeklyActivityToggle({
      expanded: false,
      onToggle: () => {
        toggleCount += 1;
      },
    }) as ReactElement<{
      onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    }>;

    element.props.onClick({
      stopPropagation: () => {
        propagationStopped = true;
      },
    } as MouseEvent<HTMLButtonElement>);

    expect(propagationStopped).toBe(true);
    expect(toggleCount).toBe(1);
  });

  it("menampilkan tombol Lihat Gangguan pada setiap tiket Weekly Monitoring", () => {
    const ticket: WeeklyTicketItem = {
      id: "ticket-1",
      noTiket: "BN-001",
      kategori: "atm",
      waktuOpen: new Date("2026-09-12T03:00:00.000Z"),
      waktuSelesai: null,
      status: "proses",
      statusSupervisi: "pending",
      shiftKode: "A",
      kodeAtm: "01BAS1",
      namaAtm: "ATM Cabang Payakumbuh",
      ownerNama: "Afrinaldi",
      vendor: "Hyosung",
      noTiketVendor: "CM26108516",
      supervisiStatus: "pending",
      supervisiNama: null,
    };

    const html = renderToStaticMarkup(
      createElement(WeeklyMonitoringClient, {
        initialItems: [ticket],
        initialTotal: 1,
        initialFrom: "2026-09-06",
        initialTo: "2026-09-12",
        shifts: ["A"],
        picUsers: [],
        atmOptions: [],
        vendorOptions: ["Hyosung"],
      })
    );

    expect(html).toContain("Lihat Gangguan");
  });
});
