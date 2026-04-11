"use client";
import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Send, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Message } from "@/types";

interface Props {
    transactionId: string;
}

export default function EscrowChat({ transactionId }: Props) {
    const { user } = useUser();
    const [messages, setMessages] = useState<Message[]>([]);
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const load = async () => {
        try {
            const { data } = await api.get(`/messages/${transactionId}`);
            setMessages(data);
        } catch {
        }
    };

    useEffect(() => {
        load();
        const interval = setInterval(load, 3000);
        return () => clearInterval(interval);
    }, [transactionId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const send = async () => {
        const text = body.trim();
        if (!text) return;
        setSending(true);
        setBody("");
        try {
            const { data } = await api.post(`/messages/${transactionId}`, { body: text });
            setMessages((prev) => [...prev, data]);
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    };

    const formatTime = (iso: string) =>
        new Date(iso).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

    return (
        <div className="card flex flex-col" style={{ height: "420px" }}>
            <div className="px-5 py-3 border-b border-navy-600 flex-shrink-0">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chat</p>
                <p className="text-xs text-slate-600 mt-0.5">Messages are private between buyer and seller</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {messages.length === 0 && (
                    <p className="text-xs text-slate-600 text-center mt-8">No messages yet. Say something!</p>
                )}
                {messages.map((msg) => {
                    const isMe = msg.sender_id === user?.id || msg.sender_name === user?.fullName;
                    return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                            <div
                                className={`max-w-xs px-3 py-2 rounded-xl text-sm leading-relaxed ${isMe
                                        ? "bg-success-600 text-white rounded-br-sm"
                                        : "bg-navy-700 text-slate-200 rounded-bl-sm"
                                    }`}
                            >
                                {msg.body}
                            </div>
                            <p className="text-[10px] text-slate-600 mt-1">
                                {isMe ? "You" : msg.sender_name} · {formatTime(msg.created_at)}
                            </p>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            <div className="px-4 pb-4 pt-2 border-t border-navy-600 flex-shrink-0 flex items-end gap-2">
                <textarea
                    rows={2}
                    className="input-field flex-1 resize-none text-sm"
                    placeholder="Type a message… (Enter to send)"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <button
                    onClick={send}
                    disabled={sending || !body.trim()}
                    className="btn-primary flex items-center gap-1 px-4 h-10 flex-shrink-0"
                >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
