import { redirect } from 'next/navigation';

export default function OldAdminRedirect() {
    redirect('/admin');
}
