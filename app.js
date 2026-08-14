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
  "metro",
  "akvaryum",
  "hayvanat bahcesi",
  "müze",
  "tiyatro",
  "konser salonu",
  "basketbol sahasi",
  "futbol stadyumu",
  "yuzme havuzu",
  "berber",
  "kuafor",
  "eczane",
  "pastane",
  "kahveci",
  "kitapci",
  "avm",
  "oyuncakci",
  "benzinlik",
  "oto yikama",
  "tamirci",
  "mahkeme",
  "belediye",
  "postane",
  "banka",
  "ofis",
  "fabrika",
  "insaat alani",
  "ciftlik",
  "sera",
  "orman",
  "dag evi",
  "magara",
  "selale",
  "ada",
  "liman",
  "denizalti",
  "korsan gemisi",
  "askeri üs",
  "hapishane",
  "laboratuvar",
  "robot fabrikasi",
  "zombi siginagi",
  "perili kosk",
  "sihir okulu",
  "kraliyet sarayi",
  "antik tapinak",
  "piramit",
  "arkeoloji kazi alani",
  "film seti",
  "haber stüdyosu",
  "radyo istasyonu",
  "gece kulubu",
  "karaoke bar",
  "dondurmaci",
  "pizzaci",
  "sushi restorani",
  "kebapci",
  "okul kantini",
  "sinif",
  "yurt",
  "anaokulu",
  "veteriner",
  "dis hekimi",
  "ambulans",
  "itfaiye",
  "otobus",
  "ucak",
  "balon",
  "helikopter",
  "taksi",
  "bisikletci",
  "tekne turu",
  "kruvaziyer",
  "marina",
  "spa",
  "hamam",
  "sauna",
  "dovme studyosu",
  "terzi",
  "fotograf studyosu",
  "düğün",
  "dogum gunu partisi",
  "piknik",
  "barbeku",
  "kamp atesi",
  "sirk",
  "kaçış odasi",
  "laser tag",
  "bowling salonu",
  "bilardo salonu",
  "internet kafe",
  "espor arenasi",
  "satranç kulubu",
  "resim atolyasi",
  "mutfak atolyasi",
  "dans kursu",
  "dil kursu",
  "seminer salonu",
  "konferans",
  "secim sandigi",
  "pazar yeri",
  "bit pazari",
  "balik hali",
  "kasap",
  "manav",
  "fırın",
  "çiçekçi",
  "mezarlik",
  "dini mekan",
  "tren",
  "feribot",
  "otoban",
  "sinir kapisi",
  "otel lobisi",
  "otel odasi",
  "teras",
  "catı",
  "bodrum",
  "asansor",
  "gizli oda",
  "hazine odasi",
  "uzay istasyonu",
  "ay üssü",
  "mars kolonisi",
  "zaman makinesi",
  "sanal gerçeklik merkezi",
];

const PHASE_LABELS = {
  lobby: "Lobi",
  reveal: "Kartlar",
  discussion: "Tartisma",
  voting: "Oylama",
  ended: "Bitti",
};

const AVATARS = ["?", "!", "#", "*", "@", "%", "&", "+", "1", "2", "3", "4"];

