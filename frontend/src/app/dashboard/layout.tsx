import Sidebar from "@/components/Sidebar";
import { getSession } from '@auth0/nextjs-auth0';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();
    if (!session?.user) {
        redirect('/api/auth/login');
    }

    return (
        <div className="flex min-h-screen bg-navy-800">
            <Sidebar />
            <main className="flex-1 overflow-auto">{children}</main>
        </div>
    );
}

