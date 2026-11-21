"use client";

import { useEffect } from "react";

/**
 * Liquid glass engine.
 *
 * 1. Refraction — for every `.glass` / `.glass-strong` surface, builds an SVG
 *    displacement filter sized to that element (cached by size + radius) and
 *    applies it through `backdrop-filter`. The map is neutral in the centre and
 *    ramps at the rounded edges, so whatever sits behind the glass bends at its
 *    rim like a real lens. Only Chromium renders SVG filters in
 *    backdrop-filter; other browsers keep the plain frosted CSS fallback.
 * 2. Specular light — the hovered surface's highlight follows the pointer
 *    (CSS vars --lg-x / --lg-y, smoothed with @property transitions).
 *
 * Respects prefers-reduced-motion and prefers-reduced-transparency.
 */

const SELECTOR = ".glass, .glass-strong";
const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_SIDE = 1600; // skip refraction on huge surfaces (performance)

function mapUri(w: number, h: number, r: number, edge: number) {
  const inner = Math.max(r - edge, 0);
  const svg =
    `<svg xmlns="${SVG_NS}" width="${w}" height="${h}">` +
    `<defs><linearGradient id="r" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#f00"/></linearGradient>` +
    `<linearGradient id="b" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#00f"/></linearGradient>` +
    `<filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(edge / 2.4).toFixed(1)}"/></filter></defs>` +
    `<rect width="${w}" height="${h}" fill="#808080"/>` +
    `<rect width="${w}" height="${h}" rx="${r}" fill="url(#r)"/>` +
    `<rect width="${w}" height="${h}" rx="${r}" fill="url(#b)" style="mix-blend-mode:screen"/>` +
    `<rect x="${edge}" y="${edge}" width="${w - 2 * edge}" height="${h - 2 * edge}" rx="${inner}" fill="#808080" filter="url(#f)"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function supportsRefraction() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-transparency: reduce)").matches) return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  const chromium = brands ? brands.some((b) => /Chromium|Google Chrome|Microsoft Edge|Brave/i.test(b.brand)) : /Chrome\//.test(navigator.userAgent) && !/Edg\/|OPR\//.test(navigator.userAgent) ? true : false;
  return chromium && CSS.supports("backdrop-filter", "url(#x)");
}

export function LiquidGlass() {
  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- Specular highlight that follows the pointer ----------
    let raf = 0;
    let lastEl: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      if (reduceMotion || e.pointerType === "touch") return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const t = e.target instanceof Element ? (e.target.closest(SELECTOR) as HTMLElement | null) : null;
        if (lastEl && lastEl !== t) {
          lastEl.style.removeProperty("--lg-x");
          lastEl.style.removeProperty("--lg-y");
        }
        lastEl = t;
        if (!t) return;
        const r = t.getBoundingClientRect();
        t.style.setProperty("--lg-x", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        t.style.setProperty("--lg-y", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    if (!supportsRefraction()) {
      return () => window.removeEventListener("pointermove", onMove);
    }
    root.classList.add("lg-refract");

    // ---------- Refraction filters ----------
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    svg.style.pointerEvents = "none";
    const defs = document.createElementNS(SVG_NS, "defs");
    svg.appendChild(defs);
    document.body.appendChild(svg);
    const made = new Set<string>();

    const filterFor = (w: number, h: number, r: number, strong: boolean, clear: boolean) => {
      // Quantise so similar surfaces share one filter.
      const qw = Math.max(8, Math.round(w / 4) * 4);
      const qh = Math.max(8, Math.round(h / 4) * 4);
      const qr = Math.min(Math.round(r), Math.floor(Math.min(qw, qh) / 2));
      const edge = Math.max(6, Math.min(Math.round(Math.min(qw, qh) * (clear ? 0.3 : 0.22)), strong ? 26 : 20));
      const scale = -Math.min(edge * (clear ? 3 : 2.2), strong ? 56 : clear ? 60 : 44);
      const id = `lg-${qw}-${qh}-${qr}-${strong ? 1 : 0}${clear ? "c" : ""}`;
      if (!made.has(id)) {
        made.add(id);
        const f = document.createElementNS(SVG_NS, "filter");
        f.setAttribute("id", id);
        f.setAttribute("x", "0");
        f.setAttribute("y", "0");
        f.setAttribute("width", String(qw));
        f.setAttribute("height", String(qh));
        f.setAttribute("filterUnits", "userSpaceOnUse");
        f.setAttribute("primitiveUnits", "userSpaceOnUse");
        f.setAttribute("color-interpolation-filters", "sRGB");
        const img = document.createElementNS(SVG_NS, "feImage");
        img.setAttribute("href", mapUri(qw, qh, qr, edge));
        img.setAttribute("x", "0");
        img.setAttribute("y", "0");
        img.setAttribute("width", String(qw));
        img.setAttribute("height", String(qh));
        img.setAttribute("preserveAspectRatio", "none");
        img.setAttribute("result", "map");
        const d = document.createElementNS(SVG_NS, "feDisplacementMap");
        d.setAttribute("in", "SourceGraphic");
        d.setAttribute("in2", "map");
        d.setAttribute("scale", String(scale));
        d.setAttribute("xChannelSelector", "R");
        d.setAttribute("yChannelSelector", "B");
        f.append(img, d);
        defs.appendChild(f);
      }
      return id;
    };

    const apply = (el: HTMLElement) => {
      if (el.dataset.lg === "off") return;
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) {
        el.style.removeProperty("backdrop-filter");
        return;
      }
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const strong = el.classList.contains("glass-strong");
      const clear = el.dataset.lg === "clear";
      const id = filterFor(width, height, radius, strong, clear);
      const blur = clear ? 2 : strong ? 20 : 10;
      const value = `blur(${blur}px) url(#${id}) saturate(1.7) brightness(1.04)`;
      if (el.style.backdropFilter !== value) el.style.backdropFilter = value;
    };

    const ro = new ResizeObserver((entries) => entries.forEach((e) => apply(e.target as HTMLElement)));
    const watched = new WeakSet<Element>();
    const scan = (node: ParentNode) => {
      const list: Element[] = [];
      if (node instanceof Element && node.matches(SELECTOR)) list.push(node);
      node.querySelectorAll?.(SELECTOR).forEach((n) => list.push(n));
      list.forEach((n) => {
        if (watched.has(n)) return;
        watched.add(n);
        ro.observe(n);
      });
    };
    scan(document.body);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => n instanceof Element && scan(n));
        if (m.type === "attributes" && m.target instanceof HTMLElement && m.target.matches(SELECTOR)) {
          if (!watched.has(m.target)) scan(m.target);
          else apply(m.target);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    return () => {
      window.removeEventListener("pointermove", onMove);
      mo.disconnect();
      ro.disconnect();
      svg.remove();
      root.classList.remove("lg-refract");
    };
  }, []);
  return null;
}
