/* Attack identity and lifecycle. No game requests or audio side effects. */
const AttackState = (() => {
  const RETENTION_MS = 24 * 60 * 60 * 1000;
  const TOLERANCE_MS = 2000;

  function legacyIdentity(alarm) {
    const name = alarm.name || '';
    const tag = name.match(/\[[^\]]+\]\s*$/)?.[0]?.trim() || '';
    const headline = name.split(' @ ')[0].replace(/\s*\(wave ×\d+\)/, '');
    return `${tag}|${headline}`;
  }

  function normalize(alarm, now) {
    const phase = alarm.attackPhase || (alarm.name?.startsWith('⚠️') ? 'imminent' : alarm.name?.startsWith('💥') ? 'landed' : 'detected');
    let impactAt = alarm.impactAt;
    if (!Number.isFinite(impactAt)) {
      const match = alarm.name?.match(/ @ (\d{2}):(\d{2}):(\d{2})/);
      // Use the stored schedule as the date anchor, never today's date: old
      // cards must not turn into tomorrow's attacks after a worker restart.
      const anchor = alarm.scheduledTime || alarm.createdAt || now;
      if (phase === 'imminent') impactAt = anchor + 20000;
      else if (match) {
        const date = new Date(anchor);
        date.setHours(+match[1], +match[2], +match[3], 0);
        if (date.getTime() < anchor - 2000) date.setDate(date.getDate() + 1);
        impactAt = date.getTime();
      } else impactAt = anchor + 60000;
    }
    return { ...alarm, attackPhase: phase, impactAt,
      waveEndAt: Number.isFinite(alarm.waveEndAt) ? Math.max(impactAt, alarm.waveEndAt) : impactAt,
      attackScope: alarm.attackScope || legacyIdentity(alarm),
      attackLegacy: alarm.attackLegacy ?? !alarm.attackScope };
  }

  function same(a, b) {
    return a.attackPhase === b.attackPhase &&
      (a.attackScope === b.attackScope || ((a.attackLegacy || b.attackLegacy) && legacyIdentity(a) === legacyIdentity(b))) &&
      a.impactAt < (b.waveEndAt || b.impactAt) + TOLERANCE_MS &&
      b.impactAt < (a.waveEndAt || a.impactAt) + TOLERANCE_MS;
  }

  function prune(dismissed, now) {
    return dismissed.filter(a => Number.isFinite(a.impactAt) && a.impactAt + RETENTION_MS > now);
  }

  function dismiss(dismissed, alarm) {
    if (!dismissed.some(a => same(a, alarm))) dismissed.push({
      attackScope: alarm.attackScope, attackPhase: alarm.attackPhase,
      attackLegacy: alarm.attackLegacy, impactAt: alarm.impactAt,
      waveEndAt: alarm.waveEndAt, name: alarm.name,
    });
  }

  function upsert(alarms, dismissed, incoming, now, generateId) {
    const a = normalize(incoming, now);
    if (a.impactAt <= now || a.attackPhase === 'landed' || dismissed.some(x => same(x, a))) return;
    const existing = alarms.find(x => x.customType === 'attack' && same(x, a));
    if (existing) {
      const count = Math.max(1, Number(a.waveCount) || 1);
      if (count !== (existing.waveCount || 1)) {
        existing.name = existing.name.replace(/\s*\(wave ×\d+\)/, '')
          .replace(' @ ', `${count > 1 ? ` (wave ×${count})` : ''} @ `);
        existing.waveCount = count;
      }
      existing.waveEndAt = Math.max(existing.waveEndAt || existing.impactAt, a.waveEndAt);
      // Keep the original identity, due time and consumed/silenced state.
      // Rounded countdowns from other tabs must never re-arm this phase.
      return;
    }
    const scheduledTime = Number.isFinite(a.dueAt) ? a.dueAt : now + Number(a.delay || 0);
    alarms.push({ ...a, id: generateId(), scheduledTime, createdAt: now,
      notified: false, silenced: false, isPinned: false });
  }

  return { normalize, same, prune, dismiss, upsert };
})();
