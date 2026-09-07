import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import MainNav from '@/components/MainNav';
import { UserProvider } from '@/components/UserContext';
import { SESSION_COOKIE, validateSessionToken } from '@/lib/auth';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'WizTech Payroll',
  description: 'Malawi Payroll Management System',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await validateSessionToken(token) : null;

  const user = session
    ? {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        businessId: session.user.businessId,
      }
    : null;

  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body
        className={`${inter.className} antialiased bg-gray-50`}
        suppressHydrationWarning={true}
      >
        <UserProvider initialUser={user}>
          <MainNav>
            <a href="#main-content" className="skip-link">
              Skip to content
            </a>
            <div id="main-content">
              {children}
            </div>
          </MainNav>
        </UserProvider>
      </body>
    </html>
  );
}