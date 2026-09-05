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
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg">
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