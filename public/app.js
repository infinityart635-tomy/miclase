const state = {
  user: null,
  db: { careers: [], users: [] },
  selectedCareerId: null,
  selectedSubjectId: null,
  selectedScheduleBoardId: null,
  selectedStudyYear: '',
  showCreateSubjectPanel: false,
  showCreateCareerPanel: false,
  showSchedulePanel: false,
  showSearchPanel: false,
  showProfileMenu: false,
  searchQuery: '',
  subjectLibraryQuery: '',
  subjectLibrarySort: 'favorites',
  subjectMaterialSearchQuery: '',
  currentSubjectFolderId: null,
  selectedMaterialIds: [],
  notice: '',
  modal: null,
  materialUpload: null,
  transfer: null,
  appUpdate: {
    checking: false,
    available: false,
    applying: false,
    message: '',
  },
  viewTransition: {
    lastKey: '',
    lastDepth: 0,
  },
  authMode: 'login',
  authDraft: {
    identifier: '',
    firstName: '',
    lastName: '',
    email: '',
    resetEmail: '',
    password: '',
    passwordRepeat: '',
  },
};

const LAST_CAREER_STORAGE_PREFIX = 'miclase:last-career:';
const LAST_STUDY_YEAR_STORAGE_PREFIX = 'miclase:last-study-year:';
const SUBJECT_LIBRARY_PREFS_PREFIX = 'miclase:subject-library:';
const SUBJECT_FAVORITES_PREFIX = 'miclase:subject-favorites:';
const DOWNLOADED_MATERIALS_PREFIX = 'miclase:downloaded-materials:';
const CACHED_SESSION_STORAGE_KEY = 'miclase:cached-session';
const CACHED_DATA_STORAGE_PREFIX = 'miclase:cached-data:';
const LAST_ROUTE_STORAGE_PREFIX = 'miclase:last-route:';
const OFFLINE_WARM_LIMIT = 18;
const APP_UPDATE_CHECK_INTERVAL = 60000;
let swUpdateCheckTimer = 0;
let hasReloadedForUpdate = false;

function getLastCareerStorageKey() {
  const userId = String(state.user?.id || '').trim();
  return userId ? LAST_CAREER_STORAGE_PREFIX + userId : '';
}

function getLastStudyYearStorageKey() {
  const userId = String(state.user?.id || '').trim();
  return userId ? LAST_STUDY_YEAR_STORAGE_PREFIX + userId : '';
}

function getSubjectLibraryPrefsKey() {
  const userId = String(state.user?.id || '').trim();
  const careerId = String(state.selectedCareerId || '').trim();
  return userId && careerId ? `${SUBJECT_LIBRARY_PREFS_PREFIX}${userId}:${careerId}` : '';
}

function getSubjectFavoritesKey(careerId = state.selectedCareerId) {
  const userId = String(state.user?.id || '').trim();
  const normalizedCareerId = String(careerId || '').trim();
  return userId && normalizedCareerId ? `${SUBJECT_FAVORITES_PREFIX}${userId}:${normalizedCareerId}` : '';
}

function getCachedDataStorageKey() {
  const userId = String(state.user?.id || '').trim();
  return userId ? `${CACHED_DATA_STORAGE_PREFIX}${userId}` : '';
}

function getDownloadedMaterialsStorageKey() {
  const userId = String(state.user?.id || '').trim();
  return userId ? `${DOWNLOADED_MATERIALS_PREFIX}${userId}` : '';
}

function getLastRouteStorageKey() {
  const userId = String(state.user?.id || '').trim();
  return userId ? `${LAST_ROUTE_STORAGE_PREFIX}${userId}` : '';
}

function persistCachedSession(user) {
  try {
    if (user) {
      window.localStorage.setItem(CACHED_SESSION_STORAGE_KEY, JSON.stringify(user));
      return;
    }
    window.localStorage.removeItem(CACHED_SESSION_STORAGE_KEY);
  } catch (_) {
    // Ignore storage failures and keep the app working.
  }
}

function restoreCachedSession() {
  try {
    const raw = window.localStorage.getItem(CACHED_SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function persistCachedData(db) {
  const key = getCachedDataStorageKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(db));
  } catch (_) {
    // Ignore storage failures and keep the app working.
  }
}

function restoreCachedData() {
  const key = getCachedDataStorageKey();
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function restoreDownloadedMaterials() {
  const key = getDownloadedMaterialsStorageKey();
  if (!key) return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || '').trim()).filter(Boolean) : []);
  } catch (_) {
    return new Set();
  }
}

function persistDownloadedMaterials(downloaded) {
  const key = getDownloadedMaterialsStorageKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...downloaded]));
  } catch (_) {
    // Ignore storage failures and keep the app working.
  }
}

function isMaterialDownloaded(item) {
  const fileName = String(item?.fileName || '').trim();
  if (!fileName) return false;
  return restoreDownloadedMaterials().has(fileName);
}

function markMaterialAsDownloaded(item) {
  const fileName = String(item?.fileName || '').trim();
  if (!fileName) return;
  const downloaded = restoreDownloadedMaterials();
  downloaded.add(fileName);
  persistDownloadedMaterials(downloaded);
}

function persistLastRoute() {
  const key = getLastRouteStorageKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      selectedCareerId: state.selectedCareerId || '',
      selectedStudyYear: state.selectedStudyYear || '',
      selectedSubjectId: state.selectedSubjectId || '',
      currentSubjectFolderId: state.currentSubjectFolderId || '',
    }));
  } catch (_) {
    // Ignore storage failures and keep the app working.
  }
}

function restoreLastRoute() {
  const key = getLastRouteStorageKey();
  if (!key) return;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    state.selectedCareerId = String(parsed.selectedCareerId || state.selectedCareerId || '').trim() || null;
    state.selectedStudyYear = String(parsed.selectedStudyYear || state.selectedStudyYear || '').trim();
    state.selectedSubjectId = String(parsed.selectedSubjectId || '').trim() || null;
    state.currentSubjectFolderId = String(parsed.currentSubjectFolderId || '').trim() || null;
  } catch (_) {
    state.currentSubjectFolderId = null;
  }
}

function clearOfflineSessionState() {
  const dataKey = getCachedDataStorageKey();
  const routeKey = getLastRouteStorageKey();
  try {
    window.localStorage.removeItem(CACHED_SESSION_STORAGE_KEY);
    if (dataKey) {
      window.localStorage.removeItem(dataKey);
    }
    if (routeKey) {
      window.localStorage.removeItem(routeKey);
    }
  } catch (_) {
    // Ignore storage failures and keep the app working.
  }
}

function getMaterialFileUrl(item) {
  return item?.fileName ? `/files/${encodeURIComponent(item.fileName)}` : '';
}

function getAbsoluteMaterialFileUrl(item) {
  const relativeUrl = getMaterialFileUrl(item);
  if (!relativeUrl) return '';
  try {
    return new URL(relativeUrl, window.location.origin).toString();
  } catch (_) {
    return relativeUrl;
  }
}

function postCacheMessage(type, payload = {}) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => {
      const worker = navigator.serviceWorker.controller || registration.active || registration.waiting;
      worker?.postMessage({ type, ...payload });
    })
    .catch(() => {
      // Keep the app usable even if the cache worker fails.
    });
}

function warmOfflineUrls(urls) {
  const queue = [...new Set((urls || []).filter(Boolean))].slice(0, OFFLINE_WARM_LIMIT);
  if (!queue.length) return;
  postCacheMessage('CACHE_URLS', { urls: queue });
  queue.forEach((url) => {
    fetch(url, { credentials: 'include' }).catch(() => null);
  });
}

function warmCachedSubjectResources(careerId = state.selectedCareerId, subjectId = state.selectedSubjectId) {
  const career = (state.db.careers || []).find((item) => item.id === careerId);
  const subject = (career?.subjects || []).find((item) => item.id === subjectId);
  if (!subject) return;
  const prioritized = [];
  const visibleItems = getVisibleSubjectMaterials(subject, state.currentSubjectFolderId);
  prioritized.push(...visibleItems);
  prioritized.push(...(subject.materials || []).filter((item) => isMaterialImage(item)));
  const urls = ['/api/session', '/api/data'];
  prioritized.forEach((item) => {
    const fileUrl = getMaterialFileUrl(item);
    if (fileUrl) {
      urls.push(fileUrl);
    }
  });
  warmOfflineUrls(urls);
}

function warmCachedMaterialResource(item) {
  const fileUrl = getMaterialFileUrl(item);
  if (!fileUrl) return;
  warmOfflineUrls([fileUrl]);
}

function restoreLastCareerPreference() {
  const careerKey = getLastCareerStorageKey();
  const yearKey = getLastStudyYearStorageKey();
  if (!careerKey) return;
  try {
    const savedCareerId = window.localStorage.getItem(careerKey);
    const savedStudyYear = yearKey ? window.localStorage.getItem(yearKey) : '';
    state.selectedCareerId = savedCareerId || null;
    state.selectedStudyYear = savedStudyYear || '';
    state.selectedSubjectId = null;
  } catch (_) {
    state.selectedCareerId = null;
    state.selectedStudyYear = '';
    state.selectedSubjectId = null;
  }
}

function restoreSubjectLibraryPreferences() {
  const key = getSubjectLibraryPrefsKey();
  if (!key) {
    state.subjectLibraryQuery = '';
    state.subjectLibrarySort = 'favorites';
    return;
  }
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    state.subjectLibraryQuery = typeof parsed.query === 'string' ? parsed.query : '';
    state.subjectLibrarySort = typeof parsed.sort === 'string' ? parsed.sort : 'favorites';
  } catch (_) {
    state.subjectLibraryQuery = '';
    state.subjectLibrarySort = 'favorites';
  }
}

function persistSubjectLibraryPreferences() {
  const key = getSubjectLibraryPrefsKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      query: state.subjectLibraryQuery || '',
      sort: state.subjectLibrarySort || 'favorites',
    }));
  } catch (_) {
    // Ignore storage failures and keep the app working.
  }
}

function getFavoriteSubjectIds(careerId = state.selectedCareerId) {
  const key = getSubjectFavoritesKey(careerId);
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function isFavoriteSubject(subjectId, careerId = state.selectedCareerId) {
  return getFavoriteSubjectIds(careerId).includes(subjectId);
}

function toggleFavoriteSubject(subjectId, careerId = state.selectedCareerId) {
  const key = getSubjectFavoritesKey(careerId);
  if (!key || !subjectId) return;
  try {
    const next = new Set(getFavoriteSubjectIds(careerId));
    if (next.has(subjectId)) {
      next.delete(subjectId);
    } else {
      next.add(subjectId);
    }
    window.localStorage.setItem(key, JSON.stringify([...next]));
  } catch (_) {
    // Ignore storage failures and keep the app working.
  }
}

function persistLastCareerPreference(careerId) {
  const key = getLastCareerStorageKey();
  if (!key) return;
  try {
    if (careerId) {
      window.localStorage.setItem(key, careerId);
      return;
    }
    window.localStorage.removeItem(key);
  } catch (_) {
    // Ignore storage failures and keep the app working.
  }
}

function persistLastStudyYearPreference(studyYear) {
  const key = getLastStudyYearStorageKey();
  if (!key) return;
  try {
    if (studyYear) {
      window.localStorage.setItem(key, normalizeStudyYear(studyYear));
      return;
    }
    window.localStorage.removeItem(key);
  } catch (_) {
    // Ignore storage failures and keep the app working.
  }
}

const app = document.getElementById('app');
const topbar = document.querySelector('.topbar');
const loginTemplate = document.getElementById('loginTemplate');
const pullRefresh = createPullRefreshIndicator();
const pullRefreshState = {
  startY: 0,
  tracking: false,
  active: false,
  ready: false,
  loading: false,
};
const PULL_REFRESH_TRIGGER = 84;
const PULL_REFRESH_MAX = 132;
let browserBackTrapReady = false;

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
const loginMarkup = loginTemplate ? loginTemplate.innerHTML : `
  <section class="panel auth-panel">
    <div>
      <p class="eyebrow">Acceso</p>
      <h2 data-auth-title>Iniciar sesión</h2>
      <p data-auth-copy>Entra con tu nombre, apellido, nombre completo o Gmail y tu contraseña.</p>
    </div>
    <form id="loginForm" class="stack-form auth-form" autocomplete="off">
      <input class="ghost-autofill" type="text" name="fake-user" autocomplete="username" tabindex="-1" aria-hidden="true">
      <input class="ghost-autofill" type="password" name="fake-pass" autocomplete="current-password" tabindex="-1" aria-hidden="true">
      <label data-login-identifier>
        <span>Usuario o Gmail</span>
        <input name="identifier" required maxlength="160" placeholder="Ej: Juan, Perez, Juan Perez o tucorreo@gmail.com" autocomplete="off" autocapitalize="none" spellcheck="false" data-auth-field>
      </label>
      <label class="hidden" data-register-first-name>
        <span>Nombre</span>
        <input name="firstName" maxlength="80" placeholder="Ej: Juan" autocomplete="off" autocapitalize="words" spellcheck="false" data-auth-field>
      </label>
      <label class="hidden" data-register-last-name>
        <span>Apellido</span>
        <input name="lastName" maxlength="80" placeholder="Ej: Perez" autocomplete="off" autocapitalize="words" spellcheck="false" data-auth-field>
      </label>
      <label class="hidden" data-register-email>
        <span>Gmail</span>
        <input type="email" name="email" maxlength="160" placeholder="Ej: tucorreo@gmail.com" autocomplete="off" autocapitalize="none" spellcheck="false" data-auth-field>
      </label>
      <label class="hidden" data-reset-email>
        <span>Gmail</span>
        <input type="email" name="resetEmail" maxlength="160" placeholder="Ej: tucorreo@gmail.com" autocomplete="off" autocapitalize="none" spellcheck="false" data-auth-field>
      </label>
      <label data-password-row>
        <span>Contraseña</span>
        <input type="password" name="password" required maxlength="120" placeholder="Tu contraseña" autocomplete="new-password" data-auth-field>
      </label>
      <label class="hidden" data-repeat-password>
        <span>Repetir contraseña</span>
        <input type="password" name="passwordRepeat" maxlength="120" placeholder="Repite la contraseña" autocomplete="new-password" data-auth-field>
      </label>
      <button type="submit" data-auth-submit>Entrar</button>
      <button type="button" class="secondary" id="toggleAuthMode">No tengo cuenta</button>
      <button type="button" class="secondary" id="forgotPasswordBtn">Olvidé mi contraseña</button>
      <button type="button" class="secondary hidden" id="resetPasswordBtn">Cambiar contraseña</button>
    </form>
  </section>
`;

boot().catch((error) => {
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Error</p>
      <h2>No se pudo iniciar la app</h2>
      <p>${escapeHtml(error.message || 'Error desconocido.')}</p>
    </section>
  `;
});

async function boot() {
  registerDeviceCache();
  wirePullToRefresh();
  initBrowserBackHandling();
  await refreshSession();
  if (state.user) {
    restoreLastCareerPreference();
    restoreLastRoute();
    restoreSubjectLibraryPreferences();
    await loadData();
  }
  render();
}

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (_) {
    const networkError = new Error('Sin conexion.');
    networkError.isNetworkError = true;
    throw networkError;
  }
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const apiError = new Error(payload?.error || 'Error inesperado.');
    apiError.status = response.status;
    throw apiError;
  }
  return payload;
}

function uploadFormData(url, formData, options = {}) {
  let xhr = null;
  const { method = 'POST', onProgress } = options;
  const promise = new Promise((resolve, reject) => {
    xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (typeof onProgress === 'function') {
        onProgress(event);
      }
    };
    xhr.onerror = () => reject(new Error('Error inesperado.'));
    xhr.onabort = () => {
      const abortError = new Error('Subida cancelada.');
      abortError.name = 'AbortError';
      reject(abortError);
    };
    xhr.onload = () => {
      const type = xhr.getResponseHeader('content-type') || '';
      const payload = type.includes('application/json')
        ? (xhr.response || JSON.parse(xhr.responseText || 'null'))
        : null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }
      reject(new Error(payload?.error || 'Error inesperado.'));
    };
    xhr.send(formData);
  });
  return {
    promise,
    abort: () => xhr?.abort(),
  };
}

async function refreshSession() {
  try {
    const data = await api('/api/session');
    state.user = data.user;
    persistCachedSession(state.user);
  } catch (error) {
    if (!error?.isNetworkError) {
      throw error;
    }
    state.user = restoreCachedSession();
  }
}

async function loadData() {
  let db;
  try {
    db = await api('/api/data');
    persistCachedData(db);
  } catch (error) {
    if (!error?.isNetworkError) {
      throw error;
    }
    db = restoreCachedData();
    if (!db) {
      throw error;
    }
    setNotice('Sin internet. Mostrando lo ultimo que ya abriste.');
  }
  state.db = db;
  if (state.selectedCareerId && !db.careers.find((career) => career.id === state.selectedCareerId)) {
    state.selectedCareerId = null;
    state.selectedSubjectId = null;
    state.selectedScheduleBoardId = null;
    state.selectedStudyYear = '';
    persistLastCareerPreference(null);
    persistLastStudyYearPreference(null);
  }
  const selectedCareer = db.careers.find((career) => career.id === state.selectedCareerId);
  if (state.selectedSubjectId && !selectedCareer?.subjects?.find((subject) => subject.id === state.selectedSubjectId)) {
    state.selectedSubjectId = null;
    state.currentSubjectFolderId = null;
  }
  const boards = selectedCareer?.scheduleBoards || [];
  if (boards.length && !boards.find((board) => board.id === state.selectedScheduleBoardId)) {
    state.selectedScheduleBoardId = boards[0].id;
  }
  const years = getCareerYears(selectedCareer);
  if (state.selectedSubjectId) {
    const activeSubject = selectedCareer?.subjects?.find((subject) => subject.id === state.selectedSubjectId);
    state.selectedStudyYear = normalizeStudyYear(activeSubject?.year);
  } else if (state.selectedStudyYear && !years.includes(state.selectedStudyYear)) {
    state.selectedStudyYear = '';
    persistLastStudyYearPreference(null);
  }
}

async function refreshAppData() {
  render();
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        if (registration.waiting) {
          await applyServiceWorkerUpdate(registration);
          return;
        }
      }
    } catch (_) {
      // Fallback to a normal reload below.
    }
  }
  window.location.reload();
}

function createPullRefreshIndicator() {
  const element = document.createElement('div');
  element.className = 'pull-refresh-indicator';
  element.innerHTML = `
    <div class="pull-refresh-spinner" aria-hidden="true"></div>
    <span class="pull-refresh-label">Desliza para actualizar</span>
  `;
  document.body.appendChild(element);
  return element;
}

function wirePullToRefresh() {
  window.addEventListener('touchstart', handlePullRefreshStart, { passive: true });
  window.addEventListener('touchmove', handlePullRefreshMove, { passive: false });
  window.addEventListener('touchend', handlePullRefreshEnd, { passive: true });
  window.addEventListener('touchcancel', resetPullRefreshIndicator, { passive: true });
}

function getScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function handlePullRefreshStart(event) {
  if (pullRefreshState.loading || event.touches.length !== 1) return;
  if (getScrollTop() > 0) return;
  pullRefreshState.startY = event.touches[0].clientY;
  pullRefreshState.tracking = pullRefreshState.startY <= 96;
  pullRefreshState.active = false;
  pullRefreshState.ready = false;
}

function handlePullRefreshMove(event) {
  if (!pullRefreshState.tracking || pullRefreshState.loading || event.touches.length !== 1) return;
  const deltaY = event.touches[0].clientY - pullRefreshState.startY;
  if (deltaY <= 0) {
    resetPullRefreshIndicator();
    return;
  }
  if (getScrollTop() > 0) {
    resetPullRefreshIndicator();
    return;
  }
  const distance = Math.min(deltaY, PULL_REFRESH_MAX);
  pullRefreshState.active = true;
  pullRefreshState.ready = distance >= PULL_REFRESH_TRIGGER;
  updatePullRefreshIndicator(distance, pullRefreshState.ready, false);
  event.preventDefault();
}

async function handlePullRefreshEnd() {
  if (!pullRefreshState.tracking) return;
  const shouldRefresh = pullRefreshState.ready && !pullRefreshState.loading;
  pullRefreshState.tracking = false;
  pullRefreshState.active = false;
  pullRefreshState.ready = false;
  if (!shouldRefresh) {
    resetPullRefreshIndicator();
    return;
  }
  pullRefreshState.loading = true;
  updatePullRefreshIndicator(72, true, true);
  try {
    await refreshAppData();
  } catch (error) {
    setNotice(error.message || 'No se pudo actualizar.');
  } finally {
    pullRefreshState.loading = false;
    window.setTimeout(() => {
      resetPullRefreshIndicator();
    }, 220);
  }
}

function updatePullRefreshIndicator(distance, ready, loading) {
  if (!pullRefresh) return;
  pullRefresh.style.setProperty('--pull-distance', `${distance}px`);
  pullRefresh.classList.toggle('active', distance > 0 || loading);
  pullRefresh.classList.toggle('ready', Boolean(ready));
  pullRefresh.classList.toggle('loading', Boolean(loading));
  const label = pullRefresh.querySelector('.pull-refresh-label');
  if (label) {
    label.textContent = loading
      ? 'Actualizando...'
      : ready
        ? 'Suelta para actualizar'
        : 'Desliza para actualizar';
  }
}

function resetPullRefreshIndicator() {
  pullRefreshState.tracking = false;
  pullRefreshState.active = false;
  pullRefreshState.ready = false;
  if (!pullRefreshState.loading) {
    updatePullRefreshIndicator(0, false, false);
  }
}

async function moveSubjectMaterial(careerId, subjectId, materialId, parentFolderId) {
  try {
    await api(`/api/careers/${careerId}/subjects/${subjectId}/materials/${materialId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentFolderId: parentFolderId || '' }),
    });
    await loadData();
    render();
    setNotice(parentFolderId ? 'Material movido a la carpeta.' : 'Material movido a la raiz.');
  } catch (error) {
    setNotice(error.message);
  } finally {
    clearMaterialSelection();
  }
}

