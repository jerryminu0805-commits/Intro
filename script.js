const screens = new Map();
document.querySelectorAll('.screen').forEach((screen) => {
  screens.set(screen.dataset.screen, screen);
});

const mask = document.querySelector('.transition-mask');
const settingsPanel = document.querySelector('.settings-panel');
const toast = document.querySelector('.toast');
const storyOverlay = document.querySelector('.story-overlay');
const storySpeaker = storyOverlay ? storyOverlay.querySelector('.story-speaker') : null;
const storyText = storyOverlay ? storyOverlay.querySelector('.story-text') : null;
const storyNextButton = storyOverlay ? storyOverlay.querySelector('.story-next') : null;
const storySkipButton = storyOverlay ? storyOverlay.querySelector('.story-skip') : null;
const storyBackdrop = storyOverlay ? storyOverlay.querySelector('.story-backdrop') : null;

let currentScreen = 'menu';
let maskBusy = false;
let currentStageId = 'intro';
let storyState = null;
let bgmController = null;
let stageAmbientController = null;
let duoPrepController = null;

let currentStoryAudio = null;
let currentStoryAudioSrc = null;

// Accessories/System - LocalStorage Management
const STORAGE_KEY_COINS = 'gwdemo_coins';
const STORAGE_KEY_STAGE_COMPLETIONS = 'gwdemo_stage_completions';
const STORAGE_KEY_UNLOCKED_ACCESSORIES = 'gwdemo_unlocked_accessories';
const STORAGE_KEY_EQUIPPED_ACCESSORIES = 'gwdemo_equipped_accessories';
const STORAGE_KEY_SELECTED_SKILLS = 'gwdemo_selected_skills';
const STORAGE_KEY_DUO_SELECTED_SKILLS = 'gwdemo_duo_selected_skills';
const STORAGE_KEY_FARPVP_SELECTED_SKILLS = 'gwdemo_farpvp_selected_skills';
const STORAGE_KEY_FARPVP_ROOMS = 'gwdemo_farpvp_rooms';
const STORAGE_KEY_FARPVP_ROLE = 'gwdemo_farpvp_role';
const STORAGE_KEY_FARPVP_ROOM = 'gwdemo_farpvp_room';
const STORAGE_KEY_FARPVP_HOST = 'gwdemo_farpvp_host';

const duoState = {
  player1: {
    confirmed: false,
    currentCharacter: 'adora',
    selections: null,
  },
  player2: {
    confirmed: false,
    currentCharacter: 'adora',
    selections: null,
  },
};

const farPvpState = {
  roomId: null,
  room: null,
  role: localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || null,
  player1: {
    confirmed: false,
    currentCharacter: 'adora',
    selections: null,
  },
  player2: {
    confirmed: false,
    currentCharacter: 'adora',
    selections: null,
  },
};

const duoPlayerConfigs = {
  player1: {
    screenId: 'duo-player1',
    transitionLabel: '玩家1选择技能',
  },
  player2: {
    screenId: 'duo-player2',
    transitionLabel: '玩家2选择技能',
  },
};

function stopStoryAudio({ reset = true } = {}) {
  const audio = currentStoryAudio || (typeof window !== 'undefined' ? window.storyAudioController : null);
  if (audio) {
    try {
      audio.pause();
      if (reset) {
        audio.currentTime = 0;
      }
    } catch (error) {
      console.warn('Failed to stop story audio:', error);
    }
  }

  currentStoryAudio = null;
  currentStoryAudioSrc = null;

  if (typeof window !== 'undefined') {
    window.storyAudioController = null;
    if (window.storyAudioMetadata) {
      delete window.storyAudioMetadata;
    }
  }
}

function ensureMenuBGMStopped({ resetTime = false } = {}) {
  if (!bgmController) return;

  try {
    if (typeof bgmController.fadeOut === 'function') {
      bgmController.fadeOut(0);
    }
  } catch (error) {
    console.warn('Failed to fade out menu BGM:', error);
  }

  const audioEl = bgmController.audio;
  if (!audioEl) return;

  try {
    if (!audioEl.paused) {
      audioEl.pause();
    }
    if (resetTime) {
      audioEl.currentTime = 0;
    }
  } catch (error) {
    console.warn('Failed to pause menu BGM:', error);
  }
}

function clampAudioVolume(value, fallback = 0.7) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function playStoryAudio(src, { volume = 0.7, loop = true, resetMenuBGM = false } = {}) {
  const audioFile = typeof src === 'string' ? src.trim() : '';
  if (!audioFile) return null;

  ensureMenuBGMStopped({ resetTime: resetMenuBGM });

  if (currentStoryAudio && currentStoryAudioSrc === audioFile) {
    try {
      currentStoryAudio.loop = loop;
      currentStoryAudio.volume = clampAudioVolume(volume, currentStoryAudio.volume ?? 0.7);
      if (currentStoryAudio.paused) {
        currentStoryAudio.play().catch((err) => {
          console.warn('Story audio replay failed:', err);
        });
      }
      return currentStoryAudio;
    } catch (error) {
      console.warn('Failed to resume existing story audio:', error);
    }
  }

  stopStoryAudio({ reset: false });

  try {
    const audio = new Audio(audioFile);
    audio.loop = loop;
    audio.volume = clampAudioVolume(volume);
    audio.play().catch((err) => {
      console.warn('Story audio playback failed:', err);
    });

    currentStoryAudio = audio;
    currentStoryAudioSrc = audioFile;

    if (typeof window !== 'undefined') {
      window.storyAudioController = audio;
      window.storyAudioMetadata = {
        src: audioFile,
        loop,
        volume: audio.volume,
      };
    }

    return audio;
  } catch (error) {
    console.warn('Failed to start story audio:', error);
    return null;
  }
}

const stageProgress = {
  intro: false,
  firstHeresy: false,
  abandonedAnimals: false,
  fatigue: false,
  bloodTowerPlan: false,
  sevenSeas: false,
  oldLove: false,
};

function loadCoins() {
  const saved = localStorage.getItem(STORAGE_KEY_COINS);
  return saved ? parseInt(saved, 10) : 0;
}

function saveCoins(amount) {
  localStorage.setItem(STORAGE_KEY_COINS, amount.toString());
}

function addCoins(amount) {
  const current = loadCoins();
  const newAmount = current + amount;
  saveCoins(newAmount);
  return newAmount;
}

function loadStageCompletions() {
  const saved = localStorage.getItem(STORAGE_KEY_STAGE_COMPLETIONS);
  return saved ? JSON.parse(saved) : {
    intro: 0,
    firstHeresy: 0,
    abandonedAnimals: 0,
    fatigue: 0,
    bloodTowerPlan: 0,
    sevenSeas: 0,
    oldLove: 0
  };
}

function saveStageCompletions(completions) {
  localStorage.setItem(STORAGE_KEY_STAGE_COMPLETIONS, JSON.stringify(completions));
}

function recordStageCompletion(stageId) {
  const completions = loadStageCompletions();
  completions[stageId] = (completions[stageId] || 0) + 1;
  saveStageCompletions(completions);
  
  // Award coins: 2 for fatigue, 1 for others
  const coinsAwarded = stageId === 'fatigue' ? 2 : 1;
  const newTotal = addCoins(coinsAwarded);
  showToast(`完成关卡！获得 ${coinsAwarded} 币（总计: ${newTotal} 币）`);
  
  return completions;
}

function isAccessoriesUnlocked() {
  const completions = loadStageCompletions();
  return completions.fatigue > 0;
}

function loadUnlockedAccessories() {
  const saved = localStorage.getItem(STORAGE_KEY_UNLOCKED_ACCESSORIES);
  return saved ? JSON.parse(saved) : [];
}

function saveUnlockedAccessories(accessories) {
  localStorage.setItem(STORAGE_KEY_UNLOCKED_ACCESSORIES, JSON.stringify(accessories));
}

function unlockAccessory(accessoryId) {
  const unlocked = loadUnlockedAccessories();
  if (!unlocked.includes(accessoryId)) {
    unlocked.push(accessoryId);
    saveUnlockedAccessories(unlocked);
  }
}

function loadEquippedAccessories() {
  const saved = localStorage.getItem(STORAGE_KEY_EQUIPPED_ACCESSORIES);
  return saved ? JSON.parse(saved) : {
    adora: null,
    karma: null,
    dario: null
  };
}

function saveEquippedAccessories(equipped) {
  localStorage.setItem(STORAGE_KEY_EQUIPPED_ACCESSORIES, JSON.stringify(equipped));
}

function equipAccessory(characterId, accessoryId) {
  const equipped = loadEquippedAccessories();
  equipped[characterId] = accessoryId;
  saveEquippedAccessories(equipped);
}

function unequipAccessory(characterId) {
  equipAccessory(characterId, null);
}

// Accessory definitions
const accessoryDefinitions = {
  bandage: {
    id: 'bandage',
    name: '不止只是绷带',
    cost: 1,
    description: '携带者每回合回15HP 15SP以及每回合给携带者增加一层"恢复"Buff'
  },
  stimulant: {
    id: 'stimulant',
    name: '兴奋剂',
    cost: 1,
    description: '每双数回合给携带者增加一层暴力buff'
  },
  vest: {
    id: 'vest',
    name: '防弹衣',
    cost: 1,
    description: '减少受到的20%的HP伤害'
  },
  wine: {
    id: 'wine',
    name: '白酒',
    cost: 1,
    description: '每回合给携带者增加一层灵活buff（如果携带者的灵活buff是5或以上的话就不给）'
  },
  tetanus: {
    id: 'tetanus',
    name: '破伤风之刃',
    cost: 1,
    description: '携带者每次攻击都给对方增加一层流血以及一层怨念（多阶段攻击每阶段都各叠一层）'
  },
  tutorial: {
    id: 'tutorial',
    name: '"自我激励教程"',
    cost: 3,
    description: '每回合能让携带者免疫一次SP伤害（多阶段攻击全阶段免疫）以及每回合开始都增加携带者10SP'
  }
};

// Skill Selection System - LocalStorage Management
function isSkillSelectionUnlocked() {
  const completions = loadStageCompletions();
  return completions.fatigue > 0;
}

function loadSelectedSkills() {
  const saved = localStorage.getItem(STORAGE_KEY_SELECTED_SKILLS);
  return saved ? JSON.parse(saved) : {
    adora: { green: null, blue: null, pink: null, white: null, red: null, purple: null, orange: [] },
    karma: { green: null, blue: null, pink: null, white: null, red: null, purple: null, orange: [] },
    dario: { green: null, blue: null, pink: null, white: null, red: null, purple: null, orange: [] }
  };
}

function saveSelectedSkills(skills) {
  localStorage.setItem(STORAGE_KEY_SELECTED_SKILLS, JSON.stringify(skills));
}

function saveDuoSelectedSkills(duoSelections) {
  localStorage.setItem(STORAGE_KEY_DUO_SELECTED_SKILLS, JSON.stringify(duoSelections));
}

function selectSkill(characterId, skillId, color) {
  const selected = loadSelectedSkills();
  if (color === 'orange') {
    if (!selected[characterId].orange.includes(skillId) && selected[characterId].orange.length < 2) {
      selected[characterId].orange.push(skillId);
    }
  } else {
    selected[characterId][color] = skillId;
  }
  saveSelectedSkills(selected);
}

function unselectSkill(characterId, skillId, color) {
  const selected = loadSelectedSkills();
  if (color === 'orange') {
    const index = selected[characterId].orange.indexOf(skillId);
    if (index > -1) {
      selected[characterId].orange.splice(index, 1);
    }
  } else {
    selected[characterId][color] = null;
  }
  saveSelectedSkills(selected);
}

function createEmptySkillSelection() {
  return { green: null, blue: null, pink: null, white: null, red: null, purple: null, orange: [null, null] };
}

function createDuoSelections() {
  return {
    adora: createEmptySkillSelection(),
    karma: createEmptySkillSelection(),
    dario: createEmptySkillSelection(),
  };
}

function resetDuoSelections() {
  duoState.player1.selections = createDuoSelections();
  duoState.player2.selections = createDuoSelections();
}

function resetFarPvpSelections() {
  farPvpState.player1.selections = createDuoSelections();
  farPvpState.player2.selections = createDuoSelections();
}

function saveFarPvpSelectedSkills(selections) {
  localStorage.setItem(STORAGE_KEY_FARPVP_SELECTED_SKILLS, JSON.stringify(selections));
}

function clearFarPvpSkill(playerKey, characterId, skillId) {
  const selected = farPvpState[playerKey].selections[characterId];
  Object.keys(selected).forEach((color) => {
    if (color === 'orange') {
      selected.orange = selected.orange.map((slot) => (slot === skillId ? null : slot));
    } else if (selected[color] === skillId) {
      selected[color] = null;
    }
  });
}

function selectFarPvpSkill(playerKey, characterId, skillId, color, slotIndex = null) {
  const selected = farPvpState[playerKey].selections[characterId];
  clearFarPvpSkill(playerKey, characterId, skillId);
  if (color === 'orange') {
    const index = typeof slotIndex === 'number' ? slotIndex : selected.orange.findIndex((slot) => !slot);
    if (index !== -1 && index < 2) {
      selected.orange[index] = skillId;
    }
  } else {
    selected[color] = skillId;
  }
}

function unselectFarPvpSkill(playerKey, characterId, skillId, color, slotIndex = null) {
  const selected = farPvpState[playerKey].selections[characterId];
  if (color === 'orange') {
    if (typeof slotIndex === 'number') {
      if (selected.orange[slotIndex] === skillId) {
        selected.orange[slotIndex] = null;
      }
    } else {
      selected.orange = selected.orange.map((slot) => (slot === skillId ? null : slot));
    }
  } else if (selected[color] === skillId) {
    selected[color] = null;
  }
}

function clearDuoSkill(playerKey, characterId, skillId) {
  const selected = duoState[playerKey].selections[characterId];
  Object.keys(selected).forEach((color) => {
    if (color === 'orange') {
      selected.orange = selected.orange.map((slot) => (slot === skillId ? null : slot));
    } else if (selected[color] === skillId) {
      selected[color] = null;
    }
  });
}

function selectDuoSkill(playerKey, characterId, skillId, color, slotIndex = null) {
  const selected = duoState[playerKey].selections[characterId];
  clearDuoSkill(playerKey, characterId, skillId);
  if (color === 'orange') {
    const index = typeof slotIndex === 'number' ? slotIndex : selected.orange.findIndex((slot) => !slot);
    if (index !== -1 && index < 2) {
      selected.orange[index] = skillId;
    }
  } else {
    selected[color] = skillId;
  }
}

function unselectDuoSkill(playerKey, characterId, skillId, color, slotIndex = null) {
  const selected = duoState[playerKey].selections[characterId];
  if (color === 'orange') {
    if (typeof slotIndex === 'number') {
      if (selected.orange[slotIndex] === skillId) {
        selected.orange[slotIndex] = null;
      }
    } else {
      selected.orange = selected.orange.map((slot) => (slot === skillId ? null : slot));
    }
  } else if (selected[color] === skillId) {
    selected[color] = null;
  }
}

function resetMaskState() {
  if (!mask) return;
  mask.classList.remove('visible', 'covering', 'revealing');
  maskBusy = false;
}

function setActiveScreen(screenId) {
  screens.forEach((node, key) => {
    node.classList.toggle('active', key === screenId);
  });
  currentScreen = screenId;
  handleScreenEnter(screenId);
}

function transitionTo(targetScreen) {
  if (!screens.has(targetScreen) || targetScreen === currentScreen || maskBusy) {
    if (targetScreen && !screens.has(targetScreen)) {
      showToast('目标界面不存在');
    }
    return;
  }

  maskBusy = true;
  mask.classList.add('visible');
  mask.classList.remove('revealing');
  void mask.offsetWidth;
  mask.classList.add('covering');

  let stage = 'cover';
  let fallbackTimer;

  const clearFallback = () => {
    if (!fallbackTimer) return;
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  };

  const handleReveal = (event) => {
    if (event.propertyName !== 'transform') return;
    mask.removeEventListener('transitionend', handleReveal);
    stage = 'done';
    clearFallback();
    resetMaskState();
  };

  const handleCover = (event) => {
    if (event.propertyName !== 'transform') return;
    mask.removeEventListener('transitionend', handleCover);
    setActiveScreen(targetScreen);
    stage = 'reveal';
    mask.classList.remove('covering');
    mask.classList.add('revealing');
    mask.addEventListener('transitionend', handleReveal);
  };

  fallbackTimer = setTimeout(() => {
    if (stage === 'cover') {
      setActiveScreen(targetScreen);
    }
    mask.removeEventListener('transitionend', handleCover);
    mask.removeEventListener('transitionend', handleReveal);
    stage = 'done';
    resetMaskState();
    fallbackTimer = null;
  }, 2000);

  mask.addEventListener('transitionend', handleCover);
}

function handleScreenEnter(screenId) {
  if (screenId !== 'farpvp-lobby' && farPvpLobbyTimer) {
    clearInterval(farPvpLobbyTimer);
    farPvpLobbyTimer = null;
  }
  if (screenId !== 'farpvp-room' && farPvpRoomTimer) {
    clearInterval(farPvpRoomTimer);
    farPvpRoomTimer = null;
  }
  if (screenId !== 'farpvp-lobby' && farPvpLobbyUnsub) {
    try {
      farPvpLobbyUnsub();
    } catch (e) {
      // ignore
    }
    farPvpLobbyUnsub = null;
  }
  if (screenId !== 'farpvp-room' && farPvpRoomUnsub) {
    try {
      farPvpRoomUnsub();
    } catch (e) {
      // ignore
    }
    farPvpRoomUnsub = null;
  }
  if (screenId === 'duo-confirm') {
    startDuoMode();
  }
  if (screenId === 'duo-player1') {
    renderDuoSkillScreen('player1');
  }
  if (screenId === 'duo-player2') {
    renderDuoSkillScreen('player2');
  }
  if (screenId === 'duo-battle') {
    loadDuoBattleFrame();
  }
  if (screenId === 'farpvp-lobby') {
    const cloud = getFarPvpCloud();
    updateFarPvpLobbyList();
    if (farPvpLobbyTimer) clearInterval(farPvpLobbyTimer);
    farPvpLobbyTimer = setInterval(updateFarPvpLobbyList, 2000);
    if (cloud && cloud.subscribeLobby) {
      if (farPvpLobbyUnsub) {
        try {
          farPvpLobbyUnsub();
        } catch (e) {
          // ignore
        }
      }
      farPvpLobbyUnsub = cloud.subscribeLobby((rooms) => {
        farPvpState.cloudRooms = rooms || [];
        updateFarPvpLobbyList();
      });
    }
  }
  if (screenId === 'farpvp-room') {
    const cloud = getFarPvpCloud();
    updateFarPvpRoomView();
    if (farPvpRoomTimer) clearInterval(farPvpRoomTimer);
    farPvpRoomTimer = setInterval(updateFarPvpRoomView, 2000);
    if (cloud && cloud.subscribeRoom) {
      if (farPvpRoomUnsub) {
        try {
          farPvpRoomUnsub();
        } catch (e) {
          // ignore
        }
      }
      const roomId = farPvpState.roomId || localStorage.getItem(STORAGE_KEY_FARPVP_ROOM);
      if (roomId) {
        farPvpRoomUnsub = cloud.subscribeRoom(roomId, (room) => {
          handleFarPvpCloudRoomUpdate(room);
          updateFarPvpRoomView();
        });
      }
    }
  }
  if (screenId === 'farpvp-player1') {
    renderFarPvpSkillScreen('player1');
  }
  if (screenId === 'farpvp-player2') {
    renderFarPvpSkillScreen('player2');
  }
  if (screenId === 'farpvp-battle') {
    loadFarPvpBattleFrame();
  }
}

function playOneShotAudio(src, volume = 0.8) {
  if (!src) return;
  try {
    const audio = new Audio(src);
    audio.volume = clampAudioVolume(volume);
    audio.play().catch((err) => {
      console.warn('One-shot audio playback failed:', err);
    });
  } catch (error) {
    console.warn('One-shot audio init failed:', error);
  }
}

function startDuoMode() {
  resetDuoSelections();
  duoState.player1.confirmed = false;
  duoState.player2.confirmed = false;
  duoState.player1.currentCharacter = 'adora';
  duoState.player2.currentCharacter = 'adora';

  document.querySelectorAll('.duo-confirm-btn').forEach((btn) => {
    btn.classList.remove('is-confirmed');
    btn.disabled = false;
  });
  document.querySelectorAll('.duo-confirm-slot .duo-explosion').forEach((node) => node.remove());

  duoPrepController = playStoryAudio('DuoPrep.mp3', { volume: 0.65, loop: true, resetMenuBGM: true });
}

function playDuoTransition(text, onComplete) {
  const overlay = document.querySelector('.duo-transition');
  const textEl = overlay ? overlay.querySelector('.duo-transition-text') : null;
  if (!overlay || !textEl) {
    if (onComplete) onComplete();
    return;
  }

  textEl.textContent = text;
  overlay.classList.add('active');
  textEl.classList.remove('animate');
  void textEl.offsetWidth;
  textEl.classList.add('animate');

  const handleEnd = () => {
    textEl.removeEventListener('animationend', handleEnd);
    overlay.classList.remove('active');
    textEl.classList.remove('animate');
    if (onComplete) onComplete();
  };

  textEl.addEventListener('animationend', handleEnd);
}

function showDuoBlackout({ duration = 800, onComplete } = {}) {
  const overlay = document.querySelector('.duo-transition');
  const textEl = overlay ? overlay.querySelector('.duo-transition-text') : null;
  if (!overlay) {
    if (onComplete) onComplete();
    return;
  }

  if (textEl) {
    textEl.textContent = '';
    textEl.classList.remove('animate');
  }

  overlay.classList.add('active');
  setTimeout(() => {
    overlay.classList.remove('active');
    if (onComplete) onComplete();
  }, duration);
}

function loadDuoBattleFrame() {
  const frame = document.querySelector('.duo-battle-frame');
  if (!frame) return;

  const payload = {
    type: 'GW_DUO_SELECTED_SKILLS',
    selections: {
      player1: duoState.player1?.selections || createDuoSelections(),
      player2: duoState.player2?.selections || createDuoSelections(),
    },
  };

  const sendSelections = () => {
    try {
      frame.contentWindow && frame.contentWindow.postMessage(payload, '*');
    } catch (e) {
      // ignore
    }
  };

  // Always send after the iframe is ready (Safari file:// doesn't share localStorage reliably)
  frame.addEventListener('load', sendSelections, { once: true });

  // Pass selections via BOTH postMessage and URL param.
  // Safari (especially under file://) can occasionally fail to share localStorage across iframes,
  // and postMessage delivery can be flaky depending on load timing.
  // URL param provides a reliable, self-contained handoff of selections.
  let duoSelParam = '';
  try {
    const json = JSON.stringify(payload.selections || {});
    // Safe base64 for file:// Safari
    duoSelParam = encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
  } catch (e) {
    duoSelParam = '';
  }

  const desiredSrc = duoSelParam
    ? `pvp-battle.html?mode=duo&duosel=${duoSelParam}`
    : 'pvp-battle.html?mode=duo';
  if (!frame.src || !frame.src.includes('pvp-battle.html')) {
    frame.src = desiredSrc;
  } else {
    // If already loaded, try sending immediately
    sendSelections();
  }
}

let farPvpLobbyTimer = null;
let farPvpRoomTimer = null;
let farPvpLobbyUnsub = null;
let farPvpRoomUnsub = null;
let farPvpJoinRoomId = null;
let farPvpLastPhase = null;

function getFarPvpActivePlayer(phase) {
  if (phase === 'select-player1' || phase === 'select') return 'player1';
  if (phase === 'select-player2') return 'player2';
  return null;
}

function refreshFarPvpWaitOverlays() {
  updateFarPvpWaitOverlay('player1');
  updateFarPvpWaitOverlay('player2');
}

function getFarPvpCloud() {
  const cloud = window.GWFarPvpCloud;
  if (!cloud) return null;
  // Only treat as available if a real implementation is present.
  // (The stub object has all methods as null.)
  if (typeof cloud.subscribeLobby === 'function' || typeof cloud.createRoom === 'function') return cloud;
  return cloud && cloud.enabled ? cloud : null;
}

function handleFarPvpCloudRoomUpdate(room) {
  farPvpState.cloudRoom = room;
  farPvpState.room = room;

  const cloud = getFarPvpCloud();
  if (cloud) {
    const isHost = cloud.isHostRoom ? cloud.isHostRoom(room) : false;
    localStorage.setItem(STORAGE_KEY_FARPVP_HOST, isHost ? 'true' : 'false');
  }

  if (!room) return;

  // Host: once both confirmed, advance to battle.
  try {
    cloud && cloud._hostTryAdvanceToBattle && cloud._hostTryAdvanceToBattle(room);
  } catch (e) {
    // ignore
  }

  const phaseChanged = room.phase !== farPvpLastPhase;
  const enteringSelect =
    room.phase?.startsWith('select') && !(farPvpLastPhase || '').startsWith('select');
  if (phaseChanged) {
    farPvpLastPhase = room.phase;
  }

  const role = localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || 'player1';

  if (room.phase?.startsWith('select')) {
    // Ensure each client goes to their own selection screen.
    // Only reset once when first entering the select phase.
    if (enteringSelect) {
      resetFarPvpSelections();
      farPvpState.player1.confirmed = false;
      farPvpState.player2.confirmed = false;
      farPvpState.player1.currentCharacter = 'adora';
      farPvpState.player2.currentCharacter = 'adora';
    }
    const target = role === 'player2' ? 'farpvp-player2' : 'farpvp-player1';
    if (currentScreen !== target) {
      transitionTo(target);
    }
    refreshFarPvpWaitOverlays();
    return;
  }

  if (room.phase === 'battle') {
    const sel = room.selections || {};
    if (sel.player1 && sel.player2) {
      farPvpState.player1.selections = sel.player1;
      farPvpState.player2.selections = sel.player2;
      try {
        saveFarPvpSelectedSkills({ player1: sel.player1, player2: sel.player2 });
      } catch (e) {
        // ignore
      }
      if (currentScreen !== 'farpvp-battle') {
        transitionTo('farpvp-battle');
      }
    }
  }
}

