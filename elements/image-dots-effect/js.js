const c = document.querySelector('#image-dots-canvas');
const ctx = c.getContext('2d');
const cw = 2000; //too small = poor image quality, too big = performance suffers
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

const imgs = {
  'dark': 'assets/images/hero-bg.webp',
  'light': 'assets/images/hero-bg-light.webp'
};

const props = {
  img: imgs['dark'], // image URL
  boxSize: 123, // size of grid boxes
  fade: false, // toggle fading opacity 
  dots: true, // toggle drawing dots
  dotColor: '#fff', // dot color
};

ctx.fillStyle = props.dotColor;

const img = new Image();
let isInitialLoad = true;

function loadImage(imageSrc) {
  img.src = imageSrc;
  img.onload = function() {
    if (isInitialLoad) {
      initImg();
      isInitialLoad = false;
    } else {
      boxes = [];
      initImg();
    }
  };
}

// Initial load with default image
loadImage(props.img);

function initImg(){
  for (let x=0; x<=cw; x+=props.boxSize) { for (let y=0; y<=ch; y+=props.boxSize) boxes.push({ x, y, d:0, s:0 }) }
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

function drawImg(c){
  c.d = Math.hypot((c.x-m.x),(c.y-m.y));
  c.s = 1 - gsap.utils.clamp(0, 1, c.d/cw/m.s);
  if (c.s<0.001) return;
  let boxScaled = props.boxSize*(c.s);
  if (props.fade) ctx.globalAlpha = c.s
  ctx.drawImage(img, c.x+boxScaled/2, c.y+boxScaled/2, props.boxSize-boxScaled, props.boxSize-boxScaled, c.x, c.y, props.boxSize, props.boxSize)
}

function drawDots(c){
  ctx.beginPath();
  ctx.arc(c.x, c.y, props.boxSize*0.15*c.s, 0, T);
  ctx.fill();
}

c.addEventListener('pointermove', (e)=> {
  m.x2 = (e.x - cRect.left) * sx;
  m.y2 = (e.y - cRect.top) * sy;
  xTo(m.x2)
  yTo(m.y2)
})

window.addEventListener('resize', ()=>{
  cRect = c.getBoundingClientRect()
  sx = cw / cRect.width;
  sy = ch / cRect.height;
});

// Theme switching logic
function updateImageForTheme() {
  const theme = document.body.classList.contains('light') ? 'light' : 'dark';
  const newImageSrc = imgs[theme];
  
  if (props.img !== newImageSrc) {
    props.img = newImageSrc;
    loadImage(newImageSrc);
  }
}

// Listen for theme changes
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === 'class') {
      updateImageForTheme();
    }
  });
});

observer.observe(document.body, { attributes: true });

// Initial theme setup
updateImageForTheme();