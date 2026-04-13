import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MOD_SECRET = process.env.MOD_SECRET ?? "funga-mod-internal-2024";

async function proxy(req: NextRequest, params: { path: string[] }, method: string) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const path = params.path.join("/");
    const url = `${BACKEND}/api/moderator/${path}`;

    const headers: Record<string, string> = {
        "X-Mod-Secret": MOD_SECRET,
        "X-Clerk-Sub": userId,
    };

    let body: string | undefined;
    if (method !== "GET") {
        const ct = req.headers.get("content-type");
        if (ct) headers["Content-Type"] = ct;
        body = await req.text();
    }

    const res = await fetch(url, { method, headers, body, cache: "no-store" });
    const text = await res.text();
    const ct = res.headers.get("content-type") ?? "application/json";
    return new NextResponse(text, { status: res.status, headers: { "Content-Type": ct } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    return proxy(req, await params, "GET");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    return proxy(req, await params, "POST");
}
