import type { Metadata } from 'next';
import { Geist_Sans as GeistSans, Geist_Mono as GeistMono } from 'next/font/google'; // Corrected import
import './globals.css';
// Toaster and ThemeProvider might still be useful if any part of your jQuery app
// or future Next.js pages (like API routes or other utility pages) need them.
// If not, they can be removed.
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';

const geistSans = GeistSans({ // Corrected variable name
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = GeistMono({ // Corrected variable name
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Metadata can be simplified or made more generic if index.html handles its own title.
export const metadata: Metadata = {
  title: 'Beast Bet App',
  description: 'Lottery ticket interpretation and management tool.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* If your public/index.html defines the full page structure, 
            children might not be directly rendered here for the root path.
            However, ThemeProvider and Toaster can still wrap potential 
            Next.js specific pages or future additions.
        */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children} {/* This will render content from Next.js pages if any exist besides the root */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
