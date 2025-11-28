/**
 * Service Worker Registration Utility
 *
 * Handles registration and lifecycle management of the Maestro
 * mobile web service worker for offline capability.
 */

/**
 * Configuration for service worker registration
 */
export interface ServiceWorkerConfig {
  /** Called when service worker is registered successfully */
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  /** Called when service worker update is available */
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  /** Called when offline status changes */
  onOfflineChange?: (isOffline: boolean) => void;
  /** Called when service worker sends a message */
  onMessage?: (message: unknown) => void;
}

/**
 * Check if service workers are supported in this browser
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator;
}

/**
 * Register the service worker for offline capability
 *
 * @param config - Configuration options for registration
 * @returns Promise that resolves to the registration or undefined if not supported
 */
export async function registerServiceWorker(
  config: ServiceWorkerConfig = {}
): Promise<ServiceWorkerRegistration | undefined> {
  if (!isServiceWorkerSupported()) {
    console.log('[SW] Service workers not supported');
    return undefined;
  }

  const { onSuccess, onUpdate, onOfflineChange, onMessage } = config;

  // Set up offline status listener
  if (onOfflineChange) {
    window.addEventListener('online', () => onOfflineChange(false));
    window.addEventListener('offline', () => onOfflineChange(true));

    // Also listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'connection-change') {
        onOfflineChange(!event.data.online);
      }
      // Forward other messages
      onMessage?.(event.data);
    });
  } else if (onMessage) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      onMessage(event.data);
    });
  }

  try {
    // Get security token from config for absolute path
    const config = (window as unknown as { __MAESTRO_CONFIG__?: { securityToken?: string } }).__MAESTRO_CONFIG__;
    const token = config?.securityToken;

    // Use absolute path with token prefix if available
    const swPath = token ? `/${token}/sw.js` : './sw.js';
    const swScope = token ? `/${token}/` : './';

    // Register the service worker
    const registration = await navigator.serviceWorker.register(swPath, {
      scope: swScope,
    });

    console.log('[SW] Service worker registered:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New update available
            console.log('[SW] New content available, refresh to update');
            onUpdate?.(registration);
          } else {
            // First install - content cached
            console.log('[SW] Content cached for offline use');
            onSuccess?.(registration);
          }
        }
      });
    });

    // Check if already active
    if (registration.active) {
      onSuccess?.(registration);
    }

    return registration;
  } catch (error) {
    console.error('[SW] Service worker registration failed:', error);
    return undefined;
  }
}

/**
 * Unregister the service worker
 *
 * @returns Promise that resolves to true if unregistration was successful
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const success = await registration.unregister();
    console.log('[SW] Service worker unregistered:', success);
    return success;
  } catch (error) {
    console.error('[SW] Service worker unregistration failed:', error);
    return false;
  }
}

/**
 * Check if the browser is currently offline
 */
export function isOffline(): boolean {
  return !navigator.onLine;
}

/**
 * Skip waiting for the new service worker
 * Call this when user confirms they want to update
 */
export function skipWaiting(): void {
  if (!isServiceWorkerSupported()) return;

  navigator.serviceWorker.ready.then((registration) => {
    registration.waiting?.postMessage('skipWaiting');
  });
}

/**
 * Ping the service worker to check if it's active
 * @returns Promise that resolves to true if SW responded
 */
export async function pingServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) return false;

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data === 'pong');
      };

      // Timeout after 1 second
      setTimeout(() => resolve(false), 1000);

      registration.active.postMessage('ping', [messageChannel.port2]);
    });
  } catch {
    return false;
  }
}
