let lastPos = { x: -1, y: -1 }

if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', (e) => {
    lastPos = { x: e.clientX, y: e.clientY }
  })
}

export function getLastMousePos() {
  return lastPos
}
