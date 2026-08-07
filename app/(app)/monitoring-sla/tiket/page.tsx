import Link from "next/link";
import { requireSession } from "@/lib/session";
import {
  getSlaDrilldownTickets,
  parseSlaBasis,
  parseSlaFilters,
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
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

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
  const parsedBasis = mode === "sla-terendah" ? parseSlaBasis(sp) : null;

  const error = !parsedFilter.ok
    ? parsedFilter.error
    : !mode
      ? "Parameter mode tidak valid atau tidak ada."
      : (mode === "sla-terendah" || mode === "paling-bermasalah") && !atmId
        ? "Parameter atmId wajib untuk mode ini."
        : (mode === "jenis" || mode === "sumber") && !nilai
          ? "Parameter nilai wajib untuk mode ini."
          : parsedBasis && !parsedBasis.ok
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

  const basis = parsedBasis && parsedBasis.ok ? parsedBasis.basis : undefined;

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

      <div className="mb-6 mt-3">
        <h1 className="page-title">{label}</h1>
        <p className="page-subtitle">
          {parsedFilter.filter.dari} s.d. {parsedFilter.filter.sampai} ·{" "}
          {kategoriLabel} · {items.length.toLocaleString("id-ID")} tiket
          {mode === "sla-terendah" && (
            <> · (basis: {basis === "eksternal" ? "Eksternal" : "Internal"})</>
          )}
        </p>
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
            <Th>Jenis Gangguan</Th>
            <Th>Sumber Penyebab</Th>
            <Th>No Tiket Vendor</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <Td colSpan={9} className="py-8 text-center text-gray-400">
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
