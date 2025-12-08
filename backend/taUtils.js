// taUtils.js

function ema(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const emaArr = [];
  values.forEach((val, i) => {
    if (i === 0) emaArr.push(val);
    else emaArr.push(val * k + emaArr[i - 1] * (1 - k));
  });
  return emaArr;
}

function isDailyUptrend(closes, ema20, ema50) {
  const n = closes.length - 1;
  if (n < 50) return false;

  const c = closes[n];
  const e20 = ema20[n];
  const e50 = ema50[n];
  if (!(c > e20 && e20 > e50)) return false;

  const lookback = 5;
  if (ema20[n] <= ema20[n - lookback]) return false;
  if (ema50[n] <= ema50[n - lookback]) return false;

  return true;
}

function isLatePump(closes, volumes) {
  const n = closes.length;
  if (n < 40) return false;
  const last = n - 1;

  const prev30Vol = volumes.slice(last - 31, last - 1);
  const avgVol30 =
    prev30Vol.reduce((a, b) => a + b, 0) / Math.max(prev30Vol.length, 1);

  const lastClose = closes[last];
  const prevClose = closes[last - 1];
  const lastVol = volumes[last];

  const retPct = ((lastClose - prevClose) / prevClose) * 100;

  return retPct > 60 && lastVol > avgVol30 * 10;
}

// placeholder 4h helpers – for now just basic trend check
function is4hUptrend(closes, ema20, ema50) {
  const n = closes.length - 1;
  if (n < 50) return false;
  const c = closes[n];
  const e20 = ema20[n];
  const e50 = ema50[n];
  if (!(c > e20 && e20 > e50)) return false;
  const lookback = 5;
  if (ema20[n] <= ema20[n - lookback]) return false;
  if (ema50[n] <= ema50[n - lookback]) return false;
  return true;
}

module.exports = {
  ema,
  isDailyUptrend,
  isLatePump,
  is4hUptrend,
};