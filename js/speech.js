/**
 * speech.js — Thin wrapper over the Web Speech API.
 *
 * Recognition runs entirely on the device (no audio ever leaves the browser and
 * there is no API key to leak), which is why it was chosen over a cloud STT
 * service for this build. The wrapper's real job is defensive: the API is
 * inconsistent across browsers, fires errors for ordinary situations like
 * silence, and throws if you call start() twice, so every caller-visible state
 * change is funnelled through explicit events.
 */

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

/** Maps raw API error codes onto messages a shopper can act on. */
const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access was blocked. Enable it in your browser settings, or type instead.',
  'service-not-allowed': 'Speech service unavailable. Try Chrome or Edge, or type your command.',
  'audio-capture': 'No microphone found. Plug one in, or type your command.',
  'no-speech': 'I did not hear anything — tap the mic and try again.',
  network: 'Speech recognition needs a network connection right now.',
  aborted: null // user-initiated stop; not worth surfacing
};

export const isSpeechSupported = () => Boolean(SpeechRecognitionAPI);
export const isSynthesisSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

export class VoiceEngine {
  /**
   * @param {object} handlers
   * @param {(text:string)=>void} handlers.onInterim  partial transcript, for live feedback
   * @param {(text:string, confidence:number)=>void} handlers.onFinal
   * @param {(message:string, code:string)=>void} handlers.onError
   * @param {(state:'idle'|'listening')=>void} handlers.onStateChange
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.lang = 'en-US';
    this.listening = false;
    this.muted = false;
    this.recognition = null;
    if (SpeechRecognitionAPI) this.#build();
  }

  #build() {
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = this.lang;

    recognition.onstart = () => {
      this.listening = true;
      this.handlers.onStateChange?.('listening');
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          this.handlers.onFinal?.(transcript.trim(), result[0].confidence ?? 0);
        } else {
          interim += transcript;
        }
      }
      if (interim) this.handlers.onInterim?.(interim.trim());
    };

    recognition.onerror = (event) => {
      const message = ERROR_MESSAGES[event.error];
      if (message !== null) {
        this.handlers.onError?.(message || `Speech error: ${event.error}`, event.error);
      }
    };

    recognition.onend = () => {
      this.listening = false;
      this.handlers.onStateChange?.('idle');
    };

    this.recognition = recognition;
  }

  setLanguage(bcp47) {
    this.lang = bcp47;
    if (this.recognition) this.recognition.lang = bcp47;
  }

  start() {
    if (!this.recognition) {
      this.handlers.onError?.(
        'Voice input is not supported in this browser. Chrome, Edge and Safari work — you can type commands meanwhile.',
        'unsupported'
      );
      return false;
    }
    if (this.listening) return false;
    try {
      this.recognition.start();
      return true;
    } catch (err) {
      // start() throws InvalidStateError if the engine is still winding down.
      this.handlers.onError?.('Could not start listening. Give it a second and try again.', 'start-failed');
      return false;
    }
  }

  stop() {
    if (this.recognition && this.listening) {
      try {
        this.recognition.stop();
      } catch {
        /* already stopped — nothing to do */
      }
    }
  }

  toggle() {
    return this.listening ? (this.stop(), false) : this.start();
  }

  /** Speaks a short confirmation. Silently no-ops when muted or unsupported. */
  speak(text, langCode = this.lang) {
    if (this.muted || !isSynthesisSupported() || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langCode;
      utterance.rate = 1.05;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis failed', err);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted && isSynthesisSupported()) window.speechSynthesis.cancel();
  }
}
