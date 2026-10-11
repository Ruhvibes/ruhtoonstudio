/* RuhToon Studio — 3D stage: renderer, procedural character (+hair/hat/glasses),
   background presets, camera presets, GLB import with clip/morph inspection. */
(function(){
'use strict';

let renderer=null, scene=null, camera=null, canvas=null, wrap=null;
let charGroup=null, parts={}, glbModel=null, mixer=null, glbClips=[], glbMorphs=[];
let speaking=false, mouthAmp=0, expression='happy';
let aspectMode='16:9'; // or '9:16'
let glbAnimations=[];

const BG = {
  sky:    {bg:'#151d36', floor:'#252f50', fog:null, stars:false},
  night:  {bg:'#05070f', floor:'#11152a', fog:null, stars:true},
  sunset: {bg:'#2b1430', floor:'#3a2030', fog:null, stars:false},
  studio: {bg:'#1a1d29', floor:'#2a2e42', fog:null, stars:false}
};
const CAM = { closeup:{z:4.2,y:1.0}, medium:{z:7.2,y:1.2}, wide:{z:11,y:1.6} };
let starField=null;

function mat(color, roughness){
  return new THREE.MeshStandardMaterial({color:color, roughness:(roughness==null?0.72:roughness)});
}

function buildProcedural(cfg){
  const g = new THREE.Group();
  const P = {};
  const skinMat = mat(cfg.skin||'#ffc58f'), shirtMat = mat(cfg.shirt||'#7c5cff'),
        hairMat = mat(cfg.hair||'#3a2a1a', .9), darkMat = mat('#20243a'),
        whiteMat = mat('#ffffff'), irisMat = mat('#3c78d8'), mouthMat = mat('#642c35');
  function sphere(name, scale, material, pos){
    const m = new THREE.Mesh(new THREE.SphereGeometry(1,28,20), material);
    m.name=name; m.scale.set(scale[0],scale[1],scale[2]); m.position.set(pos[0],pos[1],pos[2]);
    m.castShadow=true; m.receiveShadow=true; g.add(m); P[name]=m; return m;
  }
  function capsule(name, r, len, material, pos, rot){
    rot = rot||[0,0,0];
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r,len,6,12), material);
    m.name=name; m.position.set(pos[0],pos[1],pos[2]); m.rotation.set(rot[0],rot[1],rot[2]);
    m.castShadow=true; g.add(m); P[name]=m; return m;
  }
  sphere('body',[.72,.92,.42],shirtMat,[0,-.85,0]);
  sphere('neck',[.22,.3,.22],skinMat,[0,-.05,0]);
  sphere('head',[.83,.94,.7],skinMat,[0,.85,0]);
  sphere('earL',[.18,.24,.13],skinMat,[-.82,.8,0]); sphere('earR',[.18,.24,.13],skinMat,[.82,.8,0]);
  sphere('eyeWhiteL',[.19,.24,.1],whiteMat,[-.3,1.02,.61]); sphere('eyeWhiteR',[.19,.24,.1],whiteMat,[.3,1.02,.61]);
  sphere('irisL',[.09,.12,.06],irisMat,[-.28,1,.70]); sphere('irisR',[.09,.12,.06],irisMat,[.32,1,.70]);
  sphere('pupilL',[.04,.06,.03],darkMat,[-.27,1,.75]); sphere('pupilR',[.04,.06,.03],darkMat,[.33,1,.75]);
  capsule('browL',.045,.22,darkMat,[-.3,1.32,.6],[0,0,-.12]);
  capsule('browR',.045,.22,darkMat,[.3,1.32,.6],[0,0,.12]);
  sphere('mouth',[.22,.055,.07],mouthMat,[0,.53,.64]);
  sphere('nose',[.09,.12,.1],skinMat,[0,.78,.67]);
  capsule('armL',.16,.58,shirtMat,[-.82,-.8,0],[0,0,-.45]);
  capsule('armR',.16,.58,shirtMat,[.82,-.8,0],[0,0,.45]);
  capsule('legL',.18,.48,darkMat,[-.34,-1.85,0]);
  capsule('legR',.18,.48,darkMat,[.34,-1.85,0]);
  sphere('shoeL',[.28,.13,.42],mat('#343c5d'),[-.34,-2.12,.12]);
  sphere('shoeR',[.28,.13,.42],mat('#343c5d'),[.34,-2.12,.12]);
  // Hair cap
  const hair = new THREE.Mesh(new THREE.SphereGeometry(1,28,20,0,Math.PI*2,0,Math.PI*0.55), hairMat);
  hair.name='hair'; hair.scale.set(.88,.8,.75); hair.position.set(0,1.02,-.06);
  hair.castShadow=true; g.add(hair); P.hair=hair;
  // Hat (toggle)
  const hatG = new THREE.Group(); hatG.name='hat';
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.07,28), mat('#8a2be2',.6));
  brim.position.y=0; brim.castShadow=true; hatG.add(brim);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.34,.38,.42,28), mat('#7c3aed',.6));
  top.position.y=.24; top.castShadow=true; hatG.add(top);
  hatG.position.set(0,1.72,0); hatG.visible=!!cfg.hat; g.add(hatG); P.hat=hatG;
  // Glasses (toggle)
  const glG = new THREE.Group(); glG.name='glasses';
  const lensMat = new THREE.MeshStandardMaterial({color:'#9ad6ff', roughness:.15, metalness:.1, transparent:true, opacity:.55});
  [-0.3,0.3].forEach(x=>{
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.17,.035,10,28), mat('#20243a',.4));
    ring.position.set(x,1.02,.68); glG.add(ring);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(.16,28), lensMat);
    lens.position.set(x,1.02,.69); glG.add(lens);
  });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(.3,.04,.04), mat('#20243a',.4));
  bridge.position.set(0,1.04,.68); glG.add(bridge);
  glG.visible=!!cfg.glasses; g.add(glG); P.glasses=glG;

  P.skinMat=skinMat; P.shirtMat=shirtMat; P.hairMat=hairMat;
  P.isProcedural=true;
  return {group:g, parts:P};
}

