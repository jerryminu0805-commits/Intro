/*
  GW Demo - FarPVP (Remote PVP lobby) Cloud Rooms
  ------------------------------------------------
  This file enables cross-device room discovery & syncing via Firebase Firestore.

  Requirements in Firebase Console:
  - Firestore enabled
  - Authentication: Anonymous enabled

  The game will automatically fall back to local rooms if Firebase is not configured.
*/

(function () {
  const config = window.GW_FIREBASE_CONFIG;

  function safeConsoleWarn(...args) {
    try {
      // eslint-disable-next-line no-console
      console.warn(...args);
    } catch (e) {
      // ignore
    }
  }

  const api = {
    enabled: false,
    ready: Promise.resolve(false),
    uid: null,
    lastError: null,
    // Lobby
    subscribeLobby: null,
    // Room
    subscribeRoom: null,
    // Actions
    createRoom: null,
    joinRoom: null,
    toggleReady: null,
    moveSlot: null,
    startMatch: null,
    submitSelections: null,
    closeRoom: null,
    isHostRoom: null,
  };

  // Expose early so script.js can probe it.
  window.GWFarPvpCloud = api;

  if (!config || typeof config !== 'object') {
    return;
  }

  // Firebase compat SDK must be loaded by index.html.
  if (typeof firebase === 'undefined' || !firebase?.initializeApp) {
    safeConsoleWarn('[FarPVP Cloud] Firebase SDK not found. Falling back to local rooms.');
    return;
  }

  try {
    // Avoid double init (hot reload / multiple pages).
    if (!firebase.apps?.length) {
      firebase.initializeApp(config);
    }
  } catch (e) {
    // initializeApp throws if already initialized with different config.
    safeConsoleWarn('[FarPVP Cloud] Firebase init error:', e);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const roomsCol = db.collection('farpvpRooms');
  const serverTs = firebase.firestore.FieldValue.serverTimestamp;

  function isSecureContextForCrypto() {
    try {
      return !!(window.isSecureContext && window.crypto && window.crypto.subtle);
    } catch (e) {
      return false;
    }
  }

  async function sha256Hex(text) {
    if (!isSecureContextForCrypto()) return null;
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function normalizeRoom(doc) {
    const data = doc.data() || {};
    return {
      id: doc.id,
      name: data.name || '房间',
      // Keep a truthy "password" for the existing UI (it only uses this for display).
      password: data.hasPassword ? '1' : '',
      hasPassword: !!data.hasPassword,
      players: data.players || { player1: null, player2: null },
      ready: data.ready || { player1: false, player2: false },
      confirmed: data.confirmed || { player1: false, player2: false },
      phase: data.phase || 'lobby',
      selections: data.selections || null,
      hostUid: data.hostUid || null,
      updatedAt: data.updatedAt || null,
      createdAt: data.createdAt || null,
    };
  }

  async function ensureAnonAuth() {
    if (auth.currentUser) {
      api.uid = auth.currentUser.uid;
      return auth.currentUser;
    }
    const cred = await auth.signInAnonymously();
    api.uid = cred?.user?.uid || auth.currentUser?.uid || null;
    return auth.currentUser;
  }

  api.ready = ensureAnonAuth()
    .then(() => {
      api.enabled = true;
      return true;
    })
    .catch((e) => {
      api.enabled = false;
      api.lastError = e;
      safeConsoleWarn('[FarPVP Cloud] Anonymous auth failed:', e);
      return false;
    });

  api.isHostRoom = function isHostRoom(room) {
    const uid = api.uid || auth.currentUser?.uid;
    return !!(uid && room?.hostUid && uid === room.hostUid);
  };

  api.subscribeLobby = function subscribeLobby(onRooms) {
    if (typeof onRooms !== 'function') return () => {};
    let unsub = () => {};
    api.ready.then((ok) => {
      if (!ok) {
        try {
          onRooms([]);
        } catch (e) {
          // ignore
        }
        return;
      }
      try {
        unsub = roomsCol
          .orderBy('updatedAt', 'desc')
          .limit(50)
          .onSnapshot(
            (snap) => {
              const rooms = [];
              snap.forEach((doc) => {
                try {
                  const room = normalizeRoom(doc);
                  // Client-side filter: hide closed rooms.
                  if (room.phase === 'closed') return;
                  rooms.push(room);
                } catch (e) {
                  // ignore bad docs
                }
              });
              onRooms(rooms);
            },
            (err) => {
              api.lastError = err;
              safeConsoleWarn('[FarPVP Cloud] Lobby snapshot error:', err);
            }
          );
      } catch (e) {
        api.lastError = e;
        safeConsoleWarn('[FarPVP Cloud] subscribeLobby failed:', e);
      }
    });
    return () => {
      try {
        unsub && unsub();
      } catch (e) {
        // ignore
      }
    };
  };

  api.subscribeRoom = function subscribeRoom(roomId, onRoom) {
    if (!roomId || typeof onRoom !== 'function') return () => {};
    let unsub = () => {};
    api.ready.then((ok) => {
      if (!ok) {
        try {
          onRoom(null);
        } catch (e) {
          // ignore
        }
        return;
      }
      try {
        unsub = roomsCol.doc(roomId).onSnapshot(
          (doc) => {
            if (!doc.exists) {
              onRoom(null);
              return;
            }
            onRoom(normalizeRoom(doc));
          },
          (err) => {
            api.lastError = err;
            safeConsoleWarn('[FarPVP Cloud] Room snapshot error:', err);
          }
        );
      } catch (e) {
        api.lastError = e;
        safeConsoleWarn('[FarPVP Cloud] subscribeRoom failed:', e);
      }
    });
    return () => {
      try {
        unsub && unsub();
      } catch (e) {
        // ignore
      }
    };
  };

  api.createRoom = async function createRoom(name, password) {
    await ensureAnonAuth();
    const roomName = (name || '').trim() || `房间-${Math.floor(Math.random() * 9999)}`;
    const rawPass = (password || '').trim();
    let passwordHash = '';
    if (rawPass) {
      try {
        passwordHash = (await sha256Hex(rawPass)) || '';
      } catch (e) {
        passwordHash = '';
      }
    }

    const docRef = roomsCol.doc();
    const uid = auth.currentUser?.uid || api.uid || null;
    const payload = {
      name: roomName,
      hasPassword: !!rawPass,
      passwordHash: passwordHash || null,
      // Fallback if crypto is unavailable (should be rare on https).
      passwordPlain: !passwordHash && rawPass ? rawPass : null,
      players: { player1: '玩家1', player2: null },
      ready: { player1: false, player2: false },
      confirmed: { player1: false, player2: false },
      phase: 'lobby',
      selections: null,
      hostUid: uid,
      createdAt: serverTs(),
      updatedAt: serverTs(),
    };
    await docRef.set(payload);
    return docRef.id;
  };

  api.joinRoom = async function joinRoom(roomId, password) {
    await ensureAnonAuth();
    const inputPass = (password || '').trim();
    const passHash = inputPass ? await sha256Hex(inputPass) : null;

    const ref = roomsCol.doc(roomId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('房间已不存在。');
      const data = snap.data() || {};
      if (data.phase === 'closed') throw new Error('房间已关闭。');

      const hasPassword = !!data.hasPassword;
      if (hasPassword) {
        const okHash = data.passwordHash && passHash && data.passwordHash === passHash;
        const okPlain = data.passwordPlain && inputPass && data.passwordPlain === inputPass;
        if (!okHash && !okPlain) throw new Error('密码不正确。');
      }

      const players = data.players || {};
      if (players.player2) throw new Error('房间已满。');
      players.player2 = '玩家2';
      const ready = data.ready || { player1: false, player2: false };
      ready.player2 = false;
      tx.update(ref, {
        players,
        ready,
        updatedAt: serverTs(),
      });
    });
    return true;
  };

  api.toggleReady = async function toggleReady(roomId, slot) {
    if (!roomId || !slot) return;
    await ensureAnonAuth();
    const ref = roomsCol.doc(roomId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('房间已不存在。');
      const data = snap.data() || {};
      const ready = data.ready || { player1: false, player2: false };
      ready[slot] = !ready[slot];
      tx.update(ref, { ready, updatedAt: serverTs() });
    });
  };

  api.moveSlot = async function moveSlot(roomId, fromSlot, toSlot) {
    if (!roomId || !fromSlot || !toSlot) return;
    if (fromSlot === toSlot) return;
    await ensureAnonAuth();
    const ref = roomsCol.doc(roomId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('房间已不存在。');
      const data = snap.data() || {};
      const players = data.players || { player1: null, player2: null };
      const ready = data.ready || { player1: false, player2: false };
      if (players[toSlot]) throw new Error('该位置已有玩家。');
      players[toSlot] = players[fromSlot] || (toSlot === 'player1' ? '玩家1' : '玩家2');
      players[fromSlot] = null;
      ready[toSlot] = ready[fromSlot] || false;
      ready[fromSlot] = false;
      tx.update(ref, { players, ready, updatedAt: serverTs() });
    });
  };

  api.startMatch = async function startMatch(roomId) {
    if (!roomId) return;
    await ensureAnonAuth();
    const ref = roomsCol.doc(roomId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('房间已不存在。');
      const data = snap.data() || {};
      const uid = auth.currentUser?.uid || api.uid;
      if (!uid || data.hostUid !== uid) throw new Error('只有房主可以开始。');
      const ready = data.ready || {};
      if (!(ready.player1 && ready.player2)) throw new Error('双方都准备后才能开始。');
      tx.update(ref, {
        phase: 'select-player1',
        confirmed: { player1: false, player2: false },
        selections: null,
        updatedAt: serverTs(),
      });
    });
  };

  api.submitSelections = async function submitSelections(roomId, slot, selections) {
    if (!roomId || !slot) return;
    await ensureAnonAuth();
    const ref = roomsCol.doc(roomId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('房间已不存在。');
      const data = snap.data() || {};
      if (data.phase === 'closed') throw new Error('房间已关闭。');
      const phase = data.phase || 'lobby';
      const selectionsPayload = data.selections || {};
      const confirmed = data.confirmed || { player1: false, player2: false };

      if (phase === 'select-player1' || phase === 'select') {
        if (slot !== 'player1') throw new Error('等待玩家1选择。');
        selectionsPayload.player1 = selections || null;
        confirmed.player1 = true;
        tx.update(ref, {
          selections: selectionsPayload,
          confirmed,
          phase: 'select-player2',
          updatedAt: serverTs(),
        });
        return;
      }

      if (phase === 'select-player2') {
        if (slot !== 'player2') throw new Error('等待玩家2选择。');
        selectionsPayload.player2 = selections || null;
        confirmed.player2 = true;
        tx.update(ref, {
          selections: selectionsPayload,
          confirmed,
          phase: 'battle',
          updatedAt: serverTs(),
        });
        return;
      }

      throw new Error('当前阶段无法提交。');
    });
  };

  api.closeRoom = async function closeRoom(roomId) {
    if (!roomId) return;
    await ensureAnonAuth();
    const ref = roomsCol.doc(roomId);
    await ref.set({ phase: 'closed', updatedAt: serverTs() }, { merge: true });
  };

  // Helper for host: advance to battle once both confirmed.
  api._hostTryAdvanceToBattle = async function _hostTryAdvanceToBattle(room) {
    if (!room || !room.phase?.startsWith('select')) return;
    const uid = auth.currentUser?.uid || api.uid;
    if (!uid || room.hostUid !== uid) return;
    if (!(room.confirmed?.player1 && room.confirmed?.player2)) return;
    const ref = roomsCol.doc(room.id);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data() || {};
        if (!data.phase?.startsWith('select')) return;
        const confirmed = data.confirmed || {};
        if (!(confirmed.player1 && confirmed.player2)) return;
        tx.update(ref, { phase: 'battle', updatedAt: serverTs() });
      });
    } catch (e) {
      // ignore
    }
  };

})();
