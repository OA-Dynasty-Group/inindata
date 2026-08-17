// api/cache.js - Simple in-memory caching with TTL

class Cache {
  constructor() {
    this.store = new Map();
  }

  /**
   * Get value from cache
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set value in cache with optional TTL (in ms)
   */
  set(key, value, ttl = null) {
    const expiresAt = ttl ? Date.now() + ttl : null;
    this.store.set(key, { value, expiresAt });
    return value;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete entry from cache
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.store.clear();
  }

  /**
   * Get cache size (number of entries)
   */
  size() {
    return this.store.size;
  }

  /**
   * Clean up expired entries
   */
  prune() {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}

// Global cache instances
const instrumentCache = new Cache();
const userPermissionsCache = new Cache();
const analyticsCache = new Cache();

/**
 * Cache TTL constants (in milliseconds)
 */
const TTL = {
  INSTRUMENTS: 5 * 60 * 1000,        // 5 minutes
  PERMISSIONS: 10 * 60 * 1000,       // 10 minutes
  ANALYTICS: 60 * 1000,              // 1 minute
  AUDIT_LOGS: 2 * 60 * 1000,         // 2 minutes
  STATIC_ASSETS: 24 * 60 * 60 * 1000 // 24 hours
};

/**
 * Cache key builders
 */
function getCacheKey(type, ...parts) {
  return `${type}:${parts.join(':')}`;
}

/**
 * Invalidate instrument cache (call when instrument is updated)
 */
function invalidateInstrumentCache(instrumentId = null) {
  if (instrumentId) {
    // Invalidate specific instrument
    instrumentCache.delete(getCacheKey('instrument', instrumentId));
  } else {
    // Invalidate all instruments
    instrumentCache.clear();
  }
}

/**
 * Invalidate user permissions cache (call when permissions are updated)
 */
function invalidatePermissionsCache(userId = null) {
  if (userId) {
    userPermissionsCache.delete(getCacheKey('permissions', userId));
  } else {
    userPermissionsCache.clear();
  }
}

/**
 * Invalidate analytics cache (call when new submission received)
 */
function invalidateAnalyticsCache(instrumentId = null) {
  if (instrumentId) {
    analyticsCache.delete(getCacheKey('analytics', instrumentId));
  } else {
    analyticsCache.clear();
  }
}

/**
 * Get ETag from data (simple hash)
 */
function getETag(data) {
  const json = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `"${Math.abs(hash).toString(36)}"`;
}

/**
 * Check if client ETag matches (for conditional requests)
 */
function etagMatches(clientETag, serverETag) {
  return clientETag === serverETag || clientETag === '*';
}

// Public API
module.exports = {
  // Cache class
  Cache,

  // Global caches
  instrumentCache,
  userPermissionsCache,
  analyticsCache,

  // TTL constants
  TTL,

  // Cache key builder
  getCacheKey,

  // Invalidation functions
  invalidateInstrumentCache,
  invalidatePermissionsCache,
  invalidateAnalyticsCache,

  // ETag utilities
  getETag,
  etagMatches
};
