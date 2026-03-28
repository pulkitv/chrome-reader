/**
 * IndexedDB Wrapper for ReadEasy Reading List
 * Provides Promise-based interface for storing articles with embedded images
 */

const DB_NAME = 'ReadEasyDB';
const DB_VERSION = 1;
const STORE_NAME = 'savedArticles';

/**
 * Initialize IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        
        // Create indexes for efficient queries
        objectStore.createIndex('addedDate', 'addedDate', { unique: false });
        objectStore.createIndex('url', 'url', { unique: false });
      }
    };
  });
}

/**
 * Add article to reading list
 * @param {Object} article - Article data
 * @param {string} article.title - Article title
 * @param {string} article.url - Source URL
 * @param {string} article.siteName - Site name/domain
 * @param {string} article.htmlContent - HTML content with base64 images
 * @returns {Promise<number>} Article ID
 */
async function addArticle(article) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const articleData = {
      ...article,
      addedDate: Date.now()
    };
    
    const request = store.add(articleData);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get single article by ID
 * @param {number} id - Article ID
 * @returns {Promise<Object>} Article data
 */
async function getArticle(id) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get all articles ordered by date added (oldest first)
 * @returns {Promise<Array>} Array of articles
 */
async function getAllArticles() {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('addedDate');
    const request = index.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Delete article by ID
 * @param {number} id - Article ID
 * @returns {Promise<void>}
 */
async function deleteArticle(id) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Update article title by ID
 * @param {number} id - Article ID
 * @param {string} title - New article title
 * @returns {Promise<void>}
 */
async function updateArticleTitle(id, title) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const article = getRequest.result;
      if (!article) {
        reject(new Error('Article not found'));
        return;
      }

      article.title = title;
      const putRequest = store.put(article);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get count of saved articles
 * @returns {Promise<number>}
 */
async function getArticleCount() {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get oldest article (for deletion when at capacity)
 * @returns {Promise<Object|null>} Oldest article or null
 */
async function getOldestArticle() {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('addedDate');
    const request = index.openCursor();
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      resolve(cursor ? cursor.value : null);
    };
    
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}
