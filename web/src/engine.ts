/**
 * Client de génération.
 *
 * Trois garanties, exigées par le document (§13) :
 *  - un **numéro de requête** croissant ; un résultat plus ancien est jeté ;
 *  - l'**annulation** : une requête en vol est abandonnée, pas attendue ;
 *  - un **repli** synchrone si le Worker n'est pas disponible, plutôt qu'une
 *    page qui ne rend rien.
 */

import {
  generate,
  PROTOCOL_VERSION,
  type GenerateRequest,
  type GenerateResponse,
} from '../../src/workers/generate.js';

export type EngineStatus = 'idle' | 'working' | 'fallback';

export type EngineListener = (response: GenerateResponse) => void;

export class Engine {
  private worker: Worker | null = null;
  private nextId = 1;
  private lastDelivered = 0;
  private pending = 0;
  private listener: EngineListener | null = null;
  private statusListener: ((status: EngineStatus, pending: number) => void) | null = null;
  readonly usesWorker: boolean;

  constructor() {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<GenerateResponse>) => this.deliver(event.data);
      this.worker.onerror = () => {
        // Un Worker indisponible ne doit pas laisser l'atelier vide : on
        // bascule sur le rendu synchrone et on le dit dans l'interface.
        this.worker?.terminate();
        this.worker = null;
        this.statusListener?.('fallback', this.pending);
      };
      this.usesWorker = true;
    } catch {
      this.worker = null;
      this.usesWorker = false;
    }
  }

  onResult(listener: EngineListener): void {
    this.listener = listener;
  }

  onStatus(listener: (status: EngineStatus, pending: number) => void): void {
    this.statusListener = listener;
  }

  private deliver(response: GenerateResponse): void {
    this.pending = Math.max(0, this.pending - 1);
    if (response.protocol !== PROTOCOL_VERSION) return;
    // Protection contre les résultats périmés : un rendu ancien ne remplace
    // jamais un rendu plus récent.
    if (response.requestId < this.lastDelivered) return;
    this.lastDelivered = response.requestId;
    this.listener?.(response);
    this.statusListener?.(this.pending > 0 ? 'working' : 'idle', this.pending);
  }

  /** Abandonne les résultats en vol : leur numéro sera inférieur au suivant. */
  cancel(): void {
    this.lastDelivered = this.nextId;
    this.pending = 0;
    this.statusListener?.('idle', 0);
  }

  request(input: Omit<GenerateRequest, 'protocol' | 'requestId'>): number {
    const requestId = this.nextId++;
    const message: GenerateRequest = { ...input, protocol: PROTOCOL_VERSION, requestId };
    this.pending += 1;
    this.statusListener?.('working', this.pending);
    if (this.worker) {
      this.worker.postMessage(message);
    } else {
      // Repli synchrone : le résultat passe par le même chemin.
      const response = generate(message);
      queueMicrotask(() => this.deliver(response));
    }
    return requestId;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
