let hue, complexity, speed, configHash, angle;
const canvas = document.getElementById('scene'); 
const ctx = canvas.getContext('2d'); 
let width = canvas.width = window.innerWidth; 
let height = canvas.height = window.innerHeight; 
window.addEventListener('resize', () => { 
  width = canvas.width = window.innerWidth; 
  height = canvas.height = window.innerHeight; 
});
function reset() {
  angle = 0;
  hue = Math.floor(Math.random() * 360);
  complexity = Math.floor(Math.random() * 5) + 3; 
  speed = (Math.random() * 0.5 + 0.1).toFixed(2); 
  configHash = `hue=${hue}&complexity=${complexity}&speed=${speed}`;
}
canvas.addEventListener('click', reset);
function draw() {  
  ctx.fillStyle = 'rgba(5, 5, 5, 0.08)'; 
  ctx.fillRect(0, 0, width, height); 
  const centerX = width / 2; 
  const centerY = height / 2; 
  const baseRadius = Math.min(width, height) * 0.25; 
  ctx.lineWidth = 1.5; ctx.beginPath();  
  for (let i = 0; i < 360; i++) { 
    const rad = i * Math.PI / 180; 
    const r = baseRadius + Math.sin(rad * complexity + angle) * 60 * Math.cos(rad * 3 - angle); 
    const x = centerX + Math.cos(rad + angle * 0.1) * r; 
    const y = centerY + Math.sin(rad + angle * 0.1) * r; 
    if (i === 0) ctx.moveTo(x, y); 
    else ctx.lineTo(x, y);
  } 
  ctx.closePath();  
  ctx.strokeStyle = `hsl(${(hue + angle * 10) % 360}, 85%, 60%)`; 
  ctx.stroke(); 
  angle += (speed * 0.05); 
  requestAnimationFrame(draw); 
}
reset();
draw();