function loadFarPvpRooms() {
  if (farPvpState?.cloudRooms && Array.isArray(farPvpState.cloudRooms)) {
    return farPvpState.cloudRooms;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY_FARPVP_ROOMS);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return [];
  }
}

function saveFarPvpRooms(rooms) {
  localStorage.setItem(STORAGE_KEY_FARPVP_ROOMS, JSON.stringify(rooms));
}

function setFarPvpRole(role) {
  farPvpState.role = role;
  localStorage.setItem(STORAGE_KEY_FARPVP_ROLE, role);
}

function setFarPvpRoomId(roomId) {
  farPvpState.roomId = roomId;
  localStorage.setItem(STORAGE_KEY_FARPVP_ROOM, roomId || '');
}

function getFarPvpRoom() {
  const cloud = getFarPvpCloud();
  if (cloud && farPvpState?.cloudRoom) {
    return farPvpState.cloudRoom;
  }
  const roomId = farPvpState.roomId || localStorage.getItem(STORAGE_KEY_FARPVP_ROOM);
  if (!roomId) return null;
  const rooms = loadFarPvpRooms();
  return rooms.find((room) => room.id === roomId) || null;
}

function updateFarPvpLobbyList() {
  const list = document.getElementById('farpvp-room-items');
  if (!list) return;
  const rooms = loadFarPvpRooms();
  list.innerHTML = '';
  if (!rooms.length) {
    const empty = document.createElement('div');
    empty.className = 'farpvp-room-meta';
    empty.textContent = '暂无房间，先创建一个吧。';
    list.appendChild(empty);
    return;
  }
  rooms.forEach((room) => {
    const item = document.createElement('div');
    item.className = 'farpvp-room-item';
    item.dataset.roomId = room.id;

    const title = document.createElement('div');
    const count = (room.players?.player1 ? 1 : 0) + (room.players?.player2 ? 1 : 0);
    title.innerHTML = `<strong>${room.name}</strong><div class="farpvp-room-meta">人数 ${count}/2</div>`;

    const meta = document.createElement('div');
    meta.className = 'farpvp-room-meta';
    meta.textContent = room.password ? '🔒 有密码' : '开放';

    item.appendChild(title);
    item.appendChild(meta);

    item.addEventListener('click', () => {
      openFarPvpJoinModal(room);
    });
    list.appendChild(item);
  });
}

function openFarPvpJoinModal(room) {
  const modal = document.getElementById('farpvp-join-modal');
  if (!modal || !room) return;
  farPvpJoinRoomId = room.id;
  const name = modal.querySelector('.farpvp-join-name');
  const input = modal.querySelector('#farpvp-join-pass');
  if (name) name.textContent = `房间：${room.name}`;
  if (input) input.value = '';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeFarPvpJoinModal() {
  const modal = document.getElementById('farpvp-join-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function updateFarPvpRoomView() {
  const room = getFarPvpRoom();
  farPvpState.room = room;
  const subtitle = document.getElementById('farpvp-room-subtitle');
  const slots = document.querySelectorAll('.farpvp-slot');
  const startBtn = document.querySelector('.farpvp-start-btn');
  if (!room) {
    if (subtitle) subtitle.textContent = '';
    slots.forEach((slot) => {
      const body = slot.querySelector('.farpvp-slot-body');
      if (body) body.textContent = '空位';
    });
    if (startBtn) startBtn.disabled = true;
    return;
  }

  if (subtitle) subtitle.textContent = `房间：${room.name}`;
  slots.forEach((slot) => {
    const key = slot.dataset.slot;
    const body = slot.querySelector('.farpvp-slot-body');
    if (!body) return;
    body.textContent = room.players?.[key] || '空位';
    slot.classList.toggle('is-ready', !!room.ready?.[key]);
  });

  const allReady = room.ready?.player1 && room.ready?.player2;
  const isHost = localStorage.getItem(STORAGE_KEY_FARPVP_HOST) === 'true';
  if (startBtn) startBtn.disabled = !(allReady && isHost);
}

function saveFarPvpRoom(room) {
  const rooms = loadFarPvpRooms();
  const index = rooms.findIndex((item) => item.id === room.id);
  if (index >= 0) {
    rooms[index] = room;
  } else {
    rooms.push(room);
  }
  saveFarPvpRooms(rooms);
}

function createFarPvpRoom(name, password) {
  const roomName = name?.trim() || `房间-${Math.floor(Math.random() * 9999)}`;
  const cloud = getFarPvpCloud();
  if (cloud && cloud.createRoom) {
    cloud
      .createRoom(roomName, password || '')
      .then((roomId) => {
        setFarPvpRole('player1');
        setFarPvpRoomId(roomId);
        localStorage.setItem(STORAGE_KEY_FARPVP_HOST, 'true');
        transitionTo('farpvp-room');
      })
      .catch((e) => {
        showToast(e?.message || '创建房间失败。');
      });
    return;
  }
  const room = {
    id: `room-${Date.now()}`,
    name: roomName,
    password: password || '',
    players: {
      player1: '玩家1',
      player2: null,
    },
    ready: {
      player1: false,
      player2: false,
    },
    phase: 'lobby',
  };
  saveFarPvpRoom(room);
  setFarPvpRole('player1');
  setFarPvpRoomId(room.id);
  localStorage.setItem(STORAGE_KEY_FARPVP_HOST, 'true');
  transitionTo('farpvp-room');
}

function joinFarPvpRoom(roomId, password) {
  const cloud = getFarPvpCloud();
  if (cloud && cloud.joinRoom) {
    cloud
      .joinRoom(roomId, password || '')
      .then(() => {
        setFarPvpRole('player2');
        setFarPvpRoomId(roomId);
        localStorage.setItem(STORAGE_KEY_FARPVP_HOST, 'false');
        transitionTo('farpvp-room');
      })
      .catch((e) => {
        showToast(e?.message || '加入房间失败。');
      });
    return;
  }
  const rooms = loadFarPvpRooms();
  const room = rooms.find((item) => item.id === roomId);
  if (!room) {
    showToast('房间已不存在。');
    return;
  }
  if (room.password && room.password !== password) {
    showToast('密码不正确。');
    return;
  }
  if (room.players?.player2) {
    showToast('房间已满。');
    return;
  }
  room.players.player2 = '玩家2';
  room.ready.player2 = false;
  saveFarPvpRoom(room);
  setFarPvpRole('player2');
  setFarPvpRoomId(room.id);
  localStorage.setItem(STORAGE_KEY_FARPVP_HOST, 'false');
  transitionTo('farpvp-room');
}

function toggleFarPvpReady(playerKey) {
  const room = getFarPvpRoom();
  if (!room) return;
  const cloud = getFarPvpCloud();
  if (cloud && cloud.toggleReady) {
    cloud.toggleReady(room.id, playerKey).catch((e) => {
      showToast(e?.message || '操作失败。');
    });
    return;
  }
  room.ready[playerKey] = !room.ready[playerKey];
  saveFarPvpRoom(room);
  updateFarPvpRoomView();
}

function moveFarPvpPlayerSlot(targetSlot) {
  const room = getFarPvpRoom();
  if (!room) return;
  const currentRole = localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || 'player1';
  if (currentRole === targetSlot) return;
  const cloud = getFarPvpCloud();
  if (cloud && cloud.moveSlot) {
    cloud
      .moveSlot(room.id, currentRole, targetSlot)
      .then(() => {
        setFarPvpRole(targetSlot);
      })
      .catch((e) => {
        showToast(e?.message || '移动失败。');
      });
    return;
  }
  if (room.players?.[targetSlot]) {
    showToast('该位置已有玩家。');
    return;
  }
  room.players[targetSlot] = targetSlot === 'player1' ? '玩家1' : '玩家2';
  room.players[currentRole] = null;
  room.ready[targetSlot] = room.ready[currentRole];
  room.ready[currentRole] = false;
  saveFarPvpRoom(room);
  setFarPvpRole(targetSlot);
  updateFarPvpRoomView();
}

function startFarPvpMatch() {
  const room = getFarPvpRoom();
  if (!room) return;
  const cloud = getFarPvpCloud();
  if (cloud && cloud.startMatch) {
    cloud.startMatch(room.id).catch((e) => {
      showToast(e?.message || '开始失败。');
    });
    return;
  }
  const isHost = localStorage.getItem(STORAGE_KEY_FARPVP_HOST) === 'true';
  if (!isHost) {
    showToast('只有房主可以开始。');
    return;
  }
  if (!(room.ready?.player1 && room.ready?.player2)) {
    showToast('双方都准备后才能开始。');
    return;
  }
  room.phase = 'select-player1';
  saveFarPvpRoom(room);
  farPvpState.room = room;
  resetFarPvpSelections();
  farPvpState.player1.confirmed = false;
  farPvpState.player2.confirmed = false;
  farPvpState.player1.currentCharacter = 'adora';
  farPvpState.player2.currentCharacter = 'adora';
  transitionTo('farpvp-player1');
}

function renderFarPvpSkillScreen(playerKey) {
  const config = farPvpPlayerConfigs[playerKey];
  if (!config) return;

  const screen = document.querySelector(`[data-screen="${config.screenId}"]`);
  if (!screen) return;

  const content = screen.querySelector('.farpvp-skill-content');
  if (!content) return;

  if (!farPvpState[playerKey].selections) {
    resetFarPvpSelections();
  }

  const characterId = farPvpState[playerKey].currentCharacter || 'adora';
  const character = characterData[characterId];
  const selections = farPvpState[playerKey].selections[characterId] || createEmptySkillSelection();

  const role = localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || 'player1';
  const activePlayer = getFarPvpActivePlayer(farPvpState.room?.phase);
  const canInteract = role === playerKey && (!activePlayer || activePlayer === role);

  content.innerHTML = '';
  // Reuse Duo layout styles for a clean 2-column grid.
  content.classList.add('duo-skill-content');

  const left = document.createElement('div');
  left.className = 'duo-skill-left';

  const tabs = document.createElement('nav');
  tabs.className = 'duo-character-tabs';

  ['adora', 'karma', 'dario'].forEach((charId) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `duo-character-tab ${charId === characterId ? 'active' : ''}`;
    tab.textContent = characterData[charId]?.name || charId;
    tab.addEventListener('click', () => {
      farPvpState[playerKey].currentCharacter = charId;
      renderFarPvpSkillScreen(playerKey);
    });
    tabs.appendChild(tab);
  });

  const portraitCard = document.createElement('div');
  portraitCard.className = 'duo-portrait-card';

  const portraitImg = document.createElement('img');
  portraitImg.alt = character?.name || characterId;
  portraitImg.src = character?.portrait || '';
  portraitCard.appendChild(portraitImg);

  const slotsContainer = document.createElement('div');
  slotsContainer.className = 'skill-slots-container';

  const slotColors = [
    { color: 'green', label: '绿色技能', limit: 1 },
    { color: 'blue', label: '蓝色技能', limit: 1 },
    { color: 'pink', label: '粉色技能', limit: 1 },
    { color: 'white', label: '白色技能', limit: 1 },
    { color: 'red', label: '红色技能', limit: 1 },
    { color: 'purple', label: '紫色技能', limit: 1 },
    { color: 'orange', label: '橙色技能', limit: 2 },
  ];

  slotColors.forEach(({ color, label, limit }) => {
    const group = document.createElement('div');
    group.className = 'skill-slot-group';

    const header = document.createElement('div');
    header.className = 'skill-slot-header';

    const title = document.createElement('h4');
    title.textContent = label;

    const counter = document.createElement('span');
    counter.className = 'skill-slot-counter';
    counter.textContent = `限制 ${limit}`;

    header.appendChild(title);
    header.appendChild(counter);

    const slots = document.createElement('div');
    slots.className = 'skill-slots';

    for (let i = 0; i < limit; i += 1) {
      const slot = document.createElement('div');
      slot.className = `skill-slot ${color}`;
      slot.dataset.character = characterId;
      slot.dataset.color = color;
      slot.dataset.slotIndex = String(i);

      const selectedId = color === 'orange' ? selections.orange?.[i] : selections[color];
      if (selectedId) {
        const selectedSkill = findSkillById(selectedId, characterId);
        if (selectedSkill) {
          const card = createSkillCard(selectedSkill, true);
          card.draggable = canInteract;
          slot.appendChild(card);
        }
      } else {
        const empty = document.createElement('span');
        empty.className = 'skill-slot-empty';
        empty.textContent = canInteract ? '拖放技能到此处' : '等待对方操作...';
        slot.appendChild(empty);
      }

      slots.appendChild(slot);
    }

    group.appendChild(header);
    group.appendChild(slots);
    slotsContainer.appendChild(group);
  });

  left.appendChild(tabs);
  left.appendChild(portraitCard);
  left.appendChild(slotsContainer);

  const right = document.createElement('div');
  right.className = 'duo-skill-right';

  const libraryHeader = document.createElement('div');
  libraryHeader.className = 'duo-skill-header';

  const libraryTitle = document.createElement('h3');
  libraryTitle.textContent = '技能池';

  const libraryHint = document.createElement('p');
  libraryHint.textContent = canInteract ? '右键查看说明，拖动技能到左侧槽位' : '等待对方选择...';

  libraryHeader.appendChild(libraryTitle);
  libraryHeader.appendChild(libraryHint);

  const libraryBody = document.createElement('div');
  libraryBody.className = 'skill-library';

  const characterSkills = (skillLibrary[characterId] || []).slice();

  const colorOrder = { green: 0, blue: 1, pink: 2, white: 3, red: 4, purple: 5, orange: 6, gray: 99 };
  characterSkills.sort((a, b) => {
    const orderA = colorOrder[a.color] ?? 99;
    const orderB = colorOrder[b.color] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    const probA = typeof a.probability === 'number' ? a.probability : 0;
    const probB = typeof b.probability === 'number' ? b.probability : 0;
    return probB - probA;
  });

  const groups = {};
  characterSkills.forEach((skill) => {
    if (!groups[skill.color]) groups[skill.color] = [];
    groups[skill.color].push(skill);
  });

  const groupLabels = {
    green: '绿色技能',
    blue: '蓝色技能',
    pink: '粉色技能',
    white: '白色技能',
    red: '红色技能',
    purple: '紫色技能',
    orange: '橙色技能',
    gray: '灰色技能',
  };

  Object.keys(groups)
    .sort((a, b) => (colorOrder[a] ?? 99) - (colorOrder[b] ?? 99))
    .forEach((color) => {
      const section = document.createElement('div');
      section.className = 'skill-library-section';

      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'skill-library-section-header';

      const sectionTitle = document.createElement('h4');
      sectionTitle.textContent = groupLabels[color] || color;

      sectionHeader.appendChild(sectionTitle);

      const list = document.createElement('div');
      list.className = 'skill-library-list';

      groups[color].forEach((skill) => {
        const card = createSkillCard(skill, false);
        card.draggable = canInteract;
        if (!canInteract) {
          card.classList.add('skill-card-disabled');
        }
        list.appendChild(card);
      });

      section.appendChild(sectionHeader);
      section.appendChild(list);
      libraryBody.appendChild(section);
    });

  right.appendChild(libraryHeader);
  right.appendChild(libraryBody);

  content.appendChild(left);
  content.appendChild(right);

  setupFarPvpSkillSelectionInteractions(content, playerKey, characterId);
  updateFarPvpWaitOverlay(playerKey);
}

function canInteractFarPvpSkillSelection(playerKey) {
  const role = localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || 'player1';
  const activePlayer = getFarPvpActivePlayer(farPvpState.room?.phase);
  return role === playerKey && (!activePlayer || activePlayer === role);
}

function setupFarPvpSkillSelectionInteractions(container, playerKey, characterId) {
  let draggedSkillId = null;
  let draggedFromSlot = null;
  let dropSuccessful = false;

  const canInteract = () => canInteractFarPvpSkillSelection(playerKey);

  container.querySelectorAll('.skill-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      if (!canInteract()) {
        e.preventDefault();
        return;
      }
      draggedSkillId = card.dataset.skillId;
      draggedFromSlot = card.closest('.skill-slot');
      dropSuccessful = false;
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      if (draggedFromSlot && !dropSuccessful && draggedSkillId) {
        const fromColor = draggedFromSlot.dataset.color;
        const slotIndex = parseInt(draggedFromSlot.dataset.slotIndex, 10);
        unselectFarPvpSkill(playerKey, characterId, draggedSkillId, fromColor, slotIndex);
        showToast('技能已取消选择');
        renderFarPvpSkillScreen(playerKey);
      }
      draggedSkillId = null;
      draggedFromSlot = null;
      dropSuccessful = false;
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const skill = findSkillById(card.dataset.skillId, characterId);
      if (skill) {
        showSkillDescription(skill, e.pageX, e.pageY);
      }
    });
  });

  container.querySelectorAll('.skill-slot').forEach((slot) => {
    slot.addEventListener('dragover', (e) => {
      if (!canInteract()) return;
      e.preventDefault();
      slot.classList.add('drag-over');
    });

    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drag-over');
    });

    slot.addEventListener('drop', (e) => {
      if (!canInteract()) return;
      e.preventDefault();
      slot.classList.remove('drag-over');

      const slotColor = slot.dataset.color;
      const slotIndex = parseInt(slot.dataset.slotIndex, 10);
      const skill = findSkillById(draggedSkillId, characterId);
      if (!skill) return;

      if (skill.color !== slotColor) {
        const colorLabels = {
          green: '绿色', blue: '蓝色', pink: '粉色',
          white: '白色', red: '红色', purple: '紫色', orange: '橙色', gray: '灰色',
        };
        showToast(`技能颜色不匹配！此槽位只能放置${colorLabels[slotColor] || slotColor}技能`);
        return;
      }

      const existing = slot.querySelector('.skill-card');
      if (existing) {
        unselectFarPvpSkill(playerKey, characterId, existing.dataset.skillId, slotColor, slotIndex);
      }

      selectFarPvpSkill(playerKey, characterId, draggedSkillId, slotColor, slotIndex);
      dropSuccessful = true;
      showToast(`技能已选择: ${skill.name}`);
      renderFarPvpSkillScreen(playerKey);
    });
  });
}

function updateFarPvpWaitOverlay(playerKey) {
  const screen = document.querySelector(`[data-screen="farpvp-${playerKey}"]`);
  if (!screen) return;
  const overlay = screen.querySelector('.farpvp-wait-overlay');
  const role = localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || 'player1';
  const activePlayer = getFarPvpActivePlayer(farPvpState.room?.phase);
  const shouldWait = activePlayer ? role !== activePlayer : role !== playerKey;
  if (overlay) overlay.classList.toggle('active', shouldWait);
}

function enableFarPvpSkillDrag(playerKey) {
  const screen = document.querySelector(`[data-screen="farpvp-${playerKey}"]`);
  if (!screen) return;
  const slots = screen.querySelectorAll('.skill-slot');
  const draggableCards = screen.querySelectorAll('.skill-card.draggable');

  draggableCards.forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      const role = localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || 'player1';
      if (role !== playerKey) {
        event.preventDefault();
        return;
      }
      event.dataTransfer?.setData('text/plain', card.dataset.skillId || '');
    });
  });

  slots.forEach((slot) => {
    slot.addEventListener('dragover', (event) => {
      event.preventDefault();
    });
    slot.addEventListener('drop', (event) => {
      event.preventDefault();
      const role = localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || 'player1';
      if (role !== playerKey) return;
      const draggedSkillId = event.dataTransfer?.getData('text/plain');
      if (!draggedSkillId) return;
      const characterId = farPvpState[playerKey].currentCharacter;
      const skill = characterData[characterId]?.skills?.find((item) => item.id === draggedSkillId);
      if (!skill) return;
      const slotColor = slot.dataset.color;
      if (!slotColor) return;
      const slotIndex = parseInt(slot.dataset.index || '0', 10);

      if (slotColor !== skill.color && !(slotColor === 'orange' && skill.color === 'orange')) {
        showToast(`技能颜色不匹配！此槽位只能放置${slotColor}技能`);
        return;
      }

      const existing = slot.querySelector('.skill-card');
      if (existing) {
        unselectFarPvpSkill(playerKey, characterId, existing.dataset.skillId, slotColor, slotIndex);
      }

      selectFarPvpSkill(playerKey, characterId, draggedSkillId, slotColor, slotIndex);
      showToast(`技能已选择: ${skill.name}`);
      renderFarPvpSkillScreen(playerKey);
    });
  });
}

function loadFarPvpBattleFrame() {
  const frame = document.querySelector('.farpvp-battle-frame');
  if (!frame) return;

  const payload = {
    type: 'GW_FARPVP_SELECTED_SKILLS',
    selections: {
      player1: farPvpState.player1?.selections || createDuoSelections(),
      player2: farPvpState.player2?.selections || createDuoSelections(),
    },
  };

  const sendSelections = () => {
    try {
      frame.contentWindow && frame.contentWindow.postMessage(payload, '*');
    } catch (e) {
      // ignore
    }
  };

  frame.addEventListener('load', sendSelections, { once: true });

  let farSelParam = '';
  try {
    const json = JSON.stringify(payload.selections || {});
    farSelParam = encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
  } catch (e) {
    farSelParam = '';
  }

  const desiredSrc = farSelParam
    ? `farpvp-battle.html?mode=farpvp&farpvpsel=${farSelParam}`
    : 'farpvp-battle.html?mode=farpvp';
  if (!frame.src || !frame.src.includes('farpvp-battle.html')) {
    frame.src = desiredSrc;
  } else {
    sendSelections();
  }
}

function renderDuoSkillScreen(playerKey) {
  const config = duoPlayerConfigs[playerKey];
  if (!config) return;
  const screen = document.querySelector(`[data-screen="${config.screenId}"]`);
  if (!screen) return;

  const content = screen.querySelector('.duo-skill-content');
  if (!content) return;
  content.innerHTML = '';

  const characterId = duoState[playerKey].currentCharacter;
  const character = characterData[characterId];

  const left = document.createElement('div');
  left.className = 'duo-skill-left';

  const tabs = document.createElement('nav');
  tabs.className = 'duo-character-tabs';
  ['adora', 'dario', 'karma'].forEach((charId) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `duo-character-tab${charId === characterId ? ' active' : ''}`;
    tab.dataset.character = charId;
    tab.textContent = characterData[charId]?.name || charId;
    tab.addEventListener('click', () => {
      duoState[playerKey].currentCharacter = charId;
      renderDuoSkillScreen(playerKey);
    });
    tabs.appendChild(tab);
  });

  const portrait = document.createElement('div');
  portrait.className = 'duo-portrait-card';
  const img = document.createElement('img');
  img.src = character?.portrait || '';
  img.alt = `${character?.name || ''} 立绘`;
  portrait.appendChild(img);

  const slotsContainer = document.createElement('div');
  slotsContainer.className = 'skill-slots-container';

  const slotColors = [
    { color: 'green', label: '绿色', limit: 1 },
    { color: 'blue', label: '蓝色', limit: 1 },
    { color: 'pink', label: '粉色', limit: 1 },
    { color: 'white', label: '白色', limit: 1 },
    { color: 'red', label: '红色', limit: 1 },
    { color: 'purple', label: '紫色', limit: 1 },
    { color: 'orange', label: '橙色', limit: 2 },
  ];

  const selectedSkills = duoState[playerKey].selections[characterId];
  const characterSkills = skillLibrary[characterId] || [];

  slotColors.forEach(({ color, label, limit }) => {
    const slotGroup = document.createElement('div');
    slotGroup.className = 'skill-slot-group';

    const slotHeader = document.createElement('div');
    slotHeader.className = 'skill-slot-header';
    slotHeader.innerHTML = `<span class="skill-badge skill-${color}">${label}</span> <span class="slot-limit">(最多 ${limit} 个)</span>`;
    slotGroup.appendChild(slotHeader);

    const slots = document.createElement('div');
    slots.className = 'skill-slots';

    for (let i = 0; i < limit; i += 1) {
      const slot = document.createElement('div');
      slot.className = 'skill-slot';
      slot.dataset.character = characterId;
      slot.dataset.color = color;
      slot.dataset.slotIndex = i;

      let selectedSkill = null;
      if (color === 'orange') {
        const skillId = selectedSkills.orange[i];
        selectedSkill = skillId ? characterSkills.find((s) => s.id === skillId) : null;
      } else {
        const skillId = selectedSkills[color];
        selectedSkill = skillId ? characterSkills.find((s) => s.id === skillId) : null;
      }

      if (selectedSkill) {
        const skillCard = createSkillCard(selectedSkill, true);
        slot.appendChild(skillCard);
      } else {
        const empty = document.createElement('div');
        empty.className = 'empty-skill-slot';
        empty.textContent = '拖放技能到此处';
        slot.appendChild(empty);
      }

      slots.appendChild(slot);
    }

    slotGroup.appendChild(slots);
    slotsContainer.appendChild(slotGroup);
  });

  left.appendChild(tabs);
  left.appendChild(portrait);
  left.appendChild(slotsContainer);

  const right = document.createElement('div');
  right.className = 'duo-skill-right';

  const libraryContainer = document.createElement('div');
  libraryContainer.className = 'skill-library-container';

  const libraryHeader = document.createElement('h4');
  libraryHeader.textContent = '技能库';
  libraryContainer.appendChild(libraryHeader);

  const skillsByColor = {};
  characterSkills.forEach((skill) => {
    if (!skillsByColor[skill.color]) {
      skillsByColor[skill.color] = [];
    }
    skillsByColor[skill.color].push(skill);
  });

  const colorLabels = {
    green: '绿色', blue: '蓝色', pink: '粉色',
    white: '白色', red: '红色', purple: '紫色', orange: '橙色', gray: '灰色',
  };

  Object.entries(skillsByColor).forEach(([color, skills]) => {
    const colorGroup = document.createElement('div');
    colorGroup.className = 'skill-color-group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'skill-color-header';
    groupHeader.innerHTML = `<span class="skill-badge skill-${color}">${colorLabels[color] || color}</span>`;
    colorGroup.appendChild(groupHeader);

    const skillsList = document.createElement('div');
    skillsList.className = 'skills-list';

    skills.forEach((skill) => {
      const skillCard = createSkillCard(skill, false);
      skillsList.appendChild(skillCard);
    });

    colorGroup.appendChild(skillsList);
    libraryContainer.appendChild(colorGroup);
  });

  right.appendChild(libraryContainer);

  content.appendChild(left);
  content.appendChild(right);

  setupDuoSkillSelectionInteractions(content, playerKey, characterId);
}

