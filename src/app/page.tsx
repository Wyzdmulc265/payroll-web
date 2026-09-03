import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, validateSessionToken } from '@/lib/auth';

export default async function HomePage() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = token ? await validateSessionToken(token) : null;

  if (!session) {
    redirect('/login');
  }

  if (session.user.role === 'SUPER_ADMIN') {
    redirect('/home');
  }

  redirect('/dashboard');
}
