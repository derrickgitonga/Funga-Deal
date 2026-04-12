import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { getToken } = await auth();
    const token = await getToken();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const res = await fetch(`${process.env.VAULT_URL}/mod/user/${id}/revoke-seller`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });

    return new NextResponse(null, { status: res.status });
}