function setupDuoSkillSelectionInteractions(container, playerKey, characterId) {
  let draggedSkillId = null;
  let draggedFromSlot = null;
  let dropSuccessful = false;

  container.querySelectorAll('.skill-card').forEach((card) => {
    card.addEventListener('dragstart', () => {
      draggedSkillId = card.dataset.skillId;
      draggedFromSlot = card.closest('.skill-slot');
      dropSuccessful = false;
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      if (draggedFromSlot && !dropSuccessful) {
        const fromColor = draggedFromSlot.dataset.color;
        const slotIndex = parseInt(draggedFromSlot.dataset.slotIndex, 10);
        unselectDuoSkill(playerKey, characterId, draggedSkillId, fromColor, slotIndex);
        showToast('技能已取消选择');
        renderDuoSkillScreen(playerKey);
      }
      draggedSkillId = null;
      draggedFromSlot = null;
      dropSuccessful = false;
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const skill = findSkillById(card.dataset.skillId, characterId);
      if (skill) {
        showSkillDescription(skill, e.pageX, e.pageY);
      }
    });
  });

  container.querySelectorAll('.skill-slot').forEach((slot) => {
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      slot.classList.add('drag-over');
    });

    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drag-over');
    });

    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');

      const slotColor = slot.dataset.color;
      const slotIndex = parseInt(slot.dataset.slotIndex, 10);
      const skill = findSkillById(draggedSkillId, characterId);
      if (!skill) return;

      if (skill.color !== slotColor) {
        const colorLabels = {
          green: '绿色', blue: '蓝色', pink: '粉色',
          white: '白色', red: '红色', purple: '紫色', orange: '橙色', gray: '灰色',
        };
        showToast(`技能颜色不匹配！此槽位只能放置${colorLabels[slotColor] || slotColor}技能`);
        return;
      }

      const existing = slot.querySelector('.skill-card');
      if (existing) {
        unselectDuoSkill(playerKey, characterId, existing.dataset.skillId, slotColor, slotIndex);
      }

      selectDuoSkill(playerKey, characterId, draggedSkillId, slotColor, slotIndex);
      dropSuccessful = true;
      showToast(`技能已选择: ${skill.name}`);
      renderDuoSkillScreen(playerKey);
    });
  });
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

// ---- Duo battle return handling ----
// pvp-battle.html runs inside an iframe during Duo Mode.
// When the battle ends, the battle page will postMessage this event so we can
// close the iframe and return to the original stages screen instead of loading
// the main menu inside the iframe.
window.addEventListener('message', (event) => {
  const data = event && event.data;
  if (!data) return;
  if (data.type === 'GW_FARPVP_BATTLE_FINISHED') {
    const frame = document.querySelector('.farpvp-battle-frame');
    if (frame) {
      try { frame.src = 'about:blank'; } catch (e) { /* ignore */ }
    }
    stopStoryAudio({ reset: true });
    if (bgmController && typeof bgmController.fadeIn === 'function') {
      bgmController.fadeIn(900);
    }
    transitionTo('farpvp-lobby');
    return;
  }
  if (data.type !== 'GW_DUO_BATTLE_FINISHED') return;

  // Clear battle iframe so it doesn't keep showing/playing anything.
  const frame = document.querySelector('.duo-battle-frame');
  if (frame) {
    try { frame.src = 'about:blank'; } catch (e) { /* ignore */ }
  }

  // Stop Duo prep BGM if it is still playing.
  if (duoPrepController) {
    try {
      duoPrepController.pause();
      duoPrepController.currentTime = 0;
    } catch (e) {
      /* ignore */
    }
    duoPrepController = null;
  }

  // Stop any story audio controller that might still exist.
  stopStoryAudio({ reset: true });

  // Resume menu BGM.
  if (bgmController && typeof bgmController.fadeIn === 'function') {
    bgmController.fadeIn(900);
  }

  // Return to the MAIN menu screen (the big title screen).
  // Use transitionTo for consistent mask animation.
  try {
    transitionTo('menu');
  } catch (e) {
    setActiveScreen('menu');
  }
});

function toggleSettings(open = !settingsPanel.classList.contains('open')) {
  settingsPanel.classList.toggle('open', open);
  settingsPanel.setAttribute('aria-hidden', String(!open));
}

function initialiseMenu() {
  document.querySelectorAll('.menu-btn').forEach((btn) => {
    const target = btn.dataset.target;
    const action = btn.dataset.action;

    if (target) {
      btn.addEventListener('click', () => {
        if (target === 'chapters') {
          transitionTo('chapters');
        } else if (target === 'tutorial') {
          transitionTo('tutorial');
        }
      });
    }

    if (action === 'settings') {
      btn.addEventListener('click', () => toggleSettings(true));
    }

    if (action === 'exit') {
      btn.addEventListener('click', () => {
        showToast('当前演示不可退出客户端，请稍后再试。');
      });
    }
  });

  settingsPanel.querySelector('.panel-close').addEventListener('click', () => toggleSettings(false));
}

function initChapterBoard() {
  document.querySelectorAll('.chapter-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('locked')) {
        showToast('该章节仍在封锁中。');
        return;
      }
      transitionTo('stages');
    });
  });
}

const stageCatalog = {
  intro: {
    id: 'intro',
    name: 'Intro',
    subtitle: '基础战斗演练',
    size: '7 × 14',
    narrative: [
      '示范章节的开端。为玩家铺垫世界观与操作，包含低威胁遭遇、基础掩体运用与步数管理教学。',
    ],
    brief: [
      '地图 7×14 的城区街区，以直线对峙为主。',
      'Adora：自左至右第 2 格、自上至下第 4 格。',
      'Dario：自左至右第 2 格、自上至下第 2 格。',
      'Karma：自左至右第 2 格、自上至下第 6 格。',
      '敌人：对面排布三名刑警队员，维持平行阵形。',
    ],
    map: {
      rows: 7,
      cols: 14,
      voids: [],
      cover: [],
      players: [
        { row: 4, col: 2, label: 'Ad', type: 'player', tone: 'adora' },
        { row: 2, col: 2, label: 'Da', type: 'player', tone: 'dario' },
        { row: 6, col: 2, label: 'Ka', type: 'player', tone: 'karma' },
      ],
      enemies: [
        { row: 2, col: 12, label: '警', type: 'enemy' },
        { row: 4, col: 12, label: '警', type: 'enemy' },
        { row: 6, col: 12, label: '警', type: 'enemy' },
      ],
    },
    enemies: [
      {
        name: '刑警队员',
        icon: '👮',
        rank: '普通 / 等级 20',
        summary: 'HP 100 · SP 80（归零后失控 1 回合并 -1 步，再恢复至 80）',
        threat: 'enemy',
        skills: [
          { name: '被动：正义光环', detail: '每当敌方行动回合结束时，自身恢复 15 HP。' },
          { name: '捅（1 步）', detail: '前方 1 格突刺造成 5 点伤害 + 5 点 SP 伤害；拔出追加 5 点伤害 + 5 点 SP 伤害。出现概率 70%。' },
          { name: '枪击（1 步）', detail: '指定方位整排造成 10 点伤害与 5 点 SP 伤害。出现概率 65%。' },
          { name: '连续挥刀（2 步）', detail: '前方 1 格三段斩：5/10/10 点伤害，最后一段附加 10 点 SP 伤害。出现概率 50%。' },
        ],
      },
    ],
  },
  firstHeresy: {
    id: 'firstHeresy',
    name: '初见赫雷西',
    subtitle: '雾巷遭遇战',
    size: '12 × 15',
    narrative: [
      '根据张队提供的情报，三人组在雾蒙蒙的巷道中首次与赫雷西成员正面对峙。',
      '敌人以狂热信徒的姿态逐步逼近，空气中隐隐透出诡异的血腥味。',
    ],
    brief: [
      '地图 12×15 的狭长巷道，能见度低。',
      '掩体：巷道左侧 (2,5)(3,5)(4,5) 横列三格；中央 (7,5)-(9,5) 横列；右侧 (12,5)(13,5)(14,5) 横列三格。',
      '我方：Dario (7,11)、Adora (8,11)、Karma (9,11)。',
      '敌方：雏形赫雷西成员 3 名、法形赫雷西成员 2 名，从巷道深处压迫而来。',
    ],
    map: {
      rows: 12,
      cols: 15,
      voids: [],
      cover: [
        { row: 5, col: 2 },
        { row: 5, col: 3 },
        { row: 5, col: 4 },
        { row: 5, col: 7 },
        { row: 5, col: 8 },
        { row: 5, col: 9 },
        { row: 5, col: 12 },
        { row: 5, col: 13 },
        { row: 5, col: 14 },
      ],
      players: [
        { row: 11, col: 7, label: 'Da', type: 'player', tone: 'dario' },
        { row: 11, col: 8, label: 'Ad', type: 'player', tone: 'adora' },
        { row: 11, col: 9, label: 'Ka', type: 'player', tone: 'karma' },
      ],
      enemies: [
        { row: 2, col: 3, label: '法', type: 'enemy' },
        { row: 2, col: 13, label: '法', type: 'enemy' },
        { row: 2, col: 8, label: '雏', type: 'enemy' },
        { row: 3, col: 7, label: '雏', type: 'enemy' },
        { row: 3, col: 9, label: '雏', type: 'enemy' },
      ],
    },
    enemies: [
      {
        name: '雏形赫雷西成员',
        icon: '🩸',
        rank: '普通 / 等级 25',
        summary: 'HP 150 · SP 70（降至 0：失控 1 回合、-1 步，结束时恢复至 70，眩晕期间所受伤害 ×2）',
        threat: 'enemy',
        skills: [
          { name: '被动：忠臣的信仰', detail: '每回合开始回复 10 SP。' },
          { name: '被动：Gift', detail: '受到攻击时有 50% 几率将伤害减半。' },
          { name: '被动：强化身体', detail: '每次发动攻击伤害 +20%，每次受到伤害时伤害 -20%。' },
          { name: '被动：接受神的指示', detail: '对拥有“邪教目标”状态的角色将采取额外手段。' },
          { name: '干扰者死（1 步）', detail: '前方 1 格挥砍，造成 15 HP 与 15 SP，并附加 1 层流血；目标若带有“邪教目标”，再追加一次“干扰者死”。出现概率 80%。' },
          { name: '追上（2 步）', detail: '选择周围 3 格之一瞬移并消耗自身 5 SP；若 3×3 范围内敌方存在“邪教目标”，额外回复自身 10 HP 与 5 SP。出现概率 40%。' },
          { name: '献祭（2 步）', detail: '牺牲自身 20 HP，获得 1 层暴力，并为距离最近的敌方角色施加 1 层“邪教目标”。出现概率 25%。' },
          { name: '讨回公道！（3 步）', detail: '牺牲自身 35 HP，向前 2 格连抓 4 次，每次造成 10 HP 与 5 SP 并叠 1 层流血；若目标拥有“邪教目标”，再追击一次该技能。出现概率 10%。' },
        ],
      },
      {
        name: '法形赫雷西成员',
        icon: '🕯️',
        rank: '普通 / 等级 25',
        summary: 'HP 100 · SP 90（降至 0：失控 1 回合、-1 步，结束时恢复至 90，眩晕期间所受伤害 ×2）',
        threat: 'enemy',
        skills: [
          { name: '被动：忠臣的信仰', detail: '每回合开始回复 10 SP。' },
          { name: '被动：Gift', detail: '受到攻击时有 50% 几率将伤害减半。' },
          { name: '被动：强化身体', detail: '每次发动攻击伤害 +20%，每次受到伤害时伤害 -20%。' },
          { name: '被动：接受神的指示', detail: '对拥有“邪教目标”状态的角色将采取额外手段。' },
          { name: '魔音影响（1 步）', detail: '以自身为中心 5×5 范围内所有敌方单位减少 5 HP 与 25 SP，并叠加 1 层怨念；若范围内存在“邪教目标”，同范围所有友军回复 15 HP 与 15 SP。出现概率 80%。' },
          { name: '追上（2 步）', detail: '选择周围 3 格之一瞬移并消耗自身 5 SP；若 3×3 范围内敌方存在“邪教目标”，额外回复自身 10 HP 与 5 SP。出现概率 40%。' },
          { name: '献祭（2 步）', detail: '牺牲自身 20 HP，使任意友军获得 1 层暴力，并为距离最近的敌方角色施加 1 层“邪教目标”。出现概率 25%。' },
          { name: '毫无尊严（3 步）', detail: '牺牲自身 35 HP，以自身为中心 5×5 范围所有敌方单位减少 25 SP 并施加 1 层一级脆弱（当回合受到伤害 +15%，回合结束 -1 层）；若命中“邪教目标”，同范围所有友军回复 15 HP 与 15 SP。出现概率 10%。' },
        ],
      },
    ],
  },
  abandonedAnimals: {
    id: 'abandonedAnimals',
    name: '被遗弃的动物',
    subtitle: 'Velmira Boss 战',
    size: '未知',
    narrative: [
      '被遗弃的动物等待着挑战者的到来。',
    ],
    brief: [
      '点击"进入关卡"直接进入 Velmira Boss 战。',
    ],
    map: {
      rows: 1,
      cols: 1,
      voids: [],
      cover: [],
      players: [],
      enemies: [],
    },
    enemies: [
      {
        name: 'Velmira',
        icon: '🐺',
        rank: 'Boss',
        summary: '神秘的Boss',
        threat: 'boss',
        skills: [
          { name: '???', detail: '未知技能' },
        ],
      },
    ],
  },
  fatigue: {
    id: 'fatigue',
    name: '疲惫的极限',
    subtitle: '赫雷西第六干部残像',
    size: '10 × 20',
    narrative: [
      '面对赫雷西第六干部 Khathia 的变身体，团队将体验高压的 Boss 对决。',
    ],
    brief: [
      '地图 10×20 的废弃广场，地形开阔。',
      '三人组沿左侧列纵向站位：Dario（第 2 行）、Adora（第 4 行）、Karma（第 6 行）。',
      'Khathia：位于场地中央靠右位置，占据 2×2 区域，与 Adora 正面对峙。',
      '该 Boss 拥有极强的范围攻击与恢复能力。',
    ],
    map: {
      rows: 10,
      cols: 20,
      voids: [],
      cover: [],
      players: [
        { row: 4, col: 2, label: 'Ad', type: 'player', tone: 'adora' },
        { row: 2, col: 2, label: 'Da', type: 'player', tone: 'dario' },
        { row: 6, col: 2, label: 'Ka', type: 'player', tone: 'karma' },
      ],
      enemies: [
        { row: 4, col: 15, label: 'Kh', type: 'boss' },
        { row: 4, col: 16, label: 'Kh', type: 'boss' },
        { row: 5, col: 15, label: 'Kh', type: 'boss' },
        { row: 5, col: 16, label: 'Kh', type: 'boss' },
      ],
    },
    enemies: [
      {
        name: 'Khathia · 赫雷西第六干部（变身）',
        icon: '💀',
        rank: 'Boss / 等级 35',
        summary: 'HP 500 · SP 0（降至 -100：失控 1 回合、-1 步，并重置为 0）',
        threat: 'boss',
        skills: [
          { name: '被动：老干部', detail: '每次命中敌人回复 2 点 SP。' },
          { name: '被动：变态躯体', detail: '所有伤害 ×0.75，并有 15% 几率完全免疫一次伤害。' },
          { name: '被动：疲劳的躯体', detail: '每 5 回合减少 2 步。' },
          { name: '被动：糟糕的最初设计', detail: '每回合最多移动 3 格。' },
          { name: '血肉之刃（1 步）', detail: '对前方 2×1 区域横斩，造成 15 点伤害。出现概率 70%。' },
          { name: '怨念之爪（1 步）', detail: '对前方 2×2 区域抓击，造成 10 点伤害与 -5 SP。出现概率 70%。' },
          { name: '横扫（2 步）', detail: '前方 4×2 横斩，造成 20 点伤害。出现概率 60%。' },
          { name: '痛苦咆哮（2 步）', detail: '恢复全部 SP。出现概率 35%。' },
          { name: '过多疲劳患者最终的挣扎（3 步）', detail: '360° 全范围（9×9）造成 50 点伤害与 70 SP 伤害。出现概率 15%。' },
        ],
      },
    ],
  },
  bloodTowerPlan: {
    id: 'bloodTowerPlan',
    name: '血楼计划',
    subtitle: '赫雷西成员的血色试炼',
    size: '18 × 26',
    narrative: [
      '深入赫雷西教团的核心地带，团队面临着一场精心设计的血色试炼。',
      '层层突破可摧毁墙体，每破一道防线便会释放更强的敌人与血雾侵蚀。',
      '在这充满怨念与牺牲的塔楼中，最终将面对赫雷西成员B——一位值得敬重的敌人。',
    ],
    brief: [
      '地图 18×26，关卡内含多个空缺区域与可摧毁墙体。',
      '三人组：Dario (16,23)、Adora (16,24)、Karma (16,25)，等级 25。',
      '敌方：多波次赫雷西成员，包括雏形、法形、刺形与精英成员。',
      'Boss：组装型进阶赫雷西成员（赫雷西成员B），拥有强大的支援与召唤能力。',
      '特殊机制：摧毁墙体后会产生血雾区域，造成持续伤害；恢复格子可一次性恢复全部 HP/SP 并叠加鸡血。',
    ],
    map: {
      rows: 18,
      cols: 26,
      voids: [],
      cover: [],
      players: [
        { row: 23, col: 16, label: 'Da', type: 'player', tone: 'dario' },
        { row: 24, col: 16, label: 'Ad', type: 'player', tone: 'adora' },
        { row: 25, col: 16, label: 'Ka', type: 'player', tone: 'karma' },
      ],
      enemies: [
        { row: 23, col: 3, label: '雏', type: 'enemy' },
        { row: 25, col: 3, label: '雏', type: 'enemy' },
        { row: 24, col: 5, label: '法', type: 'enemy' },
        { row: 24, col: 18, label: '刺', type: 'enemy' },
      ],
    },
    enemies: [
      {
        name: '雏形赫雷西成员',
        icon: '🩸',
        rank: '普通 / 等级 25',
        summary: 'HP 150 · SP 70（降至 0：失控 1 回合、-1 步，结束时恢复至 70，眩晕期间所受伤害 ×2）',
        threat: 'enemy',
        skills: [
          { name: '被动：忠臣的信仰', detail: '每回合开始回复 10 SP。' },
          { name: '被动：Gift', detail: '受到攻击时有 50% 几率将伤害减半。' },
          { name: '被动：强化身体', detail: '每次发动攻击伤害 +20%，每次受到伤害时伤害 -20%。' },
          { name: '被动：接受神的指示', detail: '对拥有"邪教目标"状态的角色将采取额外手段。' },
          { name: '干扰者死（1 步）', detail: '前方 1 格挥砍，造成 15 HP 与 15 SP，并附加 1 层流血；目标若带有"邪教目标"，再追加一次"干扰者死"。出现概率 80%。' },
          { name: '追上（2 步）', detail: '选择周围 3 格之一瞬移并消耗自身 5 SP；若 3×3 范围内敌方存在"邪教目标"，额外回复自身 10 HP 与 5 SP。出现概率 40%。' },
          { name: '献祭（2 步）', detail: '牺牲自身 20 HP，获得 1 层暴力，并为距离最近的敌方角色施加 1 层"邪教目标"。出现概率 25%。' },
          { name: '讨回公道！（3 步）', detail: '牺牲自身 35 HP，向前 2 格连抓 4 次，每次造成 10 HP 与 5 SP 并叠 1 层流血；若目标拥有"邪教目标"，再追击一次该技能。出现概率 10%。' },
        ],
      },
      {
        name: '法形赫雷西成员',
        icon: '🕯️',
        rank: '普通 / 等级 25',
        summary: 'HP 100 · SP 90（降至 0：失控 1 回合、-1 步，结束时恢复至 90，眩晕期间所受伤害 ×2）',
        threat: 'enemy',
        skills: [
          { name: '被动：忠臣的信仰', detail: '每回合开始回复 10 SP。' },
          { name: '被动：Gift', detail: '受到攻击时有 50% 几率将伤害减半。' },
          { name: '被动：强化身体', detail: '每次发动攻击伤害 +20%，每次受到伤害时伤害 -20%。' },
          { name: '被动：接受神的指示', detail: '对拥有"邪教目标"状态的角色将采取额外手段。' },
          { name: '魔音影响（1 步）', detail: '以自身为中心 5×5 范围内所有敌方单位减少 5 HP 与 25 SP，并叠加 1 层怨念；若范围内存在"邪教目标"，同范围所有友军回复 15 HP 与 15 SP。出现概率 80%。' },
          { name: '追上（2 步）', detail: '选择周围 3 格之一瞬移并消耗自身 5 SP；若 3×3 范围内敌方存在"邪教目标"，额外回复自身 10 HP 与 5 SP。出现概率 40%。' },
          { name: '献祭（2 步）', detail: '牺牲自身 20 HP，使任意友军获得 1 层暴力，并为距离最近的敌方角色施加 1 层"邪教目标"。出现概率 25%。' },
          { name: '毫无尊严（3 步）', detail: '牺牲自身 35 HP，以自身为中心 5×5 范围所有敌方单位减少 25 SP 并施加 1 层一级脆弱（当回合受到伤害 +15%，回合结束 -1 层）；若命中"邪教目标"，同范围所有友军回复 15 HP 与 15 SP。出现概率 10%。' },
        ],
      },
      {
        name: '刺形赫雷西成员',
        icon: '🗡️',
        rank: '普通 / 等级 25',
        summary: 'HP 50 · SP 100（降至 0：失控 1 回合、-1 步，结束时恢复至 100，眩晕期间所受伤害 ×2）',
        threat: 'enemy',
        skills: [
          { name: '被动：忠臣的信仰', detail: '每回合开始回复 10 SP。' },
          { name: '被动：隐Gift', detail: '一开始就隐身（无法看到此单位或点击，移动时镜头不会跟随此单位除非隐身被解除），诺造成伤害或受到伤害则解除隐身，诺3回合未受到伤害或造成伤害则重新隐身。' },
          { name: '被动：刺形三角', detail: '无视所有减伤机制或防御。' },
          { name: '被动：接受神的指示', detail: '对拥有"邪教目标"状态的角色将采取额外手段。' },
          { name: '割喉（2步）', detail: '对前方一格的敌方单位划动匕首造成20Hp以及5Sp（如果攻击对象有"邪教目标"此技能攻击上升25%）。出现概率 80%。' },
          { name: '暗袭（2步）', detail: '以自己为中心5×5以内可选择任何格子并移动（如果在相邻内里有任何一个敌方单位有"邪教目标"，则选择最近的有"邪教目标"敌方单位并追击一次割喉）。出现概率 50%。' },
          { name: '献祭（2步）', detail: '牺牲自己10Hp给自己增加一层灵活Buff，以及给离此单位最接近的敌方单位上一层"邪教目标"。出现概率 25%。' },
          { name: '血溅当场（3步）', detail: '牺牲自己30Hp并用匕首插进前方一格的敌方单位的胸口造成45Hp（如果目标有"邪教目标"，则伤害额外增加10Hp 5Sp 以及给自己上一层灵活Buff）。出现概率 15%。' },
        ],
      },
      {
        name: '赫雷西初代精英成员',
        icon: '⚔️',
        rank: '精英 / 等级 25',
        summary: 'HP 200 · SP 50（降至 0：失控 1 回合、-1 步，结束时恢复至 50，眩晕期间所受伤害 ×2；需叠2层眩晕层数触发眩晕）',
        threat: 'elite',
        skills: [
          { name: '被动：忠臣的信仰', detail: '每回合开始回复 10 SP。' },
          { name: '被动：如果存活在场的话，每回合额外获得一步', detail: '额外行动能力。' },
          { name: '被动：血污蔓延', detail: '攻击到的格子会变成"血污格子"（在此类格子内的敌方单位受到5Hp 5Sp以及叠一层流血）状态持续2回合。' },
          { name: '被动：接受神的指示', detail: '对拥有"邪教目标"状态的角色将采取额外手段。' },
          { name: '异臂（2步）', detail: '向前方2格的所有敌方单位挥舞异变手臂造成15Hp 5Sp以及一层流血（如果攻击对象有"邪教目标"则给自己上一层暴力）。出现概率 80%。' },
          { name: '重锤（2步）', detail: '以自己为中心5×5进行重锤，对所有敌方单位造成20Hp 5Sp 以及一层流血（如果在此攻击范围内有自少2个敌方单位有"邪教目标"，则给所有在此攻击范围内的敌方单位上一层一级脆弱Debuff）。出现概率 50%。' },
          { name: '献祭（2步）', detail: '牺牲自己10Hp给自己增加一层暴力，以及给离此单位最接近的敌方单位上一层"邪教目标"。出现概率 25%。' },
          { name: '爆锤（多阶段攻击）（3步）', detail: '牺牲自己30Hp并开始用力砸以自己为中心3×3对所有敌方单位造成15Hp 上一层流血，再以自己为中心3×3砸地对所有敌方单位造成15Hp 5Sp，最后蓄力用力一大砸以自己为中心5×5所有敌方单位造成20Hp 5Sp 以及一层流血（如果击中目标有"邪教目标"，给自己上一层暴力buff）。出现概率 15%。' },
        ],
      },
      {
        name: '组装型进阶赫雷西成员（赫雷西成员B）',
        icon: '👹',
        rank: '小Boss / 等级 25',
        summary: 'HP 250 · SP 90（降至 0：失控 1 回合、-1 步，结束时恢复至 90；嗜血之握只造成80 HP；需叠3层眩晕层数触发眩晕）',
        threat: 'miniboss',
        skills: [
          { name: '被动：忠臣的信仰', detail: '每回合开始回复 15 SP。' },
          { name: '被动：如果存活在场的话，每回合额外获得一步', detail: '额外行动能力。' },
          { name: '被动：安抚灵魂', detail: '如果有友方单位在自身7×7格子范围内的话回复5%的血量以及5点sp。' },
          { name: '被动：传递神的指示', detail: '每次攻击都有35%的几率给敌方单位上"邪教目标"。' },
          { name: '以神明之名："祝福"（2步）', detail: '7×7格子内所有友方成员获得一层暴力Buff（如果场上有自少1个除自己以外的友方单位才会使用）。出现概率 40%。' },
          { name: '以神明之名："关怀"（2步）', detail: '7×7格子内所有友方成员（包括自己）恢复25Hp以及10Sp（如果场上有自少1个除自己以外的友方单位才会使用）。出现概率 40%。' },
          { name: '以神明之名："自由"（3步）', detail: '清除7×7格子内所有友方成员的所有负面效果/Debuff（如果场上有自少1个除自己以外的友方单位有负面效果/Debuff才会使用）。出现概率 40%。' },
          { name: '协助我们！（3步）', detail: '在离自己最近的空格子里生成一个"雏形赫雷西成员"。出现概率 40%。' },
          { name: '辅助我们！（3步）', detail: '在离自己最近的空格子里生成一个"法形赫雷西成员"。出现概率 40%。' },
          { name: '暗杀令（2步）', detail: '在离自己最近的空格子里生成一个半血"刺形赫雷西成员"。出现概率 40%。' },
          { name: '以神明之名："清除"（2步）', detail: '对面前3×3的格子里所有敌方单位造成15Hp以及15Sp并引爆场上所有敌方单位身上的所有"邪教目标"（每层"邪教目标"10Hp10Sp）。出现概率 60%。' },
        ],
      },
    ],
  },
  sevenSeas: {
    id: 'sevenSeas',
    name: '七海',
    subtitle: '七海作战队遭遇战',
    size: '18 × 25（右下角 8×10 空缺）',
    narrative: [
      '夜幕低垂，海风裹挟着血腥味，刑警队长指引三人组前往七海作战队所在的废弃码头。',
      '在破败铁轨间，Haz 与队员们现身。气氛骤然紧绷，谈判破裂之际，七海作战队全员戴上面具、摆开战阵。',
      'Haz 的仇恨和嗜杀在风暴中升腾，七海作战队准备动用禁忌武器。',
    ],
    brief: [
      '地图 18×25，右下角 8×10 区域为空缺海水区。',
      '掩体：左上 (3,13)~(5,15) 3×3；右上 (9,13)~(11,15) 3×3；左下 (3,3)~(5,5) 3×3。',
      '我方：Adora (3,2)、Karma (5,2)、Dario (7,2)。',
      '敌方：Haz (21,15)、Tusk (19-20,12-13 占 2×2)、Katz (19,16)、Neyla (15,17)、Kyn (15,12)。',
      '全员附带“作战余波”Debuff（-25% HP，上限伤害 -5）。',
    ],
    map: (() => {
      const rows = 18;
      const offsetX = 5;
      const cols = 22 + offsetX;

      const convert = (x, y) => ({
        row: rows - y + 1,
        col: x + offsetX,
      });

      const voids = new Set();
      for (let x = 15; x <= 22; x += 1) {
        for (let y = 1; y <= 10; y += 1) {
          const cell = convert(x, y);
          voids.add(`${cell.row}-${cell.col}`);
        }
      }

      const cover = [];
      const pushRect = (x1, y1, x2, y2) => {
        for (let x = x1; x <= x2; x += 1) {
          for (let y = y1; y <= y2; y += 1) {
            const cell = convert(x, y);
            cover.push(cell);
          }
        }
      };
      // === Cover layout updated to match reference image ===
// Top-left block 4×3
pushRect(2, 13, 5, 15);
// Top-mid-right block 4×3
pushRect(9, 13, 11, 15);
// Bottom-left L shape: 3×3 square + one extra tile at (3,2)
pushRect(3, 4, 5, 6);

      const players = [
        { ...convert(3, 2), label: 'Ad', type: 'player', tone: 'adora' },
        { ...convert(5, 2), label: 'Ka', type: 'player', tone: 'karma' },
        { ...convert(7, 2), label: 'Da', type: 'player', tone: 'dario' },
      ];

      const enemies = [
        { ...convert(21, 15), label: 'Haz', type: 'boss' },
        { ...convert(19, 13), label: 'Tu', type: 'miniboss' },
        { ...convert(19, 12), label: 'Tu', type: 'miniboss' },
        { ...convert(20, 12), label: 'Tu', type: 'miniboss' },
        { ...convert(20, 13), label: 'Tu', type: 'miniboss' },
        { ...convert(19, 16), label: 'Ka', type: 'miniboss' },
        { ...convert(15, 17), label: 'Ne', type: 'elite' },
        { ...convert(15, 12), label: 'Ky', type: 'elite' },
      ];

      return {
        rows,
        cols,
        voids,
        cover,
        players,
        enemies,
      };
    })(),
    enemies: [
      {
        name: 'Haz（哈兹）',
        icon: '⚓',
        rank: '七海作战队队长 / Boss / 等级 55',
        summary: 'HP 750 · SP 100（归零：失控 1 回合、-1 步，并回复 5% HP + SP 满）',
        threat: 'boss',
        skills: [
          { name: '被动：弑神执念', detail: 'HP < 50% 时伤害 +30%。' },
          { name: '被动：难以抑制的仇恨', detail: '每次攻击 40% 概率 -5 SP 并施加恐惧。' },
          { name: '被动：队员们听令！', detail: '偶数回合开始自身 +10 SP，队员 +5 SP。' },
          { name: '被动：一切牺牲都是值得的……', detail: '20 回合后所有队员获得“队长的压迫”Debuff，解锁禁忌技能。' },
          { name: '被动：他们不是主菜！', detail: '前 15 回合全队获得 30% 暴击增伤。' },
          { name: '被动：把他们追杀到天涯海角！', detail: '被命中首个敌方单位获得猎杀标记，全队对其伤害 +15%。' },
          { name: '被动：力挽狂澜', detail: '仅剩 Haz 时：伤害 +10%、受伤 -10%，并新增怨念技能组。' },
          { name: '鱼叉穿刺（1 步）', detail: '向前刺击 1 格，造成 20 点伤害并回复 10 SP。出现概率 70%。' },
          { name: '深海猎杀（2 步）', detail: '鱼叉链条命中前方 3 格内目标并拉近，造成 25 点伤害与 -10 SP。出现概率 60%。' },
          { name: '猎神之叉（2 步）', detail: '瞬移至 5×5 内的敌人身旁刺击，造成 20 点伤害（50%×2.0）、15 SP 伤害并附加流血。出现概率 65%。' },
          { name: '锁链缠绕（2 步）', detail: '2 回合内减免 40% 伤害，下次攻击者受到 10 SP 伤害，全队 +5 SP。出现概率 50%。' },
          { name: '鲸落（4 步）', detail: '以自身为中心 5×5 砸击，造成 50 点伤害与 20 SP 伤害，并令目标下回合 -1 步。出现概率 15%。' },
          { name: '怨念滋生（1 步）', detail: '（力挽狂澜后）对所有带猎杀标记目标施加 1 层流血与恐惧。出现概率 33%。' },
          { name: '付出代价（2 步）', detail: '（力挽狂澜后）前推三段连击：3 格穿刺 15 伤害、4 格穿刺 15+5 SP、2×3 横扫 15 伤害并附加 Haz 流血。出现概率 33%。' },
          { name: '仇恨之叉（2 步）', detail: '（力挽狂澜后）前方 2×3 横扫 15 伤害+10 SP，随后 5×5 震地造成 20 伤害并附 Haz 流血（每回合 -3% HP，持续 2 大回合）。出现概率 33%。' },
        ],
      },
      {
        name: 'Katz（卡兹）',
        icon: '💣',
        rank: '伤害代表 / 小 Boss / 等级 53',
        summary: 'HP 500 · SP 75（归零：失控 1 回合、-1 步，之后自动恢复至 75）',
        threat: 'miniboss',
        skills: [
          { name: '被动：隐秘迷恋', detail: 'Haz 在场时伤害 +20%，每回合额外 +5 SP。' },
          { name: '被动：恐怖执行力', detail: '回合内命中 ≥2 次时追加矛刺，伤害 +30%。' },
          { name: '被动：女强人', detail: 'SP > 60 时伤害 +10%。' },
          { name: '矛刺（1 步）', detail: '前方 1 格 20 点伤害并自回复 5 SP。出现概率 70%（队长的压迫后停用）。' },
          { name: '链式鞭击（2 步）', detail: '前方 3 格鞭击 25 点伤害并令目标下回合 -1 步。出现概率 60%（压迫后停用）。' },
          { name: '反复鞭尸（3 步）', detail: '前方 3 格多段鞭打 10/15 伤害，回复 5 SP，按 SP 百分比最多重复 5 次。出现概率 50%（压迫后停用）。' },
          { name: '终焉礼炮（4 步）', detail: '投掷炸弹鱼叉，3×3 范围 60 伤害与 -15 SP，自身下回合 -1 步。出现概率 30%（压迫后停用）。' },
          { name: '必须抹杀一切……（2 步）', detail: '（压迫后）前方 3 格两段鞭击 20/30 伤害，各消耗自身 5 HP，按 SP 百分比最多重复 5 次并回复 5 SP。' },
        ],
      },
      {
        name: 'Tusk（塔斯克）',
        icon: '🛡️',
        rank: '防御代表 / 小 Boss / 等级 54',
        summary: 'HP 1000 · SP 60（归零：失控 1 回合、-1 步，之后自动恢复至 60）',
        threat: 'miniboss',
        skills: [
          { name: '被动：家人的守护', detail: 'Haz 受伤时转移伤害至自身并免疫其中 50%。' },
          { name: '被动：铁壁如山', detail: '所有伤害降低 30%。' },
          { name: '被动：猛牛之力', detail: '每次受伤，下次攻击 +5 伤害，可叠加。' },
          { name: '骨盾猛击（1 步）', detail: '前方 1 格 10 伤害并击退 1 格。出现概率 70%（压迫后停用）。' },
          { name: '来自深海的咆哮（2 步）', detail: '周围 3×3 敌人 -20 SP，自身额外减伤 20%。出现概率 60%（压迫后停用）。' },
          { name: '牛鲨冲撞（2 步）', detail: '向前 2×3 冲锋，沿途 25 伤害并眩晕 1 回合。出现概率 50%（压迫后停用）。' },
          { name: '战争堡垒（3 步）', detail: '3 回合内防御姿态，减伤 50%、每回合 +10 SP，并令 Haz 伤害 +15%。出现概率 30%（压迫后停用）。' },
          { name: '拼尽全力保卫队长……（2 步）', detail: '（压迫后）3 回合反伤姿态：减伤 25%、反弹 25% 伤害，每回合 +10 SP，Haz 恢复 15% HP 与 15 SP 并伤害 +15%。' },
        ],
      },
      {
        name: 'Neyla（尼拉）',
        icon: '🎯',
        rank: '远程狙击手 / 精英 / 等级 52',
        summary: 'HP 350 · SP 80（归零：失控 1 回合、-1 步，之后自动恢复至 80）',
        threat: 'elite',
        skills: [
          { name: '被动：精确瞄准', detail: '回合内未移动时伤害 +50%。' },
          { name: '被动：冷血执行者', detail: '目标 HP < 50% 时造成双倍伤害。' },
          { name: '被动：神速装填', detail: '每 3 回合额外回复 10 SP。' },
          { name: '迅捷射击（1 步）', detail: '4 格内 15 伤害并 -5 SP。出现概率 70%（压迫后停用）。' },
          { name: '穿刺狙击（2 步）', detail: '直线 6 格 30 伤害并附流血（-5% HP，2 回合）。出现概率 60%（压迫后停用）。' },
          { name: '双钩牵制（2 步）', detail: '前方 4 格 15 伤害并令目标下回合 -2 步。出现概率 50%（压迫后停用）。' },
          { name: '终末之影（三步）', detail: '全场任意目标 50 伤害 + 20 SP 伤害，自身下回合 -1 步。出现概率 30%（压迫后每回合必定出现一次）。' },
          { name: '执行……（2 步）', detail: '前方整排双段鱼叉，各 20 伤害（目标 HP <15% 直接处决），自身消耗 30 HP 与 40 SP。压迫后出现。' },
        ],
      },
      {
        name: 'Kyn（金）',
        icon: '🗡️',
        rank: '刺客 / 精英 / 等级 51',
        summary: 'HP 250 · SP 70（归零：失控 1 回合、-1 步，之后自动恢复至 70）',
        threat: 'elite',
        skills: [
          { name: '被动：打道回府', detail: '击杀敌人后下回合开始瞬移回 Haz 身边。' },
          { name: '被动：无情暗杀', detail: '敌人 HP < 25% 时直接斩杀。' },
          { name: '被动：迅捷如风', detail: '回合开始自动回复 5 SP。' },
          { name: '迅影突刺（1 步）', detail: '瞬移至 5×5 内敌人侧旁，造成 20 伤害。出现概率 70%（压迫后停用）。' },
          { name: '割喉飞刃（2 步）', detail: '直线 3 格投掷，造成 25 伤害 + 5 SP 伤害。出现概率 60%（压迫后停用）。' },
          { name: '影杀之舞（2 步）', detail: '周围 3×3 范围 30 伤害并额外免费移动 1 格。出现概率 50%（压迫后停用）。' },
          { name: '死亡宣告（3 步）', detail: '单体 50 伤害 + 30 SP，目标 HP < 30% 直接斩杀。出现概率 30%（压迫后停用）。' },
          { name: '自我了断……（2 步）', detail: '（压迫后）瞬移至 5×5 内敌人并秒杀，自己消耗全部 HP。' },
        ],
      },
    ],
  },
  oldLove: {
    id: 'oldLove',
    name: '旧情未了',
    subtitle: '利拉斯-赫雷西第五干部',
    size: '9 × 26',
    narrative: [
      '根据七海作战队的战斗关卡制作。',
      '在这场充满粉紫色光芒的战斗中，面对的是赫雷西第五干部——利拉斯。',
      '一个被过去所困扰的灵魂，一段未完的情感纠葛。',
    ],
    brief: [
      '地图 9×26 的狭长战场。',
      'Lirathe（5,5）vs Karma（5,22）',
      '第2回合时，Adora和Dario的虚影将会出现在Karma左右。',
      'Boss拥有两个阶段，第二阶段会出现意识花苞和特殊机制。',
    ],
    map: {
      rows: 9,
      cols: 26,
      voids: [],
      cover: [],
      players: [
        { row: 5, col: 22, label: 'Ka', type: 'player', tone: 'karma' },
      ],
      enemies: [
        { row: 5, col: 5, label: 'Li', type: 'boss' },
      ],
    },
    enemies: [
      {
        name: 'Lirathe/利拉斯-赫雷西第五干部（变身前）',
        icon: '🌸',
        rank: 'Boss / 等级 50',
        summary: 'HP 700 · SP 80（归零：失控 1 回合、-1 步，造成20点真实伤害，SP恢复至75）',
        threat: 'boss',
        skills: [
          { name: '被动：舞女梦', detail: '受到攻击时有30%闪避掉此攻击并移动向离自己最近的空格子。' },
          { name: '被动：刺痛的心', detail: '每次收到来自Karma的伤害都有25%提高0.25%。' },
          { name: '被动：迅速敏捷', detail: '如果此回合该单位移动了至少3格则增加一层灵活Buff。' },
          { name: '被动：重获新生', detail: '每次攻击有5%追击一次该攻击。' },
          { name: '被动：真的好不甘心', detail: '血量到了50%或以下增加45%的伤害以及解锁一些技能。' },
          { name: '刺斩（1步）', detail: '往任何方向冲刺4格，给冲过的最后一个敌方单位造成15HP以及一层一级脆弱Debuff。出现概率 80%。' },
          { name: '又想逃？（2步）', detail: '移动到周围任意2格，如果四周有任何敌方单位则对其造成5HP。出现概率 40%。' },
          { name: '刀光吸入（2步）', detail: '朝前方3x2格横扫一刀造成20伤害并上一层刀光（刀光到10层自动爆炸）。出现概率 40%。' },
          { name: '剑舞（多阶段攻击）（3步）', detail: '多段范围攻击，造成大量伤害和刀光。出现概率 25%。' },
        ],
      },
      {
        name: 'Lirathe/利拉斯-赫雷西第五干部（变身后）',
        icon: '🕷️',
        rank: 'Boss / 等级 50',
        summary: 'HP 1200 · SP 0（降至 -80：失控 1 回合、-1 步，SP恢复至-10）',
        threat: 'boss',
        skills: [
          { name: '被动：攀爬', detail: '如果碰到墙壁则爬上屋顶进入"高处"状态，该状态无法被攻击到。' },
          { name: '被动：退去凡躯', detail: '每次收到的伤害减25%以及每次收到伤害有20%可能性回5HP，失去普通移动能力。' },
          { name: '被动：丧失理智', detail: '每次攻击都有可能提高25%的伤害，但是一旦提高了伤害自损25HP以及10SP。' },
          { name: '被动：一片黑暗', detail: '变身后的Lirathe失去了视力，攻击没有目标乱释放，但听觉极其敏感。' },
          { name: '冲杀（2步）', detail: '向前冲刺到底并对被撞到的所有敌方单位造成20HP以及10SP。出现概率 75%。' },
          { name: '你在哪（2步）', detail: '以自己为中心对6x6格的所有敌方单位吼叫造成10SP与一层腐蚀。出现概率 30%。' },
          { name: '掏心掏肺（多阶段攻击）（2步）', detail: '对前方2x2格子里的单位反复撕扯造成大量伤害。出现概率 25%。' },
        ],
      },
      {
        name: '意识花苞',
        icon: '🌺',
        rank: '普通单位 / 等级 50',
        summary: 'HP 150 · 无法移动',
        threat: 'enemy',
        skills: [
          { name: '被动：恢复', detail: '如果3回合以内没有受到伤害则恢复20HP。' },
          { name: '被动：根深蒂固', detail: '无法移动。' },
          { name: '抵抗（1步）', detail: '向前3格刺去造成15HP以及5SP。' },
        ],
      },
    ],
  },
};

