import { TransactionStatus } from "@/types";
import { Check, Clock, ShieldCheck, Truck, AlertTriangle, Banknote } from "lucide-react";

const STEPS: { status: TransactionStatus; label: string; desc: string; icon: React.ElementType }[] = [
    { status: "DRAFT", label: "Escrow Created", desc: "Terms agreed", icon: Clock },
    { status: "AWAITING_PAYMENT", label: "Awaiting Payment", desc: "Buyer to send funds", icon: Banknote },
    { status: "FUNDED", label: "Funds Secured", desc: "Money held in escrow", icon: ShieldCheck },
    { status: "GOODS_DELIVERED", label: "Delivery Confirmed", desc: "Buyer confirmed delivery", icon: Truck },
    { status: "RELEASED", label: "Funds Released", desc: "Seller paid via M-Pesa", icon: Check },
];

const ORDER = ["DRAFT", "AWAITING_PAYMENT", "FUNDED", "GOODS_DELIVERED", "RELEASED"];

function getStepIndex(status: TransactionStatus) {
    return ORDER.indexOf(status);
}

interface Props {
    status: TransactionStatus;
}

export default function TransactionStepper({ status }: Props) {
    const isDisputed = status === "DISPUTED" || status === "RESOLVED";
    const isRefunded = status === "REFUNDED";
    const isCancelled = status === "CANCELLED";

    const currentIdx = getStepIndex(status);

    if (isDisputed || isRefunded || isCancelled) {
        const label =
            isDisputed ? "In Dispute" : isRefunded ? "Refunded to Buyer" : "Cancelled";
        const color =
            isDisputed ? "text-amber-400 border-amber-500 bg-amber-500/10" : "text-red-400 border-red-500 bg-red-500/10";
        return (
            <div className={`flex items-center gap-3 border rounded-xl px-5 py-4 ${color}`}>
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <div>
                    <p className="font-semibold text-sm">{label}</p>
                    <p className="text-xs opacity-70 mt-0.5">
                        {isDisputed ? "A dispute has been raised — under review." : isRefunded ? "Funds returned to buyer's M-Pesa." : "This escrow was cancelled."}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="flex items-start gap-0">
                {STEPS.map((step, idx) => {
                    const done = currentIdx > idx;
                    const active = currentIdx === idx;
                    const Icon = step.icon;

                    return (
                        <div key={step.status} className="flex-1 flex flex-col items-center">
                            <div className="flex items-center w-full">
                                {idx > 0 && (
                                    <div className={`flex-1 h-0.5 ${done ? "bg-success-500" : "bg-navy-600"} transition-colors duration-500`} />
                                )}
                                <div
                                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all duration-300 ${done
                                            ? "bg-success-500 border-success-500 text-white"
                                            : active
                                                ? "bg-navy-700 border-success-500 text-success-400"
                                                : "bg-navy-700 border-navy-600 text-slate-600"
                                        }`}
                                >
                                    {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                                </div>
                                {idx < STEPS.length - 1 && (
                                    <div className={`flex-1 h-0.5 ${done ? "bg-success-500" : "bg-navy-600"} transition-colors duration-500`} />
                                )}
                            </div>
                            <div className="mt-2.5 text-center px-1">
                                <p className={`text-xs font-semibold ${active ? "text-success-400" : done ? "text-slate-300" : "text-slate-600"}`}>
                                    {step.label}
                                </p>
                                <p className="text-[10px] text-slate-600 mt-0.5 hidden sm:block">{step.desc}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
