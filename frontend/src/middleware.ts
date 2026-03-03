import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("cmt_token")?.value;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Already authenticated → redirect away from login
  if (token && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Not authenticated → redirect to login
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