function clearMaterialSelection() {
  state.selectedMaterialIds = [];
}

function toggleMaterialSelection(materialId, itemType) {
  const next = new Set(state.selectedMaterialIds);
  if (!next.has(materialId) && next.size) {
    const career = (state.db.careers || []).find((item) => item.id === state.selectedCareerId);
    const subject = (career?.subjects || []).find((item) => item.id === state.selectedSubjectId);
    const selectedItems = (subject?.materials || []).filter((item) => next.has(item.id));
    const selectedHasFolder = selectedItems.some((item) => item.itemType === 'folder');
    const incomingIsFolder = itemType === 'folder';
    if (selectedHasFolder !== incomingIsFolder) {
      return false;
    }
  }
  if (next.has(materialId)) {
    next.delete(materialId);
  } else {
    next.add(materialId);
  }
  state.selectedMaterialIds = [...next];
  return true;
}

async function moveSelectedMaterialsToFolder(careerId, subjectId, parentFolderId) {
  const selectedIds = [...state.selectedMaterialIds];
  if (!selectedIds.length) return;
  openConfirmModal({
    eyebrow: 'Publicaciones',
    title: 'Mover materiales',
    message: `Se moveran ${selectedIds.length} elemento${selectedIds.length === 1 ? '' : 's'} ${parentFolderId ? 'a la carpeta elegida.' : 'a la raiz.'}`,
    confirmLabel: 'Mover',
    onConfirm: async () => {
      try {
        for (const materialId of selectedIds) {
          await api(`/api/careers/${careerId}/subjects/${subjectId}/materials/${materialId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentFolderId: parentFolderId || '' }),
          });
        }
        await loadData();
        clearMaterialSelection();
        render();
        setNotice(parentFolderId ? 'Materiales movidos a la carpeta.' : 'Materiales movidos a la raiz.');
      } catch (error) {
        setNotice(error.message);
      }
    },
  });
}

function setNotice(text) {
  state.notice = text;
  render();
  if (text) {
    setTimeout(() => {
      if (state.notice === text) {
        state.notice = '';
        render();
      }
    }, 2500);
  }
}

function setTransferState(nextTransfer) {
  state.transfer = nextTransfer ? { ...nextTransfer } : null;
  render();
}

function clearTransferState() {
  state.transfer = null;
  render();
}

function setAppUpdateState(nextState) {
  state.appUpdate = {
    ...state.appUpdate,
    ...nextState,
  };
  render();
}

function renderStatusBanners() {
  const banners = [];
  if (state.appUpdate.message) {
    banners.push(`
      <div class="status-banner status-banner-update ${state.appUpdate.applying ? 'is-busy' : ''}">
        <strong>${escapeHtml(state.appUpdate.message)}</strong>
      </div>
    `);
  }
  if (state.transfer?.active) {
    const progress = Math.max(0, Math.min(100, Number(state.transfer.progress || 0)));
    banners.push(`
      <div class="status-banner status-banner-transfer">
        <div class="status-banner-head">
          <strong>${escapeHtml(state.transfer.label || 'Descargando archivo')}</strong>
          <span>${state.transfer.indeterminate ? 'Preparando...' : `${Math.round(progress)}%`}</span>
        </div>
        <div class="status-progress ${state.transfer.indeterminate ? 'is-indeterminate' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}">
          <span class="status-progress-fill" style="width:${Math.max(6, progress)}%"></span>
        </div>
      </div>
    `);
  }
  if (state.notice) {
    banners.push(`<div class="notice">${escapeHtml(state.notice)}</div>`);
  }
  return banners.join('');
}

function render() {
  renderTopbar();
  syncLayoutChrome();
  if (!state.user) {
    renderLogin();
    return;
  }
  renderDashboard();
}

function syncLayoutChrome() {
  const inFocusedYearView = Boolean(state.user && state.selectedCareerId && state.selectedStudyYear);
  document.body.classList.toggle('logged-out', !state.user);
  document.body.classList.toggle('workspace-focus', inFocusedYearView);
}

function renderTopbar() {
  if (!topbar) return;
  if (!state.user) {
    topbar.classList.add('hidden');
    topbar.innerHTML = '';
    return;
  }
  topbar.classList.remove('hidden');
  const context = getTopbarContext();
  const canGoBack = canNavigateBack();
  const canSearch = Boolean(state.user);
  const userLabel = state.user.fullName || state.user.label || '';
  const userInitials = getUserInitials(userLabel);
  topbar.innerHTML = `
    <div class="topbar-main">
      <div class="topbar-strip">
        <div class="topbar-leading">
          <button type="button" class="secondary topbar-icon-button" id="topbarBackBtn" ${canGoBack ? '' : 'disabled'} aria-label="Volver">←</button>
          <div class="topbar-head">
            ${context.eyebrow ? `<p class="eyebrow">${escapeHtml(context.eyebrow)}</p>` : ''}
            <h1>${escapeHtml(context.title)}</h1>
          </div>
        </div>
        <div class="topbar-actions">
          <button type="button" class="secondary topbar-icon-button" id="topbarSearchBtn" ${canSearch ? '' : 'disabled'} aria-label="Buscar">⌕</button>
          <button type="button" class="topbar-avatar" id="topbarAvatarBtn" aria-label="Abrir perfil">${escapeHtml(userInitials)}</button>
        </div>
      </div>
      ${context.subtitle ? `<p class="subtitle topbar-subtitle">${escapeHtml(context.subtitle)}</p>` : ''}
      ${state.showSearchPanel ? `
        <section class="topbar-search-panel">
          <form id="careerSearchForm" class="topbar-search-form">
            <input id="careerSearchInput" name="careerSearch" placeholder="Buscar carrera, materia, docente o publicación" value="${escapeHtml(state.searchQuery)}">
            <button type="submit">Buscar</button>
            <button type="button" class="secondary" id="clearCareerSearch">Limpiar</button>
          </form>
        </section>
      ` : ''}
      ${state.showProfileMenu ? `
        <div class="topbar-profile-menu" id="sessionBox">
          <div class="session-copy">
            <strong>${escapeHtml(userLabel)}</strong>
            <div class="meta">${escapeHtml(state.user.email || 'Sesión iniciada')}</div>
          </div>
          <button class="secondary session-logout" id="logoutBtn">Salir</button>
        </div>
      ` : ''}
    </div>
  `;

  const backBtn = document.getElementById('topbarBackBtn');
  if (backBtn) {
    backBtn.onclick = () => navigateBack();
  }

  const searchBtn = document.getElementById('topbarSearchBtn');
  if (searchBtn) {
    searchBtn.onclick = () => {
      state.showProfileMenu = false;
      toggleGlobalSearch();
    };
  }

  const avatarBtn = document.getElementById('topbarAvatarBtn');
  if (avatarBtn) {
    avatarBtn.onclick = () => {
      state.showProfileMenu = !state.showProfileMenu;
      if (state.showProfileMenu) {
        state.showSearchPanel = false;
      }
      render();
    };
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await api('/api/logout', { method: 'POST' });
      clearOfflineSessionState();
      state.user = null;
      state.db = { careers: [], users: [] };
      state.selectedCareerId = null;
      state.selectedSubjectId = null;
      state.selectedScheduleBoardId = null;
      state.selectedStudyYear = '';
      state.subjectLibraryQuery = '';
      state.subjectLibrarySort = 'favorites';
      state.showCreateCareerPanel = false;
      state.showSchedulePanel = false;
      state.showSearchPanel = false;
      state.showProfileMenu = false;
      state.searchQuery = '';
      state.authMode = 'login';
      render();
    };
  }
}

function getTopbarContext() {
  if (!state.user) {
    return {
      eyebrow: 'Campus local',
      title: 'MiClase',
      subtitle: 'Carreras, horarios y materiales en una sola web.',
    };
  }

  const careers = Array.isArray(state.db.careers) ? state.db.careers.filter(Boolean) : [];
  const selectedCareer = careers.find((career) => career.id === state.selectedCareerId) || null;
  if (!selectedCareer) {
    return {
      eyebrow: state.showSearchPanel ? 'Búsqueda' : 'Inicio',
      title: 'Carreras',
      subtitle: state.showSearchPanel
        ? (state.searchQuery ? `Buscando: ${state.searchQuery}` : 'Busca carreras, materias, docentes o publicaciones.')
        : '',
    };
  }

  const selectedCareerSubjects = Array.isArray(selectedCareer.subjects) ? selectedCareer.subjects : [];
  const selectedSubject = selectedCareerSubjects.find((subject) => subject?.id === state.selectedSubjectId) || null;
  if (selectedSubject) {
    return {
      eyebrow: 'Materia',
      title: selectedCareer.name,
      subtitle: `${selectedSubject.name} · ${selectedSubject.year || 'Sin año'}`,
    };
  }

  if (state.selectedStudyYear) {
    return {
      eyebrow: '',
      title: selectedCareer.name,
      subtitle: state.selectedStudyYear,
    };
  }

  return {
    eyebrow: 'Carrera',
    title: selectedCareer.name,
    subtitle: 'Elige un año para entrar.',
  };
}

function canNavigateBack() {
  return Boolean(
    state.modal
    || state.currentSubjectFolderId
    || state.selectedSubjectId
    || state.showCreateSubjectPanel
    || state.selectedStudyYear
    || state.selectedCareerId
    || state.showSearchPanel
    || state.showCreateCareerPanel
  );
}

function navigateBack() {
  if (state.modal) {
    closeModal();
    return;
  }
  if (state.currentSubjectFolderId && state.selectedCareerId && state.selectedSubjectId) {
    const career = (state.db.careers || []).find((item) => item.id === state.selectedCareerId);
    const subject = (career?.subjects || []).find((item) => item.id === state.selectedSubjectId);
    const folder = (subject?.materials || []).find((item) => item.id === state.currentSubjectFolderId);
    state.currentSubjectFolderId = folder?.parentFolderId || null;
    render();
    return;
  }
  if (state.selectedSubjectId) {
    state.selectedSubjectId = null;
    state.currentSubjectFolderId = null;
    render();
    return;
  }
  if (state.showCreateSubjectPanel) {
    state.showCreateSubjectPanel = false;
    render();
    return;
  }
  if (state.selectedStudyYear) {
    state.selectedStudyYear = '';
    state.showCreateSubjectPanel = false;
    state.showSchedulePanel = false;
    render();
    return;
  }
  if (state.selectedCareerId) {
    state.selectedCareerId = null;
    state.selectedSubjectId = null;
    state.currentSubjectFolderId = null;
    state.selectedScheduleBoardId = null;
    state.selectedStudyYear = '';
    state.showCreateSubjectPanel = false;
    state.showSchedulePanel = false;
    render();
    return;
  }
  if (state.showSearchPanel) {
    state.showSearchPanel = false;
    state.searchQuery = '';
    state.showProfileMenu = false;
    render();
    return;
  }
  if (state.showCreateCareerPanel) {
    state.showCreateCareerPanel = false;
    render();
  }
}

function initBrowserBackHandling() {
  if (browserBackTrapReady) return;
  browserBackTrapReady = true;
  try {
    window.history.replaceState({ appShell: true, root: true }, '', window.location.href);
    window.history.pushState({ appShell: true, trap: true }, '', window.location.href);
  } catch (_) {
    browserBackTrapReady = false;
    return;
  }
  window.addEventListener('popstate', handleBrowserBackNavigation);
}

function handleBrowserBackNavigation() {
  if (canNavigateBack()) {
    navigateBack();
  }
  try {
    window.history.pushState({ appShell: true, trap: true }, '', window.location.href);
  } catch (_) {
    // Ignore history failures and keep current UI state.
  }
}

function toggleGlobalSearch() {
  if (!state.user) return;
  state.showProfileMenu = false;
  const wasNested = Boolean(state.selectedCareerId || state.selectedStudyYear || state.selectedSubjectId);
  if (wasNested) {
    state.selectedCareerId = null;
    state.selectedSubjectId = null;
    state.selectedScheduleBoardId = null;
    state.selectedStudyYear = '';
    state.showCreateSubjectPanel = false;
    state.showCreateCareerPanel = false;
    state.showSearchPanel = true;
    render();
  } else {
    state.showCreateCareerPanel = false;
    state.showSearchPanel = !state.showSearchPanel;
    if (!state.showSearchPanel) {
      state.searchQuery = '';
    }
    render();
  }
  if (state.showSearchPanel) {
    setTimeout(() => document.getElementById('careerSearchInput')?.focus(), 0);
  }
}

function getUserInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts.slice(0, 2).map((part) => (part[0] || '').toUpperCase()).join('');
}

function renderLogin() {
  app.innerHTML = `
    ${renderStatusBanners()}
    ${loginMarkup}
  `;
  syncAuthDraftToInputs();
  syncAuthModeUi();
  prepareAuthForm();
  bindAuthDraftInputs();

  document.getElementById('toggleAuthMode').onclick = () => {
    state.authMode = state.authMode === 'login' ? 'register' : 'login';
    renderLogin();
  };

  document.getElementById('forgotPasswordBtn').onclick = () => {
    state.authMode = 'forgot';
    renderLogin();
  };

  document.getElementById('resetPasswordBtn').onclick = () => {
    state.authMode = 'reset';
    renderLogin();
  };

  document.getElementById('loginForm').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    updateAuthDraftFromForm(form);
    try {
      if ((state.authMode === 'register' || state.authMode === 'reset') && form.get('password') !== form.get('passwordRepeat')) {
        throw new Error('Las contraseñas no coinciden.');
      }

      const endpoint = state.authMode === 'login'
        ? '/api/login'
        : state.authMode === 'register'
          ? '/api/register'
          : state.authMode === 'forgot'
            ? '/api/password-reset/request'
            : '/api/password-reset/complete';

      const data = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: form.get('identifier'),
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          email: state.authMode === 'forgot' || state.authMode === 'reset' ? form.get('resetEmail') : form.get('email'),
          password: form.get('password'),
          passwordRepeat: form.get('passwordRepeat'),
        }),
      });

      if (state.authMode === 'forgot') {
        state.authMode = 'reset';
        state.authDraft.password = '';
        state.authDraft.passwordRepeat = '';
        setNotice(data.message || 'Pedido enviado.');
        renderLogin();
        return;
      }
      if (state.authMode === 'reset') {
        state.authMode = 'login';
        clearAuthDraft();
        setNotice(data.message || 'Contrasena cambiada.');
        renderLogin();
        return;
      }

      state.user = data.user;
      persistCachedSession(state.user);
      restoreLastCareerPreference();
      restoreLastRoute();
      clearAuthDraft();
      await loadData();
      setNotice(data.mode === 'login' || state.authMode === 'login' ? 'Sesión iniciada.' : 'Cuenta creada.');
      render();
    } catch (error) {
      setNotice(error.message);
    }
  };
}

function syncAuthModeUi() {
  const isRegister = state.authMode === 'register';
  const isForgot = state.authMode === 'forgot';
  const isReset = state.authMode === 'reset';
  const isLogin = state.authMode === 'login';
  const title = document.querySelector('[data-auth-title]');
  const copy = document.querySelector('[data-auth-copy]');
  const loginIdentifierRow = document.querySelector('[data-login-identifier]');
  const registerFirstNameRow = document.querySelector('[data-register-first-name]');
  const registerLastNameRow = document.querySelector('[data-register-last-name]');
  const registerEmailRow = document.querySelector('[data-register-email]');
  const resetEmailRow = document.querySelector('[data-reset-email]');
  const passwordRow = document.querySelector('[data-password-row]');
  const repeatRow = document.querySelector('[data-repeat-password]');
  const repeatInput = repeatRow?.querySelector('input');
  const submit = document.querySelector('[data-auth-submit]');
  const toggle = document.getElementById('toggleAuthMode');
  const forgotBtn = document.getElementById('forgotPasswordBtn');
  const resetBtn = document.getElementById('resetPasswordBtn');
  const identifierInput = document.querySelector('input[name="identifier"]');
  const firstNameInput = document.querySelector('input[name="firstName"]');
  const lastNameInput = document.querySelector('input[name="lastName"]');
  const emailInput = document.querySelector('input[name="email"]');
  const resetEmailInput = document.querySelector('input[name="resetEmail"]');
  const passwordInput = document.querySelector('input[name="password"]');

  if (title) {
    title.textContent = isRegister ? 'Crear cuenta' : isForgot ? 'Pedir cambio' : isReset ? 'Cambiar contraseña' : 'Iniciar sesión';
  }
  if (copy) {
    copy.textContent = isRegister
      ? 'Crea una cuenta con nombre, apellido, Gmail y una contraseña. Luego podrás entrar con cualquiera de esos datos.'
      : isForgot
        ? 'Escribe tu Gmail y envía el pedido. El admin debe habilitar el cambio antes de que puedas poner una nueva contraseña.'
        : isReset
          ? 'Si el admin ya te habilitó, aquí puedes escribir tu Gmail y tu nueva contraseña.'
          : 'Entra con tu nombre, apellido, nombre completo o Gmail y tu contraseña.';
  }
  if (loginIdentifierRow) {
    loginIdentifierRow.classList.toggle('hidden', !isLogin);
  }
  if (registerFirstNameRow) {
    registerFirstNameRow.classList.toggle('hidden', !isRegister);
  }
  if (registerLastNameRow) {
    registerLastNameRow.classList.toggle('hidden', !isRegister);
  }
  if (registerEmailRow) {
    registerEmailRow.classList.toggle('hidden', !isRegister);
  }
  if (resetEmailRow) {
    resetEmailRow.classList.toggle('hidden', !(isForgot || isReset));
  }
  if (passwordRow) {
    passwordRow.classList.toggle('hidden', isForgot);
  }
  if (repeatRow) {
    repeatRow.classList.toggle('hidden', !(isRegister || isReset));
  }
  if (identifierInput) {
    identifierInput.required = isLogin;
    identifierInput.autocomplete = 'off';
  }
  if (firstNameInput) {
    firstNameInput.required = isRegister;
    firstNameInput.autocomplete = 'off';
  }
  if (lastNameInput) {
    lastNameInput.required = isRegister;
    lastNameInput.autocomplete = 'off';
  }
  if (emailInput) {
    emailInput.required = isRegister;
    emailInput.autocomplete = 'off';
  }
  if (resetEmailInput) {
    resetEmailInput.required = isForgot || isReset;
    resetEmailInput.autocomplete = 'off';
  }
  if (repeatInput) {
    repeatInput.required = isRegister || isReset;
    repeatInput.value = '';
    repeatInput.autocomplete = 'new-password';
  }
  if (passwordInput) {
    passwordInput.required = !isForgot;
    passwordInput.autocomplete = 'new-password';
  }
  if (submit) {
    submit.textContent = isRegister ? 'Crear cuenta' : isForgot ? 'Pedir cambio' : isReset ? 'Guardar nueva contraseña' : 'Entrar';
  }
  if (toggle) {
    toggle.textContent = isRegister ? 'Ya tengo cuenta' : isLogin ? 'No tengo cuenta' : 'Volver al inicio';
    toggle.classList.remove('hidden');
  }
  if (forgotBtn) {
    forgotBtn.classList.toggle('hidden', !isLogin);
  }
  if (resetBtn) {
    resetBtn.classList.toggle('hidden', !isForgot);
  }
}

function prepareAuthForm() {
  const fields = document.querySelectorAll('[data-auth-field]');
  fields.forEach((field) => {
    field.readOnly = true;
    field.setAttribute('data-lpignore', 'true');
    field.setAttribute('data-1p-ignore', 'true');

    const unlock = () => {
      field.readOnly = false;
    };

    field.addEventListener('focus', unlock, { once: true });
    field.addEventListener('pointerdown', unlock, { once: true });
    field.addEventListener('keydown', unlock, { once: true });
  });
}

function bindAuthDraftInputs() {
  document.querySelectorAll('[data-auth-field]').forEach((field) => {
    field.addEventListener('input', () => {
      state.authDraft[field.name] = field.value;
    });
  });
}

function syncAuthDraftToInputs() {
  Object.entries(state.authDraft).forEach(([name, value]) => {
    const input = document.querySelector(`[name="${name}"]`);
    if (input) {
      input.value = value || '';
    }
  });
}

function updateAuthDraftFromForm(form) {
  Object.keys(state.authDraft).forEach((key) => {
    state.authDraft[key] = String(form.get(key) || '');
  });
}

function clearAuthDraft() {
  Object.keys(state.authDraft).forEach((key) => {
    state.authDraft[key] = '';
  });
}

function renderDashboard() {
  const careers = Array.isArray(state.db.careers) ? state.db.careers.filter(Boolean) : [];
  const selected = careers.find((career) => career.id === state.selectedCareerId) || null;
  const viewSnapshot = getDashboardViewSnapshot(selected);
  const transitionDirection = getDashboardTransitionDirection(viewSnapshot);
  const transitionClass = transitionDirection ? `screen-transition screen-transition-${transitionDirection}` : '';

  app.innerHTML = `
    ${renderStatusBanners()}
    <div class="dashboard-stack ${transitionClass}" data-screen-key="${escapeHtml(viewSnapshot.key)}">
      ${selected ? renderCareerView(selected) : renderCareerList(careers)}
    </div>
    ${renderAppModal()}
  `;

  if (selected) {
    wireCareerActions(selected);
  } else {
    wireCareerListActions();
  }
  wireModalActions();
  state.viewTransition.lastKey = viewSnapshot.key;
  state.viewTransition.lastDepth = viewSnapshot.depth;
  persistLastRoute();
  warmOfflineUrls(['/api/session', '/api/data']);
  if (selected && state.selectedSubjectId) {
    warmCachedSubjectResources(selected.id, state.selectedSubjectId);
  }
}

function getDashboardViewSnapshot(selectedCareer) {
  if (!selectedCareer) {
    return { key: 'career-list', depth: 0 };
  }
  if (state.selectedSubjectId) {
    return { key: `subject:${selectedCareer.id}:${state.selectedSubjectId}`, depth: 3 };
  }
  if (state.selectedStudyYear) {
    return { key: `year:${selectedCareer.id}:${state.selectedStudyYear}`, depth: 2 };
  }
  return { key: `career:${selectedCareer.id}`, depth: 1 };
}

function getDashboardTransitionDirection(nextSnapshot) {
  const lastKey = String(state.viewTransition?.lastKey || '').trim();
  const lastDepth = Number(state.viewTransition?.lastDepth || 0);
  if (!lastKey || lastKey === nextSnapshot.key) {
    return '';
  }
  if (nextSnapshot.depth > lastDepth) {
    return 'forward';
  }
  if (nextSnapshot.depth < lastDepth) {
    return 'backward';
  }
  return 'swap';
}

function renderAppModal() {
  const modal = state.modal;
  if (!modal) return '';
  return `
    <div class="app-modal-backdrop ${modal.type === 'viewer' ? 'app-modal-backdrop-viewer' : ''}" data-close-modal="backdrop">
      <section class="app-modal-card ${modal.type === 'viewer' ? 'app-modal-card-wide app-modal-card-viewer' : ''}" id="appModalCard" role="dialog" aria-modal="true" aria-labelledby="appModalTitle">
        ${modal.type === 'viewer'
          ? `
            <div class="app-modal-viewer-head">
              <button type="button" class="secondary app-modal-close app-modal-close-back" data-close-modal="button">Volver</button>
              ${modal.extraActionLabel ? `<button type="button" class="danger app-modal-viewer-action" id="modalExtraActionBtn">${escapeHtml(modal.extraActionLabel)}</button>` : ''}
            </div>
          `
          : `
            <div class="app-modal-head">
              <div>
                <p class="eyebrow">${escapeHtml(modal.eyebrow || 'Panel')}</p>
                <h3 id="appModalTitle">${escapeHtml(modal.title || '')}</h3>
                ${modal.message ? `<p class="meta">${escapeHtml(modal.message)}</p>` : ''}
              </div>
            </div>
          `}
        ${modal.type === 'confirm'
          ? `
            <div class="app-modal-actions">
              <button type="button" class="danger" id="modalConfirmBtn">${escapeHtml(modal.confirmLabel || 'Aceptar')}</button>
              <button type="button" class="secondary" data-close-modal="cancel">${escapeHtml(modal.cancelLabel || 'Cancelar')}</button>
            </div>
          `
          : modal.type === 'viewer' || modal.type === 'custom'
          ? `
            <div class="app-modal-viewer">
              ${modal.body || ''}
            </div>
          `
          : `
            <form id="appModalForm" class="stack-form app-modal-form">
              ${(modal.fields || []).map((field) => renderModalField(field)).join('')}
              <div class="app-modal-actions">
                <button type="submit">${escapeHtml(modal.submitLabel || 'Guardar')}</button>
                ${modal.extraActionLabel ? `<button type="button" class="danger" id="modalExtraActionBtn">${escapeHtml(modal.extraActionLabel)}</button>` : ''}
                <button type="button" class="secondary" data-close-modal="cancel">${escapeHtml(modal.cancelLabel || 'Cancelar')}</button>
              </div>
            </form>
          `}
      </section>
    </div>
  `;
}

function renderModalField(field) {
  const common = [
    `name="${escapeHtml(field.name)}"`,
    field.required ? 'required' : '',
    field.min !== undefined ? `min="${escapeHtml(field.min)}"` : '',
    field.max !== undefined ? `max="${escapeHtml(field.max)}"` : '',
    field.step !== undefined ? `step="${escapeHtml(field.step)}"` : '',
    field.inputMode ? `inputmode="${escapeHtml(field.inputMode)}"` : '',
    field.pattern ? `pattern="${escapeHtml(field.pattern)}"` : '',
  ].filter(Boolean).join(' ');
  const value = escapeHtml(field.value || '');
  if (field.type === 'select') {
    return `
      <label>
        <span>${escapeHtml(field.label)}</span>
        <select ${common}>
          ${(field.options || []).map((option) => `
            <option value="${escapeHtml(option.value)}" ${option.value === field.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
          `).join('')}
        </select>
      </label>
    `;
  }
  if (field.type === 'textarea') {
    return `
      <label>
        <span>${escapeHtml(field.label)}</span>
        <textarea ${common} rows="${field.rows || 4}" placeholder="${escapeHtml(field.placeholder || '')}">${value}</textarea>
      </label>
    `;
  }
  if (field.type === 'picker') {
    const selectedOption = (field.options || []).find((option) => option.value === field.value);
    return `
      <label class="modal-picker-field">
        <span>${escapeHtml(field.label)}</span>
        <input type="hidden" ${common} value="${value}">
        <div class="modal-picker" data-picker="${escapeHtml(field.name)}">
          <button type="button" class="modal-picker-trigger" data-picker-trigger="${escapeHtml(field.name)}">
            <span data-picker-label="${escapeHtml(field.name)}">${escapeHtml(selectedOption?.label || field.placeholder || 'Seleccionar')}</span>
          </button>
          <div class="modal-picker-list hidden" data-picker-list="${escapeHtml(field.name)}">
            ${(field.options || []).map((option) => `
              <button
                type="button"
                class="modal-picker-item ${option.value === field.value ? 'is-selected' : ''}"
                data-picker-value="${escapeHtml(option.value)}"
                data-picker-name="${escapeHtml(field.name)}"
                data-picker-option-label="${escapeHtml(option.label)}"
              >${escapeHtml(option.label)}</button>
            `).join('')}
          </div>
        </div>
      </label>
    `;
  }
  if (Array.isArray(field.options) && field.options.length) {
    return `
      <label class="modal-autocomplete-field">
        <span>${escapeHtml(field.label)}</span>
        <div class="modal-autocomplete-shell">
          <input
            type="${escapeHtml(field.type || 'text')}"
            ${common}
            value="${value}"
            placeholder="${escapeHtml(field.placeholder || '')}"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            data-autocomplete-field="${escapeHtml(field.name)}"
          >
          <div class="modal-autocomplete-list hidden" data-autocomplete-list="${escapeHtml(field.name)}"></div>
        </div>
      </label>
    `;
  }
  return `
    <label>
      <span>${escapeHtml(field.label)}</span>
      <input
        type="${escapeHtml(field.type || 'text')}"
        ${common}
        value="${value}"
        placeholder="${escapeHtml(field.placeholder || '')}"
      >
    </label>
  `;
}

function wireModalActions() {
  if (!state.modal) return;

  const modalCard = document.getElementById('appModalCard');
  if (modalCard) {
    modalCard.onclick = (event) => event.stopPropagation();
  }

  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.onclick = () => closeModal();
  });

  const confirmButton = document.getElementById('modalConfirmBtn');
  if (confirmButton) {
    confirmButton.onclick = async () => {
      const action = state.modal?.onConfirm;
      closeModal(false);
      if (action) {
        await action();
      }
    };
  }

  const form = document.getElementById('appModalForm');
  if (form) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const action = state.modal?.onSubmit;
      const values = Object.fromEntries(new FormData(form).entries());
      closeModal(false);
      if (action) {
        await action(values);
      }
    };
    const firstField = form.querySelector('input, select, textarea');
    if (firstField) {
      setTimeout(() => firstField.focus(), 0);
    }
  }

  wireModalAutocomplete();
  wireModalPickers();

  const extraActionButton = document.getElementById('modalExtraActionBtn');
  if (extraActionButton) {
    extraActionButton.onclick = async () => {
      const action = state.modal?.onExtraAction;
      closeModal(false);
      if (action) {
        await action();
      }
    };
  }

  if (state.modal?.type === 'viewer') {
    wireMaterialViewerControls();
  }
}

function wireModalPickers() {
  document.querySelectorAll('[data-picker-trigger]').forEach((trigger) => {
    const name = trigger.dataset.pickerTrigger || '';
    const list = document.querySelector(`[data-picker-list="${name}"]`);
    if (!list) return;
    trigger.onclick = () => {
      document.querySelectorAll('[data-picker-list]').forEach((other) => {
        if (other !== list) {
          other.classList.add('hidden');
        }
      });
      list.classList.toggle('hidden');
    };
  });

  document.querySelectorAll('[data-picker-value]').forEach((button) => {
    const name = button.dataset.pickerName || '';
    const input = document.querySelector(`input[type="hidden"][name="${cssEscape(name)}"]`);
    const label = document.querySelector(`[data-picker-label="${name}"]`);
    const list = document.querySelector(`[data-picker-list="${name}"]`);
    button.onclick = () => {
      if (input) {
        input.value = button.dataset.pickerValue || '';
      }
      if (label) {
        label.textContent = button.dataset.pickerOptionLabel || '';
      }
      document.querySelectorAll(`[data-picker-name="${name}"]`).forEach((item) => item.classList.remove('is-selected'));
      button.classList.add('is-selected');
      list?.classList.add('hidden');
    };
  });

  document.addEventListener('click', handleModalPickerOutsideClick, true);
}

function handleModalPickerOutsideClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('.modal-picker')) return;
  document.querySelectorAll('[data-picker-list]').forEach((list) => list.classList.add('hidden'));
  document.removeEventListener('click', handleModalPickerOutsideClick, true);
}

function wireModalAutocomplete() {
  const fields = state.modal?.fields || [];
  document.querySelectorAll('[data-autocomplete-field]').forEach((input) => {
    const fieldName = input.dataset.autocompleteField || '';
    const field = fields.find((item) => item.name === fieldName);
    const list = document.querySelector(`[data-autocomplete-list="${fieldName}"]`);
    if (!field || !list || !Array.isArray(field.options)) {
      return;
    }

    const options = field.options.map((option) => {
      if (typeof option === 'string') {
        return { value: option, label: option };
      }
      return {
        value: option.value || option.label || '',
        label: option.label || option.value || '',
      };
    }).filter((option) => option.value);

    const renderSuggestions = () => {
      const query = String(input.value || '').trim().toLowerCase();
      if (!query) {
        list.innerHTML = '';
        list.classList.add('hidden');
        return;
      }
      const matches = options.filter((option) => {
        return String(option.label || '').toLowerCase().includes(query)
          || String(option.value || '').toLowerCase().includes(query);
      }).slice(0, 6);
      if (!matches.length) {
        list.innerHTML = '';
        list.classList.add('hidden');
        return;
      }
      list.innerHTML = matches.map((option) => `
        <button type="button" class="modal-autocomplete-item" data-autocomplete-pick="${escapeHtml(option.value)}">
          ${escapeHtml(option.label)}
        </button>
      `).join('');
      list.classList.remove('hidden');
      list.querySelectorAll('[data-autocomplete-pick]').forEach((button) => {
        button.onclick = () => {
          input.value = button.dataset.autocompletePick || '';
          list.innerHTML = '';
          list.classList.add('hidden');
          input.focus();
        };
      });
    };

    input.addEventListener('input', renderSuggestions);
    input.addEventListener('focus', renderSuggestions);
    input.addEventListener('blur', () => {
      setTimeout(() => {
        list.classList.add('hidden');
      }, 120);
    });
  });
}

function openFormModal(config) {
  state.modal = { type: 'form', cancelLabel: 'Cancelar', ...config };
  render();
}

function openConfirmModal(config) {
  state.modal = { type: 'confirm', cancelLabel: 'Cancelar', confirmLabel: 'Aceptar', ...config };
  render();
}

function closeModal(shouldRender = true) {
  if (state.materialUpload?.abort) {
    state.materialUpload.abort();
    state.materialUpload = null;
  }
  state.modal = null;
  if (shouldRender) {
    render();
  }
}

function renderCareerList(careers) {
  const query = state.searchQuery.trim().toLowerCase();
  const filtered = query ? careers.filter((career) => matchesCareerSearch(career, query)) : careers;
  return `
    <section class="panel career-selector-panel">
      <div class="row spread selector-head">
        <div>
          <p class="eyebrow">Carreras</p>
          <h2>Elegi una carrera</h2>
        </div>
        <span class="meta">${filtered.length} de ${careers.length}</span>
      </div>
      <div class="career-grid">
        ${filtered.length ? filtered.map((career) => `
          <article class="career-card career-card-large" style="--career-accent:${escapeHtml(career.color || '#9f4c3c')}">
            <div class="career-card-body">
              <p class="eyebrow">Carrera</p>
              <h3>${escapeHtml(career.name)}</h3>
            </div>
            <div class="career-card-foot row spread">
              <button data-open-career="${career.id}">Entrar</button>
              <button class="danger" data-delete-career="${career.id}">Eliminar</button>
            </div>
          </article>
        `).join('') : '<div class="career-empty"><p class="empty">No encontre resultados para esa busqueda.</p></div>'}
      </div>

      <div class="career-actions">
        <button class="secondary wide-button" id="toggleCreateCareerPanel">${state.showCreateCareerPanel ? 'Cerrar crear carrera' : 'Crear carrera'}</button>
      </div>

      ${state.showCreateCareerPanel ? `
        <section class="create-career-drawer">
          <form id="careerForm" class="stack-form compact-form compact-form-two">
            <label class="compact-grow">
              <span>Nueva carrera</span>
              <input name="name" required placeholder="Ej: Profesorado de Historia">
            </label>
            <div class="row end compact-actions">
              <button type="submit">Guardar carrera</button>
            </div>
          </form>
        </section>
      ` : ''}
    </section>
  `;
}

function renderCareerView(career) {
  const subjects = getCareerSubjects(career);
  const selectedSubject = subjects.find((subject) => subject.id === state.selectedSubjectId) || null;
  if (selectedSubject) {
    return renderSubjectDetailView(career, selectedSubject);
  }
  if (!state.selectedStudyYear) {
    return renderCareerYearHub(career);
  }
  const activeBoard = getActiveScheduleBoard(career);
  const activeYear = getActiveStudyYear(career);
  const isMobile = isMobileViewport();
  const scheduleCount = subjects.filter((subject) => subject.year === activeYear).length;
  const scheduleContent = `
    <section class="schedule-board-panel schedule-board-only">
      <div class="schedule-form-head">
        <div>
          <p class="eyebrow">Semana</p>
          <h4>${escapeHtml(activeBoard?.name || 'Planilla semanal')}</h4>
        </div>
      </div>
      ${renderScheduleBoardSelector(career, activeBoard)}
      ${renderScheduleBoard(career, activeBoard, activeYear)}
    </section>
  `;
  return `
    <section class="panel career-detail-panel">
      <div class="year-workspace-bar" style="--career-accent:${escapeHtml(career.color || '#9f4c3c')}">
        <div class="year-workspace-title">
          <span class="year-workspace-kicker">Año</span>
          <h2>${escapeHtml(activeYear)}</h2>
        </div>
        <details class="subject-card-menu career-header-menu">
          <summary class="subject-card-menu-trigger career-header-menu-trigger" aria-label="Opciones de carrera">⋯</summary>
          <div class="subject-card-menu-sheet">
            <button type="button" class="secondary subject-menu-item" data-edit-career="${career.id}">Editar carrera</button>
          </div>
        </details>
      </div>

      <section class="schedule-toggle-shell schedule-toggle-shell-top">
        <button type="button" class="schedule-toggle-head schedule-toggle-head-compact" id="scheduleToggleBtn" aria-expanded="${state.showSchedulePanel ? 'true' : 'false'}" aria-controls="${isMobile ? 'scheduleMobileSheet' : 'schedulePanel'}">
          <span>Horarios</span>
        </button>
        ${isMobile ? '' : `<section id="schedulePanel" class="${state.showSchedulePanel ? '' : 'hidden'}">${scheduleContent}</section>`}
      </section>

      <section class="schedule-subject-panel career-subject-panel">
        <div class="career-subject-panel-head">
          <button type="button" id="openCreateSubjectPanel">Crear materia</button>
        </div>

        <div class="career-subject-panel-body">
          ${renderSubjectLibraryToolbar(career, activeYear)}
          <div class="schedule-subject-list">
            ${renderSubjectLibrary(career, activeYear)}
          </div>
        </div>
      </section>

      ${isMobile && state.showSchedulePanel ? `
        <div class="schedule-mobile-overlay" id="scheduleMobileOverlay">
          <section class="schedule-mobile-sheet" id="scheduleMobileSheet" role="dialog" aria-modal="true" aria-labelledby="scheduleMobileTitle">
            <div class="schedule-mobile-sheet-head">
              <div>
                <p class="eyebrow">Horarios</p>
                <h3 id="scheduleMobileTitle">${escapeHtml(activeBoard?.name || 'Planilla semanal')}</h3>
              </div>
              <button type="button" class="secondary" id="scheduleMobileCloseBtn">Cerrar</button>
            </div>
            ${scheduleContent}
          </section>
        </div>
      ` : ''}
    </section>
  `;
}
function renderCareerYearHub(career) {
  const years = getCareerYears(career);
  const delegate = career.delegate || null;
  return `
    <section class="panel career-detail-panel">
      <div class="hero career-detail-hero" style="--career-accent:${escapeHtml(career.color || '#9f4c3c')}">
        <div class="career-hero-copy">
          <p class="eyebrow">Carrera</p>
          <h2>${escapeHtml(career.name)}</h2>
        </div>
        <div class="career-hero-side">
          <button type="button" class="career-delegate-chip ${delegate ? 'has-delegate' : ''}" id="openCareerDelegateModal">
            ${delegate
              ? `<span class="career-delegate-chip-label">Delegado</span><span class="career-delegate-chip-name">${escapeHtml(delegate.fullName)}</span>`
              : '<span class="career-delegate-chip-empty">No hay delegado · Agregar</span>'}
          </button>
          <button class="secondary" id="createStudyYearBtn">Crear año</button>
        </div>
      </div>

      <section class="study-year-hub">
        ${years.length ? '' : `
          <article class="study-year-card study-year-card-empty" style="--career-accent:${escapeHtml(career.color || '#9f4c3c')}">
            <p class="eyebrow">Sin años</p>
            <h3>Crea el primero</h3>
            <p>Empieza creando el primer año.</p>
            <button type="button" id="createFirstStudyYearBtn">Crear año</button>
          </article>
        `}
        ${years.map((year) => {
          const subjectCount = getCareerSubjects(career).filter((subject) => subject.year === year).length;
          return `
            <article class="study-year-card" style="--career-accent:${escapeHtml(career.color || '#9f4c3c')}">
              <p class="eyebrow">Año</p>
              <h3>${escapeHtml(formatStudyYearDisplay(year))}</h3>
              <p>${subjectCount} materia${subjectCount === 1 ? '' : 's'}</p>
              <button type="button" data-open-study-year="${escapeHtml(year)}">Entrar</button>
            </article>
          `;
        }).join('')}
      </section>
    </section>
  `;
}

function renderSubjectDetailView(career, subject) {
  const subjectRecord = (career.subjects || []).find((item) => item.id === subject.id) || subject;
  const folderTrail = getSubjectFolderTrail(subjectRecord, state.currentSubjectFolderId);
  const currentFolder = folderTrail[folderTrail.length - 1] || null;
  const query = state.subjectMaterialSearchQuery.trim().toLowerCase();
  const materials = [...getVisibleSubjectMaterials(subjectRecord, state.currentSubjectFolderId)]
    .sort((a, b) => {
      const typeDiff = Number(b.itemType === 'folder') - Number(a.itemType === 'folder');
      if (typeDiff !== 0) return typeDiff;
      return String(a.uploadedAt || '').localeCompare(String(b.uploadedAt || ''));
    })
    .filter((item) => matchesSubjectMaterialSearch(item, query));
  const color = getSubjectColor(subject);
  return `
    <section class="panel career-detail-panel">
      <div class="hero career-detail-hero">
        <div class="subject-hero-main">
          <p class="eyebrow">Materia</p>
          <h2>${escapeHtml(subject.name)}</h2>
          <p>${escapeHtml(subject.teacher || 'Sin docente')}</p>
        </div>
        <form class="subject-hero-search" id="subjectMaterialSearchForm">
          <div class="subject-hero-search-input-wrap">
            <input
              id="subjectMaterialSearchInput"
              name="subjectMaterialSearch"
              type="search"
              placeholder="Buscar en ${escapeHtml(subject.name)}"
              value="${escapeHtml(state.subjectMaterialSearchQuery)}"
            >
            <button
              type="button"
              class="subject-hero-search-clear ${state.subjectMaterialSearchQuery ? '' : 'hidden'}"
              id="clearSubjectMaterialSearch"
              aria-label="Limpiar búsqueda"
            >×</button>
          </div>
          <button type="submit" class="secondary ${state.subjectMaterialSearchQuery ? '' : 'hidden'}" id="submitSubjectMaterialSearch">Buscar</button>
        </form>
      </div>

      <section class="subject-detail-shell">
        <section class="subject-material-list">
          <div class="schedule-form-head">
            <div>
              <p class="eyebrow">Publicaciones</p>
              <h4>${materials.length} ${query ? 'encontradas' : 'cargadas'}</h4>
              ${folderTrail.length ? `
                <div class="subject-folder-breadcrumbs">
                  <button type="button" class="subject-folder-crumb ${currentFolder ? '' : 'active'}" data-open-material-folder="" data-material-folder-drop-target="">Raiz</button>
                  ${folderTrail.map((folder) => `
                    <span class="subject-folder-sep">/</span>
                    <button type="button" class="subject-folder-crumb ${folder.id === currentFolder?.id ? 'active' : ''}" data-open-material-folder="${escapeHtml(folder.id)}" data-material-folder-drop-target="${escapeHtml(folder.id)}">${escapeHtml(folder.title)}</button>
                  `).join('')}
                </div>
              ` : ''}
            </div>
            ${currentFolder ? `
              <button
                type="button"
                class="danger subject-folder-delete"
                id="deleteCurrentSubjectFolder"
                data-delete-subject-material="${escapeHtml(currentFolder.id)}"
                data-subject-id="${escapeHtml(subjectRecord.id)}"
                data-parent-folder-id="${escapeHtml(currentFolder.parentFolderId || '')}"
              >Eliminar carpeta</button>
            ` : ''}
          </div>
          ${materials.length ? materials.map((item) => renderSubjectMaterialCard(career, subjectRecord, item)).join('') : `
            <div class="schedule-empty-card">
              <p class="empty">${query ? 'No encontre publicaciones para esa busqueda.' : 'Todavia no hay publicaciones en esta materia.'}</p>
            </div>
          `}
        </section>
      </section>
      <button type="button" class="subject-floating-create" id="openSubjectMaterialModal" aria-label="Nueva publicación">+</button>
    </section>
  `;
}

function wireCareerListActions() {
  document.querySelectorAll('[data-open-career]').forEach((button) => {
    button.onclick = () => {
      state.selectedCareerId = button.dataset.openCareer;
      state.selectedSubjectId = null;
      persistLastCareerPreference(state.selectedCareerId);
      restoreSubjectLibraryPreferences();
      const career = (state.db.careers || []).find((item) => item.id === button.dataset.openCareer);
      state.selectedScheduleBoardId = (career?.scheduleBoards || [])[0]?.id || null;
      render();
    };
  });

  const careerSearchForm = document.getElementById('careerSearchForm');
  if (careerSearchForm) {
    careerSearchForm.onsubmit = (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      state.searchQuery = String(form.get('careerSearch') || document.getElementById('careerSearchInput')?.value || '').trim();
      render();
    };
  }

  const clearCareerSearch = document.getElementById('clearCareerSearch');
  if (clearCareerSearch) {
    clearCareerSearch.onclick = () => {
      state.searchQuery = '';
      render();
    };
  }

  document.querySelectorAll('[data-delete-career]').forEach((button) => {
    button.onclick = () => {
      openConfirmModal({
        eyebrow: 'Carrera',
        title: 'Eliminar carrera',
        message: 'Se eliminara la carrera completa con sus horarios, unidades y archivos.',
        confirmLabel: 'Eliminar',
        onConfirm: async () => {
          try {
            await api(`/api/careers/${button.dataset.deleteCareer}`, { method: 'DELETE' });
            await loadData();
            render();
            setNotice('Carrera eliminada.');
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    };
  });

  const toggleCreateCareerPanel = document.getElementById('toggleCreateCareerPanel');
  if (toggleCreateCareerPanel) {
    toggleCreateCareerPanel.onclick = () => {
      state.showCreateCareerPanel = !state.showCreateCareerPanel;
      render();
    };
  }

  const careerForm = document.getElementById('careerForm');
  if (careerForm) {
    careerForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        await api('/api/careers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.get('name'),
          }),
        });
        await loadData();
        state.showCreateCareerPanel = false;
        render();
        event.currentTarget.reset();
        setNotice('Carrera creada.');
      } catch (error) {
        setNotice(error.message);
      }
    };
  }
}

function wireCareerActions(career) {
  const backToCareers = document.getElementById('backToCareers');
  if (backToCareers) {
    backToCareers.onclick = () => {
      state.selectedCareerId = null;
      state.selectedSubjectId = null;
      state.selectedScheduleBoardId = null;
      state.selectedStudyYear = '';
      state.showCreateSubjectPanel = false;
      render();
    };
  }

  const backToStudyYears = document.getElementById('backToStudyYears');
  if (backToStudyYears) {
    backToStudyYears.onclick = () => {
      state.selectedSubjectId = null;
      state.selectedStudyYear = '';
      state.showCreateSubjectPanel = false;
      render();
    };
  }

  const backToSubjectList = document.getElementById('backToSubjectList');
  if (backToSubjectList) {
    backToSubjectList.onclick = () => {
      state.selectedSubjectId = null;
      state.currentSubjectFolderId = null;
      render();
    };
  }

  const backToCareerFromSubject = document.getElementById('backToCareerFromSubject');
  if (backToCareerFromSubject) {
    backToCareerFromSubject.onclick = () => {
      state.selectedSubjectId = null;
      state.currentSubjectFolderId = null;
      render();
    };
  }

  document.querySelectorAll('[data-open-board]').forEach((button) => {
    button.onclick = () => {
      state.selectedScheduleBoardId = button.dataset.openBoard;
      render();
    };
  });

  document.querySelectorAll('[data-open-study-year]').forEach((button) => {
    button.onclick = () => {
      state.selectedStudyYear = button.dataset.openStudyYear;
      persistLastStudyYearPreference(state.selectedStudyYear);
      state.selectedSubjectId = null;
      state.showCreateSubjectPanel = false;
      restoreSubjectLibraryPreferences();
      render();
    };
  });

  const subjectLibrarySearchForm = document.getElementById('subjectLibrarySearchForm');
  if (subjectLibrarySearchForm) {
    subjectLibrarySearchForm.onsubmit = (event) => {
      event.preventDefault();
    };
  }

  const subjectLibrarySearchInput = document.getElementById('subjectLibrarySearchInput');
  const clearSubjectLibrarySearch = document.getElementById('clearSubjectLibrarySearch');
  if (subjectLibrarySearchInput) {
    subjectLibrarySearchInput.oninput = (event) => {
      state.subjectLibraryQuery = String(event.currentTarget.value || '').trimStart();
      persistSubjectLibraryPreferences();
      clearSubjectLibrarySearch?.classList.toggle('hidden', !state.subjectLibraryQuery.trim());
      render();
    };
  }

  if (clearSubjectLibrarySearch) {
    clearSubjectLibrarySearch.onclick = () => {
      state.subjectLibraryQuery = '';
      persistSubjectLibraryPreferences();
      render();
    };
  }

  document.querySelectorAll('[data-subject-sort]').forEach((button) => {
    button.onclick = () => {
      state.subjectLibrarySort = button.dataset.subjectSort || 'favorites';
      persistSubjectLibraryPreferences();
      render();
    };
  });

  document.querySelectorAll('[data-toggle-favorite-subject]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavoriteSubject(button.dataset.toggleFavoriteSubject, career.id);
      render();
    };
  });

  const openCreateSubjectPanel = document.getElementById('openCreateSubjectPanel');
  if (openCreateSubjectPanel) {
    openCreateSubjectPanel.onclick = () => {
      const activeYear = getActiveStudyYear(career);
      openFormModal({
        eyebrow: 'Materia',
        title: `Crear en ${formatStudyYearDisplay(activeYear)}`,
        fields: [
          { name: 'subject', label: 'Nombre', required: true, placeholder: 'Historia Moderna' },
          { name: 'teacher', label: 'Docente', required: true, placeholder: 'Maria Perez' },
        ],
        submitLabel: 'Guardar materia',
        onSubmit: async ({ subject, teacher }) => {
          const normalizedSubject = String(subject || '').trim();
          const normalizedTeacher = String(teacher || '').trim();
          if (!normalizedSubject) {
            setNotice('Escribe el nombre de la materia.');
            return;
          }
          if (!normalizedTeacher) {
            setNotice('Escribe el nombre de la docente.');
            return;
          }
          try {
            await api(`/api/careers/${career.id}/subjects`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: normalizedSubject,
                teacher: normalizedTeacher,
                year: activeYear,
              }),
            });
            await loadData();
            state.selectedStudyYear = activeYear;
            persistLastStudyYearPreference(state.selectedStudyYear);
            render();
            setNotice('Materia creada. Ya la puedes usar en la grilla semanal.');
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    };
  }

  const createStudyYearBtn = document.getElementById('createStudyYearBtn');
  if (createStudyYearBtn) {
    createStudyYearBtn.onclick = () => createStudyYear(career);
  }

  const openCareerDelegateModal = document.getElementById('openCareerDelegateModal');
  if (openCareerDelegateModal) {
    openCareerDelegateModal.onclick = () => {
      const registeredUsers = Array.isArray(state.db.users) ? state.db.users : [];
      openFormModal({
        eyebrow: 'Delegado',
        title: career.delegate ? 'Cambiar delegado' : 'Agregar delegado',
        fields: [
          {
            name: 'identifier',
            label: 'Nombre completo o Gmail',
            value: career.delegate?.fullName || '',
            required: !career.delegate,
            placeholder: 'Ej: Tomas Meister',
            options: registeredUsers.map((user) => ({
              value: user.fullName || user.email || '',
              label: user.fullName || user.email || '',
            })),
          },
        ],
        submitLabel: 'Guardar',
        extraActionLabel: career.delegate ? 'Quitar delegado' : '',
        onSubmit: async ({ identifier }) => {
          try {
            await api(`/api/careers/${career.id}/delegate`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                identifier: String(identifier || '').trim(),
              }),
            });
            await loadData();
            render();
            setNotice('Delegado guardado.');
          } catch (error) {
            setNotice(error.message);
          }
        },
        onExtraAction: career.delegate ? async () => {
          try {
            await api(`/api/careers/${career.id}/delegate`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifier: '' }),
            });
            await loadData();
            render();
            setNotice('Delegado quitado.');
          } catch (error) {
            setNotice(error.message);
          }
        } : null,
      });
    };
  }

  const createFirstStudyYearBtn = document.getElementById('createFirstStudyYearBtn');
  if (createFirstStudyYearBtn) {
    createFirstStudyYearBtn.onclick = () => createStudyYear(career);
  }

  const createAnotherStudyYearBtn = document.getElementById('createAnotherStudyYearBtn');
  if (createAnotherStudyYearBtn) {
    createAnotherStudyYearBtn.onclick = () => createStudyYear(career);
  }

  const createScheduleBoardBtn = document.getElementById('createScheduleBoardBtn');
  if (createScheduleBoardBtn) {
    createScheduleBoardBtn.onclick = () => {
      const defaultName = `Planilla ${(career.scheduleBoards || []).length + 1}`;
      openFormModal({
        eyebrow: 'Horarios',
        title: 'Nueva planilla',
        fields: [
          { name: 'name', label: 'Nombre de la nueva planilla', value: defaultName, required: true, placeholder: 'Planilla 2' },
        ],
        submitLabel: 'Crear planilla',
        onSubmit: async ({ name }) => {
          try {
            const board = await api(`/api/careers/${career.id}/schedule-boards`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            await loadData();
            state.selectedScheduleBoardId = board.id;
            render();
            setNotice('Planilla creada.');
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    };
  }

  const scheduleToggleBtn = document.getElementById('scheduleToggleBtn');
  const schedulePanel = document.getElementById('schedulePanel');
  if (scheduleToggleBtn) {
    scheduleToggleBtn.onclick = () => {
      if (isMobileViewport()) {
        const scrollY = window.scrollY;
        state.showSchedulePanel = true;
        render();
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
        return;
      }
      if (!schedulePanel) {
        return;
      }
      state.showSchedulePanel = !state.showSchedulePanel;
      scheduleToggleBtn.setAttribute('aria-expanded', state.showSchedulePanel ? 'true' : 'false');
      schedulePanel.classList.toggle('hidden', !state.showSchedulePanel);
    };
  }

  const scheduleMobileCloseBtn = document.getElementById('scheduleMobileCloseBtn');
  if (scheduleMobileCloseBtn) {
    scheduleMobileCloseBtn.onclick = () => {
      state.showSchedulePanel = false;
      render();
    };
  }

  const scheduleMobileOverlay = document.getElementById('scheduleMobileOverlay');
  if (scheduleMobileOverlay) {
    scheduleMobileOverlay.onclick = (event) => {
      if (event.target === scheduleMobileOverlay) {
        state.showSchedulePanel = false;
        render();
      }
    };
  }

  const openSubjectMaterialModal = document.getElementById('openSubjectMaterialModal');
  if (openSubjectMaterialModal && state.selectedSubjectId) {
    openSubjectMaterialModal.onclick = () => {
      openMaterialUploadModal();
    };
  }

  const subjectMaterialForm = document.getElementById('subjectMaterialForm');
  if (subjectMaterialForm && state.selectedSubjectId) {
    const materialTypeInputs = [...document.querySelectorAll('input[name="itemType"]')];
    const materialTitleInput = document.getElementById('subjectMaterialTitleInput');
    const materialTitleHint = document.getElementById('subjectMaterialTitleHint');
    const materialFileField = document.getElementById('subjectMaterialFileField');
    const materialFileInput = document.getElementById('subjectMaterialFileInput');
    const materialFileLabel = document.getElementById('subjectMaterialFileLabel');
    const materialFileButtonText = document.getElementById('subjectMaterialFileButtonText');
    const materialFileName = document.getElementById('subjectMaterialFileName');
    const materialTextField = document.getElementById('subjectMaterialTextField');
    const materialTextInput = subjectMaterialForm.querySelector('textarea[name="content"]');
    const materialUrlField = document.getElementById('subjectMaterialUrlField');
    const materialUrlInput = document.getElementById('subjectMaterialUrlInput');
    const materialPreview = document.getElementById('subjectMaterialPreview');
    const materialPreviewImage = document.getElementById('subjectMaterialPreviewImage');
    const materialPreviewEmpty = document.getElementById('subjectMaterialPreviewEmpty');
    const materialProgress = document.getElementById('subjectMaterialUploadProgress');
    const materialProgressBar = document.getElementById('subjectMaterialUploadProgressBar');
    const materialProgressFill = document.getElementById('subjectMaterialUploadProgressFill');
    const materialProgressText = document.getElementById('subjectMaterialUploadProgressText');
    const materialSubmitButton = document.getElementById('subjectMaterialSubmitBtn');
    const materialCancelButton = document.getElementById('subjectMaterialCancelBtn');
    let currentPreviewUrl = '';
    const detectSelectedType = () => {
      const selected = String(materialTypeInputs.find((input) => input.checked)?.value || 'file');
      if (selected !== 'file') {
        return selected;
      }
      const file = materialFileInput?.files?.[0] || null;
      return file && String(file.type || '').startsWith('image/') ? 'image' : 'file';
    };
    const setUploadState = (active, progress = 0, isComputable = true) => {
      subjectMaterialForm.classList.toggle('is-uploading', active);
      if (materialSubmitButton) {
        materialSubmitButton.disabled = active;
        materialSubmitButton.textContent = active ? 'Subiendo...' : 'Publicar';
      }
      if (materialCancelButton) {
        materialCancelButton.textContent = active ? 'Cancelar subida' : 'Cancelar';
      }
      if (materialProgress) {
        materialProgress.classList.toggle('hidden', !active);
      }
      if (materialProgressBar && materialProgressFill) {
        materialProgressBar.classList.toggle('is-indeterminate', !isComputable);
        materialProgressBar.setAttribute('aria-valuenow', String(progress));
        materialProgressFill.style.width = `${Math.max(4, Math.min(progress, 100))}%`;
      }
      if (materialProgressText) {
        materialProgressText.textContent = active
          ? (isComputable ? `Subiendo ${Math.round(progress)}%` : 'Subiendo...')
          : '';
      }
    };
    const clearPreview = () => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = '';
      }
      if (materialPreviewImage) {
        materialPreviewImage.removeAttribute('src');
      }
      if (materialPreview) {
        materialPreview.classList.add('hidden');
      }
      if (materialPreviewEmpty) {
        materialPreviewEmpty.textContent = 'Todavía no elegiste una imagen.';
      }
    };
    const syncFileUi = () => {
      const itemType = detectSelectedType();
      const file = materialFileInput?.files?.[0] || null;
      if (materialFileLabel) {
        materialFileLabel.textContent = itemType === 'image' ? 'Foto' : 'Archivo';
      }
      if (materialFileButtonText) {
        materialFileButtonText.textContent = itemType === 'image' ? 'Seleccionar foto' : 'Seleccionar archivo';
      }
      if (materialFileName) {
        materialFileName.textContent = file ? file.name : (itemType === 'image' ? 'No elegiste ninguna foto' : 'No elegiste ningún archivo');
      }
      if (itemType !== 'image' || !file) {
        clearPreview();
        return;
      }
      if (materialPreview && materialPreviewImage) {
        clearPreview();
        currentPreviewUrl = URL.createObjectURL(file);
        materialPreviewImage.src = currentPreviewUrl;
        materialPreview.classList.remove('hidden');
      }
    };
    const syncMaterialTypeUi = (resetFileInput = true) => {
      const selectedType = String(materialTypeInputs.find((input) => input.checked)?.value || 'file');
      const itemType = detectSelectedType();
      const showFile = selectedType === 'file';
      const showText = selectedType === 'note' || selectedType === 'file';
      const showUrl = itemType === 'link';
      if (materialFileField) {
        materialFileField.classList.toggle('hidden', !showFile);
      }
      if (materialTextField) {
        materialTextField.classList.toggle('hidden', !showText);
      }
      if (materialUrlField) {
        materialUrlField.classList.toggle('hidden', !showUrl);
      }
      if (materialTitleInput) {
        materialTitleInput.required = itemType === 'folder' || itemType === 'note';
        materialTitleInput.placeholder = itemType === 'image'
          ? 'Opcional'
          : itemType === 'file'
            ? 'Opcional'
            : itemType === 'link'
              ? 'Opcional'
            : itemType === 'folder'
              ? 'Nombre de la carpeta'
              : 'Escribe un título';
      }
      if (materialTitleHint) {
        materialTitleHint.textContent = itemType === 'image'
          ? 'Si lo dejas vacío, usamos el nombre de la foto.'
          : itemType === 'file'
            ? 'Si lo dejas vacío, usamos el nombre del archivo.'
            : itemType === 'link'
              ? 'Si lo dejas vacío, usamos la dirección del enlace.'
            : '';
        materialTitleHint.classList.toggle('hidden', !(itemType === 'image' || itemType === 'file' || itemType === 'link'));
      }
      if (materialFileInput && resetFileInput) {
        materialFileInput.value = '';
        materialFileInput.accept = 'application/pdf,text/plain,.pdf,.txt,image/*,.png,.jpg,.jpeg,.webp,.gif';
      }
      if (!showText && materialTextInput) {
        materialTextInput.value = '';
      }
      if (!showUrl && materialUrlInput) {
        materialUrlInput.value = '';
      }
      syncFileUi();
    };
    materialTypeInputs.forEach((input) => input.addEventListener('change', syncMaterialTypeUi));
    if (materialFileInput) {
      materialFileInput.addEventListener('change', () => {
        syncFileUi();
        syncMaterialTypeUi(false);
      });
    }
    if (materialCancelButton) {
      materialCancelButton.onclick = () => {
        if (state.materialUpload?.abort) {
          state.materialUpload.abort();
          state.materialUpload = null;
          setUploadState(false);
          return;
        }
        closeModal();
      };
    }
    syncMaterialTypeUi();
    subjectMaterialForm.onsubmit = async (event) => {
      event.preventDefault();
      const formEl = event.currentTarget;
      const form = new FormData(formEl);
      form.set('itemType', detectSelectedType());
      form.set('parentFolderId', state.currentSubjectFolderId || '');
      setUploadState(true, 6, false);
      try {
        const uploadTask = uploadFormData(`/api/careers/${career.id}/subjects/${state.selectedSubjectId}/materials`, form, {
          method: 'POST',
          onProgress: (progressEvent) => {
            if (progressEvent.lengthComputable && progressEvent.total > 0) {
              setUploadState(true, (progressEvent.loaded / progressEvent.total) * 100, true);
              return;
            }
            setUploadState(true, 50, false);
          },
        });
        state.materialUpload = uploadTask;
        await uploadTask.promise;
        await loadData();
        state.materialUpload = null;
        closeModal(false);
        render();
        formEl.reset();
        setNotice('Publicacion subida en la materia.');
      } catch (error) {
        state.materialUpload = null;
        if (error?.name === 'AbortError') {
          setNotice('Subida cancelada.');
          closeModal(false);
          render();
          return;
        }
        setNotice(error.message);
      } finally {
        setUploadState(false);
        clearPreview();
      }
    };
  }

  document.querySelectorAll('[data-edit-subject]').forEach((button) => {
    button.onclick = () => {
      const subject = getCareerSubjects(career).find((item) => item.id === button.dataset.editSubject);
      if (!subject) return;
      const deleteVotes = Array.isArray(subject.deleteVotes) ? subject.deleteVotes.length : 0;
      openFormModal({
        eyebrow: 'Materia',
        title: 'Editar materia',
        message: `Para eliminar esta materia hacen falta 3 votos. Lleva ${deleteVotes}/3.`,
        fields: [
          { name: 'name', label: 'Nombre de la materia', value: subject.name, required: true },
          { name: 'teacher', label: 'Docente', value: subject.teacher || '', required: true },
        ],
        submitLabel: 'Guardar cambios',
        extraActionLabel: deleteVotes >= 3 ? 'Eliminar materia' : `Votar eliminación (${deleteVotes}/3)`,
        onSubmit: async ({ name, teacher }) => {
          try {
            await api(`/api/careers/${career.id}/subjects/${subject.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, teacher }),
            });
            await loadData();
            state.selectedStudyYear = normalizeStudyYear(subject.year);
            persistLastStudyYearPreference(state.selectedStudyYear);
            render();
            setNotice('Materia actualizada.');
          } catch (error) {
            setNotice(error.message);
          }
        },
        onExtraAction: async () => {
          try {
            const result = await api(`/api/careers/${career.id}/subjects/${subject.id}/delete-votes`, {
              method: 'POST',
            });
            await loadData();
            if (result.deleted) {
              if (state.selectedSubjectId === subject.id) {
                state.selectedSubjectId = null;
              }
              render();
              setNotice('Materia eliminada.');
              return;
            }
            render();
            setNotice(`Voto registrado. Van ${result.votes}/${result.required} para eliminar.`);
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    };
  });

  document.querySelectorAll('[data-add-schedule-day]').forEach((button) => {
    button.onclick = () => {
      const activeBoard = getActiveScheduleBoard(career);
      if (!activeBoard) {
        setNotice('Primero crea una planilla.');
        return;
      }
      const day = normalizeScheduleDayLabel(button.dataset.day);
      const subjects = getCareerSubjects(career).filter((subject) => subject.year === getActiveStudyYear(career));
      if (!subjects.length) {
        setNotice('Primero crea una materia.');
        return;
      }
      openFormModal({
        eyebrow: 'Horarios',
        title: `Nuevo bloque en ${day}`,
        fields: [
          {
            name: 'subjectId',
            label: 'Materia',
            type: 'picker',
            value: subjects[0]?.id || '',
            options: subjects.map((subject) => ({
              value: subject.id,
              label: `${subject.name} - ${subject.teacher || 'Sin docente'}`,
            })),
          },
          { name: 'start', label: 'Hora de inicio', type: 'time', value: '08:00', required: true },
          { name: 'end', label: 'Hora de fin', type: 'time', value: '10:00', required: true },
        ],
        submitLabel: 'Agregar bloque',
        onSubmit: async ({ subjectId, start, end }) => {
          const subject = subjects.find((item) => item.id === subjectId);
          const normalizedStart = String(start || '').trim();
          const normalizedEnd = String(end || '').trim();
          if (!subject || !day) {
            setNotice('No encontre esa materia.');
            return;
          }
          if (!normalizedStart || !normalizedEnd) {
            setNotice(`Completa inicio y fin para ${day}.`);
            return;
          }
          if (!SCHEDULE_DAYS.includes(day)) {
            setNotice('Elige un dia valido de lunes a viernes.');
            return;
          }
          if (hasDuplicateSchedule(activeBoard, { day, start: normalizedStart, end: normalizedEnd, subjectId: subject.id })) {
            setNotice('Ese bloque ya existe para esa materia en ese dia. Borra el otro primero.');
            return;
          }

          try {
            await api(`/api/careers/${career.id}/schedule`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                day,
                start: normalizedStart,
                end: normalizedEnd,
                boardId: activeBoard.id,
                subjectId: subject.id,
                subject: subject.name,
                teacher: subject.teacher,
                description: subject.description,
              }),
            });
            await loadData();
            render();
            setNotice('Horario agregado.');
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    };
  });

  const editCareerButton = document.querySelector(`[data-edit-career="${career.id}"]`);
  if (editCareerButton) {
    editCareerButton.onclick = () => {
      openFormModal({
        eyebrow: 'Carrera',
        title: 'Editar carrera',
        fields: [
          { name: 'name', label: 'Nuevo nombre de la carrera', value: career.name, required: true },
        ],
        submitLabel: 'Guardar cambios',
        extraActionLabel: 'Eliminar carrera',
        onSubmit: async ({ name }) => {
          try {
            await api(`/api/careers/${career.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            await loadData();
            render();
            setNotice('Carrera actualizada.');
          } catch (error) {
            setNotice(error.message);
          }
        },
        onExtraAction: async () => {
          openConfirmModal({
            eyebrow: 'Carrera',
            title: 'Eliminar carrera',
            message: 'Se eliminara la carrera completa con sus horarios, unidades y archivos.',
            confirmLabel: 'Eliminar',
            onConfirm: async () => {
              try {
                await api(`/api/careers/${career.id}`, { method: 'DELETE' });
                await loadData();
                state.selectedCareerId = null;
                state.selectedSubjectId = null;
                state.selectedScheduleBoardId = null;
                render();
                setNotice('Carrera eliminada.');
              } catch (error) {
                setNotice(error.message);
              }
            },
          });
        },
      });
    };
  }

  const deleteCareerButton = document.querySelector(`[data-delete-career="${career.id}"]`);
  if (deleteCareerButton) {
    deleteCareerButton.onclick = () => {
      openConfirmModal({
        eyebrow: 'Carrera',
        title: 'Eliminar carrera',
        message: 'Se eliminara la carrera completa con sus horarios, unidades y archivos.',
        confirmLabel: 'Eliminar',
        onConfirm: async () => {
          try {
            await api(`/api/careers/${career.id}`, { method: 'DELETE' });
            await loadData();
            state.selectedCareerId = null;
            state.selectedSubjectId = null;
            state.selectedScheduleBoardId = null;
            render();
            setNotice('Carrera eliminada.');
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    };
  }

  document.querySelectorAll('[data-delete-schedule]').forEach((button) => {
    button.onclick = () => {
      openConfirmModal({
        eyebrow: 'Horarios',
        title: 'Eliminar horario',
        message: 'Se eliminara este horario.',
        confirmLabel: 'Eliminar',
        onConfirm: async () => {
          try {
            await api(`/api/careers/${career.id}/schedule/${button.dataset.deleteSchedule}`, { method: 'DELETE' });
            await loadData();
            render();
            setNotice('Horario eliminado.');
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    };
  });

  document.querySelectorAll('[data-open-subject]').forEach((button) => {
    button.onclick = () => {
      state.selectedSubjectId = button.dataset.openSubject;
      state.subjectMaterialSearchQuery = '';
      state.currentSubjectFolderId = null;
      clearMaterialSelection();
      warmCachedSubjectResources(career.id, state.selectedSubjectId);
      render();
    };
  });

  document.querySelectorAll('[data-open-material-folder]').forEach((button) => {
    button.onclick = async () => {
      const nextFolderId = button.dataset.openMaterialFolder || null;
      if (state.selectedMaterialIds.length) {
        await moveSelectedMaterialsToFolder(career.id, state.selectedSubjectId, nextFolderId);
        return;
      }
      state.currentSubjectFolderId = nextFolderId;
      state.subjectMaterialSearchQuery = '';
      clearMaterialSelection();
      render();
    };
  });

  document.querySelectorAll('[data-material-drag-handle]').forEach((handle) => {
    handle.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const materialId = handle.dataset.materialDragHandle || '';
      const itemType = handle.dataset.materialType || 'file';
      if (!materialId) return;
      const changed = toggleMaterialSelection(materialId, itemType);
      if (!changed) {
        setNotice('No puedes mezclar carpetas con archivos en la misma seleccion.');
        return;
      }
      render();
      if (state.selectedMaterialIds.length) {
        setNotice('Toca una carpeta o "Raiz" para mover la seleccion.');
      }
    };
  });

  document.querySelectorAll('[data-material-id]').forEach((card) => {
    card.onclick = async (event) => {
      const materialId = card.dataset.materialId || '';
      const itemType = card.dataset.materialType || 'file';
      const target = event.target;
      if (target.closest('[data-material-drag-handle]') || target.closest('[data-open-material-folder]') || target.closest('[data-open-subject-material]') || target.closest('[data-download-subject-material]')) {
        return;
      }
      if (!materialId) return;
      if (itemType === 'folder') {
        if (state.selectedMaterialIds.length) {
          if (state.selectedMaterialIds.includes(materialId)) {
            setNotice('No puedes mover una seleccion dentro de una carpeta seleccionada.');
            return;
          }
          await moveSelectedMaterialsToFolder(career.id, state.selectedSubjectId, materialId);
          return;
        }
        state.currentSubjectFolderId = materialId;
        state.subjectMaterialSearchQuery = '';
        clearMaterialSelection();
        render();
        return;
      }
      if (!state.selectedMaterialIds.length) return;
      const changed = toggleMaterialSelection(materialId, itemType);
      if (!changed) {
        setNotice('No puedes mezclar carpetas con archivos en la misma seleccion.');
        return;
      }
      render();
    };
  });

  const subjectMaterialSearchForm = document.getElementById('subjectMaterialSearchForm');
  if (subjectMaterialSearchForm) {
    subjectMaterialSearchForm.onsubmit = (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      state.subjectMaterialSearchQuery = String(form.get('subjectMaterialSearch') || '').trim();
      render();
    };
  }
  const subjectMaterialSearchInput = document.getElementById('subjectMaterialSearchInput');
  const submitSubjectMaterialSearch = document.getElementById('submitSubjectMaterialSearch');
  if (subjectMaterialSearchInput) {
    subjectMaterialSearchInput.oninput = (event) => {
      state.subjectMaterialSearchQuery = String(event.currentTarget.value || '');
      submitSubjectMaterialSearch?.classList.toggle('hidden', !state.subjectMaterialSearchQuery.trim());
      clearSubjectMaterialSearch?.classList.toggle('hidden', !state.subjectMaterialSearchQuery.trim());
    };
  }
  const clearSubjectMaterialSearch = document.getElementById('clearSubjectMaterialSearch');
  if (clearSubjectMaterialSearch) {
    clearSubjectMaterialSearch.onclick = () => {
      state.subjectMaterialSearchQuery = '';
      subjectMaterialSearchInput.value = '';
      submitSubjectMaterialSearch?.classList.add('hidden');
      clearSubjectMaterialSearch.classList.add('hidden');
      render();
    };
  }

  document.querySelectorAll('[data-delete-subject-material]').forEach((button) => {
    button.onclick = () => {
      const deletingCurrentFolder = state.currentSubjectFolderId && state.currentSubjectFolderId === button.dataset.deleteSubjectMaterial;
      openConfirmModal({
        eyebrow: 'Publicaciones',
        title: 'Eliminar publicacion',
        message: 'Se eliminara esta publicacion.',
        confirmLabel: 'Eliminar',
        onConfirm: async () => {
          try {
            await api(`/api/careers/${career.id}/subjects/${button.dataset.subjectId}/materials/${button.dataset.deleteSubjectMaterial}`, {
              method: 'DELETE',
            });
            await loadData();
            if (deletingCurrentFolder) {
              state.currentSubjectFolderId = button.dataset.parentFolderId || null;
            }
            render();
            setNotice('Publicacion eliminada.');
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    };
  });

  document.querySelectorAll('[data-open-subject-material]').forEach((button) => {
    button.onclick = () => {
      const subjectRecord = getCareerSubjects(career).find((item) => item.id === button.dataset.subjectId);
      const subjectSource = (career.subjects || []).find((item) => item.id === button.dataset.subjectId) || subjectRecord;
      const material = (subjectSource?.materials || []).find((item) => item.id === button.dataset.openSubjectMaterial);
      if (!material) return;
      if (material.itemType === 'folder') {
        state.currentSubjectFolderId = material.id;
        warmCachedSubjectResources(career.id, subjectSource?.id || state.selectedSubjectId);
        render();
        return;
      }
      warmCachedMaterialResource(material);
      openMaterialViewer(subjectSource, material);
    };
  });

  document.querySelectorAll('[data-download-subject-material]').forEach((link) => {
    link.onclick = async (event) => {
      const subjectRecord = getCareerSubjects(career).find((item) => item.id === link.dataset.subjectId);
      const subjectSource = (career.subjects || []).find((item) => item.id === link.dataset.subjectId) || subjectRecord;
      const material = (subjectSource?.materials || []).find((item) => item.id === link.dataset.downloadSubjectMaterial);
      if (!material) return;
      if (isMaterialDownloaded(material)) {
        event.preventDefault();
        openMaterialFileInNewTab(material);
        return;
      }
      event.preventDefault();
      await downloadMaterialFile(material);
    };
  });

  document.querySelectorAll('[data-pdf-fullscreen]').forEach((button) => {
    button.onclick = () => {
      openPdfFullscreen(button);
    };
  });

  document.querySelectorAll('[data-edit-schedule]').forEach((button) => {
    button.onclick = () => {
      const entry = findScheduleEntryInCareer(career, button.dataset.editSchedule);
      if (!entry) return;
      const subjects = getCareerSubjects(career).filter((subject) => subject.year === getActiveStudyYear(career));
      const currentSubject = subjects.find((item) => item.id === entry.subjectId)
        || subjects.find((item) => item.name === entry.subject);
      openFormModal({
        eyebrow: 'Horarios',
        title: 'Editar horario',
        fields: [
          {
            name: 'day',
            label: 'Dia',
            type: 'select',
            value: normalizeScheduleDayLabel(entry.day),
            options: SCHEDULE_DAYS.map((day) => ({ value: day, label: day })),
          },
          { name: 'start', label: 'Hora de inicio', type: 'time', value: entry.start, required: true },
          { name: 'end', label: 'Hora de fin', type: 'time', value: entry.end, required: true },
          {
            name: 'subjectId',
            label: 'Materia',
            type: 'select',
            value: currentSubject?.id || '',
            options: subjects.map((subject) => ({
              value: subject.id,
              label: `${subject.name} - ${subject.teacher || 'Sin docente'}`,
            })),
          },
        ],
        submitLabel: 'Guardar horario',
        onSubmit: async ({ day, start, end, subjectId }) => {
          const nextSubject = subjects.find((subject) => subject.id === subjectId);
          if (!nextSubject) {
            setNotice('No encontre esa materia.');
            return;
          }
          if (!SCHEDULE_DAYS.includes(day)) {
            setNotice('Elige un dia valido de lunes a viernes.');
            return;
          }
          const board = getScheduleBoardById(career, entry.boardId);
          if (!board) {
            setNotice('No encontre la planilla de ese horario.');
            return;
          }
          if (hasDuplicateSchedule(board, { day, start, end, subjectId: nextSubject.id }, entry.id)) {
            setNotice('Ese bloque ya existe para esa materia en ese dia. Borra el otro primero.');
            return;
          }

          try {
            await api(`/api/careers/${career.id}/schedule/${entry.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                day,
                start,
                end,
                subjectId: nextSubject.id,
                subject: nextSubject.name,
                teacher: nextSubject.teacher,
                description: nextSubject.description,
              }),
            });
            await loadData();
            render();
            setNotice('Horario actualizado.');
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    };
  });
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= 640;
}


function sortSchedule(items) {
  const dayOrder = {
    lunes: 1,
    martes: 2,
    miercoles: 3,
    'miércoles': 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
    'sábado': 6,
    domingo: 7,
  };

  return [...items].sort((a, b) => {
    const dayA = dayOrder[(a.day || '').trim().toLowerCase()] || 99;
    const dayB = dayOrder[(b.day || '').trim().toLowerCase()] || 99;
    if (dayA !== dayB) return dayA - dayB;
    return String(a.start || '').localeCompare(String(b.start || ''));
  });
}

const SCHEDULE_DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
const STUDY_YEAR_ALIASES = new Map([
  ['1', '1ro'],
  ['1ro', '1ro'],
  ['primero', '1ro'],
  ['2', '2do'],
  ['2do', '2do'],
  ['segundo', '2do'],
  ['3', '3ro'],
  ['3ro', '3ro'],
  ['tercero', '3ro'],
  ['4', '4to'],
  ['4to', '4to'],
  ['cuarto', '4to'],
  ['5', '5to'],
  ['5to', '5to'],
  ['quinto', '5to'],
  ['6', '6to'],
  ['6to', '6to'],
  ['sexto', '6to'],
  ['7', '7mo'],
  ['7mo', '7mo'],
  ['septimo', '7mo'],
  ['séptimo', '7mo'],
  ['8', '8vo'],
  ['8vo', '8vo'],
  ['octavo', '8vo'],
  ['9', '9no'],
  ['9no', '9no'],
  ['noveno', '9no'],
  ['10', '10mo'],
  ['10mo', '10mo'],
  ['decimo', '10mo'],
  ['décimo', '10mo'],
]);

function getCareerSubjects(career) {
  if (!career || typeof career !== 'object') {
    return [];
  }
  const byId = new Map();
  (career.subjects || []).forEach((subject) => {
    if (!subject?.id) return;
    byId.set(subject.id, {
      id: subject.id,
      name: subject.name || '',
      teacher: subject.teacher || '',
      description: subject.description || '',
      year: normalizeStudyYear(subject.year) || '',
      materials: Array.isArray(subject.materials) ? subject.materials : [],
    });
  });

  getCareerScheduleEntries(career).forEach((entry) => {
    const subjectName = String(entry.subject || '').trim();
    if (!subjectName) return;
    const id = String(entry.subjectId || `legacy:${subjectName.toLowerCase()}`);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: subjectName,
        teacher: entry.teacher || '',
        description: entry.description || '',
        year: normalizeStudyYear(entry.year) || '',
        materials: [],
      });
    }
  });

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderSubjectLibrary(career, activeYear) {
  const subjects = getCareerSubjects(career).filter((subject) => subject.year === activeYear);
  if (!subjects.length) {
    return `
      <div class="schedule-empty-card">
        <p class="empty">Todavia no hay materias creadas para ${escapeHtml(formatStudyYearDisplay(activeYear))}.</p>
      </div>
    `;
  }

  const query = String(state.subjectLibraryQuery || '').trim().toLowerCase();
  const favoriteIds = new Set(getFavoriteSubjectIds(career.id));
  const filtered = subjects.filter((subject) => {
    if (!query) return true;
    const haystack = [subject.name, subject.teacher, subject.year].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (state.subjectLibrarySort === 'alphabetical') {
      return a.name.localeCompare(b.name);
    }
    if (state.subjectLibrarySort === 'teacher') {
      const teacherDiff = String(a.teacher || '').localeCompare(String(b.teacher || ''));
      if (teacherDiff !== 0) return teacherDiff;
      return a.name.localeCompare(b.name);
    }
    const favoriteDiff = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id));
    if (favoriteDiff !== 0) return favoriteDiff;
    return a.name.localeCompare(b.name);
  });

  if (!sorted.length) {
    return `
      <div class="schedule-empty-card">
        <p class="empty">No encontre materias para esa busqueda.</p>
      </div>
    `;
  }

  return sorted.map((subject) => {
    const color = getSubjectColor(subject);
    const isFavorite = favoriteIds.has(subject.id);
    return `
      <article class="subject-library-card compact" style="--subject-accent:${color.accent};--subject-glow:${color.glow}">
        <div class="subject-library-swatch"></div>
        <div class="subject-library-body">
          <div class="subject-library-top">
            <div class="subject-library-copy">
              <h5>${escapeHtml(subject.name)}</h5>
              <p>${escapeHtml(getCompactTeacherName(subject.teacher || 'Sin docente'))}</p>
            </div>
            <div class="subject-library-side">
              <button
                type="button"
                class="subject-favorite-toggle ${isFavorite ? 'is-active' : ''}"
                data-toggle-favorite-subject="${escapeHtml(subject.id)}"
                aria-label="${isFavorite ? 'Quitar de favoritas' : 'Marcar como favorita'}"
              >★</button>
              <details class="subject-card-menu">
                <summary class="subject-card-menu-trigger" aria-label="Más opciones">⋯</summary>
                <div class="subject-card-menu-sheet">
                  <button type="button" class="secondary subject-menu-item" data-edit-subject="${escapeHtml(subject.id)}">Editar</button>
                </div>
              </details>
            </div>
          </div>
          <div class="subject-library-actions">
            <button type="button" class="subject-enter-button compact" data-open-subject="${escapeHtml(subject.id)}">
              <span>Entrar</span>
              <span class="subject-enter-arrow" aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderSubjectLibraryToolbar(career, activeYear) {
  const subjects = getCareerSubjects(career).filter((subject) => subject.year === activeYear);
  const favoriteCount = subjects.filter((subject) => isFavoriteSubject(subject.id, career.id)).length;
  return `
    <div class="subject-library-toolbar">
      <div class="subject-library-toolbar-top">
        <div>
          <p class="eyebrow">Materias</p>
          <h4>${subjects.length} cargadas</h4>
        </div>
        <span class="subject-library-stat">${favoriteCount} favoritas</span>
      </div>
      <form class="subject-library-search" id="subjectLibrarySearchForm">
        <input
          id="subjectLibrarySearchInput"
          name="subjectLibrarySearch"
          type="search"
          placeholder="Buscar materia o docente"
          value="${escapeHtml(state.subjectLibraryQuery || '')}"
        >
        <button type="button" class="subject-library-search-clear ${state.subjectLibraryQuery ? '' : 'hidden'}" id="clearSubjectLibrarySearch" aria-label="Limpiar busqueda">×</button>
      </form>
      <div class="subject-library-sort">
        <button type="button" class="${state.subjectLibrarySort === 'favorites' ? '' : 'secondary'}" data-subject-sort="favorites">Favoritas</button>
        <button type="button" class="${state.subjectLibrarySort === 'alphabetical' ? '' : 'secondary'}" data-subject-sort="alphabetical">A-Z</button>
        <button type="button" class="${state.subjectLibrarySort === 'teacher' ? '' : 'secondary'}" data-subject-sort="teacher">Docente</button>
      </div>
    </div>
  `;
}

function getCompactTeacherName(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Sin docente';
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return normalized;
  return `${parts.slice(0, 2).join(' ')}…`;
}

function renderScheduleBoard(career, board, activeYear) {
  const subjectsById = new Map(getCareerSubjects(career).map((subject) => [subject.id, subject]));
  const grouped = new Map(SCHEDULE_DAYS.map((day) => [day, []]));

  sortSchedule((board?.entries || []).filter((entry) => {
    const subject = subjectsById.get(entry.subjectId);
    return (subject?.year || normalizeStudyYear(entry.year) || '') === activeYear;
  })).forEach((entry) => {
    const day = normalizeScheduleDayLabel(entry.day);
    if (!grouped.has(day)) return;
    grouped.get(day).push(entry);
  });

  return `
    <div class="schedule-board">
      ${SCHEDULE_DAYS.map((day) => renderScheduleDayColumn(day, grouped.get(day) || [], subjectsById)).join('')}
    </div>
  `;
}

function renderScheduleDayColumn(day, entries, subjectsById) {
  return `
    <section class="schedule-day-column">
      <div class="schedule-day-head">
        <div>
          <h5>${escapeHtml(day)}</h5>
          <span class="meta">${entries.length} bloque${entries.length === 1 ? '' : 's'}</span>
        </div>
        <button type="button" class="secondary schedule-day-add" data-add-schedule-day="true" data-day="${escapeHtml(day)}">+ bloque</button>
      </div>

      <div class="schedule-day-grid">
        ${entries.length
          ? entries.map((entry) => renderScheduleBlock(entry, subjectsById.get(entry.subjectId))).join('')
          : '<div class="schedule-day-empty">Sin bloques cargados.</div>'}
      </div>
    </section>
  `;
}

function renderScheduleBoardSelector(career, activeBoard) {
  const boards = career.scheduleBoards || [];
  return `
    <div class="schedule-board-toolbar">
      <div class="schedule-board-tabs">
        ${boards.map((board) => `
          <button
            type="button"
            class="${board.id === activeBoard?.id ? '' : 'secondary'}"
            data-open-board="${escapeHtml(board.id)}"
          >${escapeHtml(board.name)}</button>
        `).join('')}
      </div>
      <button type="button" class="secondary" id="createScheduleBoardBtn">Nueva planilla</button>
    </div>
  `;
}

function renderStudyYearTabs(career, activeYear) {
  const years = getCareerYears(career);
  return `
    <div class="study-year-tabs">
      ${years.map((year) => `
        <button
          type="button"
          class="${year === activeYear ? '' : 'secondary'}"
          data-open-study-year="${escapeHtml(year)}"
        >${escapeHtml(formatStudyYearDisplay(year))}</button>
      `).join('')}
      <button type="button" class="secondary" id="createStudyYearBtn">+ Cursada</button>
    </div>
  `;
}

function renderScheduleBlock(entry, subject) {
  const fallbackSubject = {
    id: entry.subjectId || entry.subject || '',
    name: entry.subject || 'Materia',
    teacher: entry.teacher || '',
  };
  const resolvedSubject = subject || fallbackSubject;
  const color = getSubjectColor(resolvedSubject);
  return `
    <article class="schedule-block-card" style="--subject-accent:${color.accent};--subject-soft:${color.soft};--subject-glow:${color.glow}">
      <div class="schedule-block-top">
        <div class="schedule-block-time">${escapeHtml(entry.start)} - ${escapeHtml(entry.end)}</div>
        <details class="schedule-block-menu">
          <summary class="schedule-block-menu-trigger" aria-label="Más opciones">⋯</summary>
          <div class="schedule-block-menu-sheet">
            <button type="button" class="secondary schedule-block-menu-item" data-edit-schedule="${entry.id}">Editar</button>
            <button type="button" class="danger schedule-block-menu-item" data-delete-schedule="${entry.id}">Quitar</button>
          </div>
        </details>
      </div>
      <div class="schedule-block-subject">${escapeHtml(resolvedSubject.name)}</div>
      <div class="schedule-block-teacher">${escapeHtml(resolvedSubject.teacher || entry.teacher || 'Sin docente')}</div>
    </article>
  `;
}

function renderSubjectMaterialCard(career, subject, item) {
  const fileUrl = item.fileName ? `/files/${encodeURIComponent(item.fileName)}` : '';
  const hasFile = Boolean(fileUrl);
  const isLink = item.itemType === 'link';
  const isPdf = isMaterialPdf(item);
  const isDownloaded = isMaterialDownloaded(item);
  const fileLabel = getMaterialFileExtensionLabel(item);
  const materialColor = getMaterialColor(item);
  const isFolder = item.itemType === 'folder';
  const isImage = isMaterialImage(item);
  const isSelected = state.selectedMaterialIds.includes(item.id);
  return `
    <article
      class="material-card ${isFolder ? 'material-card-folder' : ''} ${isSelected ? 'is-selected' : ''}"
      style="--material-accent:${materialColor.accent};--material-soft:${materialColor.soft};--material-glow:${materialColor.glow}"
      data-material-id="${escapeHtml(item.id)}"
      data-material-type="${escapeHtml(item.itemType || 'file')}"
      ${isFolder ? `data-material-folder-drop-target="${escapeHtml(item.id)}"` : ''}
    >
      <div class="material-head">
        <div class="material-copy">
          <h4>${isFolder ? `<span class="material-folder-icon" aria-hidden="true"></span>` : ''}${escapeHtml(item.title)}</h4>
          ${isImage ? `
            <button
              type="button"
              class="material-thumb-button"
              data-subject-id="${escapeHtml(subject.id)}"
              data-open-subject-material="${escapeHtml(item.id)}"
              aria-label="Abrir imagen"
            >
              <img class="material-thumb-image" src="${escapeHtml(fileUrl)}" alt="${escapeHtml(item.title)}">
            </button>
          ` : ''}
          ${isLink ? `<div class="meta">Enlace externo</div>` : ''}
          ${item.content && !isLink ? `<div class="meta">Incluye texto</div>` : ''}
          ${hasFile || isLink ? `
            <button
              type="button"
              class="material-file-link"
              data-subject-id="${escapeHtml(subject.id)}"
              ${isFolder ? `data-open-material-folder="${escapeHtml(item.id)}"` : `data-open-subject-material="${escapeHtml(item.id)}"`}
            >${escapeHtml(fileLabel)}</button>
          ` : ''}
        </div>
        ${isPdf && hasFile ? `
          <a
            class="material-quick-download"
            href="${escapeHtml(fileUrl)}"
            data-subject-id="${escapeHtml(subject.id)}"
            data-download-subject-material="${escapeHtml(item.id)}"
            ${isDownloaded ? 'target="_blank" rel="noopener noreferrer"' : `download="${escapeHtml(item.originalName || item.title || 'material')}"`}
          >${isDownloaded ? 'Abrir con...' : 'Descargar'}</a>
        ` : ''}
        <button
          type="button"
          class="material-drag-handle"
          data-material-drag-handle="${escapeHtml(item.id)}"
          data-material-type="${escapeHtml(item.itemType || 'file')}"
          draggable="true"
          aria-label="Mover material"
          title="Arrastrar para mover"
        >⋮⋮</button>
      </div>
    </article>
  `;
}

function renderMaterialViewerContent(subject, item) {
  const fileUrl = item.fileName ? `/files/${encodeURIComponent(item.fileName)}` : '';
  const linkUrl = item.itemType === 'link' ? normalizeExternalUrl(item.content || '') : '';
  const isPdf = isMaterialPdf(item);
  const isImage = isMaterialImage(item);
  const isDownloaded = isMaterialDownloaded(item);
  if (item.itemType === 'link' && linkUrl) {
    return `
      <section class="material-viewer-shell">
        <div class="material-preview material-link-preview">
          <p class="meta">Este enlace se abre fuera de MiClase.</p>
          <a class="material-link-open" href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer">Abrir enlace</a>
          <p class="material-link-url">${escapeHtml(linkUrl)}</p>
        </div>
      </section>
    `;
  }
  return `
    ${item.content && !fileUrl ? `<div class="note-box material-viewer-note material-viewer-note-only">${escapeHtml(item.content)}</div>` : ''}
    ${fileUrl ? `
      ${isPdf ? `
        <section class="material-viewer-shell material-viewer-shell-pdf">
          <div class="material-viewer-toolbar material-viewer-toolbar-pdf">
            <button type="button" class="secondary material-viewer-action-btn" data-rename-material>Renombrar</button>
            <button type="button" class="secondary material-viewer-zoom-btn" data-pdf-zoom-out>-</button>
            <button type="button" class="secondary material-viewer-zoom-reset" data-pdf-zoom-reset>100%</button>
            <button type="button" class="secondary material-viewer-zoom-btn" data-pdf-zoom-in>+</button>
            ${!isDownloaded ? `
              <a
                class="secondary material-viewer-download"
                href="${escapeHtml(fileUrl)}"
                download="${escapeHtml(item.originalName || item.title || 'material')}"
              >Descargar</a>
            ` : ''}
          </div>
          <div class="material-viewer-stage is-pdf">
            <div
              class="material-preview material-viewer-preview material-pdf-canvas-viewer"
              data-pdf-canvas-viewer
              data-pdf-src="${escapeHtml(fileUrl)}"
            >
              <div class="material-pdf-loading">Cargando PDF...</div>
            </div>
          </div>
        </section>
      ` : isImage ? `
        <section class="material-viewer-shell" id="materialViewerShell">
          <div class="material-viewer-toolbar">
            <button type="button" class="secondary material-viewer-action-btn" data-rename-material>Renombrar</button>
            <button type="button" class="secondary material-viewer-zoom-btn" data-viewer-zoom-out>-</button>
            <button type="button" class="secondary material-viewer-zoom-reset" data-viewer-zoom-reset>100%</button>
            <button type="button" class="secondary material-viewer-zoom-btn" data-viewer-zoom-in>+</button>
            <a
              class="secondary material-viewer-download"
              href="${escapeHtml(fileUrl)}"
              download="${escapeHtml(item.originalName || item.title || 'material')}"
            >Descargar</a>
          </div>
          <div class="material-viewer-stage" id="materialViewerStage" data-viewer-scale="1">
            <div class="material-viewer-zoom" id="materialViewerZoom">
              <div class="material-preview material-viewer-preview material-viewer-image-preview">
                <img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(item.title)}">
              </div>
            </div>
          </div>
        </section>
      ` : `
        <section class="material-viewer-shell" id="materialViewerShell">
          <div class="material-viewer-toolbar">
            <button type="button" class="secondary material-viewer-action-btn" data-rename-material>Renombrar</button>
            <button type="button" class="secondary material-viewer-zoom-btn" data-viewer-zoom-out>-</button>
            <button type="button" class="secondary material-viewer-zoom-reset" data-viewer-zoom-reset>100%</button>
            <button type="button" class="secondary material-viewer-zoom-btn" data-viewer-zoom-in>+</button>
            <a
              class="secondary material-viewer-download"
              href="${escapeHtml(fileUrl)}"
              download="${escapeHtml(item.originalName || item.title || 'material')}"
            >Descargar</a>
          </div>
          <div class="material-viewer-stage" id="materialViewerStage" data-viewer-scale="1">
            <div class="material-viewer-zoom" id="materialViewerZoom">
              <div class="material-preview material-viewer-preview">
                <iframe src="${escapeHtml(fileUrl)}" title="${escapeHtml(item.title)}" allowfullscreen></iframe>
              </div>
            </div>
          </div>
        </section>
      `}
    ` : ''}
    ${item.content && fileUrl ? `<div class="note-box material-viewer-note">${escapeHtml(item.content)}</div>` : ''}
  `;
}

function isMaterialPdf(item) {
  return String(item?.mimeType || '').includes('pdf') || /\.pdf$/i.test(String(item?.originalName || ''));
}

function isMaterialImage(item) {
  return String(item?.mimeType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(item?.originalName || ''));
}

function normalizeExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function getMaterialFileExtensionLabel(item) {
  if (item?.itemType === 'link') {
    return 'URL';
  }
  const name = String(item?.originalName || item?.fileName || '').trim();
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : 'ARCHIVO';
}

function openMaterialViewer(subject, item) {
  if (isMaterialPdf(item) && item?.fileName) {
    if (isMaterialDownloaded(item)) {
      openMaterialFileInNewTab(item);
      return;
    }
    downloadMaterialFile(item);
    return;
  }
  warmCachedMaterialResource(item);
  if (item?.itemType === 'link') {
    const linkUrl = normalizeExternalUrl(item.content || '');
    if (linkUrl) {
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
      return;
    }
  }
  state.modal = {
    type: 'viewer',
    eyebrow: 'Publicacion',
    title: item.title || 'Material',
    message: '',
    body: renderMaterialViewerContent(subject, item),
    materialSubjectId: subject?.id || '',
    materialItemId: item?.id || '',
    extraActionLabel: 'Eliminar',
    onExtraAction: () => {
      openConfirmModal({
        eyebrow: 'Publicaciones',
        title: 'Eliminar publicacion',
        message: 'Se eliminara esta publicacion.',
        confirmLabel: 'Eliminar',
        onConfirm: async () => {
          try {
            const careerId = state.selectedCareerId;
            if (!careerId || !subject?.id || !item?.id) return;
            await api(`/api/careers/${careerId}/subjects/${subject.id}/materials/${item.id}`, {
              method: 'DELETE',
            });
            await loadData();
            render();
            setNotice('Publicacion eliminada.');
          } catch (error) {
            setNotice(error.message);
          }
        },
      });
    },
  };
  render();
}

async function downloadMaterialFile(item) {
  if (!item?.fileName) return;
  if (isMaterialDownloaded(item)) {
    openMaterialFileInNewTab(item);
    return;
  }
  const fileUrl = `/files/${encodeURIComponent(item.fileName)}`;
  const fileName = item.originalName || item.title || 'material';
  setTransferState({
    active: true,
    label: `Descargando ${fileName}`,
    progress: 4,
    indeterminate: true,
  });
  try {
    const response = await fetch(fileUrl, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('No se pudo descargar el archivo.');
    }
    const total = Number(response.headers.get('content-length') || 0);
    if (!response.body || !window.ReadableStream) {
      const blob = await response.blob();
      triggerBrowserDownload(blob, fileName);
      markMaterialAsDownloaded(item);
      clearTransferState();
      setNotice('PDF descargado. Puedes abrirlo desde Google Drive sin volver a bajarlo.');
      return;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        if (total > 0) {
          setTransferState({
            active: true,
            label: `Descargando ${fileName}`,
            progress: (loaded / total) * 100,
            indeterminate: false,
          });
        } else {
          setTransferState({
            active: true,
            label: `Descargando ${fileName}`,
            progress: 55,
            indeterminate: true,
          });
        }
      }
    }

    const blob = new Blob(chunks, {
      type: response.headers.get('content-type') || 'application/octet-stream',
    });
    triggerBrowserDownload(blob, fileName);
    markMaterialAsDownloaded(item);
    clearTransferState();
    setNotice('PDF descargado. Puedes abrirlo desde Google Drive sin volver a bajarlo.');
  } catch (error) {
    clearTransferState();
    setNotice(error.message || 'No se pudo descargar el archivo.');
  }
}

function triggerBrowserDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function openMaterialFileInNewTab(item) {
  const fileUrl = getAbsoluteMaterialFileUrl(item);
  if (!fileUrl) return;
  if (typeof navigator.share === 'function') {
    navigator.share({
      title: item.title || item.originalName || 'PDF',
      url: fileUrl,
    }).then(() => {
      setNotice('Elige la app del dispositivo para abrir el PDF.');
    }).catch(() => {
      openMaterialFileFallback(fileUrl);
    });
    return;
  }
  openMaterialFileFallback(fileUrl);
}

function openMaterialFileFallback(fileUrl) {
  const anchor = document.createElement('a');
  anchor.href = fileUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setNotice('Abriendo PDF.');
}

function openMaterialUploadModal() {
  state.modal = {
    type: 'custom',
    eyebrow: 'Publicacion',
    title: 'Nueva publicación',
    body: `
      <form id="subjectMaterialForm" class="stack-form compact-form compact-material-form" enctype="multipart/form-data">
        <label>
          <span>Tipo</span>
          <div class="material-type-picker" id="subjectMaterialType">
            <label class="material-type-option">
              <input type="radio" name="itemType" value="file" checked>
              <span>Archivo</span>
            </label>
            <label class="material-type-option">
              <input type="radio" name="itemType" value="folder">
              <span>Carpeta</span>
            </label>
            <label class="material-type-option">
              <input type="radio" name="itemType" value="note">
              <span>Texto</span>
            </label>
            <label class="material-type-option">
              <input type="radio" name="itemType" value="link">
              <span>URL</span>
            </label>
          </div>
        </label>
        <label>
          <span>Titulo</span>
          <input name="title" id="subjectMaterialTitleInput" placeholder="Opcional">
          <small class="field-hint hidden" id="subjectMaterialTitleHint"></small>
        </label>
        <label id="subjectMaterialFileField">
          <span id="subjectMaterialFileLabel">Archivo</span>
          <div class="material-file-picker">
            <label class="material-file-trigger" for="subjectMaterialFileInput">
              <span class="material-file-trigger-button" id="subjectMaterialFileButtonText">Seleccionar archivo</span>
              <span class="material-file-trigger-name" id="subjectMaterialFileName">No elegiste ningún archivo</span>
            </label>
            <input type="file" name="file" id="subjectMaterialFileInput" accept="application/pdf,text/plain,.pdf,.txt,image/*,.png,.jpg,.jpeg,.webp,.gif">
          </div>
        </label>
        <label class="hidden" id="subjectMaterialUrlField">
          <span>URL</span>
          <input type="url" name="url" id="subjectMaterialUrlInput" placeholder="https://ejemplo.com/clase">
        </label>
        <div class="material-upload-preview hidden" id="subjectMaterialPreview">
          <div class="material-upload-preview-frame">
            <img id="subjectMaterialPreviewImage" alt="Vista previa de la imagen seleccionada">
          </div>
          <p class="material-upload-preview-empty" id="subjectMaterialPreviewEmpty">Todavía no elegiste una imagen.</p>
        </div>
        <label class="compact-material-text" id="subjectMaterialTextField">
          <span>Texto opcional</span>
          <textarea name="content" rows="6" placeholder="Apuntes o informacion extra..."></textarea>
        </label>
        <div class="material-upload-progress hidden" id="subjectMaterialUploadProgress">
          <div class="material-upload-progress-bar" id="subjectMaterialUploadProgressBar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="material-upload-progress-fill" id="subjectMaterialUploadProgressFill"></span>
          </div>
          <p class="material-upload-progress-text" id="subjectMaterialUploadProgressText"></p>
        </div>
        <div class="app-modal-actions">
          <button type="submit" id="subjectMaterialSubmitBtn">Publicar</button>
          <button type="button" class="secondary" id="subjectMaterialCancelBtn">Cancelar</button>
        </div>
      </form>
    `,
  };
  render();
}

function wireMaterialViewerControls() {
  document.querySelector('[data-rename-material]')?.addEventListener('click', () => {
    const career = (state.db.careers || []).find((item) => item.id === state.selectedCareerId);
    const subject = (career?.subjects || []).find((item) => item.id === state.modal?.materialSubjectId);
    const material = (subject?.materials || []).find((item) => item.id === state.modal?.materialItemId);
    if (!career || !subject || !material) return;
    openFormModal({
      eyebrow: 'Publicacion',
      title: 'Renombrar',
      fields: [
        { name: 'title', label: 'Nuevo nombre', value: material.title || '', required: true },
      ],
      submitLabel: 'Guardar',
      onSubmit: async ({ title }) => {
        const nextTitle = String(title || '').trim();
        if (!nextTitle) {
          setNotice('Escribe un nombre.');
          return;
        }
        try {
          await api(`/api/careers/${career.id}/subjects/${subject.id}/materials/${material.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: nextTitle }),
          });
          await loadData();
          const refreshedSubject = ((state.db.careers || []).find((item) => item.id === career.id)?.subjects || []).find((item) => item.id === subject.id);
          const refreshedMaterial = (refreshedSubject?.materials || []).find((item) => item.id === material.id);
          if (refreshedSubject && refreshedMaterial) {
            openMaterialViewer(refreshedSubject, refreshedMaterial);
          } else {
            render();
          }
          setNotice('Nombre actualizado.');
        } catch (error) {
          setNotice(error.message);
        }
      },
    });
  });

  const pdfViewer = document.querySelector('[data-pdf-canvas-viewer]');
  if (pdfViewer) {
    wirePdfCanvasViewer(pdfViewer);
    return;
  }

  const stage = document.getElementById('materialViewerStage');
  const zoom = document.getElementById('materialViewerZoom');
  if (!stage || !zoom) return;

  let scale = 1;
  let pinchStartDistance = 0;
  let pinchStartScale = 1;

  const clampScale = (value) => Math.max(1, Math.min(3, value));
  const applyScale = (nextScale) => {
    scale = clampScale(nextScale);
    stage.dataset.viewerScale = String(scale);
    zoom.style.setProperty('--viewer-scale', String(scale));
    const resetBtn = document.querySelector('[data-viewer-zoom-reset]');
    if (resetBtn) {
      resetBtn.textContent = `${Math.round(scale * 100)}%`;
    }
  };

  const distanceBetweenTouches = (touches) => {
    const [first, second] = touches;
    if (!first || !second) return 0;
    const dx = second.clientX - first.clientX;
    const dy = second.clientY - first.clientY;
    return Math.hypot(dx, dy);
  };

  document.querySelector('[data-viewer-zoom-in]')?.addEventListener('click', () => applyScale(scale + 0.2));
  document.querySelector('[data-viewer-zoom-out]')?.addEventListener('click', () => applyScale(scale - 0.2));
  document.querySelector('[data-viewer-zoom-reset]')?.addEventListener('click', () => applyScale(1));

  stage.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.12 : -0.12;
    applyScale(scale + delta);
  }, { passive: false });

  stage.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 2) return;
    pinchStartDistance = distanceBetweenTouches(event.touches);
    pinchStartScale = scale;
  }, { passive: true });

  stage.addEventListener('touchmove', (event) => {
    if (event.touches.length !== 2 || !pinchStartDistance) return;
    event.preventDefault();
    const nextDistance = distanceBetweenTouches(event.touches);
    if (!nextDistance) return;
    applyScale(pinchStartScale * (nextDistance / pinchStartDistance));
  }, { passive: false });

  stage.addEventListener('touchend', (event) => {
    if (event.touches.length < 2) {
      pinchStartDistance = 0;
    }
  });

  applyScale(1);
}

