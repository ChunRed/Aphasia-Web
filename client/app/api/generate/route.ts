import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client with Service Role Key to bypass RLS in server-side API routes
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://zrbolaymgwdcvwwuosbf.supabase.co";

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyYm9sYXltZ3dkY3Z3d3Vvc2JmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDQ1Mzk2MCwiZXhwIjoyMTAwMDI5OTYwfQ.2-eIrx08xc8buAf0LLd3_hxq0shx4yb8XgI3CjLHPm4";

const supabase = createClient(supabaseUrl, supabaseKey);

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

    // 6. Insert data into Supabase '2026DAF' table
    const { data: dbData, error: dbError } = await supabase
      .from("2026DAF")
      .insert([
        {
          IP: clientIp,
          Text: trimmedText,
        },
      ])
      .select();

    if (dbError) {
      console.error("Supabase insert error:", dbError);
      return NextResponse.json(
        {
          success: false,
          message: `資料庫寫入失敗: ${dbError.message}`,
        },
        { status: 500 }
      );
    }

    // TODO: 這裡之後要寫呼叫 AI 還有透過 Webhook/Socket 傳給現場 Local Server 的控制程式碼
    return NextResponse.json(
      {
        success: true,
        message: "文字傳送成功並已寫入資料庫",
        data: dbData ? dbData[0] : { IP: clientIp, Text: trimmedText },
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
