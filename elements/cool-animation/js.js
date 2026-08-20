const stage = document.querySelector('.printing-animation .stage')
const col = document.querySelector('.printing-animation .col')
const box = document.querySelector('.printing-animation .box')

for (i=0; i<9; i++){
  const b = box.cloneNode(true)
  col.append(b)
}
gsap.set('.printing-animation .box', { y:(i)=>i*10 })

for (i=0; i<=9; i++){
  const c = col.cloneNode(true)
  gsap.set(c, {x:10*i, attr:{class:'col col'+i}})
  gsap.set(c.querySelectorAll('.box'), {attr:{class:'box'+i}})
  stage.append(c)
}

col.remove()// remove initial column


const tl= gsap.timeline()
.to('.printing-animation .col', {
  duration:1.5,
  y:11,
  ease:'sine.inOut',
  stagger:{
    amount:3,
    repeat:-1,
    yoyo:true
  }
}, 0)

for (i=0; i<=9; i++){
  tl.add(
  gsap.fromTo('.printing-animation .box'+i+' *', {
    y:(j)=>gsap.utils.interpolate(77,-77,j/10),
    transformOrigin:'50%',
    scale:0.133
  },{
    y:(j)=>gsap.utils.interpolate(i,-i,j/10),
    scale:0.8,
    duration:1,
    ease:'sine',
    repeat:-1,
    yoyo:true,
    yoyoEase:'sine.in'
  }), i/10)
}

tl.play(50)