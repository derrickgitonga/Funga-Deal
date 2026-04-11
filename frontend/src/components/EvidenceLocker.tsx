"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, File, ImageIcon, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { EvidenceFile } from "@/types";

interface Props {
    disputeId: string;
}

export default function EvidenceLocker({ disputeId }: Props) {
    const [files, setFiles] = useState<EvidenceFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const loadFiles = () =>
        api.get(`/disputes/${disputeId}/evidence`).then(({ data }) => setFiles(data));

    useEffect(() => {
        loadFiles();
    }, [disputeId]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError("");
        try {
            const fd = new FormData();
            fd.append("file", file);
            await api.post(`/disputes/${disputeId}/evidence`, fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            await loadFiles();
        } catch {
            setError("Upload failed — only JPEG, PNG, WebP, or PDF allowed (max 10 MB).");
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Evidence Locker</h3>
                <label className="btn-secondary flex items-center gap-2 cursor-pointer">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? "Uploading..." : "Upload File"}
                    <input ref={inputRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleUpload} disabled={uploading} />
                </label>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 mb-3">
                    {error}
                </div>
            )}

            {files.length === 0 ? (
                <div
                    className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center cursor-pointer hover:border-gray-300 transition-colors"
                    onClick={() => inputRef.current?.click()}
                >
                    <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Upload photos, receipts, or PDFs as evidence</p>
                    <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP, PDF supported</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {files.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                            {f.file_type === "application/pdf" ? (
                                <File className="w-5 h-5 text-red-500 flex-shrink-0" />
                            ) : (
                                <ImageIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800 truncate font-medium">{f.file_name}</p>
                                <p className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString("en-KE")}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