function wirePdfCanvasViewer(container) {
  const src = container.dataset.pdfSrc || '';
  if (!window.pdfjsLib) {
    if (src) {
      container.innerHTML = `<iframe class="material-pdf-fallback-frame" src="${src}" title="PDF"></iframe>`;
      return;
    }
    container.innerHTML = '<div class="material-pdf-loading">No se pudo cargar el visor PDF.</div>';
    return;
  }
  let scale = 1;
  let pdfDocumentPromise = null;
  let renderToken = 0;

  const updateZoomLabel = () => {
    const resetBtn = document.querySelector('[data-pdf-zoom-reset]');
    if (resetBtn) {
      resetBtn.textContent = `${Math.round(scale * 100)}%`;
    }
  };

  const renderPdf = async () => {
    const currentToken = ++renderToken;
    container.innerHTML = '<div class="material-pdf-loading">Cargando PDF...</div>';
    try {
      pdfDocumentPromise = pdfDocumentPromise || window.pdfjsLib.getDocument(src).promise;
      const pdf = await pdfDocumentPromise;
      if (currentToken !== renderToken) return;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        if (currentToken !== renderToken) return;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.className = 'material-pdf-page';
        await page.render({ canvasContext: context, viewport }).promise;
        if (currentToken !== renderToken) return;
        const wrapper = document.createElement('figure');
        wrapper.className = 'material-pdf-page-shell';
        const number = document.createElement('div');
        number.className = 'material-pdf-page-number';
        number.textContent = String(pageNumber);
        wrapper.appendChild(canvas);
        wrapper.appendChild(number);
        pages.push(wrapper);
      }
      container.innerHTML = '';
      pages.forEach((node) => {
        if (node instanceof HTMLElement) {
          container.appendChild(node);
        }
      });
    } catch (_error) {
      container.innerHTML = '<div class="material-pdf-loading">No se pudo abrir el PDF.</div>';
    }
  };

  document.querySelector('[data-pdf-zoom-in]')?.addEventListener('click', async () => {
    scale = Math.min(3, scale + 0.2);
    updateZoomLabel();
    await renderPdf();
  });
  document.querySelector('[data-pdf-zoom-out]')?.addEventListener('click', async () => {
    scale = Math.max(0.8, scale - 0.2);
    updateZoomLabel();
    await renderPdf();
  });
  document.querySelector('[data-pdf-zoom-reset]')?.addEventListener('click', async () => {
    scale = 1;
    updateZoomLabel();
    await renderPdf();
  });

  updateZoomLabel();
  renderPdf();
}

