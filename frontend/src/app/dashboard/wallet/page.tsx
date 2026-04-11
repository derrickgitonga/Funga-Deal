"use client";
import { useEffect, useState } from "react";
import { Wallet, ArrowDownLeft, ArrowUpRight, ShieldCheck, Loader2, TrendingUp } from "lucide-react";
import api from "@/lib/api";
import { WalletBalance, Transaction, TransactionStatus } from "@/types";
import { useUser } from "@clerk/nextjs";

const formatKsh = (n: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

const STATUS_COLOR: Record<TransactionStatus, string> = {
    CREATED: "text-gray-500",
    FUNDED: "text-blue-600",
    SHIPPED: "text-blue-600",
    DELIVERED: "text-blue-600",
    RELEASED: "text-emerald-600",
    DISPUTED: "text-red-600",
    REFUNDED: "text-gray-500",
    CANCELLED: "text-red-500",
};

export default function WalletPage() {
    const { user } = useUser();
    const [balance, setBalance] = useState<WalletBalance | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api.get("/wallet/balance"),
            api.get("/wallet/transactions"),
        ]).then(([balRes, txRes]) => {
            setBalance(balRes.data);
            setTransactions(txRes.data);
        }).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full py-32">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Wallet</h1>
                    <p className="text-xs text-gray-500">Your escrow balances and transaction history</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                    { label: "In Escrow", value: formatKsh(balance?.escrow_held ?? 0), icon: ShieldCheck, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "Total Earned", value: formatKsh(balance?.total_earned ?? 0), icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Total Spent", value: formatKsh(balance?.total_spent ?? 0), icon: Wallet, color: "text-gray-500", bg: "bg-gray-100" },
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

            <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                    Recent Transactions
                </h2>

                {transactions.length === 0 ? (
                    <div className="card px-6 py-12 text-center">
                        <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No transactions yet</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {transactions.map((tx) => {
                            const isBuyer = tx.buyer_name === user?.fullName || tx.buyer_name === user?.primaryEmailAddress?.emailAddress;
                            const isOutgoing = isBuyer;
                            return (
                                <div key={tx.id} className="card px-5 py-4 flex items-center gap-4">
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isOutgoing ? "bg-red-50" : "bg-emerald-50"}`}>
                                        {isOutgoing
                                            ? <ArrowUpRight className="w-4 h-4 text-red-500" />
                                            : <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                                        }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 text-sm truncate">{tx.title}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {isOutgoing ? `To ${tx.seller_name}` : `From ${tx.buyer_name}`}
                                        </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className={`text-sm font-bold ${isOutgoing ? "text-red-500" : "text-emerald-600"}`}>
                                            {isOutgoing ? "-" : "+"}{formatKsh(tx.amount)}
                                        </p>
                                        <p className={`text-xs mt-0.5 ${STATUS_COLOR[tx.status]}`}>{tx.status}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
