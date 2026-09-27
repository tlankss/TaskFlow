/**
 * TaskFlow 本地离线书籍二进制存储引擎 (基于 IndexedDB)
 * 支持高效持久化存储大型电子书 (EPUB, PDF, TXT, MOBI)，无体积限制且秒级读取
 */

const DB_NAME = 'TaskFlow_BookStorage'
const DB_VERSION = 1
const STORE_NAME = 'book_files'

interface StoredBookRecord {
  bookId: string
  fileName: string
  fileType: string
  data: ArrayBuffer
  updatedAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in current environment'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'bookId' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 存储书籍二进制数据到本地 IndexedDB
 */
export async function saveBookBinary(
  bookId: string,
  file: File | Blob | ArrayBuffer,
  fileName: string = 'book'
): Promise<void> {
  let arrayBuffer: ArrayBuffer
  let fileType = ''

  if (file instanceof File) {
    arrayBuffer = await file.arrayBuffer()
    fileType = file.type || ''
  } else if (file instanceof Blob) {
    arrayBuffer = await file.arrayBuffer()
    fileType = file.type || ''
  } else {
    arrayBuffer = file
  }

  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    const record: StoredBookRecord = {
      bookId,
      fileName,
      fileType,
      data: arrayBuffer,
      updatedAt: Date.now(),
    }

    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * 从本地 IndexedDB 读取书籍 ArrayBuffer
 */
export async function getBookBinary(bookId: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(bookId)

      req.onsuccess = () => {
        const res = req.result as StoredBookRecord | undefined
        resolve(res?.data || null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[bookStorage] getBookBinary error:', err)
    return null
  }
}

/**
 * 检测本地是否已缓存该书籍文件
 */
export async function hasBookBinary(bookId: string): Promise<boolean> {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.count(IDBKeyRange.only(bookId))

      req.onsuccess = () => resolve(req.result > 0)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return false
  }
}

/**
 * 删除本地缓存的书籍二进制
 */
export async function deleteBookBinary(bookId: string): Promise<void> {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(bookId)

      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[bookStorage] deleteBookBinary error:', err)
  }
}
