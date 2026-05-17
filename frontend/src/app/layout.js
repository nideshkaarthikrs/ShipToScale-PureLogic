import './globals.css';

export const metadata = {
  title: 'CivicLens',
  description: 'AI-powered complex document intelligence',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
