/**
 * Делит игроков на 2 или 3 команды с минимальным разбросом суммарных уровней
 * (max суммы − min суммы). Размеры команд отличаются максимум на 1.
 *
 * Для небольших задач — полный перебор: точный оптимум и все варианты.
 * Для больших (до 20 игроков) — ветви и границы: оптимум гарантирован,
 * вариантов собирается до limit штук.
 */

const MAX_SOLUTIONS = 100;
const EXHAUSTIVE_LIMIT = 250000;

/**
 * Размеры команд: сумма равна n, разница между командами максимум 1.
 * Большие команды идут первыми, чтобы перебор не зависел от порядка.
 *
 * @param {number} n
 * @param {number} teamCount
 * @returns {number[]}
 */
function teamSizes(n, teamCount) {
  const base = Math.floor(n / teamCount);
  const extra = n % teamCount;
  return Array.from({ length: teamCount }, (_, i) => base + (i < extra ? 1 : 0));
}

function assertInput(players, teamCount) {
  if (!Array.isArray(players)) throw new Error('Список игроков должен быть массивом');
  if (teamCount !== 2 && teamCount !== 3) throw new Error('Команд может быть 2 или 3');
  if (players.length < teamCount) throw new Error(`Нужно минимум ${teamCount} игрока`);
}

function logFactorial(x) {
  let s = 0;
  for (let i = 2; i <= x; i++) s += Math.log(i);
  return s;
}

/**
 * Оценка числа различных разбиений с точностью до перестановки команд
 * одинакового размера. Нужна, чтобы выбрать алгоритм.
 */
