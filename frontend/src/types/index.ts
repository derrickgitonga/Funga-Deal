export interface User {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    created_at: string;
}

export type TransactionStatus =
    | "CREATED"
    | "FUNDED"
    | "SHIPPED"
    | "DELIVERED"
    | "DISPUTED"
    | "RELEASED"
    | "REFUNDED"
    | "CANCELLED";

export interface Transaction {
    id: string;
    buyer_id: string;
    seller_id: string;
    buyer_name: string | null;
    seller_name: string | null;
    title: string;
    description: string | null;
    amount: number;
    status: TransactionStatus;
    cancellation_reason?: string;
    created_at: string;
    updated_at: string;
}

export type DisputeStatus =
    | "OPEN"
    | "UNDER_REVIEW"
    | "RESOLVED_BUYER"
    | "RESOLVED_SELLER"
    | "CLOSED";

export interface Dispute {
    id: string;
    transaction_id: string;
    raised_by: string;
    reason: string;
    status: DisputeStatus;
    resolution: string | null;
    created_at: string;
}

export interface EvidenceFile {
    id: string;
    dispute_id: string;
    uploader_id: string;
    file_name: string;
    file_type: string;
    created_at: string;
}

export interface Message {
    id: string;
    transaction_id: string;
    sender_id: string;
    sender_name: string | null;
    body: string;
    created_at: string;
}

export type DeliveryMethod = "Courier" | "Digital" | "Service";
export type PaymentLinkStatus = "active" | "inactive";

export interface PaymentLink {
    id: string;
    seller_id: string;
    seller_name: string | null;
    title: string;
    description: string | null;
    price: number;
    currency: string;
    delivery_method: DeliveryMethod;
    status: PaymentLinkStatus;
    created_at: string;
}

export interface WalletBalance {
    escrow_held: number;
    total_spent: number;
    total_earned: number;
}

export interface AdminStats {
    total_volume: number;
    open_disputes: number;
    completed_transactions: number;
    escrow_held: number;
    total_fees_earned: number;
}

export interface AdminDispute {
    id: string;
    transaction_id: string;
    transaction_title: string | null;
    amount: number;
    buyer_name: string | null;
    seller_name: string | null;
    raised_by_name: string | null;
    reason: string;
    status: string;
    created_at: string;
}
