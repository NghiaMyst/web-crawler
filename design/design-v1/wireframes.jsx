// Wireframe variations for the webcrawler search dashboard.
// Five distinctly different layouts. B&W with one coral accent.
// Categories: football · manga · anime · games.

const CATS = [
  { id: 'football', label: 'Football', icon: '⚽', n: 4218 },
  { id: 'manga',    label: 'Manga',    icon: '本', n: 3107 },
  { id: 'anime',    label: 'Anime',    icon: 'ア', n: 2641 },
  { id: 'games',    label: 'Games',    icon: '◆', n: 1893 },
];

const SAMPLE = [
  { t: 'One Piece — Chapter 1118 spoilers thread', cat: 'manga',    src: 'reddit.com/r/OnePiece',   d: '2m',  s: 'Egghead arc finale leaks, raw scans dropping Friday…' },
  { t: 'Real Madrid 3–2 Barcelona — match report', cat: 'football', src: 'espn.com',                d: '14m', s: 'Bellingham brace, Vinicius assist; Xavi rues VAR call…' },
  { t: 'Frieren S2 release window confirmed',      cat: 'anime',    src: 'animenewsnetwork.com',    d: '38m', s: 'Madhouse confirms Jan 2027 broadcast; cast returning…' },
  { t: 'Elden Ring DLC: Shadow of the Erdtree II', cat: 'games',    src: 'ign.com',                 d: '1h',  s: 'FromSoftware teases sequel expansion at Summer Game Fest…' },
  { t: 'Chainsaw Man Part 2 vol. 18 cover reveal', cat: 'manga',    src: 'mangaplus.shueisha',      d: '2h',  s: 'Fujimoto delivers a cover that mirrors vol. 1 framing…' },
  { t: 'Premier League title race: 5 scenarios',   cat: 'football', src: 'theathletic.com',         d: '3h',  s: 'Arsenal need 4 wins; City have run-in advantage…' },
  { t: 'Demon Slayer Infinity Castle Pt.1 review', cat: 'anime',    src: 'crunchyroll.com',         d: '4h',  s: 'Ufotable\'s most ambitious animation cuts yet…' },
  { t: 'Hollow Knight: Silksong gold master',      cat: 'games',    src: 'teamcherry.com.au',       d: '6h',  s: 'Team Cherry confirms certification submitted to Nintendo…' },
];

const catIcon = (id) => ({football:'⚽', manga:'本', anime:'ア', games:'◆'}[id] || '•');
const catColorClass = (id) => `cat-${id}`;