function setMouth(v){
  const m = parts.mouth; if(!m) return;
  m.scale.y = .035 + v*.17; m.scale.x = .19 + v*.035; m.position.y = .53 - v*.025;
}

function applyExpression(){
  const bL=parts.browL, bR=parts.browR; if(!bL||!bR) return;
  if (expression==='surprised'){ bL.position.y=1.38; bR.position.y=1.38; }
  else if (expression==='serious'){ bL.rotation.z=.3; bR.rotation.z=-.3; }
  else { bL.rotation.z=-.12; bR.rotation.z=.12; bL.position.y=1.32; bR.position.y=1.32; }
}

function animate(){
  requestAnimationFrame(animate);
  const t = performance.now()/1000;
  if (charGroup){
    // gentle sway: absolute, not cumulative (avoids long-session drift)
    charGroup.rotation.y = (charGroup.userData.baseRotY||0) + Math.sin(t*.55)*.16;
    charGroup.position.y = Math.sin(t*1.7)*.045 + (charGroup.userData.baseY||0);
  }
  if (mixer) mixer.update(0.016);
  if (speaking) setMouth(.2 + mouthAmp*.8 + Math.abs(Math.sin(t*13))*.25);
  else setMouth(0);
  if (parts.browL) applyExpression();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function sizeStage(){
  if (!wrap || !renderer || !camera) return;
  let w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return; // hidden (display:none) — skip, ResizeObserver will refire
  if (aspectMode==='9:16'){ h = w*16/9; } else { h = w*9/16; }
  h = Math.max(220, Math.min(h, 560));
  wrap.style.height = h+'px';
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function setBackground(name){
  const b = BG[name]||BG.sky;
  scene.background = new THREE.Color(b.bg);
  if (window._rtsFloor) window._rtsFloor.material.color.set(b.floor);
  if (starField) starField.visible = !!b.stars;
}

function setCamera(preset){
  const c = CAM[preset]||CAM.medium;
  camera.position.set(0, c.y, c.z);
  camera.lookAt(0, .4, 0);
}

function setCharPos(preset){
  if (!charGroup) return;
  const x = preset==='left' ? -2.2 : preset==='right' ? 2.2 : 0;
  charGroup.userData.baseX = x;
  charGroup.position.x = x;
}

function disposeGroup(gr){
  gr.traverse(o=>{
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
        if (m.map) m.map.dispose();
        if (m.emissiveMap) m.emissiveMap.dispose();
        m.dispose();
      });
    }
  });
}

