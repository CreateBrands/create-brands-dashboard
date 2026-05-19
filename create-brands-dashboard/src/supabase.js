// ════════════════════════════════════════════════════════════════════════════
// fetchEODTodaySummary — matched to your actual eod_entries schema
// ════════════════════════════════════════════════════════════════════════════
// ADD THIS to your supabase.js alongside fetchChainSummary etc.
//
// Notes about your current schema (and what we're doing about it):
//   - EOD is currently brand-level (no store_id column) — one row per brand per day
//   - For now, "stores_with_eod" is 0 or 1 (entry submitted today or not)
//   - When you later migrate EOD to per-store, swap this function for the
//     commented version at the bottom.
//
// Returns: {
//   stores_with_eod:           1,           // 0 = not submitted, 1 = submitted (brand-level)
//   stores_total:              22,          // operational stores
//   total_revenue:             3527.45,     // net_sales from today's EOD
//   total_orders_eod:          850,         // total_orders from today's EOD (for comparison)
//   atv_eod:                   4.15,        // average ticket value from EOD
//   variance:                  -12.50,      // cash_variance — useful to flag
//   last_entered_minutes_ago:  47,
//   manager_name:              'Atif',      // who submitted
//   submitted_at:              '14:32',     // when, local time
// }

export async function fetchEODTodaySummary() {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Today's EOD for the Chocoberry brand
  const { data: eodToday, error } = await supabase
    .from("eod_entries")
    .select("net_sales, total_orders, atv, cash_variance, manager, timestamp")
    .eq("date", todayStr)
    .eq("brand_id", "chocoberry")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Store count (operational Chocoberry)
  const { data: stores } = await supabase
    .from("stores")
    .select("id")
    .eq("brand_id", "chocoberry")
    .eq("status", "operational");

  const storesTotal = stores?.length || 0;

  if (error || !eodToday) {
    return {
      stores_with_eod:          0,
      stores_total:             storesTotal,
      total_revenue:            null,
      total_orders_eod:         null,
      atv_eod:                  null,
      variance:                 null,
      last_entered_minutes_ago: null,
      manager_name:             null,
      submitted_at:             null,
    };
  }

  const minsAgo = Math.floor(
    (Date.now() - new Date(eodToday.timestamp).getTime()) / 60000
  );

  const submittedAt = new Date(eodToday.timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    stores_with_eod:          1,                        // brand-level: 0 or 1
    stores_total:             storesTotal,
    total_revenue:            Number(eodToday.net_sales || 0),
    total_orders_eod:         eodToday.total_orders || null,
    atv_eod:                  eodToday.atv != null ? Number(eodToday.atv) : null,
    variance:                 eodToday.cash_variance != null ? Number(eodToday.cash_variance) : null,
    last_entered_minutes_ago: minsAgo,
    manager_name:             eodToday.manager || null,
    submitted_at:             submittedAt,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FUTURE — when EOD becomes per-store, swap to this version:
// ════════════════════════════════════════════════════════════════════════════
//
// export async function fetchEODTodaySummary() {
//   const today = new Date();
//   const todayStr = ...;
//
//   const { data: eodToday } = await supabase
//     .from("eod_entries")
//     .select("store_id, net_sales, total_orders, timestamp")
//     .eq("date", todayStr)
//     .eq("brand_id", "chocoberry");
//
//   const { data: stores } = await supabase
//     .from("stores")
//     .select("id")
//     .eq("brand_id", "chocoberry")
//     .eq("status", "operational");
//
//   const distinctStoreIds = new Set((eodToday || []).map(e => e.store_id));
//   const totalRevenue = (eodToday || []).reduce((s, e) => s + Number(e.net_sales || 0), 0);
//   ...
// }
