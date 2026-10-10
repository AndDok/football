const STORAGE_KEY = 'team-balancer.players.v2';
const THEME_KEY = 'team-balancer.theme';
const MAX_PLAYERS = 14;

const nameInput = document.getElementById('nameInput');
const playersEl = document.getElementById('players');
const errEl = document.getElementById('err');
const countEl = document.getElementById('count');
const emptyHintEl = document.getElementById('emptyHint');
const resultEl = document.getElementById('result');

let players = loadPlayers();

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
  resultEl.innerHTML = '';
};

// ---------- Глобальное состояние разбивки ----------
let currentSolutions = [];
let currentIndex = -1;
let shuffleMode = false;

// ---------- Кнопка «Сбалансировать» ----------
document.getElementById('balance').onclick = () => {
  errEl.textContent = '';
  resultEl.innerHTML = '';

  if (players.length < 2) {
    errEl.textContent = 'Нужно минимум 2 игрока';
    return;
  }

  const clean = players.map(p => ({ name: p.name, level: p.level }));
  const { solutions } = balanceAllOptimal(clean);

  currentSolutions = solutions;
  currentIndex = Math.floor(Math.random() * solutions.length);
  shuffleMode = false;

  renderCurrent();
  tap(20);
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ---------- Показать текущее состояние ----------
function renderCurrent() {
  if (shuffleMode) {
    const sol = randomShuffle();
    renderResult(sol.teamA, sol.teamB, sol.diff, {
      mode: 'shuffle',
      optimalDiff: currentSolutions[0].diff,
    });
  } else {
    const sol = currentSolutions[currentIndex];
    renderResult(sol.teamA, sol.teamB, sol.diff, {
      mode: 'optimal',
      index: currentIndex,
      total: currentSolutions.length,
    });
  }
}

// ---------- Обновить / Перемешать ----------
function refreshTeams() {
  if (shuffleMode) {
    const sol = randomShuffle();
    renderResult(sol.teamA, sol.teamB, sol.diff, {
      mode: 'shuffle',
      optimalDiff: currentSolutions[0].diff,
    });
    tap(15);
    flash();
    return;
  }

  if (currentSolutions.length > 1) {
    let idx;
    do { idx = Math.floor(Math.random() * currentSolutions.length); }
    while (idx === currentIndex && currentSolutions.length > 1);
    currentIndex = idx;
    renderCurrent();
    tap(15);
    flash();
    return;
  }

  // Оптимальный один → уходим в случайный режим
  shuffleMode = true;
  const sol = randomShuffle();
  renderResult(sol.teamA, sol.teamB, sol.diff, {
    mode: 'shuffle',
    optimalDiff: currentSolutions[0].diff,
  });
  tap(15);
  flash();
}

// ---------- Случайное разбиение с соблюдением размеров ----------
function randomShuffle() {
  const n = players.length;
  const sizeA = Math.random() < 0.5 ? Math.floor(n / 2) : Math.ceil(n / 2);

  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }

  const teamAIdx = new Set(idx.slice(0, sizeA));
  const teamA = [];
  const teamB = [];
  for (let i = 0; i < n; i++) {
    (teamAIdx.has(i) ? teamA : teamB).push(players[i]);
  }

  const diff = Math.abs(
    teamA.reduce((s, p) => s + p.level, 0) -
    teamB.reduce((s, p) => s + p.level, 0)
  );

  return { teamA, teamB, diff };
}

// ---------- Плавная подсветка ----------
function flash() {
  resultEl.animate(
    [{ opacity: 0.4 }, { opacity: 1 }],
    { duration: 300, easing: 'ease-out' }
  );
}

// ---------- Результат ----------
function renderResult(teamA, teamB, diff, meta = {}) {
  const diffClass = diff === 0 ? 'ok' : diff <= 2 ? 'warn' : 'bad';
  const { mode = 'optimal', index = 0, total = 1, optimalDiff = diff } = meta;

  let hintHtml = '';
  let refreshLabel = '🔄 Обновить';

  if (mode === 'shuffle') {
    refreshLabel = '🎲 Перемешать';
    hintHtml = `<div class="variants-hint">Оптимальная разница: ${optimalDiff} · сейчас — случайный состав</div>`;
  } else if (total > 1) {
    hintHtml = `<div class="variants-hint">Вариант ${index + 1} из ${total} · все оптимальны</div>`;
  } else {
    hintHtml = `<div class="variants-hint">Оптимальный вариант один · «Перемешать» даст случайный состав</div>`;
    refreshLabel = '🎲 Перемешать';
  }

  resultEl.innerHTML = `
    <div class="diff ${diffClass}">Разница уровней: ${diff}</div>

    <div class="result-actions">
      <button class="refresh-btn" id="refresh" type="button">${refreshLabel}</button>
      <button class="copy-btn" id="copy" type="button">📋 Скопировать</button>
    </div>

    ${hintHtml}

    <div class="teams">
      ${teamHtml('Команда A', teamA, 'A')}
      ${teamHtml('Команда B', teamB, 'B')}
    </div>
  `;

  document.getElementById('copy').onclick = () => shareTeams(teamA, teamB, diff);
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

function formatTeams(A, B, diff) {
  const fmt = t => t.map(p => `• ${p.name} (${p.level})`).join('\n');
  return `⚽ Разбивка команд\n\n🟦 Команда A\n${fmt(A)}\n\n🟨 Команда B\n${fmt(B)}\n\nРазница уровней: ${diff}`;
}

async function shareTeams(A, B, diff) {
  const text = formatTeams(A, B, diff);
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
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ---------- Инициализация ----------
renderList();
nameInput.focus();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}