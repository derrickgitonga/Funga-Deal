import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
    "/pay/(.*)",
    "/sign-in(.*)",
    "/sign-up(.*)",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
    if (isAdminRoute(req)) {
        const { userId, sessionClaims } = await auth();
        if (!userId) {
            return NextResponse.redirect(new URL("/sign-in", req.url));
        }
        const isAdmin = (sessionClaims?.metadata as Record<string, unknown> | undefined)?.isAdmin === true;
        if (!isAdmin) {
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