function requestElementFullscreen(element) {
  if (!element) return Promise.resolve(false);
  if (element.requestFullscreen) return element.requestFullscreen().then(() => true).catch(() => false);
  if (element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen();
    return Promise.resolve(true);
  }
  if (element.msRequestFullscreen) {
    element.msRequestFullscreen();
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}

async function openPdfFullscreen(button) {
  const preview = document.getElementById(button.dataset.pdfFullscreen || '');
  const fileUrl = button.dataset.fileUrl || '';
  const enteredFullscreen = await requestElementFullscreen(preview);
  if (!enteredFullscreen && fileUrl) {
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  }
}

function buildSubjectSelectionPrompt(subjects, day, currentSubject = null) {
  const header = currentSubject
    ? `Elige materia para ${day}. Puedes escribir el numero o el nombre.`
    : `Elige materia para ${day}. Escribe el numero o el nombre.`;
  const lines = subjects.map((subject, index) => `${index + 1}. ${subject.name} - ${subject.teacher || 'Sin docente'}`);
  return [header, ...lines].join('\n');
}

function getCareerScheduleEntries(career) {
  if (Array.isArray(career.scheduleBoards) && career.scheduleBoards.length) {
    return career.scheduleBoards.flatMap((board) => board.entries || []);
  }
  return Array.isArray(career.schedule) ? career.schedule : [];
}

function getCareerYears(career) {
  const years = new Set((career?.studyYears || []).map((year) => normalizeStudyYear(year)).filter(Boolean));
  getCareerSubjects(career).forEach((subject) => {
    const normalizedYear = normalizeStudyYear(subject.year);
    if (normalizedYear) {
      years.add(normalizedYear);
    }
  });
  return sortStudyYears([...years]);
}

function getNextStudyYear(career) {
  const years = getCareerYears(career);
  const lastYear = years.length ? years[years.length - 1] : '';
  const nextYearNumber = getStudyYearSortValue(lastYear) + 1;
  return formatStudyYearLabel(nextYearNumber || 1);
}

function getActiveStudyYear(career) {
  return normalizeStudyYear(state.selectedStudyYear) || getCareerYears(career)[0] || '';
}

function getScheduleBoardById(career, boardId) {
  return (career.scheduleBoards || []).find((board) => board.id === boardId) || null;
}

function getActiveScheduleBoard(career) {
  return getScheduleBoardById(career, state.selectedScheduleBoardId)
    || (career.scheduleBoards || [])[0]
    || null;
}

function findScheduleEntryInCareer(career, entryId) {
  for (const board of (career.scheduleBoards || [])) {
    const entry = (board.entries || []).find((item) => item.id === entryId);
    if (entry) {
      return { ...entry, boardId: board.id };
    }
  }
  return (career.schedule || []).find((item) => item.id === entryId) || null;
}

function resolveSubjectChoice(subjects, rawChoice) {
  const choice = String(rawChoice || '').trim();
  if (!choice) return null;
  const index = Number(choice);
  if (Number.isInteger(index) && index >= 1 && index <= subjects.length) {
    return subjects[index - 1];
  }
  const normalized = choice.toLowerCase();
  return subjects.find((subject) => subject.name.toLowerCase() === normalized) || null;
}

function normalizeScheduleDayLabel(day) {
  const normalized = String(day || '').trim().toLowerCase();
  return SCHEDULE_DAYS.find((item) => item.toLowerCase() === normalized) || String(day || '').trim();
}

function normalizeStudyYear(year) {
  const normalized = String(year || '').trim().toLowerCase();
  if (!normalized) return '';
  if (STUDY_YEAR_ALIASES.has(normalized)) {
    return STUDY_YEAR_ALIASES.get(normalized);
  }
  const numericMatch = normalized.match(/^(\d{1,2})(?:ro|do|to|mo|vo|no)?$/);
  if (numericMatch) {
    return formatStudyYearLabel(Number(numericMatch[1]));
  }
  return '';
}

function renderStudyYearOptions(career, selectedYear) {
  return getCareerYears(career).map((year) => `
    <option value="${escapeHtml(year)}" ${year === selectedYear ? 'selected' : ''}>${escapeHtml(formatStudyYearDisplay(year))}</option>
  `).join('');
}

function formatStudyYearLabel(yearNumber) {
  const numeric = Number(yearNumber);
  if (!Number.isInteger(numeric) || numeric < 1) return '';
  const suffixByNumber = {
    1: 'ro',
    2: 'do',
    3: 'ro',
    4: 'to',
    5: 'to',
    6: 'to',
    7: 'mo',
    8: 'vo',
    9: 'no',
    10: 'mo',
  };
  const suffix = suffixByNumber[numeric] || 'to';
  return `${numeric}${suffix}`;
}

function getStudyYearSortValue(year) {
  const normalized = normalizeStudyYear(year);
  const match = normalized.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function sortStudyYears(years) {
  return [...new Set((years || []).filter(Boolean))]
    .sort((a, b) => {
      const numericDiff = getStudyYearSortValue(a) - getStudyYearSortValue(b);
      if (numericDiff !== 0) return numericDiff;
      return a.localeCompare(b);
    });
}

function formatStudyYearDisplay(year) {
  const labels = {
    '1ro': 'Primero',
    '2do': 'Segundo',
    '3ro': 'Tercero',
    '4to': 'Cuarto',
    '5to': 'Quinto',
    '6to': 'Sexto',
    '7mo': 'Septimo',
    '8vo': 'Octavo',
    '9no': 'Noveno',
    '10mo': 'Decimo',
  };
  return labels[year] || year;
}

async function createStudyYear(career) {
  const suggestedYear = getNextStudyYear(career) || '1ro';
  const suggestedYearNumber = String(getStudyYearSortValue(suggestedYear) || 1);
  openFormModal({
    eyebrow: 'Cursada',
    title: 'Crear año',
    fields: [
      { name: 'year', label: 'Año a crear', value: suggestedYearNumber, required: true, placeholder: '2', type: 'number', min: 1, max: 6, step: 1, inputMode: 'numeric', pattern: '[1-6]' },
    ],
    submitLabel: 'Crear año',
    onSubmit: async ({ year }) => {
      const yearNumber = Number(String(year || '').trim());
      if (!Number.isInteger(yearNumber) || yearNumber < 1 || yearNumber > 6) {
        setNotice('Escribe un número entre 1 y 6.');
        return;
      }
      const normalizedYear = normalizeStudyYear(String(yearNumber));
      if (!normalizedYear) {
        setNotice('Escribe un número entre 1 y 6.');
        return;
      }
      try {
        await api(`/api/careers/${career.id}/study-years`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: normalizedYear }),
        });
        await loadData();
        state.selectedStudyYear = '';
        render();
        setNotice(`Año ${formatStudyYearDisplay(normalizedYear)} creado.`);
      } catch (error) {
        setNotice(error.message);
      }
    },
  });
}

