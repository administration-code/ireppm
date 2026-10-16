export const dynamic = "force-dynamic";

export function GET(request) {
  const error = new URL(request.url).searchParams.get("error");
  const message = error ? "DocuSign access was not granted. You can close this tab and try again." : "DocuSign access granted. You can close this tab.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DocuSign</title></head>
<body style="font-family:Arial,sans-serif;background:#F7F4EE;color:#161616;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<p style="font-size:18px;padding:24px;text-align:center">${message}</p></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
