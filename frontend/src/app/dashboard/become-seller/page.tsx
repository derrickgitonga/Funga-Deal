"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, ShieldCheck, Banknote, Users } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

export default function BecomeSellerPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const handleEnableSeller = async () => {
        setLoading(true);
        setError("");
        try {
            await api.put("/users/me/seller");
            setSuccess(true);
            setTimeout(() => {
                router.push("/dashboard");
            }, 2000);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(msg || "Failed to enable seller account. Please try again.");
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center mt-20">
                <div className="w-16 h-16 rounded-2xl bg-success-500/15 flex items-center justify-center mx-auto mb-6">
                    <ShieldCheck className="w-8 h-8 text-success-400" />
                </div>
                <h1 className="text-2xl font-bold text-slate-100 mb-2">You're Now a Seller!</h1>
                <p className="text-slate-400 mb-8">Buyers can now create escrow deals with your email address.</p>
                <div className="flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-success-400" />
                    <span className="ml-3 text-sm text-slate-500">Redirecting to dashboard...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-xl mx-auto">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-7">
                <ArrowLeft className="w-4 h-4" />
                Back to dashboard
            </Link>

            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center border border-indigo-500/20">
                    <Banknote className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-100">Become a Seller</h1>
                    <p className="text-xs text-slate-500">Enable your account to receive funds via Funga Deal escrow</p>
                </div>
            </div>

            <div className="card p-7 space-y-6">
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-200">Secure Payments</h3>
                            <p className="text-xs text-slate-500 mt-1">When a buyer creates an escrow, funds are secured before you deliver.</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center">
                            <Users className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-200">Build Trust</h3>
                            <p className="text-xs text-slate-500 mt-1">Show buyers you are a verified seller on the Funga Deal platform.</p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <div className="pt-4 border-t border-navy-700">
                    <button
                        onClick={handleEnableSeller}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                        disabled={loading}
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? "Enabling..." : "Enable Seller Account"}
                    </button>
                    <p className="text-[11px] text-center text-slate-600 mt-3">
                        By becoming a seller, you agree to the platform's terms of service and delivery guarantees.
                    </p>
                </div>
            </div>
        </div>
    );
}
