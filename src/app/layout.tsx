import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import MainNav from '@/components/MainNav';
import { UserProvider } from '@/components/UserContext';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'WizTech Payroll',
  description: 'Malawi Payroll Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body
        className={`${inter.className} antialiased bg-gray-50`}
        suppressHydrationWarning={true}
      >
        <UserProvider>
          <MainNav>{children}</MainNav>
        </UserProvider>
      </body>
    </html>
  );
}