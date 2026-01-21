import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/config/api.config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(
      `${API_CONFIG.SIMPLICITY_SERVICE_URL}/simplicity-unchained/tweak`,
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
        { error: data.error || "Tweak request failed" },
        { status: response.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Tweak proxy error:", error);
    return NextResponse.json(
      { error: "Failed to process tweak request" },
      { status: 500 },
    );
  }
}
