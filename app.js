const STORAGE_KEY = 'team-balancer.players.v2';
const THEME_KEY = 'team-balancer.theme';
const TEAM_COUNT_KEY = 'team-balancer.teamcount';
const MAX_PLAYERS = 20;
const TEAM_LETTERS = 'ABC';

const nameInput = document.getElementById('nameInput');
const playersEl = document.getElementById('players');
const errEl = document.getElementById('err');
const countEl = document.getElementById('count');
const emptyHintEl = document.getElementById('emptyHint');
const resultEl = document.getElementById('result');
const teamsChoiceEl = document.getElementById('teamsChoice');

let players = loadPlayers();
let teamCount = loadTeamCount();

let currentSolutions = [];
let currentTotal = 0;
let currentIndex = -1;
let currentExact = true;
let shuffleMode = false;

// ---------- Тема ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme').textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, theme);
}
document.getElementById('theme').onclick = () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
};
applyTheme(
  localStorage.getItem(THEME_KEY) ||
  (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
);

// ---------- Хранилище ----------
function loadPlayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function savePlayers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}

function loadTeamCount() {
  return Number(localStorage.getItem(TEAM_COUNT_KEY)) === 3 ? 3 : 2;
}

// ---------- Тактильная отдача ----------
function tap(ms = 15) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ---------- Добавление игрока ----------
function addPlayer(name, level) {
  name = name.trim();
  if (!name) {
    errEl.textContent = 'Введи имя игрока';
    nameInput.focus();
    return false;
  }
  if (players.length >= MAX_PLAYERS) {
    errEl.textContent = `Максимум ${MAX_PLAYERS} игроков`;
    return false;
  }

  players.push({ name, level, id: cryptoId() });
  savePlayers();
  renderList();
  tap();

  nameInput.value = '';
  errEl.textContent = '';
  nameInput.focus();
  return true;
}

function cryptoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Обработчики кнопок уровня ----------
document.querySelectorAll('.level-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const level = Number(btn.dataset.level);
    addPlayer(nameInput.value, level);
  });
});

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addPlayer(nameInput.value, 2);
  }
});

// ---------- Выбор количества команд ----------
function syncTeamCount() {
  teamsChoiceEl.querySelectorAll('.seg-btn').forEach(btn => {
    const active = Number(btn.dataset.teams) === teamCount;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function resetResult() {
  currentSolutions = [];
  currentTotal = 0;
  currentIndex = -1;
  currentExact = true;
  shuffleMode = false;
  resultEl.innerHTML = '';
}

teamsChoiceEl.querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const value = Number(btn.dataset.teams);
    if (value === teamCount) return;
    teamCount = value;
    localStorage.setItem(TEAM_COUNT_KEY, String(teamCount));
    syncTeamCount();
    resetResult();
    errEl.textContent = '';
    tap();
  });
});

