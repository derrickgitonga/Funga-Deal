"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
    ShieldCheck, Bitcoin, Smartphone, Loader2, CheckCircle,
    ExternalLink, Package, AlertCircle, User,
} from "lucide-react";
import publicApi from "@/lib/public-api";

interface LinkDetails {
    id: string;
    title: string;
    description?: string;
    price: number;
    currency: string;
    delivery_method: string;
    seller_name?: string;
    status: string;
}

type PayMethod = "crypto" | "mpesa";
type Step = "idle" | "loading" | "crypto-ready" | "mpesa-sent" | "error";

function PayPageContent() {
    const { id } = useParams<{ id: string }>();
    const searchParams = useSearchParams();

    const [link, setLink] = useState<LinkDetails | null>(null);
    const [fetchError, setFetchError] = useState("");
    const [method, setMethod] = useState<PayMethod>("crypto");
    const [buyerName, setBuyerName] = useState("");
    const [buyerEmail, setBuyerEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [step, setStep] = useState<Step>("idle");
    const [invoiceUrl, setInvoiceUrl] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    const returnStatus = searchParams.get("status");

    useEffect(() => {
        if (!id) return;
        publicApi.get(`/vault/payment-links/${id}`)
            .then(({ data }) => setLink(data))
            .catch(() => setFetchError("This payment link is invalid or has expired."));
    }, [id]);

    const formatPrice = (amount: number, currency: string) => {
        try {
            return new Intl.NumberFormat("en-KE", {
                style: "currency",
                currency: currency.toUpperCase(),
                maximumFractionDigits: 0,
            }).format(amount);
        } catch {
            return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
        }
    };

    const handleCryptoPay = async () => {
        setStep("loading");
        setErrorMsg("");
        try {
            const { data } = await publicApi.post(`/vault/payment-links/${id}/pay/crypto`, {
                buyer_name: buyerName || undefined,
                buyer_email: buyerEmail || undefined,
            });
            setInvoiceUrl(data.invoice_url);
            setStep("crypto-ready");
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setErrorMsg(msg || "Failed to create invoice. Please try again.");
            setStep("error");
        }
    };

    const handleMpesaPay = async (e: React.FormEvent) => {
        e.preventDefault();
        setStep("loading");
        setErrorMsg("");
        try {
            await publicApi.post(`/vault/payment-links/${id}/pay/mpesa`, {
                phone_number: phone.replace(/\s+/g, ""),
                buyer_name: buyerName || undefined,
                buyer_email: buyerEmail || undefined,
            });
            setStep("mpesa-sent");
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setErrorMsg(msg || "M-Pesa request failed. Please try again.");
            setStep("error");
        }
    };

    if (returnStatus === "success") {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Payment Received</h1>
                    <p className="text-sm text-gray-500">Your crypto payment is confirmed. The seller has been notified and will fulfil your order.</p>
                </div>
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
                    <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                    <p className="text-gray-700 font-medium">{fetchError}</p>
                </div>
            </div>
        );
    }

    if (!link) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12" suppressHydrationWarning>
            <div className="w-full max-w-lg">
                <div className="flex items-center justify-center gap-2 mb-8">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Funga Deal — Secure Checkout</span>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <p className="text-2xl font-bold text-emerald-600 mb-1">
                            {formatPrice(link.price, link.currency)}
                        </p>
                        <h1 className="text-lg font-bold text-gray-900 mb-1">{link.title}</h1>
                        {link.description && (
                            <p className="text-sm text-gray-500 mb-3">{link.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                                <Package className="w-3.5 h-3.5" />
                                {link.delivery_method}
                            </span>
                            {link.seller_name && (
                                <span className="flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" />
                                    {link.seller_name}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="p-6">
                        {step === "crypto-ready" ? (
                            <div className="text-center py-4">
                                <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-4">
                                    <Bitcoin className="w-7 h-7 text-orange-500" />
                                </div>
                                <p className="font-bold text-gray-900 mb-1">Invoice Created</p>
                                <p className="text-sm text-gray-500 mb-6">Choose your preferred cryptocurrency and complete payment on the NOWPayments page.</p>
                                <a
                                    href={invoiceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors"
                                >
                                    Open Payment Page
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                                <button
                                    onClick={() => setStep("idle")}
                                    className="block mx-auto mt-3 text-sm text-gray-400 hover:text-gray-600"
                                >
                                    Go back
                                </button>
                            </div>
                        ) : step === "mpesa-sent" ? (
                            <div className="text-center py-4">
                                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                                    <Smartphone className="w-7 h-7 text-emerald-600" />
                                </div>
                                <p className="font-bold text-gray-900 mb-1">STK Push Sent</p>
                                <p className="text-sm text-gray-500">Check your phone for the M-Pesa prompt and enter your PIN to complete payment.</p>
                            </div>
                        ) : (
                            <>
                                <div className="mb-5 space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Your name <span className="text-gray-300">(optional)</span></label>
                                        <input
                                            type="text"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                            placeholder="e.g. John Kamau"
                                            value={buyerName}
                                            onChange={(e) => setBuyerName(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Email <span className="text-gray-300">(optional, for receipt)</span></label>
                                        <input
                                            type="email"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                            placeholder="you@example.com"
                                            value={buyerEmail}
                                            onChange={(e) => setBuyerEmail(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2 mb-5">
                                    <button
                                        onClick={() => { setMethod("crypto"); setErrorMsg(""); }}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                                            method === "crypto"
                                                ? "bg-orange-500 text-white border-orange-500"
                                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                                        }`}
                                    >
                                        <Bitcoin className="w-4 h-4" />
                                        Crypto
                                    </button>
                                    <button
                                        onClick={() => { setMethod("mpesa"); setErrorMsg(""); }}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                                            method === "mpesa"
                                                ? "bg-emerald-600 text-white border-emerald-600"
                                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                                        }`}
                                    >
                                        <Smartphone className="w-4 h-4" />
                                        M-Pesa
                                    </button>
                                </div>

                                {step === "error" && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 mb-4">
                                        {errorMsg}
                                    </div>
                                )}

                                {method === "crypto" ? (
                                    <div className="space-y-4">
                                        <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3 text-xs text-gray-600">
                                            <p className="font-semibold text-gray-700 mb-1">200+ cryptocurrencies accepted</p>
                                            <p>BTC, ETH, USDT, USDC, SOL, BNB and more — choose on the next page. No Funga Deal account needed.</p>
                                        </div>
                                        <button
                                            onClick={handleCryptoPay}
                                            disabled={step === "loading"}
                                            className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60"
                                        >
                                            {step === "loading" ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Creating invoice...</>
                                            ) : (
                                                <><Bitcoin className="w-4 h-4" /> Pay {formatPrice(link.price, link.currency)} with Crypto</>
                                            )}
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleMpesaPay} className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">M-Pesa phone number</label>
                                            <div className="relative">
                                                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="tel"
                                                    className="w-full pl-9 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                                    placeholder="0712 345 678"
                                                    value={phone}
                                                    onChange={(e) => setPhone(e.target.value)}
                                                    required
                                                    disabled={step === "loading"}
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={step === "loading"}
                                            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60"
                                        >
                                            {step === "loading" ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Sending request...</>
                                            ) : (
                                                <><Smartphone className="w-4 h-4" /> Pay {formatPrice(link.price, link.currency)} via M-Pesa</>
                                            )}
                                        </button>
                                    </form>
                                )}

                                <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                    Secured by Funga Deal · No account required
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PayPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
        }>
            <PayPageContent />
        </Suspense>
    );
}
