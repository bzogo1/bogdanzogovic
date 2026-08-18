gsap.registerPlugin(ScrollTrigger);

const tl = gsap.timeline({
  scrollTrigger: {
    trigger: ".animation-wrapper",
    start: "top top",
    end: "+=150%", 
    scrub: 1, 
    pin: true, 
  }
});

// Phase 1: Expand the image to full screen and reduce the border radius to 0px
tl.to('.image-mask', {
  clipPath: 'inset(0vh 0vw round 0px)',
  ease: "power2.inOut",
  duration: 1
});

// Phase 2: Fade in and slide up the text elements with a slight stagger
tl.to('.text-overlay h1, .text-overlay p', {
  opacity: 1,
  y: 0,
  stagger: 0.2, 
  ease: "power2.out",
  duration: 0.8
});