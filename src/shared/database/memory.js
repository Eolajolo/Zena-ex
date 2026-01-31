/**
 * In-Memory Database Store
 * This is a temporary solution for development.
 * Replace with PostgreSQL in production.
 */

const stores = {
  users: new Map(),
  wallets: new Map(),
  transactions: new Map(),
  tokens: new Map(),
  referralCodes: new Map([
    ['ZENA2024', { discount: 10, isActive: true, usageCount: 0 }],
    ['WELCOME10', { discount: 10, isActive: true, usageCount: 0 }],
    ['FRIEND20', { discount: 20, isActive: true, usageCount: 0 }],
    ['BJEISLP', { discount: 15, isActive: true, usageCount: 0 }]
  ])
};

const db = {
  /**
   * Get a store by name
   */
  getStore: (storeName) => {
    if (!stores[storeName]) {
      stores[storeName] = new Map();
    }
    return stores[storeName];
  },

  /**
   * Generic CRUD operations
   */
  create: (storeName, id, data) => {
    const store = db.getStore(storeName);
    store.set(id, { ...data, createdAt: new Date(), updatedAt: new Date() });
    return store.get(id);
  },

  findById: (storeName, id) => {
    const store = db.getStore(storeName);
    return store.get(id) || null;
  },

  findOne: (storeName, predicate) => {
    const store = db.getStore(storeName);
    for (const item of store.values()) {
      if (predicate(item)) return item;
    }
    return null;
  },

  findMany: (storeName, predicate = () => true) => {
    const store = db.getStore(storeName);
    return Array.from(store.values()).filter(predicate);
  },

  update: (storeName, id, data) => {
    const store = db.getStore(storeName);
    const existing = store.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...data, updatedAt: new Date() };
    store.set(id, updated);
    return updated;
  },

  delete: (storeName, id) => {
    const store = db.getStore(storeName);
    return store.delete(id);
  },

  count: (storeName, predicate = () => true) => {
    return db.findMany(storeName, predicate).length;
  },

  /**
   * Clear a store (for testing)
   */
  clear: (storeName) => {
    const store = db.getStore(storeName);
    store.clear();
  },

  /**
   * Clear all stores (for testing)
   */
  clearAll: () => {
    Object.keys(stores).forEach(key => {
      if (key !== 'referralCodes') {
        stores[key].clear();
      }
    });
  }
};

module.exports = db;
