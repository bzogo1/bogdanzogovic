document.addEventListener("DOMContentLoaded", () => {
  gsap.registerPlugin(ScrollTrigger);
  // 1. Text & Form Reveal
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
  // 2. Horizontal Scroll Logic
  const track = document.getElementById("track");
  const items = gsap.utils.toArray(".carousel-item");
  // Calculate the total scrollable distance
  function getScrollAmount() {
    let trackWidth = track.scrollWidth;
    return -(trackWidth - window.innerWidth);
  }
  // Pin the section and scroll the track left
  const tween = gsap.to(track, {
    x: getScrollAmount,
    ease: "none",
    scrollTrigger: {
      trigger: "#connect-section",
      start: "center center",
      end: () => `+=${Math.abs(getScrollAmount())}`, // Duration of scroll
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true // Recalculate on resize
    }
  });
  // 3. Dynamic 3D Coverflow Effect
  // We use GSAP's ticker to continuously update the 3D rotation based on screen position
  function updateCoverflow() {
    const viewportCenter = window.innerWidth / 2;
    items.forEach((item) => {
      // Get position relative to viewport
      const rect = item.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2;
      // Calculate distance from center
      const distance = itemCenter - viewportCenter;
      // Logic for the curve:
      // - Max rotation 45deg
      // - Push items back on the Z axis the further away they are
      const maxRotation = 45;
      // Normalizing distance so 1 screen width = 1 max rotation
      let rotation = (distance / (window.innerWidth * 0.5)) * maxRotation;
      // Clamp values so it doesn't spin infinitely
      rotation = Math.max(-maxRotation, Math.min(maxRotation, rotation));
      // Calculate scale and z-depth (chunky elements scaling down gracefully)
      const scale = 1 - Math.abs(distance) / (window.innerWidth * 1.8);
      const clampedScale = Math.max(0.7, scale);
      const z = -Math.abs(distance) * 0.4; // Push back on Z axis
      gsap.set(item, {
        rotationY: rotation,
        scale: clampedScale,
        z: z
      });
    });
  }
  // Run the update continuously for smooth 3D interpolation
  gsap.ticker.add(updateCoverflow);
});