// ---------- Отрисовка списка ----------
function renderList() {
  countEl.textContent = players.length;
  playersEl.innerHTML = '';

  if (players.length === 0) {
    emptyHintEl.style.display = 'block';
    return;
  }
  emptyHintEl.style.display = 'none';

  players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <span class="player-lvl lvl-${p.level}">${p.level}</span>
      <span class="player-name">${escapeHtml(p.name)}</span>
      <button class="player-del" type="button" aria-label="Удалить">×</button>
    `;
    row.querySelector('.player-del').onclick = () => {
      players = players.filter(x => x.id !== p.id);
      savePlayers();
      renderList();
      tap(10);
    };
    playersEl.appendChild(row);
  });
}

// ---------- Очистка ----------
document.getElementById('clear').onclick = () => {
  if (players.length === 0) return;
  if (!confirm('Удалить всех игроков?')) return;
  players = [];
  savePlayers();
  renderList();
  resetResult();
};

// ---------- Кнопка «Сбалансировать» ----------
document.getElementById('balance').onclick = () => {
  errEl.textContent = '';
  resetResult();

  if (players.length < teamCount) {
    errEl.textContent = `Нужно минимум ${teamCount} игрока`;
    return;
  }

  const clean = players.map(p => ({ name: p.name, level: p.level }));
  const { solutions, total, exact } = balanceAllOptimal(clean, teamCount);

  if (solutions.length === 0) {
    errEl.textContent = 'Не удалось разбить игроков на команды';
    return;
  }

  currentSolutions = solutions;
  currentTotal = total;
  currentExact = exact;
  currentIndex = Math.floor(Math.random() * solutions.length);
  shuffleMode = false;

  showOptimal();
  tap(20);
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ---------- Показ разбиения ----------
function showOptimal() {
  const sol = currentSolutions[currentIndex];
  renderResult(sol.teams, sol.diff, {
    mode: 'optimal',
    index: currentIndex,
    total: currentSolutions.length,
    totalAll: currentTotal,
    exact: currentExact,
  });
}

function showShuffle() {
  const sol = randomShuffle();
  renderResult(sol.teams, sol.diff, {
    mode: 'shuffle',
    optimalDiff: currentSolutions[0].diff,
  });
}

// ---------- Обновить / Перемешать ----------
function refreshTeams() {
  if (!shuffleMode && currentSolutions.length > 1) {
    let idx;
    do { idx = Math.floor(Math.random() * currentSolutions.length); }
    while (idx === currentIndex);
    currentIndex = idx;
    showOptimal();
  } else {
    // Оптимальный вариант один → уходим в случайный режим
    shuffleMode = true;
    showShuffle();
  }
  tap(15);
  flash();
}

// ---------- Случайное разбиение с соблюдением размеров ----------
function randomShuffle() {
  const n = players.length;
  const sizes = shuffleArray(teamSizes(n, teamCount));
  const order = shuffleArray(Array.from({ length: n }, (_, i) => i));

  const teams = [];
  let pos = 0;
  for (const size of sizes) {
    teams.push(order.slice(pos, pos + size).map(i => players[i]));
    pos += size;
  }

  const sums = teams.map(team => team.reduce((s, p) => s + p.level, 0));
  return { teams, diff: Math.max(...sums) - Math.min(...sums) };
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Плавная подсветка ----------
function flash() {
  resultEl.animate(
    [{ opacity: 0.4 }, { opacity: 1 }],
    { duration: 300, easing: 'ease-out' }
  );
}

// ---------- Результат ----------
function renderResult(teams, diff, meta = {}) {
  const k = teams.length;
  const diffClass = diff === 0 ? 'ok' : diff <= (k - 1) * 2 ? 'warn' : 'bad';
  const { mode = 'optimal', index = 0, total = 1, totalAll = total, exact = true } = meta;

  let hintHtml = '';
  let refreshLabel = '🔄 Обновить';

  if (mode === 'shuffle') {
    refreshLabel = '🎲 Перемешать';
    hintHtml = `<div class="variants-hint">Минимальный ${k === 2 ? 'разрыв' : 'разброс'}: ${meta.optimalDiff} · сейчас — случайный состав</div>`;
  } else if (total > 1) {
    let tail;
    if (!exact) tail = ' · все составы оптимальны';
    else if (totalAll > total) tail = ` · всего оптимальных: ${formatNum(totalAll)}`;
    else tail = ' · все оптимальны';
    hintHtml = `<div class="variants-hint">Вариант ${index + 1} из ${total}${tail}</div>`;
  } else if (!exact) {
    hintHtml = `<div class="variants-hint">Оптимальный состав найден · «Перемешать» даст случайный</div>`;
    refreshLabel = '🎲 Перемешать';
  } else {
    hintHtml = `<div class="variants-hint">Оптимальный вариант один · «Перемешать» даст случайный состав</div>`;
    refreshLabel = '🎲 Перемешать';
  }

  resultEl.innerHTML = `
    <div class="diff ${diffClass}">${diffLabel(k)}: ${diff}</div>

    <div class="result-actions">
      <button class="refresh-btn" id="refresh" type="button">${refreshLabel}</button>
      <button class="copy-btn" id="copy" type="button">📋 Скопировать</button>
    </div>

    ${hintHtml}

    <div class="teams ${k === 3 ? 'three' : 'two'}">
      ${teams.map((team, i) => teamHtml(`Команда ${TEAM_LETTERS[i]}`, team, TEAM_LETTERS[i])).join('')}
    </div>
  `;

  document.getElementById('copy').onclick = () => shareTeams(teams, diff);
  document.getElementById('refresh').onclick = refreshTeams;
}

function teamHtml(title, team, cls) {
  const total = team.reduce((s, p) => s + p.level, 0);
  const avg = (total / team.length).toFixed(2);
  const list = team.map(p => `
    <div class="player">
      <span>${escapeHtml(p.name)}</span>
      <span class="lvl lvl-${p.level}">${p.level}</span>
    </div>
  `).join('');
  return `
    <div class="card team ${cls}">
      <h2>${title}</h2>
      <div class="team-meta">Игроков: ${team.length} · Сумма: ${total} · Средний: ${avg}</div>
      ${list}
    </div>
  `;
}

function diffLabel(k) {
  return k === 2 ? 'Разница уровней' : 'Разброс уровней';
}

function formatTeams(teams, diff) {
  const icons = ['🟦', '🟨', '🟪'];
  const fmt = team => team.map(p => `• ${p.name} (${p.level})`).join('\n');
  const blocks = teams
    .map((team, i) => `${icons[i] || '⬜'} Команда ${TEAM_LETTERS[i]}\n${fmt(team)}`)
    .join('\n\n');
  return `⚽ Разбивка команд\n\n${blocks}\n\n${diffLabel(teams.length)}: ${diff}`;
}

async function shareTeams(teams, diff) {
  const text = formatTeams(teams, diff);
  const btn = document.getElementById('copy');

  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch { /* отменено */ }
  }

  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '✅ Скопировано';
    setTimeout(() => btn.textContent = '📋 Скопировать', 1500);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
    btn.textContent = '✅ Скопировано';
    setTimeout(() => btn.textContent = '📋 Скопировать', 1500);
  }
}

// ---------- Утилиты ----------
function formatNum(n) {
  return Number(n).toLocaleString('ru-RU');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ---------- Инициализация ----------
syncTeamCount();
renderList();
nameInput.focus();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
