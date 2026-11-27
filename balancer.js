/**
 * Делит игроков на 2 или 3 команды с минимальным разбросом суммарных уровней
 * (max суммы − min суммы). Размеры команд отличаются максимум на 1.
 * Полный перебор с отсечением перестановок одинаковых по размеру команд —
 * гарантия оптимума при n <= 14.
 */

const MAX_SOLUTIONS = 100;

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

/**
 * Перебирает все разбиения на команды заданных размеров.
 * Каждое разбиение встречается ровно один раз: команды одинакового размера
 * упорядочены по своему минимальному индексу.
 *
 * @param {number[]} levels уровни по индексам игроков
 * @param {number[]} sizes размеры команд (по убыванию)
 * @param {(teams: number[][], sums: number[]) => void} callback
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

    // Внутри группы одинаковых команд минимальный элемент должен расти,
    // поэтому в команду могут попасть только индексы больше prevMin.
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

/**
 * Возвращает все оптимальные разбиения (у которых разброс минимален),
 * но не больше limit штук. total — сколько оптимальных разбиений всего.
 *
 * @param {Array<{name: string, level: number}>} players
 * @param {number} [teamCount=2]
 * @param {number} [limit=MAX_SOLUTIONS]
 * @returns {{solutions: Array<{teams: Array[], diff: number}>, diff: number, total: number, truncated: boolean}}
 */
function balanceAllOptimal(players, teamCount = 2, limit = MAX_SOLUTIONS) {
  assertInput(players, teamCount);

  const levels = players.map(p => Number(p.level) || 0);
  const sizes = teamSizes(players.length, teamCount);

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

  return { solutions, diff: minDiff, total, truncated: total > solutions.length };
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