const stageStories = {
  intro: [
    { type: 'narration', text: '剧情缓缓展开……', background: 'Home.png', audio: 'Intro 1.mp3', audioAction: 'play' },
    { speaker: 'Karma', text: '。。。。。', portrait: 'KarmaSpeachless.png', position: 'right', characters: { Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Dario', text: '所以你们怎么想？', portrait: 'DarioNorms.png', position: 'left', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Dario', text: '在灰色偏黑色的产业里走久了还是被抓到把柄了，但是那刑警队队长也奇怪，说什么让我们协助他们把赫尔希教团灭了就算将功补过。。。。', portrait: 'DarioNorms.png', position: 'left', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Adora', text: '都叫你们别搞这些乱七八糟的啦。。。咱家又不是没钱，那需要去冒险犯法捞钱啊？', portrait: 'AdoraAnnoyed.png', position: 'center', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Adora', text: '还连累了我们那么多兄弟们。。。。', portrait: 'AdoraAnnoyed.png', position: 'center', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Karma', text: '哎呀，我们搞这些不就是寻求刺激吗，谁在乎钱啊？', portrait: 'KarmaSmile.png', position: 'right', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaSmile.png', position: 'right' } } },
    { speaker: 'Adora', text: '对对对，现在刺激了，如何呢。', portrait: 'AdoraBadSmile.png', position: 'center', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraBadSmile.png', position: 'center' }, Karma: { portrait: 'KarmaSmile.png', position: 'right' } } },
    { speaker: 'Dario', text: '诶诶，先回到正题。', portrait: 'DarioNorms.png', position: 'left', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraBadSmile.png', position: 'center' }, Karma: { portrait: 'KarmaSmile.png', position: 'right' } } },
    { speaker: 'Dario', text: '你们怎么想的？', portrait: 'DarioNorms.png', position: 'left', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraBadSmile.png', position: 'center' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Karma', text: '还怎么想，跟那群当官的狗拼了呗！', portrait: 'KarmaYell.png', position: 'right', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraBadSmile.png', position: 'center' }, Karma: { portrait: 'KarmaYell.png', position: 'right' } } },
    { speaker: 'Adora', text: '。。。', portrait: 'AdoraAnnoyed.png', position: 'center', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaYell.png', position: 'right' } } },
    { speaker: 'Adora', text: '要我说还是配合他们吧。', portrait: 'AdoraTalk.png', position: 'center', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraTalk.png', position: 'center' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Adora', text: '我刚刚查了下，这教团可不是什么普通教团，而是货真价实的邪教组织，搞恐怖袭击那种。', portrait: 'AdoraTalk.png', position: 'center', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraTalk.png', position: 'center' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Adora', text: '如果这次不配合，以后哪怕政府放过我们，这教团也有极大可能性来找麻烦。。。。', portrait: 'AdoraAnnoyed.png', position: 'center', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { type: 'narration', text: 'Adora把手机给两人看\n手机里显示着赫尔希最近屠戮了整条街的普通民众，并且收集了所有的血液。' },
    { speaker: 'Karma', text: '。。。', portrait: 'KarmaScared.png', position: 'right', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaScared.png', position: 'right' } } },
    { speaker: 'Dario', text: '啊。。。', portrait: 'DarioScared.png', position: 'left', characters: { Dario: { portrait: 'DarioScared.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaScared.png', position: 'right' } } },
    { speaker: 'Adora', text: '看到了吧，这群可是真疯子。', portrait: 'AdoraTalk.png', position: 'center', characters: { Dario: { portrait: 'DarioScared.png', position: 'left' }, Adora: { portrait: 'AdoraTalk.png', position: 'center' }, Karma: { portrait: 'KarmaScared.png', position: 'right' } } },
    { speaker: 'Adora', text: '最好赶快处理了算了。', portrait: 'AdoraTalk.png', position: 'center', characters: { Dario: { portrait: 'DarioScared.png', position: 'left' }, Adora: { portrait: 'AdoraTalk.png', position: 'center' }, Karma: { portrait: 'KarmaScared.png', position: 'right' } } },
    { speaker: 'Adora', text: '还能在政府那刷刷好感度呢。', portrait: 'AdoraAnnoyed.png', position: 'center', characters: { Dario: { portrait: 'DarioScared.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaScared.png', position: 'right' } } },
    { speaker: 'Dario', text: '嗯嗯，小朵说的在理。。。', portrait: 'DarioThinking.png', position: 'left', characters: { Dario: { portrait: 'DarioThinking.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaScared.png', position: 'right' } } },
    { speaker: 'Dario', text: 'Karma你觉得呢？', portrait: 'DarioNorms.png', position: 'left', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Karma', text: '我还能说啥，干呗。', portrait: 'KarmaSmile.png', position: 'right', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaSmile.png', position: 'right' } } },
    { speaker: 'Dario', text: '行，我去联系下。', portrait: 'DarioNorms.png', position: 'left', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, Karma: { portrait: 'KarmaSmile.png', position: 'right' } } },
    { type: 'narration', text: '（通话）' },
    { speaker: 'Dario', text: '好了，他们叫我们先去他们那里做个测试。', portrait: 'DarioNorms.png', position: 'left', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { speaker: 'Karma', text: '咋地，瞧不起我们？', portrait: 'KarmaAnnoyed.png', position: 'right', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Karma: { portrait: 'KarmaAnnoyed.png', position: 'right' } } },
    { speaker: 'Karma', text: '我靠，之前火拼的时候他们可没有一次占到便宜了！', portrait: 'KarmaYell.png', position: 'right', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Karma: { portrait: 'KarmaYell.png', position: 'right' } } },
    { speaker: 'Adora', text: '哥。。就测试下而已。。。', portrait: 'AdoraWorried.png', position: 'center', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraWorried.png', position: 'center' }, Karma: { portrait: 'KarmaYell.png', position: 'right' } } },
    { speaker: 'Adora', text: '应该是看看我们具体实力。', portrait: 'AdoraTalk.png', position: 'center', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraTalk.png', position: 'center' }, Karma: { portrait: 'KarmaYell.png', position: 'right' } } },
    { speaker: 'Karma', text: '切', portrait: 'KarmaSpeachless.png', position: 'right', characters: { Dario: { portrait: 'DarioNorms.png', position: 'left' }, Adora: { portrait: 'AdoraTalk.png', position: 'center' }, Karma: { portrait: 'KarmaSpeachless.png', position: 'right' } } },
    { type: 'narration', text: '。。。。。' },
    { type: 'narration', text: '（转场）', audio: 'Intro 1.mp3', audioAction: 'stop' },
    { type: 'narration', text: '（刑警部门建筑）', background: 'PStation.png', audio: 'Intro Dialog.mp3', audioAction: 'play' },
    { speaker: 'Dario', text: '哎呦，张队，又见面了', portrait: 'DarioSmile.png', position: 'left', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, '张队': { portrait: 'Zhang.png', position: 'right' } } },
    { speaker: 'Dario', text: '难得看到张队脸上不带任何杀意呢，真是活久见了', portrait: 'DarioSmile.png', position: 'left', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, '张队': { portrait: 'Zhang.png', position: 'right' } } },
    { speaker: '张队', text: '。。。。好了，我们就直入主题吧。', portrait: 'Zhang.png', position: 'right', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, '张队': { portrait: 'Zhang.png', position: 'right' } } },
    { speaker: '张队', text: '我们目前只算是暂时合作关系，如果你们敢做任何小动作的话——', portrait: 'Zhang.png', position: 'right', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, '张队': { portrait: 'Zhang.png', position: 'right' } } },
    { type: 'narration', text: '*张队拉枪栓' },
    { speaker: '张队', text: '后果自负。', portrait: 'ZhangScary.png', position: 'right', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, '张队': { portrait: 'ZhangScary.png', position: 'right' } } },
    { speaker: 'Dario', text: '当然当然，哪敢啊～', portrait: 'DarioSmile.png', position: 'left', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, '张队': { portrait: 'ZhangScary.png', position: 'right' } } },
    { speaker: '张队', text: '。。。训练场在隔壁一栋楼，进去和门卫打声招呼后就能开始了。', portrait: 'Zhang.png', position: 'right', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, '张队': { portrait: 'Zhang.png', position: 'right' } } },
    { speaker: '张队', text: '哦对了，子弹使用的假弹，虽然不致命，但是还是很痛的。', portrait: 'Zhang.png', position: 'right', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, '张队': { portrait: 'Zhang.png', position: 'right' } } },
    { speaker: '张队', text: '保护好小朋友。', portrait: 'Zhang.png', position: 'right', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, '张队': { portrait: 'Zhang.png', position: 'right' } } },
    { speaker: 'Adora', text: '。。。。', portrait: 'AdoraAnnoyed.png', position: 'center', characters: { Dario: { portrait: 'DarioSmile.png', position: 'left' }, Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' }, '张队': { portrait: 'Zhang.png', position: 'right' } } },
    { type: 'narration', text: '（准备进入战斗）', audio: 'Intro Dialog.mp3', audioAction: 'stop' },
  ],
  firstHeresy: [
    {
      type: 'narration',
      text: '三人顺着张队提供的坐标，抵达一条偏僻又雾气缭绕的小巷入口。',
      background: '小巷.png',
      audio: 'Cult dialog.mp3',
      audioAction: 'play',
      characters: {
        Adora: { portrait: 'AdoraWorried.png', position: 'center' },
        Dario: { portrait: 'DarioThinking.png', position: 'left' },
        Karma: { portrait: 'KarmaAnnoyed.png', position: 'right' },
      },
    },
    {
      speaker: 'Adora',
      text: '如果没有错的话……应该就是这个巷子里了。',
      portrait: 'AdoraWorried.png',
      position: 'center',
      characters: {
        Adora: { portrait: 'AdoraWorried.png', position: 'center' },
        Dario: { portrait: 'DarioThinking.png', position: 'left' },
        Karma: { portrait: 'KarmaAnnoyed.png', position: 'right' },
      },
    },
    {
      speaker: 'Dario',
      text: '老张给的位置可信赖度还是很高的。',
      portrait: 'DarioThinking.png',
      position: 'left',
      characters: {
        Adora: { portrait: 'AdoraWorried.png', position: 'center' },
        Dario: { portrait: 'DarioThinking.png', position: 'left' },
        Karma: { portrait: 'KarmaAnnoyed.png', position: 'right' },
      },
    },
    {
      speaker: 'Karma',
      text: '切。',
      portrait: 'KarmaAnnoyed.png',
      position: 'right',
      characters: {
        Adora: { portrait: 'AdoraWorried.png', position: 'center' },
        Dario: { portrait: 'DarioThinking.png', position: 'left' },
        Karma: { portrait: 'KarmaAnnoyed.png', position: 'right' },
      },
    },
    {
      speaker: 'Adora',
      text: '等等……别吵，我好像听到脚步声了，而且不止一个。',
      portrait: 'AdoraAnnoyed.png',
      position: 'center',
      characters: {
        Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' },
        Dario: { portrait: 'DarioThinking.png', position: 'left' },
        Karma: { portrait: 'KarmaAnnoyed.png', position: 'right' },
      },
    },
    {
      type: 'narration',
      text: '雾气深处浮现出几道人影，穿着相似且沾染淡红的制服，正朝三人行来。',
    },
    {
      speaker: 'Karma',
      text: '我靠？这些人的形状——还算是人类吗。',
      portrait: 'KarmaScared.png',
      position: 'right',
      characters: {
        Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' },
        Dario: { portrait: 'DarioThinking.png', position: 'left' },
        Karma: { portrait: 'KarmaScared.png', position: 'right' },
      },
    },
    {
      speaker: '赫雷西成员A',
      text: '果然……神明赐予我的直觉果然没错……这里有干扰者。',
    },
    {
      speaker: 'Dario',
      text: '为、为什么要、要这么说话呢？',
      portrait: 'DarioScared.png',
      position: 'left',
      characters: {
        Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' },
        Dario: { portrait: 'DarioScared.png', position: 'left' },
        Karma: { portrait: 'KarmaScared.png', position: 'right' },
      },
    },
    {
      speaker: '赫雷西成员B',
      text: '各位，我们没有恶意，只是奉神指引迁来此地传教。',
    },
    {
      speaker: 'Adora',
      text: '好……的，我们也只是路过，同样也没有任何恶意。',
      portrait: 'AdoraTalk.png',
      position: 'center',
      characters: {
        Adora: { portrait: 'AdoraTalk.png', position: 'center' },
        Dario: { portrait: 'DarioScared.png', position: 'left' },
        Karma: { portrait: 'KarmaScared.png', position: 'right' },
      },
    },
    {
      speaker: '赫雷西成员A',
      text: '非也……神明赐予我的直觉告诉我……你们是传教的阻碍……是赫雷西的障碍……必须清除。',
    },
    {
      speaker: 'Dario',
      text: '喂喂～各位放松，就像我们朋友说的一样，只是路过。没必要害人又害己啊，对吧。',
      portrait: 'DarioSmile.png',
      position: 'left',
      characters: {
        Adora: { portrait: 'AdoraTalk.png', position: 'center' },
        Dario: { portrait: 'DarioSmile.png', position: 'left' },
        Karma: { portrait: 'KarmaScared.png', position: 'right' },
      },
    },
    {
      speaker: '赫雷西成员B',
      text: '放心，我们只是想发扬我们的信仰，但需要暂时借用你们的时间。',
    },
    {
      speaker: '赫雷西成员A',
      text: '无路可跑……',
    },
    {
      speaker: 'Karma',
      text: '他妈哪来那么多废话！要打就打！',
      portrait: 'KarmaYell.png',
      position: 'right',
      characters: {
        Adora: { portrait: 'AdoraAnnoyed.png', position: 'center' },
        Dario: { portrait: 'DarioSmile.png', position: 'left' },
        Karma: { portrait: 'KarmaYell.png', position: 'right' },
      },
    },
    {
      type: 'narration',
      text: '雾气凝滞，双方同时拔出武器，杀意在狭窄巷道内炸开。',
      audio: 'Cult dialog.mp3',
      audioAction: 'stop',
    },
    {
      type: 'narration',
      text: '（进入战斗）',
    },
  ],
  bloodTowerPlan: [
    {
      type: 'narration',
      text: '三人组跟随张队提供的最新情报，来到一座被遗弃的塔楼前。',
      background: '小巷.png',
      audio: 'Cult1.mp3',
      audioAction: 'play',
    },
    {
      speaker: 'Dario',
      text: '这里就是赫雷西教团的据点之一？',
      portrait: 'DarioThinking.png',
      position: 'left',
      characters: {
        Dario: { portrait: 'DarioThinking.png', position: 'left' },
        Adora: { portrait: 'AdoraWorried.png', position: 'center' },
        Karma: { portrait: 'KarmaAnnoyed.png', position: 'right' },
      },
    },
    {
      speaker: 'Adora',
      text: '我能感觉到这里有很强的怨念……他们在这里做了什么？',
      portrait: 'AdoraWorried.png',
      position: 'center',
      characters: {
        Dario: { portrait: 'DarioThinking.png', position: 'left' },
        Adora: { portrait: 'AdoraWorried.png', position: 'center' },
        Karma: { portrait: 'KarmaAnnoyed.png', position: 'right' },
      },
    },
    {
      speaker: 'Karma',
      text: '管他呢，进去清理掉就完事了。',
      portrait: 'KarmaSmile.png',
      position: 'right',
      characters: {
        Dario: { portrait: 'DarioThinking.png', position: 'left' },
        Adora: { portrait: 'AdoraWorried.png', position: 'center' },
        Karma: { portrait: 'KarmaSmile.png', position: 'right' },
      },
    },
    {
      type: 'narration',
      text: '塔楼内部弥漫着浓重的血腥味，墙壁上刻满了诡异的符文。',
      audio: 'Cult1.mp3',
      audioAction: 'stop',
    },
    {
      type: 'narration',
      text: '（进入战斗）',
    },
  ],
  sevenSeas: [
    { type: 'narration', text: '夜幕低垂，海风裹挟着血腥味，从远方破旧的码头吹来。' },
    {
      speaker: '刑警队长',
      text: '……你们想查 Cult，那就去码头找他们。“七海作战队”，唯一一支不归我们政府调度的队伍。如果你们还有命回来，我们再谈下一步。',
    },
    {
      type: 'narration',
      text: '昏暗的灯光下，三人组沿着杂草丛生的铁轨踏进废弃码头。',
      stageAmbient: 'play',
    },
    { speaker: 'Dario', text: '哈？这地方也太破了吧……你确定这里能找人合作？' },
    { speaker: 'Karma', text: '啧，这周围好浓的血腥味。' },
    { speaker: 'Adora', text: '好闷的感觉……' },
    { speaker: '？？？', text: '站住。' },
    { type: 'narration', text: '地面突然震动，一队身穿军装、面罩遮面的异装者从黑暗中走出。' },
    { type: 'narration', text: '为首者戴着深灰色军帽，满身是血，鱼叉末端还挂着未干的肉屑。' },
    { speaker: 'Haz', text: '你们就是他所说的……' },
    {
      speaker: 'Dario',
      text: '对对，我们是被派来找你们合作的。老头子说你们……“不太听话”，和我们挺搭。',
    },
    { type: 'narration', text: 'Haz 没有回应，只是目光缓缓转向 Adora。' },
    { type: 'narration', text: '他深深吸了一口气，表情骤变。' },
    { speaker: 'Haz', text: '……这味道……' },
    { type: 'narration', text: '身后的七海成员顿时警觉，手中的武器开始颤动。' },
    { speaker: 'Haz', text: '把帽子摘了。' },
    { speaker: 'Adora', text: '啊……？为什么那么突然？' },
    { speaker: 'Karma', text: '他不想摘的话就别勉强他。' },
    { speaker: 'Dario', text: '诶诶诶，别一上来就动手动脚的啊！' },
    { type: 'narration', text: '气氛瞬间绷紧，海雾里连呼吸都变得沉重。' },
    { speaker: 'Haz', text: '你们身上有腐蚀的味……尤其是他。你们和 Cult 脱不开关系。' },
    { speaker: 'Katz', text: '队长，可能是误会……' },
    { type: 'narration', text: 'Haz 的笑声低沉而危险。' },
    { speaker: 'Haz', text: '我的直觉，从未有任何偏差。' },
    { type: 'narration', text: '下一秒，七海作战队全员拉开架势，面罩下的红光在夜色中燃起。' },
    { type: 'narration', text: '他们把满脸癫狂笑容的队长护在身后，杀意在废弃码头的黑暗里蔓延。' },
  ],
};

