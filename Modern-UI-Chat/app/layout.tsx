import type React from "react"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { UserProvider } from "@/components/user-provider"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-gray-900 overflow-hidden">
        <UserProvider>
          {children}
          <Toaster />
        </UserProvider>
      </body>
    </html>
  )
}

export const metadata = {
  title: 'Modern UI Chat',
  description: 'A modern chat interface with document processing capabilities',
  generator: 'v0.dev'
};
