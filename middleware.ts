import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/jwt";
import { canAccess } from "@/lib/rbac";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  // Halaman login: kalau sudah login, arahkan ke dashboard.
  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  // Belum login → ke /login (simpan tujuan asal).
  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // RBAC: role tidak boleh akses route ini → balik ke dashboard.
  if (!canAccess(session.role, pathname)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Proteksi semua route kecuali API auth, asset statis Next, dan file publik.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|logo-bank-nagari.svg).*)",
  ],
};