function matchesCareerSearch(career, query) {
  if (!career || typeof career !== 'object') {
    return false;
  }
  const haystack = [
    career.name,
    ...(career.subjects || []).flatMap((subject) => [
      subject.name,
      subject.teacher,
      subject.description,
      subject.year,
      ...((subject.materials || []).flatMap((item) => [item.title, item.description, item.content])),
    ]),
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function hasDuplicateSchedule(career, candidate, ignoreId = '') {
  const entries = Array.isArray(career.entries) ? career.entries : [];
  const day = String(candidate.day || '').trim().toLowerCase();
  const start = String(candidate.start || '').trim();
  const end = String(candidate.end || '').trim();
  const subjectId = String(candidate.subjectId || '').trim();
  return entries.some((entry) => {
    if (ignoreId && entry.id === ignoreId) return false;
    return (
      String(entry.day || '').trim().toLowerCase() === day
      && String(entry.start || '').trim() === start
      && String(entry.end || '').trim() === end
      && String(entry.subjectId || '').trim() === subjectId
    );
  });
}

function getSubjectColor(subject) {
  const seed = String(subject.id || subject.name || 'materia');
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index);
    hash |= 0;
  }
  const retroPalette = [
    { accent: '#9f4c3c', soft: 'rgba(159, 76, 60, 0.14)', glow: 'rgba(159, 76, 60, 0.22)' },
    { accent: '#7c5a34', soft: 'rgba(124, 90, 52, 0.14)', glow: 'rgba(124, 90, 52, 0.22)' },
    { accent: '#556b52', soft: 'rgba(85, 107, 82, 0.14)', glow: 'rgba(85, 107, 82, 0.22)' },
    { accent: '#4f6478', soft: 'rgba(79, 100, 120, 0.14)', glow: 'rgba(79, 100, 120, 0.22)' },
    { accent: '#8a5b73', soft: 'rgba(138, 91, 115, 0.14)', glow: 'rgba(138, 91, 115, 0.22)' },
    { accent: '#a06d2c', soft: 'rgba(160, 109, 44, 0.14)', glow: 'rgba(160, 109, 44, 0.22)' },
  ];
  const color = retroPalette[Math.abs(hash) % retroPalette.length];
  return {
    accent: color.accent,
    soft: color.soft,
    glow: color.glow,
  };
}