const sevenSeasStage = stageCatalog.sevenSeas;
const sevenSeasBriefFallback = sevenSeasStage ? [...sevenSeasStage.brief] : [];
const sevenSeasDebuffNote = sevenSeasStage
  ? sevenSeasStage.brief.find((line) => line.includes('作战余波'))
  : '';

const DOCK_BACKGROUND_PATTERN = /(?:^|\/)dock\.png(?:\?.*)?$/i;

function valueMatchesDockBackground(value) {
  if (!value) return false;
  if (typeof value === 'string') {
    return DOCK_BACKGROUND_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => valueMatchesDockBackground(item));
  }
  if (typeof value === 'object') {
    return Object.values(value).some((nested) => valueMatchesDockBackground(nested));
  }
  return false;
}

function entryIndicatesDockScene(entry) {
  if (!entry || typeof entry !== 'object') return false;

  const candidateKeys = [
    'background',
    'backgroundImage',
    'backgroundSrc',
    'bg',
    'cg',
    'scene',
    'sceneImage',
    'sceneAsset',
    'image',
    'art',
    'visual',
    'visualAsset',
  ];

  for (const key of candidateKeys) {
    if (valueMatchesDockBackground(entry[key])) {
      return true;
    }
  }

  const arrayLikeKeys = ['images', 'backgrounds', 'visuals', 'scenes', 'assets'];
  for (const key of arrayLikeKeys) {
    if (valueMatchesDockBackground(entry[key])) {
      return true;
    }
  }

  if (entry.extra && typeof entry.extra === 'object') {
    if (valueMatchesDockBackground(entry.extra)) {
      return true;
    }
  }

  return false;
}

function overlayHasDockVisual() {
  if (!storyOverlay || !storyOverlay.classList.contains('active')) return false;

  const nodesToCheck = [storyOverlay, storyBackdrop];
  for (const node of nodesToCheck) {
    if (!node) continue;

    if (node.dataset && valueMatchesDockBackground(node.dataset)) {
      return true;
    }

    if (node.style && valueMatchesDockBackground(node.style.backgroundImage)) {
      return true;
    }

    if (node.getAttribute) {
      const inlineStyle = node.getAttribute('style');
      if (valueMatchesDockBackground(inlineStyle)) {
        return true;
      }
    }

    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      try {
        const computed = window.getComputedStyle(node);
        if (valueMatchesDockBackground(computed?.backgroundImage)) {
          return true;
        }
      } catch {}
    }
  }

  const candidates = storyOverlay.querySelectorAll(
    '[src], [data-src], [srcset], [data-srcset], [data-background], [data-scene], [style]'
  );

  for (const node of candidates) {
    const values = [];
    if (node.getAttribute) {
      values.push(
        node.getAttribute('src'),
        node.getAttribute('data-src'),
        node.getAttribute('srcset'),
        node.getAttribute('data-srcset'),
        node.getAttribute('data-background'),
        node.getAttribute('data-scene'),
        node.getAttribute('style')
      );
    }
    if (node.dataset) {
      values.push(node.dataset.background, node.dataset.scene);
    }

    if (valueMatchesDockBackground(values)) {
      return true;
    }
  }

  return false;
}

function triggerDockAmbient() {
  if (!storyOverlay || !storyOverlay.classList.contains('active')) return false;
  if (!stageAmbientController || typeof stageAmbientController.play !== 'function') return false;

  const ambientEl = stageAmbientController.element;
  const isPlaying = ambientEl && !ambientEl.paused;
  stageAmbientController.play({ restart: !isPlaying });
  return true;
}

function normaliseRectFromNumbers(numbers) {
  if (!Array.isArray(numbers) || numbers.length < 2) return null;
  if (numbers.length === 2) {
    const [x, y] = numbers;
    return {
      x1: x,
      x2: x,
      y1: y,
      y2: y,
    };
  }

  if (numbers.length === 3) {
    const [x1, x2, y] = numbers;
    return {
      x1: Math.min(x1, x2),
      x2: Math.max(x1, x2),
      y1: y,
      y2: y,
    };
  }

  const [x1, x2, y1, y2] = numbers;
  return {
    x1: Math.min(x1, x2),
    x2: Math.max(x1, x2),
    y1: Math.min(y1, y2),
    y2: Math.max(y1, y2),
  };
}

const sevenSeasPlayerMeta = {
  adora: {
    key: 'adora',
    name: 'Adora',
    label: 'Ad',
    tone: 'adora',
    aliases: ['adora', '阿多拉'],
  },
  karma: {
    key: 'karma',
    name: 'Karma',
    label: 'Ka',
    tone: 'karma',
    aliases: ['karma', '卡尔玛', '卡玛'],
  },
  dario: {
    key: 'dario',
    name: 'Dario',
    label: 'Da',
    tone: 'dario',
    aliases: ['dario', '达里奥'],
  },
};

const sevenSeasEnemyMeta = {
  haz: {
    key: 'haz',
    name: 'Haz',
    label: 'Haz',
    type: 'boss',
    aliases: ['haz', '哈兹'],
  },
  tusk: {
    key: 'tusk',
    name: 'Tusk',
    label: 'Tu',
    type: 'miniboss',
    aliases: ['tusk', '塔斯克'],
  },
  katz: {
    key: 'katz',
    name: 'Katz',
    label: 'Kz',
    type: 'miniboss',
    aliases: ['katz', '卡兹'],
  },
  neyla: {
    key: 'neyla',
    name: 'Neyla',
    label: 'Ne',
    type: 'elite',
    aliases: ['neyl', 'neyla', '尼拉'],
  },
  kyn: {
    key: 'kyn',
    name: 'Kyn',
    label: 'Ky',
    type: 'elite',
    aliases: ['kyn', '金'],
  },
  khathia: {
    key: 'khathia',
    name: 'Khathia',
    label: 'Kh',
    type: 'boss',
    aliases: ['khathia', '卡西亚'],
  },
};

function extractNumbers(line) {
  if (!line) return [];
  const normalised = line.replace(/(?<=\d)\s*-\s*(?=\d)/g, ' ');
  return (normalised.match(/-?\d+/g) || []).map((token) => Number(token));
}

function identifyMeta(line, lookup) {
  const lower = line.toLowerCase();
  return (
    Object.values(lookup).find((meta) => {
      if (lower.includes(meta.key)) return true;
      if (Array.isArray(meta.aliases)) {
        return meta.aliases.some((alias) => {
          const aliasLower = alias.toLowerCase();
          return lower.includes(aliasLower) || line.includes(alias);
        });
      }
      return false;
    }) || null
  );
}

function formatRange(start, end) {
  if (start === end) return `${start}`;
  return `${Math.min(start, end)}～${Math.max(start, end)}`;
}

function formatRect(rect) {
  if (!rect) return '';
  return `（${formatRange(rect.x1, rect.x2)}，${formatRange(rect.y1, rect.y2)}）`;
}

function parseSevenSeasGameTxt(text) {
  if (!text || !sevenSeasStage) return null;

  const lines = text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return '';
      const withoutComment = trimmed.replace(/\s+#.*$/, '').trim();
      return withoutComment;
    })
    .filter((line) => line.length);

  if (!lines.length) return null;

  const rects = { cover: [], voids: [] };
  const players = [];
  const enemies = [];
  const notes = [];
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  const updateBounds = (rect) => {
    if (!rect) return;
    bounds.minX = Math.min(bounds.minX, rect.x1);
    bounds.maxX = Math.max(bounds.maxX, rect.x2);
    bounds.minY = Math.min(bounds.minY, rect.y1);
    bounds.maxY = Math.max(bounds.maxY, rect.y2);
  };

  let declaredSize = null;

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    const numbers = extractNumbers(lower);

    if (lower.startsWith('size') || lower.includes('尺寸')) {
      declaredSize = numbers.slice(0, 2);
      return;
    }

    if (lower.startsWith('note') || lower.includes('备注')) {
      const note = line.replace(/^\s*note\s*[:：]?\s*/i, '').trim();
      if (note) {
        notes.push(note);
      }
      return;
    }

    if (lower.includes('void') || lower.includes('空缺') || lower.includes('缺口') || lower.includes('海水')) {
      const rect = normaliseRectFromNumbers(numbers);
      if (rect) {
        rects.voids.push(rect);
        updateBounds(rect);
      }
      return;
    }

    if (lower.includes('cover') || lower.includes('掩体')) {
      const rect = normaliseRectFromNumbers(numbers);
      if (rect) {
        rects.cover.push(rect);
        updateBounds(rect);
      }
      return;
    }

    const playerMeta = identifyMeta(lower, sevenSeasPlayerMeta);
    if (playerMeta) {
      const rect = normaliseRectFromNumbers(numbers);
      if (rect) {
        players.push({ meta: playerMeta, rect });
        updateBounds(rect);
      }
      return;
    }

    const enemyMeta = identifyMeta(lower, sevenSeasEnemyMeta);
    if (enemyMeta) {
      const rect = normaliseRectFromNumbers(numbers);
      if (rect) {
        enemies.push({ meta: enemyMeta, rect });
        updateBounds(rect);
      }
    }
  });

  const hasDeclaredSize =
    Array.isArray(declaredSize) &&
    declaredSize.length >= 2 &&
    declaredSize.every((value) => Number.isFinite(value) && value > 0);

  if (
    !hasDeclaredSize &&
    (!Number.isFinite(bounds.minX) ||
      !Number.isFinite(bounds.maxX) ||
      !Number.isFinite(bounds.minY) ||
      !Number.isFinite(bounds.maxY))
  ) {
    return null;
  }

  const baseMinX = hasDeclaredSize ? 1 : bounds.minX;
  const baseMinY = hasDeclaredSize ? 1 : bounds.minY;

  const rows = hasDeclaredSize
    ? Math.max(1, Math.round(declaredSize[0]))
    : Math.max(1, bounds.maxY - bounds.minY + 1);
  const cols = hasDeclaredSize
    ? Math.max(1, Math.round(declaredSize[1]))
    : Math.max(1, bounds.maxX - bounds.minX + 1);

  const convert = (x, y) => ({
    row: rows - (y - baseMinY),
    col: x - baseMinX + 1,
  });

  const withinBounds = (cell) =>
    cell && cell.row >= 1 && cell.row <= rows && cell.col >= 1 && cell.col <= cols;

  const voids = new Set();
  rects.voids.forEach((rect) => {
    for (let x = rect.x1; x <= rect.x2; x += 1) {
      for (let y = rect.y1; y <= rect.y2; y += 1) {
        const cell = convert(x, y);
        if (withinBounds(cell)) {
          voids.add(`${cell.row}-${cell.col}`);
        }
      }
    }
  });

  const cover = [];
  rects.cover.forEach((rect) => {
    for (let x = rect.x1; x <= rect.x2; x += 1) {
      for (let y = rect.y1; y <= rect.y2; y += 1) {
        const cell = convert(x, y);
        if (withinBounds(cell)) {
          cover.push(cell);
        }
      }
    }
  });

  const playerCells = [];
  players.forEach(({ meta, rect }) => {
    for (let x = rect.x1; x <= rect.x2; x += 1) {
      for (let y = rect.y1; y <= rect.y2; y += 1) {
        const cell = convert(x, y);
        if (withinBounds(cell)) {
          playerCells.push({
            ...cell,
            label: meta.label,
            type: 'player',
            tone: meta.tone,
          });
        }
      }
    }
  });

  const enemyCells = [];
  enemies.forEach(({ meta, rect }) => {
    for (let x = rect.x1; x <= rect.x2; x += 1) {
      for (let y = rect.y1; y <= rect.y2; y += 1) {
        const cell = convert(x, y);
        if (withinBounds(cell)) {
          enemyCells.push({
            ...cell,
            label: meta.label,
            type: meta.type,
          });
        }
      }
    }
  });

  const voidNote = rects.voids.length
    ? rects.voids
        .map((rect) => {
          const width = rect.x2 - rect.x1 + 1;
          const height = rect.y2 - rect.y1 + 1;
          return `空缺 ${width}×${height}${formatRect(rect)}`;
        })
        .join('；')
    : '';

  const brief = [];
  const computedSize = `${rows} × ${cols}${voidNote ? `（${voidNote}）` : ''}`;
  brief.push(`地图 ${rows}×${cols}${voidNote ? `（${voidNote}）` : ''}。`);

  if (rects.cover.length) {
    const coverSummary = rects.cover
      .map((rect, index) => `区域 ${index + 1}${formatRect(rect)}`)
      .join('；');
    brief.push(`掩体：${coverSummary}。`);
  }

  if (players.length) {
    const playerSummary = players
      .map((entry) => `${entry.meta.name}${formatRect(entry.rect)}`)
      .join('；');
    brief.push(`我方：${playerSummary}。`);
  }

  if (enemies.length) {
    const enemySummary = enemies
      .map((entry) => `${entry.meta.name}${formatRect(entry.rect)}`)
      .join('；');
    brief.push(`敌方：${enemySummary}。`);
  }

  notes.forEach((note) => {
    brief.push(note.endsWith('。') ? note : `${note}。`);
  });

  const map = {
    rows,
    cols,
    voids,
    cover,
    players: playerCells,
    enemies: enemyCells,
  };

  const preferredSize = hasDeclaredSize
    ? `${rows} × ${cols}${voidNote ? `（${voidNote}）` : ''}`
    : computedSize;

  return {
    map,
    brief,
    sizeLabel: preferredSize,
    fallbackSize: computedSize,
  };
}

function loadSevenSeasMapFromFile() {
  if (!sevenSeasStage || typeof fetch !== 'function') return;

  fetch('files/Game.txt')
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((text) => {
      const parsed = parseSevenSeasGameTxt(text);
      if (!parsed) return;

      sevenSeasStage.map = parsed.map;
      sevenSeasStage.size = parsed.sizeLabel || parsed.fallbackSize;

      const newBrief = [...parsed.brief];
      if (sevenSeasDebuffNote && !newBrief.some((line) => line.includes('作战余波'))) {
        newBrief.push(sevenSeasDebuffNote);
      }

      sevenSeasStage.brief = newBrief;

      if (currentStageId === 'sevenSeas') {
        renderStage('sevenSeas');
      }
    })
    .catch((error) => {
      console.warn('无法根据 Game.txt 更新七海地图，保留默认配置。', error);
      sevenSeasStage.brief = [...sevenSeasBriefFallback];
    });
}

function markStageVisited(stageId, { showRepeat = true } = {}) {
  const stage = stageCatalog[stageId];
  if (!stage) return;

  const visitedBefore = Boolean(stageProgress[stageId]);
  stageProgress[stageId] = true;
  renderStage(stageId);

  if (!visitedBefore) {
    showToast(`关卡「${stage.name}」资料已解锁。`);
  } else if (showRepeat) {
    showToast(`关卡「${stage.name}」资料已在情报库中。`);
  }
}

function formatStoryParagraphs(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((segment) => (typeof segment === 'string' ? segment.trim() : ''))
      .filter(Boolean)
      .map((segment) => `<p>${segment}</p>`)
      .join('');
  }

  if (typeof raw === 'string') {
    return raw
      .split(/\s*\n+\s*/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => `<p>${segment}</p>`)
      .join('');
  }

  return '';
}