// ===========================================================================
// A — CLASSIC ADMIN: top search + left filter rail + dense result list
// ===========================================================================
function VariantA() {
  return (
    <div className="wf" style={{display:'grid', gridTemplateColumns:'220px 1fr', gridTemplateRows:'56px 1fr'}}>
      {/* TOP BAR */}
      <div style={{gridColumn:'1 / -1', borderBottom:'2px solid var(--ink)', display:'flex', alignItems:'center', padding:'0 18px', gap:16, background:'var(--paper)'}}>
        <div className="hand" style={{fontSize:30, fontWeight:700, letterSpacing:'-.02em'}}>
          web<span style={{color:'var(--accent)'}}>crawler</span>
        </div>
        <div style={{flex:1, maxWidth:560}}>
          <div className="search wobble">
            <span className="icon"></span>
            <span className="ph-txt">search 11,859 crawled pages…</span>
            <span className="kbd">/</span>
          </div>
        </div>
        <span className="mono muted">last crawl · 4 min ago</span>
        <span className="ico">JM</span>
      </div>

      {/* LEFT RAIL — filters */}
      <aside style={{borderRight:'2px solid var(--ink)', padding:'16px 14px', background:'var(--paper-2)'}}>
        <div className="mono muted" style={{marginBottom:8}}>// NAVIGATE</div>
        <div className="col gap-4" style={{marginBottom:18}}>
          <div className="nav on"><span className="dot"></span>Search</div>
          <div className="nav"><span className="dot"></span>Crawls</div>
          <div className="nav"><span className="dot"></span>Sources</div>
          <div className="nav"><span className="dot"></span>Queue</div>
        </div>

        <div className="mono muted" style={{marginBottom:8}}>// CATEGORIES</div>
        <div className="col gap-6" style={{marginBottom:18}}>
          {CATS.map((c,i) => (
            <label key={c.id} className="row gap-8" style={{cursor:'pointer'}}>
              <span className={"check " + (i<3?'on':'')}></span>
              <span style={{flex:1, fontSize:14}}>{c.icon}  {c.label}</span>
              <span className="mono muted">{c.n.toLocaleString()}</span>
            </label>
          ))}
        </div>

        <div className="mono muted" style={{marginBottom:8}}>// DATE RANGE</div>
        <div className="col gap-6" style={{marginBottom:18}}>
          {['Last 24 h','Last 7 days','Last 30 days','All time'].map((d,i) => (
            <label key={d} className="row gap-8" style={{cursor:'pointer'}}>
              <span style={{width:14, height:14, borderRadius:'50%', border:'1.5px solid var(--ink)', background:i===1?'var(--ink)':'transparent', display:'inline-block', boxShadow:i===1?'inset 0 0 0 3px var(--paper)':'none'}}></span>
              <span style={{fontSize:14}}>{d}</span>
            </label>
          ))}
        </div>

        <div className="mono muted" style={{marginBottom:8}}>// SOURCE</div>
        <div className="col gap-4">
          {['reddit.com','espn.com','crunchyroll.com','ign.com','+ 142 more…'].map((s,i) => (
            <label key={s} className="row gap-8" style={{cursor:'pointer'}}>
              {i<4 ? <span className={"check " + (i===0?'on':'')}></span> : <span style={{width:14}}></span>}
              <span style={{fontSize:13, color: i===4?'var(--accent)':'var(--ink)'}}>{s}</span>
            </label>
          ))}
        </div>
      </aside>

      {/* RESULTS */}
      <main style={{padding:'14px 20px', overflow:'hidden'}}>
        <div className="row gap-10" style={{marginBottom:10, alignItems:'baseline'}}>
          <div className="hand" style={{fontSize:28, fontWeight:700}}>1,284 results</div>
          <span className="mono muted">for "<span className="hl">spoiler</span>" · sorted by recency</span>
          <div style={{flex:1}}></div>
          <span className="mono">sort:</span>
          <span className="pill">recent ▾</span>
          <span className="pill">density: dense ▾</span>
        </div>

        {/* active filter chips */}
        <div className="row gap-6" style={{marginBottom:14, flexWrap:'wrap'}}>
          <span className="chip on">manga ✕</span>
          <span className="chip on">anime ✕</span>
          <span className="chip on">football ✕</span>
          <span className="chip">last 24 h ✕</span>
          <span className="chip">reddit.com ✕</span>
          <span style={{fontSize:13, color:'var(--accent)', textDecoration:'underline', cursor:'pointer'}}>clear all</span>
        </div>

        <div className="box" style={{padding:'4px 6px'}}>
          {SAMPLE.map((r,i) => (
            <div key={i} className="resrow">
              <span className="ico sq">{catIcon(r.cat)}</span>
              <div className="col gap-4" style={{minWidth:0}}>
                <div style={{fontSize:15, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.t}</div>
                <div className="muted" style={{fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.s}</div>
              </div>
              <span className="tag">{r.cat}</span>
              <div className="col" style={{alignItems:'flex-end'}}>
                <span className="mono muted">{r.src}</span>
                <span className="mono" style={{color:'var(--accent)'}}>{r.d}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="row" style={{justifyContent:'center', marginTop:14, gap:6}}>
          {['‹','1','2','3','4','5','…','108','›'].map((p,i)=>(
            <span key={i} className="pill" style={{minWidth:24, textAlign:'center', background:p==='1'?'var(--ink)':'var(--paper)', color:p==='1'?'var(--paper)':'var(--ink)'}}>{p}</span>
          ))}
        </div>
      </main>

      {/* Annotation */}
      <Annotation x={250} y={48} a="left">
        <span>global search<br/>+ kbd shortcut "/"</span>
        <Arrow dx={140} dy={-20}/>
      </Annotation>
      <Annotation x={20} y={170} a="right">
        <Arrow dx={-15} dy={20} flip/>
        <span style={{paddingLeft:18}}>persistent<br/>filters live here</span>
      </Annotation>
    </div>
  );
}

// ===========================================================================
// B — HERO SEARCH + CATEGORY TILES (browse-first big tiles)
// ===========================================================================
function VariantB() {
  return (
    <div className="wf" style={{padding:'30px 40px', display:'flex', flexDirection:'column', gap:18}}>
      {/* topline */}
      <div className="row gap-16" style={{alignItems:'baseline'}}>
        <div className="hand" style={{fontSize:38, fontWeight:700, letterSpacing:'-.02em'}}>
          web<span style={{color:'var(--accent)'}}>crawler</span>
        </div>
        <div style={{flex:1}}></div>
        <div className="row gap-16 mono muted">
          <span>queue · 142</span>
          <span>errors · 3</span>
          <span>last sweep · 4m</span>
        </div>
        <span className="ico">JM</span>
      </div>

      {/* HERO */}
      <div className="col gap-8" style={{alignItems:'center', padding:'14px 0 4px'}}>
        <div className="hand" style={{fontSize:46, lineHeight:1, fontWeight:700}}>
          what did we crawl <span className="hl">today?</span>
        </div>
        <div className="mono muted">11,859 pages indexed across 4 categories · 148 sources</div>
      </div>

      {/* BIG SEARCH */}
      <div style={{maxWidth:760, width:'100%', alignSelf:'center', position:'relative'}}>
        <div className="search wobble" style={{padding:'14px 22px', fontSize:28}}>
          <span className="icon" style={{width:30, height:30}}></span>
          <span className="ph-txt">title, source, snippet, tag…</span>
          <span className="kbd">↵ search</span>
        </div>
        <div className="row gap-6" style={{marginTop:10, justifyContent:'center', flexWrap:'wrap'}}>
          <span className="mono muted">try:</span>
          <span className="chip">"one piece"</span>
          <span className="chip">premier league</span>
          <span className="chip">silksong</span>
          <span className="chip">spoilers</span>
        </div>
      </div>

      {/* CATEGORY TILES */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginTop:10}}>
        {CATS.map((c, i) => (
          <div key={c.id} className="cat-tile" style={i===0?{background:'var(--accent)', color:'var(--paper)'}:{}}>
            <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
              <div className="hand" style={{fontSize:52, lineHeight:.9}}>{c.icon}</div>
              <div className="mono" style={{textAlign:'right', opacity:.9}}>
                <div>{c.n.toLocaleString()}<br/>pages</div>
              </div>
            </div>
            <div>
              <h3>{c.label}</h3>
              <div className="mono" style={{marginTop:6, opacity:.85}}>
                {{football:'leagues · teams · transfers',
                  manga:'chapters · scans · reviews',
                  anime:'episodes · news · seasonals',
                  games:'releases · patches · leaks'}[c.id]}
              </div>
            </div>
            <div className="row gap-6" style={{justifyContent:'space-between'}}>
              <span className="mono">+ {[58,42,29,17][i]} today</span>
              <span className="hand" style={{fontSize:22}}>→</span>
            </div>
          </div>
        ))}
      </div>

      {/* recent crawls strip */}
      <div className="col gap-6" style={{marginTop:4}}>
        <div className="row gap-10" style={{alignItems:'baseline'}}>
          <div className="hand" style={{fontSize:22, fontWeight:700}}>just crawled</div>
          <div className="underline-sketch" style={{flex:1}}></div>
          <span className="mono muted">live feed</span>
        </div>
        <div className="row gap-10" style={{overflow:'hidden'}}>
          {SAMPLE.slice(0,4).map((r,i)=>(
            <div key={i} className="box" style={{flex:1, padding:'10px 12px', minWidth:0}}>
              <div className="row gap-6" style={{justifyContent:'space-between'}}>
                <span className="tag">{r.cat}</span>
                <span className="mono" style={{color:'var(--accent)'}}>{r.d}</span>
              </div>
              <div style={{fontSize:14, fontWeight:700, marginTop:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.t}</div>
              <div className="mono muted" style={{marginTop:2}}>{r.src}</div>
            </div>
          ))}
        </div>
      </div>

      <Annotation x={420} y={170} a="left">
        <Arrow dx={20} dy={-30}/>
        <span>search is THE focal point<br/>browse by tiles below</span>
      </Annotation>
      <Annotation x={760} y={350} a="right">
        <span>active category<br/>= accent fill</span>
        <Arrow dx={-30} dy={-8} flip/>
      </Annotation>
    </div>
  );
}

// ===========================================================================
// C — THREE-COLUMN SPLIT: filters · result list · preview pane
// ===========================================================================
function VariantC() {
  const sel = 2; // selected row index
  return (
    <div className="wf" style={{display:'grid', gridTemplateColumns:'180px 1fr 360px', gridTemplateRows:'52px 1fr'}}>
      {/* top */}
      <div style={{gridColumn:'1 / -1', borderBottom:'2px solid var(--ink)', display:'flex', alignItems:'center', padding:'0 16px', gap:14}}>
        <div className="hand" style={{fontSize:26, fontWeight:700}}>web<span style={{color:'var(--accent)'}}>crawler</span></div>
        <div className="search wobble" style={{flex:1, maxWidth:'none', padding:'4px 14px', fontSize:18}}>
          <span className="icon"></span>
          <span className="ph-txt">search across all categories…</span>
          <span className="kbd">⌘K</span>
        </div>
        <span className="pill">3 active filters</span>
        <span className="ico">JM</span>
      </div>

      {/* LEFT compact filters */}
      <aside style={{borderRight:'2px solid var(--ink)', padding:'14px 12px', background:'var(--paper-2)', overflow:'hidden'}}>
        <div className="mono muted">CATEGORY</div>
        <div className="col gap-4" style={{marginTop:6, marginBottom:14}}>
          {CATS.map((c,i)=>(
            <div key={c.id} className="row gap-6" style={{padding:'4px 6px', borderRadius:6, background:i===1?'var(--ink)':'transparent', color:i===1?'var(--paper)':'var(--ink)'}}>
              <span style={{fontFamily:'Caveat,cursive', fontSize:18, width:16, textAlign:'center'}}>{c.icon}</span>
              <span style={{fontSize:13, flex:1}}>{c.label}</span>
              <span className="mono" style={{opacity:.7, fontSize:10}}>{c.n}</span>
            </div>
          ))}
        </div>

        <div className="mono muted">SOURCE</div>
        <div className="col gap-4" style={{marginTop:6, marginBottom:14}}>
          {['mangaplus','crunchyroll','reddit','tcgplayer','espn'].map((s,i)=>(
            <label key={s} className="row gap-6">
              <span className={"check " + (i<2?'on':'')}></span>
              <span style={{fontSize:13}}>{s}</span>
            </label>
          ))}
        </div>

        <div className="mono muted">CRAWLED</div>
        <div className="col gap-4" style={{marginTop:6}}>
          {['today','this week','this month'].map((d,i)=>(
            <label key={d} className="row gap-6">
              <span style={{width:14, height:14, borderRadius:'50%', border:'1.5px solid var(--ink)', background:i===0?'var(--ink)':'transparent', boxShadow:i===0?'inset 0 0 0 3px var(--paper-2)':'none'}}></span>
              <span style={{fontSize:13}}>{d}</span>
            </label>
          ))}
        </div>
      </aside>

      {/* CENTER result list */}
      <main style={{overflow:'hidden', display:'flex', flexDirection:'column', borderRight:'2px solid var(--ink)'}}>
        <div className="row" style={{padding:'10px 14px', borderBottom:'1.5px dashed var(--ink)', alignItems:'baseline', gap:10}}>
          <span className="hand" style={{fontSize:22, fontWeight:700}}>312 results</span>
          <span className="mono muted">manga · today</span>
          <div style={{flex:1}}></div>
          <span className="mono">↑↓ to navigate</span>
        </div>
        <div style={{overflow:'hidden'}}>
          {SAMPLE.concat(SAMPLE.slice(0,2)).slice(0,7).map((r,i)=>(
            <div key={i} style={{padding:'10px 14px', borderBottom:'1.5px dashed var(--ink)', background:i===sel?'var(--accent)':'transparent', color:i===sel?'var(--paper)':'var(--ink)', cursor:'pointer'}}>
              <div className="row gap-8" style={{alignItems:'baseline'}}>
                <span className="tag" style={i===sel?{background:'var(--paper)',color:'var(--ink)'}:{}}>{r.cat}</span>
                <span style={{fontSize:14, fontWeight:700, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.t}</span>
                <span className="mono">{r.d}</span>
              </div>
              <div className="mono" style={{marginTop:4, opacity:.85, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.src} · {r.s}</div>
            </div>
          ))}
        </div>
      </main>

      {/* RIGHT preview pane */}
      <aside style={{padding:'14px', background:'var(--paper)', overflow:'hidden', display:'flex', flexDirection:'column', gap:10}}>
        <div className="row gap-6">
          <span className="tag acc">manga</span>
          <span className="mono muted">38 min ago</span>
        </div>
        <div className="hand" style={{fontSize:26, fontWeight:700, lineHeight:1.05}}>
          Frieren S2 release window confirmed
        </div>
        <div className="mono muted">animenewsnetwork.com / news / 2026-05-25</div>
        <div className="ph" style={{height:120}}><span className="label">// hero image placeholder</span></div>

        <div className="col gap-4" style={{marginTop:4}}>
          <div className="mono muted">SNIPPET</div>
          <div style={{fontSize:13, lineHeight:1.4}}>
            "Madhouse confirms <span className="hl">January 2027</span> broadcast window;
            principal cast returning. Ufotable rumored for opening sequence
            collaboration. Eight new staff additions revealed in trade press…"
          </div>
        </div>

        <div className="col gap-4">
          <div className="mono muted">EXTRACTED TAGS</div>
          <div className="row gap-4" style={{flexWrap:'wrap'}}>
            {['Frieren','Madhouse','S2','release date','2027'].map(t=>(<span key={t} className="chip">{t}</span>))}
          </div>
        </div>

        <div className="col gap-4">
          <div className="mono muted">CRAWL META</div>
          <div className="row" style={{justifyContent:'space-between'}}><span className="mono">depth</span><span className="mono">3</span></div>
          <div className="row" style={{justifyContent:'space-between'}}><span className="mono">status</span><span className="mono" style={{color:'var(--accent)'}}>200 OK</span></div>
          <div className="row" style={{justifyContent:'space-between'}}><span className="mono">size</span><span className="mono">42.1 kB</span></div>
        </div>

        <div style={{flex:1}}></div>
        <div className="row gap-6">
          <span className="chip on" style={{flex:1, justifyContent:'center'}}>open source ↗</span>
          <span className="chip" style={{flex:1, justifyContent:'center'}}>re-crawl</span>
        </div>
      </aside>

      <Annotation x={210} y={120} a="left">
        <span>j/k or ↑↓ to step thru<br/>preview updates live</span>
        <Arrow dx={150} dy={20}/>
      </Annotation>
    </div>
  );
}

// ===========================================================================
// D — DASHBOARD: stats widgets + search + per-category sparklines + feed
// ===========================================================================
function VariantD() {
  return (
    <div className="wf" style={{padding:'20px 28px', display:'flex', flexDirection:'column', gap:14}}>
      {/* HEADER */}
      <div className="row gap-16" style={{alignItems:'center'}}>
        <div className="hand" style={{fontSize:30, fontWeight:700}}>web<span style={{color:'var(--accent)'}}>crawler</span></div>
        <span className="mono muted">/ dashboard</span>
        <div style={{flex:1}}></div>
        <div className="search wobble" style={{minWidth:320, padding:'4px 14px', fontSize:18}}>
          <span className="icon"></span>
          <span className="ph-txt">search…</span>
          <span className="kbd">/</span>
        </div>
        <span className="ico">JM</span>
      </div>

      {/* KPI ROW */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
        {[
          {l:'pages indexed', v:'11,859', d:'+ 312 today', s:[3,5,4,6,7,6,9]},
          {l:'sources',       v:'148',    d:'+ 2 this week', s:[4,4,5,5,5,6,6]},
          {l:'queue depth',   v:'142',    d:'avg 4m latency', s:[6,5,7,4,5,3,4]},
          {l:'errors / 1h',   v:'3',      d:'2× 503 · 1× 404', s:[1,0,2,1,0,1,3], acc:true},
        ].map((k,i)=>(
          <div key={i} className="box" style={k.acc?{background:'var(--paper)', borderColor:'var(--accent)', borderWidth:2.5}:{}}>
            <div style={{padding:'10px 14px'}}>
              <div className="mono muted">{k.l}</div>
              <div className="row" style={{alignItems:'flex-end', gap:8, marginTop:2}}>
                <div className="hand" style={{fontSize:44, fontWeight:700, lineHeight:.9, color: k.acc?'var(--accent)':'var(--ink)'}}>{k.v}</div>
                <Spark vals={k.s} />
              </div>
              <div className="mono" style={{marginTop:6, color:k.acc?'var(--accent)':'var(--ink-3)'}}>{k.d}</div>
            </div>
          </div>
        ))}
      </div>

      {/* TWO COL: categories + activity */}
      <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:14, flex:1, minHeight:0}}>
        {/* per-category breakdown */}
        <div className="box" style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:10}}>
          <div className="row" style={{justifyContent:'space-between', alignItems:'baseline'}}>
            <div className="hand" style={{fontSize:24, fontWeight:700}}>by category</div>
            <span className="mono muted">last 7 days</span>
          </div>
          {CATS.map((c, i) => (
            <div key={c.id} className="row gap-10" style={{padding:'6px 0', borderBottom: i<3?'1.5px dashed var(--ink)':'none'}}>
              <span className="ico lg sq">{c.icon}</span>
              <div className="col" style={{flex:1, minWidth:0}}>
                <div className="row" style={{justifyContent:'space-between', alignItems:'baseline'}}>
                  <span style={{fontSize:16, fontWeight:700}}>{c.label}</span>
                  <span className="mono">{c.n.toLocaleString()} pages</span>
                </div>
                <div className="row gap-10" style={{marginTop:4, alignItems:'center'}}>
                  <Bars vals={[3,5,2,6,4,8,5].map(v=>v + i)} width={180} height={22} />
                  <span className="mono muted" style={{flex:1}}>+ {[58,42,29,17][i]} this week</span>
                  <span className="chip">browse →</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* live activity */}
        <div className="box" style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:6}}>
          <div className="row" style={{justifyContent:'space-between', alignItems:'baseline'}}>
            <div className="hand" style={{fontSize:24, fontWeight:700}}>live activity</div>
            <span className="row gap-6 mono"><span style={{width:8, height:8, borderRadius:'50%', background:'var(--accent)'}}></span>streaming</span>
          </div>
          {SAMPLE.slice(0,6).map((r,i)=>(
            <div key={i} className="row gap-8" style={{padding:'6px 0', borderBottom: i<5?'1.5px dashed var(--ink)':'none'}}>
              <span className="mono muted" style={{width:42}}>{r.d}</span>
              <span className="tag">{r.cat}</span>
              <div className="col" style={{flex:1, minWidth:0}}>
                <div style={{fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.t}</div>
                <div className="mono muted" style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.src}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Annotation x={400} y={68} a="left">
        <span>health glance<br/>before searching</span>
        <Arrow dx={20} dy={-15}/>
      </Annotation>
      <Annotation x={32} y={350} a="right">
        <Arrow dx={-10} dy={-15} flip/>
        <span style={{paddingLeft:8}}>click row → filtered<br/>search for that cat</span>
      </Annotation>
    </div>
  );
}

// ===========================================================================
// E — BROWSE-FIRST: rich category cards w/ subcategories; search docked
// ===========================================================================
function VariantE() {
  const subs = {
    football: ['Premier League','La Liga','Serie A','Bundesliga','Champions Lg','Transfers','National'],
    manga:    ['Shonen Jump','Seinen','Shojo','Webtoons','Scanlations','Reviews','Spoilers'],
    anime:    ['Seasonal','Movies','Studios','Reviews','News','OST','OVA'],
    games:    ['PC','PS5','Switch','Indie','Patches','Leaks','Esports'],
  };
  return (
    <div className="wf" style={{display:'grid', gridTemplateColumns:'56px 1fr', gridTemplateRows:'auto 1fr'}}>
      {/* slim left rail */}
      <aside style={{borderRight:'2px solid var(--ink)', background:'var(--paper-2)', display:'flex', flexDirection:'column', alignItems:'center', padding:'14px 0', gap:12, gridRow:'1 / -1'}}>
        <span className="ico sq" style={{background:'var(--accent)', color:'var(--paper)', borderColor:'var(--ink)'}}>w</span>
        <div className="underline-sketch" style={{width:24}}></div>
        {['◎','⌕','▦','⌬','⚙'].map((g,i)=>(
          <span key={i} className="ico sq" style={i===1?{background:'var(--ink)', color:'var(--paper)'}:{}}>{g}</span>
        ))}
        <div style={{flex:1}}></div>
        <span className="ico">JM</span>
      </aside>

      {/* header strip */}
      <div style={{borderBottom:'2px solid var(--ink)', padding:'14px 22px', display:'flex', alignItems:'center', gap:14}}>
        <div className="col" style={{flex:1}}>
          <div className="row gap-8" style={{alignItems:'baseline'}}>
            <span className="hand" style={{fontSize:30, fontWeight:700}}>browse the crawl</span>
            <span className="mono muted">11,859 pages · 4 categories · 148 sources</span>
          </div>
          <div className="mono muted" style={{marginTop:2}}>pick a category to drill in, or jump straight to search →</div>
        </div>
        <div className="search wobble" style={{minWidth:340, padding:'6px 16px', fontSize:18}}>
          <span className="icon"></span>
          <span className="ph-txt">jump to search…</span>
          <span className="kbd">⌘K</span>
        </div>
      </div>

      {/* big browse grid */}
      <main style={{padding:'18px 22px', overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr 1fr', gap:14, height:'100%'}}>
          {CATS.map((c, i) => (
            <div key={c.id} className="box shadow" style={{padding:'14px 18px', display:'flex', flexDirection:'column', gap:10, background: i===0?'var(--ink)':'var(--paper)', color:i===0?'var(--paper)':'var(--ink)'}}>
              <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
                <div className="col">
                  <div className="hand" style={{fontSize:44, lineHeight:.9, fontWeight:700}}>{c.label}</div>
                  <div className="mono" style={{marginTop:4, opacity:.8}}>
                    {{football:'matches, leagues, transfers',
                      manga:'chapters, scans, reviews',
                      anime:'seasonals, news, studios',
                      games:'releases, patches, leaks'}[c.id]}
                  </div>
                </div>
                <div className="hand" style={{fontSize:64, lineHeight:.85, opacity:.9}}>{c.icon}</div>
              </div>

              <div className="row gap-10" style={{alignItems:'baseline'}}>
                <span className="hand" style={{fontSize:28, fontWeight:700, color: i===0?'var(--accent)':'var(--ink)'}}>{c.n.toLocaleString()}</span>
                <span className="mono" style={{opacity:.8}}>pages crawled</span>
                <div style={{flex:1}}></div>
                <Spark vals={[3,5,4,6,7,6,9].map(v=>v+i)} stroke={i===0?'var(--accent)':'var(--ink)'} />
              </div>

              <div>
                <div className="mono" style={{opacity:.7, marginBottom:6}}>// SUBCATEGORIES</div>
                <div className="row gap-6" style={{flexWrap:'wrap'}}>
                  {subs[c.id].map((s,j)=>(
                    <span key={s} className="chip" style={i===0?{background:'transparent', color:'var(--paper)', borderColor:'var(--paper)'}:{}}>
                      {s} <span className="mono" style={{opacity:.6, marginLeft:4}}>{Math.round(c.n / (j+2))}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div style={{flex:1}}></div>
              <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                <span className="mono" style={{opacity:.8}}>+ {[58,42,29,17][i]} today · last crawl {[3,12,8,21][i]}m ago</span>
                <span className="hand" style={{fontSize:24, fontWeight:700, color: i===0?'var(--accent)':'var(--ink)'}}>browse →</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      <Annotation x={620} y={50} a="right">
        <span>search is always 1 keystroke away<br/>(⌘K from anywhere)</span>
        <Arrow dx={-30} dy={10} flip/>
      </Annotation>
      <Annotation x={300} y={210} a="left">
        <Arrow dx={20} dy={-12}/>
        <span>subcategories surface<br/>w/o another click</span>
      </Annotation>
    </div>
  );
}

// ===========================================================================
// Small sketchy helpers
// ===========================================================================
function Spark({ vals, stroke = 'var(--ink)', width = 80, height = 22 }) {
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * (width - 4) + 2;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="spark wobble" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function Bars({ vals, width = 140, height = 24, color = 'var(--ink)' }) {
  const max = Math.max(...vals);
  const bw = (width - (vals.length - 1) * 2) / vals.length;
  return (
    <svg className="bars wobble" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {vals.map((v, i) => {
        const h = (v / max) * (height - 2);
        return <rect key={i} x={i * (bw + 2)} y={height - h} width={bw} height={h} fill={color} />;
      })}
    </svg>
  );
}

function Annotation({ x, y, a, children }) {
  return (
    <div className="note" style={{ left: x, top: y, textAlign: a === 'right' ? 'right' : 'left', display:'flex', alignItems:'center', gap:4, transform:'rotate(-2deg)' }}>
      {children}
    </div>
  );
}
function Arrow({ dx = 60, dy = 0, flip = false }) {
  const w = Math.abs(dx) + 16, h = Math.abs(dy) + 16;
  const x1 = flip ? w - 4 : 4;
  const x2 = flip ? 4 : w - 4;
  const y1 = dy < 0 ? h - 4 : 4;
  const y2 = dy < 0 ? 4 : h - 4;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + (flip ? 8 : -8);
  return (
    <svg className="wobble" width={w} height={h} style={{flexShrink:0}}>
      <path d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round"/>
      <path d={`M ${x2} ${y2} l ${flip?6:-6} ${-4} M ${x2} ${y2} l ${flip?2:-2} ${7}`} stroke="var(--accent)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

Object.assign(window, { VariantA, VariantB, VariantC, VariantD, VariantE });
