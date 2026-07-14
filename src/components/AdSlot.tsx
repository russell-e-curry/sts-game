import { useEffect, useRef } from 'react'
import './AdSlot.css'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

// STS-AD-1 — display ad unit created in the AdSense dashboard.
const AD_SLOT_ID: string | null = '8740692260'

function AdSlot() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !AD_SLOT_ID) return

    // Built with raw DOM APIs rather than JSX so React's reconciler never expects (or
    // diffs) children of this node — adsbygoogle.js takes ownership of it and inserts
    // an iframe asynchronously after push(), and StrictMode's dev-only double-invoke
    // (mount -> cleanup -> mount) means React can be tearing this node down at the
    // same moment Google's script is mutating it, which previously crashed the whole
    // render tree. An imperatively-built node sidesteps that: React only ever sees an
    // empty wrapper div.
    // Deliberately a FIXED size (no data-ad-format at all) — any data-ad-format value
    // ("auto", "horizontal", etc.) puts the unit into Google's responsive-sizing mode,
    // and that mode walks up the DOM and force-injects style="height:auto !important"
    // onto every ancestor it finds with a height constraint (to guarantee room for the
    // ad to expand into). It hit #root (height:100svh) and .game-board (flex:1)
    // directly, collapsing the entire app's layout to ~40px regardless of
    // full-width-responsive — that was the actual cause of every "everything is
    // broken" report so far. A fixed-size unit skips that DOM-walking path entirely.
    const ins = document.createElement('ins')
    ins.className = 'adsbygoogle'
    ins.style.display = 'inline-block'
    ins.style.width = '300px'
    ins.style.height = '250px'
    ins.dataset.adClient = 'ca-pub-6973096670074517'
    ins.dataset.adSlot = AD_SLOT_ID
    container.appendChild(ins)

    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // adsbygoogle.js may not have loaded yet (e.g. blocked by an ad blocker) —
      // nothing more to do here if so.
    }

    return () => {
      if (ins.parentNode === container) container.removeChild(ins)
    }
  }, [])

  return (
    <div className="ad-slot" ref={containerRef}>
      {!AD_SLOT_ID && <span className="ad-slot-placeholder-label">Ad</span>}
    </div>
  )
}

export default AdSlot
