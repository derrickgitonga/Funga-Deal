"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from '@auth0/nextjs-auth0/client';
import { ShieldCheck } from "lucide-react";

export default function Home() {
    const router = useRouter();
    const { user, isLoading } = useUser();

    useEffect(() => {
        if (!isLoading) {
            if (user) {
                router.replace("/dashboard");
            } else {
                router.replace("/api/auth/login");
            }
        }
    }, [router, user, isLoading]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-navy-800">
            <ShieldCheck className="w-10 h-10 text-success-500 animate-pulse" />
        </div>
    );
}
