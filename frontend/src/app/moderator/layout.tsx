import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function ModeratorLayout({ children }: { children: React.ReactNode }) {
    const { userId, sessionClaims } = await auth();
    if (!userId) redirect("/sign-in");

    const meta = sessionClaims?.metadata as Record<string, unknown> | undefined;
    const role = meta?.role as string | undefined;
    const allowed = meta?.isAdmin === true || role === "admin" || role === "moderator";
    if (!allowed) redirect("/dashboard");

    return <div className="min-h-screen bg-gray-50">{children}</div>;
}
