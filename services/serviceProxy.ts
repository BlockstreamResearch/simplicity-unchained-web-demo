type ServiceEndpoint = "tweak" | "sign/psbt" | "sign/pset";

export async function checkServiceHealth(
  serviceUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  try {
    const upstream = await fetcher(`${serviceUrl}/simplicity-unchained/version`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data: unknown = await upstream.json().catch(() => null);
    const version = typeof data === "object" && data !== null && "version" in data && typeof data.version === "string"
      ? data.version : null;
    if (upstream.ok && version) return Response.json({ online: true, version });
    return Response.json({ online: false, error: `Unexpected response from ${serviceUrl} (${upstream.status}).` }, { status: 502 });
  } catch {
    return Response.json({ online: false, error: `Cannot reach Simplicity Unchained at ${serviceUrl}.` }, { status: 503 });
  }
}

export async function proxyServiceRequest(
  request: Request,
  endpoint: ServiceEndpoint,
  serviceUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("Invalid Simplicity proxy request:", error);
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  let upstream: Response;
  let text: string;
  try {
    upstream = await fetcher(`${serviceUrl}/simplicity-unchained/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    text = await upstream.text();
  } catch (error) {
    console.error(`Simplicity service unavailable at ${serviceUrl} (${endpoint}):`, error);
    return Response.json({
      error: `Cannot reach Simplicity Unchained at ${serviceUrl}. Start the backend service and retry. Check /simplicity-unchained/version on that URL; see DEPLOYMENT.md for startup commands.`,
    }, { status: 503 });
  }

  if (!upstream.ok && !upstream.headers.get("content-type")?.includes("application/json")) {
    console.error(`Simplicity ${endpoint} failed (${upstream.status}): ${text}`);
    return Response.json({ error: text || upstream.statusText }, { status: upstream.status });
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    console.error(`Invalid JSON from Simplicity ${endpoint} (${upstream.status}):`, error);
    return Response.json({ error: `Simplicity Unchained returned an invalid JSON response for ${endpoint}. Check the configured service URL and backend logs.` }, { status: 502 });
  }

  if (!upstream.ok) {
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
      ? data.error : `Simplicity Unchained rejected ${endpoint} (${upstream.status}).`;
    console.error(`Simplicity ${endpoint} failed (${upstream.status}): ${message}`);
    return Response.json({ error: message }, { status: upstream.status });
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    console.error(`Invalid response object from Simplicity ${endpoint}:`, data);
    return Response.json({ error: `Simplicity Unchained returned an invalid response for ${endpoint}.` }, { status: 502 });
  }
  return Response.json(data);
}