function getMaterialColor(item) {
  const seed = String(item.id || item.fileName || item.originalName || item.title || 'material');
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index);
    hash |= 0;
  }
  const palette = [
    { accent: '#d26a4d', soft: 'rgba(210, 106, 77, 0.12)', glow: 'rgba(210, 106, 77, 0.24)' },
    { accent: '#4f7a90', soft: 'rgba(79, 122, 144, 0.12)', glow: 'rgba(79, 122, 144, 0.24)' },
    { accent: '#6a8f5d', soft: 'rgba(106, 143, 93, 0.12)', glow: 'rgba(106, 143, 93, 0.24)' },
    { accent: '#9a6c3d', soft: 'rgba(154, 108, 61, 0.12)', glow: 'rgba(154, 108, 61, 0.24)' },
    { accent: '#7f5e9c', soft: 'rgba(127, 94, 156, 0.12)', glow: 'rgba(127, 94, 156, 0.24)' },
    { accent: '#b45d72', soft: 'rgba(180, 93, 114, 0.12)', glow: 'rgba(180, 93, 114, 0.24)' },
  ];
  return palette[Math.abs(hash) % palette.length];
}

function matchesSubjectMaterialSearch(item, query) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.content,
    item.originalName,
    item.fileName,
    item.uploadedBy,
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function getVisibleSubjectMaterials(subject, parentFolderId) {
  return (subject?.materials || []).filter((item) => String(item.parentFolderId || '') === String(parentFolderId || ''));
}

