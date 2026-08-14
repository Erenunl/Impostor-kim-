const DEFAULT_WORDS = [
  "restaurant",
  "gemi",
  "otel",
  "korku evi",
  "lunapark",
  "havaalani",
  "sinema",
  "muzik festivali",
  "kamp alani",
  "kutuphane",
  "hastane",
  "dugun salonu",
  "tren istasyonu",
  "plaj",
  "kayak merkezi",
  "market",
  "universite",
  "uzay gemisi",
  "polis merkezi",
  "spor salonu",
];

const PHASE_LABELS = {
  lobby: "Lobi",
  reveal: "Kartlar",
  discussion: "Tartisma",
  voting: "Oylama",
  ended: "Bitti",
};

const app = document.querySelector("#app");
const local = {
  name: localStorage.getItem("impostor:name") || "",
  firebaseConfig: readJson(localStorage.getItem("impostor:firebaseConfig")),
};

const state = {
  firebase: null,
  uid: sessionStorage.getItem("impostor:uid") || "",
  roomCode: sessionStorage.getItem("impostor:room") || "",
  room: null,
  assignment: null,
  myVote: null,
  myGuess: null,
  loading: true,
  error: "",
  copyMessage: "",
  unsubscribers: [],
};

boot();

async function boot() {
  if (!state.uid) {
    state.uid = createLocalId();
    sessionStorage.setItem("impostor:uid", state.uid);
  }

  const config = getConfig();
  if (!isUsableConfig(config)) {
    state.loading = false;
    render();
    return;
  }

  try {
    state.firebase = await connectFirebase(config);
    state.uid = state.firebase.auth.currentUser.uid;
    sessionStorage.setItem("impostor:uid", state.uid);
    if (state.roomCode) {
      await subscribeRoom(state.roomCode);
    }
  } catch (error) {
    state.error = friendlyFirebaseError(error);
  } finally {
    state.loading = false;
    render();
  }
}

function getConfig() {
  if (isUsableConfig(local.firebaseConfig)) return local.firebaseConfig;
  if (isUsableConfig(window.IMPOSTOR_FIREBASE_CONFIG)) return window.IMPOSTOR_FIREBASE_CONFIG;
  if (typeof firebaseConfig !== "undefined" && isUsableConfig(firebaseConfig)) return firebaseConfig;
  return null;
}

async function connectFirebase(config) {
  const [{ initializeApp }, authModule, dbModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js"),
  ]);

  const appInstance = initializeApp(config);
  const auth = authModule.getAuth(appInstance);
  await authModule.signInAnonymously(auth);
  const db = dbModule.getDatabase(appInstance);

  return { app: appInstance, auth, db, authModule, dbModule };
}

