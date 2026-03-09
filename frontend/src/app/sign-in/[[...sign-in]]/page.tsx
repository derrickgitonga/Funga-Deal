import { SignIn } from "@clerk/nextjs";

export default function Page() {
    return (
        <div className="flex h-screen items-center justify-center bg-navy-800">
            <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" />
        </div>
    );
}
