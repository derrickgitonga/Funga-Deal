"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

export default function NewEscrowPage() {
    const router = useRouter();
    const [form, setForm] = useState({ seller_email: "", title: "", description: "", amount: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const { data } = await api.post("/transactions/", {
                ...form,
                amount: parseFloat(form.amount),
            });
            router.push(`/dashboard/${data.id}`);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(msg || "Failed to create escrow. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-xl mx-auto">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-7">
                <ArrowLeft className="w-4 h-4" />
                Back to dashboard
            </Link>

            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-success-500/15 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-success-400" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-100">Create New Escrow</h1>
                    <p className="text-xs text-slate-500">Funds are held securely until delivery is confirmed</p>
                </div>
            </div>

            <div className="card p-7">
                <form onSubmit={handleCreate} className="space-y-5">
                    <div>
                        <label className="label">Seller's email address</label>
                        <input type="email" className="input-field" placeholder="seller@example.co.ke" value={form.seller_email} onChange={set("seller_email")} required />
                        <p className="text-xs text-slate-600 mt-1">The seller must already have a Funga Deal account</p>
                    </div>

                    <div>
                        <label className="label">What are you buying?</label>
                        <input type="text" className="input-field" placeholder="e.g. MacBook Pro M3, 16GB RAM" value={form.title} onChange={set("title")} required maxLength={255} />
                    </div>

                    <div>
                        <label className="label">Description (optional)</label>
                        <textarea
                            className="input-field resize-none"
                            placeholder="Condition: Brand new, sealed box. Pickup: Westlands, Nairobi."
                            rows={3}
                            value={form.description}
                            onChange={set("description")}
                        />
                    </div>

                    <div>
                        <label className="label">Agreed amount (Ksh)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">Ksh</span>
                            <input
                                type="number"
                                className="input-field pl-12"
                                placeholder="45,000"
                                value={form.amount}
                                onChange={set("amount")}
                                required
                                min="100"
                                step="1"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    <div className="bg-navy-800 rounded-lg px-4 py-3 text-xs text-slate-500 border border-navy-600">
                        <p className="font-medium text-slate-400 mb-1">How escrow protects you</p>
                        <p>The buyer deposits funds via M-Pesa. Money is held by Funga Deal and only released to the seller after the buyer confirms they received the goods or service.</p>
                    </div>

                    <button id="create-escrow-btn" type="submit" className="btn-primary w-full flex items-center justify-center gap-2" disabled={loading}>
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? "Creating deal..." : "Create Escrow Deal"}
                    </button>
                </form>
            </div>
        </div>
    );
}
