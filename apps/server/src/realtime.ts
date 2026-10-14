// Mints short-lived Realtime API keys so the browser can connect directly over WebRTC.
// The real API key never leaves the server. Docs: developers.openai.com/api/docs/guides/realtime-webrtc

export interface RealtimeConfig {
  apiKey: string;
  model: string;
  voice: string;
  /** Model that transcribes the student's speech for the chat panel. Dropped if the API rejects it. */
  transcribeModel?: string;
}

export interface ClientSecret {
  value: string;
  expires_at: number;
  /** So the client can price usage for the model actually in use. */
  model?: string;
}

export async function createClientSecret(
  config: RealtimeConfig,
  safetyIdentifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ClientSecret> {
  const request = (withTranscription: boolean) =>
    fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
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
          audio: {
            input: {
              turn_detection: { type: 'semantic_vad' },
              ...(withTranscription && config.transcribeModel ? { transcription: { model: config.transcribeModel } } : {}),
            },
            output: { voice: config.voice },
          },
        },
      }),
    });

  let res = await request(true);
  if (res.status === 400 && config.transcribeModel) {
    // Unknown transcription model shouldn't take the whole tutor down: retry without it.
    console.warn(`client_secrets rejected transcription config, retrying without: ${await res.text()}`);
    res = await request(false);
  }
  if (!res.ok) {
    throw new Error(`client_secrets failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as ClientSecret;
  return { value: data.value, expires_at: data.expires_at, model: config.model };
}
