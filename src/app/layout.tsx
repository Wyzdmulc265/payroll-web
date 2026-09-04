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