const c = document.querySelector('#dots-canvas');
if (!c) {
} else {
  const ctx = c.getContext('2d');
  const cw = 2000;
  const ch = cw; 
  c.width = c.height = cw;

  let cRect = c.getBoundingClientRect();
  let sx = cw / cRect.width;
  let sy = ch / cRect.height;

  const T = Math.PI * 2;
  const m = { x:cw/2, y:ch/2, s:1.5, x2:cw/2, y2:ch/2 };
  const xTo = gsap.quickTo(m, "x", {duration:1, ease:"expo"})
  const yTo = gsap.quickTo(m, "y", {duration:1, ease:"expo"})
  const sTo = gsap.quickTo(m, "s", {duration:2, ease:"power2"})
  let boxes = [];

  // Use the same background images as the header
  const getBackgroundImage = () => {
    const isDark = document.body.classList.contains('dark');
    return isDark ? 'assets/images/hero-bg.webp' : 'assets/images/hero-bg-light.webp';
  };

  const props = {
    img: getBackgroundImage(),
    boxSize: 80,
    fade: false,
    dots: true,
    dotColor: '#fff',
  };

  ctx.fillStyle = props.dotColor;

  const img = new Image();
  img.src = props.img;
  img.onload = initImg;

  function initImg(){
    for (let x=0; x<=cw; x+=props.boxSize) { 
      for (let y=0; y<=ch; y+=props.boxSize) {
        boxes.push({ x, y, d:0, s:0 }) 
      }
    }
    gsap.ticker.add(update)
  }

  function update(){
    const d = Math.hypot((m.x-m.x2),(m.y-m.y2));
    sTo( d/cw*2 )
    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(img, 0, 0, cw, ch, 0, 0, cw, ch)
    boxes.forEach(drawImg)
    if (props.fade) ctx.globalAlpha = 1;
    if (props.dots) boxes.forEach(drawDots)
  }

  function drawImg(box){
    box.d = Math.hypot((box.x-m.x),(box.y-m.y));
    box.s = 1 - gsap.utils.clamp(0, 1, box.d/cw/m.s);
    if (box.s<0.001) return;
    let boxScaled = props.boxSize*(box.s);
    if (props.fade) ctx.globalAlpha = box.s
    ctx.drawImage(img, box.x+boxScaled/2, box.y+boxScaled/2, props.boxSize-boxScaled, props.boxSize-boxScaled, box.x, box.y, props.boxSize, props.boxSize)
  }

  function drawDots(box){
    ctx.beginPath();
    ctx.arc(box.x, box.y, props.boxSize*0.15*box.s, 0, T);
    ctx.fill();
  }

  // Handle mouse movement on the entire document
  const handleMouseMove = (e) => {
    cRect = c.getBoundingClientRect();
    sx = cw / cRect.width;
    sy = ch / cRect.height;
    
    // Calculate position relative to canvas
    const canvasX = e.clientX - cRect.left;
    const canvasY = e.clientY - cRect.top;
    
    // Only update if mouse is over or near the canvas
    if (canvasX >= -100 && canvasX <= cRect.width + 100 && 
        canvasY >= -100 && canvasY <= cRect.height + 100) {
      m.x2 = canvasX * sx;
      m.y2 = canvasY * sy;
      
      xTo(m.x2);
      yTo(m.y2);
    }
  };

  // Add event listener to document for global mouse tracking
  document.addEventListener('pointermove', handleMouseMove);
  document.addEventListener('mousemove', handleMouseMove);

  window.addEventListener('resize', ()=>{
    cRect = c.getBoundingClientRect()
    sx = cw / cRect.width;
    sy = ch / cRect.height;
  });

  // Handle theme changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        const newImg = getBackgroundImage();
        if (newImg !== props.img) {
          props.img = newImg;
          img.src = newImg;
          boxes = [];
          img.onload = initImg;
        }
      }
    });
  });

  observer.observe(document.body, { attributes: true });
}
