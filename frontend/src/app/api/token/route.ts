import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { getToken } = await auth();
        const accessToken = await getToken();
        return NextResponse.json({ accessToken });
    } catch (error) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
}
