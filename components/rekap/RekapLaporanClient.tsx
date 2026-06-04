"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  CalendarDays,
  User as UserIcon,
  FileSpreadsheet,
  FileArchive,
  FileText,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SHIFT_LABELS } from "@/lib/constants";
import { ALL_SHIFTS } from "@/lib/shift";

interface UserOpt {
  id: string;
  nama: string;
}

interface LeaderOpt {
  id: string;
  nama: string;
  kategori: "infrastruktur" | "divisi";
  tipe: "tetap" | "pjs";
  namaPjs: string | null;
}

/** Label dropdown pimpinan: nama + penanda PJS bila pejabat pengganti. */
function leaderLabel(l: LeaderOpt): string {
  return l.tipe === "pjs" ? `${l.nama} [PJS: ${l.namaPjs ?? "-"}]` : l.nama;
}

interface Props {
  today: string; // YYYY-MM-DD (WIB)
  isSuperadmin: boolean;
  currentUser: UserOpt;
  users: UserOpt[];
  supervisiUsers: UserOpt[];
  leaders: LeaderOpt[];
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

export function RekapLaporanClient({
  today,
  isSuperadmin,
  currentUser,
  users,
  supervisiUsers,
  leaders,
}: Props) {
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

  // --- Download per User (Logbook, modal rentang tanggal) ---
  // Default rentang = bulan berjalan (logbook bulanan, PRD revisi §4.D).
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const [openLogbook, setOpenLogbook] = useState(false);
  const [lbDari, setLbDari] = useState(firstOfMonth);
  const [lbSampai, setLbSampai] = useState(today);
  const [lbUser, setLbUser] = useState(isSuperadmin ? "" : currentUser.id);
  const [loadingUser, setLoadingUser] = useState(false);
  const [errUser, setErrUser] = useState("");

  const logbookUser = isSuperadmin ? lbUser : currentUser.id;
  const logbookValid =
    Boolean(lbDari) && Boolean(lbSampai) && lbDari <= lbSampai && Boolean(logbookUser);

  async function unduhUser() {
    setErrUser("");
    if (lbDari > lbSampai) {
      setErrUser("Tanggal 'dari' tidak boleh setelah tanggal 'sampai'.");
      return;
    }
    if (!logbookUser) {
      setErrUser("Pilih user terlebih dahulu.");
      return;
    }
    setLoadingUser(true);
    const params = new URLSearchParams({
      dari: lbDari,
      sampai: lbSampai,
      user: logbookUser,
    });
    const res = await downloadFile(
      `/api/rekap/logbook?${params.toString()}`,
      `LOGBOOK_${lbDari}_sd_${lbSampai}.xlsx`
    );
    if (res.ok) setOpenLogbook(false);
    else setErrUser(res.error);
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

  // --- Download Laporan Lengkap (modal) ---
  const leadersInfra = leaders.filter((l) => l.kategori === "infrastruktur");
  const leadersDivisi = leaders.filter((l) => l.kategori === "divisi");

  const [openLengkap, setOpenLengkap] = useState(false);
  const [lkpDari, setLkpDari] = useState(today);
  const [lkpSampai, setLkpSampai] = useState(today);
  const [lkpSupervisi, setLkpSupervisi] = useState("");
  const [lkpInfra, setLkpInfra] = useState("");
  const [lkpDivisi, setLkpDivisi] = useState("");
  const [loadingLengkap, setLoadingLengkap] = useState(false);
  const [errLengkap, setErrLengkap] = useState("");

  const lengkapValid =
    Boolean(lkpDari) &&
    Boolean(lkpSampai) &&
    lkpDari <= lkpSampai &&
    Boolean(lkpSupervisi) &&
    Boolean(lkpInfra) &&
    Boolean(lkpDivisi);

  async function unduhLengkap() {
    setErrLengkap("");
    if (lkpDari > lkpSampai) {
      setErrLengkap("Tanggal 'sampai' tidak boleh sebelum tanggal 'dari'.");
      return;
    }
    if (!lengkapValid) {
      setErrLengkap("Lengkapi semua field terlebih dahulu.");
      return;
    }
    setLoadingLengkap(true);
    const params = new URLSearchParams({
      dari: lkpDari,
      sampai: lkpSampai,
      supervisi: lkpSupervisi,
      infra: lkpInfra,
      divisi: lkpDivisi,
    });
    const res = await downloadFile(
      `/api/rekap/lengkap?${params.toString()}`,
      `REKAP_LAPORAN_LENGKAP_${lkpDari}_sd_${lkpSampai}.xlsx`
    );
    if (res.ok) setOpenLengkap(false);
    else setErrLengkap(res.error);
    setLoadingLengkap(false);
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

      {/* Download per User (Logbook) */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card padding="lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-primary" /> Download per User
            </CardTitle>
          </CardHeader>
          <p className="text-sm text-gray-500 mb-4">
            Logbook pribadi: SEMUA tiket yang <strong>di-open petugas</strong>{" "}
            pada rentang tanggal (semua shift &amp; status), lengkap kronologi
            kegiatan termasuk tindak lanjut shift berikutnya.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setOpenLogbook(true)} variant="outline">
              <FileSpreadsheet className="w-4 h-4" /> Download per User
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>

      <Modal
        open={openLogbook}
        onClose={() => setOpenLogbook(false)}
        title="Download Logbook per User"
        description="Pilih rentang tanggal (logbook bulanan). Hanya tiket yang di-open petugas yang muncul."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Dari Tanggal"
              type="date"
              required
              value={lbDari}
              max={lbSampai}
              onChange={(e) => setLbDari(e.target.value)}
            />
            <Input
              label="Sampai Tanggal"
              type="date"
              required
              value={lbSampai}
              min={lbDari}
              onChange={(e) => setLbSampai(e.target.value)}
            />
          </div>
          <Select
            label="Petugas"
            value={logbookUser}
            disabled={!isSuperadmin}
            onChange={(e) => setLbUser(e.target.value)}
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

          {errUser && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errUser}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenLogbook(false)} disabled={loadingUser}>
              Batal
            </Button>
            <Button onClick={unduhUser} disabled={!logbookValid || loadingUser}>
              <Download className="w-4 h-4" /> {loadingUser ? "Memproses…" : "Download"}
            </Button>
          </div>
        </div>
      </Modal>

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

      {/* Download Laporan Lengkap */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card padding="lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Download Laporan Lengkap
            </CardTitle>
          </CardHeader>
          <p className="text-sm text-gray-500 mb-4">
            Rekap laporan untuk rentang tanggal tertentu, lengkap dengan blok tanda
            tangan Supervisi serta Pimpinan/PJS Bag. Infrastruktur &amp; Divisi TI.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setOpenLengkap(true)}>
              <FileText className="w-4 h-4" /> Download Laporan Lengkap
            </Button>
          </div>
        </Card>
      </motion.div>

      <Modal
        open={openLengkap}
        onClose={() => setOpenLengkap(false)}
        title="Download Laporan Lengkap"
        description="Tentukan rentang tanggal dan penanda tangan rekap."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Dari Tanggal"
              type="date"
              required
              value={lkpDari}
              max={lkpSampai}
              onChange={(e) => setLkpDari(e.target.value)}
            />
            <Input
              label="Sampai Tanggal"
              type="date"
              required
              value={lkpSampai}
              min={lkpDari}
              onChange={(e) => setLkpSampai(e.target.value)}
            />
          </div>
          <Select
            label="Supervisi"
            required
            value={lkpSupervisi}
            onChange={(e) => setLkpSupervisi(e.target.value)}
          >
            <option value="">— Pilih supervisi —</option>
            {supervisiUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nama}
              </option>
            ))}
          </Select>
          <Select
            label="Pimpinan / PJS Bag. Infrastruktur"
            required
            value={lkpInfra}
            onChange={(e) => setLkpInfra(e.target.value)}
          >
            <option value="">— Pilih pimpinan —</option>
            {leadersInfra.map((l) => (
              <option key={l.id} value={l.id}>
                {leaderLabel(l)}
              </option>
            ))}
          </Select>
          <Select
            label="Pimpinan / PJS Divisi TI"
            required
            value={lkpDivisi}
            onChange={(e) => setLkpDivisi(e.target.value)}
          >
            <option value="">— Pilih pimpinan —</option>
            {leadersDivisi.map((l) => (
              <option key={l.id} value={l.id}>
                {leaderLabel(l)}
              </option>
            ))}
          </Select>

          {errLengkap && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errLengkap}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenLengkap(false)} disabled={loadingLengkap}>
              Batal
            </Button>
            <Button onClick={unduhLengkap} disabled={!lengkapValid || loadingLengkap}>
              <Download className="w-4 h-4" /> {loadingLengkap ? "Memproses…" : "Download"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
