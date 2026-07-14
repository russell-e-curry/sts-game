import { useEffect, useRef } from 'react'
import './AdSlot.css'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

// TODO: replace with the real ad unit's ID once one is created in the AdSense
// dashboard (Ads > By ad unit > Display ads) — without it this slot renders empty.
const AD_SLOT_ID = 'REPLACE_WITH_AD_SLOT_ID'

function AdSlot() {
  const insRef = useRef<HTMLModElement>(null)
  const pushed = useRef(false)

  useEffect(() => {
    if (pushed.current) return
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
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: '100%' }}
        data-ad-client="ca-pub-6973096670074517"
        data-ad-slot={AD_SLOT_ID}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

export default AdSlot
