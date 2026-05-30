import {
  LayoutDashboard,
  Activity,
  CalendarRange,
  TicketPlus,
  FileBarChart2,
  Server,
  Thermometer,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/roles";

export type { Role };

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Role yang boleh mengakses menu ini. Kosong = semua role login. */
  roles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Ringkasan & status open tiket",
  },
  {
    label: "Daily Monitoring",
    href: "/daily-monitoring",
    icon: Activity,
    description: "Semua tiket ATM & jaringan aktif",
  },
  {
    label: "Weekly Monitoring",
    href: "/weekly-monitoring",
    icon: CalendarRange,
    description: "Riwayat tiket 7 hari terakhir (read-only)",
  },
  {
    label: "Supervisi",
    href: "/supervisi",
    icon: ShieldCheck,
    description: "Tinjau & setujui tiket gangguan",
    roles: ["superadmin", "supervisi"],
  },
  {
    label: "Open Tiket",
    href: "/open-tiket",
    icon: TicketPlus,
    description: "Buat tiket gangguan baru",
    roles: ["superadmin", "user"],
  },
  {
    label: "Rekap Laporan",
    href: "/rekap-laporan",
    icon: FileBarChart2,
    description: "Download laporan Excel harian",
  },
  {
    label: "Data ATM",
    href: "/data-atm",
    icon: Server,
    description: "Master data ATM & jaringan",
    roles: ["superadmin", "user"],
  },
  {
    label: "Suhu / Server",
    href: "/suhu-server",
    icon: Thermometer,
    description: "Log suhu AC & pemantauan server",
    roles: ["superadmin", "user"],
  },
  {
    label: "Setting",
    href: "/setting",
    icon: Settings,
    description: "Profil, password, & kelola user",
  },
];

export const SHIFT_LABELS: Record<string, string> = {
  A: "Shift Pagi (07:00–15:00)",
  B: "Shift Sore (15:00–23:00)",
  C: "Shift Malam (23:00–07:00)",
  D: "Shift Lembur Pagi (07:00–19:00)",
  E: "Shift Lembur Malam (19:00–07:00)",
};

/** Label pendek tanpa jam — untuk badge/tabel ringkas. */
export const SHIFT_NAMES: Record<string, string> = {
  A: "Shift Pagi",
  B: "Shift Sore",
  C: "Shift Malam",
  D: "Shift Lembur Pagi",
  E: "Shift Lembur Malam",
};

export const APP_NAME = "mtr-Report";
export const APP_SUBTITLE = "Monitoring & Tiket Gangguan ATM";
export const BANK_NAME = "Bank Nagari";
