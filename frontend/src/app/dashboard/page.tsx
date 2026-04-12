"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, ArrowRight, ShieldCheck, Clock, TrendingUp, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Transaction, TransactionStatus } from "@/types";
import { useUser } from "@clerk/nextjs";

const STATUS_BADGE: Record<TransactionStatus, { label: string; className: string }> = {
    CREATED: { label: "Created", className: "bg-gray-100 text-gray-600" },
    FUNDED: { label: "Funded", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    SHIPPED: { label: "Shipped", className: "bg-blue-50 text-blue-700 border border-blue-200" },
    DELIVERED: { label: "Delivered", className: "bg-blue-50 text-blue-700 border border-blue-200" },
    RELEASED: { label: "Released", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    DISPUTED: { label: "Disputed", className: "bg-red-50 text-red-700 border border-red-200" },
    REFUNDED: { label: "Refunded", className: "bg-gray-100 text-gray-600" },
    CANCELLED: { label: "Cancelled", className: "bg-red-50 text-red-600 border border-red-200" },
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

const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
};

export default function DashboardPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const { user, isLoaded } = useUser();

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
                    <h1 className="text-2xl font-bold text-gray-900">
                        {getGreeting()}{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Your escrow overview</p>
                </div>
                <Link href="/dashboard/new" className="btn-primary flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" />
                    New Escrow
                </Link>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                    { label: "In Escrow", value: formatKsh(totalInEscrow), icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Active Deals", value: String(active.length), icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "Total Deals", value: String(transactions.length), icon: Clock, color: "text-gray-500", bg: "bg-gray-100" },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="card px-5 py-4">
                        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                            <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{label}</p>
                        <p className="text-2xl font-bold text-gray-900">{value}</p>
                    </div>
                ))}
            </div>

            <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                    Transaction Timeline
                </h2>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="card px-6 py-12 text-center">
                        <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-700 font-medium">No escrows yet</p>
                        <p className="text-sm text-gray-400 mt-1">Create your first deal to start transacting safely</p>
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
                                    className="card px-5 py-4 flex items-center gap-4 hover:border-gray-300 hover:shadow-md transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
                                        <ShieldCheck className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm truncate">{tx.title}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {isBuyer ? "You → " : ""}
                                            {counterparty}
                                            {!isBuyer ? " → You" : ""}
                                            {" · "}{timeAgo(tx.created_at)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <p className="text-sm font-bold text-gray-900">{formatKsh(tx.amount)}</p>
                                        <span className={`badge ${badge.className}`}>{badge.label}</span>
                                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
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
