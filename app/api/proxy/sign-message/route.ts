import { NextRequest, NextResponse } from "next/server";

const PROXY_BASE_URL =
  process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(
      `${PROXY_BASE_URL}/simplicity-unchained-web-proxy-demo/sign_message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Sign message request failed" },
        { status: response.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Sign message proxy error:", error);
    return NextResponse.json(
      { error: "Failed to process sign message request" },
      { status: 500 },
    );
  }
}