window.RTS = window.RTS || {};
RTS.Stage = {
  init(canvasEl, wrapEl){
    canvas=canvasEl; wrap=wrapEl;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, 16/9, .1, 100);
    renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:false, preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.add(new THREE.HemisphereLight(0xcddcff, 0x34264d, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-3,5,5); key.castShadow=true; scene.add(key);
    const rim = new THREE.PointLight(0x7b76ff, 12, 18); rim.position.set(3,2,1); scene.add(rim);
    // floor + ring
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6,48), mat('#252f50'));
    floor.rotation.x=-Math.PI/2; floor.position.y=-2.28; floor.receiveShadow=true;
    scene.add(floor); window._rtsFloor=floor;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45,.025,8,80),
      new THREE.MeshStandardMaterial({color:'#7e75ff', emissive:'#3930a8', emissiveIntensity:1.3}));
    ring.rotation.x=Math.PI/2; ring.position.y=-2.24; scene.add(ring);
    // stars (hidden unless night)
    const sg = new THREE.BufferGeometry(), sp=[];
    for(let i=0;i<300;i++){ sp.push((Math.random()-.5)*40, Math.random()*20-2, -8-Math.random()*20); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp,3));
    starField = new THREE.Points(sg, new THREE.PointsMaterial({color:'#cdd8ff', size:.14}));
    starField.visible=false; scene.add(starField);
    setCamera('medium');
    new ResizeObserver(()=>sizeStage()).observe(wrap);
    sizeStage();
    animate();
  },
  loadCharacter(cfg){
    // dispose old
    if (charGroup){ scene.remove(charGroup); disposeGroup(charGroup); }
    charGroup=null; parts={}; glbModel=null; mixer=null; glbClips=[]; glbMorphs=[];
    if (cfg.mode==='glb' && cfg.glbUrl){
      return RTS.Stage.loadGLB(cfg.glbUrl).then(info=>{
        expression = cfg.expression||'happy';
        RTS.Stage.applyTransform(cfg);
        return info;
      });
    }
    const built = buildProcedural(cfg||{});
    charGroup = built.group; parts = built.parts;
    expression = cfg.expression||'happy';
    scene.add(charGroup);
    RTS.Stage.applyTransform(cfg||{});
    return Promise.resolve({clips:[], morphs:[]});
  },
  loadGLB(url){
    return new Promise((resolve, reject)=>{
      try{
        const loader = new THREE.GLTFLoader();
        loader.load(url,
          gltf=>{
            glbModel = gltf.scene;
            charGroup = new THREE.Group();
            charGroup.add(glbModel);
            // normalize: scale to ~4 units tall, feet planted on the floor (y=-2.28)
            const box = new THREE.Box3().setFromObject(glbModel);
            const size = new THREE.Vector3(); box.getSize(size);
            const h = size.y||1, s = 4/h;
            glbModel.scale.setScalar(s);
            glbModel.position.set(-box.min.x*s, -2.28 - box.min.y*s, -box.min.z*s);
            scene.add(charGroup);
            mixer = (gltf.animations && gltf.animations.length) ? new THREE.AnimationMixer(glbModel) : null;
            glbAnimations = gltf.animations||[];
            glbClips = glbAnimations.map(a=>a.name||'clip');
            // morph targets
            glbMorphs = [];
            glbModel.traverse(o=>{
              if (o.morphTargetDictionary) Object.keys(o.morphTargetDictionary).forEach(k=>{
                if (glbMorphs.indexOf(k)<0) glbMorphs.push(k);
              });
            });
            resolve({clips:glbClips, morphs:glbMorphs});
          },
          undefined,
          err=>reject(new Error((err&&err.message)||'load failed'))
        );
      }catch(e){ reject(e); }
    });
  },
  glbInfo(){ return {clips:glbClips.slice(), morphs:glbMorphs.slice()}; },
  playGlbClip(name){
    if (!mixer || !glbAnimations.length) return false;
    const clip = glbAnimations.find(a=>(a.name||'clip')===name) || glbAnimations[0];
    if (!clip) return false;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset().play();
    return true;
  },
  stopGlbClip(){ if (mixer) mixer.stopAllAction(); },
  applyTransform(cfg){
    if (!charGroup) return;
    const p=cfg.pos||[0,0,0], r=cfg.rot||[0,0,0];
    charGroup.userData.baseX=p[0]; charGroup.userData.baseY=p[1];
    charGroup.userData.baseRotY=r[1]||0;
    charGroup.position.set(p[0],p[1],p[2]);
    charGroup.rotation.set(r[0],r[1],r[2]);
    charGroup.scale.setScalar(cfg.scale||1);
  },
  setColors(cfg){
    if (parts.skinMat) parts.skinMat.color.set(cfg.skin||'#ffc58f');
    if (parts.shirtMat) parts.shirtMat.color.set(cfg.shirt||'#7c5cff');
    if (parts.hairMat) parts.hairMat.color.set(cfg.hair||'#3a2a1a');
  },
  setExpression(e){ expression=e; },
  setHat(v){ if(parts.hat) parts.hat.visible=!!v; },
  setGlasses(v){ if(parts.glasses) parts.glasses.visible=!!v; },
  setSpeaking(v, amp){ speaking=!!v; if(amp!=null) mouthAmp=Math.max(0,Math.min(1,amp)); },
  setBackground: setBackground, setCamera: setCamera, setCharPos: setCharPos,
  setAspect(m){ aspectMode=m; sizeStage(); },
  getCanvas(){ return canvas; },
  getRenderer(){ return renderer; },
  resize: sizeStage
};
})();
