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
  // Not the user's Wi-Fi: by default the browser streams audio to its own
  // speech servers, and this fires when *those* cannot be reached — which is
  // common behind restrictive ISPs, firewalls and VPNs. On-device recognition
  // removes the dependency entirely, so we offer that instead of blaming the
  // user's connection.
  network: 'Your browser could not reach its online speech service. This is not your Wi-Fi — switching to offline recognition fixes it.',
  aborted: null // user-initiated stop; not worth surfacing
};

export const isSpeechSupported = () => Boolean(SpeechRecognitionAPI);
export const isSynthesisSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

/** True when this browser can run recognition without a speech server. */
export const supportsOnDevice = () =>
  Boolean(SpeechRecognitionAPI && SpeechRecognitionAPI.available && SpeechRecognitionAPI.install);

/**
 * Availability of the on-device model for a language.
 * @returns {Promise<'available'|'downloadable'|'downloading'|'unavailable'|'unsupported'>}
 */
export async function onDeviceStatus(lang) {
  if (!supportsOnDevice()) return 'unsupported';
  try {
    return await SpeechRecognitionAPI.available({ langs: [lang], processLocally: true });
  } catch {
    return 'unsupported';
  }
}

/**
 * Brave ships without Google's speech API key *and* blocks the on-device model
 * download, so neither recognition path can work there. Detecting it lets us
 * give honest advice instead of offering a button that would hang.
 */
let braveCache = null;
export async function isBraveBrowser() {
  if (braveCache !== null) return braveCache;
  try {
    braveCache = Boolean(navigator.brave && (await navigator.brave.isBrave()));
  } catch {
    braveCache = false;
  }
  return braveCache;
}

/** How long to wait for the model download before giving up. */
const INSTALL_TIMEOUT_MS = 240000; // measured: ~150s on Chrome over a decent link

/**
 * Downloads the on-device language pack. This is a one-time download of a
 * sizeable model, so it must be triggered by a user gesture — the API throws
 * NotAllowedError otherwise.
 *
 * The promise is raced against a timeout because some Chromium builds (Brave
 * in particular) never settle it: the download endpoint is blocked, so the
 * call hangs indefinitely rather than rejecting.
 *
 * @returns {Promise<'installed'|'timeout'|'failed'|'unsupported'>}
 */
export async function installOnDevice(lang) {
  if (!supportsOnDevice()) return 'unsupported';
  let timer;
  try {
    const outcome = await Promise.race([
      SpeechRecognitionAPI.install({ langs: [lang], processLocally: true }).then(() => 'done'),
      new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), INSTALL_TIMEOUT_MS); })
    ]);
    if (outcome === 'timeout') return 'timeout';
    return (await onDeviceStatus(lang)) === 'available' ? 'installed' : 'failed';
  } catch (err) {
    console.warn('On-device speech install failed', err);
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

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
    /** When true, recognition runs locally and needs no speech server. */
    this.localMode = false;
    if (SpeechRecognitionAPI) this.#build();
  }

  /**
   * Switches to on-device recognition if the model is already installed.
   * Cheap and silent — safe to call on startup and on every language change.
   * @returns {Promise<boolean>} whether local mode is now active
   */
  async useOnDeviceIfReady() {
    if ((await onDeviceStatus(this.lang)) !== 'available') return this.localMode;
    this.localMode = true;
    if (this.recognition) this.recognition.processLocally = true;
    return true;
  }

  /**
   * Downloads the on-device model and switches to it. Call from a click
   * handler so the browser sees a user gesture.
   * @returns {Promise<'installed'|'timeout'|'failed'|'unsupported'>}
   */
  async enableOnDevice() {
    const outcome = await installOnDevice(this.lang);
    if (outcome === 'installed') {
      this.localMode = true;
      if (this.recognition) this.recognition.processLocally = true;
    }
    return outcome;
  }

  #build() {
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = this.lang;
    if ('processLocally' in recognition) recognition.processLocally = this.localMode;

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

  /**
   * Switching language may move us between a downloaded model and one that is
   * not installed, so local mode is re-evaluated for the new language.
   */
  setLanguage(bcp47) {
    this.lang = bcp47;
    if (this.recognition) this.recognition.lang = bcp47;
    this.localMode = false;
    if (this.recognition && 'processLocally' in this.recognition) {
      this.recognition.processLocally = false;
    }
    return this.useOnDeviceIfReady();
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