function estimatePartitionCount(n, sizes) {
  let log = logFactorial(n);
  for (const s of sizes) log -= logFactorial(s);
  const mult = new Map();
  for (const s of sizes) mult.set(s, (mult.get(s) || 0) + 1);
  for (const m of mult.values()) log -= logFactorial(m);
  return Math.exp(log);
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Полный перебор ----------

/**
 * Перебирает все разбиения на команды заданных размеров.
 * Каждое разбиение встречается ровно один раз: команды одинакового размера
 * упорядочены по своему минимальному индексу.
 */
function forEachPartition(levels, sizes, callback) {
  const n = levels.length;
  const used = new Uint8Array(n);
  const teams = sizes.map(() => []);
  const sums = sizes.map(() => 0);

  function place(teamIdx, prevMin) {
    if (teamIdx === sizes.length) {
      callback(teams, sums);
      return;
    }

    const need = sizes[teamIdx];
    const inGroup = teamIdx > 0 && sizes[teamIdx - 1] === need;
    const lower = inGroup ? prevMin : -1;

    const pool = [];
    for (let i = lower + 1; i < n; i++) if (!used[i]) pool.push(i);

    const picked = [];

    const commit = () => {
      for (const i of picked) {
        used[i] = 1;
        teams[teamIdx].push(i);
        sums[teamIdx] += levels[i];
      }
      place(teamIdx + 1, picked[0]);
      for (const i of picked) {
        used[i] = 0;
        teams[teamIdx].pop();
        sums[teamIdx] -= levels[i];
      }
    };

    const choose = (from, rest) => {
      if (rest === 0) {
        commit();
        return;
      }
      for (let i = from; i + rest <= pool.length; i++) {
        picked.push(pool[i]);
        choose(i + 1, rest - 1);
        picked.pop();
      }
    };

    choose(0, need);
  }

  place(0, -1);
}

function balanceExhaustive(players, sizes, limit) {
  const levels = players.map(p => Number(p.level) || 0);

  let minDiff = Infinity;
  let total = 0;
  const solutions = [];

  forEachPartition(levels, sizes, (teamsIdx, sums) => {
    const diff = Math.max(...sums) - Math.min(...sums);
    if (diff > minDiff) return;

    if (diff < minDiff) {
      minDiff = diff;
      total = 0;
      solutions.length = 0;
    }

    total++;
    if (solutions.length < limit) {
      solutions.push({
        teams: teamsIdx.map(team => team.map(i => players[i])),
        diff,
      });
    }
  });

  return { solutions, diff: minDiff, total, exact: true, optimal: true };
}

// ---------- Ветви и границы ----------

/** Префиксные суммы по убыванию и суммы r наименьших уровней. */
function makeBoundsTables(levels) {
  const n = levels.length;
  const pre = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + levels[i];
  const tail = new Array(n + 1).fill(0);
  for (let r = 1; r <= n; r++) tail[r] = tail[r - 1] + levels[n - r];
  return { pre, tail };
}

/**
 * Нижняя оценка итогового разброса: максимально возможный минимум команды
 * не меньше, чем max(тек. сумма + минимум добавки), а минимум — не больше,
 * чем min(тек. сумма + максимум добавки).
 */
function makeBound(sizes, sums, filled, pre, tail) {
  const k = sizes.length;
  return function bound(assigned) {
    let lowMax = -Infinity;
    let highMin = Infinity;
    for (let i = 0; i < k; i++) {
      const r = sizes[i] - filled[i];
      if (r === 0) {
        if (sums[i] > lowMax) lowMax = sums[i];
        if (sums[i] < highMin) highMin = sums[i];
      } else {
        const lo = sums[i] + tail[r];
        const hi = sums[i] + pre[assigned + r] - pre[assigned];
        if (lo > lowMax) lowMax = lo;
        if (hi < highMin) highMin = hi;
      }
    }
    return lowMax - highMin;
  };
}

/**
 * Ищет минимальный разброс методом ветвей и границ.
 * Возвращает { diff, teams, optimal }.
 */
function searchOptimal(levels, sizes) {
  const n = levels.length;
  const k = sizes.length;

  const order = levels.map((_, i) => i);
  shuffleInPlace(order);
  order.sort((a, b) => levels[b] - levels[a]);
  const vals = order.map(i => levels[i]);

  const { pre, tail } = makeBoundsTables(vals);

  const total = pre[n];
  const hardLB = Math.max(
    0,
    Math.ceil(total / k) - Math.floor(total / k),
    Math.max(...sizes) * Math.min(...levels) - Math.min(...sizes) * Math.max(...levels)
  );

  const sums = new Array(k).fill(0);
  const filled = new Array(k).fill(0);
  const teams = sizes.map(() => []);

  let best = Infinity;
  let bestTeams = null;
  let optimal = true;
  let nodes = 0;
  const NODE_BUDGET = 2000000;

  // Жадный старт: сильных игроков в самую слабую по сумме команду.
  const gSums = new Array(k).fill(0);
  const gFilled = new Array(k).fill(0);
  const gTeams = sizes.map(() => []);
  for (let p = 0; p < n; p++) {
    let pick = -1;
    let pickSum = Infinity;
    for (let i = 0; i < k; i++) {
      if (gFilled[i] === sizes[i]) continue;
      if (gSums[i] < pickSum) { pickSum = gSums[i]; pick = i; }
    }
    gFilled[pick]++;
    gSums[pick] += vals[p];
    gTeams[pick].push(order[p]);
  }
  best = Math.max(...gSums) - Math.min(...gSums);
  bestTeams = gTeams;

  const teamOrder = Array.from({ length: k }, (_, i) => i);
  const bound = makeBound(sizes, sums, filled, pre, tail);

  function dfs(pos) {
    if (nodes++ > NODE_BUDGET) { optimal = false; return; }
    if (best === hardLB) return;
    if (pos === n) {
      const diff = Math.max(...sums) - Math.min(...sums);
      if (diff < best) {
        best = diff;
        bestTeams = teams.map(t => t.slice());
      }
      return;
    }
    if (bound(pos) > best) return;

    const level = vals[pos];
    for (let oi = 0; oi < k; oi++) {
      const i = teamOrder[oi];
      if (filled[i] === sizes[i]) continue;

      // Команды одного размера с одинаковым состоянием взаимозаменяемы.
      let skip = false;
      for (let j = 0; j < i; j++) {
        if (sizes[j] === sizes[i] && filled[j] === filled[i] && sums[j] === sums[i]) {
          skip = true;
          break;
        }
      }
      if (skip) continue;

      filled[i]++;
      sums[i] += level;
      teams[i].push(order[pos]);
      dfs(pos + 1);
      teams[i].pop();
      sums[i] -= level;
      filled[i]--;
    }
  }

  dfs(0);

  return { diff: best, teams: bestTeams, optimal };
}

/**
 * Собирает до limit различных разбиений с разбросом ровно target.
 * Несколько проходов со случайным порядком — чтобы варианты не были похожи.
 */
function collectOptimal(levels, sizes, target, limit) {
  const n = levels.length;
  const k = sizes.length;
  const found = [];
  const seen = new Set();
  if (limit <= 0) return found;

  const MAX_PASSES = 60;
  const PASS_BUDGET = 40000;

  for (let pass = 0; pass < MAX_PASSES && found.length < limit; pass++) {
    const order = levels.map((_, i) => i);
    shuffleInPlace(order);
    order.sort((a, b) => levels[b] - levels[a]);
    const vals = order.map(i => levels[i]);
    const { pre, tail } = makeBoundsTables(vals);

    const sums = new Array(k).fill(0);
    const filled = new Array(k).fill(0);
    const teams = sizes.map(() => []);
    const bound = makeBound(sizes, sums, filled, pre, tail);

    const teamOrder = Array.from({ length: k }, (_, i) => i);
    shuffleInPlace(teamOrder);

    const quota = Math.max(1, Math.ceil((limit - found.length) / Math.max(1, MAX_PASSES - pass)));
    let got = 0;
    let nodes = 0;

    function dfs(pos) {
      if (got >= quota || nodes++ > PASS_BUDGET) return;
      if (bound(pos) > target) return;

      if (pos === n) {
        const diff = Math.max(...sums) - Math.min(...sums);
        if (diff !== target) return;
        const key = teams
          .map(t => t.slice().sort((a, b) => a - b).join(','))
          .sort()
          .join('|');
        if (seen.has(key)) return;
        seen.add(key);
        found.push(teams.map(t => t.slice()));
        got++;
        return;
      }

      const level = vals[pos];
      for (let oi = 0; oi < k; oi++) {
        const i = teamOrder[oi];
        if (filled[i] === sizes[i]) continue;

        let skip = false;
        for (let j = 0; j < i; j++) {
          if (sizes[j] === sizes[i] && filled[j] === filled[i] && sums[j] === sums[i]) {
            skip = true;
            break;
          }
        }
        if (skip) continue;

        filled[i]++;
        sums[i] += level;
        teams[i].push(order[pos]);
        dfs(pos + 1);
        teams[i].pop();
        sums[i] -= level;
        filled[i]--;
      }
    }

    dfs(0);
  }

  return found;
}

/**
 * Все оптимальные разбиения (до limit штук).
 * exact = true, когда перебраны все варианты и total точен.
 *
 * @param {Array<{name: string, level: number}>} players
 * @param {number} [teamCount=2]
 * @param {number} [limit=MAX_SOLUTIONS]
 * @returns {{solutions: Array<{teams: Array[], diff: number}>, diff: number, total: number, exact: boolean, optimal: boolean}}
 */
function balanceAllOptimal(players, teamCount = 2, limit = MAX_SOLUTIONS) {
  assertInput(players, teamCount);

  const sizes = teamSizes(players.length, teamCount);

  if (estimatePartitionCount(players.length, sizes) <= EXHAUSTIVE_LIMIT) {
    return balanceExhaustive(players, sizes, limit);
  }

  const levels = players.map(p => Number(p.level) || 0);
  const { diff, teams, optimal } = searchOptimal(levels, sizes);
  let picks = collectOptimal(levels, sizes, diff, limit);

  if (picks.length === 0 && teams) picks = [teams];

  return {
    solutions: picks.map(idx => ({
      teams: idx.map(team => team.map(i => players[i])),
      diff,
    })),
    diff,
    total: picks.length,
    exact: false,
    optimal,
  };
}

/**
 * Одно оптимальное разбиение на teamCount команд.
 *
 * @param {Array<{name: string, level: number}>} players
 * @param {number} [teamCount=2]
 * @returns {{teams: Array[], diff: number}}
 */
function balanceTeams(players, teamCount = 2) {
  const { solutions } = balanceAllOptimal(players, teamCount, 1);
  return solutions[0] || { teams: [], diff: 0 };
}

// Экспорт в глобальный объект браузера
window.balanceTeams = balanceTeams;
window.balanceAllOptimal = balanceAllOptimal;
window.teamSizes = teamSizes;
window.__balancer = { searchOptimal, collectOptimal, estimatePartitionCount };
