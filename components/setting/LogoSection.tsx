"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { ImageUploader } from "@/components/setting/ImageUploader";

interface Props {
  currentLogoUrl: string | null;
}

export function LogoSection({ currentLogoUrl }: Props) {
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl);

  return (
    <Card>
      <CardTitle className="mb-1 flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary" /> Logo Aplikasi
      </CardTitle>
      <p className="text-xs text-gray-500 mb-4">
        Logo tampil di sidebar, halaman login, dan laporan Excel. Bila dikosongkan,
        aplikasi memakai logo bawaan Bank Nagari. Format PNG, JPG, atau SVG, maks 2&nbsp;MB.
        <span className="block mt-1 text-gray-400">
          Catatan: logo SVG dipakai pada tampilan aplikasi; pada laporan Excel
          dipakai logo bawaan (SVG tidak didukung Excel).
        </span>
      </p>
      <ImageUploader
        title="Logo saat ini"
        hint={logoUrl ? undefined : "Belum ada logo khusus — memakai logo bawaan."}
        currentUrl={logoUrl}
        endpoint="/api/settings/logo"
        variant="logo"
        accept="image/png,image/jpeg,image/svg+xml"
        formatError="Format file harus PNG, JPG, atau SVG."
        removable
        onUploaded={setLogoUrl}
        onRemoved={() => setLogoUrl(null)}
      />
    </Card>
  );
}
