import { useEffect, useRef, useState, useCallback } from 'react'
import flowerData from './flower-messages.json'

type Phase = 'splash' | 'universe' | 'final'

interface FlowerDef {
  id: number
  name: string
  number: string
  category: string
  message: string
  modalTitle: string
  modalSubtitle: string
  petalColor: string
  petalDark: string
  centerColor: string
  orbitRadius: number
  orbitSpeed: number
  phaseOffset: number
  orbitTilt: number
  selfRotSpeed: number
  size: number
  layers: number
}

interface Star {
  x: number
  y: number
  r: number
  speed: number
  phase: number
}

const FLOWERS: FlowerDef[] = flowerData.flowers.map(f => ({
  id: f.id,
  name: f.name,
  number: f.number,
  category: f.category,
  message: f.message,
  modalTitle: f.modalTitle,
  modalSubtitle: f.modalSubtitle,
  petalColor: f.colors.petal,
  petalDark: f.colors.petalDark,
  centerColor: f.colors.center,
  orbitRadius: f.orbit.radius,
  orbitSpeed: f.orbit.speed,
  phaseOffset: f.orbit.phaseOffset,
  orbitTilt: f.orbit.tilt,
  selfRotSpeed: f.selfRotSpeed,
  size: f.size,
  layers: f.layers,
}))

function initStars(n: number): Star[] {
  return Array.from({ length: n }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.6 + 0.18,
    speed: Math.random() * 2.2 + 0.4,
    phase: Math.random() * Math.PI * 2,
  }))
}

function getFlowerPos(f: FlowerDef, t: number, cf: number): [number, number, number] {
  const minS = 0.06
  const sc = 1 - cf * (1 - minS)
  const angle = f.phaseOffset + t * f.orbitSpeed
  const rx = f.orbitRadius * Math.cos(angle) * sc
  const rz0 = f.orbitRadius * Math.sin(angle)
  const ry = (-rz0 * Math.sin(f.orbitTilt) + Math.sin(t * 0.0005 + f.phaseOffset * 1.7) * 28) * sc
  const rz = rz0 * Math.cos(f.orbitTilt) * sc
  return [rx, ry, rz]
}

function projectPoint(
  wx: number, wy: number, wz: number,
  theta: number, phi: number, dist: number,
  fov: number, cx: number, cy: number
): { x: number; y: number; s: number; depth: number } | null {
  const cosT = Math.cos(theta), sinT = Math.sin(theta)
  const rx1 = wx * cosT - wz * sinT
  const ry1 = wy
  const rz1 = wx * sinT + wz * cosT

  const cosP = Math.cos(phi), sinP = Math.sin(phi)
  const rx2 = rx1
  const ry2 = ry1 * cosP - rz1 * sinP
  const rz2 = ry1 * sinP + rz1 * cosP

  const viewZ = rz2 + dist
  if (viewZ < 5) return null
  const s = fov / viewZ
  return { x: cx + rx2 * s, y: cy - ry2 * s, s, depth: viewZ }
}

