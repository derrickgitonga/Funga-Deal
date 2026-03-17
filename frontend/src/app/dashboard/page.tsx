"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, ArrowRight, ShieldCheck, Clock, TrendingUp, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Transaction, TransactionStatus } from "@/types";
import { useUser } from "@clerk/nextjs";

const STATUS_BADGE: Record<TransactionStatus, { label: string; className: string }> = {
    CREATED: { label: "Created", className: "bg-slate-700 text-slate-300" },
    FUNDED: { label: "Funded", className: "bg-success-900/40 text-success-400 border border-success-700/50" },
    SHIPPED: { label: "Shipped", className: "bg-blue-900/40 text-blue-400 border border-blue-700/50" },
    DELIVERED: { label: "Delivery Confirmed", className: "bg-blue-900/40 text-blue-400 border border-blue-700/50" },
    RELEASED: { label: "Released", className: "bg-success-900/40 text-success-300 border border-success-600/50" },
    DISPUTED: { label: "Disputed", className: "bg-red-900/40 text-red-400 border border-red-700/50" },
    REFUNDED: { label: "Refunded", className: "bg-slate-700 text-slate-300" },
};

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

export default function DashboardPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const { user, isLoaded } = useUser();
    const isUserLoading = !isLoaded;

    useEffect(() => {
        api.get("/transactions/").then(({ data }) => {
            setTransactions(data.transactions);
        }).finally(() => setLoading(false));
    }, []);

    const active = transactions.filter(
        (t) => !["RELEASED", "REFUNDED"].includes(t.status)
    );
    const totalInEscrow = active
        .filter((t) => ["FUNDED", "SHIPPED", "DELIVERED"].includes(t.status))
        .reduce((sum, t) => sum + Number(t.amount), 0);

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                        Good morning{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""} 👋
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Your escrow overview</p>
                </div>
                <Link href="/dashboard/new" className="btn-primary flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" />
                    New Escrow
                </Link>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                    { label: "In Escrow", value: formatKsh(totalInEscrow), icon: ShieldCheck, color: "text-success-400" },
                    { label: "Active Deals", value: String(active.length), icon: TrendingUp, color: "text-blue-400" },
                    { label: "Total Deals", value: String(transactions.length), icon: Clock, color: "text-slate-400" },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="card px-5 py-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Icon className={`w-4 h-4 ${color}`} />
                            <span className="text-xs text-slate-500">{label}</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-100">{value}</p>
                    </div>
                ))}
            </div>

            <div>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                    Transaction Timeline
                </h2>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-success-500" />
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="card px-6 py-12 text-center">
                        <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400 font-medium">No escrows yet</p>
                        <p className="text-sm text-slate-600 mt-1">Create your first deal to start transacting safely</p>
                        <Link href="/dashboard/new" className="btn-primary inline-flex mt-4 gap-2 items-center">
                            <PlusCircle className="w-4 h-4" />
                            New Escrow
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {transactions.map((tx) => {
                            const badge = STATUS_BADGE[tx.status];
                            const isBuyer = tx.buyer_name === user?.fullName || tx.buyer_name === user?.primaryEmailAddress?.emailAddress;
                            const counterparty = isBuyer ? tx.seller_name : tx.buyer_name;
                            return (
                                <Link
                                    key={tx.id}
                                    href={`/dashboard/${tx.id}`}
                                    className="card px-5 py-4 flex items-center gap-4 hover:border-navy-500 hover:bg-navy-600/30 transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-navy-800 flex items-center justify-center flex-shrink-0">
                                        <ShieldCheck className="w-5 h-5 text-slate-500 group-hover:text-success-400 transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-100 text-sm truncate">{tx.title}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {isBuyer ? "You → " : ""}
                                            {counterparty}
                                            {!isBuyer ? " → You" : ""}
                                            {" · "}{timeAgo(tx.created_at)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <p className="text-sm font-bold text-slate-100">{formatKsh(tx.amount)}</p>
                                        <span className={`badge ${badge.className}`}>{badge.label}</span>
                                        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
