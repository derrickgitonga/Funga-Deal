"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2, PlusCircle, Copy, Check, ToggleLeft, Loader2, Package } from "lucide-react";
import api from "@/lib/api";
import { PaymentLink } from "@/types";

const formatAmount = (n: number, currency: string) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export default function PaymentLinksPage() {
    const [links, setLinks] = useState<PaymentLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState<string | null>(null);
    const [deactivating, setDeactivating] = useState<string | null>(null);

    const load = () =>
        api.get("/payment-links").then(({ data }) => setLinks(data.links)).finally(() => setLoading(false));

    useEffect(() => { load(); }, []);

    const copy = (id: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/pay/${id}`);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const deactivate = async (id: string) => {
        setDeactivating(id);
        await api.patch(`/payment-links/${id}/deactivate`);
        await load();
        setDeactivating(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full py-32">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                        <Link2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Payment Links</h1>
                        <p className="text-xs text-gray-500">Share links for buyers to pay you securely</p>
                    </div>
                </div>
                <Link href="/dashboard/payment-links/create" className="btn-primary flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" />
                    Create Link
                </Link>
            </div>

            {links.length === 0 ? (
                <div className="card px-6 py-16 text-center">
                    <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-700 font-medium">No payment links yet</p>
                    <p className="text-sm text-gray-400 mt-1">Create a link and share it with buyers to receive secure escrow payments</p>
                    <Link href="/dashboard/payment-links/create" className="btn-primary inline-flex mt-4 gap-2 items-center">
                        <PlusCircle className="w-4 h-4" />
                        Create your first link
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {links.map((link) => (
                        <div key={link.id} className="card p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="font-semibold text-gray-900 truncate">{link.title}</p>
                                        <span className={`badge text-xs ${link.status === "active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-500"}`}>
                                            {link.status}
                                        </span>
                                    </div>
                                    {link.description && (
                                        <p className="text-xs text-gray-400 line-clamp-1">{link.description}</p>
                                    )}
                                </div>
                                <p className="text-lg font-bold text-emerald-600 ml-4 flex-shrink-0">
                                    {formatAmount(link.price, link.currency)}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                                <Package className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-xs text-gray-500">{link.delivery_method}</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-xs text-gray-400">{link.currency}</span>
                            </div>

                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
                                <Link2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <p className="text-xs text-gray-500 truncate flex-1">
                                    {typeof window !== "undefined" ? window.location.origin : ""}/pay/{link.id}
                                </p>
                                <button onClick={() => copy(link.id)} className="text-gray-400 hover:text-emerald-600 transition-colors flex-shrink-0">
                                    {copied === link.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                            </div>

                            {link.status === "active" && (
                                <button
                                    onClick={() => deactivate(link.id)}
                                    disabled={deactivating === link.id}
                                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    {deactivating === link.id
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <ToggleLeft className="w-3.5 h-3.5" />
                                    }
                                    Deactivate
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
