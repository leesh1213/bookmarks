// background.js (IndexedDB + message router)
const DB_NAME = 'youtubeBookmarksDB1';
const DB_VERSION = 1;
const STORE = 'bookmarks';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    
    req.onupgradeneeded = (e) => {
      try {
        const db = e.target.result;
        console.log('🔄 DB 업그레이드 중...', `v${e.oldVersion} -> v${e.newVersion}`);
        
        // Object Store 생성
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          
          // 인덱스 생성
          store.createIndex('videoId', 'videoId', { unique: false });
          store.createIndex('time', 'time', { unique: false });
          store.createIndex('addedAt', 'addedAt', { unique: false });
          
          console.log('✅ Object Store와 인덱스 생성 완료');
        } else {
          console.log('ℹ️ Object Store가 이미 존재함');
        }
      } catch (error) {
        console.error('❌ DB 업그레이드 중 에러:', error);
        reject(error);
      }
    };
    
    req.onsuccess = (e) => {
      const db = e.target.result;
      console.log('✅ DB 연결 성공1:', db.name, `v${db.version}`);
      resolve(db);
    };
    
    req.onerror = (e) => {
      console.error('❌ DB 연결 실패:', req.error);
      reject(req.error);
    };
    
    req.onblocked = (e) => {
      console.warn('⚠️ DB가 다른 탭에서 사용 중입니다. 다른 탭을 닫아주세요.');
      // 필요시 사용자에게 알림 표시
    };
    
    req.onversionchange = (e) => {
      console.warn('⚠️ DB 버전이 다른 곳에서 변경되었습니다.');
      db.close();
    };
  });
}

async function dbAdd(data) {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.add(data); // request 객체를 변수에 저장
    
    // 개별 요청 성공 처리
    request.onsuccess = () => {
      console.log('Data added successfully, key:', request.result);
      resolve(request.result); // 생성된 키 반환
    };
    
    // 개별 요청 에러 처리 (중복 키 등)
    request.onerror = () => {
      console.error('Add request failed:', request.error);
      reject(request.error);
    };
    
    // 트랜잭션 에러 처리
    tx.onerror = () => {
      console.error('Transaction failed:', tx.error);
      reject(tx.error);
    };
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbUpdate(id, patch) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const val = getReq.result;
      if (!val) { resolve(false); return; }
      const updated = { ...val, ...patch };
      store.put(updated);
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbBulkImport(items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    (items || []).forEach(it => {
      // remove any incoming id to avoid collision
      const { id, ...rest } = it || {};
      store.add({ ...rest });
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('백그라운드 메시지 수신:', msg);
  (async () => {
    try {
      switch (msg?.action) {
        case 'addBookmark':
          console.log('Adding bookmark:', msg.data);
          await dbAdd(msg.data);
          sendResponse({ ok: true });
          break;
        // case 'getAllBookmarks':
        //   const all = await dbGetAll();
        //   sendResponse({ ok: true, data: all });
        //   break;
        case 'getAllBookmarks':
          const videoId = msg.videoId;
          if (videoId) {
            const videoBookmarks = await dbGetByVideoId(videoId);
            sendResponse({ ok: true, data: videoBookmarks });
          } else {
            const all = await dbGetAll();
            sendResponse({ ok: true, data: all });
          }
          break;
        case 'updateBookmark':
          await dbUpdate(msg.id, msg.patch || {});
          sendResponse({ ok: true });
          break;
        case 'deleteBookmark':
          await dbDelete(msg.id);
          sendResponse({ ok: true });
          break;
        case 'clearBookmarks':
          await dbClear();
          sendResponse({ ok: true });
          break;
        case 'importBookmarks':
          await dbBulkImport(msg.items || []);
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: 'unknown_action' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async
});


async function dbGetByVideoId(videoId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const index = store.index('videoId');
    const req = index.getAll(IDBKeyRange.only(videoId)); // Use the index for a specific videoId
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}