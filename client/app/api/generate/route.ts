import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { text, token } = await request.json();

    // 1. Check text length rule (10 - 200 characters)
    const trimmedText = text ? text.trim() : "";
    if (trimmedText.length < 10 || trimmedText.length > 200) {
      return NextResponse.json(
        {
          success: false,
          message: `字數不符合規則，限制為 10 - 200 字 (目前輸入：${trimmedText.length} 字)`,
        },
        { status: 400 }
      );
    }

    // 2. Check if Turnstile token is present
    if (!token) {
      return NextResponse.json(
        { success: false, message: "缺少 Turnstile 驗證 token (Missing token)" },
        { status: 400 }
      );
    }

    // 3. Verify token with Cloudflare Turnstile API
    const secretKey = process.env.TURNSTILE_SECRET_KEY || "";
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);

    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    const verifyData = await verifyResponse.json();

    // 4. Verify Cloudflare success status
    if (!verifyData.success) {
      return NextResponse.json(
        {
          success: false,
          message: "安全驗證失敗，判定為機器人 (Turnstile verification failed)",
          errors: verifyData["error-codes"],
        },
        { status: 403 }
      );
    }

    // 5. Extract user's real IP address
    const rawIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      request.headers.get("cf-connecting-ip") ||
      "127.0.0.1";

    const clientIp = rawIp.replace(/^.*:/, "") || rawIp;

    return NextResponse.json(
      {
        success: true,
        message: "文字傳送成功",
        data: { IP: clientIp, Text: trimmedText },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, message: "伺服器內部錯誤 (Internal server error)" },
      { status: 500 }
    );
  }
}
