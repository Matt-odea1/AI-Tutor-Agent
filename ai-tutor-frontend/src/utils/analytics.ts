/**
 * Analytics Service
 * 
 * Provides privacy-conscious analytics tracking for user interactions.
 * Designed to work with Google Analytics, Plausible, or similar services.
 * 
 * Privacy principles:
 * - No PII (personally identifiable information) tracking
 * - Anonymized session IDs only
 * - Respect Do Not Track settings
 * - Only enabled in production
 * 
 * @example
 * ```tsx
 * import { trackEvent } from './utils/analytics'
 * 
 * trackEvent('message_sent', { mode: 'explanatory' })
 * ```
 */

interface EventProperties {
  [key: string]: string | number | boolean | undefined
}

interface PageViewProperties {
  /** Page path */
  path: string
  /** Page title */
  title?: string
  /** Referrer */
  referrer?: string
}

/**
 * Analytics configuration
 */
const config = {
  enabled: import.meta.env.PROD && !navigator.doNotTrack, // Respect DNT
  measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID,
  debug: import.meta.env.DEV,
}

/**
 * Initialize analytics tracking
 * Call this once at app startup
 */
export const initAnalytics = () => {
  if (!config.enabled) {
    console.log('[Analytics] Disabled (dev mode or DNT enabled)')
    return
  }

  // In production, initialize Google Analytics or other service:
  // gtag('js', new Date())
  // gtag('config', config.measurementId, {
  //   anonymize_ip: true,
  //   cookie_flags: 'SameSite=None;Secure',
  // })

  console.log('[Analytics] Initialized')
}

/**
 * Track a custom event
 * 
 * @param eventName - Name of the event
 * @param properties - Event properties
 */
export const trackEvent = (eventName: string, properties?: EventProperties) => {
  if (config.debug) {
    console.log('[Analytics] Event:', eventName, properties)
  }

  if (!config.enabled) return

  // Send to analytics service
  // gtag('event', eventName, properties)

  // Or for Plausible:
  // plausible(eventName, { props: properties })
}

/**
 * Track a page view
 * 
 * @param properties - Page view properties
 */
export const trackPageView = (properties: PageViewProperties) => {
  if (config.debug) {
    console.log('[Analytics] Page view:', properties)
  }

  if (!config.enabled) return

  // gtag('config', config.measurementId, {
  //   page_path: properties.path,
  //   page_title: properties.title,
  // })
}

/**
 * Set user properties (no PII)
 * 
 * @param properties - User properties
 */
export const setUserProperties = (properties: EventProperties) => {
  if (config.debug) {
    console.log('[Analytics] User properties:', properties)
  }

  if (!config.enabled) return

  // gtag('set', 'user_properties', properties)
}

// Predefined event tracking functions for common actions

/**
 * Track when a message is sent
 */
export const trackMessageSent = (experienceMode: string) => {
  trackEvent('message_sent', {
    experience_mode: experienceMode,
  })
}

/**
 * Track when code is executed
 */
export const trackCodeExecuted = (hasError: boolean) => {
  trackEvent('code_executed', {
    has_error: hasError,
  })
}

/**
 * Track when a new session is created
 */
export const trackSessionCreated = () => {
  trackEvent('session_created')
}

/**
 * Track when pedagogy mode is changed
 */
export const trackModeChanged = (fromMode: string, toMode: string) => {
  trackEvent('mode_changed', {
    from_mode: fromMode,
    to_mode: toMode,
  })
}

/**
 * Track when code editor is toggled
 */
export const trackCodeEditorToggled = (isOpen: boolean) => {
  trackEvent('code_editor_toggled', {
    is_open: isOpen,
  })
}

/**
 * Track when a file is uploaded
 */
export const trackFileUploaded = (fileType: string, fileSize: number) => {
  trackEvent('file_uploaded', {
    file_type: fileType,
    file_size_kb: Math.round(fileSize / 1024),
  })
}

/**
 * Track API errors
 */
export const trackAPIError = (endpoint: string, statusCode: number) => {
  trackEvent('api_error', {
    endpoint,
    status_code: statusCode,
  })
}

/**
 * Track when user goes offline/online
 */
export const trackNetworkStatus = (isOnline: boolean) => {
  trackEvent('network_status_changed', {
    is_online: isOnline,
  })
}
