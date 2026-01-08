/*
  FarPVP Cloud Rooms (Firebase Firestore)

  - Works with static hosting (GitHub Pages / Netlify / etc.)
  - If window.GW_FIREBASE_CONFIG is null, this file does nothing
    and the game falls back to localStorage rooms.

  Required (in Firebase Console):
  - Authentication: enable Anonymous
  - Firestore Database: create one
*/

(function () {
  'use strict';

  const config = window.GW_FIREBASE_CONFIG;
  if (!config) return;

  if (!window.firebase || !window.firebase.initializeApp) {
    console.warn('[FarPVP] Firebase SDK not loaded; falling back to local rooms.');
    return;
  }

  // --- Init Firebase (compat) ---
  let app;
  try {
    app = window.firebase.initializeApp(config);
  } catch (e) {
    // Already initialized
    try {
      app = window.firebase.app();
    } catch (err) {
      console.warn('[FarPVP] Firebase init failed; falling back to local rooms.', err);
      return;
    }
  }

  const auth = window.firebase.auth();
  const db = window.firebase.firestore();
  const FieldValue = window.firebase.firestore.FieldValue;

  let authReady = false;
  let authPromise = null;

  function ensureAuth() {
    if (authReady) return Promise.resolve(true);
    if (authPromise) return authPromise;
    authPromise = new Promise((resolve) => {
      auth.onAuthStateChanged((user) => {
        if (user) {
          authReady = true;
          resolve(true);
        }
      });
      auth
        .signInAnonymously()
        .then(() => {
          // onAuthStateChanged will resolve
        })
        .catch((err) => {
          console.warn('[FarPVP] Anonymous auth failed; cloud rooms disabled.', err);
          resolve(false);
        });
    });
    return authPromise;
  }

  function nowMs() {
    return Date.now();
  }

  function toMs(ts) {
    try {
      if (!ts) return 0;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (ts.seconds) return ts.seconds * 1000;
      return 0;
    } catch (e) {
      return 0;
    }
  }

  async function sha256Hex(text) {
    const value = text || '';
    const enc = new TextEncoder();
    const data = enc.encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function passwordToHash(password) {
    const pass = password || '';
    if (!pass) return '';
    // Fallback: if crypto.subtle not available, store plain text (prototype).
    if (!(window.crypto && window.crypto.subtle && window.TextEncoder)) {
      return pass;
    }
    try {
      return await sha256Hex(pass);
    } catch (e) {
      return pass;
    }
  }

  const ROOMS_COL = 'farpvpRooms';

  function sanitizeRoom(room) {
    if (!room) return null;
    return {
      id: room.id,
      name: room.name || '房间',
      password: '', // never expose
      passHash: room.passHash || '',
      players: room.players || { player1: null, player2: null },
      ready: room.ready || { player1: false, player2: false },
      phase: room.phase || 'lobby',
      selections: room.selections || null,
      confirmed: room.confirmed || { player1: false, player2: false },
      createdAt: room.createdAt || null,
      updatedAt: room.updatedAt || null,
    };
  }

  async function createRoom({ name, password }) {
    const ok = await ensureAuth();
    if (!ok) throw new Error('Auth failed');
    const roomId = `room-${nowMs()}-${Math.random().toString(16).slice(2, 6)}`;
    const passHash = await passwordToHash(password);
    const payload = {
      id: roomId,
      name: (name || '').trim() || `房间-${Math.floor(Math.random() * 9999)}`,
      passHash: passHash,
      players: { player1: '玩家1', player2: null },
      ready: { player1: false, player2: false },
      phase: 'lobby',
      selections: null,
      confirmed: { player1: false, player2: false },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.collection(ROOMS_COL).doc(roomId).set(payload, { merge: true });
    return roomId;
  }

  async function joinRoom({ roomId, password }) {
    const ok = await ensureAuth();
    if (!ok) throw new Error('Auth failed');
    const docRef = db.collection(ROOMS_COL).doc(roomId);
    const passHash = await passwordToHash(password);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new Error('ROOM_NOT_FOUND');
      const room = snap.data() || {};
      const expected = room.passHash || '';
      if (expected && expected !== passHash) throw new Error('BAD_PASSWORD');
      const players = room.players || { player1: null, player2: null };
      if (players.player2) throw new Error('ROOM_FULL');
      players.player2 = '玩家2';
      const ready = room.ready || { player1: false, player2: false };
      ready.player2 = false;
      tx.set(
        docRef,
        {
          players,
          ready,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return true;
    });
  }

  async function leaveRoom({ roomId, slot, isHost }) {
    const ok = await ensureAuth();
    if (!ok) return;
    if (!roomId || !slot) return;
    const docRef = db.collection(ROOMS_COL).doc(roomId);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) return;
        const room = snap.data() || {};
        const players = room.players || { player1: null, player2: null };
        const ready = room.ready || { player1: false, player2: false };
        const confirmed = room.confirmed || { player1: false, player2: false };
        const selections = room.selections || {};

        // Host leaving: end the room.
        if (isHost) {
          tx.set(
            docRef,
            {
              phase: 'ended',
              players: { player1: null, player2: null },
              ready: { player1: false, player2: false },
              confirmed: { player1: false, player2: false },
              selections: null,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return;
        }

        players[slot] = null;
        ready[slot] = false;
        confirmed[slot] = false;
        if (selections && selections[slot]) {
          delete selections[slot];
        }
        tx.set(
          docRef,
          {
            players,
            ready,
            confirmed,
            selections,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    } catch (e) {
      // ignore
    }
  }

  async function toggleReady({ roomId, slot }) {
    const ok = await ensureAuth();
    if (!ok) throw new Error('Auth failed');
    const docRef = db.collection(ROOMS_COL).doc(roomId);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new Error('ROOM_NOT_FOUND');
      const room = snap.data() || {};
      const ready = room.ready || { player1: false, player2: false };
      ready[slot] = !ready[slot];
      tx.set(
        docRef,
        {
          ready,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return ready[slot];
    });
  }

  async function moveSlot({ roomId, fromSlot, toSlot }) {
    const ok = await ensureAuth();
    if (!ok) throw new Error('Auth failed');
    const docRef = db.collection(ROOMS_COL).doc(roomId);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new Error('ROOM_NOT_FOUND');
      const room = snap.data() || {};
      const players = room.players || { player1: null, player2: null };
      const ready = room.ready || { player1: false, player2: false };
      const confirmed = room.confirmed || { player1: false, player2: false };
      if (players[toSlot]) throw new Error('SLOT_TAKEN');
      players[toSlot] = toSlot === 'player1' ? '玩家1' : '玩家2';
      players[fromSlot] = null;
      ready[toSlot] = !!ready[fromSlot];
      ready[fromSlot] = false;
      confirmed[toSlot] = !!confirmed[fromSlot];
      confirmed[fromSlot] = false;
      tx.set(
        docRef,
        {
          players,
          ready,
          confirmed,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return true;
    });
  }

  async function setPhase({ roomId, phase }) {
    const ok = await ensureAuth();
    if (!ok) throw new Error('Auth failed');
    const docRef = db.collection(ROOMS_COL).doc(roomId);
    await docRef.set(
      {
        phase,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function resetForSelection({ roomId }) {
    const ok = await ensureAuth();
    if (!ok) throw new Error('Auth failed');
    const docRef = db.collection(ROOMS_COL).doc(roomId);
    await docRef.set(
      {
        phase: 'select',
        selections: null,
        confirmed: { player1: false, player2: false },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function submitSelections({ roomId, slot, selections }) {
    const ok = await ensureAuth();
    if (!ok) throw new Error('Auth failed');
    const docRef = db.collection(ROOMS_COL).doc(roomId);
    const sel = selections || {};
    await docRef.set(
      {
        selections: { [slot]: sel },
        confirmed: { [slot]: true },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  function subscribeRooms(onRooms) {
    if (typeof onRooms !== 'function') return () => {};
    let stopped = false;
    ensureAuth().then((ok) => {
      if (!ok || stopped) return;
    });
    const query = db.collection(ROOMS_COL).orderBy('updatedAt', 'desc').limit(50);
    const unsub = query.onSnapshot(
      (snap) => {
        const rooms = [];
        snap.forEach((doc) => {
          const data = doc.data() || {};
          const r = sanitizeRoom({ ...data, id: doc.id });
          if (!r) return;
          // Hide ended rooms and stale rooms (2 hours)
          if (r.phase === 'ended') return;
          const age = nowMs() - toMs(r.updatedAt);
          if (toMs(r.updatedAt) && age > 2 * 60 * 60 * 1000) return;
          rooms.push(r);
        });
        onRooms(rooms);
      },
      (err) => {
        console.warn('[FarPVP] subscribeRooms error:', err);
        onRooms([]);
      }
    );
    return () => {
      stopped = true;
      try {
        unsub && unsub();
      } catch (e) {
        // ignore
      }
    };
  }

  function subscribeRoom(roomId, onRoom) {
    if (!roomId || typeof onRoom !== 'function') return () => {};
    const docRef = db.collection(ROOMS_COL).doc(roomId);
    const unsub = docRef.onSnapshot(
      (snap) => {
        if (!snap.exists) {
          onRoom(null);
          return;
        }
        const data = snap.data() || {};
        onRoom(sanitizeRoom({ ...data, id: snap.id }));
      },
      (err) => {
        console.warn('[FarPVP] subscribeRoom error:', err);
        onRoom(null);
      }
    );
    return () => {
      try {
        unsub && unsub();
      } catch (e) {
        // ignore
      }
    };
  }

  window.GW_FARPVP_CLOUD = {
    // status
    isEnabled: true,
    ensureAuth,

    // lobby
    subscribeRooms,

    // room
    subscribeRoom,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    moveSlot,
    resetForSelection,
    setPhase,
    submitSelections,
  };
})();
