import { useEffect, useRef } from 'react'
import './AdSlot.css'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

// TODO: replace with the real ad unit's ID once one is created in the AdSense
// dashboard (Ads > By ad unit > Display ads), then swap AdSlotPlaceholder below for
// the live <ins class="adsbygoogle"> unit. Left as a static placeholder until then —
// adsbygoogle.js takes raw DOM ownership of its <ins> node once it processes a push(),
// which fights React's reconciliation on a component that re-renders as often as
// GameBoard does, and an invalid slot ID has nothing valid to render anyway.
const AD_SLOT_ID: string | null = null

function AdSlot() {
  const insRef = useRef<HTMLModElement>(null)
  const pushed = useRef(false)

  useEffect(() => {
    if (!AD_SLOT_ID || pushed.current) return
    pushed.current = true
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // adsbygoogle.js may not have loaded yet (e.g. blocked by an ad blocker) —
      // nothing more to do here if so.
    }
  }, [])

  return (
    <div className="ad-slot">
      {AD_SLOT_ID ? (
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', height: '100%' }}
          data-ad-client="ca-pub-6973096670074517"
          data-ad-slot={AD_SLOT_ID}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <span className="ad-slot-placeholder-label">Ad</span>
      )}
    </div>
  )
}

export default AdSlot
