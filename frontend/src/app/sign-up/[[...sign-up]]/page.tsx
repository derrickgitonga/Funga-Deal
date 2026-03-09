import { SignUp } from "@clerk/nextjs";

export default function Page() {
    return (
        <div className="flex h-screen items-center justify-center bg-navy-800">
            <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />
        </div>
    );
}
