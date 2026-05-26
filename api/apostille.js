```js
const APOSTILLE_SYSTEM_PROMPT = `당신은 대한민국 초등학교 학적 담당자를 돕는 전문 보조 AI입니다.
사용자가 입력한 국가가 헤이그 협약(아포스티유, Apostille Convention)에 가입되어 있는지 최신 정보를 확인하고, 다음 JSON 형식으로만 답하세요.
JSON 외의 텍스트나 마크다운 코드블록을 절대 추가하지 마세요.

{
  "country_ko": "국가명(한국어)",
  "country_en": "국가명(영어)",
  "is_member": true 또는 false,
  "join_date": "가입일(모르면 null)",
  "authority": "권한기관명(모르면 null)",
  "note": "특이사항(없으면 null)",
  "search_date": "조회 기준 날짜 YYYY-MM-DD(모르면 null)"
}`;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function extractJson(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
    return JSON.parse(match[0]);
  }
}

async function readCountry(request) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    return url.searchParams.get("country")?.trim() || "";
  }

  const body = await request.json().catch(() => ({}));
  return String(body.country || "").trim();
}

async function handle(request) {
  try {
    if (request.method === "GET") {
      const country = await readCountry(request);
      if (!country) {
        return json({
          ok: true,
          message: "apostille api is running",
          usage: "POST /api/apostille with JSON body: { \"country\": \"국가명\" }"
        });
      }
    }

    if (request.method !== "POST" && request.method !== "GET") {
      return json({ error: "GET 또는 POST 요청만 지원합니다." }, 405);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return json({
        error: "Vercel 환경변수 ANTHROPIC_API_KEY가 설정되지 않았습니다."
      }, 500);
    }

    const country = await readCountry(request);
    if (!country) {
      return json({ error: "조회할 국가명을 입력해 주세요." }, 400);
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 1000,
        system: APOSTILLE_SYSTEM_PROMPT,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3
        }],
        messages: [{
          role: "user",
          content: `"${country}"이(가) 아포스티유(Apostille) 헤이그 협약 가입국인지 HCCH 공식 사이트(hcch.net) 또는 외교부 아포스티유 사이트(apostille.go.kr) 기준으로 확인해 주세요. 가입일, 권한기관 정보도 포함해 JSON으로만 답하세요.`
        }]
      })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return json({
        error: data?.error?.message || `Anthropic API 오류: HTTP ${response.status}`,
        upstreamStatus: response.status
      }, 502);
    }

    const text = (data?.content || [])
      .filter(item => item.type === "text")
      .map(item => item.text)
      .join("")
      .trim();

    if (!text) {
      return json({
        error: "Anthropic 응답에 텍스트 결과가 없습니다.",
        stopReason: data?.stop_reason || null
      }, 502);
    }

    return json({ result: extractJson(text) });
  } catch (error) {
    return json({
      error: error?.message || "아포스티유 조회 중 오류가 발생했습니다."
    }, 500);
  }
}

export default handle;
export const GET = handle;
export const POST = handle;
```
