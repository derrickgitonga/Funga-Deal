"use client";
import { useState } from "react";
import { X, Smartphone, ShieldCheck, Loader2, Bitcoin, ExternalLink } from "lucide-react";
import api from "@/lib/api";
import { Transaction } from "@/types";

interface Props {
    transaction: Transaction;
    onClose: () => void;
    onSuccess: () => void;
}

type PaymentMethod = "mpesa" | "crypto";
type Step = "input" | "pending" | "done";

export default function SecureDepositModal({ transaction, onClose, onSuccess }: Props) {
    const [method, setMethod] = useState<PaymentMethod>("mpesa");
    const [phone, setPhone] = useState("");
    const [step, setStep] = useState<Step>("input");
    const [error, setError] = useState("");
    const [cryptoUrl, setCryptoUrl] = useState("");

    const formatKsh = (n: number) =>
        new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

    const handleMpesa = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setStep("pending");
        try {
            await api.post(`/vault/payments/${transaction.id}/initiate`, {
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

    const handleCrypto = async () => {
        setError("");
        setStep("pending");
        try {
            const { data } = await api.post(`/vault/crypto-payments/${transaction.id}/initiate`);
            setCryptoUrl(data.invoice_url);
            setStep("done");
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(msg || "Failed to create crypto invoice. Try again.");
            setStep("input");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-200">
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        </div>
                        <h2 className="text-base font-bold text-gray-900">Secure Deposit</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-6">
                    {step === "done" && method === "mpesa" ? (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                                <ShieldCheck className="w-8 h-8 text-emerald-600" />
                            </div>
                            <p className="text-lg font-bold text-gray-900 mb-1">STK Push Sent!</p>
                            <p className="text-sm text-gray-500">Check your M-Pesa prompt on {phone} and enter your PIN to complete the deposit.</p>
                        </div>
                    ) : step === "done" && method === "crypto" ? (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-4">
                                <Bitcoin className="w-8 h-8 text-orange-500" />
                            </div>
                            <p className="text-lg font-bold text-gray-900 mb-2">Invoice Ready</p>
                            <p className="text-sm text-gray-500 mb-6">Complete your payment on the NOWPayments page. Funds will be held in escrow automatically.</p>
                            <a
                                href={cryptoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-primary inline-flex items-center gap-2"
                            >
                                Pay with Crypto
                                <ExternalLink className="w-4 h-4" />
                            </a>
                            <button onClick={onClose} className="block mx-auto mt-3 text-sm text-gray-400 hover:text-gray-600">
                                Close
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
                                <p className="text-xs text-gray-400 mb-1">Amount to deposit</p>
                                <p className="text-2xl font-bold text-emerald-600">{formatKsh(transaction.amount)}</p>
                                <p className="text-xs text-gray-400 mt-1 truncate">{transaction.title}</p>
                            </div>

                            <div className="flex gap-2 mb-6">
                                <button
                                    onClick={() => { setMethod("mpesa"); setError(""); }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                                        method === "mpesa"
                                            ? "bg-emerald-600 text-white border-emerald-600"
                                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                                    }`}
                                >
                                    <Smartphone className="w-4 h-4" />
                                    M-Pesa
                                </button>
                                <button
                                    onClick={() => { setMethod("crypto"); setError(""); }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                                        method === "crypto"
                                            ? "bg-orange-500 text-white border-orange-500"
                                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                                    }`}
                                >
                                    <Bitcoin className="w-4 h-4" />
                                    Crypto
                                </button>
                            </div>

                            {method === "mpesa" ? (
                                <form onSubmit={handleMpesa} className="space-y-5">
                                    <div>
                                        <label className="label">M-Pesa phone number</label>
                                        <div className="relative">
                                            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="tel"
                                                className="input-field pl-10"
                                                placeholder="0712 345 678"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                required
                                                disabled={step === "pending"}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1.5">A payment prompt will appear on this number</p>
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>
                                    )}

                                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 text-xs text-gray-600">
                                        <p className="font-semibold text-gray-700 mb-1">How it works</p>
                                        <ol className="space-y-0.5 list-decimal list-inside">
                                            <li>We send an STK Push to your M-Pesa number</li>
                                            <li>Enter your M-Pesa PIN to confirm</li>
                                            <li>Funds are held securely in escrow</li>
                                            <li>Released to seller only after you confirm delivery</li>
                                        </ol>
                                    </div>

                                    <button
                                        type="submit"
                                        className="btn-primary w-full flex items-center justify-center gap-2"
                                        disabled={step === "pending"}
                                    >
                                        {step === "pending" && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {step === "pending" ? "Sending request..." : `Pay ${formatKsh(transaction.amount)} via M-Pesa`}
                                    </button>
                                </form>
                            ) : (
                                <div className="space-y-5">
                                    <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3 text-xs text-gray-600">
                                        <p className="font-semibold text-gray-700 mb-1">Pay with any cryptocurrency</p>
                                        <ol className="space-y-0.5 list-decimal list-inside">
                                            <li>Click the button below to open the payment page</li>
                                            <li>Choose your preferred crypto (BTC, ETH, USDT and 200+ more)</li>
                                            <li>Send the exact amount shown to the address</li>
                                            <li>Funds are automatically held in escrow on confirmation</li>
                                        </ol>
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>
                                    )}

                                    <button
                                        onClick={handleCrypto}
                                        disabled={step === "pending"}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                                    >
                                        {step === "pending" ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Creating invoice...
                                            </>
                                        ) : (
                                            <>
                                                <Bitcoin className="w-4 h-4" />
                                                Pay with Crypto
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
