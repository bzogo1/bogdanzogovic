document.addEventListener("DOMContentLoaded", () => {
  gsap.registerPlugin(ScrollTrigger);

  gsap.from(".scroll-reveal", {
    scrollTrigger: {
      trigger: "#connect-section",
      start: "top 70%",
      toggleActions: "play none none reverse"
    },
    y: 50,
    opacity: 0,
    duration: 1,
    stagger: 0.3,
    ease: "power3.out"
  });

  const viewport = document.querySelector(".carousel-viewport");
  const track = document.getElementById("track");
  const items = gsap.utils.toArray(".carousel-item");

  if (!viewport || !track || !items.length) return;

  function updateCoverflow() {
    const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;

    items.forEach((item) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const distance = itemCenter - viewportCenter;
      const maxRotation = 35;
      const rotation = Math.max(-maxRotation, Math.min(maxRotation, (distance / (viewport.clientWidth * 0.5)) * maxRotation));
      const scale = 1 - Math.abs(distance) / (viewport.clientWidth * 1.8);
      const clampedScale = Math.max(0.72, scale);
      const z = -Math.abs(distance) * 0.25;

      gsap.set(item, {
        rotationY: rotation,
        scale: clampedScale,
        z: z,
        opacity: Math.max(0.5, clampedScale)
      });
    });
  }

  viewport.addEventListener("scroll", updateCoverflow, { passive: true });
  window.addEventListener("resize", updateCoverflow, { passive: true });
  updateCoverflow();
});
