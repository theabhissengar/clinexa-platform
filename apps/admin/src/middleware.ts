import { NextResponse } from "next/server";

/**
 * Soft route helper for the admin app.
 *
 * The refresh cookie is issued by the API origin (e.g. localhost:3001) and is
 * therefore not readable by this Next.js middleware on the admin origin
 * (e.g. localhost:3000). Session restore and protected-route gating are
 * enforced client-side by AuthProvider and the (protected) layout.
 */
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
