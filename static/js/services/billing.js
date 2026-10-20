/**
 * CDN Splitwise & Resource Dashboard - Pure Billing & Debt Simplification Engine
 */

export function formatDative(name) {
  if (!name) return "";
  if (name === "Миша") return "Мише";
  if (name === "Макс") return "Максу";
  if (name.endsWith("а") || name.endsWith("я")) return name.slice(0, -1) + "е";
  return /[бвгджзклмнпрстфхцчшщ]$/i.test(name) ? name + "у" : name;
}

export function formatRubles(val, withDecimals = false) {
  const num = Number(val) || 0;
  return withDecimals
    ? num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽"
    : Math.round(num).toLocaleString("ru-RU") + " ₽";
}

export function simplifyDebts(balances, names = {}) {
  const debtors = [], creditors = [];
  for (const [id, bal] of Object.entries(balances)) {
    const rBal = Math.round(bal * 100) / 100;
    if (rBal < -0.005) debtors.push({ id, owes: -rBal });
    else if (rBal > 0.005) creditors.push({ id, credit: rBal });
  }
  debtors.sort((a, b) => b.owes - a.owes);
  creditors.sort((a, b) => b.credit - a.credit);

  const transfers = [];
  let d = 0, c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.round(Math.min(debtors[d].owes, creditors[c].credit) * 100) / 100;
    if (amount > 0.005) {
      transfers.push({
        from_id: debtors[d].id, from_name: names[debtors[d].id] || debtors[d].id,
        to_id: creditors[c].id, to_name: names[creditors[c].id] || creditors[c].id,
        amount
      });
    }
    debtors[d].owes = Math.round((debtors[d].owes - amount) * 100) / 100;
    creditors[c].credit = Math.round((creditors[c].credit - amount) * 100) / 100;
    if (debtors[d].owes <= 0.005) d++;
    if (creditors[c].credit <= 0.005) c++;
  }
  return transfers;
}

export function calculateAccountBilling(account, resources = []) {
  const freeTierGb = Number(account.free_tier_gb) || 0;
  const pricePerGb = Number(account.price_per_gb) || 1.50;
  const packageCost = Number(account.package_cost_rub) || 0;
  const bonusBal = Number(account.bonus_balance_rub) || 0;
  const totalTraffic = Math.round(resources.reduce((sum, r) => sum + (Number(r.total_gb) || 0), 0) * 1000) / 1000;
  const freeTierUsed = Math.min(totalTraffic, freeTierGb);
  const billableTraffic = Math.max(0, Math.round((totalTraffic - freeTierGb) * 1000) / 1000);
  const grossCost = Math.round((packageCost + billableTraffic * pricePerGb) * 100) / 100;
  const bonusSpend = (account.ignore_bonus && bonusBal > 0) ? Math.min(bonusBal, grossCost) : 0;
  const realCost = Math.round(Math.max(0, grossCost - bonusSpend) * 100) / 100;

  let unsettledAcc = 0;
  const resSummaries = resources.map(r => {
    const rTotal = Number(r.total_gb) || 0, paidCost = Number(r.paid_watermark_cost) || 0;
    const share = totalTraffic > 0 ? (rTotal / totalTraffic) : (1 / (resources.length || 1));
    const cumCost = Math.round(realCost * share * 100) / 100;
    const unsettledCost = Math.max(0, Math.round((cumCost - paidCost) * 100) / 100);
    unsettledAcc += unsettledCost;
    return {
      ...r, total_gb: rTotal,
      free_allocated_gb: Math.round(freeTierUsed * share * 1000) / 1000,
      billable_gb: Math.max(0, Math.round((rTotal - (freeTierUsed * share)) * 1000) / 1000),
      current_cumulative_cost: cumCost,
      unsettled_gb: Math.max(0, Math.round((rTotal - (Number(r.paid_watermark_gb) || 0)) * 1000) / 1000),
      unsettled_cost: unsettledCost
    };
  });

  return {
    ...account, total_traffic_gb: totalTraffic, free_tier_used_gb: freeTierUsed, billable_traffic_gb: billableTraffic,
    gross_cost_rub: grossCost, bonus_spend_rub: bonusSpend, real_cost_rub: realCost,
    unsettled_cost_rub: Math.round(unsettledAcc * 100) / 100,
    is_low_balance: (Number(account.balance_rub) || 0) <= (Number(account.low_balance_threshold) || 200),
    resources: resSummaries
  };
}

