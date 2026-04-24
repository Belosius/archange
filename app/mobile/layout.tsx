import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'ARCHANGE',
  description: 'Agent email ARCHANGE — Planning, Mails, Événements',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ARCHANGE',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#FAFAF7',
}

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
