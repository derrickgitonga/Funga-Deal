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
    Wallet,
    Link2,
    Users,
} from "lucide-react";

const NAV = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/new", label: "New Escrow", icon: PlusCircle },
    { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
    { href: "/dashboard/payment-links", label: "Payment Links", icon: Link2 },
    { href: "/dashboard/become-seller", label: "Become a Seller", icon: ShieldCheck },
    { href: "/dashboard/admin", label: "Admin", icon: Users },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user, isLoaded } = useUser();
    const { signOut } = useClerk();

    return (
        <aside className="w-60 min-h-screen bg-white border-r border-gray-200 flex flex-col">
            <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-200">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold text-gray-900 tracking-tight">Funga Deal</span>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-0.5">
                {NAV.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                                ? "bg-emerald-50 text-emerald-700"
                                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                            }`}
                        >
                            <Icon className={`w-4 h-4 ${active ? "text-emerald-600" : "text-gray-400"}`} />
                            {label}
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t border-gray-200 px-4 py-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                        {user?.imageUrl ? (
                            <img src={user.imageUrl} alt={user.fullName || "User"} className="w-full h-full object-cover" />
                        ) : (
                            <User2 className="w-4 h-4 text-gray-400" />
                        )}
                    </div>
                    <div className="min-w-0">
                        {!isLoaded ? (
                            <div className="h-4 bg-gray-100 rounded w-20 animate-pulse mb-1"></div>
                        ) : (
                            <>
                                <p className="text-sm font-semibold text-gray-900 truncate">{user?.fullName || user?.primaryEmailAddress?.emailAddress}</p>
                                <p className="text-xs text-gray-400 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
                            </>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => signOut({ redirectUrl: '/sign-in' })}
                    className="flex w-full items-center gap-2 text-sm text-gray-400 hover:text-red-500 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Sign out
                </button>
            </div>
        </aside>
    );
}