function render() {
  const room = state.room;
  const players = getPlayers(room);
  const me = players.find((player) => player.id === state.uid);
  const isHost = Boolean(room && room.meta?.hostId === state.uid);
  const phase = room?.meta?.phase || "home";
  const ready = Boolean(state.firebase);

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="mark">?</div>
        <div>
          <h1>Impostor Kim?</h1>
          <div class="muted">Oda kodu, gizli kelime, sessiz oylama.</div>
        </div>
      </div>
      <div class="chip-row">
        <span class="chip"><strong>${ready ? "Canli" : "Kurulum gerekli"}</strong></span>
        ${room ? `<span class="chip">Oda <strong>${escapeHtml(state.roomCode)}</strong></span>` : ""}
        ${room ? `<span class="chip">${PHASE_LABELS[phase] || "Bekliyor"}</span>` : ""}
      </div>
    </header>

    ${state.error ? `<div class="notice danger-note">${escapeHtml(state.error)}</div>` : ""}
    ${state.loading ? loadingView() : ready ? gameView({ room, players, me, isHost, phase }) : setupView()}
  `;

  bindEvents();
}

function loadingView() {
  return `
    <section class="panel hero-panel">
      <div class="game-stage">
        <div>
          <h2>Oyun hazirlaniyor</h2>
          <p class="muted">Baglanti kuruluyor ve varsa son odana geri donuluyor.</p>
        </div>
      </div>
    </section>
  `;
}

function setupView() {
  return `
    <section class="grid">
      <div class="panel hero-panel">
        <div class="game-stage">
          <div>
            <h2>Once Firebase config gerekiyor</h2>
            <p class="muted">
              GitHub Pages statik calistigi icin odalari anlik baglamak adina Firebase Realtime Database kullaniliyor.
              Configi asagiya yapistirabilir ya da <strong>firebase-config.js</strong> dosyasina ekleyebilirsin.
            </p>
          </div>
          <div class="notice">
            Anonymous Authentication ve Realtime Database acildiktan sonra oyun herkesin tarayicisinda ayni odaya baglanir.
          </div>
        </div>
      </div>
      <aside class="panel">
        <div class="panel-inner">
          <h2>Config</h2>
          <label class="field">
            <span>Firebase web app config veya komple snippet</span>
            <textarea id="firebaseConfigInput" spellcheck="false" placeholder='const firebaseConfig = { apiKey: "...", databaseURL: "..." }'>${escapeHtml(
              JSON.stringify(local.firebaseConfig || getConfig() || window.IMPOSTOR_FIREBASE_CONFIG || {}, null, 2),
            )}</textarea>
          </label>
          <div class="actions">
            <button id="saveConfig">Kaydet ve baslat</button>
            <button class="ghost" id="clearConfig">Temizle</button>
          </div>
          <p class="footer-note">Detayli kurulum icin README dosyasina Firebase rules ornegi ekledim.</p>
        </div>
      </aside>
    </section>
  `;
}

function gameView({ room, players, me, isHost, phase }) {
  if (!local.name) return nameView();
  if (!room) return homeView();

  return `
    <section class="grid">
      <div class="panel hero-panel">
        ${phase === "lobby" ? lobbyStage(room, players, isHost) : ""}
        ${phase === "reveal" ? revealStage(isHost) : ""}
        ${phase === "discussion" ? discussionStage(room, isHost) : ""}
        ${phase === "voting" ? votingStage(room, players) : ""}
        ${phase === "ended" ? endedStage(room, isHost) : ""}
      </div>
      <aside class="panel">
        <div class="panel-inner">
          <div class="title-line">
            <div>
              <h2>Oyuncular</h2>
              <div class="muted">${players.length} kisi odada</div>
            </div>
            <div class="room-code">${escapeHtml(state.roomCode)}</div>
          </div>
          ${playersList(players, room)}
          <div class="divider"></div>
          <div class="actions">
            <button class="ghost" id="copyCode">Kodu kopyala</button>
            <button class="ghost" id="leaveRoom">Odadan cik</button>
          </div>
          ${state.copyMessage ? `<p class="footer-note">${escapeHtml(state.copyMessage)}</p>` : ""}
          ${me ? "" : `<p class="footer-note">Bu odada adin gorunmuyor; yeniden katilmayi dene.</p>`}
        </div>
      </aside>
    </section>
  `;
}

function nameView() {
  return `
    <section class="grid">
      <div class="panel hero-panel">
        <div class="game-stage">
          <div>
            <h2>Oyuna girecek ismini sec</h2>
            <p class="muted">Bu isim odadaki herkese gorunur. Sonradan yine degistirebilirsin.</p>
          </div>
        </div>
      </div>
      <aside class="panel">
        <div class="panel-inner">
          <label class="field">
            <span>Ismin</span>
            <input id="nameInput" maxlength="22" autocomplete="nickname" placeholder="Mesela Kerem" />
          </label>
          <button id="saveName">Devam et</button>
        </div>
      </aside>
    </section>
  `;
}

function homeView() {
  return `
    <section class="grid">
      <div class="panel hero-panel">
        <div class="game-stage">
          <div>
            <h2>Oda kur, arkadaslar kodla girsin</h2>
            <p class="muted">
              Oda sahibi kelime havuzunu duzenler, oyunu baslatir ve tur akisini kontrol eder.
              Impostor dahil herkes gizli oy kullanir.
            </p>
          </div>
          <div class="split">
            <div class="card panel-inner">
              <h3>Oyuncular</h3>
              <p class="muted">Herkese ayni kelime gider. Secilen bir kisi sadece "Impostor ???" gorur.</p>
            </div>
            <div class="card panel-inner">
              <h3>Kazanma</h3>
              <p class="muted">Impostor kelimeyi bilirse kazanir. Oyuncular yanlis kisiyi atarsa yine kaybeder.</p>
            </div>
          </div>
        </div>
      </div>
      <aside class="panel">
        <div class="panel-inner">
          <h2>Basla</h2>
          <label class="field">
            <span>Ismin</span>
            <input id="nameInput" maxlength="22" value="${escapeHtml(local.name)}" />
          </label>
          <button id="saveName">Ismi kaydet</button>
          <div class="divider"></div>
          <button id="createRoom" class="success">Oda olustur</button>
          <div class="divider"></div>
          <label class="field">
            <span>Oda kodu</span>
            <input id="joinCode" maxlength="6" placeholder="AB12C" />
          </label>
          <button id="joinRoom">Odaya baglan</button>
        </div>
      </aside>
    </section>
  `;
}

function lobbyStage(room, players, isHost) {
  const settings = room.settings || defaultSettings();
  return `
    <div class="game-stage">
      <div>
        <h2>Lobi hazir</h2>
        <p class="muted">En az 3 kisi olunca oda sahibi oyunu baslatabilir.</p>
      </div>
      ${
        isHost
          ? `
        <div class="card panel-inner">
          <h3>Oda ayarlari</h3>
          <label class="field">
            <span>Kelime havuzu</span>
            <textarea id="wordPool">${escapeHtml((settings.words || DEFAULT_WORDS).join("\n"))}</textarea>
          </label>
          <label class="field">
            <span>Impostor sayisi</span>
            <select id="impostorCount">
              <option value="1" ${settings.impostorCount === 1 ? "selected" : ""}>1 impostor</option>
              <option value="2" ${settings.impostorCount === 2 ? "selected" : ""}>2 impostor</option>
            </select>
          </label>
          <div class="actions">
            <button id="saveSettings" class="ghost">Ayarlari kaydet</button>
            <button id="startGame" ${players.length < 3 ? "disabled" : ""}>Oyunu baslat</button>
          </div>
        </div>
      `
          : `<div class="notice">Oda sahibinin oyunu baslatmasi bekleniyor.</div>`
      }
    </div>
  `;
}

function revealStage(isHost) {
  const isImpostor = state.assignment?.role === "impostor";
  return `
    <div class="game-stage">
      <div class="role-card ${isImpostor ? "impostor" : "player"}">
        <div>
          <div class="role-label">${isImpostor ? "Gizli rolun" : "Kelimen"}</div>
          <div class="secret-word">${isImpostor ? "Impostor ???" : escapeHtml(state.assignment?.word || "Bekleniyor")}</div>
        </div>
      </div>
      <div class="actions">
        ${
          isHost
            ? `<button id="startDiscussion">Herkes gordu, tartismaya gec</button>`
            : `<span class="muted">Herkes kartini gordugunde oda sahibi tartismayi baslatir.</span>`
        }
      </div>
    </div>
  `;
}

function discussionStage(room, isHost) {
  const isImpostor = state.assignment?.role === "impostor";
  const guessed = Boolean(state.myGuess);
  return `
    <div class="game-stage">
      <div>
        <h2>Tartisma zamani</h2>
        <p class="muted">Sirayla konusun, ipucu verin, ama kelimeyi direkt soylemeyin.</p>
      </div>
      ${
        isImpostor
          ? `
        <div class="card panel-inner">
          <h3>Impostor tahmini</h3>
          <p class="muted">Oyuncular birini atmadan kelimeyi dogru tahmin edersen kazanirsin. Her tur tek tahmin hakkin var.</p>
          <label class="field">
            <span>Kelime tahminin</span>
            <input id="guessInput" ${guessed ? "disabled" : ""} placeholder="Kelimeyi yaz" />
          </label>
          <button id="submitGuess" class="danger" ${guessed ? "disabled" : ""}>Tahmin et</button>
        </div>
      `
          : `<div class="notice">Impostoru bulmaya calis. Oylama baslayana kadar kararini netlestir.</div>`
      }
      <div class="actions">
        ${isHost ? `<button id="beginVote">Oylamaya gec</button>` : `<span class="muted">Oylamayi oda sahibi baslatir.</span>`}
      </div>
    </div>
  `;
}

function votingStage(room, players) {
  const voteReceipts = room.voteReceipts?.current || {};
  const activePlayers = players.filter((player) => !player.eliminated);
  const voteCount = Object.keys(voteReceipts).filter((id) => activePlayers.some((player) => player.id === id)).length;
  const needed = majority(activePlayers.length);
  const myVote = state.myVote?.targetId || "";

  return `
    <div class="game-stage">
      <div>
        <h2>Gizli oylama</h2>
        <p class="muted">${voteCount}/${activePlayers.length} oy geldi. Birini atmak icin ${needed} oy gerekiyor.</p>
      </div>
      <div class="vote-list">
        ${activePlayers
          .map(
            (player) => `
          <button class="vote-option ${myVote === player.id ? "selected" : ""}" data-vote="${player.id}">
            ${escapeHtml(player.name)}
          </button>
        `,
          )
          .join("")}
      </div>
      <div class="notice">Kimsenin kime oy attigi ekranda gosterilmez. Sadece toplam ilerleme gorunur.</div>
    </div>
  `;
}

function endedStage(room, isHost) {
  const result = room.result || {};
  const isPlayersWin = result.winner === "players";
  return `
    <div class="game-stage">
      <div class="notice ${isPlayersWin ? "good-note" : "danger-note"}">
        <h2>${escapeHtml(result.title || "Tur bitti")}</h2>
        <p>${escapeHtml(result.body || "Sonuc hesaplandi.")}</p>
      </div>
      <div class="chip-row">
        <span class="chip">Kelime <strong>${escapeHtml(room.meta?.word || "?")}</strong></span>
        ${result.eliminatedName ? `<span class="chip">Atilan <strong>${escapeHtml(result.eliminatedName)}</strong></span>` : ""}
      </div>
      <div class="actions">
        ${isHost ? `<button id="newRound">Yeni tur lobisine don</button>` : `<span class="muted">Yeni turu oda sahibi baslatabilir.</span>`}
      </div>
    </div>
  `;
}

function playersList(players, room) {
  const hostId = room?.meta?.hostId;
  if (!players.length) return `<p class="muted">Henuz kimse yok.</p>`;

  return `
    <div class="players">
      ${players
        .map(
          (player) => `
        <div class="player">
          <div class="player-name">
            <span class="dot ${player.online ? "on" : ""}"></span>
            <span>${escapeHtml(player.name)}</span>
          </div>
          <div class="chip-row">
            ${player.id === hostId ? `<span class="tag">Sahip</span>` : ""}
            ${player.eliminated ? `<span class="tag">Atilmis</span>` : ""}
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function bindEvents() {
  bind("#saveConfig", "click", saveConfig);
  bind("#clearConfig", "click", clearConfig);
  bind("#saveName", "click", saveName);
  bind("#createRoom", "click", createRoom);
  bind("#joinRoom", "click", joinRoom);
  bind("#leaveRoom", "click", leaveRoom);
  bind("#copyCode", "click", copyCode);
  bind("#saveSettings", "click", saveSettings);
  bind("#startGame", "click", startGame);
  bind("#startDiscussion", "click", () => setPhase("discussion"));
  bind("#beginVote", "click", beginVote);
  bind("#submitGuess", "click", submitGuess);
  bind("#newRound", "click", resetToLobby);

  document.querySelectorAll("[data-vote]").forEach((button) => {
    button.addEventListener("click", () => castVote(button.dataset.vote));
  });

  const joinCode = document.querySelector("#joinCode");
  if (joinCode) {
    joinCode.addEventListener("input", () => {
      joinCode.value = normalizeCode(joinCode.value);
    });
  }
}

function bind(selector, event, handler) {
  const element = document.querySelector(selector);
  if (element) element.addEventListener(event, handler);
}

async function saveConfig() {
  const input = document.querySelector("#firebaseConfigInput");
  try {
    const parsed = parseFirebaseConfigInput(input.value);
    if (!isUsableConfig(parsed)) throw new Error("Eksik config");
    localStorage.setItem("impostor:firebaseConfig", JSON.stringify(parsed));
    local.firebaseConfig = parsed;
    state.error = "";
    state.loading = true;
    render();
    await boot();
  } catch {
    state.error = "Config eksik ya da hatali gorunuyor. Firebase'in verdigi config objesini komple yapistirabilirsin.";
    render();
  }
}

function clearConfig() {
  localStorage.removeItem("impostor:firebaseConfig");
  local.firebaseConfig = null;
  state.error = "";
  render();
}

async function saveName() {
  const input = document.querySelector("#nameInput");
  const nextName = cleanName(input?.value || "");
  if (!nextName) {
    state.error = "Oyuna girmek icin bir isim yazmalisin.";
    render();
    return;
  }

  local.name = nextName;
  localStorage.setItem("impostor:name", nextName);
  state.error = "";

  if (state.roomCode && state.firebase) await upsertPlayer(state.roomCode);
  render();
}

async function createRoom() {
  if (!ensureReady()) return;
  await saveNameFromCurrentInput();
  if (!local.name) return;

  const code = await uniqueCode();
  const now = Date.now();
  const room = {
    meta: {
      code,
      hostId: state.uid,
      phase: "lobby",
      round: 0,
      createdAt: now,
      updatedAt: now,
      word: "",
    },
    settings: defaultSettings(),
    players: {
      [state.uid]: playerRecord(),
    },
  };

  await writeRoom(code, room);
  await subscribeRoom(code);
}

async function joinRoom() {
  if (!ensureReady()) return;
  await saveNameFromCurrentInput();
  if (!local.name) return;

  const input = document.querySelector("#joinCode");
  const code = normalizeCode(input?.value || "");
  if (!code) {
    state.error = "Oda kodunu yazmalisin.";
    render();
    return;
  }

  const exists = await roomExists(code);
  if (!exists) {
    state.error = "Bu kodla bir oda bulunamadi.";
    render();
    return;
  }

  await upsertPlayer(code);
  await subscribeRoom(code);
}

async function leaveRoom() {
  if (!state.roomCode || !state.firebase) return;
  const { ref, update } = state.firebase.dbModule;
  await update(ref(state.firebase.db, `rooms/${state.roomCode}/players/${state.uid}`), {
    online: false,
  });
  cleanupSubscriptions();
  state.roomCode = "";
  state.room = null;
  state.assignment = null;
  state.myVote = null;
  state.myGuess = null;
  sessionStorage.removeItem("impostor:room");
  render();
}

async function copyCode() {
  if (!state.roomCode) return;
  try {
    await navigator.clipboard.writeText(state.roomCode);
    state.copyMessage = "Oda kodu kopyalandi.";
  } catch {
    state.copyMessage = `Kod: ${state.roomCode}`;
  }
  render();
}

async function saveSettings() {
  if (!isHost()) return;
  const settings = readSettingsFromForm(state.room?.settings || defaultSettings());
  if (settings.words.length < 4) {
    state.error = "Kelime havuzunda en az 4 kelime olsun.";
    render();
    return;
  }

  await updateRoom({
    settings,
    "meta/updatedAt": Date.now(),
  });
}

async function startGame() {
  if (!isHost()) return;
  const settings = readSettingsFromForm(state.room?.settings || defaultSettings());
  if (settings.words.length < 4) {
    state.error = "Kelime havuzunda en az 4 kelime olsun.";
    render();
    return;
  }

  const players = getPlayers(state.room).filter((player) => player.online && !player.eliminated);
  const impostorCount = Math.min(settings.impostorCount || 1, Math.max(1, players.length - 2));

  if (players.length < 3) {
    state.error = "Oyun icin en az 3 kisi gerekiyor.";
    render();
    return;
  }

  const word = pick(settings.words || DEFAULT_WORDS);
  const impostors = shuffle(players).slice(0, impostorCount).map((player) => player.id);
  const assignments = {};
  players.forEach((player) => {
    assignments[player.id] = {
      role: impostors.includes(player.id) ? "impostor" : "player",
      word,
    };
  });

  await updateRoom({
    settings,
    voteReceipts: null,
    result: null,
    "meta/word": word,
    "meta/phase": "reveal",
    "meta/round": (state.room.meta?.round || 0) + 1,
    "meta/updatedAt": Date.now(),
  });

  await updateRoot({
    [`assignments/${state.roomCode}`]: assignments,
    [`guesses/${state.roomCode}`]: null,
    [`votes/${state.roomCode}`]: null,
  });
}

async function setPhase(phase) {
  if (!isHost()) return;
  await updateRoom({
    "meta/phase": phase,
    "meta/updatedAt": Date.now(),
  });
}

async function beginVote() {
  if (!isHost()) return;
  await updateRoot({
    [`rooms/${state.roomCode}/voteReceipts/current`]: null,
    [`votes/${state.roomCode}/current`]: null,
    [`rooms/${state.roomCode}/meta/phase`]: "voting",
    [`rooms/${state.roomCode}/meta/updatedAt`]: Date.now(),
  });
}

async function submitGuess() {
  const guessInput = document.querySelector("#guessInput");
  const guess = normalizeGuess(guessInput?.value || "");
  const word = normalizeGuess(state.room?.meta?.word || "");
  if (!guess) return;

  const correct = guess === word;
  await updateRoot({
    [`guesses/${state.roomCode}/${state.uid}`]: {
      guess,
      correct,
      at: Date.now(),
    },
    [`rooms/${state.roomCode}/guessReceipts/${state.uid}`]: true,
    [`rooms/${state.roomCode}/meta/updatedAt`]: Date.now(),
  });
}

async function castVote(targetId) {
  if (!state.roomCode || !targetId) return;
  const activePlayers = getPlayers(state.room).filter((player) => !player.eliminated);
  if (!activePlayers.some((player) => player.id === targetId)) return;

  await updateRoot({
    [`votes/${state.roomCode}/current/${state.uid}`]: {
      targetId,
      at: Date.now(),
    },
    [`rooms/${state.roomCode}/voteReceipts/current/${state.uid}`]: true,
    [`rooms/${state.roomCode}/meta/updatedAt`]: Date.now(),
  });

  setTimeout(resolveVotes, 80);
}

async function resolveGuesses() {
  if (!isHost()) return;
  const room = state.room;
  if (!room || room.meta?.phase !== "discussion") return;
  const guesses = await readGuesses();
  const correctEntry = Object.entries(guesses).find(([, guess]) => guess?.correct);
  if (!correctEntry) return;

  const [playerId] = correctEntry;
  const player = getPlayers(room).find((item) => item.id === playerId);
  await updateRoom(
    resultUpdate("impostor", "Impostor kazandi", `${player?.name || "Impostor"} kelimeyi dogru tahmin etti.`),
  );
}

async function resolveVotes() {
  if (!isHost()) return;
  const room = state.room;
  if (!room || room.meta?.phase !== "voting") return;
  const activePlayers = getPlayers(room).filter((player) => !player.eliminated);
  const votes = await readVotes();
  const counts = {};

  Object.values(votes).forEach((vote) => {
    if (vote?.targetId && activePlayers.some((player) => player.id === vote.targetId)) {
      counts[vote.targetId] = (counts[vote.targetId] || 0) + 1;
    }
  });

  const threshold = majority(activePlayers.length);
  const eliminatedId = Object.keys(counts).find((id) => counts[id] >= threshold);
  if (!eliminatedId) {
    const allVoted = activePlayers.every((player) => votes[player.id]);
    if (allVoted && isHost()) {
      await updateRoot({
        [`votes/${state.roomCode}/current`]: null,
        [`rooms/${state.roomCode}/voteReceipts/current`]: null,
        [`rooms/${state.roomCode}/meta/updatedAt`]: Date.now(),
      });
    }
    return;
  }

  const assignment = await readAssignment(eliminatedId);
  const eliminated = activePlayers.find((player) => player.id === eliminatedId);
  const playersWon = assignment?.role === "impostor";
  await updateRoot({
    [`rooms/${state.roomCode}/players/${eliminatedId}/eliminated`]: true,
    ...prefixRoomUpdate(resultUpdate(
      playersWon ? "players" : "impostor",
      playersWon ? "Oyuncular kazandi" : "Impostor kazandi",
      playersWon
        ? `${eliminated?.name || "Bir oyuncu"} impostor olarak bulundu.`
        : `${eliminated?.name || "Bir oyuncu"} atildi ama impostor degildi.`,
      eliminated?.name || "",
    )),
  });
}

async function resetToLobby() {
  if (!isHost()) return;
  const playerUpdates = {};
  getPlayers(state.room).forEach((player) => {
    playerUpdates[`players/${player.id}/eliminated`] = false;
  });

  await updateRoot({
    ...prefixRoomUpdate({
      ...playerUpdates,
      result: null,
      guessReceipts: null,
      "meta/phase": "lobby",
      "meta/word": "",
      "meta/updatedAt": Date.now(),
    }),
    [`assignments/${state.roomCode}`]: null,
    [`guesses/${state.roomCode}`]: null,
    [`votes/${state.roomCode}`]: null,
    [`rooms/${state.roomCode}/voteReceipts`]: null,
  });
}

async function subscribeRoom(code) {
  cleanupSubscriptions();
  const { ref, onValue, onDisconnect, update } = state.firebase.dbModule;
  state.roomCode = code;
  state.assignment = null;
  state.myVote = null;
  state.myGuess = null;
  sessionStorage.setItem("impostor:room", code);
  await upsertPlayer(code);
  onDisconnect(ref(state.firebase.db, `rooms/${code}/players/${state.uid}/online`)).set(false);
  await update(ref(state.firebase.db, `rooms/${code}/players/${state.uid}`), playerRecord());

  state.unsubscribers.push(
    onValue(ref(state.firebase.db, `rooms/${code}`), (snapshot) => {
      state.room = snapshot.val();
      if (!state.room) {
        cleanupSubscriptions();
        state.roomCode = "";
        state.assignment = null;
        sessionStorage.removeItem("impostor:room");
        state.error = "Oda kapatilmis ya da bulunamiyor.";
      }
      render();
      if (state.room?.meta?.phase === "discussion") resolveGuesses();
      if (state.room?.meta?.phase === "voting") resolveVotes();
    }),
  );

  state.unsubscribers.push(
    onValue(ref(state.firebase.db, `assignments/${code}/${state.uid}`), (snapshot) => {
      state.assignment = snapshot.val();
      render();
    }),
  );

  state.unsubscribers.push(
    onValue(ref(state.firebase.db, `votes/${code}/current/${state.uid}`), (snapshot) => {
      state.myVote = snapshot.val();
      render();
    }),
  );

  state.unsubscribers.push(
    onValue(ref(state.firebase.db, `guesses/${code}/${state.uid}`), (snapshot) => {
      state.myGuess = snapshot.val();
      render();
    }),
  );
}

function cleanupSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

async function upsertPlayer(code) {
  const { ref, update } = state.firebase.dbModule;
  await update(ref(state.firebase.db, `rooms/${code}/players/${state.uid}`), playerRecord());
}

async function writeRoom(code, room) {
  const { ref, set } = state.firebase.dbModule;
  await set(ref(state.firebase.db, `rooms/${code}`), room);
}

async function updateRoom(patch) {
  const { ref, update } = state.firebase.dbModule;
  await update(ref(state.firebase.db, `rooms/${state.roomCode}`), patch);
}

async function updateRoot(patch) {
  const { ref, update } = state.firebase.dbModule;
  await update(ref(state.firebase.db), patch);
}

async function readVotes() {
  const { ref, get } = state.firebase.dbModule;
  const snapshot = await get(ref(state.firebase.db, `votes/${state.roomCode}/current`));
  return snapshot.val() || {};
}

async function readGuesses() {
  const { ref, get } = state.firebase.dbModule;
  const snapshot = await get(ref(state.firebase.db, `guesses/${state.roomCode}`));
  return snapshot.val() || {};
}

async function readAssignment(playerId) {
  const { ref, get } = state.firebase.dbModule;
  const snapshot = await get(ref(state.firebase.db, `assignments/${state.roomCode}/${playerId}`));
  return snapshot.val();
}

async function roomExists(code) {
  const { ref, get } = state.firebase.dbModule;
  const snapshot = await get(ref(state.firebase.db, `rooms/${code}/meta/code`));
  return snapshot.exists();
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = randomCode();
    if (!(await roomExists(code))) return code;
  }
  throw new Error("Oda kodu uretilemedi.");
}

function resultUpdate(winner, title, body, eliminatedName = "") {
  return {
    result: {
      winner,
      title,
      body,
      eliminatedName,
      at: Date.now(),
    },
    "meta/phase": "ended",
    "meta/updatedAt": Date.now(),
  };
}

function prefixRoomUpdate(patch) {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [`rooms/${state.roomCode}/${key}`, value]));
}

function defaultSettings() {
  return {
    words: DEFAULT_WORDS,
    impostorCount: 1,
  };
}

function playerRecord() {
  return {
    name: local.name,
    online: true,
    eliminated: false,
    lastSeen: Date.now(),
  };
}

function getPlayers(room) {
  return Object.entries(room?.players || {})
    .map(([id, player]) => ({ id, ...player }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));
}

function isHost() {
  return Boolean(state.room?.meta?.hostId === state.uid);
}

function ensureReady() {
  if (state.firebase) return true;
  state.error = "Once Firebase configini kaydedip baglantiyi baslat.";
  render();
  return false;
}

async function saveNameFromCurrentInput() {
  const input = document.querySelector("#nameInput");
  if (!input) return;
  const nextName = cleanName(input.value);
  if (nextName && nextName !== local.name) {
    local.name = nextName;
    localStorage.setItem("impostor:name", nextName);
  }
}

function majority(count) {
  return Math.floor(count / 2) + 1;
}

function parseWords(value) {
  return value
    .split(/\n|,/)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function readSettingsFromForm(fallback) {
  const formWords = document.querySelector("#wordPool")?.value;
  const words = formWords ? parseWords(formWords) : fallback.words || DEFAULT_WORDS;
  const impostorCount = Number(document.querySelector("#impostorCount")?.value || fallback.impostorCount || 1);
  return {
    words,
    impostorCount: Math.min(Math.max(impostorCount, 1), 2),
  };
}

function normalizeCode(value) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function createLocalId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = Math.random().toString(36).slice(2);
  return `local-${Date.now().toString(36)}-${random}`;
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 22);
}

function normalizeGuess(value) {
  return value
    .trim()
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function isUsableConfig(config) {
  return Boolean(config?.apiKey && config?.databaseURL && config?.projectId && config?.appId);
}

function parseFirebaseConfigInput(value) {
  const text = value.trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const objectText = extractObjectLiteral(text);
    if (!objectText) throw new Error("Config bulunamadi");
    return Function(`"use strict"; return (${objectText});`)();
  }
}

function extractObjectLiteral(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return "";
  return text.slice(start, end + 1);
}

function readJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function friendlyFirebaseError(error) {
  const message = error?.message || "";
  if (message.includes("CONFIGURATION_NOT_FOUND")) {
    return "Firebase Authentication ayarlarinda Anonymous giris acik degil.";
  }
  if (message.includes("permission_denied")) {
    return "Firebase Realtime Database rules bu oda islemini engelledi.";
  }
  return "Firebase baglantisi kurulurken sorun oldu. Config ve databaseURL degerlerini kontrol et.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