function getSubjectFolderTrail(subject, folderId) {
  const items = subject?.materials || [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const trail = [];
  let currentId = folderId || '';
  while (currentId && byId.has(currentId)) {
    const current = byId.get(currentId);
    if (!current || current.itemType !== 'folder') break;
    trail.unshift(current);
    currentId = current.parentFolderId || '';
  }
  return trail;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return String(value).replace(/"/g, '\\"');
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function checkForServiceWorkerUpdate(registration, options = {}) {
  if (!registration) return;
  const { silent = true } = options;
  if (!silent && !state.appUpdate.applying) {
    setAppUpdateState({
      checking: true,
      available: false,
      message: 'Buscando actualización...',
    });
  }
  try {
    await registration.update();
  } catch (_) {
    if (!silent && !state.appUpdate.applying) {
      setAppUpdateState({
        checking: false,
        available: false,
        message: '',
      });
    }
  }
}

async function applyServiceWorkerUpdate(registration) {
  if (!registration?.waiting || state.appUpdate.applying) return;
  setAppUpdateState({
    checking: false,
    available: true,
    applying: true,
    message: 'Hay una actualización. Aplicando cambios...',
  });
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  window.setTimeout(() => {
    if (!hasReloadedForUpdate) {
      hasReloadedForUpdate = true;
      window.location.reload();
    }
  }, 1800);
}

function handleServiceWorkerWaiting(registration) {
  setAppUpdateState({
    checking: false,
    available: true,
    applying: false,
    message: 'Hay una actualización. Se instalará ahora...',
  });
  window.setTimeout(() => {
    applyServiceWorkerUpdate(registration);
  }, 800);
}

function monitorServiceWorkerRegistration(registration) {
  if (!registration) return;
  if (registration.waiting) {
    handleServiceWorkerWaiting(registration);
  }
  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker) return;
    if (navigator.serviceWorker.controller) {
      setAppUpdateState({
        checking: true,
        available: false,
        applying: false,
        message: 'Descargando actualización...',
      });
    }
    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          handleServiceWorkerWaiting(registration);
          return;
        }
        setAppUpdateState({
          checking: false,
          available: false,
          applying: false,
          message: '',
        });
      }
      if (installingWorker.state === 'redundant' && !state.appUpdate.applying) {
        setAppUpdateState({
          checking: false,
          available: false,
          applying: false,
          message: '',
        });
      }
    });
  });
}

function scheduleServiceWorkerUpdateChecks(registration) {
  if (!registration) return;
  if (swUpdateCheckTimer) {
    window.clearInterval(swUpdateCheckTimer);
  }
  swUpdateCheckTimer = window.setInterval(() => {
    checkForServiceWorkerUpdate(registration);
  }, APP_UPDATE_CHECK_INTERVAL);
  window.addEventListener('focus', () => {
    checkForServiceWorkerUpdate(registration);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForServiceWorkerUpdate(registration);
    }
  });
}

function registerDeviceCache() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        monitorServiceWorkerRegistration(registration);
        scheduleServiceWorkerUpdateChecks(registration);
        checkForServiceWorkerUpdate(registration);
      })
      .catch(() => {
        // Keep the app usable even if the cache worker fails.
      });
  }, { once: true });
}







