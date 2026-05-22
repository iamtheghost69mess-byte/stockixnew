import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const backendOrigin = process.env.NEXT_PUBLIC_POS_API_ORIGIN || "http://localhost:8010";
    const backendUrl = `${backendOrigin}/api/upload`;

    // Forward the multipart/form-data request to the backend
    const response = await fetch(backendUrl, {
      method: "POST",
      body: formData,
      headers: {
        // Forward authentication cookies to the backend
        Cookie: req.headers.get("cookie") || "",
        // Do NOT set Content-Type header manually; fetch will set it correctly for FormData
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: data.message || "Backend upload failed" },
        { status: response.status },
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[UPLOAD_PROXY_ERROR]", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal Upload Proxy Error" },
      { status: 500 },
    );
  }
}
