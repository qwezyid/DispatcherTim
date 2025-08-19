import "./globals.css";

export const metadata = {
  title: "Диспетчер перевозок",
  description: "Внутренняя система диспетчеризации",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