function applyStoryCues(entry) {
  if (!entry) return;

  let ambientHandled = false;

  if (entry.stageAmbient && stageAmbientController) {
    const cue = String(entry.stageAmbient).toLowerCase();
    if (cue === 'play' && typeof stageAmbientController.play === 'function') {
      stageAmbientController.play();
      ambientHandled = true;
    } else if (cue === 'stop' && typeof stageAmbientController.stop === 'function') {
      stageAmbientController.stop({ reset: false });
      ambientHandled = true;
    }
  }

  if (!ambientHandled && stageAmbientController) {
    if (entryIndicatesDockScene(entry)) {
      if (triggerDockAmbient()) {
        ambientHandled = true;
      }
    } else if (overlayHasDockVisual()) {
      triggerDockAmbient();
    }
  }

  // —— Backdrop: show Dock.png once when narration mentions “废弃码头” ——
  try {
    const txt = (entry && entry.text) ? String(entry.text) : '';
    if (/废弃码头/.test(txt)) {
      if (storyBackdrop && (!storyBackdrop.dataset || storyBackdrop.dataset.scene !== 'dock')) {
        storyBackdrop.style.backgroundImage = "url('Dock.png')";
        storyBackdrop.style.backgroundSize = 'cover';
        storyBackdrop.style.backgroundPosition = 'center';
        storyBackdrop.style.backgroundRepeat = 'no-repeat';
        if (!storyBackdrop.dataset) storyBackdrop.dataset = {};
        storyBackdrop.dataset.scene = 'dock';
      }
    }
  } catch (e) {}

  // —— Background Image: Handle custom backgrounds ——
  if (entry.background && storyBackdrop) {
    const bgImage = String(entry.background);
    // Validate image path to prevent CSS injection
    if (!/^[a-zA-Z0-9._\-\/]+\.(png|jpg|jpeg|gif|webp)$/i.test(bgImage)) {
      console.warn('Invalid background image path:', bgImage);
    } else if (!storyBackdrop.dataset || storyBackdrop.dataset.scene !== bgImage) {
      if (!storyBackdrop.dataset) storyBackdrop.dataset = {};
      storyBackdrop.style.backgroundImage = `url('${bgImage}')`;
      storyBackdrop.style.backgroundSize = 'cover';
      storyBackdrop.style.backgroundPosition = 'center';
      storyBackdrop.style.backgroundRepeat = 'no-repeat';
      storyBackdrop.dataset.scene = bgImage;
    }
  }

  // —— Character Portrait: Legacy cleanup (portraits now handled by updateCharacterPortraits) ——
  // Remove any old story-portrait elements that might have been created previously
  if (storyOverlay) {
    const oldPortraitContainer = storyOverlay.querySelector('.story-portrait');
    if (oldPortraitContainer) {
      oldPortraitContainer.remove();
    }
  }

  // —— Audio Control: Play or stop audio ——
  if (entry.audio || entry.audioAction) {
    const actionRaw = entry.audioAction ? String(entry.audioAction).toLowerCase() : '';
    const normalizedAction = actionRaw || (entry.audio ? 'play' : '');

    if (normalizedAction === 'stop') {
      stopStoryAudio({ reset: entry.audioReset !== false });
    } else if (normalizedAction === 'play' && entry.audio) {
      const loop = entry.audioLoop !== false;
      const volume = clampAudioVolume(
        typeof entry.audioVolume === 'number' ? entry.audioVolume : NaN,
        0.7,
      );
      playStoryAudio(entry.audio, { loop, volume });
    }
  }
}


function updateStoryEntry(entry, isLastEntry) {
  if (!storyOverlay) return;

  const isNarration = !entry?.speaker || entry?.type === 'narration';
  storyOverlay.classList.toggle('is-narration', isNarration);

  if (storySpeaker) {
    if (entry?.speaker) {
      storySpeaker.textContent = entry.speaker;
      storySpeaker.classList.add('visible');
    } else {
      storySpeaker.textContent = '';
      storySpeaker.classList.remove('visible');
    }
  }

  if (storyText) {
    storyText.innerHTML = formatStoryParagraphs(entry?.text || '');
  }

  if (storyNextButton) {
    storyNextButton.textContent = isLastEntry ? '结束' : '继续';
  }

  // Update character portraits for visual novel style
  try {
    updateCharacterPortraits(entry);
  } catch (error) {
    console.warn('Error updating character portraits:', error);
  }

  applyStoryCues(entry);
}

function updateCharacterPortraits(entry) {
  if (!storyOverlay) return;

  const charactersContainer = storyOverlay.querySelector('.story-characters');
  if (!charactersContainer) return;

  // Animation timing constant to match CSS transition duration
  const PORTRAIT_TRANSITION_MS = 400;

  // Get character data from the entry
  const charactersData = entry?.characters || {};
  const currentSpeaker = entry?.speaker || null;

  // Get all existing portrait elements
  const existingPortraits = new Map();
  charactersContainer.querySelectorAll('.story-character-portrait').forEach(p => {
    const charName = p.dataset.character;
    if (charName) existingPortraits.set(charName, p);
  });

  // Track which characters should be displayed
  const charactersToShow = new Set(Object.keys(charactersData));

  // Remove portraits that are no longer in the scene
  existingPortraits.forEach((portraitEl, charName) => {
    if (!charactersToShow.has(charName)) {
      portraitEl.style.opacity = '0';
      portraitEl.style.transform = portraitEl.classList.contains('left') 
        ? 'translateX(-20px)' 
        : portraitEl.classList.contains('right')
        ? 'translateX(20px)'
        : 'translateX(-50%) translateY(20px)';
      setTimeout(() => {
        if (portraitEl.parentNode === charactersContainer) {
          portraitEl.remove();
        }
      }, PORTRAIT_TRANSITION_MS);
    }
  });

  // Add or update portraits for characters in the scene
  Object.entries(charactersData).forEach(([charName, charData]) => {
    const { portrait, position } = charData;
    if (!portrait) return;

    // Validate image path to prevent CSS injection
    if (!/^[a-zA-Z0-9._\-\/]+\.(png|jpg|jpeg|gif|webp)$/i.test(portrait)) {
      console.warn('Invalid portrait image path:', portrait);
      return;
    }

    let portraitEl = existingPortraits.get(charName);
    const isNewPortrait = !portraitEl;

    // Create new portrait element if needed
    if (isNewPortrait) {
      portraitEl = document.createElement('div');
      portraitEl.className = 'story-character-portrait';
      portraitEl.dataset.character = charName;
      charactersContainer.appendChild(portraitEl);
    }

    // Update position class with whitelist validation
    const VALID_POSITIONS = ['left', 'center', 'right'];
    portraitEl.classList.remove('left', 'center', 'right');
    const validatedPosition = VALID_POSITIONS.includes(position) ? position : 'center';
    portraitEl.classList.add(validatedPosition);

    // Update portrait image
    portraitEl.style.backgroundImage = `url('${portrait}')`;

    // Determine if this character is speaking
    const isSpeaking = currentSpeaker && (charName === currentSpeaker);

    // Apply active or dimmed state
    portraitEl.classList.remove('active', 'dimmed');
    if (isSpeaking) {
      portraitEl.classList.add('active');
    } else {
      portraitEl.classList.add('dimmed');
    }

    // Animate new portraits
    if (isNewPortrait) {
      portraitEl.style.opacity = '0';
      portraitEl.style.transform = validatedPosition === 'left'
        ? 'translateX(-30px)'
        : validatedPosition === 'right'
        ? 'translateX(30px)'
        : 'translateX(-50%) translateY(30px)';
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const transitionMs = PORTRAIT_TRANSITION_MS / 1000;
          portraitEl.style.transition = `opacity ${transitionMs}s ease, filter ${transitionMs}s ease, transform ${transitionMs}s ease`;
          portraitEl.style.opacity = '1';
          // Reset transform to final position for all position types
          if (validatedPosition === 'center') {
            portraitEl.style.transform = 'translateX(-50%)';
          } else if (validatedPosition === 'left' || validatedPosition === 'right') {
            portraitEl.style.transform = '';
          }
        });
      });
    }
  });
}

function advanceStory() {
  if (!storyState || !Array.isArray(storyState.script)) return;

  storyState.index += 1;
  const { script } = storyState;

  if (storyState.index >= script.length) {
    finishStageStory();
    return;
  }

  const entry = script[storyState.index];
  const isLastEntry = storyState.index >= script.length - 1;
  updateStoryEntry(entry, isLastEntry);
}

function startStageStory(stageId) {
  if (!storyOverlay) {
    markStageVisited(stageId);
    return;
  }

  if (storyState) return;

  const script = stageStories[stageId];
  if (!Array.isArray(script) || script.length === 0) {
    markStageVisited(stageId);
    return;
  }

  storyState = { stageId, script, index: -1 };

  stopStoryAudio();
  storyOverlay.dataset.stage = stageId;
  storyOverlay.setAttribute('aria-hidden', 'false');
  storyOverlay.classList.remove('show-panel', 'is-narration');
  storyOverlay.classList.add('active');

  if (stageAmbientController && typeof stageAmbientController.stop === 'function') {
    stageAmbientController.stop();
  }

  if (bgmController && typeof bgmController.fadeOut === 'function') {
    bgmController.fadeOut(850);
    ensureMenuBGMStopped();
  }

  if (storySpeaker) {
    storySpeaker.textContent = '';
    storySpeaker.classList.remove('visible');
  }

  if (storyText) {
    storyText.innerHTML = '';
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!storyOverlay || !storyState) return;
      storyOverlay.classList.add('show-panel');
      setTimeout(() => {
        if (!storyState) return;
        advanceStory();
      }, 320);
    });
  });
}

function finishStageStory(skipped = false) {
  if (!storyOverlay || !storyState) return;

  const { stageId } = storyState;
  storyOverlay.classList.remove('show-panel', 'is-narration');
  storyOverlay.setAttribute('aria-hidden', 'true');

  // cleanup backdrop
  if (storyBackdrop) {
    storyBackdrop.style.backgroundImage = '';
    if (storyBackdrop.dataset) delete storyBackdrop.dataset.scene;
  }

  // cleanup story audio
  stopStoryAudio();

  // cleanup portrait
  if (storyOverlay) {
    const portraitContainer = storyOverlay.querySelector('.story-portrait');
    if (portraitContainer) {
      portraitContainer.style.display = 'none';
      portraitContainer.style.backgroundImage = '';
    }
    
    // cleanup visual novel character portraits
    const charactersContainer = storyOverlay.querySelector('.story-characters');
    if (charactersContainer) {
      charactersContainer.innerHTML = '';
    }
  }

  storyState = null;

  if (stageAmbientController && typeof stageAmbientController.stop === 'function') {
    stageAmbientController.stop();
  }

  if (bgmController && typeof bgmController.fadeIn === 'function') {
    bgmController.fadeIn(1100);
  }

  setTimeout(() => {
    storyOverlay.classList.remove('active');
    if (storySpeaker) {
      storySpeaker.textContent = '';
      storySpeaker.classList.remove('visible');
    }
    if (storyText) {
      storyText.innerHTML = '';
    }
  }, 420);

  setTimeout(() => {
    markStageVisited(stageId, { showRepeat: skipped });
    
    // Redirect to intro battle after intro story (even if skipped)
    if (stageId === 'intro') {
      setTimeout(() => {
        window.location.href = './intro-battle.html';
      }, 500);
    }
    
    // Redirect to boss battle after sevenSeas story (even if skipped)
    if (stageId === 'sevenSeas') {
      setTimeout(() => {
        window.location.href = './boss-battle.html';
      }, 500);
    }
    
    // Redirect to heresy battle after firstHeresy story (even if skipped)
    if (stageId === 'firstHeresy') {
      setTimeout(() => {
        window.location.href = './heresy-battle.html';
      }, 500);
    }
    
    // Redirect to blood tower battle after bloodTowerPlan story (even if skipped)
    if (stageId === 'bloodTowerPlan') {
      setTimeout(() => {
        window.location.href = './blood-tower-battle.html';
      }, 500);
    }
  }, 450);
}

function renderStage(stageId) {
  const stage = stageCatalog[stageId];
  if (!stage) return;

  currentStageId = stageId;

  document.querySelectorAll('.stage-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.stage === stageId);
  });

  const stageName = document.querySelector('.stage-name');
  const stageSubtitle = document.querySelector('.stage-subtitle');
  const mapSize = document.querySelector('.map-size');
  const narrative = document.querySelector('.stage-narrative');
  const brief = document.querySelector('.stage-brief');
  const mapGrid = document.querySelector('.map-grid');
  const enemyList = document.querySelector('.enemy-list');

  stageName.textContent = stage.name;
  stageSubtitle.textContent = stage.subtitle;
  mapSize.textContent = `地图尺寸：${stage.size}`;

  narrative.innerHTML = stage.narrative.map((text) => `<p>${text}</p>`).join('');

  brief.innerHTML = [
    '<h4>战场情报</h4>',
    '<ul>',
    ...stage.brief.map((item) => `<li>${item}</li>`),
    '</ul>',
  ].join('');

  const { rows, cols, voids, cover, players, enemies } = stage.map;
  mapGrid.style.setProperty('--rows', rows);
  mapGrid.style.setProperty('--cols', cols);
  mapGrid.innerHTML = '';

  const coverSet = new Set(cover.map((cell) => `${cell.row}-${cell.col}`));
  const playerMap = new Map(players.map((cell) => [`${cell.row}-${cell.col}`, cell]));
  const enemyMap = new Map(enemies.map((cell) => [`${cell.row}-${cell.col}`, cell]));

  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      const key = `${row}-${col}`;
      const cell = document.createElement('div');
      cell.className = 'map-cell';

      if (voids instanceof Set ? voids.has(key) : false) {
        cell.classList.add('void');
        mapGrid.appendChild(cell);
        continue;
      }

      if (coverSet.has(key)) {
        cell.classList.add('cover');
        cell.dataset.label = '';
      }

      if (playerMap.has(key)) {
        const data = playerMap.get(key);
        cell.classList.add('player');
        cell.dataset.label = data.label;
      } else if (enemyMap.has(key)) {
        const data = enemyMap.get(key);
        const threatType = data.type || 'enemy';
        cell.classList.add(threatType);
        cell.dataset.label = data.label;
      }

      mapGrid.appendChild(cell);
    }
  }

  enemyList.innerHTML = '';
  const visited = stageProgress[stageId];

  stage.enemies.forEach((enemy) => {
    const card = document.createElement('article');
    const threat = enemy.threat || 'enemy';
    card.className = `enemy-card threat-${threat}`;

    const head = document.createElement('div');
    head.className = 'enemy-head';

    const icon = document.createElement('div');
    icon.className = 'enemy-icon';
    icon.textContent = enemy.icon;

    const meta = document.createElement('div');
    meta.className = 'enemy-meta';

    const title = document.createElement('h5');
    title.textContent = enemy.name;

    const rank = document.createElement('p');
    rank.textContent = `${enemy.rank} · ${enemy.summary}`;

    meta.appendChild(title);
    meta.appendChild(rank);
    head.appendChild(icon);
    head.appendChild(meta);
    card.appendChild(head);

    const list = document.createElement('ul');
    list.className = 'skill-list';

    enemy.skills.forEach((skill) => {
      const item = document.createElement('li');
      item.className = 'skill-item';
      if (!visited) {
        item.classList.add('locked');
        item.textContent = '???（技能资料锁定）';
      } else {
        item.innerHTML = `<strong>${skill.name}</strong>：${skill.detail}`;
      }
      list.appendChild(item);
    });

    card.appendChild(list);
    enemyList.appendChild(card);
  });
}

function initStageBoard() {
  document.querySelectorAll('.stage-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      renderStage(btn.dataset.stage);
    });
  });

  const enterBtn = document.querySelector('.enter-btn');
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      if (currentStageId === 'abandonedAnimals') {
        // Navigate to Velmira Boss battle
        window.location.href = 'velmira-boss-battle.html';
        return;
      }

      if (currentStageId === 'fatigue') {
        // Navigate to Khathia Boss battle
        window.location.href = 'khathia-boss-battle.html';
        return;
      }

      if (currentStageId === 'oldLove') {
        // Navigate to Lirathe Boss battle
        window.location.href = 'lirathe-boss-battle.html';
        return;
      }

      if (currentStageId === 'bloodTowerPlan') {
        // Fade out BGM and start blood tower story
        if (bgmController && typeof bgmController.fadeOut === 'function') {
          bgmController.fadeOut(850);
        }
        startStageStory('bloodTowerPlan');
        return;
      }

      if (currentStageId === 'sevenSeas') {
        if (bgmController && typeof bgmController.fadeOut === 'function') {
          bgmController.fadeOut(850);
        }
        startStageStory('sevenSeas');
        return;
      }

      if (currentStageId === 'intro') {
        // Fade out BGM and start intro story
        if (bgmController && typeof bgmController.fadeOut === 'function') {
          bgmController.fadeOut(850);
        }
        startStageStory('intro');
        return;
      }

      if (currentStageId === 'firstHeresy') {
        if (bgmController && typeof bgmController.fadeOut === 'function') {
          bgmController.fadeOut(850);
        }
        startStageStory('firstHeresy');
        return;
      }

      markStageVisited(currentStageId);
    });
  }
}

if (storyNextButton) {
  storyNextButton.addEventListener('click', (event) => {
    event.stopPropagation();
    advanceStory();
  });
}

if (storySkipButton) {
  storySkipButton.addEventListener('click', (event) => {
    event.stopPropagation();
    finishStageStory(true);
  });
}

if (storyOverlay) {
  storyOverlay.addEventListener('click', (event) => {
    if (!storyState) return;
    if (event.target.closest('.story-controls')) return;
    advanceStory();
  });
}

function applyPortraitImage(imageElement, character) {
  if (!imageElement || !character) return;

  imageElement.dataset.portraitCharacter = character.name;
  imageElement.alt = `${character.name} 立绘`;
  imageElement.src = character.portrait;
}

const portraitLibrary = typeof portraitAssets === 'undefined' ? {} : portraitAssets;

// Skill Selection Library - All available skills for each character
const skillLibrary = {
  adora: [
    { id: 'adora_dagger', name: '短匕轻挥！', color: 'green', cost: '1步', description: '前方1格造成10点伤害与5点精神伤害。', probability: '80%', minLevel: 20 },
    { id: 'adora_gun', name: '枪击', color: 'gray', cost: '1步', description: '需携带手枪道具；指定方位整排造成10点伤害与5点精神伤害。', probability: '65%', minLevel: 20 },
    { id: 'adora_dont_approach', name: '呀！你不要靠近我呀！！', color: 'blue', cost: '2步', description: '可选四周任意5格瞬移（可少选）；若目标HP低于50%，追击一次"短匕轻挥！"。', probability: '40%', minLevel: 20 },
    { id: 'adora_stun_device', name: '自制粉色迷你电击装置！', color: 'red', cost: '3步', description: '前方2格造成10点伤害与15点精神伤害，并令目标麻痹（下回合-步数）。', probability: '30%', minLevel: 20 },
    { id: 'adora_medical', name: '略懂的医术！', color: 'pink', cost: '2步', description: '以自身为中心5×5选择1名友方，恢复20HP与15SP，并赋予1层"恢复"Buff（下一个大回合开始恢复5HP，仅消耗1层）。', probability: '30%', minLevel: 25 },
    { id: 'adora_cheer', name: '加油哇！', color: 'orange', cost: '2步', description: '以自身为中心5×5选择1名友方，授予1层"鸡血"Buff（下次攻击伤害×2，最多1层）。', probability: '20%', minLevel: 25 },
    { id: 'adora_rely', name: '只能靠你了。。', color: 'orange', cost: '4步', description: '牺牲自身25HP，为四周任意5格内1名友方施加"依赖"Buff（下次攻击造成真实伤害并将其SP降至0，最多1层）。', probability: '15%', minLevel: 35 },
    { id: 'adora_bloom', name: '绽放', color: 'red', cost: '3步', description: '如果在目前所拥有技能池里没使用：场上所有队友对敌方单位造成伤害后会给敌方叠一层血色花蕾（每个敌方单位最多叠7层）。主动使用：绽放所有在场的血色花蕾，让每个有血色花蕾的敌人受到根据层数的真实伤害（每一层10HP与5SP）并根据引爆层数来吸取HP与SP（每绽放一层血色花蕾：恢复Adora 5HP与5SP）。', probability: '20%', minLevel: 50 },
    { id: 'adora_assassination_1', name: '课本知识：刺杀一', color: 'green', cost: '1步', description: '能选择四周任何2格并瞬移到对方后侧并用匕首插进对方身体里造成10HP 5SP，随后再拔出来造成5HP 5SP以及给对方叠一层流血。', probability: '20%', minLevel: 50 },
    { id: 'adora_blackflash_charge', name: '黑瞬「充能」', color: 'purple', cost: '2步', description: '使用后地图上随机3格空格子出现墨片，友方踩上墨片会消失；全部消失后获得额外技能「黑瞬「释放」」。', probability: '20%', minLevel: 50 }
  ],
  karma: [
    { id: 'karma_punch', name: '沙包大的拳头', color: 'green', cost: '1步', description: '造成15点伤害。', probability: '80%', minLevel: 20 },
    { id: 'karma_gun', name: '枪击', color: 'gray', cost: '1步', description: '需手枪道具；指定方位整排造成10点伤害与5点精神伤害。', probability: '65%', minLevel: 20 },
    { id: 'karma_listen', name: '都听你的', color: 'blue', cost: '2步', description: '可选四周任意3格并回复5SP（可少选）。', probability: '40%', minLevel: 20 },
    { id: 'karma_blood_grip', name: '嗜血之握', color: 'red', cost: '3步', description: '连续使用四次"沙包大的拳头"后可释放，对非Boss造成75伤害、小Boss 80、精英100，并立即处决对应目标。', probability: '30%', minLevel: 20 },
    { id: 'karma_deep_breath', name: '深呼吸', color: 'white', cost: '2步', description: '主动恢复全部SP与10HP；若当前技能卡池未使用该技能，则获得10%伤害加成（同一时间仅可存在1张）。', probability: '20%', minLevel: 25 },
    { id: 'karma_adrenaline', name: '肾上腺素', color: 'white', cost: '2步', description: '主动使用 - 给自己上一层鸡血并恢复自己15HP以及5SP，如果在目前所拥有技能池里没使用 - 每连续2次使用"沙包大的拳头"打到任意敌人则自动再次对最后打到的敌方单位使用两次"沙包大的拳头"（技能池里一次性只能有一个肾上腺素技能）。', probability: '20%', minLevel: 50 },
    { id: 'karma_cataclysm', name: '天崩地裂', color: 'red', cost: '3步', description: '对周围2格内所有单位造成伤害：友方 10HP+5SP，敌方 25HP+10SP（相邻再+5HP）。', probability: '15%', minLevel: 50 }
  ],
  dario: [
    { id: 'dario_claw', name: '机械爪击', color: 'green', cost: '1步', description: '前方两格15点伤害。（15%能对普通敌人单位叠一层眩晕）', probability: '80%', minLevel: 20 },
    { id: 'dario_gun', name: '枪击', color: 'gray', cost: '1步', description: '需手枪道具；指定方位整排造成10点伤害与5点精神伤害。', probability: '65%', minLevel: 20 },
    { id: 'dario_swift', name: '迅捷步伐', color: 'blue', cost: '2步', description: '可选四周任意4格并自由移动，同时令最近敌人-5SP（可少选）。', probability: '40%', minLevel: 20 },
    { id: 'dario_pull', name: '拿来吧你！', color: 'red', cost: '3步', description: '整排首个非Boss单位造成20点伤害并拉至身前，附1回合眩晕与-15SP；对Boss仍附眩晕与SP伤害但无法拉动。', probability: '30%', minLevel: 20 },
    { id: 'dario_bitter_sweet', name: '先苦后甜', color: 'orange', cost: '4步', description: '下一回合额外+4步（技能池一次仅能存在1张）。', probability: '15%', minLevel: 25 },
    { id: 'dario_tear_wound', name: '撕裂伤口', color: 'green', cost: '1步', description: '前方3格爪击造成15点伤害后叠一层流血（如果对方不是满血伤害增加50%以及再叠一层流血），随后抽出利爪造成5HP。', probability: '80%', minLevel: 50 },
    { id: 'dario_status_recovery', name: '状态恢复', color: 'orange', cost: '4步', description: '选中全图任何友方单位，并把该单位的眩晕效果全部移除，并增加该单位15SP。', probability: '30%', minLevel: 50 },
    { id: 'dario_life_drain', name: '生命夺取', color: 'pink', cost: '1步', description: '给自己上一层“小生命夺取”Buff，下一次攻击恢复场上血量最少的友方单位15HP。', probability: '35%', minLevel: 50 }
  ]
};

