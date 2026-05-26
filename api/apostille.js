export function GET() {
  return new Response(JSON.stringify({
    ok: true,
    message: "apostille api is running"
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  return new Response(JSON.stringify({
    ok: true,
    received: body
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