export function calculateSplitwiseOverview(accounts = [], participants = []) {
  const parts = participants.length > 0 ? participants : [
    { id: "misha", name: "Миша", color: "#38bdf8" }, { id: "max", name: "Макс", color: "#c084fc" }
  ];
  const names = Object.fromEntries(parts.map(p => [p.id, p.name]));
  const colors = Object.fromEntries(parts.map(p => [p.id, p.color]));
  const paidMap = Object.fromEntries(parts.map(p => [p.id, 0]));
  const consumedMap = Object.fromEntries(parts.map(p => [p.id, 0]));
  let totalUnsettled = 0, totalRes = 0, activeRes = 0, downRes = 0;

  for (const acc of accounts) {
    for (const res of (acc.resources || [])) {
      const cost = res.unsettled_cost || 0;
      totalUnsettled += cost; totalRes++;
      if (res.http_status === "up") activeRes++; else if (res.http_status === "down") downRes++;
      paidMap[acc.payer] = (paidMap[acc.payer] || 0) + cost;
      if (res.consumer === "split") {
        const share = cost / parts.length;
        for (const p of parts) consumedMap[p.id] = (consumedMap[p.id] || 0) + share;
      } else {
        consumedMap[res.consumer] = (consumedMap[res.consumer] || 0) + cost;
      }
    }
  }

  const balances = {};
  const stats = parts.map(p => {
    const net = Math.round(((paidMap[p.id] || 0) - (consumedMap[p.id] || 0)) * 100) / 100;
    balances[p.id] = net;
    return { id: p.id, name: names[p.id] || p.id, color: colors[p.id] || "#38bdf8",
      paid_total: Math.round((paidMap[p.id] || 0) * 100) / 100,
      consumed_total: Math.round((consumedMap[p.id] || 0) * 100) / 100, net_balance: net };
  });

  const transfers = simplifyDebts(balances, names);
  let summaryText = "Все взаиморасчеты закрыты (0 ₽)", direction = "settled";

  if (parts.length === 2) {
    const net1 = balances[parts[0].id] || 0;
    if (net1 > 0.005) {
      direction = `${parts[1].id}_owes_${parts[0].id}`;
      summaryText = `${names[parts[1].id]} должен ${formatDative(names[parts[0].id])} ${formatRubles(net1)}`;
    } else if (net1 < -0.005) {
      direction = `${parts[0].id}_owes_${parts[1].id}`;
      summaryText = `${names[parts[0].id]} должен ${formatDative(names[parts[1].id])} ${formatRubles(-net1)}`;
    }
  } else if (transfers.length === 1) {
    summaryText = `${transfers[0].from_name} должен ${formatDative(transfers[0].to_name)} ${formatRubles(transfers[0].amount)}`;
    direction = `${transfers[0].from_id}_owes_${transfers[0].to_id}`;
  } else if (transfers.length > 1) {
    summaryText = `Взаиморасчеты: ` + transfers.map(t => `${t.from_name} → ${formatDative(t.to_name)} ${formatRubles(t.amount)}`).join(", ");
    direction = "multi";
  }

  return {
    summary_text: summaryText, direction,
    total_unsettled_cost: Math.round(totalUnsettled * 100) / 100,
    total_resources_count: totalRes, active_resources_count: activeRes, down_resources_count: downRes,
    accounts_count: accounts.length, participant_stats: stats, transfers
  };
}