const characterData = {
  adora: {
    name: 'Adora',
    level: 20,
    portrait: portraitLibrary.adora || '',
    bio: {
      intro: [
        '名字在西班牙语里意为“崇拜”。Adora 刚生时家人以为他是女孩，于是给了他一个偏女性化的名字。在英语里，他理解为“收养”；在日语里，“Ado”意味着喧嚣，象征他见证好友遭枪杀后转变的命运。',
        '他原本是快乐的孩子，九岁生日当天的异端暴走夺走了父母与左眼，事故也在他头发右侧留下“腐蚀”。自此，他拒绝警方帮助，逃往挚友 Dario 家，与 Karma 重逢。',
        '目睹朋友死亡后，他逐渐变为嗜血的怪物，这段转变极其痛苦。',
      ],
      facts: [
        '通常穿舒适毛衣，深灰色长发垂至身体下半部。',
        '6～15 岁常年处于抑郁，但成绩始终名列前茅，兴趣广泛（技术、游戏、动物护理等）。',
        '不喜暴力但必要时会致命；劝阻朋友少行暴力。',
        '力量与速度一般，不喜剧烈运动与外出。',
        '9 岁后一直戴着帽子与眼罩，16 岁摘下后在十字形左眼上加钉子。',
        '16 岁后在伙伴支持下逐渐开朗，喜欢汽水，现年 18 岁，身高 169 厘米，生日 8 月 4 日。',
        '真心信任并珍惜这支三人组。',
      ],
    },
    skills: {
      overview: 'Adora（初始等级 20）· 占 1 格 · HP 100 · SP 100（降至 0：失控 1 回合、-1 步，后自动恢复 50%）。',
      passives: [
        '背刺：攻击敌人背部时造成 1.5 倍伤害。',
        '冷静分析：若该回合未行动，恢复 10 点 SP。',
        '啊啊啊你们没事吧？！：6×6 范围有友方时，为该友方恢复 5% HP 与 5 SP（不含自身）。',
        '对战斗的恐惧：自身 SP < 10 时，伤害 ×1.5。',
      ],
      actives: [
        {
          tier: '20 级解锁',
          list: [
            {
              name: '短匕轻挥！',
              color: 'green',
              colorLabel: '绿色',
              cost: '1 步',
              description: '前方 1 格造成 10 点伤害与 5 点精神伤害。',
              note: '出现概率 80%。',
            },
            {
              name: '枪击',
              color: 'gray',
              colorLabel: '灰色',
              cost: '1 步',
              description: '需携带手枪道具；指定方位整排造成 10 点伤害与 5 点精神伤害。',
              note: '出现概率 65%。',
            },
            {
              name: '呀！你不要靠近我呀！！',
              color: 'blue',
              colorLabel: '蓝色',
              cost: '2 步',
              description: '可选四周任意 5 格瞬移（可少选）；若目标 HP 低于 50%，追击一次“短匕轻挥！”。',
              note: '出现概率 40%。',
            },
            {
              name: '自制粉色迷你电击装置！',
              color: 'red',
              colorLabel: '红色',
              cost: '3 步',
              description: '前方 2 格造成 10 点伤害与 15 点精神伤害，并令目标麻痹（下回合 -步数）。',
              note: '出现概率 30%。',
            },
          ],
        },
        {
          tier: '25 级解锁',
          list: [
            {
              name: '略懂的医术！',
              color: 'pink',
              colorLabel: '粉色',
              cost: '2 步',
              description: '以自身为中心 5×5 选择 1 名友方，恢复 20 HP 与 15 SP，并赋予 1 层“恢复”Buff（下一个大回合开始恢复 5 HP，仅消耗 1 层）。',
              note: '出现概率 30%。',
            },
            {
              name: '加油哇！',
              color: 'orange',
              colorLabel: '橘色',
              cost: '2 步',
              description: '以自身为中心 5×5 选择 1 名友方，授予 1 层“鸡血”Buff（下次攻击伤害 ×2，最多 1 层）。',
              note: '出现概率 20%。',
            },
          ],
        },
        {
          tier: '35 级解锁',
          list: [
            {
              name: '只能靠你了。。',
              color: 'orange',
              colorLabel: '橘色',
              cost: '4 步',
              description: '牺牲自身 25 HP，为四周任意 5 格内 1 名友方施加“依赖”Buff（下次攻击造成真实伤害并将其 SP 降至 0，最多 1 层）。',
              note: '出现概率 15%。',
            },
          ],
        },
        {
          tier: '50 级解锁',
          list: [
            {
              name: '绽放',
              color: 'red',
              colorLabel: '红色',
              cost: '3 步',
              description: '如果在目前所拥有技能池里没使用：场上所有队友对敌方单位造成伤害后会给敌方叠一层血色花蕾（每个敌方单位最多叠7层）。主动使用：绽放所有在场的血色花蕾，让每个有血色花蕾的敌人受到根据层数的真实伤害（每一层 10 HP 与 5 SP）并根据引爆层数来吸取 HP 与 SP（每绽放一层血色花蕾：恢复 Adora 5 HP 与 5 SP）。',
              note: '技能池里一次性只能有一个绽放技能，出现概率 20%。',
            },
            {
              name: '课本知识：刺杀一',
              color: 'green',
              colorLabel: '绿色',
              cost: '1 步',
              description: '能选择四周任何 2 格并瞬移到对方后侧并用匕首插进对方身体里造成 10 HP 5 SP，随后再拔出来造成 5 HP 5 SP以及给对方叠一层流血。',
              note: '多阶段攻击，出现概率 80%。',
            },
            {
              name: '黑瞬「充能」',
              color: 'purple',
              colorLabel: '紫色',
              cost: '2 步',
              description: '使用后地图上随机 3 格空格子出现墨片；友方踩上墨片会消失，全部消失后获得额外技能「黑瞬「释放」」。',
              note: '出现概率 20%。',
            },
          ],
        },
      ],
    },
  },
  karma: {
    name: 'Karma',
    level: 20,
    portrait: portraitLibrary.karma || '',
    bio: {
      intro: [
        '名字意为“命运、天意、行动”，象征着他的所作所为指向无法避免的致命结局。',
        '自出生起便与 Dario 是好友，幼儿园时结识 Adora。由于家庭暴力，9 岁那年搬到 Dario 家居住。',
      ],
      facts: [
        '常穿衬衫配黑裤，栗红色短发，手掌宽大。',
        '在校成绩垫底但擅长体能，保持三分之二的校级纪录。',
        '喜爱暴力，但在 Adora 劝导下学会收敛；性格常先行动后思考。',
        '后脑存在巨大红色“†”胎记，疑似失败的诅咒仪式所致。',
        '过去沉迷游戏，遭 Adora 教训后戒掉；喜欢能量饮料和酒精。',
        '曾吸烟，顾及 Adora 健康改用电子烟；18 岁起与 Dario 从事违法活动。',
        '力大无穷，几拳可砸倒树木。',
        '幼儿园起暗恋 Adora，当时不知他是男生。现年 19 岁，身高 189 厘米，生日 4 月 14 日。',
      ],
    },
    skills: {
      overview: 'Karma（初始等级 20）· 占 1 格 · HP 200 · SP 50（降至 0：失控 1 回合、-1 步并扣除 20 HP，后自动恢复 50%）。',
      passives: [
        '暴力瘾：每连续攻击到敌方单位原本伤害增加x1.5，如果连续攻击3次以上，追击一下沙包大的拳头，并且后面每增加连续的攻击就追击一下。但连续攻击4次后掉5SP。',
        '强悍的肉体：所受伤害 ×0.75。',
        '自尊心：按失去 HP 的 0.5% 等比例提升自身伤害。',
      ],
      actives: [
        {
          tier: '20 级解锁',
          list: [
            {
              name: '沙包大的拳头',
              color: 'green',
              colorLabel: '绿色',
              cost: '1 步',
              description: '造成 15 点伤害。',
              note: '出现概率 80%。',
            },
            {
              name: '枪击',
              color: 'gray',
              colorLabel: '灰色',
              cost: '1 步',
              description: '需手枪道具；指定方位整排造成 10 点伤害与 5 点精神伤害。',
              note: '出现概率 65%。',
            },
            {
              name: '都听你的',
              color: 'blue',
              colorLabel: '蓝色',
              cost: '2 步',
              description: '可选四周任意 3 格并回复 5 SP（可少选）。',
              note: '出现概率 40%。',
            },
            {
              name: '嗜血之握',
              color: 'red',
              colorLabel: '红色',
              cost: '3 步',
              description: '连续使用四次“沙包大的拳头”后可释放，对非 Boss 造成 75 伤害、小 Boss 80、精英 100，并立即处决对应目标。',
              note: '出现概率 30%。',
            },
          ],
        },
        {
          tier: '25 级解锁',
          list: [
            {
              name: '深呼吸',
              color: 'white',
              colorLabel: '白色',
              cost: '2 步',
              description: '主动恢复全部 SP 与 10 HP；若当前技能卡池未使用该技能，则获得 10% 伤害加成（同一时间仅可存在 1 张）。',
              note: '出现概率 20%。',
            },
          ],
        },
        {
          tier: '50 级解锁',
          list: [
            {
              name: '肾上腺素',
              color: 'white',
              colorLabel: '白色',
              cost: '2 步',
              description: '主动使用 - 给自己上一层鸡血并恢复自己15HP以及5SP，如果在目前所拥有技能池里没使用 - 每连续2次使用"沙包大的拳头"打到任意敌人则自动再次对最后打到的敌方单位使用两次"沙包大的拳头"。',
              note: '技能池里一次性只能有一个肾上腺素技能，出现概率 20%。',
            },
            {
              name: '天崩地裂',
              color: 'red',
              colorLabel: '红色',
              cost: '3 步',
              description: '对周围 2 格内所有单位造成伤害：友方 10HP+5SP，敌方 25HP+10SP（相邻再 +5HP）。',
              note: '出现概率 15%。',
            },
          ],
        },
      ],
    },
  },
  dario: {
    name: 'Dario',
    level: 20,
    portrait: portraitLibrary.dario || '',
    bio: {
      intro: [
        '名字意为“财富、富有、更多的钱”，象征他掌握的庞大资产。',
        '父母在他 6 岁时消失，只留下豪宅和巨额财产。与 Adora、Karma 交好，将自家豪宅作为据点。',
      ],
      facts: [
        '穿着正式衬衫配黑裤，佩戴美元符号发夹。',
        '左手因煤气罐事故更换为细长黑色机械臂，自觉十分酷。',
        '学业略低于平均，强壮敏捷但不及 Karma。',
        '热爱暴力，认为“暴力就是艺术”；常带笑容却鲜少真正快乐。',
        '拥有价值惊人的金牙，喜欢茶、烟与酒；性格难以捉摸。',
        '易感无聊，因追求刺激与收益参与非法活动。',
        '现年 19 岁，身高 187 厘米，生日 5 月 24 日。',
      ],
    },
    skills: {
      overview: 'Dario（初始等级 20）· 占 1 格 · HP 150 · SP 100（降至 0：失控 1 回合、-1 步，后自动恢复 75%）。',
      passives: [
        '快速调整：失控后额外恢复 25% SP（总计 75%）。',
        '反击：受到伤害 50% 概率使用“机械爪击”反击。',
        '士气鼓舞：每个 5 的倍数回合，为所有友方回复 15 SP。',
      ],
      actives: [
        {
          tier: '20 级解锁',
          list: [
            {
              name: '机械爪击',
              color: 'green',
              colorLabel: '绿色',
              cost: '1 步',
              description: '前方两格15点伤害。（15%能对普通敌人单位叠一层眩晕）',
              note: '出现概率 80%。',
            },
            {
              name: '枪击',
              color: 'gray',
              colorLabel: '灰色',
              cost: '1 步',
              description: '需手枪道具；指定方位整排造成 10 点伤害与 5 点精神伤害。',
              note: '出现概率 65%。',
            },
            {
              name: '迅捷步伐',
              color: 'blue',
              colorLabel: '蓝色',
              cost: '2 步',
              description: '可选四周任意 4 格并自由移动，同时令最近敌人 -5 SP（可少选）。',
              note: '出现概率 40%。',
            },
            {
              name: '拿来吧你！',
              color: 'red',
              colorLabel: '红色',
              cost: '3 步',
              description: '整排首个非 Boss 单位造成 20 点伤害并拉至身前，附 1 回合眩晕与 -15 SP；对 Boss 仍附眩晕与 SP 伤害但无法拉动。',
              note: '出现概率 30%。',
            },
          ],
        },
        {
          tier: '25 级解锁',
          list: [
            {
              name: '先苦后甜',
              color: 'orange',
              colorLabel: '橘色',
              cost: '4 步',
              description: '下一回合额外 +4 步（技能池一次仅能存在 1 张）。',
              note: '出现概率 15%。',
            },
          ],
        },
        {
          tier: '50 级解锁',
          list: [
            {
              name: '撕裂伤口',
              color: 'green',
              colorLabel: '绿色',
              cost: '1 步',
              description: '前方3格爪击造成15点伤害后叠一层流血（如果对方不是满血伤害增加50%以及再叠一层流血），随后抽出利爪造成5HP。',
              note: '多阶段攻击，出现概率 80%。',
            },
            {
              name: '状态恢复',
              color: 'orange',
              colorLabel: '橘色',
              cost: '4 步',
              description: '选中全图任何友方单位，并把该单位的眩晕效果全部移除，并增加该单位15SP。',
              note: '出现概率 30%。',
            },
            {
              name: '生命夺取',
              color: 'pink',
              colorLabel: '粉色',
              cost: '1 步',
              description: '使用后给自己上一层“小生命夺取”Buff（下一次攻击恢复场上血量最少的友方单位 15 HP）。',
              note: '出现概率 35%。',
            },
          ],
        },
      ],
    },
  },
};

function renderCharacter(characterId) {
  const data = characterData[characterId];
  if (!data) return;

  document.querySelectorAll('.character-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.character === characterId);
  });

  const portrait = document.querySelector('.portrait-art');
  const portraitImg = portrait.querySelector('.portrait-image');
  if (portraitImg) {
    applyPortraitImage(portraitImg, data);
  }

  document.querySelector('.level-number').textContent = data.level;
  portrait.setAttribute('aria-label', `${data.name} 立绘`);

  renderCharacterSection('bio', characterId);
}

function renderCharacterSection(section, characterId) {
  const data = characterData[characterId];
  if (!data) return;

  document.querySelectorAll('.detail-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.section === section);
  });

  const container = document.querySelector('.detail-content');
  let skillSelectionScroll = null;
  if (section === 'skillSelection') {
    const slots = container.querySelector('.skill-slots-container');
    const library = container.querySelector('.skill-library-container');
    skillSelectionScroll = {
      slots: slots ? slots.scrollTop : 0,
      library: library ? library.scrollTop : 0,
    };
  }
  container.innerHTML = '';

  if (section === 'bio') {
    data.bio.intro.forEach((paragraph) => {
      const p = document.createElement('p');
      p.textContent = paragraph;
      container.appendChild(p);
    });

    const list = document.createElement('ul');
    data.bio.facts.forEach((fact) => {
      const li = document.createElement('li');
      li.textContent = fact;
      list.appendChild(li);
    });
    container.appendChild(list);
  } else if (section === 'accessories') {
    renderAccessoriesSection(container);
  } else if (section === 'skillSelection') {
    renderSkillSelectionSection(container, characterId);
    if (skillSelectionScroll) {
      const slots = container.querySelector('.skill-slots-container');
      const library = container.querySelector('.skill-library-container');
      if (slots) slots.scrollTop = skillSelectionScroll.slots;
      if (library) library.scrollTop = skillSelectionScroll.library;
    }
  } else {
    const header = document.createElement('h3');
    header.textContent = data.name;
    container.appendChild(header);

    const overview = document.createElement('p');
    overview.textContent = data.skills.overview;
    container.appendChild(overview);

    const passiveTitle = document.createElement('h4');
    passiveTitle.textContent = '被动技能';
    container.appendChild(passiveTitle);

    const passiveList = document.createElement('ul');
    passiveList.className = 'passive-skill-list';
    data.skills.passives.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      passiveList.appendChild(li);
    });
    container.appendChild(passiveList);

    data.skills.actives.forEach((tierBlock) => {
      const tierTitle = document.createElement('h4');
      tierTitle.textContent = tierBlock.tier;
      container.appendChild(tierTitle);

      const ul = document.createElement('ul');
      ul.className = 'active-skill-list';
      tierBlock.list.forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'skill-entry';

        const badge = document.createElement('span');
        badge.className = `skill-badge skill-${entry.color}`;
        badge.textContent = entry.colorLabel;
        li.appendChild(badge);

        const body = document.createElement('div');
        body.className = 'skill-body';

        const headerRow = document.createElement('div');
        headerRow.className = 'skill-header';

        const title = document.createElement('strong');
        title.textContent = entry.name;
        headerRow.appendChild(title);

        const cost = document.createElement('span');
        cost.className = 'skill-cost';
        cost.textContent = entry.cost;
        headerRow.appendChild(cost);

        body.appendChild(headerRow);

        const desc = document.createElement('p');
        desc.textContent = `${entry.description}${entry.note ? ` ${entry.note}` : ''}`;
        body.appendChild(desc);

        li.appendChild(body);
        ul.appendChild(li);
      });
      container.appendChild(ul);
    });
  }
}

function renderAccessoriesSection(container) {
  const coins = loadCoins();
  const unlocked = loadUnlockedAccessories();
  const equipped = loadEquippedAccessories();
  
  // Header with coin count
  const header = document.createElement('div');
  header.className = 'accessories-header';
  header.innerHTML = `
    <h3>配件系统</h3>
    <div class="coin-display">💰 可用币数: <span class="coin-count">${coins}</span></div>
  `;
  container.appendChild(header);
  
  // Characters equipment slots
  const slotsContainer = document.createElement('div');
  slotsContainer.className = 'equipment-slots';
  
  ['adora', 'karma', 'dario'].forEach(charId => {
    const charData = characterData[charId];
    const slot = document.createElement('div');
    slot.className = 'equipment-slot';
    slot.dataset.character = charId;
    
    const equippedAccessory = equipped[charId];
    const accessoryName = equippedAccessory ? accessoryDefinitions[equippedAccessory]?.name : '空';
    
    slot.innerHTML = `
      <div class="slot-header">${charData.name}</div>
      <div class="slot-box" data-character="${charId}">
        ${equippedAccessory ? `<div class="equipped-accessory" data-accessory="${equippedAccessory}">${accessoryName}</div>` : '<div class="empty-slot">拖放配件到此处</div>'}
      </div>
    `;
    
    slotsContainer.appendChild(slot);
  });
  
  container.appendChild(slotsContainer);
  
  // Shop section
  const shopTitle = document.createElement('h4');
  shopTitle.textContent = '可解锁配件';
  shopTitle.style.marginTop = '24px';
  container.appendChild(shopTitle);
  
  const shop = document.createElement('div');
  shop.className = 'accessories-shop';
  
  Object.values(accessoryDefinitions).forEach(acc => {
    const isUnlocked = unlocked.includes(acc.id);
    const card = document.createElement('div');
    card.className = `accessory-card ${isUnlocked ? 'unlocked' : 'locked'}`;
    card.dataset.accessoryId = acc.id;
    card.draggable = isUnlocked;
    
    card.innerHTML = `
      <div class="accessory-name">${acc.name}</div>
      <div class="accessory-cost">💰 ${acc.cost} 币</div>
      <div class="accessory-description">${acc.description}</div>
      ${!isUnlocked ? `<button class="unlock-btn" data-accessory="${acc.id}">解锁</button>` : '<div class="unlocked-badge">✓ 已解锁</div>'}
    `;
    
    shop.appendChild(card);
  });
  
  container.appendChild(shop);
  
  // Add event listeners for unlock buttons
  container.querySelectorAll('.unlock-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const accessoryId = btn.dataset.accessory;
      const accessory = accessoryDefinitions[accessoryId];
      const currentCoins = loadCoins();
      
      if (currentCoins >= accessory.cost) {
        saveCoins(currentCoins - accessory.cost);
        unlockAccessory(accessoryId);
        showToast(`解锁成功：${accessory.name}`);
        // Re-render the accessories section
        const activeChar = document.querySelector('.character-tab.active').dataset.character;
        renderCharacterSection('accessories', activeChar);
      } else {
        showToast(`币数不足！需要 ${accessory.cost} 币，当前只有 ${currentCoins} 币`);
      }
    });
  });
  
  // Add drag and drop handlers
  setupAccessoriesDragDrop(container);
}

function setupAccessoriesDragDrop(container) {
  let draggedAccessoryId = null;
  let draggedFromCharacterId = null; // Track which character the accessory came from
  let dropSuccessful = false; // Track if drop was successful
  
  // Drag handlers for unlocked accessories
  container.querySelectorAll('.accessory-card.unlocked').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedAccessoryId = card.dataset.accessoryId;
      draggedFromCharacterId = null; // This is a new accessory from shop
      dropSuccessful = false;
      card.classList.add('dragging');
    });
    
    card.addEventListener('dragend', (e) => {
      card.classList.remove('dragging');
      draggedAccessoryId = null;
      draggedFromCharacterId = null;
      dropSuccessful = false;
    });
  });
  
  // Make equipped accessories draggable
  container.querySelectorAll('.equipped-accessory').forEach(equipped => {
    equipped.draggable = true;
    
    equipped.addEventListener('dragstart', (e) => {
      const slotBox = equipped.closest('.slot-box');
      draggedFromCharacterId = slotBox.dataset.character;
      draggedAccessoryId = equipped.dataset.accessory;
      dropSuccessful = false;
      equipped.classList.add('dragging');
    });
    
    equipped.addEventListener('dragend', (e) => {
      equipped.classList.remove('dragging');
      // If dragged but not dropped on a valid slot, unequip
      if (draggedFromCharacterId && !dropSuccessful) {
        unequipAccessory(draggedFromCharacterId);
        showToast(`已卸下配件`);
        
        // Re-render
        const activeChar = document.querySelector('.character-tab.active').dataset.character;
        renderCharacterSection('accessories', activeChar);
      }
      draggedAccessoryId = null;
      draggedFromCharacterId = null;
      dropSuccessful = false;
    });
    
    equipped.style.cursor = 'move';
    equipped.title = '拖拽到任意位置卸下';
  });
  
  // Drop handlers for equipment slots
  container.querySelectorAll('.slot-box').forEach(slotBox => {
    slotBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      slotBox.classList.add('drag-over');
    });
    
    slotBox.addEventListener('dragleave', (e) => {
      slotBox.classList.remove('drag-over');
    });
    
    slotBox.addEventListener('drop', (e) => {
      e.preventDefault();
      slotBox.classList.remove('drag-over');
      
      if (draggedAccessoryId) {
        const characterId = slotBox.dataset.character;
        
        // If dragging from another character, unequip from old character first
        if (draggedFromCharacterId && draggedFromCharacterId !== characterId) {
          unequipAccessory(draggedFromCharacterId);
        }
        
        equipAccessory(characterId, draggedAccessoryId);
        showToast(`装备成功：${characterData[characterId].name} 装备了 ${accessoryDefinitions[draggedAccessoryId].name}`);
        
        // Mark drop as successful to prevent unequip in dragend
        dropSuccessful = true;
        
        // Re-render
        const activeChar = document.querySelector('.character-tab.active').dataset.character;
        renderCharacterSection('accessories', activeChar);
      }
    });
  });
}

function renderSkillSelectionSection(container, characterId) {
  const selectedSkills = loadSelectedSkills();
  const characterSkills = skillLibrary[characterId] || [];
  
  // Header
  const header = document.createElement('div');
  header.className = 'skill-selection-header';
  header.innerHTML = `
    <h3>技能选择 - ${characterData[characterId].name}</h3>
    <p class="skill-selection-hint">从右侧技能库中拖拽技能到对应颜色的槽位。右键点击技能查看详情。</p>
  `;
  container.appendChild(header);
  
  // Main layout container
  const layout = document.createElement('div');
  layout.className = 'skill-selection-layout';
  
  // Left side - Selected skills slots
  const slotsContainer = document.createElement('div');
  slotsContainer.className = 'skill-slots-container';
  
  const slotColors = [
    { color: 'green', label: '绿色', limit: 1 },
    { color: 'blue', label: '蓝色', limit: 1 },
    { color: 'pink', label: '粉色', limit: 1 },
    { color: 'white', label: '白色', limit: 1 },
    { color: 'red', label: '红色', limit: 1 },
    { color: 'purple', label: '紫色', limit: 1 },
    { color: 'orange', label: '橙色', limit: 2 }
  ];
  
  slotColors.forEach(({ color, label, limit }) => {
    const slotGroup = document.createElement('div');
    slotGroup.className = 'skill-slot-group';
    
    const slotHeader = document.createElement('div');
    slotHeader.className = 'skill-slot-header';
    slotHeader.innerHTML = `<span class="skill-badge skill-${color}">${label}</span> <span class="slot-limit">(最多 ${limit} 个)</span>`;
    slotGroup.appendChild(slotHeader);
    
    const slots = document.createElement('div');
    slots.className = 'skill-slots';
    
    for (let i = 0; i < limit; i++) {
      const slot = document.createElement('div');
      slot.className = 'skill-slot';
      slot.dataset.character = characterId;
      slot.dataset.color = color;
      slot.dataset.slotIndex = i;
      
      let selectedSkill = null;
      if (color === 'orange') {
        selectedSkill = selectedSkills[characterId].orange[i] ? 
          characterSkills.find(s => s.id === selectedSkills[characterId].orange[i]) : null;
      } else {
        selectedSkill = selectedSkills[characterId][color] ? 
          characterSkills.find(s => s.id === selectedSkills[characterId][color]) : null;
      }
      
      if (selectedSkill) {
        const skillCard = createSkillCard(selectedSkill, true);
        slot.appendChild(skillCard);
      } else {
        const empty = document.createElement('div');
        empty.className = 'empty-skill-slot';
        empty.textContent = '拖放技能到此处';
        slot.appendChild(empty);
      }
      
      slots.appendChild(slot);
    }
    
    slotGroup.appendChild(slots);
    slotsContainer.appendChild(slotGroup);
  });
  
  layout.appendChild(slotsContainer);
  
  // Right side - Skill library
  const libraryContainer = document.createElement('div');
  libraryContainer.className = 'skill-library-container';
  
  const libraryHeader = document.createElement('h4');
  libraryHeader.textContent = '技能库';
  libraryContainer.appendChild(libraryHeader);
  
  // Group skills by color
  const skillsByColor = {};
  characterSkills.forEach(skill => {
    if (!skillsByColor[skill.color]) {
      skillsByColor[skill.color] = [];
    }
    skillsByColor[skill.color].push(skill);
  });
  
  // Render skills grouped by color
  Object.entries(skillsByColor).forEach(([color, skills]) => {
    const colorGroup = document.createElement('div');
    colorGroup.className = 'skill-color-group';
    
    const colorLabels = {
      green: '绿色', blue: '蓝色', pink: '粉色',
      white: '白色', red: '红色', purple: '紫色', orange: '橙色', gray: '灰色'
    };
    
    const groupHeader = document.createElement('div');
    groupHeader.className = 'skill-color-header';
    groupHeader.innerHTML = `<span class="skill-badge skill-${color}">${colorLabels[color] || color}</span>`;
    colorGroup.appendChild(groupHeader);
    
    const skillsList = document.createElement('div');
    skillsList.className = 'skills-list';
    
    skills.forEach(skill => {
      const skillCard = createSkillCard(skill, false);
      skillsList.appendChild(skillCard);
    });
    
    colorGroup.appendChild(skillsList);
    libraryContainer.appendChild(colorGroup);
  });
  
  layout.appendChild(libraryContainer);
  container.appendChild(layout);
  
  // Setup drag and drop and context menu
  setupSkillSelectionInteractions(container, characterId);
}

function createSkillCard(skill, isSelected) {
  const card = document.createElement('div');
  card.className = `skill-card skill-card-${skill.color}${isSelected ? ' selected' : ''}`;
  card.dataset.skillId = skill.id;
  card.dataset.skillColor = skill.color;
  card.draggable = true;
  
  card.innerHTML = `
    <div class="skill-card-header">
      <strong>${skill.name}</strong>
      <span class="skill-card-cost">${skill.cost}</span>
    </div>
    <div class="skill-card-desc">${skill.description}</div>
    <div class="skill-card-footer">
      <span class="skill-probability">${skill.probability}</span>
    </div>
  `;
  
  return card;
}

