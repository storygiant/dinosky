export class AudioManager {
    constructor(options = {}) {
        this.masterVolume = this.clampVolume(options.masterVolume ?? 0.75);
        this.sounds = new Map();
        this.loops = new Map();
        this.pendingLoops = new Map();
        this.lastPlayTimes = new Map();
        this.unlocked = false;
        this.enabled = options.enabled !== false;
        this.defaultCooldown = Math.max(0, Number(options.defaultCooldown ?? 0.04));
        this.maxOneShotInstances = Math.max(1, Math.floor(Number(options.maxOneShotInstances ?? 5)));
        this.audioContext = null;
        this.decodedSounds = new Map();
        this.decodingSounds = new Set();
        this.failedWebAudioDecodes = new Set();
        this.scheduledWarmSounds = new Set();
        this.useWebAudio = options.useWebAudio !== false;
        this.skipHtmlFallbackUntilDecoded = this.isLikelyIos();
        this.unlockHandler = () => this.unlock();
        this.installUnlockListeners();
    }

    installUnlockListeners() {
        if (typeof window === 'undefined') {
            this.unlocked = true;
            return;
        }

        // Browser audio is locked until a real user gesture. These listeners flip the manager
        // into playback mode on the first pointer/key interaction, then remove themselves.
        window.addEventListener('pointerdown', this.unlockHandler, { once: true, capture: true });
        window.addEventListener('keydown', this.unlockHandler, { once: true, capture: true });

        // iOS suspends the AudioContext when the app is backgrounded. Resume it on return.
        // BufferSource nodes may also be stopped by iOS, so restart active Web Audio loops.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this._resumeAfterBackground();
            }
        });
    }

    loadSounds(soundMap = {}) {
        for (const [name, url] of Object.entries(soundMap)) {
            this.sounds.set(name, {
                url,
                base: null,
                pool: [],
                poolIndex: 0
            });
        }

        if (this.unlocked) {
            this.warmAllSounds();
        }
    }

    unlock() {
        if (this.unlocked) {
            return;
        }

        this.unlocked = true;
        this.ensureAudioContext();
        this.warmAllSounds();
        if (typeof window !== 'undefined') {
            window.removeEventListener('pointerdown', this.unlockHandler, { capture: true });
            window.removeEventListener('keydown', this.unlockHandler, { capture: true });
        }

        // Start any loops requested before the first gesture, such as an already-active chopper.
        // Clear first so Web Audio loops that are still decoding can re-add themselves as pending.
        const pendingLoops = [...this.pendingLoops.entries()];
        this.pendingLoops.clear();
        for (const [name, options] of pendingLoops) {
            this.startLoop(name, options);
        }
    }

    _resumeAfterBackground() {
        const ctx = this.audioContext;
        if (!ctx) return;

        const doResume = () => {
            // Restart any Web Audio loops whose BufferSource was stopped by iOS.
            for (const [name, loop] of this.loops.entries()) {
                if (!loop.source) continue;
                try {
                    const buffer = loop.source.buffer;
                    if (!buffer) continue;
                    try { loop.source.stop(); } catch { /* already stopped */ }
                    loop.source.disconnect?.();
                    const newSource = ctx.createBufferSource();
                    newSource.buffer = buffer;
                    newSource.loop = true;
                    newSource.playbackRate.value = loop.playbackRate ?? 1;
                    newSource.connect(loop.gain);
                    newSource.start(0);
                    loop.source = newSource;
                } catch {
                    // If anything fails, remove the loop so it gets restarted by game logic.
                    this.loops.delete(name);
                }
            }
        };

        if (ctx.state === 'suspended') {
            ctx.resume().then(doResume).catch(() => {});
        } else {
            doResume();
        }
    }

    play(name, options = {}) {
        const sound = this.sounds.get(name);
        if (!sound || !this.unlocked || !this.enabled) {
            return null;
        }

        const now = performance.now();
        const cooldown = Math.max(0, Number(options.cooldown ?? this.defaultCooldown));
        const lastPlay = this.lastPlayTimes.get(name) ?? -Infinity;
        if (now - lastPlay < cooldown * 1000) {
            return null;
        }
        this.lastPlayTimes.set(name, now);

        const webAudio = this.playWebAudioOneShot(name, sound, options);
        if (webAudio) {
            return webAudio;
        }

        if (this.shouldSkipHtmlFallback(name)) {
            return null;
        }

        const audio = this.getOneShotAudio(sound);
        audio.loop = false;
        audio.volume = this.getEffectiveVolume(options.volume);
        audio.playbackRate = this.getPlaybackRate(options.playbackRate, options.detune);
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return audio;
    }

    playRandom(names = [], options = {}) {
        const choices = names.filter((name) => this.sounds.has(name));
        if (!choices.length) {
            return null;
        }

        const name = choices[Math.floor(Math.random() * choices.length)];
        return this.play(name, options);
    }

    startLoop(name, options = {}) {
        if (!this.sounds.has(name)) {
            return null;
        }
        if (!this.enabled) {
            this.pendingLoops.delete(name);
            return null;
        }

        // Loops are state-driven: if the loop is already active, keep it running instead of
        // restarting every frame. Call stopLoop when that gameplay state ends.
        if (this.loops.has(name)) {
            const activeLoop = this.loops.get(name);
            activeLoop.audioManagerVolume = this.clampVolume(options.volume ?? activeLoop.audioManagerVolume ?? 1);
            if (activeLoop.gain?.gain) {
                activeLoop.gain.gain.value = this.getEffectiveVolume(activeLoop.audioManagerVolume);
            } else {
                activeLoop.volume = this.getEffectiveVolume(activeLoop.audioManagerVolume);
            }
            return activeLoop;
        }

        if (!this.unlocked) {
            this.pendingLoops.set(name, { ...options });
            return null;
        }

        const sound = this.sounds.get(name);
        const webAudioLoop = this.startWebAudioLoop(name, sound, options);
        if (webAudioLoop) {
            return webAudioLoop;
        }

        if (this.shouldSkipHtmlFallback(name)) {
            this.pendingLoops.set(name, { ...options });
            return null;
        }

        const audio = new Audio(sound.url);
        audio.preload = 'auto';
        audio.loop = true;
        audio.audioManagerVolume = this.clampVolume(options.volume ?? 1);
        audio.volume = this.getEffectiveVolume(audio.audioManagerVolume);
        audio.playbackRate = this.getPlaybackRate(options.playbackRate, options.detune);
        this.loops.set(name, audio);
        audio.play().catch(() => {
            this.loops.delete(name);
        });
        return audio;
    }

    stopLoop(name) {
        this.pendingLoops.delete(name);
        const audio = this.loops.get(name);
        if (!audio) {
            return;
        }

        if (audio.source?.stop) {
            try {
                audio.source.stop();
            } catch {
                // The source may already have ended.
            }
            audio.gain?.disconnect?.();
        } else {
            audio.pause();
            audio.currentTime = 0;
        }
        this.loops.delete(name);
    }

    setMasterVolume(value) {
        this.masterVolume = this.clampVolume(value);
        for (const audio of this.loops.values()) {
            if (audio.gain?.gain) {
                audio.gain.gain.value = this.getEffectiveVolume(audio.audioManagerVolume ?? 1);
            } else {
                audio.volume = this.getEffectiveVolume(audio.audioManagerVolume ?? 1);
            }
        }
    }

    setEnabled(value) {
        this.enabled = value !== false;
        if (this.enabled) {
            return;
        }

        this.pendingLoops.clear();
        for (const name of [...this.loops.keys()]) {
            this.stopLoop(name);
        }
    }

    isEnabled() {
        return this.enabled;
    }

    getOneShotAudio(sound) {
        const reusable = sound.pool.find((audio) => audio.paused || audio.ended);
        if (reusable) {
            return reusable;
        }

        if (sound.pool.length < this.maxOneShotInstances) {
            const audio = new Audio(sound.url);
            audio.preload = 'auto';
            sound.pool.push(audio);
            return audio;
        }

        const audio = sound.pool[sound.poolIndex % sound.pool.length];
        sound.poolIndex += 1;
        audio.pause();
        return audio;
    }

    ensureAudioContext() {
        if (!this.useWebAudio || typeof window === 'undefined') {
            return this.audioContext;
        }

        if (this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume?.().catch?.(() => {});
            }
            return this.audioContext;
        }

        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            return null;
        }

        this.audioContext = new AudioContextCtor();
        this.audioContext.resume?.().catch?.(() => {});
        return this.audioContext;
    }

    warmAllSounds() {
        const context = this.ensureAudioContext();
        if (!context) {
            return;
        }

        let delayMs = 0;
        for (const name of this.sounds.keys()) {
            if (this.scheduledWarmSounds.has(name) || this.decodedSounds.has(name)) {
                continue;
            }

            this.scheduledWarmSounds.add(name);
            window.setTimeout(() => {
                this.scheduledWarmSounds.delete(name);
                this.decodeSound(name);
            }, delayMs);
            delayMs += 25;
        }
    }

    async decodeSound(name) {
        if (this.decodedSounds.has(name) || this.decodingSounds.has(name)) {
            return this.decodedSounds.get(name) || null;
        }

        const sound = this.sounds.get(name);
        const context = this.ensureAudioContext();
        if (!sound || !context || typeof fetch !== 'function') {
            return null;
        }

        this.decodingSounds.add(name);
        try {
            const response = await fetch(sound.url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await context.decodeAudioData(arrayBuffer);
            this.decodedSounds.set(name, audioBuffer);
            this.startPendingLoopIfReady(name);
            return audioBuffer;
        } catch (error) {
            this.failedWebAudioDecodes.add(name);
            console.warn(`[AudioManager] Failed to decode sound "${name}". Falling back to HTML audio.`, error);
            return null;
        } finally {
            this.decodingSounds.delete(name);
        }
    }

    playWebAudioOneShot(name, sound, options = {}) {
        const context = this.ensureAudioContext();
        const buffer = this.decodedSounds.get(name);
        if (!context || !buffer) {
            this.decodeSound(name);
            return null;
        }

        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.loop = false;
        source.playbackRate.value = this.getPlaybackRate(options.playbackRate, options.detune);
        gain.gain.value = this.getEffectiveVolume(options.volume);
        source.connect(gain);
        gain.connect(context.destination);
        source.onended = () => {
            gain.disconnect();
        };
        source.start(0);
        return source;
    }

    startWebAudioLoop(name, sound, options = {}) {
        const context = this.ensureAudioContext();
        const buffer = this.decodedSounds.get(name);
        if (!context || !buffer) {
            this.decodeSound(name);
            return null;
        }

        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.loop = true;
        source.playbackRate.value = this.getPlaybackRate(options.playbackRate, options.detune);
        gain.gain.value = this.getEffectiveVolume(options.volume);
        source.connect(gain);
        gain.connect(context.destination);

        const loop = {
            source,
            gain,
            audioManagerVolume: this.clampVolume(options.volume ?? 1),
            playbackRate: source.playbackRate.value
        };
        this.loops.set(name, loop);
        source.start(0);
        return loop;
    }

    startPendingLoopIfReady(name) {
        if (!this.pendingLoops.has(name) || this.loops.has(name) || !this.enabled || !this.unlocked) {
            return;
        }

        const options = this.pendingLoops.get(name);
        this.pendingLoops.delete(name);
        this.startLoop(name, options);
    }

    shouldSkipHtmlFallback(name) {
        return this.skipHtmlFallbackUntilDecoded &&
            this.useWebAudio &&
            this.audioContext &&
            !this.failedWebAudioDecodes.has(name) &&
            !this.decodedSounds.has(name);
    }

    getEffectiveVolume(value) {
        return this.masterVolume * this.clampVolume(value ?? 1);
    }

    getPlaybackRate(playbackRate, detune = 0) {
        const baseRate = Number.isFinite(playbackRate) ? playbackRate : 1;
        const detunedRate = baseRate * Math.pow(2, Number(detune || 0) / 1200);
        return Math.max(0.25, Math.min(4, detunedRate));
    }

    clampVolume(value) {
        return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
    }

    isLikelyIos() {
        if (typeof navigator === 'undefined') {
            return false;
        }

        const platform = navigator.platform || '';
        const userAgent = navigator.userAgent || '';
        return /iPad|iPhone|iPod/.test(platform) ||
            (/Mac/.test(platform) && navigator.maxTouchPoints > 1) ||
            /iPad|iPhone|iPod/.test(userAgent);
    }
}
