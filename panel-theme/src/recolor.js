/* Fortless panel theme: remaps Pterodactyl's baked-in colors, radii and shadows onto Petal tokens.
   Runs against the CSSOM so dynamic styled-components variants are covered too. */
(function () {
  'use strict';
  if (window.__fortlessTheme) return;
  window.__fortlessTheme = true;

  // Pterodactyl neutral scale (h,s,l) -> [surface token, text token]
  var NEUTRAL = [
    [216, 33, 97, '--ink', '--ink'],
    [214, 15, 91, '--ink', '--ink'],
    [210, 16, 82, '--ink2', '--ink'],
    [211, 13, 65, '--ink2', '--ink2'],
    [211, 10, 53, '--ink3', '--ink3'],
    [211, 12, 43, '--s4', '--ink3'],
    [209, 14, 37, '--s3', '--ink2'],
    [209, 18, 30, '--s2', '--ink'],
    [209, 20, 25, '--s1', '--ink'],
    [210, 24, 16, '--bg', '--ink']
  ];

  // Tailwind saturated colors (r,g,b) -> token
  var SATURATED = [
    [8, 145, 178, '--accent'], [6, 182, 212, '--accent'], [34, 211, 238, '--accent'], [14, 116, 144, '--accent-h'],
    [59, 130, 246, '--accent'], [37, 99, 235, '--accent'], [96, 165, 250, '--accent'], [29, 78, 216, '--accent-h'],
    [147, 197, 253, '--accent'], [30, 64, 175, '--accent-h'], [239, 246, 255, '--accent-bg'],
    [239, 68, 68, '--bad'], [220, 38, 38, '--bad'], [248, 113, 113, '--bad'], [185, 28, 28, '--bad'], [153, 27, 27, '--bad'],
    [252, 165, 165, '--bad'], [254, 226, 226, '--bad-bg'], [254, 202, 202, '--bad-bg'], [254, 242, 242, '--bad-bg'],
    [16, 185, 129, '--good'], [5, 150, 105, '--good'], [22, 163, 74, '--good'], [4, 120, 87, '--good'], [6, 95, 70, '--good'],
    [245, 158, 11, '--warn'], [217, 119, 6, '--warn'], [234, 179, 8, '--warn'], [146, 64, 14, '--warn']
  ];

  var TEXT_PROPS = /^(color|fill|stroke|caret-color|text-decoration-color|-webkit-text-fill-color)$/;
  var processed = typeof WeakSet === 'function' ? new WeakSet() : null;

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0, d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }

  function num(v) { return parseFloat(String(v).replace('%', '')); }

  // returns a CSS variable name or null
  function lookup(rgb, hsl, textual, isBorder) {
    var i;
    for (i = 0; i < NEUTRAL.length; i++) {
      var n = NEUTRAL[i];
      if (Math.abs(hsl[0] - n[0]) <= 2 && Math.abs(hsl[1] - n[1]) <= 2 && Math.abs(hsl[2] - n[2]) <= 2) {
        if (textual) return n[4];
        if (isBorder) return n[3] === '--bg' || n[3] === '--s1' ? '--s2' : '--s3';
        return n[3];
      }
    }
    for (i = 0; i < SATURATED.length; i++) {
      var c = SATURATED[i];
      if (rgb[0] === c[0] && rgb[1] === c[1] && rgb[2] === c[2]) return c[3];
    }
    if (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255 && !textual) return '--s1';
    if (rgb[0] === 19 && rgb[1] === 26 && rgb[2] === 32 && !textual) return '--bg';
    return null;
  }

  var COLOR_RE = /(hsla?|rgba?)\(\s*([^(),]+)\s*,\s*([^(),]+)\s*,\s*([^(),]+)\s*(?:,\s*(var\([^)]*\)|[^()]*?))?\s*\)/g;
  var HEX_RE = /#0891b2\b/gi;

  function withAlpha(token, alpha) {
    var base = 'var(' + token + ')';
    if (!alpha) return base;
    alpha = alpha.trim();
    if (alpha.indexOf('var(') === 0) {
      var withFallback = alpha.replace(/var\((--[a-z0-9-]+)\)/i, 'var($1, 1)');
      return 'color-mix(in srgb, ' + base + ' calc(' + withFallback + ' * 100%), transparent)';
    }
    var a = num(alpha);
    if (isNaN(a) || a >= 0.999) return base;
    if (a <= 0.001) return 'transparent';
    return 'color-mix(in srgb, ' + base + ' ' + Math.round(a * 1000) / 10 + '%, transparent)';
  }

  function recolorValue(prop, value) {
    var textual = TEXT_PROPS.test(prop);
    var isBorder = /^(border|outline)/.test(prop);
    var out = value.replace(COLOR_RE, function (match, fn, a, b, c, alpha) {
      var rgb, hsl;
      if (fn.indexOf('hsl') === 0) {
        hsl = [num(a), num(b), num(c)];
        rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
      } else {
        rgb = [Math.round(num(a)), Math.round(num(b)), Math.round(num(c))];
        hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
      }
      var token = lookup(rgb, hsl, textual, isBorder);
      return token ? withAlpha(token, alpha) : match;
    });
    return out.replace(HEX_RE, 'var(--accent)');
  }

  var RADIUS_SMALL = /^(0\.125rem|0\.25rem|0\.375rem|2px|4px|6px)$/;
  var RADIUS_MEDIUM = /^(0\.5rem|0\.75rem|8px|12px)$/;

  function reshape(prop, value) {
    if (/^border(-(top|bottom)-(left|right))?-radius$/.test(prop)) {
      var v = value.trim();
      if (RADIUS_SMALL.test(v)) return '14px';
      if (RADIUS_MEDIUM.test(v)) return '20px';
      return null;
    }
    if (prop === 'box-shadow') {
      if (/inset/.test(value) && /-2px/.test(value)) return 'none';
      if (/rgba?\(\s*0\s*,\s*0\s*,\s*0/.test(value) && !/ring/.test(value)) return 'none';
      return null;
    }
    if (prop === 'text-transform' && value === 'uppercase') return 'none';
    if (prop === 'letter-spacing' && value === '0.025em') return 'normal';
    return null;
  }

  function processStyle(style) {
    if (!style) return;
    for (var i = 0; i < style.length; i++) {
      var prop = style[i];
      if (!prop || prop.indexOf('--') === 0) continue;
      var value = style.getPropertyValue(prop);
      if (!value) continue;
      var next = reshape(prop, value);
      if (next === null) next = recolorValue(prop, value);
      if (next !== null && next !== value) {
        style.setProperty(prop, next, style.getPropertyPriority(prop));
      }
    }
  }

  function processRule(rule) {
    if (!rule) return;
    if (processed) {
      if (processed.has(rule)) return;
      processed.add(rule);
    }
    if (rule.style) processStyle(rule.style);
    var nested = rule.cssRules;
    if (nested) for (var i = 0; i < nested.length; i++) processRule(nested[i]);
  }

  function sweepSheet(sheet) {
    var rules;
    try { rules = sheet.cssRules; } catch (e) { return; }
    if (!rules) return;
    for (var i = 0; i < rules.length; i++) {
      try { processRule(rules[i]); } catch (e) { /* ignore */ }
    }
  }

  function sweepAll() {
    for (var i = 0; i < document.styleSheets.length; i++) sweepSheet(document.styleSheets[i]);
  }

  var proto = window.CSSStyleSheet && window.CSSStyleSheet.prototype;
  if (proto && proto.insertRule) {
    var original = proto.insertRule;
    proto.insertRule = function (text, index) {
      var at = original.call(this, text, index);
      try { processRule(this.cssRules[at]); } catch (e) { /* ignore */ }
      return at;
    };
  }

  sweepAll();
  if (window.MutationObserver) {
    new MutationObserver(function () { sweepAll(); }).observe(document.documentElement, { childList: true, subtree: true });
  }
  var ticks = 0;
  var timer = setInterval(function () {
    sweepAll();
    if (++ticks > 60) clearInterval(timer);
  }, 500);
  document.addEventListener('DOMContentLoaded', sweepAll);
  window.addEventListener('load', sweepAll);
})();