function setupSkillSelectionInteractions(container, characterId) {
  let draggedSkillId = null;
  let draggedFromSlot = null;
  let dropSuccessful = false;
  
  // Drag handlers for skill cards
  container.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedSkillId = card.dataset.skillId;
      draggedFromSlot = card.closest('.skill-slot');
      dropSuccessful = false;
      card.classList.add('dragging');
    });
    
    card.addEventListener('dragend', (e) => {
      card.classList.remove('dragging');
      
      // If dragged from a slot and not dropped successfully, deselect the skill
      if (draggedFromSlot && !dropSuccessful) {
        const fromColor = draggedFromSlot.dataset.color;
        unselectSkill(characterId, draggedSkillId, fromColor);
        showToast(`技能已取消选择`);
        
        // Re-render
        const activeTab = document.querySelector('.detail-tab.active').dataset.section;
        renderCharacterSection(activeTab, characterId);
      }
      
      draggedSkillId = null;
      draggedFromSlot = null;
      dropSuccessful = false;
    });
    
    // Right-click to show description
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const skill = findSkillById(card.dataset.skillId, characterId);
      if (skill) {
        showSkillDescription(skill, e.pageX, e.pageY);
      }
    });
  });
  
  // Drop handlers for skill slots
  container.querySelectorAll('.skill-slot').forEach(slot => {
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    
    slot.addEventListener('dragleave', (e) => {
      slot.classList.remove('drag-over');
    });
    
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      
      const slotColor = slot.dataset.color;
      const slotCharacter = slot.dataset.character;
      const slotIndex = parseInt(slot.dataset.slotIndex);
      
      const skill = findSkillById(draggedSkillId, characterId);
      if (!skill) return;
      
      // Check if skill color matches slot color
      if (skill.color !== slotColor) {
        const colorLabels = {
          green: '绿色', blue: '蓝色', pink: '粉色',
          white: '白色', red: '红色', purple: '紫色', orange: '橙色', gray: '灰色'
        };
        showToast(`技能颜色不匹配！此槽位只能放置${colorLabels[slotColor] || slotColor}技能`);
        return;
      }
      
      // Remove skill from previous slot if it was dragged from a slot
      if (draggedFromSlot) {
        const fromColor = draggedFromSlot.dataset.color;
        unselectSkill(characterId, draggedSkillId, fromColor);
      }
      
      // Add skill to new slot
      selectSkill(characterId, draggedSkillId, slotColor);
      
      // Mark drop as successful
      dropSuccessful = true;
      
      showToast(`技能已选择: ${skill.name}`);
      
      // Re-render
      const activeTab = document.querySelector('.detail-tab.active').dataset.section;
      renderCharacterSection(activeTab, characterId);
    });
  });
}

function findSkillById(skillId, characterId) {
  const skills = skillLibrary[characterId] || [];
  return skills.find(s => s.id === skillId);
}

function showSkillDescription(skill, x, y) {
  // Remove any existing description popups
  const existing = document.querySelector('.skill-description-popup');
  if (existing) {
    existing.remove();
  }
  
  const popup = document.createElement('div');
  popup.className = 'skill-description-popup';
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
  
  popup.innerHTML = `
    <div class="popup-header">
      <strong>${skill.name}</strong>
      <span class="skill-badge skill-${skill.color}">${skill.color}</span>
    </div>
    <div class="popup-body">
      <p><strong>消耗：</strong>${skill.cost}</p>
      <p><strong>效果：</strong>${skill.description}</p>
      <p><strong>出现概率：</strong>${skill.probability}</p>
      <p><strong>最低等级：</strong>${skill.minLevel}</p>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Close on click anywhere
  const closePopup = () => {
    popup.remove();
    document.removeEventListener('click', closePopup);
  };
  
  setTimeout(() => {
    document.addEventListener('click', closePopup);
  }, 100);
}

function initCharacterBoard() {
  // Check if accessories feature is unlocked and show tab
  if (isAccessoriesUnlocked()) {
    const accessoriesTab = document.getElementById('accessories-tab');
    if (accessoriesTab) {
      accessoriesTab.style.display = 'inline-block';
    }
  }
  
  // Check if skill selection feature is unlocked and show tab
  if (isSkillSelectionUnlocked()) {
    const skillSelectionTab = document.getElementById('skill-selection-tab');
    if (skillSelectionTab) {
      skillSelectionTab.style.display = 'inline-block';
    }
  }
  
  document.querySelectorAll('.character-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      renderCharacter(tab.dataset.character);
    });
  });

  document.querySelectorAll('.detail-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      renderCharacterSection(tab.dataset.section, document.querySelector('.character-tab.active').dataset.character);
    });
  });

  renderCharacter('adora');
}

const tutorialData = {
  basics: {
    title: '简短游戏玩法',
    sections: [
      {
        heading: 'HP / SP',
        bullets: [
          'HP 归零即死亡。',
          'SP 归零会令单位获得 1 层眩晕 Debuff 与 -1 步，眩晕结束后恢复部分 SP（数值因单位而异）。',
        ],
      },
      {
        heading: '步数',
        bullets: [
          '双方以 3 步开局，每回合 +1 步。',
          '若双方平均等级不同，较高者每回合额外 +2 步。',
          '步数用于移动、攻击与释放技能，默认上限 10（可被增减）。',
        ],
      },
      {
        heading: '回合',
        bullets: [
          '我方行动结束 + 敌方行动结束 = 1 个完整回合。',
        ],
      },
      {
        heading: '掩体',
        bullets: [
          '非范围（非 AOE）技能无法穿透掩体，也不能进入掩体格。',
        ],
      },
    ],
  },
  skills: {
    title: '技能',
    sections: [
      {
        heading: '颜色分类',
        bullets: [
          '绿色（1 步）：普通攻击。',
          '蓝色（2 步）：移动技能。',
          '红色（3 步及以上）：大招。',
          '白色（不定步数）：自带被动效果的技能。',
          '粉色（2 步及以上）：普通增益技能。',
          '橘色（2 步及以上）：特异增益技能。',
        ],
      },
      {
        heading: '特殊分类',
        bullets: [
          '多阶段攻击：一个技能分成多段伤害，可附加不同效果或范围。',
          '被动：无需主动发动即可生效的能力。',
        ],
      },
    ],
  },
  effects: {
    title: '特殊效果（目前有的）',
    sections: [
      {
        heading: '持续状态',
        bullets: [
          '流血：每回合 -5% HP，持续 2 回合，可叠加。',
          '眩晕层数：可叠加，达到门槛后触发眩晕 Debuff。',
          '眩晕 Debuff：目标失去行动 1 回合并消耗 1 层眩晕 Debuff。',
          '恐惧：下回合 -1 步，可叠加。',
          '鸡血：下一次攻击伤害 ×2 并消耗 1 层（每单位最多 1 层，若多阶段仅加于最后一段）。',
          '依赖：下一次攻击造成真实伤害并降自身 SP 至 0（每单位最多 1 层）。',
          '“恢复”Buff：下一个大回合开始时恢复 5 HP 并消耗 1 层，每个大回合仅触发 1 层，可叠加。',
        ],
      },
    ],
  },
  enemies: {
    title: '敌人',
    sections: [
      {
        heading: '敌人类型',
        bullets: [
          '普通：无特殊能力。',
          '高级：暂未实装。',
          '精英：拥有秒杀技能时改为固定伤害（如嗜血之握 100 HP），需累计 2 层眩晕层数触发 1 层眩晕 Debuff。',
          '小 Boss：秒杀技能改为 80 HP，需 3 层眩晕层数触发眩晕 Debuff，无法被强制位移。',
          'Boss：秒杀技能改为 75 HP，需 4 层眩晕层数触发眩晕 Debuff，无法被强制位移。',
          '特殊：？？？（尚未公开）。',
        ],
      },
    ],
  },
};

function renderTutorial(topic) {
  document.querySelectorAll('.tutorial-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.topic === topic);
  });

  const data = tutorialData[topic];
  const container = document.querySelector('.tutorial-content');
  if (!data) {
    container.innerHTML = '<p>该教学内容尚未开放。</p>';
    return;
  }

  container.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = data.title;
  container.appendChild(title);

  data.sections.forEach((section) => {
    const heading = document.createElement('h4');
    heading.textContent = section.heading;
    container.appendChild(heading);

    const list = document.createElement('ul');
    section.bullets.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    container.appendChild(list);
  });
}

function initTutorialBoard() {
  document.querySelectorAll('.tutorial-tab').forEach((tab) => {
    tab.addEventListener('click', () => renderTutorial(tab.dataset.topic));
  });

  renderTutorial('basics');
}

function bindDuoMode() {
  const duoLaunch = document.querySelector('[data-action="duo-mode"]');
  if (duoLaunch) {
    duoLaunch.addEventListener('click', () => {
      transitionTo('duo-confirm');
    });
  }

  document.querySelectorAll('.duo-confirm-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const playerKey = btn.dataset.player;
      if (!duoState[playerKey] || duoState[playerKey].confirmed) return;

      duoState[playerKey].confirmed = true;
      btn.classList.add('is-confirmed');
      btn.disabled = true;

      const slot = btn.closest('.duo-confirm-slot');
      if (slot) {
        const explosion = document.createElement('div');
        explosion.className = `duo-explosion ${playerKey === 'player1' ? 'blue' : 'red'}`;
        explosion.style.left = '50%';
        explosion.style.top = '50%';
        explosion.style.transform = 'translate(-50%, -50%)';
        slot.appendChild(explosion);
        explosion.addEventListener('animationend', () => explosion.remove());
      }

      playOneShotAudio(playerKey === 'player1' ? '确认1.mp3' : '确认2.mp3', 0.9);

      if (duoState.player1.confirmed && duoState.player2.confirmed) {
        playDuoTransition(duoPlayerConfigs.player1.transitionLabel, () => {
          setActiveScreen(duoPlayerConfigs.player1.screenId);
        });
      }
    });
  });

  document.querySelectorAll('.duo-player-confirm').forEach((btn) => {
    btn.addEventListener('click', () => {
      const playerKey = btn.dataset.player;
      if (playerKey === 'player1') {
        playDuoTransition(duoPlayerConfigs.player2.transitionLabel, () => {
          setActiveScreen(duoPlayerConfigs.player2.screenId);
        });
        return;
      }

      if (playerKey === 'player2') {
        stopStoryAudio({ reset: true });
        duoPrepController = null;
        saveDuoSelectedSkills({
          player1: duoState.player1.selections,
          player2: duoState.player2.selections,
        });
        showDuoBlackout({
          duration: 900,
          onComplete: () => {
            setActiveScreen('duo-battle');
          },
        });
      }
    });
  });
}

function bindFarPvpMode() {
  const farpvpLaunch = document.querySelector('[data-action="farpvp"]');
  if (farpvpLaunch) {
    farpvpLaunch.addEventListener('click', () => {
      transitionTo('farpvp-lobby');
    });
  }

  const createBtn = document.querySelector('.farpvp-create-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('farpvp-room-name');
      const passInput = document.getElementById('farpvp-room-pass');
      createFarPvpRoom(nameInput?.value || '', passInput?.value || '');
      if (nameInput) nameInput.value = '';
      if (passInput) passInput.value = '';
    });
  }

  const refreshBtn = document.querySelector('.farpvp-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', updateFarPvpLobbyList);
  }

  const joinCancel = document.querySelector('.farpvp-join-cancel');
  if (joinCancel) {
    joinCancel.addEventListener('click', closeFarPvpJoinModal);
  }

  const joinConfirm = document.querySelector('.farpvp-join-confirm');
  if (joinConfirm) {
    joinConfirm.addEventListener('click', () => {
      const input = document.getElementById('farpvp-join-pass');
      joinFarPvpRoom(farPvpJoinRoomId, input?.value || '');
      closeFarPvpJoinModal();
    });
  }

  document.querySelectorAll('.farpvp-slot').forEach((slot) => {
    slot.addEventListener('click', () => {
      if (slot.dataset.slot) {
        moveFarPvpPlayerSlot(slot.dataset.slot);
      }
    });
  });

  document.querySelectorAll('.farpvp-ready-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const playerKey = btn.dataset.player;
      const role = localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || 'player1';
      if (playerKey !== role) {
        showToast('只能准备自己的位置。');
        return;
      }
      toggleFarPvpReady(playerKey);
    });
  });

  const startBtn = document.querySelector('.farpvp-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', startFarPvpMatch);
  }

  document.querySelectorAll('.farpvp-player-confirm').forEach((btn) => {
    btn.addEventListener('click', () => {
      const playerKey = btn.dataset.player;
      const role = localStorage.getItem(STORAGE_KEY_FARPVP_ROLE) || 'player1';
      if (playerKey !== role) {
        showToast('等待对方确认。');
        return;
      }

      const cloud = getFarPvpCloud();
      const roomId = farPvpState.roomId || localStorage.getItem(STORAGE_KEY_FARPVP_ROOM);
      if (cloud && cloud.submitSelections && roomId) {
        try {
          btn.disabled = true;
        } catch (e) {
          // ignore
        }
        cloud
          .submitSelections(roomId, playerKey, farPvpState[playerKey]?.selections || createDuoSelections())
          .then(() => {
            farPvpState[playerKey].confirmed = true;
            showToast('已提交，等待对方。');
          })
          .catch((e) => {
            try {
              btn.disabled = false;
            } catch (err) {
              // ignore
            }
            showToast(e?.message || '提交失败。');
          });
        return;
      }

      if (playerKey === 'player1') {
        farPvpState.player1.confirmed = true;
        const room = getFarPvpRoom();
        if (room) {
          room.phase = 'select-player2';
          saveFarPvpRoom(room);
          farPvpState.room = room;
        }
        transitionTo('farpvp-player2');
        return;
      }
      if (playerKey === 'player2') {
        farPvpState.player2.confirmed = true;
        saveFarPvpSelectedSkills({
          player1: farPvpState.player1.selections,
          player2: farPvpState.player2.selections,
        });
        const room = getFarPvpRoom();
        if (room) {
          room.phase = 'battle';
          saveFarPvpRoom(room);
          farPvpState.room = room;
        }
        transitionTo('farpvp-battle');
      }
    });
  });
}

function bindNavigation() {
  document.querySelectorAll('[data-target]').forEach((btn) => {
    if (btn.classList.contains('menu-btn')) return;
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      toggleSettings(false);
      if (target === 'characters' && currentScreen !== 'stages') {
        showToast('请先进入关卡选择界面。');
        return;
      }
      transitionTo(target);
    });
  });
}

function initialiseMaskReveal() {
  maskBusy = true;
  let completed = false;

  const finish = (event) => {
    if (event.propertyName !== 'transform') return;
    mask.removeEventListener('transitionend', finish);
    completed = true;
    resetMaskState();
  };

  setTimeout(() => {
    mask.classList.remove('covering');
    mask.classList.add('revealing');
    mask.addEventListener('transitionend', finish);
  }, 300);

  setTimeout(() => {
    if (completed) return;
    mask.removeEventListener('transitionend', finish);
    completed = true;
    resetMaskState();
  }, 1500);
}

function init() {
  initialiseMaskReveal();
  initialiseMenu();
  initChapterBoard();
  initStageBoard();
  initCharacterBoard();
  initTutorialBoard();
  resetDuoSelections();
  bindDuoMode();
  bindFarPvpMode();
  bindNavigation();
  loadSevenSeasMapFromFile();
  renderStage('intro');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

document.addEventListener('keydown', (event) => {
  const { key, code } = event;

  if (storyState) {
    if (key === 'Escape') {
      event.preventDefault();
      finishStageStory(true);
      return;
    }

    if (key === 'Enter' || key === ' ' || key === 'ArrowRight' || code === 'Space' || code === 'Enter') {
      event.preventDefault();
      advanceStory();
      return;
    }
  }

  if (key === 'Escape') {
    toggleSettings(false);
  }
});







;


(function setupStageAmbient() {
  const ambientEl = document.getElementById('stage-ambient');
  if (!ambientEl) return;

  ambientEl.autoplay = false;
  ambientEl.loop = true;
  ambientEl.muted = false;

  const resetTime = () => {
    try {
      ambientEl.currentTime = 0;
    } catch {}
  };

  const safePlay = () => {
    try {
      const playPromise = ambientEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch {}
  };

  try {
    ambientEl.pause();
  } catch {}
  resetTime();

  stageAmbientController = {
    play({ restart = true } = {}) {
      if (!ambientEl) return;
      if (!restart && !ambientEl.paused) {
        return;
      }
      if (restart) {
        resetTime();
      }
      safePlay();
    },
    stop({ reset = true } = {}) {
      if (!ambientEl) return;
      if (!ambientEl.paused) {
        try {
          ambientEl.pause();
        } catch {}
      }
      if (reset) {
        resetTime();
      }
    },
    get element() {
      return ambientEl;
    },
    get isPlaying() {
      return ambientEl ? !ambientEl.paused : false;
    },
  };

  if (storyOverlay && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => {
      if (!stageAmbientController) return;
      if (overlayHasDockVisual()) {
        triggerDockAmbient();
      }
    });

    const observerConfig = {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-scene', 'data-background'],
      childList: true,
      subtree: true,
    };

    observer.observe(storyOverlay, observerConfig);
    if (storyBackdrop) {
      observer.observe(storyBackdrop, observerConfig);
    }
  }
})();


/* ===== BGM autoplay + LIVE amplitude follower (HARD-EDGED MAX) =====
   - Stronger, crisp motion (no jelly): big uniform scale + lift
   - Gated transients + micro-baseline so idle sections aren't dead
   - Small per-word lag for depth
================================================================= */
(function setupBGMAndBeat() {
  const audioEl = document.getElementById('bgm');
  if (!audioEl) return;

  const getTargets = () => {
    const menu = document.querySelector('.screen-menu.active');
    return menu ? Array.from(menu.querySelectorAll('.logo-word')) : [];
  };

  // Autoplay: muted -> fade in
  audioEl.autoplay = true;
  audioEl.loop = true;
  audioEl.volume = 0.0;
  audioEl.muted = true;

  let defaultVolume = 0.8;
  let fadeFrame = null;
  let fadeResolver = null;
  let wantsAudible = true;

  function safePlay() {
    try {
      const playPromise = audioEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch {}
  }

  const primeEvents = ['pointerdown', 'touchstart', 'keydown'];
  const primeAudio = () => {
    safePlay();
    primeEvents.forEach((evt) => document.removeEventListener(evt, primeAudio, true));
  };
  primeEvents.forEach((evt) => {
    document.addEventListener(evt, primeAudio, { once: true, capture: true });
  });

  function cancelFade() {
    if (fadeFrame) {
      cancelAnimationFrame(fadeFrame);
      fadeFrame = null;
    }
    if (fadeResolver) {
      fadeResolver();
      fadeResolver = null;
    }
  }

  function fadeTo(target, { duration = 800, easing } = {}) {
    if (!audioEl) return Promise.resolve();

    cancelFade();

    const clamped = Math.max(0, Math.min(1, target));
    const targetIsSilent = clamped <= 0;
    const startVolume = audioEl.volume;
    if (Math.abs(clamped - startVolume) <= 0.001 || duration <= 0) {
      audioEl.volume = clamped;
      if (clamped > 0 && audioEl.muted) {
        try {
          audioEl.muted = false;
        } catch {}
      } else if (targetIsSilent) {
        if (!audioEl.muted) {
          audioEl.muted = true;
        }
        if (!wantsAudible && !audioEl.paused) {
          try {
            audioEl.pause();
          } catch {}
        }
      }
      return Promise.resolve();
    }

    if (clamped > 0 && audioEl.muted) {
      try {
        audioEl.muted = false;
      } catch {}
    }

    if (!targetIsSilent && audioEl.paused) {
      safePlay();
    }

    const startTime = performance.now();
    const delta = clamped - startVolume;

    return new Promise((resolve) => {
      fadeResolver = resolve;
      function step(now) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const easedProgress = typeof easing === 'function' ? easing(t) : 1 - Math.pow(1 - t, 3);
        const eased = Math.max(0, Math.min(1, easedProgress));
        audioEl.volume = startVolume + delta * eased;
        if (t < 1) {
          fadeFrame = requestAnimationFrame(step);
        } else {
          fadeFrame = null;
          fadeResolver = null;
          if (targetIsSilent && !audioEl.muted) {
            audioEl.muted = true;
          }
          resolve();
        }
      }
      fadeFrame = requestAnimationFrame(step);
    });
  }

  function fadeIn(targetDuration = 1000) {
    wantsAudible = true;
    if (audioEl.paused) {
      safePlay();
    }
    return fadeTo(defaultVolume, { duration: targetDuration });
  }

  function fadeOut(targetDuration = 650) {
    wantsAudible = false;
    return fadeTo(0, {
      duration: targetDuration,
      easing: (t) => t * t,
    }).then(() => {
      if (!wantsAudible && !audioEl.paused) {
        try {
          audioEl.pause();
        } catch {}
      }
    });
  }

  audioEl.addEventListener(
    'playing',
    () => {
      if (wantsAudible) {
        fadeIn(1400);
      }
    },
    { once: true },
  );
  audioEl.addEventListener('canplay', safePlay, { once: true });
  safePlay();

  bgmController = {
    audio: audioEl,
    fadeTo,
    fadeIn: (duration) => fadeIn(duration ?? 1000),
    fadeOut: (duration) => fadeOut(duration ?? 650),
    get defaultVolume() {
      return defaultVolume;
    },
    set defaultVolume(value) {
      defaultVolume = Math.max(0, Math.min(1, Number.isFinite(value) ? value : defaultVolume));
    },
    get wantsAudible() {
      return wantsAudible;
    },
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (wantsAudible && audioEl.paused) {
        safePlay();
      }
    } else if (!wantsAudible && !audioEl.paused) {
      try {
        audioEl.pause();
      } catch {}
    }
  });

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('no webaudio');
    const ctx = new AudioCtx();
    const resume = () => { if (ctx.state !== 'running') ctx.resume().catch(()=>{}); };
    resume();

    const src = ctx.createMediaElementSource(audioEl);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.80; // more reactive for larger hits
    src.connect(analyser);
    analyser.connect(ctx.destination);

    const freq = new Uint8Array(analyser.frequencyBinCount);

    // Baselines / stats
    let ema = 120, varE = 0;
    const emaAlpha = 0.025;

    // Impulse gate
    let pulse = 0, hold = 0, lastFire = 0, lastImpulseAt = performance.now();
    let thresholdZ = 2.6;           // start fairly high
    const minGapMs = 70;            // allow denser hits
    const holdMs = 60;              // snappier hold
    const decayPerSec = 7.5;        // faster decay (crisp)

    // Micro baseline follower 0..1
    let baseEnv = 0;
    const baseUp = 0.3, baseDn = 0.12;

    // Slight lag for second word
    const perWordLag = [0, 10];

    function tick() {
      analyser.getByteFrequencyData(freq);

      // Weighted energy: emphasize low end but include some low-mid
      let low=0, nm=0, mid=0, nn=0;
      for (let i = 2; i < 26 && i < freq.length; i++) { low += freq[i]; nm++; }  // ~40-150Hz
      for (let i = 26; i < 46 && i < freq.length; i++) { mid += freq[i]; nn++; } // ~150-260Hz
      const eLow = low / Math.max(1,nm);
      const eMid = mid / Math.max(1,nn);
      const energy = 0.75*eLow + 0.25*eMid;

      // z-score gating
      ema = (1 - emaAlpha) * ema + emaAlpha * energy;
      const d = energy - ema;
      varE = (1 - emaAlpha) * varE + emaAlpha * d * d;
      const std = Math.sqrt(varE + 1e-6);
      const z = (energy - ema) / (std + 1e-6);

      const nowMs = performance.now();
      // Adaptive threshold window
      if (nowMs - lastImpulseAt > 1200)      thresholdZ = Math.max(1.8, thresholdZ - 0.08);
      else if (nowMs - lastImpulseAt < 400)  thresholdZ = Math.min(2.8, thresholdZ + 0.02);

      if (z > thresholdZ && (nowMs - lastFire) > minGapMs) {
        lastFire = nowMs;
        lastImpulseAt = nowMs;
        hold = holdMs;
        const kick = Math.min(2.0, (z - thresholdZ) * 0.7 + 0.7);
        pulse = Math.max(pulse, kick);
      }

      // Hold/decay
      const dt = 1/60;
      if (hold > 0) { hold -= dt*1000; if (hold < 0) hold = 0; }
      else { pulse *= Math.exp(-decayPerSec * dt); }

      // Baseline follower
      let tBase = (energy - ema + 1.4*std) / (3.0*std + 1e-6);
      tBase = Math.max(0, Math.min(1, tBase));
      baseEnv = baseEnv + (tBase > baseEnv ? baseUp : baseDn) * (tBase - baseEnv);

      // Map to visuals (MAX): big uniform scale + lift, minimal blur, higher contrast
      const amp = Math.min(2.2, pulse);
      const scale = 1 + baseEnv * 0.03 + amp * 0.18;  // up to ~+0.03 + +0.396
      const lift  = -(baseEnv * 2.5 + amp * 10);      // up to ~-22px
      const glow  = Math.min(1, baseEnv * 0.35 + amp * 0.85);
      const blur  = Math.round(8 + 14 * glow);        // keep blur modest (hard look)
      const drop  = Math.round(10 + 18 * glow);

      const targets = getTargets();
      if (targets.length) {
        targets.forEach((el, idx) => {
          if (!el._ampLag) el._ampLag = amp;
          const beta = perWordLag[idx % 2] ? 0.22 : 0.0;
          el._ampLag = el._ampLag + beta * (amp - el._ampLag);
          const a2 = perWordLag[idx % 2] ? el._ampLag : amp;

          el.style.transform = `translateY(${(- (baseEnv*2.5 + a2*10)).toFixed(2)}px) scale(${(1 + baseEnv*0.03 + a2*0.18).toFixed(4)})`;
          el.style.textShadow = `0 0 ${blur}px rgba(255,255,255,0.68)`;
          el.style.filter = `drop-shadow(0 0 ${drop}px rgba(255,255,255,0.52)) contrast(${(1 + (baseEnv*0.12 + a2*0.32)).toFixed(3)})`;
          el.style.letterSpacing = '';
          el.style.rotate = '';
        });
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  } catch (e) {
    // Fallback: uniform punch
    let t0 = performance.now();
    function breath() {
      const t = (performance.now() - t0) / 1000;
      const e = Math.max(0, Math.sin(t * 2 * Math.PI * 2));
      const s = 1 + e * 0.12;
      const y = -e * 8;
      const targets = getTargets();
      if (targets.length) {
        targets.forEach((el) => {
          el.style.transform = `translateY(${y.toFixed(2)}px) scale(${s.toFixed(4)})`;
          el.style.textShadow = `0 0 ${Math.round(18 + 14*e)}px rgba(255,255,255,0.6)`;
          el.style.filter = `drop-shadow(0 0 ${Math.round(14 + 14*e)}px rgba(255,255,255,0.48))`;
        });
      }
      requestAnimationFrame(breath);
    }
    requestAnimationFrame(breath);
  }
})();
