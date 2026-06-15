// Retry helper for network loads. Retries on transient fetch/network errors only.
// Non-retryable errors (e.g. 404, parse errors) are re-thrown immediately.

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 800;

function isTransientError(err) {
    if (!err) return false;
    const msg = (err.message || String(err)).toLowerCase();
    return (
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('load failed') ||
        msg.includes('network request failed') ||
        msg.includes('fetch')
    );
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an async factory fn with exponential-backoff retry on transient network errors.
 * @param {() => Promise<T>} fn  - async factory that performs the load
 * @param {object} [options]
 * @param {number} [options.maxAttempts=3]
 * @param {number} [options.baseDelayMs=800]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxAttempts && isTransientError(err)) {
                await delay(baseDelayMs * attempt);
            } else {
                break;
            }
        }
    }
    throw lastError;
}

/**
 * fetch() with exponential-backoff retry on network errors.
 * Only retries if the error is transient (network drop, not 4xx/5xx).
 */
export async function fetchWithRetry(url, fetchOptions, retryOptions) {
    return withRetry(async () => {
        const response = await fetch(url, fetchOptions);
        // HTTP errors are not retried — 404 won't be fixed by retrying.
        if (!response.ok) {
            const err = new Error(`HTTP ${response.status} ${response.statusText}`);
            err.status = response.status;
            throw err;
        }
        return response;
    }, retryOptions);
}

/**
 * THREE.js loader.loadAsync() with retry.
 * @param {object} loader - any THREE loader with loadAsync(url)
 * @param {string} url
 * @param {object} [retryOptions]
 */
export function loaderLoadAsyncWithRetry(loader, url, retryOptions) {
    return withRetry(() => loader.loadAsync(url), retryOptions);
}

/**
 * THREE.js loader.load() (callback-based) converted to Promise with retry.
 */
export function loaderLoadWithRetry(loader, url, retryOptions) {
    return withRetry(
        () =>
            new Promise((resolve, reject) => {
                loader.load(url, resolve, undefined, reject);
            }),
        retryOptions
    );
}
