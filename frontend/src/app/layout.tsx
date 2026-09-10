import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'

const outfit = Outfit({ 
  subsets: ['latin'],
  variable: '--font-outfit',
})

export const metadata: Metadata = {
  title: 'Paste Labs',
  description: 'Seamlessly sync your clipboard across devices in real-time.',
  applicationName: 'Paste Labs',
  appleWebApp: {
    capable: true,
    title: 'Paste Labs',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icons/icon-192x192.svg',
    apple: '/apple-touch-icon.svg',
  },
  openGraph: {
    title: 'Paste Labs',
    description: 'Seamlessly sync your clipboard across devices in real-time.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#090412',
}


export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} font-sans`}>{children}</body>
    </html>
  )
}
