import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const { userId, sessionClaims } = await auth();
    if (!userId) {
        redirect('/sign-in');
    }
    const isAdmin = (sessionClaims?.metadata as Record<string, unknown> | undefined)?.isAdmin === true;
    if (!isAdmin) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {children}
        </div>
    );
}
