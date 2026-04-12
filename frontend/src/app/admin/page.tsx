"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, TrendingUp, DollarSign, CheckCircle, Loader2, Users } from "lucide-react";
import api from "@/lib/api";
import { AdminStats, AdminDispute, Transaction } from "@/types";

const formatKsh = (n: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

export default function AdminPage() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [disputes, setDisputes] = useState<AdminDispute[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [resolving, setResolving] = useState<string | null>(null);
    const [error, setError] = useState("");

    const load = () =>
        Promise.all([
            api.get("/admin/stats"),
            api.get("/admin/disputes"),
            api.get("/admin/transactions"),
        ]).then(([s, d, t]) => {
            setStats(s.data);
            setDisputes(d.data);
            setTransactions(t.data);
        }).catch(() => setError("Failed to load admin data."))
          .finally(() => setLoading(false));

    useEffect(() => { load(); }, []);

    const resolve = async (disputeId: string, winner: "buyer" | "seller") => {
        const resolution = winner === "buyer" ? "Resolved in favour of buyer" : "Resolved in favour of seller";
        setResolving(disputeId);
        try {
            await api.post(`/admin/disputes/${disputeId}/resolve`, { winner, resolution });
            await load();
        } finally {
            setResolving(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full py-32">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full py-32">
                <div className="text-center">
                    <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                    <Users className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
                    <p className="text-xs text-gray-500">Platform overview and dispute management</p>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                    { label: "Total Volume", value: formatKsh(stats?.total_volume ?? 0), icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "Escrow Held", value: formatKsh(stats?.escrow_held ?? 0), icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Open Disputes", value: String(stats?.open_disputes ?? 0), icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
                    { label: "Fees Earned", value: formatKsh(stats?.total_fees_earned ?? 0), icon: DollarSign, color: "text-indigo-600", bg: "bg-indigo-50" },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="card px-5 py-4">
                        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                            <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <p className="text-xs text-gray-400 mb-1">{label}</p>
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                        Open Disputes ({disputes.length})
                    </h2>

                    {disputes.length === 0 ? (
                        <div className="card px-6 py-10 text-center">
                            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                            <p className="text-gray-500 text-sm">No open disputes</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {disputes.map((d) => (
                                <div key={d.id} className="card p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{d.transaction_title}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {d.buyer_name} vs {d.seller_name}
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-emerald-600 ml-3 flex-shrink-0">{formatKsh(d.amount)}</p>
                                    </div>

                                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                                        <p className="text-xs text-gray-600 italic">"{d.reason}"</p>
                                        <p className="text-xs text-gray-400 mt-1">Raised by {d.raised_by_name} · {timeAgo(d.created_at)}</p>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => resolve(d.id, "buyer")}
                                            disabled={resolving === d.id}
                                            className="flex-1 btn-danger text-xs py-1.5 flex items-center justify-center gap-1"
                                        >
                                            {resolving === d.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                            Refund Buyer
                                        </button>
                                        <button
                                            onClick={() => resolve(d.id, "seller")}
                                            disabled={resolving === d.id}
                                            className="flex-1 btn-primary text-xs py-1.5 flex items-center justify-center gap-1"
                                        >
                                            {resolving === d.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                            Release to Seller
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                        Recent Transactions
                    </h2>
                    <div className="space-y-2">
                        {transactions.slice(0, 10).map((tx) => (
                            <div key={tx.id} className="card px-4 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{tx.title}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{tx.buyer_name} → {tx.seller_name}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-gray-900">{formatKsh(tx.amount)}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{tx.status}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
