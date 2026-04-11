"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldCheck, Truck, Banknote, AlertTriangle, Check } from "lucide-react";
import api from "@/lib/api";
import { Transaction, Dispute } from "@/types";
import { useUser } from "@clerk/nextjs";
import TransactionStepper from "@/components/TransactionStepper";
import SecureDepositModal from "@/components/SecureDepositModal";
import EvidenceLocker from "@/components/EvidenceLocker";
import EscrowChat from "@/components/EscrowChat";

const formatKsh = (n: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

export default function TransactionDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { user, isLoaded } = useUser();

    const [tx, setTx] = useState<Transaction | null>(null);
    const [dispute, setDispute] = useState<Dispute | null>(null);
    const [loading, setLoading] = useState(true);
    const [showDeposit, setShowDeposit] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [disputeReason, setDisputeReason] = useState("");
    const [showDisputeForm, setShowDisputeForm] = useState(false);
    const [showCancelForm, setShowCancelForm] = useState(false);
    const [cancelReason, setCancelReason] = useState("");

    const load = async () => {
        try {
            const { data } = await api.get(`/transactions/${id}`);
            setTx(data);
        } catch {
            router.push("/dashboard");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [id]);

    const confirmDelivery = async () => {
        setActionLoading(true);
        await api.post(`/transactions/${id}/confirm-delivery`);
        await load();
        setActionLoading(false);
    };

    const releaseFunds = async () => {
        setActionLoading(true);
        await api.post(`/transactions/${id}/release`);
        await load();
        setActionLoading(false);
    };

    const openDispute = async () => {
        if (!disputeReason.trim()) return;
        setActionLoading(true);
        try {
            const { data } = await api.post(`/disputes/`, { transaction_id: id, reason: disputeReason });
            setDispute(data);
            setShowDisputeForm(false);
            await load();
        } finally {
            setActionLoading(false);
        }
    };

    const cancelEscrow = async () => {
        if (!cancelReason.trim()) return;
        setActionLoading(true);
        try {
            await api.post(`/transactions/${id}/cancel`, { reason: cancelReason });
            setShowCancelForm(false);
            await load();
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full py-32">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
        );
    }

    if (!tx || !isLoaded) return null;

    const isBuyer = tx.buyer_name === user?.fullName || tx.buyer_name === user?.primaryEmailAddress?.emailAddress;
    const isSeller = tx.seller_name === user?.fullName || tx.seller_name === user?.primaryEmailAddress?.emailAddress;
    const canPay = isBuyer && tx.status === "CREATED";
    const canShip = isSeller && tx.status === "FUNDED";
    const canConfirmDelivery = isBuyer && tx.status === "SHIPPED";
    const canRelease = isBuyer && tx.status === "DELIVERED";
    const canDispute = (isBuyer || isSeller) && ["FUNDED", "SHIPPED", "DELIVERED"].includes(tx.status);
    const canCancel = isBuyer && ["CREATED", "FUNDED"].includes(tx.status);

    const markShipped = async () => {
        setActionLoading(true);
        await api.post(`/transactions/${id}/mark-shipped`);
        await load();
        setActionLoading(false);
    };

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-7">
                <ArrowLeft className="w-4 h-4" />
                Back to dashboard
            </Link>

            <div className="card p-6 mb-5">
                <div className="flex items-start justify-between mb-5">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">{tx.title}</h1>
                        {tx.description && <p className="text-sm text-gray-500 mt-1">{tx.description}</p>}
                    </div>
                    <p className="text-2xl font-bold text-emerald-600 flex-shrink-0 ml-4">{formatKsh(tx.amount)}</p>
                </div>

                <TransactionStepper status={tx.status} />

                <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-gray-100">
                    <div>
                        <p className="text-xs text-gray-400 mb-1">Buyer</p>
                        <p className="text-sm font-medium text-gray-800">{tx.buyer_name} {isBuyer ? "(You)" : ""}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 mb-1">Seller</p>
                        <p className="text-sm font-medium text-gray-800">{tx.seller_name} {!isBuyer ? "(You)" : ""}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 mb-1">Created</p>
                        <p className="text-sm text-gray-600">{new Date(tx.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 mb-1">Last updated</p>
                        <p className="text-sm text-gray-600">{new Date(tx.updated_at).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}</p>
                    </div>
                </div>

                {tx.status === "CANCELLED" && tx.cancellation_reason && (
                    <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-xl">
                        <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">Cancellation Reason</p>
                        <p className="text-sm text-gray-700">{tx.cancellation_reason}</p>
                    </div>
                )}
            </div>

            {(canPay || canShip || canConfirmDelivery || canRelease || canDispute || canCancel) && (
                <div className="card p-5 mb-5 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Actions</p>

                    {canPay && (
                        <button id="pay-now-btn" onClick={() => setShowDeposit(true)} className="btn-primary w-full flex items-center justify-center gap-2">
                            <Banknote className="w-4 h-4" />
                            Pay {formatKsh(tx.amount)} via M-Pesa
                        </button>
                    )}

                    {canShip && (
                        <button id="mark-shipped-btn" onClick={markShipped} disabled={actionLoading} className="btn-secondary w-full flex items-center justify-center gap-2">
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                            Mark as Shipped
                        </button>
                    )}

                    {canConfirmDelivery && (
                        <button id="confirm-delivery-btn" onClick={confirmDelivery} disabled={actionLoading} className="btn-secondary w-full flex items-center justify-center gap-2">
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Confirm I received the goods / service
                        </button>
                    )}

                    {canRelease && (
                        <button id="release-btn" onClick={releaseFunds} disabled={actionLoading} className="btn-primary w-full flex items-center justify-center gap-2">
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                            Release funds to seller
                        </button>
                    )}

                    {canDispute && !showDisputeForm && (
                        <button id="dispute-btn" onClick={() => setShowDisputeForm(true)} className="btn-danger w-full flex items-center justify-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Raise a Dispute
                        </button>
                    )}

                    {showDisputeForm && (
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                            <label className="label">Reason for dispute</label>
                            <textarea
                                className="input-field resize-none"
                                rows={3}
                                placeholder="e.g. Item received is not as described — seller sent a used laptop instead of brand new."
                                value={disputeReason}
                                onChange={(e) => setDisputeReason(e.target.value)}
                            />
                            <div className="flex gap-3">
                                <button onClick={openDispute} disabled={actionLoading || !disputeReason.trim()} className="btn-danger flex items-center gap-2">
                                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Submit Dispute
                                </button>
                                <button onClick={() => setShowDisputeForm(false)} className="btn-secondary">Cancel</button>
                            </div>
                        </div>
                    )}

                    {canCancel && !showCancelForm && (
                        <button id="cancel-btn" onClick={() => setShowCancelForm(true)} className="w-full mt-4 text-sm text-red-500 hover:text-red-600 border border-red-200 hover:bg-red-50 rounded-lg py-2.5 transition-colors">
                            Cancel Escrow
                        </button>
                    )}

                    {showCancelForm && (
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                            <label className="label">Reason for cancellation</label>
                            <textarea
                                className="input-field resize-none"
                                rows={3}
                                placeholder="e.g. The seller and I decided to handle this outside the platform or I no longer need the item."
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                            />
                            <div className="flex gap-3">
                                <button onClick={cancelEscrow} disabled={actionLoading || !cancelReason.trim()} className="btn-danger flex items-center gap-2">
                                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Confirm Cancellation
                                </button>
                                <button onClick={() => setShowCancelForm(false)} className="btn-secondary">Back</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {tx.status === "DISPUTED" && dispute && (
                <div className="card p-5 mb-5">
                    <EvidenceLocker disputeId={dispute.id} />
                </div>
            )}

            {tx.status === "RELEASED" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-3 mb-5">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-emerald-700">Funds Released</p>
                        <p className="text-xs text-gray-500 mt-0.5">Payment sent to seller via M-Pesa. This deal is complete.</p>
                    </div>
                </div>
            )}

            {showDeposit && (
                <SecureDepositModal
                    transaction={tx}
                    onClose={() => setShowDeposit(false)}
                    onSuccess={() => { setShowDeposit(false); load(); }}
                />
            )}

            <EscrowChat transactionId={tx.id} />
        </div>
    );
}
