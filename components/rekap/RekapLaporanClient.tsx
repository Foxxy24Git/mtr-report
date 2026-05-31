"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  CalendarDays,
  User as UserIcon,
  FileSpreadsheet,
  FileArchive,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { SHIFT_LABELS } from "@/lib/constants";
import { ALL_SHIFTS } from "@/lib/shift";

interface UserOpt {
  id: string;
  nama: string;
}

interface Props {
  today: string; // YYYY-MM-DD (WIB)
  isSuperadmin: boolean;
  currentUser: UserOpt;
  users: UserOpt[];
}

/** Picu unduhan file dari endpoint; tangani error JSON (400/401) dengan rapi. */
async function downloadFile(
  url: string,
  fallbackName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? `Gagal mengunduh (${res.status}).` };
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(cd);
  const name = match?.[1] ?? fallbackName;

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
  return { ok: true };
}

export function RekapLaporanClient({ today, isSuperadmin, currentUser, users }: Props) {
  // --- Download Harian ---
  const [tglHarian, setTglHarian] = useState(today);
  const [shiftHarian, setShiftHarian] = useState("");
  const [loadingHarian, setLoadingHarian] = useState(false);
  const [errHarian, setErrHarian] = useState("");

  async function unduhHarian() {
    setErrHarian("");
    if (!shiftHarian) {
      setErrHarian("Pilih shift terlebih dahulu.");
      return;
    }
    setLoadingHarian(true);
    const res = await downloadFile(
      `/api/rekap?mode=harian&tanggal=${tglHarian}&shift=${shiftHarian}`,
      `Laporan-Harian-${tglHarian}-Shift${shiftHarian}.xlsx`
    );
    if (!res.ok) setErrHarian(res.error);
    setLoadingHarian(false);
  }

  // --- Download per User ---
  const [tglUser, setTglUser] = useState(today);
  const [ownerId, setOwnerId] = useState(isSuperadmin ? "" : currentUser.id);
  const [shiftUser, setShiftUser] = useState(""); // "" = semua shift
  const [loadingUser, setLoadingUser] = useState(false);
  const [errUser, setErrUser] = useState("");

  async function unduhUser() {
    setErrUser("");
    const owner = isSuperadmin ? ownerId : currentUser.id;
    if (!owner) {
      setErrUser("Pilih user terlebih dahulu.");
      return;
    }
    setLoadingUser(true);
    const params = new URLSearchParams({ mode: "user", tanggal: tglUser, owner });
    if (shiftUser) params.set("shift", shiftUser);
    const res = await downloadFile(
      `/api/rekap?${params.toString()}`,
      `Laporan-${tglUser}.xlsx`
    );
    if (!res.ok) setErrUser(res.error);
    setLoadingUser(false);
  }

  // --- Download Weekly (ZIP) ---
  const sevenDaysAgo = (() => {
    const d = new Date(`${today}T00:00:00+07:00`);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  })();
  const [tglDari, setTglDari] = useState(sevenDaysAgo);
  const [tglSampai, setTglSampai] = useState(today);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [errWeekly, setErrWeekly] = useState("");

  async function unduhWeekly() {
    setErrWeekly("");
    if (!tglDari || !tglSampai) {
      setErrWeekly("Pilih rentang tanggal terlebih dahulu.");
      return;
    }
    if (tglDari > tglSampai) {
      setErrWeekly("Tanggal 'dari' tidak boleh setelah tanggal 'sampai'.");
      return;
    }
    setLoadingWeekly(true);
    const res = await downloadFile(
      `/api/rekap/weekly?dari=${tglDari}&sampai=${tglSampai}`,
      `LAPORAN_WEEKLY_${tglDari}_${tglSampai}.zip`
    );
    if (!res.ok) setErrWeekly(res.error);
    setLoadingWeekly(false);
  }

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Download Harian */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card padding="lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" /> Download Harian
            </CardTitle>
          </CardHeader>
          <p className="text-sm text-gray-500 mb-4">
            Laporan satu shift pada tanggal tertentu (Form OPS-001) lengkap dengan
            blok suhu AC, log server, dan tanda tangan.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Tanggal"
              type="date"
              value={tglHarian}
              onChange={(e) => setTglHarian(e.target.value)}
            />
            <Select
              label="Shift"
              required
              value={shiftHarian}
              onChange={(e) => setShiftHarian(e.target.value)}
            >
              <option value="">— Pilih shift —</option>
              {ALL_SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {SHIFT_LABELS[s] ?? `Shift ${s}`}
                </option>
              ))}
            </Select>
          </div>
          {errHarian && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errHarian}
            </p>
          )}
          <div className="flex justify-end mt-4">
            <Button onClick={unduhHarian} loading={loadingHarian}>
              {!loadingHarian && <Download className="w-4 h-4" />} Download Excel
            </Button>
          </div>
        </Card>
      </motion.div>

      {/* Download per User */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card padding="lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-primary" /> Download per User
            </CardTitle>
          </CardHeader>
          <p className="text-sm text-gray-500 mb-4">
            Hanya tiket yang di-open oleh petugas terkait pada tanggal tersebut.
            Shift opsional (kosongkan untuk semua shift).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Tanggal"
              type="date"
              value={tglUser}
              onChange={(e) => setTglUser(e.target.value)}
            />
            <Select
              label="Petugas"
              value={isSuperadmin ? ownerId : currentUser.id}
              disabled={!isSuperadmin}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              {isSuperadmin && <option value="">— Pilih petugas —</option>}
              {isSuperadmin ? (
                users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nama}
                  </option>
                ))
              ) : (
                <option value={currentUser.id}>{currentUser.nama}</option>
              )}
            </Select>
            <Select
              label="Shift (opsional)"
              value={shiftUser}
              onChange={(e) => setShiftUser(e.target.value)}
            >
              <option value="">Semua shift</option>
              {ALL_SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {SHIFT_LABELS[s] ?? `Shift ${s}`}
                </option>
              ))}
            </Select>
          </div>
          {errUser && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errUser}
            </p>
          )}
          <div className="flex justify-end mt-4">
            <Button onClick={unduhUser} loading={loadingUser} variant="outline">
              {!loadingUser && <FileSpreadsheet className="w-4 h-4" />} Download Excel
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>

      {/* Download Weekly (ZIP) */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card padding="lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="w-4 h-4 text-primary" /> Download Weekly (ZIP)
            </CardTitle>
          </CardHeader>
          <p className="text-sm text-gray-500 mb-4">
            Unduh banyak laporan sekaligus dalam satu file ZIP — satu Excel
            (Form OPS-001) per kombinasi <strong>tanggal × user × shift</strong>{" "}
            yang memiliki tiket pada rentang yang dipilih. File dikelompokkan per
            tanggal di dalam ZIP. Proses bisa memakan waktu untuk rentang panjang.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Dari Tanggal"
              type="date"
              value={tglDari}
              max={tglSampai}
              onChange={(e) => setTglDari(e.target.value)}
            />
            <Input
              label="Sampai Tanggal"
              type="date"
              value={tglSampai}
              min={tglDari}
              onChange={(e) => setTglSampai(e.target.value)}
            />
          </div>
          {errWeekly && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errWeekly}
            </p>
          )}
          {loadingWeekly && (
            <p className="mt-3 text-sm text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
              Sedang menyusun laporan & mengemas ZIP… mohon tunggu, jangan tutup
              halaman ini.
            </p>
          )}
          <div className="flex justify-end mt-4">
            <Button onClick={unduhWeekly} loading={loadingWeekly}>
              {!loadingWeekly && <FileArchive className="w-4 h-4" />} Download Weekly Report (ZIP)
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
