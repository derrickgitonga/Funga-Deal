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
    | "REFUNDED";

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
