"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, FileText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { fmtDate } from "@/lib/format";
import { SHIFT_NAMES } from "@/lib/constants";
import type { ShiftReportListItem } from "@/lib/shiftReportQueries";

interface Props {
  initialItems: ShiftReportListItem[];
}

const SELECT_CLS =
  "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export function ShiftReportListClient({ initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ShiftReportListItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(`/api/shift-reports?${qs.toString()}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [status, from, to]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(load, 150);
    return () => clearTimeout(handle);
  }, [load]);

  // "Menunggu" dihitung dari sudut pandang viewer: kalau viewer punya PERAN
  // (utama/selanjutnya/keduanya) di laporan itu, dihitung dari peran-nya —
  // bukan sekadar status laporan yang belum lengkap. Viewer tanpa peran
  // (superadmin, peran null) tidak terikat ke satu sisi approval, jadi
  // dihitung dari kelengkapan laporan itu sendiri (label !== "Sudah Diapprove")
  // supaya counter konsisten dengan badge status per baris yang sama-sama
  // terlihat di layar.
  const pendingCount = items.filter((r) =>
    r.peran === "selanjutnya"
      ? !r.supervisiNextApprovedAt
      : r.peran === "keduanya"
        ? !r.approvedAt || !r.supervisiNextApprovedAt
        : r.peran === null
          ? r.label !== "Sudah Diapprove"
          : !r.approvedAt
  ).length;

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={SELECT_CLS}
          aria-label="Filter status laporan shift"
        >
          <option value="">Semua Status</option>
          <option value="pending">Menunggu Approval</option>
          <option value="approved">Sudah Diapprove</option>
        </select>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className={SELECT_CLS}
            aria-label="Tanggal dari"
          />
          <span>—</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={SELECT_CLS}
            aria-label="Tanggal sampai"
          />
        </div>

        {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        <span className="text-xs text-gray-500 ml-auto">
          {pendingCount} menunggu approval · {items.length} laporan
        </span>
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <Th>Tanggal</Th>
            <Th>Shift</Th>
            <Th>Petugas (Owner)</Th>
            <Th>Penerima</Th>
            <Th>Peran</Th>
            <Th>Jml Tiket</Th>
            <Th>Status</Th>
            <Th>Aksi</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <Td colSpan={8} className="text-center text-gray-400 py-8">
                Tidak ada laporan shift sesuai filter.
              </Td>
            </TableRow>
          ) : (
            items.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-surface-subtle/60 transition-colors"
                onClick={() => router.push(`/supervisi/${r.id}`)}
              >
                <Td className="whitespace-nowrap">{fmtDate(r.tanggal)}</Td>
                <Td className="whitespace-nowrap text-sm">
                  {SHIFT_NAMES[r.shiftKode] ?? `Shift ${r.shiftKode}`}
                </Td>
                <Td className="whitespace-nowrap">{r.ownerNama}</Td>
                <Td className="whitespace-nowrap text-gray-600">
                  {r.receiverNama ?? "—"}
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {r.peran === "keduanya" ? (
                    <Badge variant="primary">Utama + Selanjutnya</Badge>
                  ) : r.peran === "selanjutnya" ? (
                    <Badge variant="info">Supervisi Selanjutnya</Badge>
                  ) : r.peran === "utama" ? (
                    <Badge variant="neutral">Supervisi</Badge>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                  {r.jmlTiketLanjutan > 0 && (
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {r.jmlTiketLanjutan} tiket lanjutan
                    </div>
                  )}
                </Td>
                <Td className="text-center font-medium">{r.jmlTiket}</Td>
                <Td>
                  {r.label === "Sudah Diapprove" ? (
                    <Badge variant="success">
                      <ShieldCheck className="w-3 h-3 mr-0.5" /> {r.label}
                    </Badge>
                  ) : r.label === "Menunggu Approval" ? (
                    <Badge variant="warning">{r.label}</Badge>
                  ) : (
                    <Badge variant="info">{r.label}</Badge>
                  )}
                </Td>
                <Td>
                  <Button
                    size="sm"
                    variant={r.label === "Sudah Diapprove" ? "secondary" : "primary"}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/supervisi/${r.id}`);
                    }}
                  >
                    <FileText className="w-4 h-4" />
                    Lihat &amp; Approve
                  </Button>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
