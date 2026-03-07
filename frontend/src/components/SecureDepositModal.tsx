"use client";
import { useState } from "react";
import { X, Smartphone, ShieldCheck, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Transaction } from "@/types";

interface Props {
    transaction: Transaction;
    onClose: () => void;
    onSuccess: () => void;
}

export default function SecureDepositModal({ transaction, onClose, onSuccess }: Props) {
    const [phone, setPhone] = useState("");
    const [step, setStep] = useState<"input" | "pending" | "done">("input");
    const [error, setError] = useState("");

    const formatKsh = (n: number) =>
        new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

    const handlePay = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setStep("pending");
        try {
            await api.post(`/transactions/${transaction.id}/initiate-payment`, {
                transaction_id: transaction.id,
                phone_number: phone.replace(/\s+/g, ""),
            });
            setStep("done");
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2500);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(msg || "Failed to initiate payment. Try again.");
            setStep("input");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="card w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-5 border-b border-navy-600">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-success-500/15 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4 text-success-400" />
                        </div>
                        <h2 className="text-base font-bold text-slate-100">Secure M-Pesa Deposit</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-6">
                    {step === "done" ? (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 rounded-full bg-success-500/15 flex items-center justify-center mx-auto mb-4">
                                <ShieldCheck className="w-8 h-8 text-success-500" />
                            </div>
                            <p className="text-lg font-bold text-slate-100 mb-1">STK Push Sent!</p>
                            <p className="text-sm text-slate-400">Check your M-Pesa prompt on {phone} and enter your PIN to complete the deposit.</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-navy-800 rounded-xl p-4 mb-6 border border-navy-600">
                                <p className="text-xs text-slate-500 mb-1">Amount to deposit</p>
                                <p className="text-2xl font-bold text-success-400">{formatKsh(transaction.amount)}</p>
                                <p className="text-xs text-slate-500 mt-1 truncate">{transaction.title}</p>
                            </div>

                            <form onSubmit={handlePay} className="space-y-5">
                                <div>
                                    <label className="label">M-Pesa phone number</label>
                                    <div className="relative">
                                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input
                                            id="mpesa-phone"
                                            type="tel"
                                            className="input-field pl-10"
                                            placeholder="0712 345 678"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            required
                                            disabled={step === "pending"}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-600 mt-1.5">
                                        A payment prompt will appear on this number
                                    </p>
                                </div>

                                {error && (
                                    <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-400">
                                        {error}
                                    </div>
                                )}

                                <div className="bg-navy-800 rounded-lg px-4 py-3 text-xs text-slate-500 border border-navy-600">
                                    <p className="font-medium text-slate-400 mb-1">How it works</p>
                                    <ol className="space-y-0.5 list-decimal list-inside">
                                        <li>We send an STK Push to your M-Pesa number</li>
                                        <li>Enter your M-Pesa PIN to confirm</li>
                                        <li>Funds are held securely in escrow</li>
                                        <li>Released to seller only after you confirm delivery</li>
                                    </ol>
                                </div>

                                <button
                                    id="deposit-btn"
                                    type="submit"
                                    className="btn-primary w-full flex items-center justify-center gap-2"
                                    disabled={step === "pending"}
                                >
                                    {step === "pending" && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {step === "pending" ? "Sending request..." : `Pay ${formatKsh(transaction.amount)} via M-Pesa`}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
