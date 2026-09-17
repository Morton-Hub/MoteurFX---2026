/**
 * Fil de génération.
 *
 * Il ne fait que relayer vers `generate` : le même code produit la preview,
 * l'export et le rendu CLI. Les buffers de pixels sont transférés, pas
 * copiés.
 */

import { generate, type GenerateRequest, type GenerateResponse } from '../../src/workers/generate.js';

self.onmessage = (event: MessageEvent<GenerateRequest>) => {
  const request = event.data;
  try {
    const response = generate(request);
    const transfers: ArrayBufferLike[] = response.frames.map((f) => f.rgba.buffer);
    (self as unknown as Worker).postMessage(response, transfers as Transferable[]);
  } catch (error) {
    const failure: GenerateResponse = {
      protocol: request.protocol,
      requestId: request.requestId,
      recipeId: request.recipe?.id ?? '?',
      frames: [],
      durations: [],
      elapsedMs: 0,
      diagnostics: [
        {
          level: 'error',
          code: 'worker-failed',
          message: (error as Error).message,
          path: request.recipe?.id,
        },
      ],
    };
    (self as unknown as Worker).postMessage(failure);
  }
};
