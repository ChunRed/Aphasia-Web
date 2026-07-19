import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { text, token } = await request.json();

    // 1. Check if token is present
    if (!token) {
      return NextResponse.json(
        { success: false, message: "缺少 Turnstile 驗證 token (Missing token)" },
        { status: 400 }
      );
    }

    // 2. Verify token with Cloudflare Turnstile API
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

    // 3. Verify Cloudflare success status
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

    // TODO: 這裡之後要寫呼叫 AI 還有透過 Webhook/Socket 傳給現場 Local Server 的控制程式碼
    return NextResponse.json(
      {
        success: true,
        message: "文字傳送成功並通過安全驗證",
        data: { text },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return NextResponse.json(
      { success: false, message: "伺服器內部驗證錯誤 (Internal server error)" },
      { status: 500 }
    );
  }
}
