import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/Card";

/** Ditampilkan saat petugas belum memilih shift di Dashboard (PRD §3). */
export function ShiftRequiredNotice() {
  return (
    <Card padding="lg">
      <div className="flex flex-col items-center text-center gap-3 py-6">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
          <CalendarClock className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-800">Belum memilih shift</p>
          <p className="text-sm text-gray-500 mt-1">
            Pilih shift aktif terlebih dahulu di Dashboard sebelum menggunakan
            modul ini.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-white text-sm font-medium px-4 py-2 hover:bg-primary-dark transition-colors"
        >
          Ke Dashboard
        </Link>
      </div>
    </Card>
  );
}
