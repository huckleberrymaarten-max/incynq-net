// ─────────────────────────────────────────────────────────────
// InCynq .net — shared price loader. Single source of truth: admin
// (Supabase app_content). Nothing here is a hardcoded price.
//
// Usage:
//   1. Add <script src="js/prices.js"></script> before </body>.
//   2. Mark any price element:  <span data-price="brand_activation_fee">3,500</span>
//      (the text is just a fallback shown before admin loads).
//   3. For prose, use {{tokens}} and call InCynqPrices.substitute(text).
//   4. For the ad-tier table, use InCynqPrices.tiers().
// ─────────────────────────────────────────────────────────────
(function () {
  var SB   = 'https://muzzjvegynsemlsbwggf.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11enpqdmVneW5zZW1sc2J3Z2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMjI5MDIsImV4cCI6MjA5MTU5ODkwMn0.AO2BgiecEKZvqCeZyJPZrS7AhOI6UsZTMHMvfXyAaXI';
  var HDRS = { apikey: ANON, Authorization: 'Bearer ' + ANON };

  var KEYS = [
    'brand_activation_fee','sub_brand_slot_fee','performer_activation_price',
    'broadcast_hour_price','tip_platform_cut_pct','welcome_credit',
    'welcome_credit_expiry_days','referral_reward','referral_monthly_limit','survey_reward',
    'cynqified_fee','dashboard_upgrade_monthly','dashboard_upgrade_annual',
    'pricing_tiers'
  ];

  var ready = (async function () {
    var map = {};
    try {
      var r = await fetch(SB + '/rest/v1/app_content?key=in.(' + KEYS.join(',') + ')&select=key,value', { headers: HDRS });
      var rows = await r.json();
      (Array.isArray(rows) ? rows : []).forEach(function (x) { map[x.key] = x.value; });
    } catch (e) {}
    return map;
  })();

  function fmt(v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? v : n.toLocaleString();
  }

  var API = {
    ready: ready,
    raw: async function () { return await ready; },

    // Replace {{key}} tokens in prose with the admin value (L$-formatted).
    substitute: async function (text) {
      var map = await ready;
      return String(text).replace(/\{\{(\w+)\}\}/g, function (m, k) {
        return map[k] == null ? m : fmt(map[k]);
      });
    },

    // Parsed ad pricing tiers from admin (array of {label,min,max,basic,featured,premium}).
    tiers: async function () {
      var map = await ready;
      try { return JSON.parse(map.pricing_tiers || '[]'); } catch (e) { return []; }
    },

    // Multi-paragraph ad-tier text (for the T&C {{AD_TIER_TABLE}} token).
    tierTableText: async function () {
      var tiers = await API.tiers();
      var EMOJI = ['⚡','🚀','🏆','👑'];
      function phrase(t) {
        if (t.min === 0)   return 'active when InCynq has fewer than ' + fmt((t.max || 0) + 1) + ' members';
        if (t.max == null) return 'active above ' + fmt(t.min) + ' members';
        return 'active from ' + fmt(t.min) + ' to ' + fmt(t.max + 1) + ' members';
      }
      return tiers.map(function (t, i) {
        return (EMOJI[i] || '⚡') + ' ' + t.label + ' Tier — ' + phrase(t) + '. ' +
          'Basic from ' + fmt(t.basic) + ' L$/week · Featured from ' + fmt(t.featured) +
          ' L$/week · Premium from ' + fmt(t.premium) + ' L$/week.';
      }).join('\n\n');
    },

    // Compact one-line ad-tier text (for the FAQ {{AD_TIER_INLINE}} token).
    tierInlineText: async function () {
      var tiers = await API.tiers();
      function span(t) {
        if (t.min === 0)   return 'under ' + fmt((t.max || 0) + 1) + ' members';
        if (t.max == null) return fmt(t.min) + '+';
        return fmt(t.min) + '-' + fmt(t.max + 1);
      }
      return tiers.map(function (t) {
        return t.label + ' Tier (' + span(t) + '): Basic ' + fmt(t.basic) +
          ' / Featured ' + fmt(t.featured) + ' / Premium ' + fmt(t.premium) + ' L$.';
      }).join(' ');
    },

    // Fill every [data-price="key"] element with its admin value.
    fill: async function (root) {
      var map = await ready;
      (root || document).querySelectorAll('[data-price]').forEach(function (el) {
        var k = el.getAttribute('data-price');
        if (map[k] != null) el.textContent = fmt(map[k]);
      });
    }
  };

  window.InCynqPrices = API;

  // Auto-fill data-price elements once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { API.fill(); });
  } else {
    API.fill();
  }
})();
