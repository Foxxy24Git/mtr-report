"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  CheckCircle2,
  TicketPlus,
  MapPin,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

interface AtmHit {
  id: string;
  kodeAtm: string;
  namaAtm: string;
  vendorAtm: string | null;
  vendorJaringan: string | null;
}

interface Props {
  opsi: {
    jenis_gangguan: string[];
    sumber_penyebab: string[];
    jenis_penanganan: string[];
  };
}

type Kategori = "atm" | "jaringan";
type CpTipe = "pic" | "wag";

export function OpenTiketForm({ opsi }: Props) {
  // ATM autocomplete
  const [atmQuery, setAtmQuery] = useState("");
  const [atmHits, setAtmHits] = useState<AtmHit[]>([]);
  const [atmOpen, setAtmOpen] = useState(false);
  const [atmSearching, setAtmSearching] = useState(false);
  const [selectedAtm, setSelectedAtm] = useState<AtmHit | null>(null);

  // Field tiket
  const [kategori, setKategori] = useState<Kategori | "">("");
  const [cpTipe, setCpTipe] = useState<CpTipe>("pic");
  const [cpNama, setCpNama] = useState("");
  const [cpTelp, setCpTelp] = useState("");
  const [jenisGangguan, setJenisGangguan] = useState("");
  const [sumberPenyebab, setSumberPenyebab] = useState("");
  const [metodePenanganan, setMetodePenanganan] = useState("");
  const [vendor, setVendor] = useState("");
  const [noTiketVendor, setNoTiketVendor] = useState("");
  const [kegiatan, setKegiatan] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  // Debounce pencarian ATM
  const firstRender = useRef(true);
  useEffect(() => {
    if (selectedAtm) return; // jangan cari ketika sudah memilih
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (atmQuery.trim().length === 0) {
      setAtmHits([]);
      return;
    }
    const handle = setTimeout(async () => {
      setAtmSearching(true);
      try {
        const res = await fetch(
          `/api/atm?q=${encodeURIComponent(atmQuery)}&limit=10`
        );
        const data = await res.json();
        setAtmHits(data.items ?? []);
        setAtmOpen(true);
      } finally {
        setAtmSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [atmQuery, selectedAtm]);

  function pickAtm(hit: AtmHit) {
    setSelectedAtm(hit);
    setAtmOpen(false);
    setAtmQuery("");
    setAtmHits([]);
  }

  function clearAtm() {
    setSelectedAtm(null);
    setAtmQuery("");
  }

  function resetForm() {
    clearAtm();
    setKategori("");
    setCpTipe("pic");
    setCpNama("");
    setCpTelp("");
    setJenisGangguan("");
    setSumberPenyebab("");
    setMetodePenanganan("");
    setVendor("");
    setNoTiketVendor("");
    setKegiatan("");
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!selectedAtm) return setError("Pilih ATM/lokasi dari pencarian.");
    if (!kategori) return setError("Pilih kategori tiket (ATM atau Jaringan).");
    if (cpTipe === "pic" && (!cpNama.trim() || !cpTelp.trim()))
      return setError("No PIC wajib mengisi nama dan nomor telepon.");
    if (cpTipe === "wag" && !cpNama.trim())
      return setError("Nama WAG wajib diisi.");
    if (!jenisGangguan) return setError("Pilih jenis gangguan.");
    if (!sumberPenyebab) return setError("Pilih sumber penyebab gangguan.");
    if (!metodePenanganan) return setError("Pilih metode penanganan gangguan.");
    if (!kegiatan.trim()) return setError("Kegiatan pertama wajib diisi.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atmId: selectedAtm.id,
          kategori,
          cpTipe,
          cpNama,
          cpTelp: cpTipe === "pic" ? cpTelp : "",
          jenisGangguan,
          sumberPenyebab,
          metodePenanganan,
          vendor,
          noTiketVendor,
          kegiatan,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal membuka tiket.");
        return;
      }
      setCreated(data.item.noTiket);
      resetForm();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <AnimatePresence>
        {created && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="border-green-200 bg-green-50/60 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-700">
                  Tiket berhasil dibuka dengan nomor
                </p>
                <p className="text-lg font-bold font-mono text-green-700">
                  {created}
                </p>
              </div>
              <button
                onClick={() => setCreated(null)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-white hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card padding="lg">
        <form onSubmit={submit} className="space-y-6">
          {/* 1. Pencarian ATM */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Cari ATM / Lokasi <span className="text-red-500">*</span>
            </label>
            {selectedAtm ? (
              <div className="mt-1 flex items-start justify-between gap-3 rounded-md border border-primary-100 bg-primary-50/50 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      <span className="font-mono">{selectedAtm.kodeAtm}</span> —{" "}
                      {selectedAtm.namaAtm}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="primary">
                        Vendor ATM: {selectedAtm.vendorAtm ?? "—"}
                      </Badge>
                      <Badge variant="neutral">
                        Vendor Jaringan: {selectedAtm.vendorJaringan ?? "—"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearAtm}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  Ganti
                </button>
              </div>
            ) : (
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={atmQuery}
                  onChange={(e) => setAtmQuery(e.target.value)}
                  onFocus={() => atmHits.length && setAtmOpen(true)}
                  placeholder="Ketik kode atau nama ATM…"
                  className="w-full pl-9 pr-9 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {atmSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                )}
                {atmOpen && atmHits.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 bg-white shadow-card-lg">
                    {atmHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        onClick={() => pickAtm(hit)}
                        className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          <span className="font-mono">{hit.kodeAtm}</span> —{" "}
                          {hit.namaAtm}
                        </div>
                        <div className="text-xs text-gray-500">
                          Vendor ATM: {hit.vendorAtm ?? "—"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {atmOpen &&
                  !atmSearching &&
                  atmQuery.trim() &&
                  atmHits.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      Tidak ditemukan. Tambahkan dulu di menu Data ATM.
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* 2. Kategori */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Kategori Tiket <span className="text-red-500">*</span>
            </label>
            <div className="mt-1.5 flex gap-2">
              {(["atm", "jaringan"] as Kategori[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKategori(k)}
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-md border text-sm font-medium capitalize transition-all",
                    kategori === k
                      ? "border-primary bg-primary text-white shadow-sm"
                      : "border-gray-300 text-gray-600 hover:border-primary/50"
                  )}
                >
                  {k === "atm" ? "ATM" : "Jaringan Kantor"}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Contact Person */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Contact Person <span className="text-red-500">*</span>
            </label>
            <div className="mt-1.5 flex gap-4">
              {(
                [
                  ["pic", "No PIC"],
                  ["wag", "WAG (WhatsApp Group)"],
                ] as [CpTipe, string][]
              ).map(([val, label]) => (
                <label
                  key={val}
                  className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="cpTipe"
                    checked={cpTipe === val}
                    onChange={() => setCpTipe(val)}
                    className="accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cpTipe === "pic" ? (
                <>
                  <Input
                    label="Nama PIC"
                    required
                    value={cpNama}
                    onChange={(e) => setCpNama(e.target.value)}
                  />
                  <Input
                    label="Nomor Telepon"
                    required
                    value={cpTelp}
                    onChange={(e) => setCpTelp(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                  />
                </>
              ) : (
                <Input
                  label="Nama WAG"
                  required
                  value={cpNama}
                  onChange={(e) => setCpNama(e.target.value)}
                  placeholder="cth. WAG Monitoring ATM"
                />
              )}
            </div>
          </div>

          {/* 4-6. Dropdown master */}
          <div className="grid grid-cols-1 gap-4">
            <Select
              label="Jenis Gangguan"
              required
              value={jenisGangguan}
              onChange={(e) => setJenisGangguan(e.target.value)}
            >
              <option value="">— Pilih jenis gangguan —</option>
              {opsi.jenis_gangguan.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
            <Select
              label="Sumber Penyebab Gangguan"
              required
              value={sumberPenyebab}
              onChange={(e) => setSumberPenyebab(e.target.value)}
            >
              <option value="">— Pilih sumber penyebab —</option>
              {opsi.sumber_penyebab.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
            <Select
              label="Metode Penanganan Gangguan"
              required
              value={metodePenanganan}
              onChange={(e) => setMetodePenanganan(e.target.value)}
            >
              <option value="">— Pilih metode penanganan —</option>
              {opsi.jenis_penanganan.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>

          {/* 7-8. Vendor opsional */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Vendor (opsional)"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
            <Input
              label="No Tiket dari Vendor (opsional)"
              value={noTiketVendor}
              onChange={(e) => setNoTiketVendor(e.target.value)}
            />
          </div>

          {/* 9. Kegiatan pertama */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="kegiatan"
              className="text-sm font-medium text-gray-700"
            >
              Kegiatan Penanganan Pertama <span className="text-red-500">*</span>
            </label>
            <textarea
              id="kegiatan"
              required
              rows={3}
              value={kegiatan}
              onChange={(e) => setKegiatan(e.target.value)}
              placeholder="cth. Menerima laporan ATM offline, melakukan pengecekan koneksi…"
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
            <p className="text-xs text-gray-500">
              Timestamp dicatat otomatis saat tiket dibuka.
            </p>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
            >
              {error}
            </motion.p>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <Button type="button" variant="secondary" onClick={resetForm}>
              Reset
            </Button>
            <Button type="submit" loading={submitting}>
              <TicketPlus className="w-4 h-4" /> Buka Tiket
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
