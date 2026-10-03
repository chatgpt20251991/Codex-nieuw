import {NextResponse, type NextRequest} from "next/server";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  const path = request.nextUrl.pathname;
  headers.set("x-site-locale", path === "/en" || path.startsWith("/en/") ? "en" : "nl");
  return NextResponse.next({request: {headers}});
}

export const config = {matcher: ["/", "/voorbeeld", "/intake", "/privacy", "/en/:path*"]};
