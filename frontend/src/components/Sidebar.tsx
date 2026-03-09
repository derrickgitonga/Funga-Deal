"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
    ShieldCheck,
    LayoutDashboard,
    PlusCircle,
    LogOut,
    User2,
} from "lucide-react";

const NAV = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/new", label: "New Escrow", icon: PlusCircle },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user, isLoaded } = useUser();
    const { signOut } = useClerk();

    return (
        <aside className="w-60 min-h-screen bg-navy-900 border-r border-navy-700 flex flex-col">
            <div className="flex items-center gap-2.5 px-5 py-5 border-b border-navy-700">
                <div className="w-8 h-8 rounded-lg bg-success-500 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold text-slate-100 tracking-tight">Funga Deal</span>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1">
                {NAV.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                                ? "bg-success-500/10 text-success-400"
                                : "text-slate-400 hover:text-slate-200 hover:bg-navy-700"
                                }`}
                        >
                            <Icon className={`w-4 h-4 ${active ? "text-success-500" : ""}`} />
                            {label}
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t border-navy-700 px-4 py-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-navy-600 flex items-center justify-center overflow-hidden">
                        {user?.imageUrl ? (
                            <img src={user.imageUrl} alt={user.fullName || "User"} className="w-full h-full object-cover" />
                        ) : (
                            <User2 className="w-4 h-4 text-slate-400" />
                        )}
                    </div>
                    <div className="min-w-0">
                        {!isLoaded ? (
                            <div className="h-4 bg-navy-600 rounded w-20 animate-pulse mb-1"></div>
                        ) : (
                            <>
                                <p className="text-sm font-medium text-slate-200 truncate">{user?.fullName || user?.primaryEmailAddress?.emailAddress}</p>
                                <p className="text-xs text-slate-500 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
                            </>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => signOut({ redirectUrl: '/sign-in' })}
                    className="flex w-full items-center gap-2 text-sm text-slate-500 hover:text-red-400 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Sign out
                </button>
            </div>
        </aside>
    );
}