const app = document.querySelector("#app");
const local = {
  name: localStorage.getItem("impostor:name") || "",
  passwordHash: localStorage.getItem("impostor:passwordHash") || "",
  avatar: localStorage.getItem("impostor:avatar") || "",
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
  timeoutResolving: false,
  voteStartResolving: false,
  uiTimer: null,
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
  const reminder = roleReminder(phase);

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="mark">?</div>
        <div>
          <h1>Impostor Kim?</h1>
          <div class="muted">Oda kodu, gizli kelime, sessiz oylama.</div>
        </div>
      </div>
      <div class="status-stack">
        <div class="chip-row">
          <span class="chip"><strong>${ready ? "Canli" : "Kurulum gerekli"}</strong></span>
          ${room ? `<span class="chip">Oda <strong>${escapeHtml(state.roomCode)}</strong></span>` : ""}
          ${room ? `<span class="chip">${PHASE_LABELS[phase] || "Bekliyor"}</span>` : ""}
        </div>
        ${reminder ? `<div class="role-reminder">${escapeHtml(reminder)}</div>` : ""}
      </div>
    </header>

    ${state.error ? `<div class="notice danger-note">${escapeHtml(state.error)}</div>` : ""}
    ${state.loading ? loadingView() : ready ? gameView({ room, players, me, isHost, phase }) : setupView()}
  `;

  bindEvents();
  syncUiTimer();
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
          ${playersList(players, room, isHost)}
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
          <label class="field">
            <span>Kendi sifren</span>
            <input id="passwordInput" type="password" maxlength="40" autocomplete="new-password" placeholder="Sadece sen bil" />
          </label>
          ${avatarPicker()}
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
          <label class="field">
            <span>Kendi sifren</span>
            <input id="passwordInput" type="password" maxlength="40" placeholder="${local.passwordHash ? "Kayitli sifreyi korumak icin bos birak" : "Sifre belirle"}" />
          </label>
          ${avatarPicker()}
          <button id="saveName">Bilgileri kaydet</button>
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
  const usedCount = Object.keys(room.usedWords || {}).length;
  const activePlayers = players.filter((player) => player.online && !player.eliminated);
  const readyCount = activePlayers.filter((player) => player.ready).length;
  const everyoneReady = activePlayers.length >= 3 && readyCount === activePlayers.length;
  const meReady = Boolean(room.players?.[state.uid]?.ready);
  return `
    <div class="game-stage">
      <div>
        <h2>Lobi hazir</h2>
        <p class="muted">${readyCount}/${activePlayers.length} kisi hazir. Bu odada ${usedCount} kelime oynandi.</p>
      </div>
      <div class="actions">
        <button id="toggleReady" class="${meReady ? "ghost" : "success"}">${meReady ? "Hazir degilim" : "Hazirim"}</button>
        <span class="muted">Oyun herkes hazir olunca baslatilabilir.</span>
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
          <label class="check-field">
            <input id="timerEnabled" type="checkbox" ${settings.timerEnabled ? "checked" : ""} />
            <span>Sureli oyun kullan</span>
          </label>
          <div class="split">
            <label class="field">
              <span>Tartisma suresi, dakika</span>
              <input id="discussionMinutes" type="number" min="1" max="30" value="${Math.round((settings.discussionSeconds || 300) / 60)}" />
            </label>
            <label class="field">
              <span>Oylama suresi, saniye</span>
              <input id="votingSeconds" type="number" min="15" max="300" value="${settings.votingSeconds || 60}" />
            </label>
          </div>
          <div class="actions">
            <button id="saveSettings" class="ghost">Ayarlari kaydet</button>
            <button id="startGame" ${!everyoneReady ? "disabled" : ""}>Oyunu baslat</button>
          </div>
        </div>
      `
          : `<div class="notice">Oda sahibinin oyunu baslatmasi bekleniyor.</div>`
      }
    </div>
  `;
}

function revealStage() {
  const assignment = currentAssignment();
  const isImpostor = assignment?.role === "impostor";
  const players = getPlayers(state.room).filter((player) => player.online && !player.eliminated);
  const seen = state.room?.seenCards || {};
  const seenCount = Object.keys(seen).filter((id) => players.some((player) => player.id === id)).length;
  const meSeen = Boolean(seen[state.uid]);
  return `
    <div class="game-stage">
      <div class="role-card ${isImpostor ? "impostor" : "player"}">
        <div>
          <div class="role-label">${isImpostor ? "Gizli rolun" : "Kelimen"}</div>
          <div class="secret-word">${isImpostor ? "Impostor ???" : escapeHtml(assignment?.word || "Bekleniyor")}</div>
        </div>
      </div>
      <div class="actions">
        <button id="confirmSeen" ${meSeen ? "disabled" : ""}>${meSeen ? "Gordum" : "Gordum"}</button>
        <span class="muted">${seenCount}/${players.length} kisi kartini gordu. Herkes gorunce tartisma baslar.</span>
      </div>
    </div>
  `;
}

function discussionStage(room) {
  const isImpostor = currentAssignment()?.role === "impostor";
  const guessed = Boolean(state.myGuess);
  const activePlayers = getPlayers(room).filter((player) => !player.eliminated);
  const requests = room.voteStartRequests || {};
  const requestCount = Object.keys(requests).filter((id) => activePlayers.some((player) => player.id === id)).length;
  const needed = majority(activePlayers.length);
  const requested = Boolean(requests[state.uid]);
  return `
    <div class="game-stage">
      <div>
        <h2>Tartisma zamani</h2>
        <p class="muted">Sirayla konusun, ipucu verin, ama kelimeyi direkt soylemeyin.</p>
      </div>
      ${timerNotice(room)}
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
        <button id="requestVoteStart" ${requested ? "disabled" : ""}>${requested ? "Oylama istendi" : "Oylama iste"}</button>
        <span class="muted">${requestCount}/${activePlayers.length} istek geldi. Oylamaya gecmek icin ${needed} kisi gerekiyor.</span>
      </div>
    </div>
  `;
}

