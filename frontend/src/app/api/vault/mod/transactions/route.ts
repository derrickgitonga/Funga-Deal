import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
    const { getToken } = await auth();
    const token = await getToken();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const res = await fetch(`${process.env.VAULT_URL}/mod/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
    });

    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
}
