```js
const APOSTILLE_SYSTEM_PROMPT = `당신은 대한민국 초등학교 학적 담당자를 돕는 전문 보조 AI입니다.
사용자가 입력한 국가가 헤이그 협약(아포스티유, Apostille Convention)에 가입되어 있는지 웹 검색을 통해 최신 정보를 확인하고, 다음 JSON 형식으로만 답하세요.
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

function sendJson(res, status, payload) {
  try {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify(payload));
  } catch (error) {
    return res.end(JSON.stringify({
      error: "응답 생성 중 오류가 발생했습니다.",
      detail: error && error.message ? error.message : String(error)
    }));
  }
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

async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "POST 요청만 지원합니다." });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return sendJson(res, 500, { error: "Vercel 환경변수 ANTHROPIC_API_KEY가 설정되지 않았습니다." });
    }

    let body = {};
    try {
      if (req.body && typeof req.body === "object") {
        body = req.body;
      } else if (typeof req.body === "string") {
        body = JSON.parse(req.body || "{}");
      }
    } catch (error) {
      return sendJson(res, 400, {
        error: "요청 본문 JSON을 읽지 못했습니다.",
        detail: error && error.message ? error.message : String(error)
      });
    }

    const country = String((body && body.country) || "").trim();
    if (!country) {
      return sendJson(res, 400, { error: "조회할 국가명을 입력해 주세요." });
    }

    if (typeof fetch !== "function") {
      return sendJson(res, 500, {
        error: "현재 Vercel Node 런타임에서 fetch를 사용할 수 없습니다. Project Settings에서 Node.js 18 이상을 사용해 주세요."
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
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
          max_uses: 3,
          allowed_domains: ["hcch.net", "apostille.go.kr", "mofa.go.kr"]
        }],
        messages: [{
          role: "user",
          content: `"${country}"이(가) 아포스티유(Apostille) 헤이그 협약 가입국인지 HCCH 공식 사이트(hcch.net) 또는 외교부 아포스티유 사이트(apostille.go.kr)에서 최신 정보를 검색해 확인해 주세요. 가입일, 권한기관 정보도 포함해 JSON으로만 답하세요.`
        }]
      })
    });

    clearTimeout(timeout);

    const data = await anthropicResp.json().catch(() => null);

    if (!anthropicResp.ok) {
      const message = data?.error?.message || `Anthropic API 오류: HTTP ${anthropicResp.status}`;
      return sendJson(res, 502, { error: message, upstreamStatus: anthropicResp.status });
    }

    const text = (data?.content || [])
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("")
      .trim();

    if (!text) {
      return sendJson(res, 502, {
        error: "Anthropic 응답에 텍스트 결과가 없습니다.",
        stopReason: data?.stop_reason || null
      });
    }

    const result = extractJson(text);
    return sendJson(res, 200, { result });
  } catch (error) {
    if (error && error.name === "AbortError") {
      return sendJson(res, 504, {
        error: "아포스티유 실시간 조회가 8초 안에 끝나지 않았습니다. 잠시 후 다시 시도해 주세요."
      });
    }

    return sendJson(res, 500, {
      error: error && error.message ? error.message : "아포스티유 조회 중 오류가 발생했습니다."
    });
  }
}

module.exports = handler;
```
