export const metadata = {
  title: 'rPlace Clone',
  description: 'A collaborative pixel canvas like Reddit Place.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
