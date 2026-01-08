// Firebase config for FarPVP cloud rooms.
//
// ✅ If you fill this config, FarPVP rooms will be stored in Firestore,
// so Laptop / iPad / different browsers can see the same room list.
//
// How to get this:
// Firebase Console -> Project settings -> Your apps -> Web app config.
//
// IMPORTANT:
// - Enable Authentication -> Anonymous
// - Enable Firestore Database
//
// If you DO NOT fill this, the game still runs,
// but FarPVP rooms are LOCAL (localStorage) and won't sync across devices.

// Paste your config here (or leave it null to use local rooms):
window.GW_FIREBASE_CONFIG = null;

// Example:
// window.GW_FIREBASE_CONFIG = {
//   apiKey: "...",
//   authDomain: "...",
//   projectId: "...",
//   storageBucket: "...",
//   messagingSenderId: "...",
//   appId: "...",
// };
