import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: [
    // Match all pathnames except static files and API routes handled by Next.js
    "/((?!api|_next/static|_next/image|assets|media|favicon.ico|manifest.webmanifest).*)",
  ],
};
