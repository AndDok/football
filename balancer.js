/**
 * Делит игроков на две команды с минимальной разницей суммарных уровней.
 * Размеры команд отличаются максимум на 1. Полный перебор — гарантия оптимума
 * при n <= 14.
 *
 * @param {Array<{name: string, level: number}>} players
 * @returns {{teamA: Array, teamB: Array, diff: number}}
 */
function balanceTeams(players) {
  const n = players.length;
  if (n < 2) throw new Error('Нужно минимум 2 игрока');

  const levels = players.map(p => p.level);
  const total = levels.reduce((a, b) => a + b, 0);
  const sizes = new Set([Math.floor(n / 2), Math.ceil(n / 2)]);

  let bestDiff = Infinity;
  let bestCombo = null;

  for (const k of sizes) {
    for (const combo of combinations(n, k)) {
      let s = 0;
      for (const i of combo) s += levels[i];
      const diff = Math.abs(total - 2 * s);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestCombo = combo;
        if (diff === 0) break;
      }
    }
    if (bestDiff === 0) break;
  }

  const idxA = new Set(bestCombo);
  const teamA = [];
  const teamB = [];
  for (let i = 0; i < n; i++) {
    (idxA.has(i) ? teamA : teamB).push(players[i]);
  }

  return { teamA, teamB, diff: bestDiff };
}

/**
 * Возвращает ВСЕ оптимальные разбиения (у которых diff минимален).
 * Исключает зеркальные дубли (A↔B).
 *
 * @param {Array<{name: string, level: number}>} players
 * @returns {{solutions: Array<{teamA: Array, teamB: Array, diff: number}>, diff: number}}
 */
function balanceAllOptimal(players) {
  const n = players.length;
  if (n < 2) throw new Error('Нужно минимум 2 игрока');

  const levels = players.map(p => p.level);
  const total = levels.reduce((a, b) => a + b, 0);
  const sizes = new Set([Math.floor(n / 2), Math.ceil(n / 2)]);

  // 1. Находим минимальный diff
  let minDiff = Infinity;
  for (const k of sizes) {
    for (const combo of combinations(n, k)) {
      let s = 0;
      for (const i of combo) s += levels[i];
      const diff = Math.abs(total - 2 * s);
      if (diff < minDiff) minDiff = diff;
      if (minDiff === 0) break;
    }
    if (minDiff === 0) break;
  }

  // 2. Собираем все комбинации с этим diff
  const solutions = [];
  const seen = new Set();

  for (const k of sizes) {
    for (const combo of combinations(n, k)) {
      let s = 0;
      for (const i of combo) s += levels[i];
      const diff = Math.abs(total - 2 * s);
      if (diff !== minDiff) continue;

      const idxA = new Set(combo);
      const teamA = [];
      const teamB = [];
      for (let i = 0; i < n; i++) {
        (idxA.has(i) ? teamA : teamB).push(players[i]);
      }

      const key = [
        teamA.map(p => p.name).sort().join('|'),
        teamB.map(p => p.name).sort().join('|'),
      ].sort().join('::');

      if (seen.has(key)) continue;
      seen.add(key);

      solutions.push({ teamA, teamB, diff: minDiff });
    }
  }

  return { solutions, diff: minDiff };
}

/** Генератор всех комбинаций из n по k (аналог itertools.combinations). */
function* combinations(n, k) {
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.slice();
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

// Экспорт в глобальный объект браузера
window.balanceTeams = balanceTeams;
window.balanceAllOptimal = balanceAllOptimal;