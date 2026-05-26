// Mount the five variants in a DesignCanvas with a small Tweaks panel.

const { useState } = React;

const PALETTES = /*EDITMODE-BEGIN*/{
  "accent": "#d8553a",
  "showAnnotations": true,
  "vibe": "pencil"
}/*EDITMODE-END*/;

const VIBES = {
  pencil:   { paper: '#fbf8f2', paper2: '#f1ecdf', ink: '#1a1714', ink3: '#766f68', rule: '#1a1714' },
  napkin:   { paper: '#fff8e7', paper2: '#fbecc1', ink: '#3a2a14', ink3: '#8a7050', rule: '#3a2a14' },
  blueprint:{ paper: '#11314d', paper2: '#0f2a44', ink: '#e6efff', ink3: '#9bb3cc', rule: '#e6efff' },
  bw:       { paper: '#ffffff', paper2: '#eeeeee', ink: '#111111', ink3: '#777777', rule: '#111111' },
};

function applyVibe(v, accent, annotations){
  const p = VIBES[v] || VIBES.pencil;
  const r = document.documentElement;
  r.style.setProperty('--paper',  p.paper);
  r.style.setProperty('--paper-2',p.paper2);
  r.style.setProperty('--ink',    p.ink);
  r.style.setProperty('--ink-2',  p.ink);
  r.style.setProperty('--ink-3',  p.ink3);
  r.style.setProperty('--rule',   p.rule);
  r.style.setProperty('--accent', accent);
  document.body.style.background = v === 'blueprint' ? '#0a1f33' : '#f0eee9';
  document.body.dataset.annotations = annotations ? 'on' : 'off';
}

function App(){
  const [t, setTweak] = useTweaks(PALETTES);
  React.useEffect(() => { applyVibe(t.vibe, t.accent, t.showAnnotations); }, [t]);

  const variants = [
    { id:'a', label:'A · Classic admin',   sub:'top search + left filters + dense list',  Cmp:VariantA, w:1200, h:780 },
    { id:'b', label:'B · Hero + tiles',    sub:'search-first hero, browse below',         Cmp:VariantB, w:1200, h:820 },
    { id:'c', label:'C · Split + preview', sub:'filters · list · live preview pane',      Cmp:VariantC, w:1280, h:780 },
    { id:'d', label:'D · Dashboard',       sub:'KPIs, sparklines, live feed',             Cmp:VariantD, w:1200, h:820 },
    { id:'e', label:'E · Browse-first',    sub:'big category cards with subcategories',   Cmp:VariantE, w:1200, h:820 },
  ];

  return (
    <>
      <DesignCanvas>
        <DCSection
          id="wireframes"
          title="webcrawler · search dashboard"
          subtitle="5 wireframe directions · sketchy + low-fi · pick a direction to refine"
        >
          {variants.map(v => (
            <DCArtboard key={v.id} id={v.id} label={`${v.label} — ${v.sub}`} width={v.w} height={v.h}>
              <v.Cmp />
            </DCArtboard>
          ))}
        </DCSection>

        <DCSection id="notes" title="how to read these" subtitle="all wireframes share the same vocabulary">
          <DCArtboard id="legend" label="Legend & vocabulary" width={780} height={420}>
            <Legend />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Vibe">
          <TweakRadio
            label="Sketch style"
            value={t.vibe}
            onChange={(v) => setTweak('vibe', v)}
            options={[
              { value:'pencil',    label:'Pencil' },
              { value:'napkin',    label:'Napkin' },
              { value:'blueprint', label:'Blueprint' },
              { value:'bw',        label:'Pure B&W' },
            ]}
          />
          <TweakColor
            label="Accent"
            value={t.accent}
            onChange={(v) => setTweak('accent', v)}
            options={['#d8553a', '#2e6f5f', '#3b58c4', '#a9437a', '#1a1714']}
          />
          <TweakToggle
            label="Show annotations"
            value={t.showAnnotations}
            onChange={(v) => setTweak('showAnnotations', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

function Legend(){
  return (
    <div className="wf" style={{padding:'18px 22px', display:'flex', flexDirection:'column', gap:14}}>
      <div className="hand" style={{fontSize:30, fontWeight:700}}>vocabulary</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        <div className="col gap-10">
          <Row swatch={<span className="tag">manga</span>} label="category tag" hint="four total: football · manga · anime · games" />
          <Row swatch={<span className="chip on">filter ✕</span>} label="active filter chip" hint="click ✕ to drop, or 'clear all'" />
          <Row swatch={<span className="hl">spoiler</span>} label="highlighted search term" />
          <Row swatch={<span className="ico sq">本</span>} label="category glyph" hint="reused as avatars on result rows" />
          <Row swatch={<span className="kbd">/</span>} label="keyboard hint" />
        </div>
        <div className="col gap-10">
          <Row swatch={<div className="ph" style={{width:80, height:36}}><span className="label">// image</span></div>} label="image placeholder" hint="dropped in by editorial later" />
          <Row swatch={<span className="mono">// COMMENT</span>} label="section caption (monospace)" />
          <Row swatch={<span className="note" style={{position:'static', fontSize:16}}>annotation</span>} label="designer's note" hint="toggle off in Tweaks for a clean view" />
          <Row swatch={<div style={{width:80}}><div className="underline-sketch"></div></div>} label="sketchy divider" />
          <Row swatch={<span style={{fontFamily:'Caveat,cursive', fontSize:22, fontWeight:700}}>1,284</span>} label="big handwritten numeric" />
        </div>
      </div>
      <div className="mono muted" style={{marginTop:6}}>
        every wireframe assumes the same 4 categories &amp; ~11,859 indexed pages so you can compare layouts apples-to-apples.
      </div>
    </div>
  );
}
function Row({swatch, label, hint}){
  return (
    <div className="row gap-10" style={{alignItems:'center'}}>
      <div style={{minWidth:90, display:'flex', justifyContent:'flex-start'}}>{swatch}</div>
      <div className="col">
        <span style={{fontSize:14, fontWeight:700}}>{label}</span>
        {hint && <span className="mono muted">{hint}</span>}
      </div>
    </div>
  );
}

// Hide annotations via body attribute toggle.
const annoStyle = document.createElement('style');
annoStyle.textContent = `body[data-annotations="off"] .note { display:none !important; }`;
document.head.appendChild(annoStyle);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
