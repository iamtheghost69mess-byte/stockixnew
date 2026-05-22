"use client";

export function OpenApiViewer() {
	return (
		<div className="openapi-viewer h-[600px] w-full bg-card rounded-md overflow-hidden animate-in fade-in transition-all">
			<iframe
				src="/swagger-viewer.html"
				className="w-full h-full border-0 select-none bg-background"
				title="OpenAPI Specifications"
			/>
		</div>
	);
}
