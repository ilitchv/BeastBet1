
// import { GeistSans } from 'geist/font/sans'; // Temporarily removed to debug JS errors
// import { GeistMono } from 'geist/font/mono'; // Temporarily removed
import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Beast Bet App - LottoLook',
  description: 'Lottery ticket interpretation and management tool.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // <html lang="en" className={`${GeistSans.variable}`} suppressHydrationWarning> // Font temporarily removed
    <html lang="en" suppressHydrationWarning>
      {/* <body className="antialiased"> */}
      {/* Use a more generic className or none if GeistSans variable is not defined */}
      <body className="antialiased"> 
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
