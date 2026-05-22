import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
	title: "Platform dashboard",
	description: "Restaurant POS platform control plane",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			data-theme-preset="default"
			data-content-layout="centered"
			data-navbar-style="sticky"
			data-sidebar-variant="inset"
			data-sidebar-collapsible="icon"
			suppressHydrationWarning
		>
			<body className="min-h-screen font-sans antialiased">
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
