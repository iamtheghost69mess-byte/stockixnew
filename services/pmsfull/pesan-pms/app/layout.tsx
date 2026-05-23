import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/components/auth-provider'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: {
    default: 'Stockix PMS',
    template: '%s | Stockix PMS',
  },
  description: 'Property Management System by Stockix',
  applicationName: 'Stockix PMS',
  authors: [{ name: 'Stockix' }],
  icons: {
    icon: [{ url: '/logo.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: 'Stockix PMS',
    description: 'Property Management System by Stockix',
    siteName: 'Stockix PMS',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
}
