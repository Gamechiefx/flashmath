import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "./auth.config";

// Get the NextAuth middleware
const authMiddleware = NextAuth(authConfig).auth;

// Wrap to add custom headers
export default async function middleware(request: NextRequest) {
    // Run NextAuth middleware first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- NextAuth middleware type is complex
    const authResponse = await (authMiddleware as (req: NextRequest) => Promise<NextResponse | undefined>)(request);
    
    // Get or create response
    const response = authResponse || NextResponse.next();
    
    // Add pathname header for layouts to use (e.g., for maintenance mode bypass)
    response.headers.set("x-pathname", request.nextUrl.pathname);
    
    return response;
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