function votingStage(room, players) {
  const voteReceipts = room.voteReceipts?.current || {};
  const activePlayers = players.filter((player) => !player.eliminated);
  const voteCount = Object.entries(voteReceipts).filter(
    ([id, receipt]) => activePlayers.some((player) => player.id === id) && isCurrentRoundRecord(receipt),
  ).length;
  const needed = majority(activePlayers.length);
  const myVote = isCurrentRoundRecord(state.myVote) ? state.myVote?.targetId || "" : "";

  return `
    <div class="game-stage">
      <div>
        <h2>Gizli oylama</h2>
        <p class="muted">${voteCount}/${activePlayers.length} oy geldi. Birini atmak icin ${needed} oy gerekiyor.</p>
      </div>
      ${timerNotice(room)}
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
  const impostorNames = result.impostorNames || getImpostorNames(room);
  return `
    <div class="game-stage">
      <div class="notice ${isPlayersWin ? "good-note" : "danger-note"}">
        <h2>${escapeHtml(result.title || "Tur bitti")}</h2>
        <p>${escapeHtml(result.body || "Sonuc hesaplandi.")}</p>
      </div>
      <div class="chip-row">
        <span class="chip">Kelime <strong>${escapeHtml(room.meta?.word || "?")}</strong></span>
        ${impostorNames.length ? `<span class="chip">Impostor <strong>${escapeHtml(impostorNames.join(", "))}</strong></span>` : ""}
        ${result.eliminatedName ? `<span class="chip">Atilan <strong>${escapeHtml(result.eliminatedName)}</strong></span>` : ""}
      </div>
      <div class="actions">
        ${isHost ? `<button id="newRound">Yeni tur lobisine don</button>` : `<span class="muted">Yeni turu oda sahibi baslatabilir.</span>`}
      </div>
    </div>
  `;
}

function playersList(players, room, isHost) {
  const hostId = room?.meta?.hostId;
  if (!players.length) return `<p class="muted">Henuz kimse yok.</p>`;

  return `
    <div class="players">
      ${players
        .map(
          (player) => `
        <div class="player">
          <div class="player-name">
            <span class="avatar ${player.online ? "on" : ""}">${escapeHtml(player.avatar || avatarForName(player.name))}</span>
            <span>${escapeHtml(player.name)}</span>
            <span class="score-pill">${player.score || 0}</span>
          </div>
          <div class="chip-row">
            ${player.id === hostId ? `<span class="tag">Sahip</span>` : ""}
            ${room?.meta?.phase === "lobby" && player.ready ? `<span class="tag good-tag">Hazir</span>` : ""}
            ${room?.meta?.phase === "reveal" && room.seenCards?.[player.id] ? `<span class="tag good-tag">Gordu</span>` : ""}
            ${player.eliminated ? `<span class="tag">Atilmis</span>` : ""}
            ${isHost && player.id !== hostId ? `<button class="mini ghost" data-transfer-host="${player.id}">Sahip yap</button>` : ""}
            ${isHost && player.id !== hostId ? `<button class="mini danger" data-kick="${player.id}">At</button>` : ""}
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
  bind("#toggleReady", "click", toggleReady);
  bind("#confirmSeen", "click", confirmSeenCard);
  bind("#requestVoteStart", "click", requestVoteStart);
  bind("#submitGuess", "click", submitGuess);
  bind("#newRound", "click", resetToLobby);

  document.querySelectorAll("[data-kick]").forEach((button) => {
    button.addEventListener("click", () => kickPlayer(button.dataset.kick));
  });

  document.querySelectorAll("[data-transfer-host]").forEach((button) => {
    button.addEventListener("click", () => transferHost(button.dataset.transferHost));
  });

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
  if (!saveIdentityFromCurrentInput({ requirePassword: true })) return;
  state.error = "";

  if (state.roomCode && state.firebase) await upsertPlayer(state.roomCode);
  render();
}

async function createRoom() {
  if (!ensureReady()) return;
  if (!saveIdentityFromCurrentInput({ requirePassword: true })) return;

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
  if (!saveIdentityFromCurrentInput({ requirePassword: true })) return;

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

  if (!(await canUseIdentityInRoom(code))) return;

  await upsertPlayer(code);
  await subscribeRoom(code);
}

async function leaveRoom() {
  if (!state.roomCode || !state.firebase) return;
  const { ref, update } = state.firebase.dbModule;
  const nextHost = isHost() ? pickNextHost(getActivePlayers(state.room).filter((player) => player.id !== state.uid)) : null;
  await update(ref(state.firebase.db, `rooms/${state.roomCode}/players/${state.uid}`), {
    online: false,
  });
  if (nextHost) {
    await updateRoom({
      "meta/hostId": nextHost.id,
      "meta/updatedAt": Date.now(),
    });
  }
  cleanupSubscriptions();
  state.roomCode = "";
  state.room = null;
  state.assignment = null;
  state.myVote = null;
  state.myGuess = null;
  sessionStorage.removeItem("impostor:room");
  render();
}

async function transferHost(playerId) {
  if (!isHost() || !playerId || playerId === state.uid) return;
  const target = getActivePlayers(state.room).find((player) => player.id === playerId);
  if (!target) return;

  await updateRoom({
    "meta/hostId": target.id,
    "meta/updatedAt": Date.now(),
  });
  state.copyMessage = `${target.name} oda sahibi oldu.`;
}

async function kickPlayer(playerId) {
  if (!isHost() || !playerId || playerId === state.uid) return;
  const player = getPlayers(state.room).find((item) => item.id === playerId);
  await updateRoom({
    [`players/${playerId}/kicked`]: true,
    [`players/${playerId}/online`]: false,
    [`players/${playerId}/kickedAt`]: Date.now(),
    ...(player?.identityKey || player?.passwordHash
      ? { [`kickedKeys/${player.identityKey || player.passwordHash}`]: true }
      : {}),
    [`assignmentsPublic/${playerId}`]: null,
    [`players/${playerId}/assignment`]: null,
    [`votesPublic/current/${playerId}`]: null,
    [`guessesPublic/${playerId}`]: null,
    [`voteReceipts/current/${playerId}`]: null,
    [`guessReceipts/${playerId}`]: null,
    "meta/updatedAt": Date.now(),
  });
  await bestEffortRootUpdate({
    [`assignments/${state.roomCode}/${playerId}`]: null,
    [`votes/${state.roomCode}/current/${playerId}`]: null,
    [`guesses/${state.roomCode}/${playerId}`]: null,
  });
  state.copyMessage = `${player?.name || "Oyuncu"} odadan atildi.`;
  setTimeout(resolveVotes, 80);
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

async function toggleReady() {
  if (!state.roomCode || state.room?.meta?.phase !== "lobby") return;
  const ready = !state.room?.players?.[state.uid]?.ready;
  await updateRoom({
    [`players/${state.uid}/ready`]: ready,
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
  const everyoneReady = players.length >= 3 && players.every((player) => player.ready);
  const impostorCount = Math.min(settings.impostorCount || 1, Math.max(1, players.length - 2));

  if (players.length < 3) {
    state.error = "Oyun icin en az 3 kisi gerekiyor.";
    render();
    return;
  }

  if (!everyoneReady) {
    state.error = "Oyunu baslatmak icin herkes hazir olmali.";
    render();
    return;
  }

  const word = pickUnusedWord(settings.words || DEFAULT_WORDS, state.room?.usedWords || {});
  const impostors = pickImpostors(players, impostorCount, state.room?.meta?.lastImpostorIds || []);
  const assignments = {};
  const playerAssignmentUpdates = {};
  players.forEach((player) => {
    assignments[player.id] = {
      role: impostors.includes(player.id) ? "impostor" : "player",
      word,
    };
    playerAssignmentUpdates[`players/${player.id}/assignment`] = assignments[player.id];
  });

  await updateRoom({
    settings,
    ...playerAssignmentUpdates,
    assignmentsPublic: assignments,
    guessesPublic: null,
    votesPublic: null,
    voteStartRequests: null,
    seenCards: null,
    [`usedWords/${wordKey(word)}`]: true,
    voteReceipts: null,
    guessReceipts: null,
    result: null,
    "meta/word": word,
    "meta/phase": "reveal",
    "meta/phaseEndsAt": null,
    "meta/round": (state.room.meta?.round || 0) + 1,
    "meta/lastImpostorIds": impostors,
    "meta/updatedAt": Date.now(),
  });

  state.assignment = assignments[state.uid] || null;
  state.myVote = null;
  state.myGuess = null;
  await bestEffortRootUpdate({
    [`assignments/${state.roomCode}`]: assignments,
    [`guesses/${state.roomCode}`]: null,
    [`votes/${state.roomCode}`]: null,
  });
}

async function setPhase(phase) {
  if (!isHost()) return;
  await updateRoom({
    ...phaseMetaPatch(phase),
    ...(phase === "discussion" ? { voteStartRequests: null } : {}),
    "meta/updatedAt": Date.now(),
  });
}

async function confirmSeenCard() {
  if (!state.roomCode || state.room?.meta?.phase !== "reveal") return;
  await updateRoom({
    [`seenCards/${state.uid}`]: true,
    "meta/updatedAt": Date.now(),
  });
  setTimeout(resolveSeenCards, 80);
}

async function resolveSeenCards() {
  const room = state.room;
  if (!room || room.meta?.phase !== "reveal") return;
  const players = getPlayers(room).filter((player) => player.online && !player.eliminated);
  const seen = room.seenCards || {};
  const allSeen = players.length > 0 && players.every((player) => seen[player.id]);
  if (!allSeen) return;

  await updateRoom({
    seenCards: null,
    ...phaseMetaPatch("discussion"),
    voteStartRequests: null,
    "meta/updatedAt": Date.now(),
  });
}

async function beginVote() {
  await updateRoom({
    "voteReceipts/current": null,
    "votesPublic/current": null,
    voteStartRequests: null,
    ...phaseMetaPatch("voting"),
    "meta/updatedAt": Date.now(),
  });
  await bestEffortRootUpdate({
    [`votes/${state.roomCode}/current`]: null,
  });
}

async function requestVoteStart() {
  if (!state.roomCode || state.room?.meta?.phase !== "discussion") return;
  await updateRoom({
    [`voteStartRequests/${state.uid}`]: true,
    "meta/updatedAt": Date.now(),
  });
  setTimeout(resolveVoteStartRequests, 80);
}

async function submitGuess() {
  const guessInput = document.querySelector("#guessInput");
  const guess = normalizeGuess(guessInput?.value || "");
  const word = normalizeGuess(state.room?.meta?.word || "");
  if (!guess) return;

  const correct = guess === word;
  const guessRecord = {
    guess,
    correct,
    at: Date.now(),
  };
  await updateRoom({
    [`guessesPublic/${state.uid}`]: guessRecord,
    [`guessReceipts/${state.uid}`]: true,
    "meta/updatedAt": Date.now(),
  });
  await bestEffortRootUpdate({
    [`guesses/${state.roomCode}/${state.uid}`]: guessRecord,
  });

  if (correct) {
    await applyScoreAndResult(
      scorePatchFor("impostor-guess", { impostorIds: [state.uid] }),
      resultUpdate("impostor", "Impostor kazandi", `${local.name} kelimeyi dogru tahmin etti.`),
    );
  }
}

async function writePrivateVote(targetId) {
  const voteRecord = {
    targetId,
    round: state.room?.meta?.round || 0,
    at: Date.now(),
  };
  await updateRoom({
    [`votesPublic/current/${state.uid}`]: voteRecord,
    [`voteReceipts/current/${state.uid}`]: {
      round: state.room?.meta?.round || 0,
      at: Date.now(),
    },
    "meta/updatedAt": Date.now(),
  });
  await bestEffortRootUpdate({
    [`votes/${state.roomCode}/current/${state.uid}`]: voteRecord,
  });
}

async function castVote(targetId) {
  if (!state.roomCode || !targetId) return;
  const activePlayers = getPlayers(state.room).filter((player) => !player.eliminated);
  if (!activePlayers.some((player) => player.id === targetId)) return;

  await writePrivateVote(targetId);

  setTimeout(resolveVotes, 80);
}

async function resolveGuesses() {
  if (!isHost()) return;
  const room = state.room;
  if (!room || room.meta?.phase !== "discussion" || room.result) return;
  const guesses = await readGuesses();
  const correctEntry = Object.entries(guesses).find(([, guess]) => guess?.correct);
  if (!correctEntry) return;

  const [playerId] = correctEntry;
  const player = getPlayers(room).find((item) => item.id === playerId);
  await updateRoom(
    resultUpdate("impostor", "Impostor kazandi", `${player?.name || "Impostor"} kelimeyi dogru tahmin etti.`),
  );
}

async function resolveVoteStartRequests() {
  if (state.voteStartResolving) return;
  const room = state.room;
  if (!room || room.meta?.phase !== "discussion") return;
  const activePlayers = getPlayers(room).filter((player) => !player.eliminated);
  const requests = room.voteStartRequests || {};
  const requestCount = Object.keys(requests).filter((id) => activePlayers.some((player) => player.id === id)).length;

  if (requestCount >= majority(activePlayers.length)) {
    state.voteStartResolving = true;
    try {
      await beginVote();
    } finally {
      state.voteStartResolving = false;
    }
  }
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
      await updateRoom({
        "votesPublic/current": null,
        "voteReceipts/current": null,
        "meta/updatedAt": Date.now(),
      });
      await bestEffortRootUpdate({
        [`votes/${state.roomCode}/current`]: null,
      });
    }
    return;
  }

  await eliminateByVote(eliminatedId);
}

async function eliminateByVote(eliminatedId) {
  const room = state.room;
  const activePlayers = getPlayers(room).filter((player) => !player.eliminated);
  const assignment = await readAssignment(eliminatedId);
  const eliminated = activePlayers.find((player) => player.id === eliminatedId);
  const playersWon = assignment?.role === "impostor";
  const scorePatch = playersWon
    ? scorePatchFor("players-found", { impostorIds: [eliminatedId] })
    : scorePatchFor("wrong-elimination", { eliminatedId });
  await updateRoom({
    [`players/${eliminatedId}/eliminated`]: true,
    ...scorePatch,
    ...resultUpdate(
      playersWon ? "players" : "impostor",
      playersWon ? "Oyuncular kazandi" : "Impostor kazandi",
      playersWon
        ? `${eliminated?.name || "Bir oyuncu"} impostor olarak bulundu.`
        : `${eliminated?.name || "Bir oyuncu"} atildi ama impostor degildi.`,
      eliminated?.name || "",
    ),
  });
}

async function finishVotingByTimeout() {
  if (!isHost() || state.room?.meta?.phase !== "voting") return;
  const activePlayers = getPlayers(state.room).filter((player) => !player.eliminated);
  const votes = await readVotes();
  const counts = {};

  Object.values(votes).forEach((vote) => {
    if (vote?.targetId && activePlayers.some((player) => player.id === vote.targetId)) {
      counts[vote.targetId] = (counts[vote.targetId] || 0) + 1;
    }
  });

  const threshold = majority(activePlayers.length);
  const eliminatedId = Object.keys(counts).find((id) => counts[id] >= threshold);
  if (eliminatedId) {
    await eliminateByVote(eliminatedId);
    return;
  }

  await updateRoom(
    resultUpdate("impostor", "Impostor kazandi", "Sure bitti ve oyuncular birini atacak cogunluga ulasamadi."),
  );
}

async function resetToLobby() {
  if (!isHost()) return;
  const playerUpdates = {};
  getPlayers(state.room).forEach((player) => {
    playerUpdates[`players/${player.id}/eliminated`] = false;
    playerUpdates[`players/${player.id}/assignment`] = null;
    playerUpdates[`players/${player.id}/ready`] = false;
  });

  await updateRoom({
    ...playerUpdates,
    result: null,
    assignmentsPublic: null,
    guessesPublic: null,
    votesPublic: null,
    voteStartRequests: null,
    seenCards: null,
    guessReceipts: null,
    voteReceipts: null,
    "meta/phase": "lobby",
    "meta/phaseEndsAt": null,
    "meta/word": "",
    "meta/updatedAt": Date.now(),
  });

  state.assignment = null;
  state.myVote = null;
  state.myGuess = null;

  await bestEffortRootUpdate({
    [`assignments/${state.roomCode}`]: null,
    [`guesses/${state.roomCode}`]: null,
    [`votes/${state.roomCode}`]: null,
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
      if (state.room?.players?.[state.uid]?.kicked) {
        cleanupSubscriptions();
        state.roomCode = "";
        state.room = null;
        state.assignment = null;
        state.myVote = null;
        state.myGuess = null;
        sessionStorage.removeItem("impostor:room");
        state.error = "Oda sahibi seni odadan atti.";
        render();
        return;
      }
      ensureHostPresent();
      if (state.room?.meta?.phase === "lobby") {
        state.assignment = null;
        state.myVote = null;
        state.myGuess = null;
      }
      const fallbackAssignment = assignmentFromRoom(state.uid);
      if (fallbackAssignment) {
        state.assignment = fallbackAssignment;
      }
      if (isCurrentRoundRecord(state.room?.votesPublic?.current?.[state.uid])) {
        state.myVote = state.room.votesPublic.current[state.uid];
      }
      if (state.room?.guessesPublic?.[state.uid]) {
        state.myGuess = state.room.guessesPublic[state.uid];
      }
      render();
      if (state.room?.meta?.phase === "reveal") resolveSeenCards();
      if (state.room?.meta?.phase === "discussion") {
        resolveGuesses();
        resolveVoteStartRequests();
      }
      if (state.room?.meta?.phase === "voting") resolveVotes();
      resolvePhaseTimeout();
    }),
  );

  state.unsubscribers.push(
    onValue(ref(state.firebase.db, `assignments/${code}/${state.uid}`), (snapshot) => {
      state.assignment = snapshot.val() || assignmentFromRoom(state.uid) || null;
      render();
    }),
  );

  state.unsubscribers.push(
    onValue(ref(state.firebase.db, `votes/${code}/current/${state.uid}`), (snapshot) => {
      const nextVote = snapshot.val() || state.room?.votesPublic?.current?.[state.uid] || null;
      state.myVote = isCurrentRoundRecord(nextVote) ? nextVote : null;
      render();
    }),
  );

  state.unsubscribers.push(
    onValue(ref(state.firebase.db, `guesses/${code}/${state.uid}`), (snapshot) => {
      state.myGuess = snapshot.val() || state.room?.guessesPublic?.[state.uid] || null;
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

async function applyScoreAndResult(scorePatch, resultPatch) {
  await updateRoom({
    ...scorePatch,
    ...resultPatch,
  });
}

async function bestEffortRootUpdate(patch) {
  try {
    await updateRoot(patch);
  } catch {
    // Some rooms run with rules that only allow the public room tree.
  }
}

async function readVotes() {
  const { ref, get } = state.firebase.dbModule;
  try {
    const snapshot = await get(ref(state.firebase.db, `votes/${state.roomCode}/current`));
    return currentRoundRecords(snapshot.val() || state.room?.votesPublic?.current || {});
  } catch {
    return currentRoundRecords(state.room?.votesPublic?.current || {});
  }
}

async function readGuesses() {
  const { ref, get } = state.firebase.dbModule;
  try {
    const snapshot = await get(ref(state.firebase.db, `guesses/${state.roomCode}`));
    return snapshot.val() || state.room?.guessesPublic || {};
  } catch {
    return state.room?.guessesPublic || {};
  }
}

async function readAssignment(playerId) {
  const { ref, get } = state.firebase.dbModule;
  try {
    const snapshot = await get(ref(state.firebase.db, `assignments/${state.roomCode}/${playerId}`));
    return snapshot.val() || assignmentFromRoom(playerId) || null;
  } catch {
    return assignmentFromRoom(playerId) || null;
  }
}

async function readRoomPublic(code) {
  const { ref, get } = state.firebase.dbModule;
  const snapshot = await get(ref(state.firebase.db, `rooms/${code}`));
  return snapshot.val() || {};
}

async function canUseIdentityInRoom(code) {
  const room = await readRoomPublic(code);
  if (room.kickedKeys?.[identityKey()]) {
    state.error = "Bu isim ve sifreyle bu odadan atildin; tekrar katilamazsin.";
    render();
    return false;
  }

  const duplicate = Object.entries(room.players || {})
    .map(([id, player]) => ({ id, ...player }))
    .find(
      (player) =>
        player.id !== state.uid &&
        !player.kicked &&
        cleanName(player.name || "").toLocaleLowerCase("tr") === local.name.toLocaleLowerCase("tr"),
    );

  if (duplicate && duplicate.passwordHash !== local.passwordHash) {
    state.error = "Bu isim odada baska bir sifreyle kullaniliyor.";
    render();
    return false;
  }

  return true;
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
      impostorNames: getImpostorNames(state.room),
      at: Date.now(),
    },
    "meta/phase": "ended",
    "meta/phaseEndsAt": null,
    "meta/updatedAt": Date.now(),
  };
}

function prefixRoomUpdate(patch) {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [`rooms/${state.roomCode}/${key}`, value]));
}

function currentAssignment() {
  return state.assignment || assignmentFromRoom(state.uid);
}

function assignmentFromRoom(playerId) {
  return state.room?.players?.[playerId]?.assignment || state.room?.assignmentsPublic?.[playerId] || null;
}

function roleReminder(phase) {
  const assignment = currentAssignment();
  if (!assignment || phase === "lobby" || phase === "home") return "";
  if (assignment.role === "impostor") return "Rolun: Impostor";
  return `Kelimen: ${assignment.word || ""}`;
}

function scorePatchFor(type, context = {}) {
  const players = getPlayers(state.room);
  const patch = {};

  if (type === "impostor-guess") {
    context.impostorIds?.forEach((id) => {
      patch[`players/${id}/score`] = playerScore(id) + 2;
    });
  }

  if (type === "players-found") {
    players.forEach((player) => {
      const assignment = assignmentFromRoom(player.id);
      if (assignment?.role !== "impostor") {
        patch[`players/${player.id}/score`] = playerScore(player.id) + 1;
      }
    });
  }

  if (type === "wrong-elimination") {
    players.forEach((player) => {
      const assignment = assignmentFromRoom(player.id);
      if (assignment?.role === "impostor") {
        patch[`players/${player.id}/score`] = playerScore(player.id) + 1;
      } else {
        patch[`players/${player.id}/score`] = Math.max(0, playerScore(player.id) - 1);
      }
    });
  }

  return patch;
}

function playerScore(playerId) {
  return Number(state.room?.players?.[playerId]?.score || 0);
}

function phaseMetaPatch(phase) {
  return {
    "meta/phase": phase,
    "meta/phaseEndsAt": phaseEndAt(phase),
  };
}

function phaseEndAt(phase) {
  const settings = state.room?.settings || defaultSettings();
  if (!settings.timerEnabled) return null;
  if (phase === "discussion") return Date.now() + clampNumber(settings.discussionSeconds, 60, 1800) * 1000;
  if (phase === "voting") return Date.now() + clampNumber(settings.votingSeconds, 15, 300) * 1000;
  return null;
}

function timerNotice(room) {
  const endsAt = room?.meta?.phaseEndsAt;
  if (!room?.settings?.timerEnabled || !endsAt) return "";
  return `
    <div class="timer-line">
      <span>Kalan sure</span>
      <strong>${formatRemaining(endsAt - Date.now())}</strong>
    </div>
  `;
}

function syncUiTimer() {
  if (state.uiTimer) {
    clearInterval(state.uiTimer);
    state.uiTimer = null;
  }

  if (!state.room?.settings?.timerEnabled || !state.room?.meta?.phaseEndsAt) return;

  state.uiTimer = setInterval(() => {
    if (!state.room?.meta?.phaseEndsAt) {
      clearInterval(state.uiTimer);
      state.uiTimer = null;
      return;
    }
    render();
    resolvePhaseTimeout();
  }, 1000);
}

async function resolvePhaseTimeout() {
  if (!isHost() || state.timeoutResolving) return;
  const phase = state.room?.meta?.phase;
  const endsAt = state.room?.meta?.phaseEndsAt;
  if (!endsAt || Date.now() < endsAt) return;

  state.timeoutResolving = true;
  try {
    if (phase === "discussion") await beginVote();
    if (phase === "voting") await finishVotingByTimeout();
  } finally {
    state.timeoutResolving = false;
  }
}

function formatRemaining(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function defaultSettings() {
  return {
    words: DEFAULT_WORDS,
    impostorCount: 1,
    timerEnabled: false,
    discussionSeconds: 300,
    votingSeconds: 60,
  };
}

function playerRecord() {
  const existing = state.room?.players?.[state.uid] || {};
  return {
    ...existing,
    name: local.name,
    avatar: local.avatar || existing.avatar || avatarForName(local.name),
    passwordHash: local.passwordHash,
    identityKey: identityKey(),
    online: true,
    score: Number(existing.score || 0),
    ready: Boolean(existing.ready),
    eliminated: Boolean(existing.eliminated),
    kicked: Boolean(existing.kicked),
    lastSeen: Date.now(),
  };
}

function avatarPicker() {
  const selected = local.avatar || avatarForName(local.name || "oyuncu");
  return `
    <div class="field">
      <span>Avatar</span>
      <div class="avatar-picker">
        ${AVATARS.map(
          (avatar) => `
            <label class="avatar-choice ${avatar === selected ? "selected" : ""}">
              <input type="radio" name="avatarChoice" value="${escapeHtml(avatar)}" ${avatar === selected ? "checked" : ""} />
              <span>${escapeHtml(avatar)}</span>
            </label>
          `,
        ).join("")}
      </div>
    </div>
  `;
}

function avatarForName(name) {
  const clean = cleanName(name || "");
  if (!clean) return AVATARS[0];
  return clean[0].toLocaleUpperCase("tr");
}

function getPlayers(room) {
  return Object.entries(room?.players || {})
    .map(([id, player]) => ({ id, ...player }))
    .filter((player) => !player.kicked)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));
}

function getActivePlayers(room) {
  return getPlayers(room).filter((player) => player.online && !player.kicked);
}

function pickNextHost(players, seed = Math.random()) {
  if (!players.length) return null;
  const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
  const seedText = String(seed);
  const index = simpleHash(seedText).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % sorted.length;
  return sorted[index];
}

async function ensureHostPresent() {
  const room = state.room;
  if (!room?.meta?.hostId || room.players?.[room.meta.hostId]?.online) return;
  const activePlayers = getActivePlayers(room);
  if (!activePlayers.length) return;
  const nextHost = pickNextHost(activePlayers, `${room.meta.hostId}:${room.meta.updatedAt}:${room.meta.round}`);
  if (!nextHost || nextHost.id !== state.uid) return;

  try {
    await updateRoom({
      "meta/hostId": nextHost.id,
      "meta/updatedAt": Date.now(),
    });
  } catch {
    state.error = "Oda sahibi devredilirken sorun oldu.";
    render();
  }
}

function getImpostorNames(room) {
  return getPlayers(room)
    .filter((player) => assignmentFromRoom(player.id)?.role === "impostor")
    .map((player) => player.name || "Impostor");
}

function pickImpostors(players, count, lastImpostorIds = []) {
  const last = new Set(lastImpostorIds);
  const freshPool = players.filter((player) => !last.has(player.id));
  const primaryPool = freshPool.length >= count ? freshPool : players;
  return shuffle(primaryPool)
    .slice(0, count)
    .map((player) => player.id);
}

function currentRoundRecords(records) {
  return Object.fromEntries(Object.entries(records || {}).filter(([, record]) => isCurrentRoundRecord(record)));
}

function isCurrentRoundRecord(record) {
  if (!record || typeof record !== "object") return false;
  return Number(record.round || -1) === Number(state.room?.meta?.round || 0);
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

function saveIdentityFromCurrentInput({ requirePassword = false } = {}) {
  const input = document.querySelector("#nameInput");
  const passwordInput = document.querySelector("#passwordInput");
  const avatarInput = document.querySelector("input[name='avatarChoice']:checked");
  const nextName = cleanName(input?.value || "");
  const nextPassword = passwordInput?.value || "";

  if (!nextName) {
    state.error = "Oyuna girmek icin bir isim yazmalisin.";
    render();
    return false;
  }

  if (nextPassword && nextPassword.length < 3) {
    state.error = "Sifre en az 3 karakter olsun.";
    render();
    return false;
  }

  if (requirePassword && !nextPassword && !local.passwordHash) {
    state.error = "Oyuna girmek icin kendi sifreni belirlemelisin.";
    render();
    return false;
  }

  local.name = nextName;
  localStorage.setItem("impostor:name", nextName);
  local.avatar = avatarInput?.value || local.avatar || avatarForName(nextName);
  localStorage.setItem("impostor:avatar", local.avatar);

  if (nextPassword) {
    local.passwordHash = simpleHash(nextPassword);
    localStorage.setItem("impostor:passwordHash", local.passwordHash);
  }

  return true;
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
  const discussionMinutes = Number(document.querySelector("#discussionMinutes")?.value || (fallback.discussionSeconds || 300) / 60);
  const votingSeconds = Number(document.querySelector("#votingSeconds")?.value || fallback.votingSeconds || 60);
  return {
    words,
    impostorCount: Math.min(Math.max(impostorCount, 1), 2),
    timerEnabled: Boolean(document.querySelector("#timerEnabled")?.checked),
    discussionSeconds: clampNumber(Math.round(discussionMinutes * 60), 60, 1800),
    votingSeconds: clampNumber(Math.round(votingSeconds), 15, 300),
  };
}

function clampNumber(value, min, max) {
  const number = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(number, min), max);
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

function simpleHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function identityKey() {
  return simpleHash(`${local.name.toLocaleLowerCase("tr")}:${local.passwordHash}`);
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

function pickUnusedWord(words, usedWords) {
  const cleanWords = [...new Set(words.map((word) => word.trim()).filter(Boolean))];
  const unused = cleanWords.filter((word) => !usedWords?.[wordKey(word)]);
  return pick(unused.length ? unused : cleanWords);
}

function wordKey(word) {
  return normalizeGuess(word).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kelime";
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
