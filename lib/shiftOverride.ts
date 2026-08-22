import { prisma } from "@/lib/prisma";
import { parseTanggal, todayKeyWIB } from "@/lib/suhuServer";

/** True bila Super Admin sudah mengaktifkan mode 12 jam untuk tanggal `now` (WIB). */
export async function isShift12JamAktif(now: Date = new Date()): Promise<boolean> {
  const tanggal = parseTanggal(todayKeyWIB(now));
  if (!tanggal) return false;
  const row = await prisma.shiftOverride.findUnique({
    where: { tanggal },
    select: { id: true },
  });
  return row !== null;
}
