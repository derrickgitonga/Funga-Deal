"use client";
import { useEffect, useState, useCallback } from "react";
import {
    ShieldAlert,
    MessageSquarePlus,
    UserX,
    BadgeX,
    Loader2,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    Search,
} from "lucide-react";

interface EscrowSummary {
    id: string;
    buyer_id: string;
    seller_id: string;
    title: string;
    amount: number;
    currency: string;
    status: string;
}

type ModalState =
    | { type: "intervene"; escrowId: string; title: string }
    | { type: "message"; escrowId: string; title: string }
    | { type: "deactivate"; userId: string }
    | { type: "revoke"; userId: string }
    | null;

const STATUS_COLOR: Record<string, string> = {
    in_dispute: "bg-red-50 text-red-700 border-red-200",
    under_review: "bg-amber-50 text-amber-700 border-amber-200",
    deposited: "bg-blue-50 text-blue-700 border-blue-200",
    pending_confirmation: "bg-gray-100 text-gray-600 border-gray-200",
    release_queued: "bg-purple-50 text-purple-700 border-purple-200",
    payout_pending: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const formatKsh = (n: number, currency: string) =>
    new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: currency.toUpperCase() === "KES" ? "KES" : "USD",
        maximumFractionDigits: 0,
    }).format(n);

export default function ModeratorPage() {
    const [escrows, setEscrows] = useState<EscrowSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [modal, setModal] = useState<ModalState>(null);
    const [input, setInput] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [userIdInput, setUserIdInput] = useState("");

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    };

    const loadEscrows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/vault/mod/transactions");
            if (!res.ok) throw new Error();
            setEscrows(await res.json());
        } catch {
            setError("Failed to load escrows.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadEscrows(); }, [loadEscrows]);

    const closeModal = () => { setModal(null); setInput(""); };

    const submit = async () => {
        if (!modal) return;
        setSubmitting(true);
        try {
            let res: Response;

            if (modal.type === "intervene") {
                if (!input.trim()) { setSubmitting(false); return; }
                res = await fetch(`/api/vault/mod/transaction/${modal.escrowId}/intervene`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason: input }),
                });
            } else if (modal.type === "message") {
                if (!input.trim()) { setSubmitting(false); return; }
                res = await fetch(`/api/vault/mod/transaction/${modal.escrowId}/message`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ body: input }),
                });
            } else if (modal.type === "deactivate") {
                res = await fetch(`/api/vault/mod/user/${modal.userId}/deactivate`, { method: "POST" });
            } else {
                res = await fetch(`/api/vault/mod/user/${modal.userId}/revoke-seller`, { method: "POST" });
            }

            if (!res.ok) {
                const msg = res.status === 404
                    ? "User not found."
                    : res.status === 409
                    ? "Invalid escrow state for this action."
                    : "Action failed.";
                showToast(msg);
            } else {
                const labels: Record<string, string> = {
                    intervene: "Escrow marked as under review.",
                    message: "System message injected.",
                    deactivate: "User deactivated.",
                    revoke: "Seller privilege revoked.",
                };
                showToast(labels[modal.type]);
                closeModal();
                if (modal.type === "intervene" || modal.type === "message") loadEscrows();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const openUserAction = (type: "deactivate" | "revoke") => {
        const id = userIdInput.trim();
        if (!id) return;
        setModal({ type, userId: id });
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Moderator Console</h1>
                    <p className="text-xs text-gray-500">Dispute intervention and user management</p>
                </div>
            </div>

            <div className="card p-5 mb-8">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                    User Actions
                </h2>
                <div className="flex gap-3 items-center">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={userIdInput}
                            onChange={(e) => setUserIdInput(e.target.value)}
                            placeholder="Clerk User ID"
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                    </div>
                    <button
                        onClick={() => openUserAction("deactivate")}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    >
                        <UserX className="w-4 h-4" />
                        Deactivate
                    </button>
                    <button
                        onClick={() => openUserAction("revoke")}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                    >
                        <BadgeX className="w-4 h-4" />
                        Revoke Seller
                    </button>
                </div>
            </div>

            <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                    Active & Disputed Escrows
                </h2>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                    </div>
                ) : error ? (
                    <div className="card px-6 py-12 text-center">
                        <ShieldAlert className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">{error}</p>
                    </div>
                ) : escrows.length === 0 ? (
                    <div className="card px-6 py-12 text-center">
                        <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No active escrows requiring attention</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {escrows.map((e) => {
                            const colorClass = STATUS_COLOR[e.status] ?? "bg-gray-100 text-gray-600 border-gray-200";
                            const isExpanded = expanded === e.id;
                            return (
                                <div key={e.id} className="card overflow-hidden">
                                    <button
                                        onClick={() => setExpanded(isExpanded ? null : e.id)}
                                        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
                                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                                                {e.buyer_id} → {e.seller_id}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            <p className="text-sm font-bold text-gray-900">
                                                {formatKsh(e.amount, e.currency)}
                                            </p>
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colorClass}`}>
                                                {e.status.replace(/_/g, " ")}
                                            </span>
                                            {isExpanded
                                                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                                                : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 flex gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-gray-400 font-mono truncate">ID: {e.id}</p>
                                            </div>
                                            <button
                                                onClick={() => setModal({ type: "intervene", escrowId: e.id, title: e.title })}
                                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                                            >
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                                Intervene
                                            </button>
                                            <button
                                                onClick={() => setModal({ type: "message", escrowId: e.id, title: e.title })}
                                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                                            >
                                                <MessageSquarePlus className="w-3.5 h-3.5" />
                                                Inject Message
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {modal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        {modal.type === "intervene" && (
                            <>
                                <h3 className="text-base font-bold text-gray-900 mb-1">Intervene in Escrow</h3>
                                <p className="text-xs text-gray-400 mb-4 truncate">"{modal.title}"</p>
                                <textarea
                                    autoFocus
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Reason for intervention..."
                                    rows={4}
                                    maxLength={1000}
                                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 mb-4"
                                />
                            </>
                        )}

                        {modal.type === "message" && (
                            <>
                                <h3 className="text-base font-bold text-gray-900 mb-1">Inject System Message</h3>
                                <p className="text-xs text-gray-400 mb-4 truncate">"{modal.title}"</p>
                                <textarea
                                    autoFocus
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="System message visible to both parties..."
                                    rows={4}
                                    maxLength={2000}
                                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-4"
                                />
                            </>
                        )}

                        {modal.type === "deactivate" && (
                            <>
                                <h3 className="text-base font-bold text-gray-900 mb-2">Deactivate User</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    This will set <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{modal.userId}</span> as inactive. They will lose access immediately.
                                </p>
                            </>
                        )}

                        {modal.type === "revoke" && (
                            <>
                                <h3 className="text-base font-bold text-gray-900 mb-2">Revoke Seller Privilege</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{modal.userId}</span> will no longer be able to act as a seller.
                                </p>
                            </>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={closeModal}
                                disabled={submitting}
                                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submit}
                                disabled={submitting || ((modal.type === "intervene" || modal.type === "message") && !input.trim())}
                                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                            >
                                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg z-50 animate-fade-in">
                    {toast}
                </div>
            )}
        </div>
    );
}
