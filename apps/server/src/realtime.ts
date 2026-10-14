// Mints short-lived Realtime API keys so the browser can connect directly over WebRTC.
// The real API key never leaves the server. Docs: developers.openai.com/api/docs/guides/realtime-webrtc

export interface RealtimeConfig {
  apiKey: string;
  model: string;
  voice: string;
}

export interface ClientSecret {
  value: string;
  expires_at: number;
}

export async function createClientSecret(
  config: RealtimeConfig,
  safetyIdentifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ClientSecret> {
  const res = await fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': safetyIdentifier,
    },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model: config.model,
        audio: { output: { voice: config.voice } },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`client_secrets failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as ClientSecret;
  return { value: data.value, expires_at: data.expires_at };
}
