import Sidebar from "@/components/Sidebar";
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { userId, sessionClaims } = await auth();
    if (!userId) redirect('/sign-in');

    const meta = sessionClaims?.metadata as Record<string, unknown> | undefined;
    const role = meta?.role as string | undefined;
    if (role === "moderator" || role === "admin") redirect('/moderator');

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <main className="flex-1 overflow-auto">{children}</main>
        </div>
    );
}
