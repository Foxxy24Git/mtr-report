import Link from "next/link";
import { requireSession } from "@/lib/session";
import {
  getSlaDrilldownTickets,
  parseSlaBasis,
  parseSlaFilters,
  type SlaBasis,
  type SlaDrilldownMode,
} from "@/lib/slaMonitoring";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime } from "@/lib/format";
import { menitToHHMM } from "@/lib/sla";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Sama persis dengan slaTone() di components/monitoring-sla/MonitoringSlaClient.tsx
// — dipertahankan konsisten di kedua tempat (dashboard & drill-down ini),
// diduplikasi (bukan di-share) karena satu server component, satu client.
function slaTone(frac: number): string {
  const p = frac * 100;
  if (p > 99) return "text-green-600";
  if (p >= 95) return "text-amber-600";
  return "text-red-600";
}

const VALID_MODES: SlaDrilldownMode[] = [
  "sla-terendah",
  "paling-bermasalah",
  "jenis",
  "sumber",
];

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function BackLink() {
  return (
    <Link
      href="/monitoring-sla"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      <ChevronLeft className="h-4 w-4" />
      Kembali ke Monitoring SLA
    </Link>
  );
}

// Toggle Internal/Eksternal khusus halaman ini — link biasa (bukan
// onClick/router.push) karena halaman ini server component. Klik = navigasi
// ulang ke URL yang sama dengan query param `basis` diganti, param lain
// (dari/sampai/kategori/mode/atmId/nilai/label) tetap dipertahankan.
// Styling disamakan dgn PresetButton di MonitoringSlaClient.tsx.
function BasisToggle({ sp, basis }: { sp: URLSearchParams; basis: SlaBasis }) {
  const hrefFor = (b: SlaBasis) => {
    const next = new URLSearchParams(sp);
    next.set("basis", b);
    return `/monitoring-sla/tiket?${next.toString()}`;
  };
  const cls = (active: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs transition-colors ${
      active
        ? "border-primary bg-primary text-white"
        : "border-gray-300 bg-white text-gray-600 hover:border-primary/50 hover:text-primary"
    }`;
  return (
    <div className="flex items-center gap-1">
      <Link href={hrefFor("internal")} className={cls(basis === "internal")}>
        SLA Internal
      </Link>
      <Link href={hrefFor("eksternal")} className={cls(basis === "eksternal")}>
        SLA Eksternal
      </Link>
    </div>
  );
}

export default async function SlaDrilldownPage({ searchParams }: Props) {
  await requireSession(); // Akses semua role (user, supervisi, superadmin).

  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") sp.set(key, value);
  }

  const parsedFilter = parseSlaFilters(sp);
  const modeRaw = sp.get("mode") ?? "";
  const mode = VALID_MODES.includes(modeRaw as SlaDrilldownMode)
    ? (modeRaw as SlaDrilldownMode)
    : null;
  const atmId = sp.get("atmId") ?? undefined;
  const nilai = sp.get("nilai") ?? undefined;
  const label = sp.get("label") || "Daftar Tiket";
  // Basis (Internal/Eksternal) sekarang berlaku di SEMUA mode, bukan cuma
  // "sla-terendah" — lihat toggle BasisToggle di bawah.
  const parsedBasis = parseSlaBasis(sp);

  const error = !parsedFilter.ok
    ? parsedFilter.error
    : !mode
      ? "Parameter mode tidak valid atau tidak ada."
      : (mode === "sla-terendah" || mode === "paling-bermasalah") && !atmId
        ? "Parameter atmId wajib untuk mode ini."
        : (mode === "jenis" || mode === "sumber") && !nilai
          ? "Parameter nilai wajib untuk mode ini."
          : !parsedBasis.ok
            ? parsedBasis.error
            : null;

  if (error || !parsedFilter.ok || !mode) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Parameter tidak valid."}
        </div>
      </div>
    );
  }

  const basis: SlaBasis = parsedBasis.ok ? parsedBasis.basis : "internal";

  const items = await getSlaDrilldownTickets({
    ...parsedFilter.filter,
    mode,
    atmId,
    basis,
    nilai,
  });

  const kategoriLabel =
    parsedFilter.filter.kategori === "atm"
      ? "ATM"
      : parsedFilter.filter.kategori === "jaringan"
        ? "Jaringan"
        : "Semua Kategori";

  return (
    <div>
      <BackLink />

      <div className="mb-6 mt-3 space-y-2">
        <h1 className="page-title">{label}</h1>
        <p className="page-subtitle">
          {parsedFilter.filter.dari} s.d. {parsedFilter.filter.sampai} ·{" "}
          {kategoriLabel} · {items.length.toLocaleString("id-ID")} tiket ·
          (basis: {basis === "eksternal" ? "Eksternal" : "Internal"})
        </p>
        <BasisToggle sp={sp} basis={basis} />
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <Th>No Tiket</Th>
            <Th>Kode ATM</Th>
            <Th>Kategori</Th>
            <Th>Status</Th>
            <Th>Waktu Open</Th>
            <Th>Waktu Selesai</Th>
            <Th className="text-right">Durasi</Th>
            <Th className="text-right">SLA%</Th>
            <Th>Jenis Gangguan</Th>
            <Th>Sumber Penyebab</Th>
            <Th>No Tiket Vendor</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <Td colSpan={11} className="py-8 text-center text-gray-400">
                Tidak ada tiket yang cocok — data mungkin berubah sejak
                halaman SLA terakhir dimuat, coba muat ulang Monitoring SLA.
              </Td>
            </TableRow>
          ) : (
            items.map((t) => (
              <TableRow key={t.id} className="relative cursor-pointer hover:bg-gray-50">
                <Td className="relative font-mono font-semibold text-gray-900">
                  <Link
                    href={`/weekly-monitoring/${t.id}`}
                    className="absolute inset-0"
                    aria-label={`Lihat detail tiket ${t.noTiket}`}
                  />
                  {t.noTiket}
                </Td>
                <Td className="text-gray-600">{t.kodeAtm}</Td>
                <Td>
                  <Badge variant={t.kategori === "atm" ? "info" : "neutral"}>
                    {t.kategori === "atm" ? "ATM" : "Jaringan"}
                  </Badge>
                </Td>
                <Td>
                  <Badge variant={t.status === "selesai" ? "success" : "warning"}>
                    {t.status === "selesai" ? "Selesai" : "Dalam Proses"}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-gray-600">
                  {fmtDateTime(t.waktuOpen)}
                </Td>
                <Td className="whitespace-nowrap text-gray-600">
                  {t.waktuSelesai ? fmtDateTime(t.waktuSelesai) : "-"}
                </Td>
                <Td className="whitespace-nowrap text-right font-mono text-xs text-gray-600">
                  {t.status !== "selesai"
                    ? "Masih berjalan"
                    : t.durasiMenit !== null
                      ? menitToHHMM(t.durasiMenit)
                      : "Tidak ada laporan vendor"}
                </Td>
                <Td
                  className={`text-right font-semibold ${
                    t.slaPersen !== null ? slaTone(t.slaPersen) : "text-gray-400"
                  }`}
                >
                  {t.slaPersenLabel}
                </Td>
                <Td className="text-gray-600">{t.jenisGangguan ?? "-"}</Td>
                <Td className="text-gray-600">{t.sumberPenyebab ?? "-"}</Td>
                <Td className="text-gray-600">{t.noTiketVendor ?? "-"}</Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
