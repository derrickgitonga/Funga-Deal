import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
    "/pay/(.*)",
    "/sign-in(.*)",
    "/sign-up(.*)",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isModeratorRoute = createRouteMatcher(["/moderator(.*)"]);

export default clerkMiddleware(async (auth, req) => {
    if (isAdminRoute(req)) {
        const { userId, sessionClaims } = await auth();
        if (!userId) {
            return NextResponse.redirect(new URL("/sign-in", req.url));
        }
        const meta = sessionClaims?.metadata as Record<string, unknown> | undefined;
        if (meta?.isAdmin !== true) {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }
        return;
    }

    if (isModeratorRoute(req)) {
        const { userId, sessionClaims } = await auth();
        if (!userId) {
            return NextResponse.redirect(new URL("/sign-in", req.url));
        }
        const meta = sessionClaims?.metadata as Record<string, unknown> | undefined;
        const role = meta?.role as string | undefined;
        const allowed = meta?.isAdmin === true || role === "admin" || role === "moderator";
        if (!allowed) {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }
        return;
    }

    if (!isPublicRoute(req)) {
        await auth.protect();
    }
});

export const config = {
    matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
