"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import {
    ShieldCheck, LogOut, AlertTriangle, CheckCircle2, Loader2,
    ArrowLeft, Search, Send, UserX, BadgeX, RefreshCw, X,
    Package, XCircle, Flag, BadgeCheck, ChevronRight,
    TrendingUp, Lock, Scale, DollarSign, Zap, Clock, User,
} from "lucide-react";

interface ModStats {
    total: number;
    by_status: Record<string, number>;
    total_volume: number;
    escrow_held: number;
    open_disputes: number;
    total_fees_earned: number;
}

interface Tx {
    id: string;
    title: string;
    description: string | null;
    amount: number;
    status: string;
    buyer_id: string;
    seller_id: string;
    buyer_name: string | null;
    seller_name: string | null;
    buyer_email: string | null;
    seller_email: string | null;
    cancellation_reason: string | null;
    has_open_dispute: boolean;
    dispute_reason: string | null;
    created_at: string;
    updated_at: string;
}

interface ChatMsg {
    id: string;
    sender_id: string;
    sender_name: string | null;
    body: string;
    created_at: string;
}

type Category = "active" | "disputed" | "completed" | "cancelled";
type View = "home" | "list" | "detail";

const TERMINAL = new Set(["RELEASED", "REFUNDED", "CANCELLED"]);
const ACTIVE_STATUSES = new Set(["CREATED", "FUNDED", "SHIPPED", "DELIVERED"]);

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
    CREATED:   { label: "Created",   dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-600 ring-slate-200" },
    FUNDED:    { label: "Funded",    dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 ring-blue-100" },
    SHIPPED:   { label: "Shipped",   dot: "bg-violet-500",  badge: "bg-violet-50 text-violet-700 ring-violet-100" },
    DELIVERED: { label: "Delivered", dot: "bg-indigo-500",  badge: "bg-indigo-50 text-indigo-700 ring-indigo-100" },
    DISPUTED:  { label: "Disputed",  dot: "bg-red-500",     badge: "bg-red-50 text-red-700 ring-red-100" },
    RELEASED:  { label: "Released",  dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    REFUNDED:  { label: "Refunded",  dot: "bg-teal-500",    badge: "bg-teal-50 text-teal-700 ring-teal-100" },
    CANCELLED: { label: "Cancelled", dot: "bg-gray-300",    badge: "bg-gray-100 text-gray-500 ring-gray-200" },
};

const OVERRIDES: Record<string, { label: string; status: string; variant: "danger" | "warning" | "success" | "neutral" }[]> = {
    CREATED:   [
        { label: "Force Fund",     status: "FUNDED",    variant: "success" },
        { label: "Force Cancel",   status: "CANCELLED", variant: "danger" },
    ],
    FUNDED:    [
        { label: "Mark Shipped",   status: "SHIPPED",   variant: "neutral" },
        { label: "Force Refund",   status: "REFUNDED",  variant: "warning" },
        { label: "Force Cancel",   status: "CANCELLED", variant: "danger" },
    ],
    SHIPPED:   [
        { label: "Mark Delivered", status: "DELIVERED", variant: "neutral" },
        { label: "Force Release",  status: "RELEASED",  variant: "success" },
        { label: "Flag Dispute",   status: "DISPUTED",  variant: "danger" },
        { label: "Force Refund",   status: "REFUNDED",  variant: "warning" },
    ],
    DELIVERED: [
        { label: "Force Release",  status: "RELEASED",  variant: "success" },
        { label: "Flag Dispute",   status: "DISPUTED",  variant: "danger" },
        { label: "Force Refund",   status: "REFUNDED",  variant: "warning" },
    ],
    DISPUTED:  [
        { label: "Release to Seller", status: "RELEASED", variant: "success" },
        { label: "Refund Buyer",      status: "REFUNDED",  variant: "warning" },
    ],
};

const VARIANT_STYLES = {
    success: "bg-emerald-600 hover:bg-emerald-500 text-white",
    warning: "bg-amber-500 hover:bg-amber-400 text-white",
    danger:  "bg-red-600 hover:bg-red-500 text-white",
    neutral: "bg-gray-700 hover:bg-gray-600 text-white",
};

const fmtKsh = (n: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

const timeAgo = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

const StatusBadge = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.CREATED;
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
};

export default function ModeratorPage() {
    const { user } = useUser();
    const { signOut } = useClerk();
    const chatEndRef = useRef<HTMLDivElement>(null);

    const [view, setView] = useState<View>("home");
    const [category, setCategory] = useState<Category | null>(null);
    const [selectedTx, setSelectedTx] = useState<Tx | null>(null);
    const [stats, setStats] = useState<ModStats | null>(null);
    const [allTxs, setAllTxs] = useState<Tx[]>([]);
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState("");
    const [overrideModal, setOverrideModal] = useState<{ status: string; label: string; variant: string } | null>(null);
    const [overrideReason, setOverrideReason] = useState("");
    const [msgDraft, setMsgDraft] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchAll = useCallback(async (quiet = false) => {
        if (!quiet) setLoadingData(true); else setRefreshing(true);
        try {
            const [sRes, tRes] = await Promise.all([
                fetch("/api/moderator/stats"),
                fetch("/api/moderator/transactions"),
            ]);
            if (sRes.ok) setStats(await sRes.json());
            if (tRes.ok) setAllTxs(await tRes.json());
            else showToast(`Failed to load transactions (${tRes.status})`, false);
        } finally {
            setLoadingData(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const loadMessages = useCallback(async (txId: string) => {
        setLoadingMsgs(true);
        setMessages([]);
        try {
            const res = await fetch(`/api/moderator/transactions/${txId}/messages`);
            if (res.ok) setMessages(await res.json());
        } finally {
            setLoadingMsgs(false);
        }
    }, []);

    const openDetail = (tx: Tx) => {
        setSelectedTx(tx);
        setView("detail");
        loadMessages(tx.id);
    };

    const goHome = () => { setView("home"); setCategory(null); setSelectedTx(null); setSearch(""); };
    const goList = () => { setView("list"); setSelectedTx(null); setSearch(""); };

    const txsInCategory = (cat: Category) =>
        allTxs.filter((t) =>
            cat === "active"    ? ACTIVE_STATUSES.has(t.status) :
            cat === "disputed"  ? t.status === "DISPUTED" :
            cat === "completed" ? (t.status === "RELEASED" || t.status === "REFUNDED") :
            t.status === "CANCELLED"
        );

    const listTxs = category
        ? txsInCategory(category).filter((t) => {
            const q = search.toLowerCase();
            return !q || t.title.toLowerCase().includes(q) ||
                t.buyer_name?.toLowerCase().includes(q) ||
                t.seller_name?.toLowerCase().includes(q);
          })
        : [];

    const submitOverride = async () => {
        if (!selectedTx || !overrideModal || !overrideReason.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/moderator/transactions/${selectedTx.id}/override`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ new_status: overrideModal.status, reason: overrideReason }),
            });
            if (res.ok) {
                setSelectedTx({ ...selectedTx, status: overrideModal.status });
                setOverrideModal(null);
                setOverrideReason("");
                showToast(`Status updated to ${STATUS_CONFIG[overrideModal.status]?.label ?? overrideModal.status}`);
                await fetchAll(true);
            } else {
                const d = await res.json().catch(() => ({}));
                showToast(d.detail ?? "Override failed.", false);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const submitMessage = async () => {
        if (!selectedTx || !msgDraft.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/moderator/transactions/${selectedTx.id}/message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: msgDraft }),
            });
            if (res.ok) {
                setMsgDraft("");
                loadMessages(selectedTx.id);
            } else {
                showToast("Failed to send message.", false);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const submitUserAction = async (action: "deactivate" | "revoke", userId: string, name: string) => {
        setSubmitting(true);
        try {
            const endpoint = action === "deactivate"
                ? `/api/vault/mod/user/${userId}/deactivate`
                : `/api/vault/mod/user/${userId}/revoke-seller`;
            const res = await fetch(endpoint, { method: "POST" });
            if (res.ok) {
                showToast(action === "deactivate" ? `${name} deactivated` : `Seller status revoked for ${name}`);
            } else {
                showToast("Action failed.", false);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const CATEGORIES = [
        { key: "active" as Category,    label: "Active",    sub: "In progress",       icon: Package,    color: "text-blue-600",    bg: "bg-blue-50",    ring: "ring-blue-100",   activeBg: "bg-blue-600" },
        { key: "disputed" as Category,  label: "Disputed",  sub: "Needs intervention", icon: Flag,       color: "text-red-600",     bg: "bg-red-50",     ring: "ring-red-100",    activeBg: "bg-red-600" },
        { key: "completed" as Category, label: "Completed", sub: "Released & refunded",icon: BadgeCheck, color: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-100",activeBg: "bg-emerald-600" },
        { key: "cancelled" as Category, label: "Cancelled", sub: "Terminated",         icon: XCircle,    color: "text-gray-500",    bg: "bg-gray-50",    ring: "ring-gray-100",   activeBg: "bg-gray-500" },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">

            <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center gap-4 flex-shrink-0 sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    {view !== "home" && (
                        <button
                            onClick={view === "detail" ? goList : goHome}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">Funga Deal</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">Moderator</span>
                    </div>
                    {view !== "home" && (
                        <div className="flex items-center gap-1.5 text-sm text-gray-400">
                            <ChevronRight className="w-3.5 h-3.5" />
                            <span className="text-gray-600 font-medium capitalize">{category} Orders</span>
                            {view === "detail" && selectedTx && (
                                <>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                    <span className="text-gray-500 truncate max-w-[200px]">{selectedTx.title}</span>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1" />

                <button
                    onClick={() => fetchAll(true)}
                    disabled={refreshing}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
                    title="Refresh"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-blue-500" : ""}`} />
                </button>

                <div className="flex items-center gap-2.5 pl-3 border-l border-gray-200">
                    {user?.imageUrl
                        ? <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full" />
                        : <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center"><User className="w-4 h-4 text-gray-500" /></div>
                    }
                    <div className="leading-tight hidden sm:block">
                        <p className="text-xs font-medium text-gray-800">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress}</p>
                    </div>
                    <button
                        onClick={() => signOut({ redirectUrl: "/sign-in" })}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Sign out"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {view === "home" && (
                <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
                    {loadingData ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <>
                            {stats && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                                    {[
                                        { label: "Total Volume",  value: fmtKsh(stats.total_volume),      icon: TrendingUp,  color: "text-blue-600",    bg: "bg-blue-50" },
                                        { label: "In Escrow",     value: fmtKsh(stats.escrow_held),       icon: Lock,        color: "text-violet-600",  bg: "bg-violet-50" },
                                        { label: "Open Disputes", value: String(stats.open_disputes),     icon: Scale,       color: "text-red-600",     bg: "bg-red-50" },
                                        { label: "Fees Earned",   value: fmtKsh(stats.total_fees_earned), icon: DollarSign,  color: "text-emerald-600", bg: "bg-emerald-50" },
                                    ].map(({ label, value, icon: Icon, color, bg }) => (
                                        <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                                            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                                                <Icon className={`w-4 h-4 ${color}`} />
                                            </div>
                                            <p className="text-xs text-gray-500 mb-1">{label}</p>
                                            <p className="text-lg font-semibold text-gray-900">{value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Manage Orders</p>
                            <div className="grid grid-cols-2 gap-3">
                                {CATEGORIES.map(({ key, label, sub, icon: Icon, color, bg, ring }) => {
                                    const count = txsInCategory(key).length;
                                    const hasAlert = key === "disputed" && count > 0;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => { setCategory(key); setView("list"); }}
                                            className="group bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-gray-300 hover:shadow-sm transition-all"
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className={`w-10 h-10 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center`}>
                                                    <Icon className={`w-5 h-5 ${color}`} />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {hasAlert && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                                                    <span className="text-2xl font-bold text-gray-900">{count}</span>
                                                </div>
                                            </div>
                                            <p className="text-sm font-semibold text-gray-900 mb-0.5">{label} Orders</p>
                                            <p className="text-xs text-gray-400">{sub}</p>
                                            <div className="mt-4 flex items-center text-xs font-medium text-gray-400 group-hover:text-gray-700 transition-colors">
                                                View all <ChevronRight className="w-3.5 h-3.5 ml-1" />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            {view === "list" && category && (
                <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900 capitalize">{category} Orders</h2>
                            <p className="text-xs text-gray-400">{listTxs.length} {listTxs.length === 1 ? "order" : "orders"}</p>
                        </div>
                        <div className="flex-1" />
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search orders..."
                                className="pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 w-52 transition-all"
                            />
                        </div>
                    </div>

                    {loadingData ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                    ) : listTxs.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                <CheckCircle2 className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">No orders here</p>
                            <p className="text-xs text-gray-400 mt-1">This category is empty</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Order</th>
                                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Parties</th>
                                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Amount</th>
                                        <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Status</th>
                                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Updated</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {listTxs.map((tx) => (
                                        <tr
                                            key={tx.id}
                                            onClick={() => openDetail(tx)}
                                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    {tx.has_open_dispute && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                                                    <span className="font-medium text-gray-900 truncate max-w-[180px]">{tx.title}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className="text-gray-500 text-xs truncate max-w-[160px] block">
                                                    {tx.buyer_name ?? "Buyer"} → {tx.seller_name ?? "Seller"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-right font-semibold text-gray-900 tabular-nums">{fmtKsh(tx.amount)}</td>
                                            <td className="px-4 py-3.5 text-center"><StatusBadge status={tx.status} /></td>
                                            <td className="px-4 py-3.5 text-right text-xs text-gray-400 tabular-nums">{timeAgo(tx.updated_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {view === "detail" && selectedTx && (
                <div className="flex-1 flex min-h-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">

                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h2 className="text-base font-semibold text-gray-900 truncate">{selectedTx.title}</h2>
                                        <StatusBadge status={selectedTx.status} />
                                    </div>
                                    {selectedTx.description && <p className="text-sm text-gray-500">{selectedTx.description}</p>}
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-2xl font-bold text-gray-900">{fmtKsh(selectedTx.amount)}</p>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <p className="text-gray-400 mb-0.5">Created</p>
                                    <p className="text-gray-700 font-medium">{fmtDate(selectedTx.created_at)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 mb-0.5">Last updated</p>
                                    <p className="text-gray-700 font-medium">{fmtDate(selectedTx.updated_at)}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-gray-400 mb-0.5">Transaction ID</p>
                                    <p className="text-gray-500 font-mono text-xs">{selectedTx.id}</p>
                                </div>
                            </div>
                            {selectedTx.cancellation_reason && (
                                <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 border border-gray-100">
                                    {selectedTx.cancellation_reason}
                                </div>
                            )}
                        </div>

                        {selectedTx.has_open_dispute && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-red-700 mb-1">Open Dispute</p>
                                    <p className="text-sm text-red-600">{selectedTx.dispute_reason}</p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { role: "Buyer",  name: selectedTx.buyer_name,  email: selectedTx.buyer_email,  id: selectedTx.buyer_id },
                                { role: "Seller", name: selectedTx.seller_name, email: selectedTx.seller_email, id: selectedTx.seller_id },
                            ].map(({ role, name, email, id }) => (
                                <div key={role} className="bg-white rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{role}</p>
                                    <div className="flex items-center gap-2.5 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                            <User className="w-4 h-4 text-gray-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{name ?? "—"}</p>
                                            <p className="text-xs text-gray-400 truncate">{email ?? id}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => submitUserAction("deactivate", id, name ?? id)}
                                            disabled={submitting}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40"
                                        >
                                            <UserX className="w-3 h-3" />
                                            Deactivate
                                        </button>
                                        {role === "Seller" && (
                                            <button
                                                onClick={() => submitUserAction("revoke", id, name ?? id)}
                                                disabled={submitting}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-40"
                                            >
                                                <BadgeX className="w-3 h-3" />
                                                Revoke
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Transaction Chat</p>
                            </div>
                            <div className="p-4">
                                {loadingMsgs ? (
                                    <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                                ) : messages.length === 0 ? (
                                    <p className="text-xs text-gray-400 text-center py-8">No messages yet</p>
                                ) : (
                                    <div className="space-y-2 mb-4 max-h-60 overflow-y-auto pr-1">
                                        {messages.map((m) => {
                                            const isSys = m.body.startsWith("[MODERATOR]") || m.body.startsWith("[SYSTEM]");
                                            return (
                                                <div key={m.id} className={`rounded-lg px-3 py-2.5 text-xs ${isSys ? "bg-amber-50 border border-amber-100" : "bg-gray-50"}`}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`font-semibold ${isSys ? "text-amber-700" : "text-gray-700"}`}>{m.sender_name ?? "Unknown"}</span>
                                                        <span className="text-gray-400">{timeAgo(m.created_at)}</span>
                                                    </div>
                                                    <p className="text-gray-600 break-words leading-relaxed">{m.body}</p>
                                                </div>
                                            );
                                        })}
                                        <div ref={chatEndRef} />
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        value={msgDraft}
                                        onChange={(e) => setMsgDraft(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitMessage(); } }}
                                        placeholder="Send a system message..."
                                        maxLength={2000}
                                        className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all"
                                    />
                                    <button
                                        onClick={submitMessage}
                                        disabled={submitting || !msgDraft.trim()}
                                        className="px-3 py-2 bg-gray-900 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-64 border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-y-auto">
                        <div className="px-4 py-3 border-b border-gray-100">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</p>
                        </div>

                        {TERMINAL.has(selectedTx.status) ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                    <CheckCircle2 className="w-5 h-5 text-gray-400" />
                                </div>
                                <p className="text-sm font-medium text-gray-600">Final State</p>
                                <p className="text-xs text-gray-400 mt-1">No further actions available</p>
                            </div>
                        ) : OVERRIDES[selectedTx.status] ? (
                            <div className="p-4 space-y-2">
                                <p className="text-xs text-gray-400 mb-3">All actions require a reason and are permanently logged.</p>
                                {OVERRIDES[selectedTx.status].map(({ label, status, variant }) => (
                                    <button
                                        key={status}
                                        onClick={() => setOverrideModal({ status, label, variant })}
                                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${VARIANT_STYLES[variant]}`}
                                    >
                                        <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center p-6">
                                <p className="text-xs text-gray-400 text-center">No overrides available for this status</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {overrideModal && selectedTx && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-200">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">{overrideModal.label}</h3>
                                <p className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-[280px]">{selectedTx.id}</p>
                            </div>
                            <button
                                onClick={() => { setOverrideModal(null); setOverrideReason(""); }}
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-5">
                            <label className="block text-xs font-medium text-gray-700 mb-2">Reason <span className="text-red-500">*</span></label>
                            <textarea
                                autoFocus
                                value={overrideReason}
                                onChange={(e) => setOverrideReason(e.target.value)}
                                placeholder="Describe why you are overriding this transaction..."
                                rows={4}
                                maxLength={500}
                                className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 resize-none text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all"
                            />
                            <p className="text-xs text-gray-400 mt-1.5 text-right">{overrideReason.length}/500</p>
                        </div>
                        <div className="flex gap-2 px-5 pb-5">
                            <button
                                onClick={() => { setOverrideModal(null); setOverrideReason(""); }}
                                disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submitOverride}
                                disabled={submitting || !overrideReason.trim()}
                                className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2 ${VARIANT_STYLES[overrideModal.variant as keyof typeof VARIANT_STYLES] ?? "bg-gray-900 hover:bg-gray-700"}`}
                            >
                                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                Confirm Action
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className={`fixed bottom-5 right-5 flex items-center gap-2.5 text-sm font-medium px-4 py-3 rounded-xl shadow-lg z-50 border ${toast.ok ? "bg-white border-gray-200 text-gray-800" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {toast.ok
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        : <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    }
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
