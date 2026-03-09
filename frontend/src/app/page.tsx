"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from '@clerk/nextjs';
import { ShieldCheck } from "lucide-react";

export default function Home() {
    const router = useRouter();
    const { user, isLoaded, isSignedIn } = useUser();

    useEffect(() => {
        if (isLoaded) {
            if (isSignedIn) {
                router.replace("/dashboard");
            } else {
                router.replace("/sign-in");
            }
        }
    }, [router, isSignedIn, isLoaded]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-navy-800">
            <ShieldCheck className="w-10 h-10 text-success-500 animate-pulse" />
        </div>
    );
}
