(() => {
  const revealTargets = document.querySelectorAll("[data-reveal]");
  const navLinks = document.querySelectorAll(".nav-links a");
  const glow = document.getElementById("heroGlow");
  const brandFit = document.getElementById("brandFit");

  function revealOnScroll() {
    const io = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    revealTargets.forEach((el) => io.observe(el));
  }

  function smoothParallax() {
    if (!glow) return;
    let raf = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const update = () => {
      const y = window.scrollY || window.pageYOffset;
      glow.style.transform = `translate3d(0, ${y * 0.08}px, 0)`;
      raf = 0;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (raf) return;
        raf = window.requestAnimationFrame(update);
      },
      { passive: true }
    );
    update();
  }

  function setActiveNav() {
    const sections = Array.from(navLinks)
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);
    if (!sections.length) return;

    const activeByScroll = () => {
      const y = window.scrollY + 120;
      let currentId = "";
      sections.forEach((sec) => {
        if (y >= sec.offsetTop) currentId = `#${sec.id}`;
      });
      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === currentId);
      });
    };

    window.addEventListener("scroll", activeByScroll, { passive: true });
    activeByScroll();
  }

  function fitBrandText() {
    if (!brandFit) return;
    const parent = brandFit.parentElement;
    if (!parent) return;

    const paddingLeft = parseFloat(getComputedStyle(parent).paddingLeft) || 0;
    const paddingRight = parseFloat(getComputedStyle(parent).paddingRight) || 0;
    const available = Math.max(parent.clientWidth - paddingLeft - paddingRight, 0);
    const text = (brandFit.textContent || "").trim() || "UBLOG";
    const probeSize = 100;
    const temp = document.createElement("span");
    temp.textContent = text;
    temp.style.position = "absolute";
    temp.style.visibility = "hidden";
    temp.style.whiteSpace = "nowrap";
    temp.style.pointerEvents = "none";
    temp.style.fontFamily = getComputedStyle(brandFit).fontFamily;
    temp.style.fontWeight = getComputedStyle(brandFit).fontWeight;
    temp.style.letterSpacing = getComputedStyle(brandFit).letterSpacing;
    temp.style.fontSize = `${probeSize}px`;
    document.body.appendChild(temp);
    const measured = temp.getBoundingClientRect().width || 1;
    temp.remove();

    const calculated = (available * probeSize) / measured;
    const clamped = Math.max(56, Math.min(380, calculated));
    brandFit.style.fontSize = `${clamped}px`;
  }

  function init() {
    revealOnScroll();
    smoothParallax();
    setActiveNav();
    fitBrandText();
    window.addEventListener("resize", fitBrandText);
    window.addEventListener("orientationchange", fitBrandText);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
