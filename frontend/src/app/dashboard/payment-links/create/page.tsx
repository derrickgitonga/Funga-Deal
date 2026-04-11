"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Link2, Loader2, Copy, Check, ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import { useUser } from "@clerk/nextjs";
import { DeliveryMethod } from "@/types";

const CURRENCIES = ["KES", "USD", "EUR", "GBP"];
const DELIVERY_METHODS: DeliveryMethod[] = ["Courier", "Digital", "Service"];

export default function CreatePaymentLinkPage() {
    const router = useRouter();
    const { user } = useUser();
    const [form, setForm] = useState({
        title: "",
        description: "",
        price: "",
        currency: "KES",
        delivery_method: "Courier" as DeliveryMethod,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [createdId, setCreatedId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const { data } = await api.post("/payment-links", {
                ...form,
                price: parseFloat(form.price),
            });
            setCreatedId(data.id);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(msg || "Failed to create payment link.");
            setLoading(false);
        }
    };

    const payUrl = createdId ? `${window.location.origin}/pay/${createdId}` : "";

    const copy = () => {
        navigator.clipboard.writeText(payUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (createdId) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center mt-12">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-6">
                    <Link2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Link Created!</h1>
                <p className="text-gray-500 mb-8">Share this link with buyers to receive secure escrow payments.</p>

                <div className="card p-4 flex items-center gap-3 mb-6 text-left">
                    <Link2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <p className="text-sm text-gray-600 truncate flex-1">{payUrl}</p>
                    <button onClick={copy} className="text-gray-400 hover:text-emerald-600 transition-colors flex-shrink-0">
                        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                </div>

                <div className="flex gap-3 justify-center">
                    <Link href="/dashboard/payment-links" className="btn-primary">
                        View All Links
                    </Link>
                    <button onClick={() => { setCreatedId(null); setForm({ title: "", description: "", price: "", currency: "KES", delivery_method: "Courier" }); setLoading(false); }} className="btn-secondary">
                        Create Another
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-2xl mx-auto">
            <Link href="/dashboard/payment-links" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-7">
                <ArrowLeft className="w-4 h-4" />
                Back to payment links
            </Link>

            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                    <Link2 className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Create Payment Link</h1>
                    <p className="text-xs text-gray-500">Buyers pay through secure escrow — funds release when you deliver</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-6">
                    <form onSubmit={handleCreate} className="space-y-5">
                        <div>
                            <label className="label">Product or service title</label>
                            <input type="text" className="input-field" placeholder="e.g. iPhone 15 Pro Max 256GB" value={form.title} onChange={set("title")} required maxLength={255} />
                        </div>

                        <div>
                            <label className="label">Description</label>
                            <textarea className="input-field resize-none" placeholder="Condition, specifications, terms..." rows={3} value={form.description} onChange={set("description")} />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Price</label>
                                <input type="number" className="input-field" placeholder="45000" value={form.price} onChange={set("price")} required min="1" step="0.01" />
                            </div>
                            <div>
                                <label className="label">Currency</label>
                                <select className="input-field" value={form.currency} onChange={set("currency")}>
                                    {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="label">Delivery method</label>
                            <select className="input-field" value={form.delivery_method} onChange={set("delivery_method")}>
                                {DELIVERY_METHODS.map((m) => <option key={m}>{m}</option>)}
                            </select>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                                {error}
                            </div>
                        )}

                        <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2" disabled={loading}>
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {loading ? "Creating..." : "Create Payment Link"}
                        </button>
                    </form>
                </div>

                <div className="lg:sticky lg:top-8">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Preview</p>
                    <div className="card p-5">
                        <div className="w-full h-28 bg-gray-50 border border-gray-200 rounded-xl mb-4 flex items-center justify-center">
                            <Link2 className="w-8 h-8 text-gray-300" />
                        </div>
                        <p className="font-bold text-gray-900 mb-1 truncate">{form.title || "Product title"}</p>
                        <p className="text-xs text-gray-400 line-clamp-2 mb-3">{form.description || "Description will appear here"}</p>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xl font-bold text-emerald-600">
                                {form.price
                                    ? new Intl.NumberFormat("en-KE", { style: "currency", currency: form.currency, maximumFractionDigits: 0 }).format(parseFloat(form.price))
                                    : `0 ${form.currency}`}
                            </p>
                            <span className="text-xs text-gray-400">{form.delivery_method}</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-1">Seller</p>
                        <p className="text-sm font-medium text-gray-800">{user?.fullName || "Your name"}</p>
                        <div className="mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            <p className="text-xs text-emerald-700">Protected by Funga Deal escrow</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