function drawFlower(
  ctx: CanvasRenderingContext2D,
  f: FlowerDef,
  sx: number, sy: number,
  scale: number,
  angle: number,
  selected: boolean
) {
  const sz = f.size * scale
  if (sz < 2.5) return

  ctx.save()
  ctx.translate(sx, sy)
  ctx.rotate(angle)

  ctx.shadowBlur = selected ? 45 : Math.min(18, sz * 0.38)
  ctx.shadowColor = f.petalColor

  for (let layer = f.layers; layer >= 1; layer--) {
    const ls = layer / f.layers
    const count = 4 + layer * 2
    const pLen = sz * (0.42 + ls * 0.58)
    const pWid = pLen * 0.38
    const lRot = layer * 0.52

    ctx.fillStyle = ls >= 0.65 ? f.petalColor : f.petalDark
    ctx.globalAlpha = 0.62 + ls * 0.38

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + lRot
      ctx.save()
      ctx.rotate(a)
      ctx.beginPath()
      ctx.moveTo(0, pLen * 0.07)
      ctx.bezierCurveTo(pWid * 0.88, -pLen * 0.08, pWid * 1.08, -pLen * 0.72, 0, -pLen)
      ctx.bezierCurveTo(-pWid * 1.08, -pLen * 0.72, -pWid * 0.88, -pLen * 0.08, 0, pLen * 0.07)
      ctx.fill()
      ctx.restore()
    }
  }

  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  const cr = sz * 0.22
  const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, cr)
  cg.addColorStop(0, '#ffffff')
  cg.addColorStop(0.3, f.centerColor)
  cg.addColorStop(1, f.centerColor + '40')
  ctx.fillStyle = cg
  ctx.beginPath()
  ctx.arc(0, 0, cr, 0, Math.PI * 2)
  ctx.fill()

  if (selected) {
    ctx.strokeStyle = f.petalColor + '60'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, sz * 1.4, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

interface CamState {
  theta: number; phi: number; dist: number
  tTheta: number; tPhi: number; tDist: number
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [phase, setPhase] = useState<Phase>('splash')
  const [splashFade, setSplashFade] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [cardVisible, setCardVisible] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const [finalTextVisible, setFinalTextVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const phaseRef = useRef<Phase>('splash')
  const selectedIdRef = useRef<number | null>(null)
  const convergeRef = useRef(0)
  const finalShownRef = useRef(false)
  const timeRef = useRef(0)
  const rafRef = useRef(0)
  const camRef = useRef<CamState>({ theta: 0.3, phi: 0.1, dist: 520, tTheta: 0.3, tPhi: 0.1, tDist: 520 })
  const selfRotRef = useRef<number[]>(FLOWERS.map(() => Math.random() * Math.PI * 2))
  const projRef = useRef<({ x: number; y: number; s: number; depth: number } | null)[]>(FLOWERS.map(() => null))
  const starsRef = useRef<Star[]>(initStars(260))
  const dragRef = useRef({ active: false, x: 0, y: 0, moved: false })
  const cardTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const focusFlower = useCallback((id: number) => {
    const f = FLOWERS[id]
    const [fx, fy, fz] = getFlowerPos(f, timeRef.current, convergeRef.current)
    const cam = camRef.current
    const targetTheta = Math.atan2(fx, fz)
    const horiz = Math.sqrt(fx * fx + fz * fz)
    const targetPhi = Math.atan2(-fy, horiz) * 0.65
    let dt = targetTheta - cam.theta
    while (dt > Math.PI) dt -= Math.PI * 2
    while (dt < -Math.PI) dt += Math.PI * 2
    cam.tTheta = cam.theta + dt
    cam.tPhi = targetPhi
    cam.tDist = isMobile ? 380 : 300
    selectedIdRef.current = id
    setSelectedId(id)
    setCardVisible(false)
    clearTimeout(cardTimerRef.current)
    cardTimerRef.current = setTimeout(() => setCardVisible(true), 1100)
  }, [isMobile])

  const navigate = useCallback((dir: number) => {
    const cur = selectedIdRef.current ?? 0
    const next = (cur + dir + FLOWERS.length) % FLOWERS.length
    focusFlower(next)
  }, [focusFlower])

  const enterUniverse = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => {})
    }
    setSplashFade(true)
    setTimeout(() => {
      setPhase('universe')
      phaseRef.current = 'universe'
      setTimeout(() => setHintVisible(true), 800)
      setTimeout(() => setHintVisible(false), 5500)
    }, 900)
  }, [])

  const startFinal = useCallback(() => {
    setPhase('final')
    phaseRef.current = 'final'
    selectedIdRef.current = null
    setSelectedId(null)
    setCardVisible(false)
    setModalVisible(false)
    const cam = camRef.current
    cam.tDist = 600
    cam.tPhi = 0.08
  }, [])

  const openModal = useCallback(() => { setModalVisible(true) }, [])
  const closeModal = useCallback(() => { setModalVisible(false) }, [])

  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted
      setMuted(audioRef.current.muted)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', resize)

    const onMouseDown = (e: MouseEvent) => {
      dragRef.current = { active: true, x: e.clientX, y: e.clientY, moved: false }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return
      const dx = e.clientX - dragRef.current.x
      const dy = e.clientY - dragRef.current.y
      if (Math.abs(dx) + Math.abs(dy) > 4) dragRef.current.moved = true
      const cam = camRef.current
      cam.tTheta += dx * 0.005
      cam.tPhi = Math.max(-0.75, Math.min(0.75, cam.tPhi - dy * 0.005))
      dragRef.current.x = e.clientX
      dragRef.current.y = e.clientY
    }
    const onMouseUp = (e: MouseEvent) => {
      if (!dragRef.current.moved && phaseRef.current === 'universe') {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        let best = -1, bestD = Infinity
        projRef.current.forEach((p, i) => {
          if (!p) return
          const dx = mx - p.x, dy = my - p.y
          const d = Math.sqrt(dx * dx + dy * dy)
          const hit = Math.max(22, FLOWERS[i].size * p.s * 2.0)
          if (d < hit && d < bestD) { best = i; bestD = d }
        })
        if (best >= 0) focusFlower(best)
      }
      dragRef.current.active = false
    }
    const onWheel = (e: WheelEvent) => {
      const cam = camRef.current
      cam.tDist = Math.max(150, Math.min(850, cam.tDist + e.deltaY * 0.38))
    }

    let lastPinchDist = 0
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        dragRef.current = { active: true, x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false }
      } else if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && dragRef.current.active) {
        const dx = e.touches[0].clientX - dragRef.current.x
        const dy = e.touches[0].clientY - dragRef.current.y
        if (Math.abs(dx) + Math.abs(dy) > 4) dragRef.current.moved = true
        const cam = camRef.current
        cam.tTheta += dx * 0.005
        cam.tPhi = Math.max(-0.75, Math.min(0.75, cam.tPhi - dy * 0.005))
        dragRef.current.x = e.touches[0].clientX
        dragRef.current.y = e.touches[0].clientY
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        const cam = camRef.current
        cam.tDist = Math.max(150, Math.min(850, cam.tDist - (d - lastPinchDist) * 1.5))
        lastPinchDist = d
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!dragRef.current.moved && e.changedTouches.length === 1 && phaseRef.current === 'universe') {
        const touch = e.changedTouches[0]
        const rect = canvas.getBoundingClientRect()
        const mx = touch.clientX - rect.left
        const my = touch.clientY - rect.top
        let best = -1, bestD = Infinity
        projRef.current.forEach((p, i) => {
          if (!p) return
          const dx = mx - p.x, dy = my - p.y
          const d = Math.sqrt(dx * dx + dy * dy)
          const hit = Math.max(28, FLOWERS[i].size * p.s * 2.2)
          if (d < hit && d < bestD) { best = i; bestD = d }
        })
        if (best >= 0) focusFlower(best)
      }
      dragRef.current.active = false
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: true })
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    let running = true

    const loop = () => {
      if (!running) return
      const ctx = canvas.getContext('2d')
      if (!ctx) { rafRef.current = requestAnimationFrame(loop); return }

      const w = canvas.width, h = canvas.height
      const cx = w / 2, cy = h / 2

      timeRef.current += 16
      const t = timeRef.current
      const currentPhase = phaseRef.current

      const cam = camRef.current
      if (selectedIdRef.current === null && currentPhase === 'universe') {
        cam.tTheta += 0.00013
      }
      cam.theta += (cam.tTheta - cam.theta) * 0.045
      cam.phi += (cam.tPhi - cam.phi) * 0.045
      cam.dist += (cam.tDist - cam.dist) * 0.045

      if (currentPhase === 'final') {
        convergeRef.current = Math.min(1, convergeRef.current + 0.0032)
        if (convergeRef.current > 0.8 && !finalShownRef.current) {
          finalShownRef.current = true
          setFinalTextVisible(true)
        }
      }

      ctx.fillStyle = '#030610'
      ctx.fillRect(0, 0, w, h)

      const nebulae: Array<[number, number, number, number, number, number, number]> = [
        [w * 0.22, h * 0.28, w * 0.52, 75, 18, 115, 0.14],
        [w * 0.78, h * 0.72, w * 0.46, 14, 48, 135, 0.11],
        [w * 0.55, h * 0.45, w * 0.40, 115, 18, 75, 0.07],
        [w * 0.08, h * 0.82, w * 0.32, 55, 95, 38, 0.05],
        [w * 0.90, h * 0.15, w * 0.28, 140, 60, 20, 0.04],
      ]
      nebulae.forEach(([nx, ny, nr, r, g, b, a]) => {
        const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr)
        grd.addColorStop(0, `rgba(${r},${g},${b},${a})`)
        grd.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grd
        ctx.fillRect(0, 0, w, h)
      })

      starsRef.current.forEach(star => {
        const tw = 0.3 + 0.7 * Math.sin(t * 0.001 * star.speed + star.phase)
        ctx.globalAlpha = tw * 0.88
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1

      for (let i = 0; i < 6; i++) {
        const idx = Math.floor((t * 0.002 + i * 137.5) % starsRef.current.length)
        const s = starsRef.current[idx]
        const pulse = Math.sin(t * 0.003 + i * 2.1) * 0.5 + 0.5
        ctx.globalAlpha = pulse * 0.7
        ctx.fillStyle = '#c8d8ff'
        ctx.beginPath()
        ctx.arc(s.x * w, s.y * h, s.r * 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      FLOWERS.forEach((f, i) => {
        selfRotRef.current[i] += f.selfRotSpeed
      })

      const FOV = 520
      const cf = convergeRef.current
      const projected = FLOWERS.map(f => {
        const [wx, wy, wz] = getFlowerPos(f, t, cf)
        return projectPoint(wx, wy, wz, cam.theta, cam.phi, cam.dist, FOV, cx, cy)
      })
      projRef.current = projected

      const order = FLOWERS.map((_, i) => i).sort((a, b) => {
        const da = projected[a]?.depth ?? -999
        const db = projected[b]?.depth ?? -999
        return db - da
      })

      order.forEach(i => {
        const p = projected[i]
        if (!p) return
        drawFlower(ctx, FLOWERS[i], p.x, p.y, p.s, selfRotRef.current[i], selectedIdRef.current === i)
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    loop()

    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [focusFlower])

  const selectedFlower = selectedId !== null ? FLOWERS[selectedId] : null

  return (
    <div className="app-container">
      <canvas ref={canvasRef} className="universe-canvas" />

      {phase === 'splash' && (
        <div className="splash-overlay" style={{ opacity: splashFade ? 0 : 1, pointerEvents: splashFade ? 'none' : 'auto' }}>
          <div className="stars-container">
            {starsRef.current.slice(0, 90).map((s, i) => (
              <div key={i} className="star-dot" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.r * 2}px`, height: `${s.r * 2}px`, opacity: 0.25 + s.r * 0.15, animationDuration: `${2 + s.speed}s`, animationDelay: `${s.phase}s` }} />
            ))}
          </div>
          <div className="splash-content">
            <p className="splash-label">Nuestro Universo</p>
            <div className="splash-text-block">
              <p className="splash-text-primary">{flowerData.app.subtitle}</p>
              <p className="splash-text-secondary">{flowerData.app.subtitleAlt}</p>
            </div>
            <button className="enter-button" onClick={enterUniverse}>{flowerData.app.enterButton}</button>
          </div>
        </div>
      )}

      {phase === 'universe' && (
        <>
          <div className="universe-title"><p>{flowerData.app.title}</p></div>
          <div className="universe-hint" style={{ opacity: hintVisible ? 1 : 0 }}><p>{flowerData.app.dragHint}</p></div>

          {selectedFlower && (
            <div
              className={`flower-card ${isMobile ? 'mobile' : ''}`}
              style={{
                opacity: cardVisible ? 1 : 0,
                ...(isMobile
                  ? { transform: `translateX(-50%) translateY(${cardVisible ? '0' : '20px'})` }
                  : { transform: `translateY(-50%) translateX(${cardVisible ? '0' : '28px'})` }
                ),
              }}
            >
              <div className="flower-card-inner" style={{ boxShadow: `0 0 50px ${selectedFlower.petalColor}18, 0 8px 32px rgba(0,0,0,0.6)` }}>
                <p className="flower-card-number">{selectedFlower.number} &nbsp;/&nbsp; 12</p>
                <h2 className="flower-card-name" style={{ color: selectedFlower.petalColor }}>{selectedFlower.name}</h2>
                <p className="flower-card-category">{selectedFlower.category === 'love' ? 'Amor' : 'Amistad'}</p>
                <p className="flower-card-message">{selectedFlower.message}</p>
                <button className="flower-card-read-btn" onClick={openModal}>Leer mensaje</button>
              </div>
            </div>
          )}

          <div className={`nav-bar ${cardVisible && selectedFlower ? 'visible' : ''}`}>
            <button className="nav-btn" onClick={() => navigate(-1)}>{'\u2039'} Anterior</button>
            <span className="nav-counter">{selectedFlower?.number} / 12</span>
            <button className="nav-btn" onClick={() => navigate(1)}>Siguiente {'\u203A'}</button>
          </div>

          <button className="final-btn" onClick={startFinal}>{flowerData.app.finalButton}</button>
        </>
      )}

      {phase === 'final' && (
        <div className="final-overlay">
          <div className="final-text" style={{ opacity: finalTextVisible ? 1 : 0, transform: `translateY(${finalTextVisible ? '0' : '24px'})` }}>
            <p>{flowerData.app.finalMessageLine1}</p>
            <p className="final-highlight">{flowerData.app.finalMessageLine2}</p>
          </div>
        </div>
      )}

      {modalVisible && selectedFlower && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderColor: selectedFlower.petalColor }}>
              <span className="modal-category" style={{ color: selectedFlower.petalColor }}>{selectedFlower.modalTitle}</span>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <h3 className="modal-flower-name" style={{ color: selectedFlower.petalColor }}>{selectedFlower.name}</h3>
            <p className="modal-subtitle">{selectedFlower.modalSubtitle}</p>
            <div className="modal-divider" style={{ background: `linear-gradient(90deg, transparent, ${selectedFlower.petalColor}, transparent)` }} />
            <p className="modal-message">{selectedFlower.message}</p>
            <button className="modal-close-btn" onClick={closeModal} style={{ borderColor: selectedFlower.petalColor, color: selectedFlower.petalColor }}>Cerrar</button>
          </div>
        </div>
      )}
      <audio ref={audioRef} src="/rosas.mp3" loop></audio>

      {phase !== 'splash' && (
        <button className="mute-btn" onClick={toggleMute}>
          {muted ? '🔇' : '🔊'}
        </button>
      )}
    </div>
  )
}