"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { UploadCloud, Loader2, User2, PenLine, Trash2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface Props {
  title: string;
  hint?: string;
  currentUrl: string | null;
  endpoint: string;
  variant: "avatar" | "signature" | "logo";
  onUploaded: (url: string) => void;
  /** Tipe MIME yang diterima. Default PNG/JPG/WEBP. */
  accept?: string;
  /** Pesan saat format tak sesuai. Default sesuai accept umum. */
  formatError?: string;
  /** Bila true, tampilkan tombol Hapus yang memanggil DELETE ke endpoint. */
  removable?: boolean;
  /** Dipanggil setelah berhasil dihapus. */
  onRemoved?: () => void;
}

const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_ACCEPT = "image/png,image/jpeg,image/webp";

export function ImageUploader({
  title,
  hint,
  currentUrl,
  endpoint,
  variant,
  onUploaded,
  accept = DEFAULT_ACCEPT,
  formatError = "Format harus PNG, JPG, atau WEBP.",
  removable = false,
  onRemoved,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(currentUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Cache-buster agar gambar yang baru diunggah langsung tampil.
  const [v, setV] = useState(0);

  async function handleFile(file: File) {
    setError("");
    if (!accept.split(",").includes(file.type)) {
      setError(formatError);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Ukuran file maksimal 2MB.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal mengunggah berkas.");
        return;
      }
      setUrl(data.url);
      setV((n) => n + 1);
      onUploaded(data.url);
    } catch {
      setError("Terjadi kesalahan jaringan saat mengunggah.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal menghapus berkas.");
        return;
      }
      setUrl(null);
      setV((n) => n + 1);
      onRemoved?.();
    } catch {
      setError("Terjadi kesalahan jaringan saat menghapus.");
    } finally {
      setBusy(false);
    }
  }

  const displaySrc = url ? `${url}?v=${v}` : null;
  const isAvatar = variant === "avatar";
  const isLogo = variant === "logo";

  return (
    <div className="flex items-start gap-4">
      <div
        className={cn(
          "relative shrink-0 overflow-hidden border bg-surface-muted flex items-center justify-center",
          isAvatar
            ? "w-20 h-20 rounded-full border-gray-200"
            : isLogo
              ? "w-44 h-20 rounded-lg border-dashed border-gray-300"
              : "w-32 h-20 rounded-lg border-dashed border-gray-300"
        )}
      >
        {displaySrc ? (
          <Image
            src={displaySrc}
            alt={title}
            fill
            sizes="176px"
            className={cn(isAvatar ? "object-cover" : "object-contain p-1")}
            unoptimized
          />
        ) : isAvatar ? (
          <User2 className="w-8 h-8 text-gray-300" />
        ) : isLogo ? (
          <ImageIcon className="w-7 h-7 text-gray-300" />
        ) : (
          <PenLine className="w-7 h-7 text-gray-300" />
        )}
        {busy && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-white/70 flex items-center justify-center"
          >
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </motion.div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={busy}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud className="w-4 h-4" />
            {url ? "Ganti" : "Unggah"}
          </Button>
          {removable && url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={handleRemove}
              className="text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              Hapus
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      </div>
    </div>
  );
}
