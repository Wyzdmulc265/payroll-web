import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import MainNav from '@/components/MainNav';
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
    <html lang="en">
      <body
        className={`${inter.className} antialiased bg-gray-50`}
        suppressHydrationWarning={true}
      >
        <MainNav />
        {/* Offset content from the fixed desktop sidebar; reserve space for
            the mobile bottom nav; collapse both when printing payslips. */}
        <div className="min-h-screen pb-24 lg:pb-0 print:ml-0 print:pb-0 lg:ml-64">
          {children}
        </div>
      </body>
    </html>
  );
}